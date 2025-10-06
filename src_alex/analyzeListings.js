export class ListingListAnalyzer {
  // Minimal config with sensible defaults
  constructor(config) {
    this.config = config;
    this.observer = null;
    this.currentKeyword = "";
    this.allDetectedListings = [];
    this.uniqueListings = new Set();
    this._pendingScan = false;
  }

  // Start observing the listings container (fallback to body) with throttled rescans
  observeListings() {
    if (this.observer) {
      this.observer.disconnect();
      console.log("Observer disconnected");
    }

    const container =
      document.querySelector('[aria-label="Collection of Marketplace items"]') || document.body;

    this.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          if (!this._pendingScan) {
            this._pendingScan = true;
            requestAnimationFrame(() => {
              this._pendingScan = false;
              this.scrapeListingsWithPersistence();
            });
          }
          break;
        }
      }
    });

    this.observer.observe(container, { childList: true, subtree: true });
    console.log("Observer started on", container === document.body ? "document.body (fallback)" : "Marketplace items container");
  }

  // Scrape visible listings, persist/dedupe, then analyze prices and scams
  scrapeListingsWithPersistence() {
    const col = document.querySelector('[aria-label="Collection of Marketplace items"]');
    if (!col) return;

    const listings = col.querySelectorAll('[data-virtualized="false"]');
    const currentListings = [];

    listings.forEach((listing) => {
      const details = listing.querySelectorAll('[dir="auto"]');
      if (!details || !details.length) return;

      const contents = [];
      details.forEach((d) => contents.push(String(d.textContent || "").toLowerCase().trim()));

      let idx = 0;
      while (
        idx < contents.length &&
        (contents[idx] === "just listed" ||
         (parseFloat(contents[idx].replace(/[^0-9.]/g, '')) || 0) === 0)
      ) {
        idx += 1;
      }
      if (idx >= contents.length) return;

      const price = parseFloat(contents[idx].replace(/[^0-9.]/g, '')) || 0;

      const titleCandidate = contents[idx + 1] ?? "";
      let title = titleCandidate;

      if (this.currentKeyword && !titleCandidate.includes(this.currentKeyword)) {
        const alt = contents[idx + 2] ?? "";
        if (alt.includes(this.currentKeyword)) {
          idx += 1;
          title = alt;
        } else {
          this.resetListingStyle(listing);
          return;
        }
      }

      const other = (idx + 3 < contents.length) ? (contents[idx + 3] ?? "") : "";

      currentListings.push({ price, title, other, element: listing });
    });

    this.addNewListingsToPersistentList(currentListings);

    if (this.allDetectedListings.length >= 5) {
      this.analyzeAllListingsPrices(currentListings);
    }

    this.detectPotentialScams();
  }

  // Dedupe & persist newly seen listings
  addNewListingsToPersistentList(newListings) {
    const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, ' ').trim();

    newListings.forEach((listing) => {
      const listingId = `${norm(listing.title)}|${listing.price}|${norm(listing.other)}`;
      if (!this.uniqueListings.has(listingId)) {
        this.uniqueListings.add(listingId);
        this.allDetectedListings.push({
          ...listing,
          id: listingId,
          detectedAt: Date.now()
        });
      }
    });

    console.log('All detected listings (count):', this.allDetectedListings.length);
    this.updateListingsCounter();
  }

  // Price analysis using robust statistics (median + MAD) to highlight deals/overpriced items
  analyzeAllListingsPrices(curListings) {
    const prices = this.allDetectedListings
      .map(i => i.price)
      .filter(p => p > this.config.minPriceForAnalysis);

    if (prices.length < 5) return;

    const med = median(prices);
    const mad = median(prices.map(p => Math.abs(p - med))) || 1;

    curListings.forEach((listing) => {
      if (listing.price < this.config.minPriceForAnalysis) return;

      const z = (listing.price - med) / (1.4826 * mad);

      if (z <= -this.config.robustZGood) {
        this.highlightListing(
          listing.element,
          this.config.highlightColors.goodDeal,
          `Good deal (robust z ≈ ${round2(z)})`
        );
      } else if (z >= this.config.robustZBad) {
        this.highlightListing(
          listing.element,
          this.config.highlightColors.overpriced,
          `Potentially overpriced (robust z ≈ ${round2(z)})`
        );
      } else {
        this.highlightListing(
          listing.element,
          this.config.highlightColors.neutral,
          `Neutral (robust z ≈ ${round2(z)})`
        );
      }
    });
  }

  // Heuristic scam detection (keywords + “too-good-to-be-true” relative floor)
  detectPotentialScams() {
    const baselinePrices = this.allDetectedListings
      .map(i => i.price)
      .filter(p => p > this.config.minPriceForAnalysis);

    const haveBaseline = baselinePrices.length >= 5;
    const med = haveBaseline ? median(baselinePrices) : null;

    this.allDetectedListings.forEach(item => {
      const title = String(item.title || "").toLowerCase();
      const keywordHit = this.config.scamKeywords.some(kw => title.includes(kw));
      const suspiciousPrice = this.isSuspiciousPrice(item.price, title, med);

      if (keywordHit || suspiciousPrice) {
        this.highlightListing(
          item.element,
          this.config.highlightColors.potentialScam,
          'Potential scam - review carefully'
        );
      }
    });
  }

  // Price sanity checks for high-value items
  isSuspiciousPrice(price, title, medianPriceOrNull) {
    const expensiveKeywords = ['iphone','macbook','playstation','xbox','gpu','rtx','ps5','ipad','imac','switch','s23','s24','pixel'];
    const hasExpensiveItem = expensiveKeywords.some(kw => title.includes(kw));
    if (!hasExpensiveItem) return false;

    if (medianPriceOrNull) {
      const relativeFloor = Math.max(30, medianPriceOrNull * 0.15);
      return price <= relativeFloor;
    }
    return price < 50;
  }

  // Styling helpers with stale-node guards
  highlightListing(element, color, tooltip) {
    if (!element || !document.contains(element)) return;
    element.style.backgroundColor = color;
    element.style.border = '2px solid ' + safeOpaque(color);
    element.title = tooltip;
  }

  resetListingStyle(element) {
    if (!element || !document.contains(element)) return;
    element.style.backgroundColor = '';
    element.style.border = '';
    element.title = '';
  }

  // UI counter update
  updateListingsCounter() {
    const counter = document.getElementById('listings-counter');
    if (counter) {
      counter.textContent = `Detected Listings: ${this.allDetectedListings.length}`;
    }
  }

  // Clear data and remove any residual highlights
  clearPersistentListings() {
    this.allDetectedListings.forEach(item => this.resetListingStyle(item.element));
    this.allDetectedListings = [];
    this.uniqueListings.clear();
    this.updateListingsCounter();
  }

  // Public setter for keyword filter (empty string disables filtering)
  setKeywordFilter(keyword = "") {
    this.currentKeyword = String(keyword || "").toLowerCase().trim();
  }
}

/* ---------- utilities ---------- */
function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function safeOpaque(rgba) {
  const m = typeof rgba === 'string' ? rgba.match(/^rgba\(\s*([0-9.\s]+),\s*([0-9.\s]+),\s*([0-9.\s]+),\s*([0-9.\s]+)\s*\)$/i) : null;
  if (!m) return rgba;
  const r = +m[1], g = +m[2], b = +m[3];
  return `rgba(${r}, ${g}, ${b}, 0.8)`;
}
