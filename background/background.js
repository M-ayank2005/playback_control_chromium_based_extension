// Background Service Worker for JioHotstar Speed & Playback Controller

const DEFAULT_SETTINGS = {
  speed: 1.0,
  step: 0.1,
  rememberSpeed: true,
  hudEnabled: true,
  filters: {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    invert: false
  }
};

// Initialize settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
    chrome.storage.local.set(items);
    updateBadge(items.speed);
  });
});

// Update extension action badge
function updateBadge(speed) {
  if (!speed || speed === 1.0) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    const formatted = parseFloat(speed).toFixed(1).replace('.0', '');
    chrome.action.setBadgeText({ text: `${formatted}x` });
    chrome.action.setBadgeBackgroundColor({ color: '#FF7043' }); // Peach-Coral glow badge
  }
}

// Listen for storage updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.speed) {
    updateBadge(changes.speed.newValue);
  }
});

// Listen for popup or content script messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'UPDATE_BADGE') {
    updateBadge(request.speed);
    sendResponse({ success: true });
  }
  return true;
});
