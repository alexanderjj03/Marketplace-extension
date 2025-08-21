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
  function analyzeSingleListing(config) {
    let conclusion = 'f';
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
    console.log(attributeElems.children.length);

    getAttributes(attributeElems.children); // attributes should be a dictionary.
    conclusion = analyzeAttrs();

    return conclusion;
  }

  function getAttributes(elems) {
    //let types = ["general", "vehicle", "property rental", "property sale"];
    let attrs = {};

    if (elems.length === 3) {
      attrs["type"] = "general";
      attrs = getGeneral(attrs, elems);
    } else if (elems.length === 8) {
      attrs["type"] = "vehicle";
      attrs = getVehicle(attrs, elems);
    } else if (elems.length === 15) {
      attrs = getProperty(attrs, elems);
    }

    return attrs;
  }

  function getGeneral(attrs, elems) {
    let targetNode = elems[0].children[0].children[2];
    const postedDate = targetNode.querySelector('[dir="auto"]').children[0];
    attrs["date"] = postedDate.querySelector('abbr').getAttribute('aria-label');

    // more stuff: description, user join year, condition (if present) user marketplace rating (if any)

    return attrs
  }

  function getVehicle(attrs, elems) {
    let targetNode = elems[0].children[2];
    const postedDate = targetNode.querySelector('[dir="auto"]').children[0];
    attrs["date"] = postedDate.querySelector('abbr').getAttribute('aria-label');

    // more stuff: description, user join year, condition (if present) user marketplace rating (if any)

    return attrs
  }

  function getProperty(attrs, elems) {
    let targetNode = elems[0].children[2];
    let type = targetNode.querySelector('[dir="auto"]').textContent;
    attrs["type"] = ((type.toLowerCase() === "home sales") ? "property sale" : "property rental");

    // more stuff: date, description, user join year, condition (if present) user marketplace rating (if any)

    return attrs
  }

  function analyzeAttrs(attributes) {
    return "";
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
      listingResult = analyzeSingleListing();

      sendResponse({
        success: true,
        data: listingResult,
      });
      return true;
    }
  });

})();
