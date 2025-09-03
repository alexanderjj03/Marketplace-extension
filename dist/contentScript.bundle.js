(function () {
  'use strict';

  // Observe the page for new listings
  function observeListings(currentKeyword, config) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          analyzeListings(currentKeyword, config);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }


  // Main analysis function. THIS IS GOOD NOW
  // REQUIRES: currentKeyword isn't null
  function analyzeListings(currentKeyword, config) {
    // Clear previous data
    let listingsData = [];

    // Get all listing elements
    const col = document.querySelector('[aria-label="Collection of Marketplace items"]');
    const listings = col.querySelectorAll('[data-virtualized="false"]');
    console.log(listings.length);

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
      } // iter through contents until the price is found

      let price = parseFloat(contents[idx].replace(/[^0-9.]/g, '')) || 0;
      if (!contents[idx + 1].includes(currentKeyword)) {
        idx += 1;
        if (!contents[idx + 1].includes(currentKeyword)) {
          resetListingStyle(listing);
          return;
        }
      }
      const title = contents[idx + 1];
      let other = "";
      if (idx + 3 < contents.length) {
        other = contents[idx + 3];
      }
      listingsData.push({ "price": price, "title": title, "other": other, "element": listing });
    });
    // Analyze prices if we have enough data
    if (listingsData.length >= 3) {
      analyzePrices(listingsData, config);
    }
    console.log(listingsData);
    // Check for potential scams
    detectPotentialScams(listingsData, config);
    return listingsData;
  }

  // Analyze pricing data. WORK ON THIS NEXT
  function analyzePrices(listingsData, config) {
    // Yeah this will take some work. If there's a year in the title, calculate effective price (older --> less value)
    const prices = listingsData.map(item => item.price).filter(p => p > config.minPriceForAnalysis);
    if (prices.length < 3) return;

    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    /*
    const stdDev = Math.sqrt(
        prices.map(price => Math.pow(price - averagePrice, 2))
            .reduce((sum, diff) => sum + diff, 0) / prices.length
    );
    */

    listingsData.forEach(item => {
      if (item.price < config.minPriceForAnalysis) return;

      const priceDiff = averagePrice - item.price;
      const priceRatio = priceDiff / averagePrice;

      if (priceRatio > config.priceDeviationThreshold) {
        // Good deal (significantly below average)
        highlightListing(item.element, config.highlightColors.goodDeal,
            `Good deal! ${Math.round(priceRatio*100)}% below average`);
      } else if (priceRatio < -config.priceDeviationThreshold) {
        // Potentially overpriced
        highlightListing(item.element, config.highlightColors.averagePrice,
            `Potentially overpriced (${Math.round(-priceRatio*100)}% above average)`);
      } else {
        // Average price
        resetListingStyle(item.element);
      }
    });
  }

  // Detect potential scam listings
  function detectPotentialScams(listingsData, config) {
    listingsData.forEach(item => {
      const isPotentialScam = config.scamKeywords.some(keyword =>
          item.title.includes(keyword)
      ) || isSuspiciousPrice(item.price, item.title);

      if (isPotentialScam) {
        highlightListing(item.element, config.highlightColors.potentialScam, 'Potential scam - review carefully');
      }
    });
  }

  // Helper to check for suspicious pricing
  function isSuspiciousPrice(price, title) {
    // Check for prices that are too good to be true
    const expensiveKeywords = ['iphone', 'macbook', 'playstation', 'xbox'];
    const hasExpensiveItem = expensiveKeywords.some(kw => title.includes(kw));

    return hasExpensiveItem && price < 50;
  }

  // Highlight a listing with a color and tooltip
  function highlightListing(element, color, tooltip) {
    element.style.backgroundColor = color;
    element.style.border = '2px solid ' + color.replace('0.2', '0.8');
    element.title = tooltip;
  }

  // Reset listing style
  function resetListingStyle(element) {
    element.style.backgroundColor = '';
    element.style.border = '';
    element.title = '';
  }

  // Scrape an individual listing's page


  class ListingAnalyzer {

    constructor(config) {
      this.config = config;
      this.observer = null;
      this.attributes = {};
      this.conclusion = "";
    }

    getConclusion() {
      return this.conclusion;
    }

    analyzeSingleListing() {
      this.attributes = {};
      this.conclusion = "";
      let pageConfig = 0;
      // 0 indicates viewing the listing from the listings page, 1 indicates opening the listing in a new tab
      // (DOM structure differs :/)

      const root1 = document.querySelector('[aria-label="Marketplace Listing Viewer"]');
      const root2 = document.querySelector('[aria-label="Collection of Marketplace items"]');

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
      this.analyzeAttrs(this.attributes);
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

      // PROBLEM: Only the shortened form of the description is extracted (the user has to press the "see more" button).
      // Not too important of an issue for now.
      this.attributes["description"] = this.extractText(elems[5].children[1].children[0].children[0], true);
      // Mutation observer needed

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
              this.analyzeAttrs(this.attributes);
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
      let ret = ["", "no"];
      let list = elem.querySelector('[role="list"]').childNodes;

      for (let i = 1; i < list.length; i++) {
        let text = this.extractText(list[i], false).toLowerCase();
        if (text.includes("highly rated ")) {
          ret[1] = "yes";
        } else if (text.includes("joined facebook ")) {
          ret[0] = parseInt(text.split("in ")[1]);
        }
      }

      return ret // user join year, user marketplace rating (yes/no = "highly rated"/not highly rated)
    }

    analyzeAttrs(attributes) {
      this.conclusion = "f";
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
  let currentKeyword = '';
  let listingsData = [];
  let listingResult = '';
  let overlayVisible = true;
  let observerActive = false;
  let listingAnalyzer = new ListingAnalyzer(config);

  // Initialize the overlay
  function initOverlay() {
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'marketplace-analyzer-overlay';
    document.body.appendChild(overlay);

    // Add search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Filter listings...';
    searchInput.id = 'analyzer-search';
    overlay.appendChild(searchInput);

    searchInput.addEventListener('input', (e) => {
      currentKeyword = e.target.value.toLowerCase();
      analyzeListings();
    });

    // Add toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Toggle Analyzer';
    toggleBtn.id = 'analyzer-toggle';
    overlay.appendChild(toggleBtn);

    toggleBtn.addEventListener('click', () => {
      overlayVisible = !overlayVisible;
      overlay.style.display = overlayVisible ? 'block' : 'none';
    });

    // Start observing the page
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

      const side = document.querySelector('[aria-label="Marketplace sidebar"]');
      const search = side.querySelector('input[aria-label="Search Marketplace"]');

      currentKeyword = search.value.toString().trim().toLowerCase(); // should never be null

      listingsData = analyzeListings(currentKeyword, config);
      if (!observerActive) {
        observeListings(currentKeyword, config);
        observerActive = true;
      }
      // Save scan time

      sendResponse({
        success: true,
        data: listingsData,
        count: listingsData.length
      });
      return true;
    } // NEXT: work on scraping an individual listing page.

    if (request.action === 'scrapeSingleListing') {
      listingAnalyzer.analyzeSingleListing();
      listingResult = listingAnalyzer.getConclusion();

      sendResponse({
        success: true,
        data: listingResult,
      });
      return true;
    }
  });

})();
