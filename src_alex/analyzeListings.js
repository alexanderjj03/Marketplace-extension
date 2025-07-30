// Observe the page for new listings
export function observeListings(currentKeyword, config) {
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


// Main analysis function
export function analyzeListings(currentKeyword, config) {
  // Clear previous data
  let listingsData = [];

  // Get all listing elements
  const collection = document.querySelectorAll('[aria-label="Collection of Marketplace items"]');
  if (collection.length < 1) return;
  const col = collection[0];
  const listings = col.querySelectorAll('[data-virtualized="false"]');
  console.log(listings.length)

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
    analyzePrices(listingsData, config);
  }

  // Check for potential scams
  detectPotentialScams(listingsData, config);
  return listingsData;
}

// Analyze pricing data
function analyzePrices(listingsData, config) {
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
export function isSuspiciousPrice(price, title) {
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