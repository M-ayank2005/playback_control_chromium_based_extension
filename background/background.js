// Background Service Worker for JioHotstar Speed & Playback Controller

const DEFAULT_SETTINGS = {
  speed: 1.0,
  step: 0.1,
  rememberSpeed: true,
  hudEnabled: true,
  hotkeysEnabled: true,
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
    chrome.action.setBadgeBackgroundColor({ color: '#06B6D4' }); // Cyan glow accent
  }
}

// Listen for storage updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.speed) {
    updateBadge(changes.speed.newValue);
  }
});

// Listen for keyboard command hotkeys defined in manifest
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  chrome.tabs.sendMessage(tab.id, { type: 'KEYBOARD_COMMAND', command }, (res) => {
    if (chrome.runtime.lastError) {
      // Content script might not be loaded on this page
    }
  });
});

// Listen for popup or content script messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'UPDATE_BADGE') {
    updateBadge(request.speed);
    sendResponse({ success: true });
  }
  return true;
});
