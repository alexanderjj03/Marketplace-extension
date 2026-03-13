import {resetListingStyle} from './utils.js';
import {noAIAnalyzer} from './noAI_analyze.js';
import {AIAnalyzer} from './AI_analyze.js';

export class ListingListScraper {
  // Minimal config with sensible defaults. 
  
  // TO DO: separate "scraping" and "analysis" parts into different files. 
  // Scraping stays here. Focuses on gathering all non-duplicate listings with relevant info.
  // Analysis functions will be split between non-AI and AI-powered (each option has a button). Non-AI stays the same. 

  // AI will use chatgpt to analyze non-duplicate listings in bulk. Make as FEW calls to OpenAI API as possible. 
  // First button press creates the listing observer so the user can browser through many listing, 
  // second button press makes the API call. Save most recent results.
  constructor(config) {
    this.config = config;
    this.observer = null;
    this.currentKeyword = "";
    this.allDetectedListings = [];
    this.uniqueListings = new Set();
    this._pendingScan = false;
  }

  // Start observing the listings container (fallback to body) with throttled rescans
  observeListings() {
    if (this.observer) {
      this.observer.disconnect();
      console.log("Observer disconnected");
    }

    const container =
      document.querySelector('[aria-label="Collection of Marketplace items"]') || document.body;

    this.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          if (!this._pendingScan) {
            this._pendingScan = true;
            requestAnimationFrame(() => {
              this._pendingScan = false;
              this.scrapeListingsWithPersistence();
            });
          }
          break;
        }
      }
    });

    this.observer.observe(container, { childList: true, subtree: true });
    console.log("Observer started on", container === document.body ? "document.body (fallback)" : "Marketplace items container");
  }

  // Scrape visible listings, persist/dedupe, then analyze prices and scams
  scrapeListingsWithPersistence() {
    const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, ' ').trim();
    const col = document.querySelector('[aria-label="Collection of Marketplace items"]');
    if (!col) return;

    const listings = col.querySelectorAll('[data-virtualized="false"]');
    const currentListings = [];

    listings.forEach((listing) => {
      const hrefElem = listing.querySelector('a[href]');
      const href = hrefElem ? hrefElem.getAttribute('href') : null;
      const id = `${norm(href.split('/')[3])}`;
      if (!href || !href.includes('marketplace/item/')) return;

      const details = listing.querySelectorAll('[dir="auto"]');
      if (!details || !details.length) return;

      const contents = [];
      details.forEach((d) => contents.push(String(d.textContent || "").toLowerCase().trim()));

      let idx = 0;
      while (
        idx < contents.length &&
        (contents[idx] === "just listed" ||
         (parseFloat(contents[idx].replace(/[^0-9.]/g, '')) || 0) === 0)
      ) {
        idx += 1;
      }
      if (idx >= contents.length) return;

      const price = parseFloat(contents[idx].replace(/[^0-9.]/g, '')) || 0;

      const titleCandidate = contents[idx + 1] ?? "";
      const altCandidate = contents[idx + 2] ?? "";
      let title = ".";

      const currentKeywordList = this.currentKeyword.split(' ');

      for (const kw of currentKeywordList) { // Extracting title based on search keywords
        if (titleCandidate.includes(kw)) {
          title = titleCandidate;
          break;
        }
      }

      if (title === ".") {
        for (const kw of currentKeywordList) {
          if (altCandidate.includes(kw)) {
            title = altCandidate;
            idx += 1;
            break;
          }
        }
      }

      if (title === ".") {
        resetListingStyle(listing);
        return;
      }

      const other = (idx + 3 < contents.length) ? (contents[idx + 3] ?? "") : ""; // Additional info (e.g. number of km on a car)
      currentListings.push({ price, title, id, other, element: listing });
    });

    // Further analysis for certain cases (e.g. cars, computer parts, properties)

    this.addNewListingsToPersistentList(currentListings);
    this.aIAnalyze(currentListings);
  }

  // Dedupe & persist newly seen listings
  addNewListingsToPersistentList(newListings) {
    newListings.forEach((listing) => {
      if (!this.uniqueListings.has(listing.id)) {
        this.uniqueListings.add(listing.id);
        this.allDetectedListings.push({
          ...listing,
          detectedAt: Date.now()
        });
      }
    });

    console.log('All detected listings (count):', this.allDetectedListings.length);
    this.updateListingsCounter();
  }

  noAIAnalyze(currentListings) {
    const analyzer = new noAIAnalyzer(this);
    if (this.allDetectedListings.length >= 5) {
      analyzer.analyzeAllListingsPrices(currentListings);
    }
    analyzer.detectPotentialScams();
  }

  aIAnalyze(currentListings) {
    const analyzer1 = new AIAnalyzer(this);
    analyzer1.analyzeAllListingsPrices(currentListings);
  }

  // Clear data and remove any residual highlights
  clearPersistentListings() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      console.log("Observer disconnected");
    }

    this.allDetectedListings.forEach(item => resetListingStyle(item.element));
    this.allDetectedListings = [];
    this.uniqueListings.clear();
    this.updateListingsCounter();
  }

  updateListingsCounter() {
    const counter = document.getElementById('listings-counter');
    if (counter) {
      counter.textContent = `Detected Listings: ${this.allDetectedListings.length}`;
    }
  }

  // Public setter for keyword filter (empty string disables filtering)
  setKeywordFilter(keyword = "") {
    this.currentKeyword = String(keyword || "").toLowerCase().trim();
  }
}
