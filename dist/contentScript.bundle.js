(function () {
  'use strict';

  class ListingListAnalyzer {
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

      // Further analysis for certain cases (e.g. cars, computer parts, properties)

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

  // Scrape an individual listing's page

  class ListingAnalyzer {

    constructor(config) {
      this.config = config;
      this.observer = null;
      this.attributes = {};
      this.redFlags = [];
      this.scamScore = 0;
      this.conclusion = "";
    }

    getRedFlags() {
      return this.redFlags;
    }

    getScamScore() {
      return this.scamScore;
    }

    getConclusion() {
      return this.conclusion;
    }

    analyzeSingleListing() {
      this.attributes = {};
      this.scamScore = 0;
      this.conclusion = "";
      let pageConfig = 0;
      // 0 indicates viewing the listing from the listings page, 1 indicates opening the listing in a new tab
      // (DOM structure differs :/)

      const root1 = document.querySelector('[aria-label="Marketplace Listing Viewer"]');
      const root2 = document.querySelector('[aria-label="Marketplace sidebar"]')
          .parentNode.querySelector('[role="main"]');

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
      this.analyzeAttrs();
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

      this.attributes["description"] = this.extractText(elems[5].children[1].children[0].children[0], true);

      let driven = this.extractText(elems[4].children[1], false);
      this.attributes["distance driven"] = driven.toLowerCase().split("driven ")[1];

      let userInfo = this.extractUserInfo(elems[6]);
      this.attributes["user join year"] = userInfo[0];
      this.attributes["user rating"] = userInfo[1];
    }

    getProperty(elems) {
      let type = this.extractText(elems[0].children[2], false);
      this.attributes["type"] = ((type.toLowerCase() === "home sales") ? "property sale" : "property rental");
      let listedText = this.extractText(elems[1].children[0].lastChild, false);
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
              this.analyzeAttrs();
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
      let ret = ["", false];
      let list = elem.querySelector('[role="list"]').childNodes;

      for (let i = 1; i < list.length; i++) {
        let text = this.extractText(list[i], false).toLowerCase();
        if (text.includes("highly rated ")) {
          ret[1] = true;
        } else if (text.includes("joined facebook ")) {
          ret[0] = parseInt(text.split("in ")[1]);
        }
      }

      return ret // user join year, user marketplace rating (yes/no = "highly rated"/not highly rated)
    }

    analyzeAttrs() {
      const currentYear = new Date().getFullYear();
      this.scamScore = 0; // Needs to be placed here in case the description's text is updated
      this.redFlags = [];
      this.conclusion = "";

      if (!this.attributes["user rating"]) {
        this.scamScore += 0.2;
        this.redFlags.push("Non-reputable seller");
      }

      // 1 if user join year is last year, 4 if user join year is this year.
      let recencyIndex = Math.pow(Math.max(this.attributes["user join year"] - currentYear + 2, 0), 2);
      this.scamScore += (0.075 * recencyIndex);
      if (recencyIndex === 4) {
        this.redFlags.push("Brand new account");
      }

      // Scam keywords (Replace with regex expressions)
      let descriptionLower = this.attributes["description"].toLowerCase();
      const t1Keywords = ["act fast", "act now", "urgent", "limited time offer", "cash app", "cashapp",
        "no viewing", "bitcoin", "ethereum", "crypto", "pay with gift card"];

      const t2Keywords = ["paypal", "or best offer", "obo", "hold it", "gift card", "refurbished"];

      t1Keywords.forEach((t1) => {
        if (descriptionLower.includes(t1)) {
          this.scamScore += 0.05;
        }
      });

      t2Keywords.forEach((t2) => {
        if (descriptionLower.includes(t2)) {
          this.scamScore += 0.025;
        }
      });

      // Vehicle mileage
      if (this.attributes["type"] === "vehicle") {
        let mileage = this.attributes["distance driven"].replace(",", "").split(" ");
        let num = parseInt(mileage[0]);
        if (mileage[1] !== "km") {
          num *= 1.6;
        }

        if (num > 200000) {
          this.redFlags.push("High mileage. Poor resale value");
        }
      }

      let listedDate = this.attributes["date"].replace(" ago", "").replace("over ", "").split(" ");
      if (listedDate[1].includes("year") || (listedDate[1] === "weeks" && parseInt(listedDate[0]) > 2)) {
        this.redFlags.push("Seller either rarely checks facebook, or no one wants this for a reason.");
      }

      if (descriptionLower.includes("negotiable")) {
        this.scamScore *= 0.75;
      }

      if (this.scamScore <= 0.2) {
        this.conclusion = "Most likely safe";
      } else if (this.scamScore <= 0.4) {
        this.conclusion = "Scam possible, proceed with caution.";
      } else {
        this.conclusion = "Scam likely. Use extreme caution or find a different listing.";
      }
    }
  }

  // Configuration

  let config = { // default config
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

  // Helper
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function loadSettings() {
    chrome.storage.sync.get(['marketplaceColorSettings'], (result) => {
      if (result.marketplaceColorSettings) {
        const settings = result.marketplaceColorSettings;
        config.highlightColors.goodDeal = hexToRgba(settings.goodDealColor, 0.2);
        config.highlightColors.neutral = hexToRgba(settings.avgDealColor, 0.2);
        config.highlightColors.overpriced = hexToRgba(settings.overpricedColor, 0.2);
        config.highlightColors.potentialScam = hexToRgba(settings.scamColor, 0.2);

        listingAnalyzer.config = config; // Update config in analyzers
        listingListAnalyzer.config = config;
      }
    });
  }

  function addScrapeButtons(overlay) {
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
  }

  function addStatus(overlay) {
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
  }

  function addQoLFeatures(overlay) {
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

  // Initialize the overlay
  function initOverlay() {
    loadSettings();

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

    addScrapeButtons(overlay); // Add overlay components
    addStatus(overlay);
    addQoLFeatures(overlay);
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

})();
