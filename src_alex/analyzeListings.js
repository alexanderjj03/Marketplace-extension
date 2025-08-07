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
  const col = document.querySelector('[aria-label="Collection of Marketplace items"]');
  const listings = col.querySelectorAll('[data-virtualized="false"]');

  // Extract data from each listing
  listings.forEach((listing) => {
    const details = listing.querySelectorAll('[dir="auto"]');

    if (details.length < 3) return;

    let price = details[0].textContent.replace(/[^0-9.]/g, '');
    price = parseFloat(price) || 0;
    const title = details[1].textContent.toLowerCase();
    let other = "";
    if (details.length > 3) {
      other = details[3].textContent.toLowerCase();
    }

    // Only process if matches keyword (if any)
    if (currentKeyword && !title.includes(currentKeyword)) { // something wrong with this
      resetListingStyle(listing);
    } else {
      listingsData.push({ "price": price, "title": title, "other": other, "element": listing });
    }
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

// Analyze pricing data
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