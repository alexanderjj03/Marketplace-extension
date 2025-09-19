(function () {
  'use strict';

  // Scraping and analyzing a list of listings
  class ListingListAnalyzer {
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

  // Scrape an individual listing's page

  class ListingAnalyzer {

    constructor(config) {
      this.config = config;
      this.observer = null;
      this.attributes = {};
      this.redFlags = [];
      this.scamScore = 0;
      this.conclusion = "";
    }

    getRedFlags() {
      return this.redFlags;
    }

    getScamScore() {
      return this.scamScore;
    }

    getConclusion() {
      return this.conclusion;
    }

    analyzeSingleListing() {
      this.attributes = {};
      this.scamScore = 0;
      this.conclusion = "";
      let pageConfig = 0;
      // 0 indicates viewing the listing from the listings page, 1 indicates opening the listing in a new tab
      // (DOM structure differs :/)

      const root1 = document.querySelector('[aria-label="Marketplace Listing Viewer"]');
      const root2 = document.querySelector('[aria-label="Marketplace sidebar"]')
          .parentNode.querySelector('[role="main"]');

      let inline;
      if (root1) {
        inline = root1.querySelector('[style="display: inline;"]');
      } else if (root2) {
        inline = root2.querySelector('[style="display:inline"]');
        pageConfig = 1;
      } else {
        return "unable to extract data";
      }

      const attributeElems = inline.children[1].children[0].children[1].children[0].children[1 - pageConfig].children[0];
      // No identifiers beyond changing class names to go off of.
      // This will do for now but we will need a more stable solution.

      this.getAttributes(attributeElems.children); // attributes should be a dictionary.
      console.log(this.attributes);
      this.analyzeAttrs();
    }

    // Extracting the relevant attributes of the listing
    getAttributes(elems) {
      //let types = ["general", "vehicle", "property rental", "property sale"];

      if (elems.length === 3) {
        this.attributes["type"] = "general";
        this.getGeneral(elems);

      } else if (elems.length === 8) {
        this.attributes["type"] = "vehicle";
        this.getVehicle(elems);

      } else if (elems.length === 15) {
        this.getProperty(elems);
      }
    }

    getGeneral(elems) {
      let targetNode = elems[0].children[0].children[2];
      const postedDate = targetNode.querySelector('[dir="auto"]').children[0];
      this.attributes["date"] = postedDate.querySelector('abbr').getAttribute('aria-label');

      this.attributes["description"] = this.extractText(elems[0].children[4].children[0].children[1].children[1],
          false);
      this.attributes["condition"] = "N/A";

      let conditionNode = elems[0].children[4].children[0].children[1].children[0];
      conditionNode.childNodes.forEach((row) => {
        let labels = row.querySelectorAll('[dir="auto"]');
        if (labels[0].textContent.toLowerCase() === "condition") {
          this.attributes["condition"] = labels[1].textContent.toLowerCase();
        }
      });

      let userInfo = this.extractUserInfo(elems[1]);
      this.attributes["user join year"] = userInfo[0];
      this.attributes["user rating"] = userInfo[1];
    }

    getVehicle(elems) {
      let targetNode = elems[0].children[2];
      const postedDate = targetNode.querySelector('[dir="auto"]').children[0];
      this.attributes["date"] = postedDate.querySelector('abbr').getAttribute('aria-label');

      this.attributes["description"] = this.extractText(elems[5].children[1].children[0].children[0], true);

      let driven = this.extractText(elems[4].children[1], false);
      this.attributes["distance driven"] = driven.toLowerCase().split("driven ")[1];

      let userInfo = this.extractUserInfo(elems[6]);
      this.attributes["user join year"] = userInfo[0];
      this.attributes["user rating"] = userInfo[1];
    }

    getProperty(elems) {
      let type = this.extractText(elems[0].children[2], false);
      this.attributes["type"] = ((type.toLowerCase() === "home sales") ? "property sale" : "property rental");
      let listedText = this.extractText(elems[1].children[0].children[1], false);
      this.attributes["date"] = (listedText.toLowerCase().split(" ago")[0]).split("listed ")[1];

      this.attributes["description"] = this.extractText(elems[7].children[1].children[0].children[0], true);
      // Mutation observer needed

      let userInfo = this.extractUserInfo(elems[13]);
      this.attributes["user join year"] = userInfo[0];
      this.attributes["user rating"] = userInfo[1];
    }

    // For extracting text from the page. Adds an observer to the text node if specified
    extractText(elem, addObserver) {
      // Implement a mutation observer for the text content. NOT NEEDED for general listings (only vehicle/property)
      const target = elem.querySelector('[dir="auto"]');

      if (addObserver) {
        if (this.observer) {
          this.observer.disconnect();
        }

        this.observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if ((mutation.type === 'characterData') &&
                (target.textContent.length > this.attributes["description"].length)) {
              this.attributes["description"] = target.textContent;
              this.analyzeAttrs();
            }
            console.log(this.attributes);
          });
        });

        this.observer.observe(target, {
          characterData: true,
          subtree: true
        });
      }

      return target.textContent;
    }

    // Extract the user's join year and whether they're highly rated on marketplace or not.
    extractUserInfo(elem) {
      let ret = ["", false];
      let list = elem.querySelector('[role="list"]').childNodes;

      for (let i = 1; i < list.length; i++) {
        let text = this.extractText(list[i], false).toLowerCase();
        if (text.includes("highly rated ")) {
          ret[1] = true;
        } else if (text.includes("joined facebook ")) {
          ret[0] = parseInt(text.split("in ")[1]);
        }
      }

      return ret // user join year, user marketplace rating (yes/no = "highly rated"/not highly rated)
    }

    analyzeAttrs() {
      const currentYear = new Date().getFullYear();
      this.scamScore = 0; // Needs to be placed here in case the description's text is updated
      this.redFlags = [];
      this.conclusion = "";

      if (!this.attributes["user rating"]) {
        this.scamScore += 0.2;
        this.redFlags.push("Non-reputable seller");
      }

      // 1 if user join year is last year, 4 if user join year is this year.
      let recencyIndex = Math.pow(Math.max(this.attributes["user join year"] - currentYear + 2, 0), 2);
      this.scamScore += (0.075 * recencyIndex);
      if (recencyIndex === 4) {
        this.redFlags.push("Brand new account");
      }

      // Scam keywords (Replace with regex expressions)
      let descriptionLower = this.attributes["description"].toLowerCase();
      const t1Keywords = ["act fast", "act now", "urgent", "limited time offer", "cash app", "cashapp",
        "no viewing", "bitcoin", "ethereum", "crypto", "pay with gift card"];

      const t2Keywords = ["paypal", "or best offer", "obo", "hold it", "gift card", "refurbished"];

      t1Keywords.forEach((t1) => {
        if (descriptionLower.includes(t1)) {
          this.scamScore += 0.05;
        }
      });

      t2Keywords.forEach((t2) => {
        if (descriptionLower.includes(t2)) {
          this.scamScore += 0.025;
        }
      });

      // Vehicle mileage
      if (this.attributes["type"] === "vehicle") {
        let mileage = this.attributes["distance driven"].replace(",", "").split(" ");
        let num = parseInt(mileage[0]);
        if (mileage[1] !== "km") {
          num *= 1.6;
        }

        if (num > 200000) {
          this.redFlags.push("High mileage. Poor resale value");
        }
      }

      let listedDate = this.attributes["date"].replace(" ago", "").replace("over ", "").split(" ");
      if (listedDate[1].includes("year") || (listedDate[1] === "weeks" && parseInt(listedDate[0]) > 2)) {
        this.redFlags.push("Seller either rarely checks facebook, or no one wants this for a reason.");
      }

      if (descriptionLower.includes("negotiable")) {
        this.scamScore *= 0.75;
      }

      if (this.scamScore <= 0.2) {
        this.conclusion = "Most likely safe";
      } else if (this.scamScore <= 0.4) {
        this.conclusion = "Scam possible, proceed with caution.";
      } else {
        this.conclusion = "Scam likely. Use extreme caution or find a different listing.";
      }
    }
  }

  // Configuration

  const config = {
    highlightColors: {
      goodDeal: 'rgba(0, 255, 0, 0.2)',
      potentialScam: 'rgba(255, 0, 0, 0.2)',
      averagePrice: 'rgba(255, 255, 0, 0.2)'
    },
    priceDeviationThreshold: 0.3, // 30% below average is good deal
    scamKeywords: ['urgent', 'must sell', 'cash only', 'no returns'],
    minPriceForAnalysis: 50 // Don't analyze items below this price
  };

  // State
  let overlayVisible = true;
  let listingAnalyzer = new ListingAnalyzer(config);
  let listingListAnalyzer = new ListingListAnalyzer(config);

  // Auto-scroll state
  let autoScrollActive = false;
  let autoScrollInterval = null;

  // Initialize the overlay
  function initOverlay() {
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'marketplace-analyzer-overlay';
    document.body.appendChild(overlay);

    // Add search input
    /*
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Filter listings...';
    searchInput.id = 'analyzer-search';
    overlay.appendChild(searchInput);

    searchInput.addEventListener('input', (e) => {
      // currentKeyword = e.target.value.toLowerCase();
      analyzeListings();
    });
    */ // What is this supposed to do?

    // Add toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Toggle Analyzer';
    toggleBtn.id = 'analyzer-toggle';
    overlay.appendChild(toggleBtn);

    toggleBtn.addEventListener('click', () => {
      overlayVisible = !overlayVisible;
      overlay.style.display = overlayVisible ? 'block' : 'none';
    });

    // Add auto-scroll button
    const autoScrollBtn = document.createElement('button');
    autoScrollBtn.textContent = 'Auto Scroll';
    autoScrollBtn.id = 'auto-scroll-btn';
    autoScrollBtn.style.marginLeft = '10px';
    overlay.appendChild(autoScrollBtn);

    autoScrollBtn.addEventListener('click', () => {
      toggleAutoScroll();
    });

    // Add listings counter
    const listingsCounter = document.createElement('div');
    listingsCounter.id = 'listings-counter';
    listingsCounter.textContent = 'Detected Listings: 0';
    listingsCounter.style.marginTop = '10px';
    listingsCounter.style.fontSize = '14px';
    listingsCounter.style.color = '#333';
    overlay.appendChild(listingsCounter);

    // Add clear button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear List';
    clearBtn.id = 'clear-listings-btn';
    clearBtn.style.marginTop = '10px';
    clearBtn.style.backgroundColor = '#ff6b6b';
    clearBtn.style.color = 'white';
    clearBtn.style.border = 'none';
    clearBtn.style.padding = '5px 10px';
    clearBtn.style.borderRadius = '3px';
    clearBtn.style.cursor = 'pointer';
    overlay.appendChild(clearBtn);

    clearBtn.addEventListener('click', () => {
      listingListAnalyzer.clearPersistentListings();
    });

    // Start observing the page
  }

  // Auto-scroll functionality
  function toggleAutoScroll() {
    const autoScrollBtn = document.getElementById('auto-scroll-btn');

    if (autoScrollActive) {
      // Stop auto-scroll
      clearInterval(autoScrollInterval);
      autoScrollActive = false;
      autoScrollBtn.textContent = 'Auto Scroll';
      autoScrollBtn.style.backgroundColor = '';
    } else {
      // Start auto-scroll
      autoScrollActive = true;
      autoScrollBtn.textContent = 'Stop Scroll';
      autoScrollBtn.style.backgroundColor = '#ff6b6b';

      autoScrollInterval = setInterval(() => {
        // Scroll down by a small amount
        window.scrollBy(0, 200);

        // If we've reached the bottom, scroll back to top
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 100) {
          window.scrollTo(0, 0);
        }
      }, 1000); // Scroll every second
    }
  }

  // Initialize when page is ready
  function checkReadyState() {
    if (document.readyState === 'complete') {
      initOverlay();
    } else {
      document.addEventListener('DOMContentLoaded', initOverlay);
    }
  }

  checkReadyState();

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'TOGGLE_EXTENSION') {
      overlayVisible = request.value;
      document.getElementById('marketplace-analyzer-overlay').style.display =
          overlayVisible ? 'block' : 'none';
    }

    if (request.action === 'scrapeListings') { // Requires: An item has been searched for
      let prevKeyword = listingListAnalyzer.currentKeyword;
      let errorMsg;
      console.log('Scrape listings action received');

      const side = document.querySelector('[aria-label="Marketplace sidebar"]');
      if (!side) {
        errorMsg = 'Marketplace sidebar not found. Make sure you are on a Facebook Marketplace search page.';
      }

      const search = side.querySelector('input[aria-label="Search Marketplace"]');
      if (!search) {
        errorMsg = 'Search input not found. Please perform a search first.';
      }

      listingListAnalyzer.currentKeyword = search.value.toString().trim().toLowerCase();
      if (!listingListAnalyzer.currentKeyword) {
        errorMsg = 'No search keyword found. Please search for an item first.';
      }

      if ((!side || !search) || !listingListAnalyzer.currentKeyword) {
        sendResponse({
          success: false,
          error: errorMsg
        });
        return true;
      }

      // Clear previous listings when starting a new search
      if (prevKeyword !== listingListAnalyzer.currentKeyword) {
        listingListAnalyzer.clearPersistentListings();
      }

      listingListAnalyzer.scrapeListingsWithPersistence();
      listingListAnalyzer.observeListings();
      console.log('All detected listings:', listingListAnalyzer.allDetectedListings);

      sendResponse({
        success: true,
        data: listingListAnalyzer.allDetectedListings, // Return all detected listings
        count: listingListAnalyzer.allDetectedListings.length
      });
      return true;
    }

    if (request.action === 'scrapeSingleListing') {
      listingAnalyzer.analyzeSingleListing();
      console.log(listingAnalyzer.getConclusion());
      console.log(listingAnalyzer.getRedFlags());
      console.log(listingAnalyzer.getScamScore());

      sendResponse({
        success: true,
        conclusion: listingAnalyzer.getConclusion(),
        flags: listingAnalyzer.getRedFlags(),
        scamScore: listingAnalyzer.getScamScore()
      });
      return true;
    }
  });

})();
