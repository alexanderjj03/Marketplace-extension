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
      const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, ' ').trim();
      const col = document.querySelector('[aria-label="Collection of Marketplace items"]');
      if (!col) return;

      const listings = col.querySelectorAll('[data-virtualized="false"]');
      const currentListings = [];

      listings.forEach((listing) => {
        const hrefElem = listing.querySelector('a[href]');
        const href = hrefElem ? hrefElem.getAttribute('href') : null;
        const id = `${norm(href.split('/')[3])}`;
        if (!href || !href.includes('marketplace/item/')) return;

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
        const altCandidate = contents[idx + 2] ?? "";
        let title = ".";

        const currentKeywordList = this.currentKeyword.split(' ');

        for (const kw of currentKeywordList) { // Extracting title based on search keywords
          if (titleCandidate.includes(kw)) {
            title = titleCandidate;
            break;
          }
        }

        if (title === ".") {
          for (const kw of currentKeywordList) {
            if (altCandidate.includes(kw)) {
              title = altCandidate;
              idx += 1;
              break;
            }
          }
        }

        if (title === ".") {
          this.resetListingStyle(listing);
          return;
        }

        const other = (idx + 3 < contents.length) ? (contents[idx + 3] ?? "") : ""; // Additional info (e.g. number of km on a car)
        currentListings.push({ price, title, id, other, element: listing });
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
      newListings.forEach((listing) => {
        if (!this.uniqueListings.has(listing.id)) {
          this.uniqueListings.add(listing.id);
          this.allDetectedListings.push({
            ...listing,
            detectedAt: Date.now()
          });
        }
      });

      console.log('All detected listings (count):', this.allDetectedListings.length);
      this.updateListingsCounter();
    }

    // Enhanced price analysis with category-specific formulas (made up formulas for now lol!!) for better deal detection
    analyzeAllListingsPrices(curListings) {
      const prices = this.allDetectedListings
        .map(i => i.price)
        .filter(p => p > this.config.minPriceForAnalysis);

      if (prices.length < 5) return;

      // Basic statistical analysis for general pricing context
      const med = median(prices);
      const mad = median(prices.map(p => Math.abs(p - med))) || 1; 

      // Detect category (based off of currentKeyword)
      const category = this.detectListingCategory(this.currentKeyword);

      let priceNormalizedListings = [];
      if (category === 'car') {
        priceNormalizedListings = this.preprocessCarListings();
        console.log("Normalized: ", priceNormalizedListings);
      } // Preprocess car listings

      curListings.forEach((listing) => {
        if (listing.price < this.config.minPriceForAnalysis) return;
        
        // Get category-specific analysis results
        const analysisResult = this.analyzeCategorySpecificPrice(listing, category, med, mad, priceNormalizedListings);
        
        // Apply appropriate highlighting based on analysis
        this.applyAnalysisHighlighting(listing, analysisResult);
      });
    }

    // this one i added category detection based on listing titles and keywords:)
    detectListingCategory(title) {
      const titleLower = String(title || "").toLowerCase();
      
      // Car-related keywords (comprehensive list)
      const carKeywords = [
        'car', 'vehicle', 'auto', 'truck', 'suv', 'sedan', 'coupe', 'hatchback',
        'bmw', 'mercedes', 'audi', 'toyota', 'honda', 'ford', 'chevrolet', 'nissan',
        'miles', 'mileage', 'year', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024',
        '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', 'automatic', 
        'manual', 'transmission', 'engine', 'v6', 'v8', 'hybrid', 'electric'
      ];
      
      // Electronics keywords (phones, computers, gaming, etc.)
      const electronicsKeywords = [
        'iphone', 'samsung', 'galaxy', 'pixel', 'oneplus', 'xiaomi', 'huawei',
        'macbook', 'laptop', 'computer', 'pc', 'desktop', 'imac', 'mac pro',
        'ipad', 'tablet', 'surface', 'kindle', 'fire tablet',
        'playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'switch', 'steam deck',
        'gpu', 'graphics card', 'rtx', 'gtx', 'amd', 'nvidia', 'intel',
        'monitor', 'display', 'tv', 'smart tv', 'oled', 'led', '4k', '8k',
        'headphones', 'airpods', 'speaker', 'bluetooth', 'wireless'
      ];
      
      // Property/real estate keywords
      const propertyKeywords = [
        'apartment', 'house', 'condo', 'condominium', 'townhouse', 'studio',
        'bedroom', 'bathroom', 'sqft', 'square feet', 'rent', 'lease',
        'furnished', 'unfurnished', 'utilities', 'parking', 'garage',
        'downtown', 'suburb', 'neighborhood', 'district', 'area'
      ];

      // Count keyword matches for each category inded this is the logic 
      const carScore = carKeywords.filter(kw => titleLower.includes(kw)).length;
      const electronicsScore = electronicsKeywords.filter(kw => titleLower.includes(kw)).length;
      const propertyScore = propertyKeywords.filter(kw => titleLower.includes(kw)).length;

      // Return category with highest score, or 'general' if no clear winner
      let scores = [carScore, electronicsScore, propertyScore].sort((a, b) => b - a);
      if (scores[0] === scores[1]) {
        return 'general';
      } else {
        if (carScore === scores[0]) return 'car';
        if (electronicsScore === scores[0]) return 'electronics';
        if (propertyScore === scores[0]) return 'property';
      }
      
      return 'general';
    }

    // Category-specific price analysis with some formulas
    analyzeCategorySpecificPrice(listing, category, medianPrice, mad, priceNormalizedListings) {
      const price = listing.price;
      const title = String(listing.title || "").toLowerCase();
      
      switch (category) {
        case 'car':
          return this.analyzeCarPrice(listing.id, priceNormalizedListings);
        case 'electronics':
          return this.analyzeElectronicsPrice(price, title, medianPrice);
        case 'property':
          return this.analyzePropertyPrice(price, title, medianPrice);
        default:
          return this.analyzeGeneralPrice(price, medianPrice, mad);
      }
    }

    // Further preprocessing for car listings if needed (price adjustment based on year/mileage)
    preprocessCarListings() {  
      let processedListings = [];
      for (const listing of this.allDetectedListings) {
        let listingCopy = {...listing};

        const title = listing.title;
        const price = listing.price;
        const odometer = listing.other;

        let mileageInKms = 0;
        if (odometer && odometer.includes('km')) {
          let value = odometer.split(' km')[0];
          if (value.includes('k')) {
            value = value.replace('k', '');
            mileageInKms = parseFloat(value) * 1000;
          } else {
            mileageInKms = parseFloat(value);
          }
        } else if (odometer && odometer.contains('mi')) {
          let value = odometer.split(' mi')[0];
          if (value.includes('k')) {
            value = value.replace('k', '');
            mileageInKms = parseFloat(value) * 1609.34;
          } else {
            mileageInKms = parseFloat(value) * 1.60934;
          }
        }

        const yearMatch = title.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? parseInt(yearMatch[0]) : null;

        let multiplier = ((mileageInKms > 0 ? Math.pow(2, mileageInKms/130000) : 1.5) * (year ? (1 + Math.min((new Date().getFullYear() - year) * 0.08, 0.4)) : 1.5));

        // Modify the price in place based on year and mileage for normalization
        let adjustedPrice = price * Math.min(multiplier, 30);

        listingCopy.price = adjustedPrice;
        processedListings.push(listingCopy);
      }
      return processedListings;
    }

    // Car price analysis considering year, mileage and market factors 
    // FYI: AnalysisText does not show anywhere on the screen
    // This needs to be redone...
    analyzeCarPrice(listingId, priceNormalizedListings) {
      // Input validation for errors
      const listing = priceNormalizedListings.find(l => l.id === listingId);
      const prices = priceNormalizedListings
        .map(i => i.price)
        .filter(p => p > this.config.minPriceForAnalysis);
      const medianPrice = median(prices);

      if (!listing || !medianPrice || medianPrice <= 0) {
        return {
          score: 0,
          text: `Car Analysis: Invalid price data`,
          category: 'car',
          savingsPercent: 0
        };
      }
      
      let dealScore = 0;
      let analysisText = `Car Analysis: $${listing.price.toLocaleString()}`;

      let savingsPercent = this.calculateSavingsPercent(listing.price, medianPrice);
      dealScore += savingsPercent * 0.75; // Moderate weight
      analysisText += ` | ${Math.round(savingsPercent)}% vs median price`;
      
      return {
        score: dealScore,
        text: analysisText,
        category: 'car',
        savingsPercent: savingsPercent
      };
    }

    // below is the electronic part i adeed (similar logic )
    // Electronicsprice analysis considering age, condition, and market value
    analyzeElectronicsPrice(price, title, medianPrice) {
      // Input validation for  errors
      if (!price || price <= 0 || !medianPrice || medianPrice <= 0) {
        return {
          score: 0,
          text: `Electronics Analysis: Invalid price data`,
          category: 'electronics',
          savingsPercent: 0
        };
      }
      
      let dealScore = 0;
      let analysisText = `Electronics Analysis: $${price.toLocaleString()}`;
      
      // Phone-specific analysis
      if (title.includes('iphone') || title.includes('samsung') || title.includes('galaxy')) {
        const phoneModels = {
          'iphone 15': 800, 'iphone 14': 600, 'iphone 13': 400, 'iphone 12': 300, 'iphone 11': 200,
          's23': 600, 's24': 800, 'galaxy s23': 600, 'galaxy s24': 800, 'galaxy s22': 400
        };
        
        for (const [model, expectedPrice] of Object.entries(phoneModels)) {
          if (title.includes(model)) {
            const savings = ((expectedPrice - price) / expectedPrice) * 100;
            if (savings > 30) {
              dealScore += 30;
              analysisText += ` | Excellent phone deal (${Math.round(savings)}% off retail)`;
            } else if (savings > 15) {
              dealScore += 15;
              analysisText += ` | Good phone deal (${Math.round(savings)}% off retail)`;
            } else if (savings < -20) {
              dealScore -= 20;
              analysisText += ` | Overpriced phone (${Math.round(Math.abs(savings))}% above retail)`;
            }
            break;
          }
        }
      }
      
      // Gaming console analysis
      if (title.includes('playstation') || title.includes('ps5') || title.includes('ps4') || title.includes('xbox')) {
        const consolePrices = {
          'ps5': 500, 'playstation 5': 500, 'xbox series x': 500, 'xbox series s': 300,
          'ps4': 200, 'playstation 4': 200, 'xbox one': 150
        };
        
        for (const [console, expectedPrice] of Object.entries(consolePrices)) {
          if (title.includes(console)) {
            const savings = ((expectedPrice - price) / expectedPrice) * 100;
            if (savings > 25) {
              dealScore += 25;
              analysisText += ` | Great console deal (${Math.round(savings)}% off retail)`;
            } else if (savings < -15) {
              dealScore -= 15;
              analysisText += ` | Console overpriced (${Math.round(Math.abs(savings))}% above retail)`;
            }
            break;
          }
        }
      }
      
      // Laptop/computer analysis
      if (title.includes('laptop') || title.includes('macbook') || title.includes('computer')) {
        // MacBook specific analysis
        if (title.includes('macbook')) {
          const macbookPrices = {
            'macbook air m1': 800, 'macbook air m2': 1000, 'macbook pro m1': 1200, 'macbook pro m2': 1500
          };
          
          for (const [model, expectedPrice] of Object.entries(macbookPrices)) {
            if (title.includes(model)) {
              const savings = ((expectedPrice - price) / expectedPrice) * 100;
              if (savings > 20) {
                dealScore += 25;
                analysisText += ` | Excellent MacBook deal (${Math.round(savings)}% off retail)`;
              } else if (savings < -10) {
                dealScore -= 15;
                analysisText += ` | MacBook overpriced (${Math.round(Math.abs(savings))}% above retail)`;
              }
              break;
            }
          }
        } else {
          // General laptop analysis
          if (price < medianPrice * 0.6) {
            dealScore += 20;
            analysisText += ` | Great laptop deal`;
          } else if (price > medianPrice * 1.3) {
            dealScore -= 15;
            analysisText += ` | Laptop overpriced`;
          }
        }
      }
      
      // Condition-based adjustments this one took me a while bro
      if (title.includes('new') || title.includes('sealed')) {
        dealScore += 10;
        analysisText += ` | New condition bonus`;
      } else if (title.includes('broken') || title.includes('damaged') || title.includes('cracked')) {
        dealScore -= 30;
        analysisText += ` | Damaged condition - negotiate lower`;
      } else if (title.includes('refurbished') || title.includes('reconditioned')) {
        if (price < medianPrice * 0.7) {
          dealScore += 10;
          analysisText += ` | Good refurbished deal`;
        }
      }
      
      return {
        score: dealScore,
        text: analysisText,
        category: 'electronics',
        savingsPercent: this.calculateSavingsPercent(price, medianPrice)
      };
    }

    // these are for property stuff 
    // Property price analysis using location and property type factors
    analyzePropertyPrice(price, title, medianPrice) {
      // Input validation to prevent errors
      if (!price || price <= 0 || !medianPrice || medianPrice <= 0) {
        return {
          score: 0,
          text: `Property Analysis: Invalid price data`,
          category: 'property',
          savingsPercent: 0
        };
      }
      
      let dealScore = 0;
      let analysisText = `Property Analysis: $${price.toLocaleString()}`;

      let savingsPercent = this.calculateSavingsPercent(price, medianPrice);
      dealScore += savingsPercent * 0.7; // Moderate weight
      analysisText += ` | ${Math.round(savingsPercent)}% vs median price`;
      
      // Location-based adjustments (simplified)
      
      const premiumLocations = ['downtown', 'city center', 'waterfront', 'beach'];
      const hasPremiumLocation = premiumLocations.some(loc => title.includes(loc));
      if (hasPremiumLocation) {
        // Premium locations justify higher prices
        dealScore += 10;
        analysisText += ` | Premium location deal`;
      }
      
      // Furnishing analysis
      if (title.includes('furnished')) {
        // Furnished properties cost more but add value
        dealScore += 5;
        analysisText += ` | Furnished`;
      } else if (title.includes('unfurnished')) {
        // Unfurnished should be cheaper
        dealScore -= 5;
        analysisText += ` | Unfurnished`;
      }
      
      return {
        score: dealScore,
        text: analysisText,
        category: 'property',
        savingsPercent: this.calculateSavingsPercent(price, medianPrice)
      };
    }

    // General price analysis for non-categorized items
    analyzeGeneralPrice(price, medianPrice, mad) {
      // Input validation to prevent errors
      if (!price || price <= 0 || !medianPrice || medianPrice <= 0 || !mad || mad <= 0) {
        return {
          score: 0,
          text: `General Analysis: Invalid price data`,
          category: 'general',
          savingsPercent: 0
        };
      }
      
      const z = (price - medianPrice) / (1.4826 * mad);
      const savingsPercent = this.calculateSavingsPercent(price, medianPrice);
      
      let dealScore = 0;
      let analysisText = `General Analysis: $${price.toLocaleString()}`;
      
      if (z <= -this.config.robustZGood) {
        dealScore += 20;
        analysisText += ` | Good deal (${Math.round(savingsPercent)}% below median)`;
      } else if (z >= this.config.robustZBad) {
        dealScore -= 20;
        analysisText += ` | Overpriced (${Math.round(Math.abs(savingsPercent))}% above median)`;
      } else {
        analysisText += ` | Fair price (${Math.round(savingsPercent)}% vs median)`;
      }
      
      return {
        score: dealScore,
        text: analysisText,
        category: 'general',
        savingsPercent: savingsPercent
      };
    }

    // Calculating  percentage savings compared to median price considering the error handlings
    calculateSavingsPercent(price, medianPrice) {
      // Handle edge cases to prevent division by zero or invalid calculations
      if (!medianPrice || medianPrice <= 0) return 0;
      if (!price || price < 0) return 0;
      
      const savings = ((medianPrice - price) / medianPrice) * 100;
      
      // Cap extreme values to prevent display issues
      return Math.max(-999, Math.min(999, savings));
    }

    // Apply highlighting based on analysis results
    applyAnalysisHighlighting(listing, analysisResult) {
      const { score, text, category, savingsPercent } = analysisResult;

      let savingsThreshold = 66;

      switch (category) {
        case "car":
          savingsThreshold = 50;
          break;
        case "electronics":
          savingsThreshold = 55;
          break;
        case "property":
          savingsThreshold = 50;
          break;
        default:
          savingsThreshold = 66;
      }
      
      // Determine highlighting color and message based on score
      let color, message;
      
      if (savingsPercent >= savingsThreshold) {
        color = this.config.highlightColors.potentialScam;
        message = `🚨 Too good to be true (probable scam/inaccurate listed price): ${text}`;
      } else if (score >= 25) {
        color = this.config.highlightColors.goodDeal;
        message = `🔥 EXCELLENT DEAL: ${text}`;
      } else if (score >= 10) {
        color = this.config.highlightColors.goodDeal;
        message = `✅ Good Deal: ${text}`;
      } else if (score >= 0) {
        color = this.config.highlightColors.neutral;
        message = `👍 Fair Deal: ${text}`;
      } else if (score <= -20) {
        color = this.config.highlightColors.overpriced;
        message = `⚠️ Overpriced: ${text}`;
      } else if (score <= -10) {
        color = this.config.highlightColors.overpriced;
        message = `💰 High Price: ${text}`;
      } else {
        color = this.config.highlightColors.neutral;
        message = `📊 ${text}`;
      }
      
      this.highlightListing(listing.element, color, message);
    }

    //  scam detection (keywords + “too-good-to-be-true” relative floor)
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
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
        console.log("Observer disconnected");
      }

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
      this.concerningKeywords = [];
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

      if (elems.length >= 15) {
        this.getProperty(elems);
      } else if (elems.length >= 8) {
        this.attributes["type"] = "vehicle";
        this.getVehicle(elems);
      } else if (elems.length >= 3) {
        this.attributes["type"] = "general";
        this.getGeneral(elems);
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

        const button = target.querySelector('[role="button"]');
        if (button && button.textContent === 'See more') {
          button.style.cssText = 'background:#ffdddd;';
        }

        this.observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if ((mutation.type === 'characterData') &&
                (target.textContent.length > this.attributes["description"].length)) {
              this.attributes["description"] = target.textContent;
              button.style.cssText = '';
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
      this.concerningKeywords = [];
      this.redFlags = [];
      this.conclusion = "";

      if (!this.attributes["user rating"]) {
        this.scamScore += 0.15;
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
          this.scamScore += 0.10;
          this.concerningKeywords.push(t1);
        }
      });

      t2Keywords.forEach((t2) => {
        if (descriptionLower.includes(t2)) {
          this.scamScore += 0.05;
          this.concerningKeywords.push(t2);
          if (t2 === "or best offer" || t2 === "obo") {
            this.redFlags.push("You will likely be pressured to pay more than listed price.");
          }
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
        this.conclusion = "Most likely safe.";
      } else if (this.scamScore <= 0.4) {
        this.conclusion = "Scam possible, proceed with caution.";
      } else {
        this.conclusion = "Scam likely. Use extreme caution or find a different listing.";
      }

      this.displayResults();
    }

    displayResults() {
      const resultsDiv = document.getElementById('analysis-results-container');
      if (!resultsDiv) {
        console.error("Results container not found");
        return;
      }
      resultsDiv.textContent = ""; // Clear previous results

      resultsDiv.innerHTML = `
      <p><strong>Disclaimer:</strong> This does not take price analysis results into consideration. 
      If the price is flagged as too good to be true, it may be a scam.</p>
      <p><strong>Scam Score:</strong> ${(this.scamScore * 100).toFixed(2)}%</p>
      <p><strong>Conclusion:</strong> ${this.conclusion}</p>
      <p><strong>Red Flags:</strong> ${this.redFlags.length > 0 ? this.redFlags.join("; ") : "None"}</p>
      <p><strong>Concerning Keywords:</strong> ${this.concerningKeywords.length > 0 ? this.concerningKeywords.join(", ") : "None"}</p>
    `;
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
        config.minPriceForAnalysis = settings.minPriceForAnalysis || 50;

        listingAnalyzer.config = config; // Update config in analyzers
        listingListAnalyzer.config = config;
      }
    });
  }

  function addScrapeButtons(overlay) {
    const scrapeListingsBtn = document.createElement('button');
    scrapeListingsBtn.textContent = 'Analyze Listing Prices';
    scrapeListingsBtn.id = 'scrape-listings-btn';
    scrapeListingsBtn.style.cssText = baseBtnCss() + 'background:#0b5cff;color:#fff;margin-bottom:8px;display:block;';
    overlay.appendChild(scrapeListingsBtn);
    scrapeListingsBtn.addEventListener('click', scrapeListings);

    const scrapeSingleBtn = document.createElement('button');
    scrapeSingleBtn.textContent = 'Analyze Single Listing';
    scrapeSingleBtn.id = 'scrape-single-btn';
    scrapeSingleBtn.style.cssText = baseBtnCss() + 'background:#0b5cff;color:#fff;margin-bottom:8px;display:block;';
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
      if (listingListAnalyzer) {
        listingListAnalyzer.clearPersistentListings();
        updateStatus('Cleared detected listings.', 'success');
      }
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

  function addHeaderandContainer(resultsDiv) {
    const header = document.createElement('h2');
    header.textContent = 'Analysis Results';
    resultsDiv.appendChild(header);

    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'analysis-results-container';
    resultsContainer.style.cssText = 
      `padding:10px;width:300px;border:1px solid #ccc;background-color:#f9f9f9;`;
    resultsContainer.textContent = 'No results available yet.';
    resultsDiv.appendChild(resultsContainer);
  }

  function addToggleBtns(resultsDiv) {
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Toggle Results';
    toggleBtn.id = 'results-toggle-btn';
    toggleBtn.style.cssText = baseBtnCss() + 'background:#0b5cff;color:#fff;margin-left:10px;margin-bottom:10px;margin-top:4px;';
    resultsDiv.appendChild(toggleBtn);
    toggleBtn.addEventListener('click', () => {
      resultsDiv.style.display = resultsDiv.style.display === 'none' ? 'block' : 'none';
      const reopenTab = document.getElementById('results-reopen-tab');
      if (reopenTab) reopenTab.style.display = resultsDiv.style.display === 'none' ? 'block' : 'none';
    });

    const reopenTab = document.createElement('button');
    reopenTab.textContent = 'Results';
    reopenTab.id = 'results-reopen-tab';
    reopenTab.style.cssText = `
    position: fixed; bottom: 12px; left: 12px; z-index: 2147483647;
    background:#0b5cff;color:#fff;border:none;border-radius:6px;padding:6px 10px;
    box-shadow:0 4px 12px rgba(0,0,0,.18); font:12px system-ui,sans-serif;
    display: none;
  `;
    document.body.appendChild(reopenTab);
    reopenTab.addEventListener('click', () => {
      resultsDiv.style.display = 'block';
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

    const analysisResults = document.createElement('div');
    analysisResults.id = 'marketplace-analyzer-results';
    analysisResults.style.cssText = `
    position: fixed; bottom: 12px; left: 12px; z-index: 2147483647;
    background:#fff; border:1px solid #ddd; border-radius:10px; padding:12px;
    box-shadow:0 6px 20px rgba(0,0,0,.15); font:13px/1.35 system-ui,sans-serif;
    min-width: 220px;
  `;
    document.body.appendChild(analysisResults);

    addScrapeButtons(overlay); // Add overlay components
    addStatus(overlay);
    addQoLFeatures(overlay);


    addHeaderandContainer(analysisResults);
    addToggleBtns(analysisResults);
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
    const resultsDiv = document.getElementById('analysis-results-container');
    resultsDiv.innerHTML = '';
    resultsDiv.textContent = 'No results available yet.';
    // Clear results first

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

    try {
      listingListAnalyzer.scrapeListingsWithPersistence();
      listingListAnalyzer.observeListings();
      updateStatus("Success! Observer is active. Scroll to load more listings.", "success");
      console.log('All detected listings:', listingListAnalyzer.allDetectedListings);
    } catch (error) {
      console.error('Error scraping listings:', error);
      updateStatus('Try refreshing the page. If that does not work, please contact us.', 'error');
    }
  }

  function scrapeSingleListing() {
    if (!document.URL.includes("/item/")) {
      const errorMsg = 'Not on a single listing page. Please navigate to a specific Facebook Marketplace listing.';
      updateStatus(errorMsg, "error");
      return;
    }

    try {
      listingAnalyzer.analyzeSingleListing();
      updateStatus("Single listing analyzed.", "success");
      console.log(listingAnalyzer.getConclusion());
      console.log(listingAnalyzer.getRedFlags());
      console.log(listingAnalyzer.getScamScore());
    } catch (error) {
      console.error('Error analyzing single listing:', error);
      updateStatus('Try refreshing the page. If that does not work, please contact us.', 'error');
    }
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
