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

  // Enhanced price analysis with category-specific formulas (made up formulas for now lol!!) for better deal detection
  analyzeAllListingsPrices(curListings) {
    const prices = this.allDetectedListings
      .map(i => i.price)
      .filter(p => p > this.config.minPriceForAnalysis);

    if (prices.length < 5) return;

    // Basic statistical analysis for general pricing context
    const med = median(prices);
    const mad = median(prices.map(p => Math.abs(p - med))) || 1;

    curListings.forEach((listing) => {
      if (listing.price < this.config.minPriceForAnalysis) return;

      // Detect listing category for specialized analysis 
      const category = this.detectListingCategory(listing.title);
      
      // Get category-specific analysis results
      const analysisResult = this.analyzeCategorySpecificPrice(listing, category, med, mad);
      
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
      'automatic', 'manual', 'transmission', 'engine', 'v6', 'v8', 'hybrid', 'electric'
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
    if (carScore >= 2) return 'car';
    if (electronicsScore >= 2) return 'electronics';
    if (propertyScore >= 2) return 'property';
    
    return 'general';
  }

  // Category-specific price analysis with some formulas
  analyzeCategorySpecificPrice(listing, category, medianPrice, mad) {
    const price = listing.price;
    const title = String(listing.title || "").toLowerCase();
    
    switch (category) {
      case 'car':
        return this.analyzeCarPrice(price, title, medianPrice);
      case 'electronics':
        return this.analyzeElectronicsPrice(price, title, medianPrice);
      case 'property':
        return this.analyzePropertyPrice(price, title, medianPrice);
      default:
        return this.analyzeGeneralPrice(price, medianPrice, mad);
    }
  }

  // Car price analysis considering year, mileage and market factors 
  analyzeCarPrice(price, title, medianPrice) {
    // Input validation for errors
    if (!price || price <= 0 || !medianPrice || medianPrice <= 0) {
      return {
        score: 0,
        text: `Car Analysis: Invalid price data`,
        category: 'car',
        savingsPercent: 0
      };
    }
    
    // Extract year from title (look for 4-digit years)
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0]) : null;
    
    // Extract mileage (look for numbers followed by miles/mileage)
    const mileageMatch = title.match(/(\d{1,3}(?:,\d{3})*)\s*(?:miles?|mileage)/i);
    const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : null;
    
    let dealScore = 0;
    let analysisText = `Car Analysis: $${price.toLocaleString()}`;
    
    // Year-based analysis (cars  ~15-20% per year( if we consider) )
    if (year) {
      const currentYear = new Date().getFullYear();
      const age = currentYear - year;
      
      if (age <= 2) {
        // Newer cars should be closer to market value
        if (price < medianPrice * 0.7) {
          dealScore += 30;
          analysisText += ` | Great deal for ${year} model`;
        } else if (price > medianPrice * 1.3) {
          dealScore -= 20;
          analysisText += ` | Overpriced for ${year} model`;
        }
      } else if (age <= 5) {
        // Mid-age cars - sweet spot for deals
        if (price < medianPrice * 0.6) {
          dealScore += 25;
          analysisText += ` | Good deal for ${year} model`;
        }
      } else if (age > 10) {
        // Older cars - very price sensitive
        if (price < medianPrice * 0.4) {
          dealScore += 20;
          analysisText += ` | Excellent deal for ${year} model`;
        } else if (price > medianPrice * 0.8) {
          dealScore -= 25;
          analysisText += ` | Overpriced for ${year} model`;
        }
      }
    }
    
    // Mileage-based analysis (high mileage = lower value)
    if (mileage) {
      const mileagePerYear = year ? mileage / (new Date().getFullYear() - year) : null;
      
      if (mileagePerYear && mileagePerYear > 15000) {
        // High mileage - should be cheaper
        if (price < medianPrice * 0.5) {
          dealScore += 15;
          analysisText += ` | Good price for high mileage (${mileage.toLocaleString()} mi)`;
        } else {
          dealScore -= 10;
          analysisText += ` | High mileage (${mileage.toLocaleString()} mi) - consider lower price`;
        }
      } else if (mileagePerYear && mileagePerYear < 8000) {
        // Low mileage - premium justified
        if (price < medianPrice * 1.2) {
          dealScore += 10;
          analysisText += ` | Low mileage bonus (${mileage.toLocaleString()} mi)`;
        }
      }
    }
    
    // Brand-specific adjustments
    const luxuryBrands = ['bmw', 'mercedes', 'audi', 'lexus', 'infiniti', 'acura'];
    const hasLuxuryBrand = luxuryBrands.some(brand => title.includes(brand));
    
    if (hasLuxuryBrand) {
      // Luxury cars have higher maintenance costs, adjust expectations
      if (price < medianPrice * 0.6) {
        dealScore += 20;
        analysisText += ` | Great luxury car deal`;
      } else if (price > medianPrice * 1.4) {
        dealScore -= 15;
        analysisText += ` | Luxury car - consider maintenance costs`;
      }
    }
    
    return {
      score: dealScore,
      text: analysisText,
      category: 'car',
      savingsPercent: this.calculateSavingsPercent(price, medianPrice)
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
    if (title.includes('playstation') || title.includes('ps5') || title.includes('xbox')) {
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
      dealScore += 5;
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
    
    // Extract square footage if available
    const sqftMatch = title.match(/(\d{1,4})\s*(?:sqft|sq\.?\s*ft|square\s*feet)/i);
    const sqft = sqftMatch ? parseInt(sqftMatch[1]) : null;
    
    // Price per square foot analysis
    if (sqft && sqft > 0) {
      const pricePerSqft = price / sqft;
      
      // General price per sqft thresholds (varies by location, but good baseline)
      if (pricePerSqft < 0.8) {
        dealScore += 25;
        analysisText += ` | Excellent price per sqft ($${pricePerSqft.toFixed(2)}/sqft)`;
      } else if (pricePerSqft < 1.2) {
        dealScore += 10;
        analysisText += ` | Good price per sqft ($${pricePerSqft.toFixed(2)}/sqft)`;
      } else if (pricePerSqft > 2.0) {
        dealScore -= 20;
        analysisText += ` | High price per sqft ($${pricePerSqft.toFixed(2)}/sqft)`;
      }
    }
    
    // Property type analysis
    if (title.includes('studio')) {
      // Studios typically cheaper
      if (price < medianPrice * 0.7) {
        dealScore += 15;
        analysisText += ` | Good studio deal`;
      }
    } else if (title.includes('house') || title.includes('townhouse')) {
      // Houses typically more expensive
      if (price < medianPrice * 0.8) {
        dealScore += 20;
        analysisText += ` | Great house deal`;
      } else if (price > medianPrice * 1.4) {
        dealScore -= 15;
        analysisText += ` | House overpriced`;
      }
    }
    
    // Location-based adjustments (simplified)
    const premiumLocations = ['downtown', 'city center', 'waterfront', 'beach'];
    const hasPremiumLocation = premiumLocations.some(loc => title.includes(loc));
    
    if (hasPremiumLocation) {
      // Premium locations justify higher prices
      if (price < medianPrice * 1.2) {
        dealScore += 15;
        analysisText += ` | Good premium location deal`;
      }
    } else {
      // Non-premium locations should be cheaper
      if (price < medianPrice * 0.6) {
        dealScore += 20;
        analysisText += ` | Excellent suburban deal`;
      }
    }
    
    // Furnishing analysis
    if (title.includes('furnished')) {
      // Furnished properties cost more but add value
      if (price < medianPrice * 1.1) {
        dealScore += 10;
        analysisText += ` | Good furnished deal`;
      }
    } else if (title.includes('unfurnished')) {
      // Unfurnished should be cheaper
      if (price < medianPrice * 0.8) {
        dealScore += 15;
        analysisText += ` | Good unfurnished deal`;
      }
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
    
    // Determine highlighting color and message based on score
    let color, message;
    
    if (score >= 25) {
      color = this.config.highlightColors.goodDeal;
      message = `🔥 EXCELLENT DEAL: ${text}`;
    } else if (score >= 15) {
      color = this.config.highlightColors.goodDeal;
      message = `✅ Good Deal: ${text}`;
    } else if (score >= 5) {
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
