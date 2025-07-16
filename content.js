// Facebook Marketplace Scraper - Content Script
// This script runs on Facebook Marketplace pages

console.log('Facebook Marketplace Scraper: Content script loaded');

// Initialize scraper
initializeMarketplaceScraper();

function initializeMarketplaceScraper() {
    // Add custom styles for highlighting
    addCustomStyles();
    
    // Set up message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Marketplace scraper received message:', message);
        
        switch (message.action) {
            case 'scrapeListings':
                scrapeMarketplaceListings().then(data => sendResponse(data));
                return true;
            case 'scrapeSingleListing':
                scrapeSingleListing().then(data => sendResponse(data));
                return true;
            case 'extractFilters':
                extractMarketplaceFilters().then(data => sendResponse(data));
                return true;
            case 'highlightPrices':
                highlightPriceElements();
                break;
            default:
                console.log('Unknown action:', message.action);
        }
    });
}

function addCustomStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .marketplace-highlight {
            background-color: rgba(255, 255, 0, 0.3) !important;
            border: 2px solid #ffd700 !important;
            transition: all 0.3s ease;
        }
        
        .marketplace-highlight:hover {
            background-color: rgba(255, 255, 0, 0.5) !important;
            transform: scale(1.02);
        }
        
        .extension-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        }
    `;
    document.head.appendChild(style);
}

async function scrapeMarketplaceListings() {
    const listings = [];
    
    try {
        // Wait for content to load
        await waitForElement('[data-testid="marketplace_feed_item"]');
        
        // Find all listing containers
        const listingElements = document.querySelectorAll('[data-testid="marketplace_feed_item"]');
        
        listingElements.forEach((element, index) => {
            try {
                const listing = extractListingData(element);
                if (listing) {
                    listings.push(listing);
                }
            } catch (error) {
                console.error(`Error extracting listing ${index}:`, error);
            }
        });
        
        console.log(`Scraped ${listings.length} listings`);
        showNotification(`Scraped ${listings.length} listings`, 'success');
        
    } catch (error) {
        console.error('Error scraping listings:', error);
        showNotification('Error scraping listings', 'error');
    }
    
    return {
        listings,
        timestamp: Date.now(),
        url: window.location.href
    };
}

function extractListingData(element) {
    try {
        // Extract title
        const titleElement = element.querySelector('a[href*="/marketplace/item/"] span');
        const title = titleElement ? titleElement.textContent.trim() : '';
        
        // Extract price
        const priceElement = element.querySelector('[data-testid="marketplace_pdp_price"] span, span[dir="auto"]');
        const price = priceElement ? priceElement.textContent.trim() : '';
        
        // Extract location
        const locationElement = element.querySelector('[data-testid="marketplace_pdp_location"] span, span[dir="auto"]');
        const location = locationElement ? locationElement.textContent.trim() : '';
        
        // Extract image URL
        const imageElement = element.querySelector('img');
        const imageUrl = imageElement ? imageElement.src : '';
        
        // Extract link
        const linkElement = element.querySelector('a[href*="/marketplace/item/"]');
        const link = linkElement ? linkElement.href : '';
        
        // Extract description (if available)
        const descElement = element.querySelector('[data-testid="marketplace_pdp_description"] span');
        const description = descElement ? descElement.textContent.trim() : '';
        
        return {
            title,
            price,
            location,
            imageUrl,
            link,
            description,
            scrapedAt: Date.now()
        };
    } catch (error) {
        console.error('Error extracting listing data:', error);
        return null;
    }
}

async function scrapeSingleListing() {
    try {
        // Check if we're on a single listing page
        if (!window.location.href.includes('/marketplace/item/')) {
            throw new Error('Not on a single listing page');
        }
        
        const listing = {
            title: extractText('[data-testid="marketplace_pdp_title"] span, h1'),
            price: extractText('[data-testid="marketplace_pdp_price"] span'),
            location: extractText('[data-testid="marketplace_pdp_location"] span'),
            description: extractText('[data-testid="marketplace_pdp_description"] span'),
            seller: extractText('[data-testid="marketplace_pdp_seller_name"] span'),
            images: extractImages(),
            attributes: extractAttributes(),
            url: window.location.href,
            scrapedAt: Date.now()
        };
        
        console.log('Scraped single listing:', listing);
        showNotification('Listing data extracted', 'success');
        
        return listing;
        
    } catch (error) {
        console.error('Error scraping single listing:', error);
        showNotification('Error extracting listing data', 'error');
        return null;
    }
}

function extractText(selector) {
    const element = document.querySelector(selector);
    return element ? element.textContent.trim() : '';
}

function extractImages() {
    const images = [];
    const imageElements = document.querySelectorAll('[data-testid="marketplace_pdp_image"] img, .marketplace-pdp-image img');
    
    imageElements.forEach(img => {
        if (img.src) {
            images.push(img.src);
        }
    });
    
    return images;
}

function extractAttributes() {
    const attributes = {};
    
    // Look for attribute elements (condition, brand, etc.)
    const attrElements = document.querySelectorAll('[data-testid*="marketplace_pdp_attribute"] span');
    
    attrElements.forEach(element => {
        const text = element.textContent.trim();
        if (text.includes(':')) {
            const [key, value] = text.split(':').map(s => s.trim());
            attributes[key] = value;
        }
    });
    
    return attributes;
}

async function extractMarketplaceFilters() {
    try {
        const filters = {
            category: extractText('[data-testid="marketplace_category_filter"] span'),
            priceRange: extractText('[data-testid="marketplace_price_filter"] span'),
            location: extractText('[data-testid="marketplace_location_filter"] span'),
            condition: extractText('[data-testid="marketplace_condition_filter"] span'),
            url: window.location.href
        };
        
        console.log('Extracted filters:', filters);
        return filters;
        
    } catch (error) {
        console.error('Error extracting filters:', error);
        return null;
    }
}

function highlightPriceElements() {
    try {
        const priceElements = document.querySelectorAll('[data-testid="marketplace_pdp_price"] span, span[dir="auto"]');
        
        priceElements.forEach(element => {
            element.classList.add('marketplace-highlight');
            
            setTimeout(() => {
                element.classList.remove('marketplace-highlight');
            }, 3000);
        });
        
        console.log(`Highlighted ${priceElements.length} price elements`);
        showNotification(`Highlighted ${priceElements.length} prices`, 'info');
        
    } catch (error) {
        console.error('Error highlighting prices:', error);
    }
}

function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }
        
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'extension-notification';
    
    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
            break;
        case 'warning':
            notification.style.background = 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Auto-scrape when page loads (optional)
document.addEventListener('DOMContentLoaded', () => {
    console.log('Facebook Marketplace page loaded');
    
    // Auto-scrape after a delay to let content load
    setTimeout(() => {
        if (window.location.href.includes('facebook.com/marketplace')) {
            console.log('Auto-scraping marketplace data...');
            scrapeMarketplaceListings();
        }
    }, 3000);
});

// Listen for page changes (for SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log('URL changed, re-initializing scraper');
        
        if (url.includes('facebook.com/marketplace')) {
            setTimeout(() => {
                scrapeMarketplaceListings();
            }, 2000);
        }
    }
}).observe(document, { subtree: true, childList: true });
