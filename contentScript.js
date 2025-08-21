// Configuration
import {isSuspiciousPrice, analyzeListings, observeListings} from "./src_alex/analyzeListings.js";
import {analyzeSingleListing} from "./src_alex/analyzeSingleListing.js";

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
    listingResult = analyzeSingleListing(config);

    sendResponse({
      success: true,
      data: listingResult,
    });
    return true;
  }
});