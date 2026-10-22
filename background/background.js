// Background Service Worker

const DEFAULT_SETTINGS = {
  speed: 1.0,
  step: 0.1,
  rememberSpeed: true,
  hudEnabled: true,
  overlayEnabled: true,
  extensionDisabled: false,
  filters: {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    invert: false
  }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
    chrome.storage.local.set(items);
    updateBadge(items.speed, items.extensionDisabled);
  });
});

function updateBadge(speed, disabled) {
  if (disabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#666666' });
    return;
  }
  if (!speed || Math.abs(parseFloat(speed) - 1.0) < 0.01) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    const num = parseFloat(parseFloat(speed).toFixed(2));
    const text = num % 1 === 0 ? `${num}x` : `${num}`;
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    chrome.storage.local.get(['speed', 'extensionDisabled'], (items) => {
      updateBadge(items.speed, items.extensionDisabled);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'UPDATE_BADGE') {
    chrome.storage.local.get(['extensionDisabled'], (items) => {
      updateBadge(request.speed, items.extensionDisabled);
    });
    sendResponse({ success: true });
  }
  return true;
});
