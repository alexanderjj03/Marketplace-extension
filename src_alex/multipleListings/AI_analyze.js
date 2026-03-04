import {median, highlightListing, resetListingStyle, callModel} from './utils.js';

export class AIAnalyzer {
  constructor(scraper) {
    this.scraper = scraper;
  }

  async analyzeAllListingsPrices(currentListings) {
    // Placeholder for AI analysis logic. In a real implementation, this would involve:
    // 1. Preparing the data (e.g., extracting relevant features from listings)
    // 2. Making a call to an AI service (e.g., OpenAI API) to get price analysis
    // 3. Processing the response and updating the UI accordingly
    
    // For demonstration, we'll just calculate the median price and highlight listings below it.
    const relevantInfo = currentListings.map(l => `Title: ${l.title}, ID: ${l.id}, Price: ${l.price}, Other: ${l.other}`).join('\n');
    if (relevantInfo.length === 0) return;

    const prompt = `Analyze the following listings and identify any that are significantly underpriced compared to the others. 
    Give each listing a score from 1 to 100 based on its pricing relative to the market. Return ONLY a JSON object with the listing 
    ID's as keys and their scores as values:\n\n${relevantInfo}`;

    const aiResponse = await callModel(prompt);
    console.log("AI Analysis Response:", aiResponse);

    const medianPrice = median(prices);
    currentListings.forEach(listing => {
      if (listing.price < medianPrice) {
        highlightListing(listing.element);
      }
    });
  }
}