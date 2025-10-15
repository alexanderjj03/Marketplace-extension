// Marketplace Scraper Popup Script
document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const toggleOverlayBtn = document.getElementById('toggleOverlay');
    const userGuideBtn = document.getElementById('userGuide');
    const settingsBtn = document.getElementById('settings');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const pageTitle = document.getElementById('pageTitle');
    const pageUrl = document.getElementById('pageUrl');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    // Initialize popup
    initializePopup();

    // Event listeners
    toggleOverlayBtn.addEventListener('click', toggleOverlay);
    userGuideBtn.addEventListener('click', openUserGuide);
    settingsBtn.addEventListener('click', openSettings);
    saveSettingsBtn.addEventListener('click', saveSettings);

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

            // Load saved settings
            const result = await chrome.storage.sync.get(['marketplaceColorSettings']);
            if (result.marketplaceColorSettings) {
                const settings = result.marketplaceColorSettings;
                document.getElementById('goodDealColor').value = settings.goodDealColor || '#00ff00';
                document.getElementById('avgDealColor').value = settings.avgDealColor || '#ffff00';
                document.getElementById('overpricedColor').value = settings.overpricedColor || '#ffb300';
                document.getElementById('scamColor').value = settings.scamColor || '#ff0000';
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

    async function openUserGuide() {
        try {
            const guideUrl = 'https://github.com/alexanderjj03/Marketplace-extension/blob/main/UserGuide.md'; // User guide link
            await chrome.tabs.create({ url: guideUrl });
        } catch (error) {
            console.error('Error opening user guide:', error);
            updateStatus('Failed to open user guide', 'error');
        }
    }

    async function openSettings() {
        const settingsSection = document.getElementById('settingsSection');
        settingsSection.style.display = settingsSection.style.display === 'none' ? 'block' : 'none';
    }

    async function saveSettings() {
        try {
            const goodDealColor = document.getElementById('goodDealColor');
            const avgDealColor = document.getElementById('avgDealColor');
            const overpricedColor = document.getElementById('overpricedColor');
            const scamColor = document.getElementById('scamColor');

            const settings = {
                goodDealColor: goodDealColor.value,
                avgDealColor: avgDealColor.value,
                overpricedColor: overpricedColor.value,
                scamColor: scamColor.value
            };

            await chrome.storage.sync.set({ marketplaceColorSettings: settings });
        } catch (error) {
            console.error('Error saving settings:', error);
            updateStatus('Failed to save settings', 'error');
            return;
        }
        const settingsSection = document.getElementById('settingsSection');
        settingsSection.style.display = 'none';
        updateStatus('Settings saved successfully, refresh the page for them to take effect.', 'success');
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
