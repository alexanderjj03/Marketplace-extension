// Configuration
const config = {
  highlightColors: {
    goodDeal: 'rgba(0, 255, 0, 0.2)',
    potentialScam: 'rgba(255, 0, 0, 0.2)',
    averagePrice: 'rgba(255, 255, 0, 0.2)'
  },
  priceDeviationThreshold: 0.3, // 30% below average is good deal
  scamKeywords: ['urgent', 'must sell', 'cash only', 'no returns'],
  minPriceForAnalysis: 10 // Don't analyze items below this price
};

// State
let currentKeyword = '';
let listingsData = [];
let overlayVisible = true;



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
  observeListings();
}

// Observe the page for new listings
function observeListings() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        analyzeListings();
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Main analysis function
function analyzeListings() {
  // Clear previous data
  listingsData = [];

  // Get all listing elements
  const listings = document.querySelectorAll('[aria-label="Collection of Marketplace items"] [role="article"]');

  if (!listings.length) return;

  // Extract data from each listing
  listings.forEach((listing) => {
    const titleElement = listing.querySelector('[dir="auto"]');
    const priceElement = listing.querySelector('span[dir="auto"]:last-child');

    if (!titleElement || !priceElement) return;

    const title = titleElement.textContent.toLowerCase();
    const priceText = priceElement.textContent.replace(/[^0-9.]/g, '');
    const price = parseFloat(priceText) || 0;

    // Only process if matches keyword (if any)
    if (currentKeyword && !title.includes(currentKeyword)) {
      resetListingStyle(listing);
      return;
    }

    listingsData.push({ title, price, element: listing });
  });

  // Analyze prices if we have enough data
  if (listingsData.length >= 3) {
    analyzePrices();
  }

  // Check for potential scams
  detectPotentialScams();
}

// Analyze pricing data
function analyzePrices() {
  const prices = listingsData.map(item => item.price).filter(p => p > config.minPriceForAnalysis);
  if (prices.length < 3) return;

  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const stdDev = Math.sqrt(
      prices.map(price => Math.pow(price - averagePrice, 2))
          .reduce((sum, diff) => sum + diff, 0) / prices.length
  );

  listingsData.forEach(item => {
    if (item.price < config.minPriceForAnalysis) return;

    const priceDiff = averagePrice - item.price;
    const priceRatio = priceDiff / averagePrice;

    if (priceRatio > config.priceDeviationThreshold) {
      // Good deal (significantly below average)
      highlightListing(item.element, config.highlightColors.goodDeal, `Good deal! ${Math.round(priceRatio*100)}% below average`);
    } else if (priceRatio < -config.priceDeviationThreshold) {
      // Potentially overpriced
      highlightListing(item.element, config.highlightColors.averagePrice, `Potentially overpriced (${Math.round(-priceRatio*100)}% above average)`);
    } else {
      // Average price
      resetListingStyle(item.element);
    }
  });
}

// Detect potential scam listings
function detectPotentialScams() {
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

  if (request.action === 'REFRESH_ANALYSIS') {
    analyzeListings();
    // Save scan time
    chrome.storage.sync.set({
      lastScan: Date.now(),
      stats: {
        total: listingsData.length,
        scams: listingsData.filter(item =>
            config.scamKeywords.some(kw => item.title.includes(kw)) ||
            isSuspiciousPrice(item.price, item.title)
                .length)
      }
    });
  }
});