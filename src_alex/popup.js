// Marketplace Scraper Popup Script
document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const toggleOverlayBtn = document.getElementById('toggleOverlay');
    const pageTitle = document.getElementById('pageTitle');
    const pageUrl = document.getElementById('pageUrl');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    // Initialize popup
    initializePopup();

    // Event listeners
    toggleOverlayBtn.addEventListener('click', toggleOverlay);

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

    async function toggleOverlay() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'toggle_extension'
                });

                if (response && response.success) {
                    const visibility = response.visible ? 'visible' : 'hidden';
                    updateStatus(`Overlay is now ${visibility}`, 'success');
                } else {
                    updateStatus('Failed to toggle overlay', 'error');
                }
            }
        } catch (error) {
            console.error('Please contact us if this error appears.', error);
            updateStatus('Please contact us if this error appears.', 'error');
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
