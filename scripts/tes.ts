import puppeteer from "puppeteer";
import fs from "fs";

const scrapePage = async (url: string) => {
    const browser = await puppeteer.launch({ 
        headless: false,
        defaultViewport: null
    });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: "networkidle2" });

        // Find all question elements
        const questionElements = await page.$$('div.css-175oi2r.r-lrvibr.r-1awozwy');

        console.log(`Found ${questionElements.length} question elements`);

        const faqs = [];

        for (let i = 0; i < questionElements.length; i++) {
            try {
                // Get question text
                const questionText = await page.evaluate(el => {
                    const textEl = el.querySelector('div[dir="auto"]');
                    return textEl ? textEl.textContent.trim() : null;
                }, questionElements[i]);

                if (!questionText) {
                    console.log(`Question ${i+1} has no text, skipping`);
                    continue;
                }

                console.log(`Processing question ${i+1}: ${questionText}`);

                // Click to expand
                await questionElements[i].click();
                console.log(`Clicked on question ${i+1}`);

                // **Replaces waitForTimeout with waitForFunction**
                await page.waitForFunction(
                    el => {
                        const container = el.parentElement?.querySelector('div[style*="max-height"]');
                        return container && (container as HTMLElement).style.maxHeight !== "0px";
                    },
                    {},
                    questionElements[i]
                );

                // Extract the expanded content
                const expandedText = await page.evaluate(el => {
                    const container = el.parentElement?.querySelector('div[style*="max-height"]');
                    return container ? container.textContent.trim() : "No content found";
                }, questionElements[i]);

                console.log(`Extracted answer: ${expandedText.substring(0, 50)}...`);
                faqs.push({ question: questionText, answer: expandedText });

                // Click to collapse (optional)
                await questionElements[i].click();

                // **Replaces waitForTimeout with waitForSelector to ensure collapse**
                await page.waitForFunction(
                    el => {
                        const container = el.parentElement?.querySelector('div[style*="max-height"]');
                        return container && (container as HTMLElement).style.maxHeight === "0px";
                    },
                    {},
                    questionElements[i]
                );

            } catch (e) {
                console.error(`Error processing question ${i+1}: ${e.message}`);
            }
        }

        // Save results
        fs.writeFileSync('jiopay-faqs.json', JSON.stringify(faqs, null, 2));
        console.log(`Successfully extracted ${faqs.length} FAQs`);

    } catch (error) {
        console.error(`Error scraping: ${error.message}`);
    } finally {
        await browser.close();
    }
};

// Call the function with your URL
scrapePage("https://www.jiopay.com/business/help-center");
