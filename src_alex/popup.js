// Marketplace Scraper Popup Script
document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const scrapeListingsBtn = document.getElementById('scrapeListingsBtn');
    const scrapeSingleBtn = document.getElementById('scrapeSingleBtn');
    const highlightPricesBtn = document.getElementById('highlightPricesBtn');
    const exportBtn = document.getElementById('exportBtn');
    const pageTitle = document.getElementById('pageTitle');
    const pageUrl = document.getElementById('pageUrl');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const resultsSection = document.getElementById('resultsSection');
    const results = document.getElementById('results');

    // Store scraped data
    let scrapedData = null;

    // Initialize popup
    initializePopup();

    // Event listeners
    scrapeListingsBtn.addEventListener('click', scrapeListings);
    scrapeSingleBtn.addEventListener('click', scrapeSingleListing);
    highlightPricesBtn.addEventListener('click', highlightPrices);
    exportBtn.addEventListener('click', exportData);

    async function initializePopup() {
        try {
            // Get current tab information
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab) {
                pageTitle.textContent = tab.title || 'No title';
                pageUrl.textContent = tab.url || 'No URL';
                
                // Check if we're on Facebook Marketplace
                if (tab.url && tab.url.includes('facebook.com/marketplace')) {
                    statusText.textContent = 'Marketplace Detected';
                    statusDot.classList.add('active');
                } else {
                    statusText.textContent = 'Not on Marketplace';
                    statusDot.classList.remove('active');
                }
            }

        } catch (error) {
            console.error('Error initializing popup:', error);
            pageTitle.textContent = 'Error loading page info';
            pageUrl.textContent = 'Check console for details';
        }
    }

    async function scrapeListings() {
        try {
            updateStatus('Scraping listings...', 'loading');
            
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab) {
                // Send message to content script
                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'scrapeListings'
                });

                if (response && response.listings) {
                    scrapedData = response;
                    displayResults(response);
                    updateStatus(`Scraped ${response.listings.length} listings`, 'success');
                } else {
                    updateStatus('No listings found', 'error');
                }
            }
        } catch (error) {
            console.error('Error scraping listings:', error);
            updateStatus('Error scraping listings', 'error');
        }
    }

    async function scrapeSingleListing() {
        try {
            updateStatus('Scraping single listing...', 'loading');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab) {
                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'scrapeSingleListing'
                });

                if (response) {
                    scrapedData = response;
                    displayResults(response);
                    updateStatus('Single listing scraped', 'success');
                } else {
                    updateStatus('Not on a listing page', 'error');
                }
            }
        } catch (error) {
            console.error('Error scraping single listing:', error);
            updateStatus('Error scraping listing', 'error');
        }
    }

    async function highlightPrices() {
        try {
            updateStatus('Highlighting prices...', 'loading');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab) {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'highlightPrices'
                });
                
                updateStatus('Prices highlighted', 'success');
            }
        } catch (error) {
            console.error('Error highlighting prices:', error);
            updateStatus('Error highlighting prices', 'error');
        }
    }

    function displayResults(data) {
        resultsSection.style.display = 'block';
        
        if (data.listings) {
            // Multiple listings
            const html = `
                <div class="results-summary">
                    <p><strong>Scraped ${data.listings.length} listings</strong></p>
                    <p>URL: ${data.url}</p>
                    <p>Timestamp: ${new Date(data.timestamp).toLocaleString()}</p>
                </div>
                <div class="listings-preview">
                    ${data.listings.slice(0, 3).map(listing => `
                        <div class="listing-item">
                            <strong>${listing.title || 'No title'}</strong><br>
                            <span class="price">${listing.price || 'No price'}</span><br>
                            <span class="location">${listing.location || 'No location'}</span>
                        </div>
                    `).join('')}
                    ${data.listings.length > 3 ? `<p>... and ${data.listings.length - 3} more</p>` : ''}
                </div>
            `;
            results.innerHTML = html;
        } else if (data.title) {
            // Single listing
            const html = `
                <div class="results-summary">
                    <p><strong>Single Listing Scraped</strong></p>
                    <p>Title: ${data.title}</p>
                    <p>Price: ${data.price || 'No price'}</p>
                    <p>Location: ${data.location || 'No location'}</p>
                    <p>Seller: ${data.seller || 'No seller info'}</p>
                    <p>Images: ${data.images ? data.images.length : 0}</p>
                </div>
            `;
            results.innerHTML = html;
        }
    }

    function exportData() {
        if (!scrapedData) {
            updateStatus('No data to export', 'error');
            return;
        }

        try {
            const dataStr = JSON.stringify(scrapedData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `marketplace-data-${Date.now()}.json`;
            link.click();
            
            URL.revokeObjectURL(url);
            updateStatus('Data exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting data:', error);
            updateStatus('Error exporting data', 'error');
        }
    }

    function updateStatus(message, type) {
        statusText.textContent = message;
        
        // Update status dot color
        statusDot.classList.remove('active', 'loading', 'error');
        
        switch (type) {
            case 'success':
                statusDot.classList.add('active');
                break;
            case 'loading':
                statusDot.classList.add('loading');
                break;
            case 'error':
                statusDot.classList.add('error');
                break;
            default:
                statusDot.classList.add('active');
        }
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'statusUpdate') {
            updateStatus(message.status, 'success');
        }
    });
});
