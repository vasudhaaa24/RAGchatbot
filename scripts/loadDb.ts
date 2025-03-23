import { QdrantClient } from "@qdrant/js-client-rest";
import { PuppeteerWebBaseLoader } from "langchain/document_loaders/web/puppeteer";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { pipeline } from "@xenova/transformers";
import "dotenv/config";
import puppeteer from "puppeteer";

type SimilarityMetric = "Dot" | "Cosine" | "Euclid" | "Manhattan";

const {
    QDRANT_API_KEY,
    QDRANT_ENDPOINT,
    COLLECTION_NAME
} = process.env;

const jioData = [
    "https://www.jiopay.com/business/help-center"
];

const client = new QdrantClient({
    url: QDRANT_ENDPOINT,
    apiKey: QDRANT_API_KEY
});

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 100
});

// Function to remove non-ASCII characters
function cleanText(text: string): string {
    return text.replace(/[^\x00-\x7F]/g, ""); // Removes all non-ASCII characters
}

// Load the embedding model once
let embedder: any = null;
async function getEmbedder() {
    if (!embedder) {
        console.log("Loading embedding model...");
        embedder = await pipeline("feature-extraction", "Xenova/bge-large-en-v1.5");
    }
    return embedder;
}

const createCollection = async (similarityMetric: SimilarityMetric = "Cosine") => {
    try {
        const collections = await client.getCollections();
        const collectionExists = collections.collections.some(
            (collection: { name: string }) => collection.name === COLLECTION_NAME
        );
        const vectorSize = 1024;

        if (collectionExists) {
            const collectionInfo = await client.getCollection(COLLECTION_NAME);
            console.log(`✅ Collection "${COLLECTION_NAME}" exists with vector size: ${collectionInfo.config.params.vectors.size}`);
            return collectionInfo.config.params.vectors.size;
        }

        await client.createCollection(COLLECTION_NAME, {
            vectors: { size: vectorSize, distance: similarityMetric }
        });

        console.log("✅ Qdrant collection created successfully.");
        return vectorSize;
    } catch (error) {
        console.error("❌ Error with Qdrant collection:", error);
        throw error;
    }
};

const loadSampleData = async () => {
    try {
        const vectorSize = await createCollection();
        console.log(`Collection vector size: ${vectorSize}`);

        const embedder = await getEmbedder();
        let pointId = 1;

        for (const url of jioData) {
            console.log(`Processing URL: ${url}`);
            let content = await scrapePage(url);

            // Apply text cleaning
            content = cleanText(content);

            const chunks = await splitter.splitText(content);
            console.log(`Split into ${chunks.length} chunks`);

            for (const chunk of chunks) {
                try {
                    if (!chunk || chunk.trim() === "") {
                        console.log("Skipping empty chunk");
                        continue;
                    }

                    const embeddings = await embedder(chunk, {
                        pooling: "mean",
                        normalize: true
                    });

                    const vectorArray = Array.from(embeddings.data).map(Number);

                    if (vectorArray.length !== vectorSize) {
                        console.error(`Vector dimension mismatch: Got ${vectorArray.length}, expected ${vectorSize}`);
                        continue;
                    }

                    if (vectorArray.some(isNaN)) {
                        console.error("Vector contains NaN values, skipping");
                        continue;
                    }

                    console.log(`Vector sample (first 5 elements): ${vectorArray.slice(0, 5).join(", ")}`);

                    try {
                        const response = await client.upsert(COLLECTION_NAME, {
                            points: [
                                {
                                    id: pointId,
                                    vector: vectorArray,
                                    payload: {
                                        text: chunk,
                                        source: url
                                    }
                                }
                            ]
                        });

                        console.log(`✅ Inserted chunk ID ${pointId} into Qdrant.`);
                        pointId++;
                    } catch (upsertError: any) {
                        console.error(`❌ Qdrant upsert error: ${upsertError.message}`);
                        if (upsertError.response) {
                            console.error("Error response:", upsertError.response.data);
                        }

                        try {
                            const uuidPointId = crypto.randomUUID ? crypto.randomUUID() : `fallback-${Date.now()}-${Math.random()}`;
                            await client.upsert(COLLECTION_NAME, {
                                points: [
                                    {
                                        id: uuidPointId,
                                        vector: vectorArray,
                                        payload: {
                                            text: chunk,
                                            source: url
                                        }
                                    }
                                ]
                            });
                            console.log(`✅ Inserted chunk with UUID ${uuidPointId} into Qdrant.`);
                            pointId++;
                        } catch (retryError) {
                            console.error(`❌ Retry also failed: ${retryError}`);
                        }
                    }
                } catch (error: any) {
                    console.error(`Error processing chunk: ${error.message}`);
                }
            }
        }
        console.log("✅ Data loading complete");
    } catch (error: any) {
        console.error("❌ Error in loadSampleData:", error.message);
    }
};

const scrapePage = async (url: string): Promise<string> => {
    console.log(`Scraping: ${url}`);
    const browser = await puppeteer.launch({ headless: "new", defaultViewport: null });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: "networkidle2" });

        const questionElements = await page.$$('div.css-175oi2r.r-lrvibr.r-1awozwy');
        console.log(`Found ${questionElements.length} question elements`);

        let content = "";

        for (let i = 0; i < questionElements.length; i++) {
            try {
                let questionText = await page.evaluate(el => {
                    const textEl = el.querySelector('div[dir="auto"]');
                    return textEl ? textEl.textContent.trim() : null;
                }, questionElements[i]);

                if (!questionText) continue;

                questionText = cleanText(questionText);
                console.log(`Processing question ${i + 1}: ${questionText}`);
                await questionElements[i].click();

                await page.waitForFunction(
                    el => {
                        const container = el.parentElement?.querySelector('div[style*="max-height"]');
                        return container && (container as HTMLElement).style.maxHeight !== "0px";
                    },
                    {},
                    questionElements[i]
                );

                let expandedText = await page.evaluate(el => {
                    const container = el.parentElement?.querySelector('div[style*="max-height"]');
                    return container ? container.textContent.trim() : "No content found";
                }, questionElements[i]);

                expandedText = cleanText(expandedText);

                content += `Q: ${questionText}\nA: ${expandedText}\n\n`;
                console.log(`Extracted answer: ${expandedText.substring(0, 50)}...`);
            } catch (e) {
                console.error(`Error processing question ${i + 1}: ${e.message}`);
            }
        }

        console.log(`Successfully scraped ${content.length} characters`);
        return content;
    } catch (error) {
        console.error(`❌ Error scraping ${url}: ${error.message}`);
        return "";
    } finally {
        await browser.close();
    }
};

async function main() {
    try {
        await loadSampleData();
        console.log("Process completed successfully");
    } catch (error) {
        console.error("Error in main process:", error);
    }
}

main();
