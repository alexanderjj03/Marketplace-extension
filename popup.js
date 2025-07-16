// Popup script for Chrome extension
document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const actionBtn = document.getElementById('actionBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const pageTitle = document.getElementById('pageTitle');
    const pageUrl = document.getElementById('pageUrl');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    // Initialize popup
    initializePopup();

    // Event listeners
    actionBtn.addEventListener('click', performAction);
    settingsBtn.addEventListener('click', openSettings);

    async function initializePopup() {
        try {
            // Get current tab information
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab) {
                pageTitle.textContent = tab.title || 'No title';
                pageUrl.textContent = tab.url || 'No URL';
            }

            // Load extension status
            loadExtensionStatus();
            
        } catch (error) {
            console.error('Error initializing popup:', error);
            pageTitle.textContent = 'Error loading page info';
            pageUrl.textContent = 'Check console for details';
        }
    }

    async function performAction() {
        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab) {
                // Send message to content script
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'performAction',
                    data: { timestamp: Date.now() }
                });

                // Show success feedback
                actionBtn.textContent = 'Action Performed!';
                actionBtn.style.background = 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)';
                
                setTimeout(() => {
                    actionBtn.textContent = 'Perform Action';
                    actionBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                }, 2000);
            }
        } catch (error) {
            console.error('Error performing action:', error);
            actionBtn.textContent = 'Error!';
            actionBtn.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
            
            setTimeout(() => {
                actionBtn.textContent = 'Perform Action';
                actionBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            }, 2000);
        }
    }

    function openSettings() {
        // Open settings page or show settings modal
        chrome.runtime.openOptionsPage();
    }

    async function loadExtensionStatus() {
        try {
            // Check if extension is active
            const status = await chrome.storage.local.get(['extensionStatus']);
            const isActive = status.extensionStatus !== false; // Default to true
            
            if (isActive) {
                statusDot.classList.add('active');
                statusText.textContent = 'Active';
            } else {
                statusDot.classList.remove('active');
                statusText.textContent = 'Inactive';
            }
        } catch (error) {
            console.error('Error loading status:', error);
            statusText.textContent = 'Error';
        }
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'statusUpdate') {
            loadExtensionStatus();
        }
    });
}); 