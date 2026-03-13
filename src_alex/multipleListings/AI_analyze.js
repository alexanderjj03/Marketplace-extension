import {median, highlightListing, resetListingStyle, callModel} from './utils.js';

export class AIAnalyzer { // TO DO: Upgrade model (maybe), refactor the rest of the extension to accomodate AI analysis option.
  constructor(scraper) {
    this.scraper = scraper;
  }

  async analyzeAllListingsPrices(currentListings) {
    // Placeholder for AI analysis logic. In a real implementation, this would involve:
    // 1. Preparing the data (e.g., extracting relevant features from listings)
    // 2. Making a call to an AI service (e.g., OpenAI API) to get price analysis
    // 3. Processing the response and updating the UI accordingly
    
    // For demonstration, we'll just calculate the median price and highlight listings below it.
    this.processOdometerInfo(currentListings);

    const relevantInfo = currentListings.map(l => `Title: ${l.title}, ID: ${l.id}, Price: ${l.price}, Other: ${l.other}`).join('\n');
    if (relevantInfo.length === 0) return;

    console.log(relevantInfo);

    const prompt = `Analyze the following Facebook Marketplace listings and determine the quality of each deal. The "other" field is only 
    populated for car listings, in which case it contains the car's mileage in kilometers. Otherwise, it is left blank. Give each listing a score 
    from 1 to 100 based on its pricing relative to the market, taking into account any risks or unknown factors such as condition or demand.
    If the price is too low to be realistic, assign a score of -1. 
    Return ONLY a JSON object with the listing ID's as keys and their scores as values:\n\n${relevantInfo}`;

    const aiResponse = await callModel(prompt);
    console.log("AI Analysis Response:", aiResponse);

    const medianPrice = 1000;
    currentListings.forEach(listing => {
      if (listing.price < medianPrice) {
        highlightListing(listing.element);
      }
    });
  }

  // Convert odometer into standardized format.
  processOdometerInfo(currentListings) {
    currentListings.forEach(listing => {
      const odometer = listing.other;

      let mileageInKms = 0;
      if (odometer && odometer.includes('km')) {
        let value = odometer.split(' km')[0];
        if (value.includes('k')) {
          value = value.replace('k', '');
          mileageInKms = parseFloat(value) * 1000;
        } else {
          mileageInKms = parseFloat(value);
        }
      } else if (odometer && odometer.contains('mi')) {
        let value = odometer.split(' mi')[0];
        if (value.includes('k')) {
          value = value.replace('k', '');
          mileageInKms = parseFloat(value) * 1609.34;
        } else {
          mileageInKms = parseFloat(value) * 1.60934;
        }
      }

      listing.other = mileageInKms > 0 ? `${mileageInKms} km` : listing.other;
    });
  }
}