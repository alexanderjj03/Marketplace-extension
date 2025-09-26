// content.js — Facebook Marketplace Analyzer (MV3 content script)

// ===== Config & State =====
const config = {
  highlightColors: {
    goodDeal: 'rgba(0, 255, 0, 0.2)',
    potentialScam: 'rgba(255, 0, 0, 0.2)',
    overpriced: 'rgba(255, 255, 0, 0.2)'
  },
  robustZGood: 1.8,
  robustZBad: 1.8,
  minPriceForAnalysis: 50,
  scamKeywords: ['urgent', 'must sell', 'cash only', 'no returns']
};

let overlayVisible = true;
let listingAnalyzer = null;
let listingListAnalyzer = null;

// ===== Boot (dynamic imports; no bundler needed) =====
(async () => {
  try {
    const [{ ListingListAnalyzer }, { ListingAnalyzer }] = await Promise.all([
      import(chrome.runtime.getURL('src_alex/analyzeListings.js')),
      import(chrome.runtime.getURL('src_alex/analyzeSingleListing.js')),
    ]);

    listingAnalyzer = new ListingAnalyzer(config);
    listingListAnalyzer = new ListingListAnalyzer(config);

    checkReadyState();
  } catch (e) {
    console.error('[Analyzer] Failed to load modules:', e);
  }
})();

// ===== Overlay UI =====
function initOverlay() {
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

  const listingsCounter = document.createElement('div');
  listingsCounter.id = 'listings-counter';
  listingsCounter.textContent = 'Detected Listings: 0';
  listingsCounter.style.cssText = 'font-size:13px;color:#333;';
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
  toggleBtn.style.cssText = baseBtnCss() + 'margin-left:10px;';
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

function baseBtnCss() {
  return `background:#f5f5f5;border:1px solid #ccc;border-radius:6px;padding:6px 10px;cursor:pointer;`;
}

// ===== Init =====
function checkReadyState() {
  if (document.readyState !== 'loading') {
    initOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', initOverlay, { once: true });
  }
}

// ===== Message Handling (popup/background) =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'toggle_extension') {
      overlayVisible = !overlayVisible;
      const panel = document.getElementById('marketplace-analyzer-overlay');
      const tab = document.getElementById('analyzer-reopen-tab');
      if (panel) panel.style.display = overlayVisible ? 'block' : 'none';
      if (tab) tab.style.display = overlayVisible ? 'none' : 'block';
      sendResponse({ success: true, visible: overlayVisible });
      return true;
    }

    if (request.action === 'scrapeListings') {
      if (!listingListAnalyzer) {
        sendResponse({ success: false, error: 'Analyzer not initialized yet.' });
        return true;
      }

      const side = document.querySelector('[aria-label="Marketplace sidebar"]');
      if (!side) {
        sendResponse({ success: false, error: 'Marketplace sidebar not found. Open a Marketplace search page.' });
        return true;
      }

      const search = side.querySelector('input[aria-label="Search Marketplace"]');
      if (!search) {
        sendResponse({ success: false, error: 'Search input not found. Perform a search first.' });
        return true;
      }

      const kw = String(search.value || '').trim().toLowerCase();
      if (!kw) {
        sendResponse({ success: false, error: 'No search keyword found. Please search for an item first.' });
        return true;
      }

      const prevKw = listingListAnalyzer.currentKeyword || '';
      listingListAnalyzer.setKeywordFilter(kw);
      if (prevKw !== kw) listingListAnalyzer.clearPersistentListings();

      listingListAnalyzer.scrapeListingsWithPersistence();
      listingListAnalyzer.observeListings();

      sendResponse({
        success: true,
        data: listingListAnalyzer.allDetectedListings,
        count: listingListAnalyzer.allDetectedListings.length
      });
      return true;
    }

    if (request.action === 'scrapeSingleListing') {
      if (!listingAnalyzer) {
        sendResponse({ success: false, error: 'Analyzer not initialized yet.' });
        return true;
      }
      listingAnalyzer.analyzeSingleListing();
      sendResponse({
        success: true,
        conclusion: listingAnalyzer.getConclusion(),
        flags: listingAnalyzer.getRedFlags(),
        scamScore: listingAnalyzer.getScamScore()
      });
      return true;
    }
  } catch (err) {
    console.error('[Analyzer] onMessage error:', err);
    try { sendResponse({ success: false, error: String(err && err.message || err) }); } catch {}
    return true;
  }
});
