// Scraping and analyzing a list of listings
export class ListingListAnalyzer {
  constructor(config) {
    this.config = config;
    this.observer = null;
    this.currentKeyword = "";
    this.allDetectedListings = [];
    this.uniqueListings = new Set();
  }

  // Observe the page for new listings
  observeListings() {
    if (this.observer) {
      this.observer.disconnect();
      console.log("Observer disconnected");
    }

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          this.scrapeListingsWithPersistence();
        }
      });
    });
    console.log("Observer started");

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Main analysis function. Adds new listings to persistent list. THIS IS GOOD NOW
  // REQUIRES: currentKeyword isn't null
  scrapeListingsWithPersistence() {
    // Get current visible listings
    const col = document.querySelector('[aria-label="Collection of Marketplace items"]');
    if (!col) return [];

    const listings = col.querySelectorAll('[data-virtualized="false"]');
    let currentListings = [];

    // Extract data from each listing
    listings.forEach((listing) => {
      const details = listing.querySelectorAll('[dir="auto"]');
      let contents = [];
      details.forEach((detail) => contents.push(detail.textContent.toLowerCase()));

      let idx = 0;
      while ((contents[idx] === "just listed") || ((parseFloat(contents[idx].replace(/[^0-9.]/g, '')) || 0) === 0)) {
        idx += 1;
        if (idx >= contents.length) {
          return;
        }
      }

      let price = parseFloat(contents[idx].replace(/[^0-9.]/g, '')) || 0;
      if (!contents[idx + 1].includes(this.currentKeyword)) {
        idx += 1;
        if (!contents[idx + 1].includes(this.currentKeyword)) {
          this.resetListingStyle(listing);
          return;
        }
      }
      const title = contents[idx + 1];
      let other = "";
      if (idx + 3 < contents.length) {
        other = contents[idx + 3];
      }

      currentListings.push({
        "price": price,
        "title": title,
        "other": other,
        "element": listing
      });
    });

    // Add new listings to persistent list
    this.addNewListingsToPersistentList(currentListings);

    // Analyze prices using all detected listings, keeping in mind which are visible
    if (this.allDetectedListings.length >= 3) {
      this.analyzeAllListingsPrices(currentListings);
    }

    // Check for potential scams
    this.detectPotentialScams();
  }

  // Function to add new listings to the persistent list
  addNewListingsToPersistentList(newListings) {
    newListings.forEach(listing => {
      // Create a unique identifier for the listing based on title and price
      const listingId = `${listing.title}_${listing.price}_${listing.other}`;

      if (!this.uniqueListings.has(listingId)) {
        this.uniqueListings.add(listingId);
        this.allDetectedListings.push({
          ...listing,
          id: listingId,
          detectedAt: Date.now()
        });
      }
    });
    console.log('All detected listings:', this.allDetectedListings);
    // Update the counter
    this.updateListingsCounter();
  }

  // Analyze prices using all detected listings for better accuracy. Highlight currently visible listings.
  // We can make this more accurate (TO DO).
  analyzeAllListingsPrices(curListings) {
    const prices = this.allDetectedListings.map(item => item.price).filter(p =>
        p > this.config.minPriceForAnalysis);
    if (prices.length < 3) return;

    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;

    // Apply highlighting to currently visible listings based on all data
    curListings.forEach((listing) => {
      if (listing.price < this.config.minPriceForAnalysis) return;

      const priceDiff = averagePrice - listing.price;
      const priceRatio = priceDiff / averagePrice;

      if (priceRatio > this.config.priceDeviationThreshold) {
        this.highlightListing(listing.element, this.config.highlightColors.goodDeal,
            `Good deal! ${Math.round(priceRatio*100)}% below average`);
      } else if (priceRatio < -this.config.priceDeviationThreshold) {
        this.highlightListing(listing.element, this.config.highlightColors.averagePrice,
            `Potentially overpriced (${Math.round(-priceRatio*100)}% above average)`);
      } else {
        this.resetListingStyle(listing.element);
      }
    });
  }

  // Detect potential scam listings
  detectPotentialScams() {
    this.allDetectedListings.forEach(item => {
      const isPotentialScam = this.config.scamKeywords.some(keyword =>
          item.title.includes(keyword)
      ) || this.isSuspiciousPrice(item.price, item.title);

      if (isPotentialScam) {
        this.highlightListing(item.element, this.config.highlightColors.potentialScam,
            'Potential scam - review carefully');
      }
    });
  }

  // UTILITY
  // Helper to check for suspicious pricing. FIX THIS LOL
  isSuspiciousPrice(price, title) {
    // Check for prices that are too good to be true
    const expensiveKeywords = ['iphone', 'macbook', 'playstation', 'xbox'];
    const hasExpensiveItem = expensiveKeywords.some(kw => title.includes(kw));

    return hasExpensiveItem && price < 50;
  }

  // Highlight a listing with a color and tooltip
  highlightListing(element, color, tooltip) {
    element.style.backgroundColor = color;
    element.style.border = '2px solid ' + color.replace('0.2', '0.8');
    element.title = tooltip;
  }

  // Reset listing style
  resetListingStyle(element) {
    element.style.backgroundColor = '';
    element.style.border = '';
    element.title = '';
  }

  // Function to update the listings counter
  updateListingsCounter() {
    const counter = document.getElementById('listings-counter');
    if (counter) {
      counter.textContent = `Detected Listings: ${this.allDetectedListings.length}`;
    }
  }

  // Function to clear the persistent list
  clearPersistentListings() {
    this.allDetectedListings = [];
    this.uniqueListings.clear();
    this.updateListingsCounter();
  }
}