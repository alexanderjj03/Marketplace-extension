import {median, highlightListing} from './utils.js';

export class noAIAnalyzer {

  constructor(scraper) {
    this.scraper = scraper;
  }

  // Enhanced price analysis with category-specific formulas (made up formulas for now lol!!) for better deal detection
  analyzeAllListingsPrices(curListings) {
    const prices = this.scraper.allDetectedListings
      .map(i => i.price)
      .filter(p => p > this.scraper.config.minPriceForAnalysis);

    if (prices.length < 5) return;

    // Basic statistical analysis for general pricing context
    const med = median(prices);
    const mad = median(prices.map(p => Math.abs(p - med))) || 1; 

    // Detect category (based off of currentKeyword)
    const category = this.detectListingCategory(this.scraper.currentKeyword);

    let priceNormalizedListings = [];
    if (category === 'car') {
      priceNormalizedListings = this.preprocessCarListings();
      console.log("Normalized: ", priceNormalizedListings);
    } // Preprocess car listings

    curListings.forEach((listing) => {
      if (listing.price < this.scraper.config.minPriceForAnalysis) return;
      
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
    for (const listing of this.scraper.allDetectedListings) {
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

      let multiplier = ((mileageInKms > 0 ? Math.pow(2, mileageInKms/130000) : 1.5) * (year ? Math.pow(1.06, (new Date().getFullYear() - year)) : 1.5));

      // Modify the price in place based on year and mileage for normalization
      let adjustedPrice = price * Math.min(multiplier, 40);

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
      .filter(p => p > this.scraper.config.minPriceForAnalysis);
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
    
    if (z <= -this.scraper.config.robustZGood) {
      dealScore += 20;
      analysisText += ` | Good deal (${Math.round(savingsPercent)}% below median)`;
    } else if (z >= this.scraper.config.robustZBad) {
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
      color = this.scraper.config.highlightColors.potentialScam;
      message = `🚨 Too good to be true (probable scam/inaccurate listed price): ${text}`;
    } else if (score >= 25) {
      color = this.scraper.config.highlightColors.goodDeal;
      message = `🔥 EXCELLENT DEAL: ${text}`;
    } else if (score >= 10) {
      color = this.scraper.config.highlightColors.goodDeal;
      message = `✅ Good Deal: ${text}`;
    } else if (score >= 0) {
      color = this.scraper.config.highlightColors.neutral;
      message = `👍 Fair Deal: ${text}`;
    } else if (score <= -20) {
      color = this.scraper.config.highlightColors.overpriced;
      message = `⚠️ Overpriced: ${text}`;
    } else if (score <= -10) {
      color = this.scraper.config.highlightColors.overpriced;
      message = `💰 High Price: ${text}`;
    } else {
      color = this.scraper.config.highlightColors.neutral;
      message = `📊 ${text}`;
    }
    
    highlightListing(listing.element, color, message);
  }

  //  scam detection (keywords + “too-good-to-be-true” relative floor)
  detectPotentialScams() {
    const baselinePrices = this.scraper.allDetectedListings
      .map(i => i.price)
      .filter(p => p > this.scraper.config.minPriceForAnalysis);

    const haveBaseline = baselinePrices.length >= 5;
    const med = haveBaseline ? median(baselinePrices) : null;

    this.scraper.allDetectedListings.forEach(item => {
      const title = String(item.title || "").toLowerCase();
      const keywordHit = this.scraper.config.scamKeywords.some(kw => title.includes(kw));
      const suspiciousPrice = this.isSuspiciousPrice(item.price, title, med);

      if (keywordHit || suspiciousPrice) {
        highlightListing(
          item.element,
          this.scraper.config.highlightColors.potentialScam,
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
}