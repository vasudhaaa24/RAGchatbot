import { QdrantClient } from "@qdrant/js-client-rest";
import { pipeline } from "@xenova/transformers";
import { HfInference, TextGenerationStreamOutput } from "@huggingface/inference";
import "dotenv/config";

const {
    QDRANT_API_KEY,
    QDRANT_ENDPOINT,
    COLLECTION_NAME,
    HF_API_KEY
} = process.env;

// Initialize Qdrant Client
const client = new QdrantClient({
    url: QDRANT_ENDPOINT,
    apiKey: QDRANT_API_KEY
});

// Initialize Hugging Face API
const hf = new HfInference(HF_API_KEY);

// Initialize the embedding model promise
let embedderPromise = pipeline("feature-extraction", "Xenova/bge-large-en-v1.5");
let embedder: any = null;

// Function to get the embedder
async function getEmbedder() {
    if (!embedder) {
        console.log("Loading embedding model...");
        embedder = await embedderPromise; // Store the resolved model
    }
    return embedder;
}

// Handler for POST requests (Streaming Response)
export async function POST(req: Request) {
    try {
        const { messages } = await req.json();
        const latestMessage = messages[messages.length - 1]?.content;
        let docContext = "";

        // Generate embedding using Xenova model
        const embedder = await getEmbedder();
        const embedding = await embedder(latestMessage, { pooling: "mean", normalize: true });

        try {
            const searchResults = await client.search(COLLECTION_NAME, {
                vector: Array.from(embedding.data).map(Number),
                limit: 8
            });

            const documents = searchResults.map(doc => doc.payload?.text || "");
            docContext = JSON.stringify(documents);
        } catch (err) {
            console.error("Qdrant retrieval error:", err);
        }

        const systemPrompt = `
            You are an AI assistant specializing in Jio Pay services and support.

            - If the user query is general, rely on your own understanding.
            - If the query is related to Jio Pay, provide **accurate and concise information**.
            - If you don't know the answer, say "I'm not sure" instead of making up information.
            - **Always follow this strict output format:**
            
            Response: [Your answer here]

            - Do not include any extra words, explanations, or greetings outside the required format.

            Context:
            ${docContext}

            User's question: ${latestMessage}
        `;

        const responseStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of hf.textGenerationStream({
                        model: "mistralai/Mistral-7B-Instruct-v0.2",
                        inputs: systemPrompt,
                        parameters: { max_new_tokens: 512, stream: true }
                    })) {
                        if (chunk.token.text) {
                            controller.enqueue(new TextEncoder().encode(chunk.token.text));
                        }
                    }
                } catch (error) {
                    controller.error(error);
                } finally {
                    controller.close();
                }
            }
        });
        
        // console.log(responseStream)
        return new Response(responseStream, { headers: { "Content-Type": "text/plain" } });

    } catch (err) {
        console.error("Error handling request:", err);
        return new Response(JSON.stringify({ error: "Something went wrong" }), { 
            status: 500,
            headers: { "Content-Type": "application/json" } 
        });
    }
}
