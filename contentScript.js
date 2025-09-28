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
  if (document.getElementById('marketplace-analyzer-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'marketplace-analyzer-overlay';
  overlay.style.cssText = `
    position: fixed; top: 12px; right: 12px; z-index: 2147483647;
    background:#fff; border:1px solid #ddd; border-radius:10px; padding:12px;
    box-shadow:0 6px 20px rgba(0,0,0,.15); font:13px/1.35 system-ui,sans-serif;
    min-width: 220px;
  `;
  document.body.appendChild(overlay);

  const listingsCounter = document.createElement('div');
  listingsCounter.id = 'listings-counter';
  listingsCounter.textContent = 'Detected Listings: 0';
  listingsCounter.style.cssText = 'font-size:13px;color:#333;';
  overlay.appendChild(listingsCounter);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear List';
  clearBtn.id = 'clear-listings-btn';
  clearBtn.style.cssText = baseBtnCss() + 'background:#ff6b6b;color:#fff;margin-top:10px;';
  overlay.appendChild(clearBtn);
  clearBtn.addEventListener('click', () => {
    if (listingListAnalyzer) listingListAnalyzer.clearPersistentListings();
  });

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'Toggle Overlay';
  toggleBtn.id = 'analyzer-toggle';
  toggleBtn.style.cssText = baseBtnCss() + 'background:#0b5cff;color:#fff;margin-left:10px;margin-top:10px;';
  overlay.appendChild(toggleBtn);
  toggleBtn.addEventListener('click', () => {
    overlayVisible = !overlayVisible;
    overlay.style.display = overlayVisible ? 'block' : 'none';
    const tab = document.getElementById('analyzer-reopen-tab');
    if (tab) tab.style.display = overlayVisible ? 'none' : 'block';
  });

  const reopenTab = document.createElement('button');
  reopenTab.textContent = 'Analyzer';
  reopenTab.id = 'analyzer-reopen-tab';
  reopenTab.style.cssText = `
    position: fixed; top: 12px; right: 12px; z-index: 2147483647;
    background:#0b5cff;color:#fff;border:none;border-radius:6px;padding:6px 10px;
    box-shadow:0 4px 12px rgba(0,0,0,.18); font:12px system-ui,sans-serif;
    display: none;
  `;
  document.body.appendChild(reopenTab);
  reopenTab.addEventListener('click', () => {
    overlayVisible = true;
    overlay.style.display = 'block';
    reopenTab.style.display = 'none';
  });
}

function baseBtnCss() {
  return `background:#f5f5f5;border:1px solid #ccc;border-radius:6px;padding:6px 10px;cursor:pointer;`;
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
    const panel = document.getElementById('marketplace-analyzer-overlay');
    const tab = document.getElementById('analyzer-reopen-tab');
    if (panel) panel.style.display = overlayVisible ? 'block' : 'none';
    if (tab) tab.style.display = overlayVisible ? 'none' : 'block';
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