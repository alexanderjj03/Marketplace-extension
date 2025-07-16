// Toggle extension on/off
document.getElementById('extensionToggle').addEventListener('change', (e) => {
  chrome.storage.sync.set({ extensionEnabled: e.target.checked }, () => {
    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'TOGGLE_EXTENSION',
        value: e.target.checked
      });
    });
  });
});

// Refresh analysis
document.getElementById('refreshAnalysis').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'REFRESH_ANALYSIS' });
    window.close(); // Close popup after clicking
  });
});

// Load saved state
chrome.storage.sync.get(['extensionEnabled', 'lastScan', 'stats'], (data) => {
  document.getElementById('extensionToggle').checked = data.extensionEnabled !== false;

  if (data.lastScan) {
    document.getElementById('lastScanTime').textContent = new Date(data.lastScan).toLocaleTimeString();
  }

  if (data.stats) {
    document.getElementById('listingsCount').textContent = data.stats.total || 0;
    document.getElementById('scamsCount').textContent = data.stats.scams || 0;
  }
});