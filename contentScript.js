// Configuration
import { ListingListAnalyzer } from "./src_alex/analyzeListings.js";
import { ListingAnalyzer } from "./src_alex/analyzeSingleListing.js";

const config = {
  highlightColors: {
    goodDeal: 'rgba(0,255,0,0.2)',
    neutral: 'rgba(255,255,0,0.2)',
    potentialScam: 'rgba(255,0,0,0.2)',
    overpriced: 'rgba(255, 179, 0, 0.2)'
  },
  robustZGood: 0.5,
  robustZBad: 0.5,
  minPriceForAnalysis: 50,
  scamKeywords: ['urgent', 'must sell', 'cash only', 'no returns', 'e-transfer', 'wire transfer']
};

// State
let overlayVisible = true;
let listingAnalyzer = new ListingAnalyzer(config);
let listingListAnalyzer = new ListingListAnalyzer(config);

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

  const scrapeListingsBtn = document.createElement('button');
  scrapeListingsBtn.textContent = 'Scrape Listings';
  scrapeListingsBtn.id = 'scrape-listings-btn';
  scrapeListingsBtn.style.cssText = baseBtnCss() + 'background:#0b5cff;color:#fff;margin-bottom:8px;';
  overlay.appendChild(scrapeListingsBtn);
  scrapeListingsBtn.addEventListener('click', scrapeListings);

  const scrapeSingleBtn = document.createElement('button');
  scrapeSingleBtn.textContent = 'Analyze Single Listing';
  scrapeSingleBtn.id = 'scrape-single-btn';
  scrapeSingleBtn.style.cssText = baseBtnCss() + 'background:#0b5cff;color:#fff;margin-left:8px;margin-bottom:8px;';
  overlay.appendChild(scrapeSingleBtn);
  scrapeSingleBtn.addEventListener('click', scrapeSingleListing);

  const statusContainer = document.createElement('div');
  statusContainer.id = 'analyzer-status';
  statusContainer.style.cssText = 'margin-top:4px;magin-bottom:12px;width:260px;display:flex;align-items:top;';

  const statusDot = document.createElement('span');
  statusDot.id = 'analyzer-status-dot';
  statusDot.style.cssText = `
    display:inline-block; width:10px; height:10px; border-radius:50%;
    background:#28a745; margin-right:6px;margin-top:4px;vertical-align:top;
  `;
  statusContainer.appendChild(statusDot);

  const status = document.createElement('span');
  status.id = 'analyzer-status-text';
  status.style.cssText = 'width:240px;';
  status.textContent = 'Marketplace loaded. Select an action listed above.';
  statusContainer.appendChild(status);
  overlay.appendChild(statusContainer);

  const listingsCounter = document.createElement('div');
  listingsCounter.id = 'listings-counter';
  listingsCounter.textContent = 'Detected Listings: 0';
  listingsCounter.style.cssText = 'font-size:13px;color:#333;margin-top:8px;';
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

function updateStatus(message, type) {
  const status = document.getElementById('analyzer-status');
  if (status) {
    status.children[1].textContent = message;
    const dot = status.children[0];
    if (type === 'success') {
      dot.style.background = '#28a745';
    } else if (type === 'error') {
      dot.style.background = '#dc3545';
    } else {
      dot.style.background = '#ffc107';
    }
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

function scrapeListings() { // Requires: An item has been searched for
  let prevKeyword = listingListAnalyzer.currentKeyword;
  let errorMsg;
  console.log('Scrape listings action received');

  if (!document.URL.includes("/search")) {
    errorMsg = 'Not on a Marketplace search page. Please navigate to Facebook Marketplace and perform a search first.';
    updateStatus(errorMsg, "error");
    return;
  }

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

  if (errorMsg) {
    updateStatus(errorMsg, "error");
    return;
  }

  // Clear previous listings when starting a new search
  if (prevKeyword !== listingListAnalyzer.currentKeyword) {
    listingListAnalyzer.clearPersistentListings();
  }

  listingListAnalyzer.scrapeListingsWithPersistence();
  listingListAnalyzer.observeListings();
  updateStatus("Success! Observer is active. Scroll to load more listings.", "success");
  console.log('All detected listings:', listingListAnalyzer.allDetectedListings);
}

function scrapeSingleListing() {
  if (!document.URL.includes("/item/")) {
    const errorMsg = 'Not on a single listing page. Please navigate to a specific Facebook Marketplace listing.';
    updateStatus(errorMsg, "error");
    return;
  }

  listingAnalyzer.analyzeSingleListing();
  updateStatus("Single listing analyzed.", "success");
  console.log(listingAnalyzer.getConclusion());
  console.log(listingAnalyzer.getRedFlags());
  console.log(listingAnalyzer.getScamScore());
}

// Message listener
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
});