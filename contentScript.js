// Configuration
import {ListingListAnalyzer} from "./src_alex/analyzeListings.js";
import {ListingAnalyzer} from "./src_alex/analyzeSingleListing.js";

const config = {
  highlightColors: {
    goodDeal: 'rgba(0, 255, 0, 0.2)',
    potentialScam: 'rgba(255, 0, 0, 0.2)',
    averagePrice: 'rgba(255, 255, 0, 0.2)'
  },
  priceDeviationThreshold: 0.2, // 20% below average is good deal
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

// Add toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'Toggle Overlay';
  toggleBtn.style.marginLeft = '10px';
  toggleBtn.id = 'analyzer-toggle';
  overlay.appendChild(toggleBtn);

  toggleBtn.addEventListener('click', () => {
    overlayVisible = !overlayVisible;
    overlay.style.display = overlayVisible ? 'block' : 'none';
  });

  // Start observing the page
}

// Auto-scroll functionality (may cause a user to get facebook banned)
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
  if (document.readyState !== 'loading') {
    initOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', initOverlay);
  }
}

checkReadyState();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggle_extension') {
    overlayVisible = !overlayVisible;
    document.getElementById('marketplace-analyzer-overlay').style.display =
        overlayVisible ? 'block' : 'none';

    sendResponse({ success: true, visible: overlayVisible });
    return true;
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