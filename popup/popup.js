// Popup Controller Logic for JioHotstar Speed & Playback Extension

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  const speedDisplay = document.getElementById('speedDisplay');
  const statusPill = document.getElementById('videoStatusPill');
  const statusText = document.getElementById('videoStatusText');

  const btnMinus05 = document.getElementById('btnMinus05');
  const btnMinus01 = document.getElementById('btnMinus01');
  const btnReset = document.getElementById('btnReset');
  const btnPlus01 = document.getElementById('btnPlus01');
  const btnPlus05 = document.getElementById('btnPlus05');

  const presetChips = document.querySelectorAll('.preset-chip');
  const customSpeedInput = document.getElementById('customSpeedInput');
  const btnApplyCustom = document.getElementById('btnApplyCustom');

  const btnSeekRewind = document.getElementById('btnSeekRewind');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnSeekForward = document.getElementById('btnSeekForward');
  const btnTogglePip = document.getElementById('btnTogglePip');
  const btnToggleMute = document.getElementById('btnToggleMute');

  const volumeSlider = document.getElementById('volumeSlider');
  const volumeVal = document.getElementById('volumeVal');

  const brightSlider = document.getElementById('brightSlider');
  const brightVal = document.getElementById('brightVal');
  const contrastSlider = document.getElementById('contrastSlider');
  const contrastVal = document.getElementById('contrastVal');
  const satSlider = document.getElementById('satSlider');
  const satVal = document.getElementById('satVal');
  const invertToggle = document.getElementById('invertToggle');
  const btnResetFilters = document.getElementById('btnResetFilters');

  const rememberSpeedToggle = document.getElementById('rememberSpeedToggle');
  const hudToggle = document.getElementById('hudToggle');
  const hotkeysToggle = document.getElementById('hotkeysToggle');

  let currentActiveTabId = null;
  let activeSpeed = 1.0;

  // 1. Tab Switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
    });
  });

  // Get active tab in window
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // Send message to active tab
  function sendMessageToTab(message, callback) {
    if (!currentActiveTabId) return;
    chrome.tabs.sendMessage(currentActiveTabId, message, (response) => {
      if (chrome.runtime.lastError) {
        // Content script might not be injected or on a chrome:// page
        updateStatus(false, 'No Video Detected');
      } else if (callback) {
        callback(response);
      }
    });
  }

  // Update Status Pill and Display
  function updateStatus(hasVideo, messageText = '') {
    if (hasVideo) {
      statusPill.classList.add('active');
      statusText.textContent = messageText || 'Video Active';
    } else {
      statusPill.classList.remove('active');
      statusText.textContent = messageText || 'No Video Found';
    }
  }

  function updateSpeedUI(speed) {
    activeSpeed = parseFloat(speed);
    speedDisplay.textContent = activeSpeed.toFixed(2);
    customSpeedInput.value = activeSpeed.toFixed(2);

    // Update preset chips highlight
    presetChips.forEach(chip => {
      const chipSpeed = parseFloat(chip.getAttribute('data-speed'));
      if (Math.abs(chipSpeed - activeSpeed) < 0.01) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  // Fetch initial status from page
  const tab = await getActiveTab();
  if (tab) {
    currentActiveTabId = tab.id;
    sendMessageToTab({ type: 'GET_STATUS' }, (res) => {
      if (res) {
        updateStatus(res.hasVideo);
        updateSpeedUI(res.speed);
        if (res.paused !== undefined) {
          btnPlayPause.textContent = res.paused ? '▶️ Play' : '⏸️ Pause';
        }
        if (res.muted !== undefined) {
          btnToggleMute.textContent = res.muted ? '🔊 Unmute' : '🔇 Mute';
        }
        if (res.volume !== undefined) {
          const v = Math.round(res.volume * 100);
          volumeSlider.value = v;
          volumeVal.textContent = `${v}%`;
        }
        if (res.filters) {
          brightSlider.value = res.filters.brightness;
          brightVal.textContent = `${res.filters.brightness}%`;
          contrastSlider.value = res.filters.contrast;
          contrastVal.textContent = `${res.filters.contrast}%`;
          satSlider.value = res.filters.saturation;
          satVal.textContent = `${res.filters.saturation}%`;
          invertToggle.checked = !!res.filters.invert;
        }
        if (res.rememberSpeed !== undefined) rememberSpeedToggle.checked = res.rememberSpeed;
        if (res.hudEnabled !== undefined) hudToggle.checked = res.hudEnabled;
        if (res.hotkeysEnabled !== undefined) hotkeysToggle.checked = res.hotkeysEnabled;
      }
    });
  }

  // Speed Control Actions
  function setSpeed(newSpeed) {
    newSpeed = Math.max(0.1, Math.min(16.0, parseFloat(newSpeed)));
    updateSpeedUI(newSpeed);
    sendMessageToTab({ type: 'SET_SPEED', speed: newSpeed });
  }

  btnMinus05.addEventListener('click', () => setSpeed(activeSpeed - 0.5));
  btnMinus01.addEventListener('click', () => setSpeed(activeSpeed - 0.1));
  btnReset.addEventListener('click', () => setSpeed(1.0));
  btnPlus01.addEventListener('click', () => setSpeed(activeSpeed + 0.1));
  btnPlus05.addEventListener('click', () => setSpeed(activeSpeed + 0.5));

  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const val = parseFloat(chip.getAttribute('data-speed'));
      setSpeed(val);
    });
  });

  btnApplyCustom.addEventListener('click', () => {
    const val = parseFloat(customSpeedInput.value);
    if (!isNaN(val)) setSpeed(val);
  });

  customSpeedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = parseFloat(customSpeedInput.value);
      if (!isNaN(val)) setSpeed(val);
    }
  });

  // Media Playback Actions
  btnPlayPause.addEventListener('click', () => {
    sendMessageToTab({ type: 'TOGGLE_PLAY' }, () => {
      sendMessageToTab({ type: 'GET_STATUS' }, (res) => {
        if (res && res.paused !== undefined) {
          btnPlayPause.textContent = res.paused ? '▶️ Play' : '⏸️ Pause';
        }
      });
    });
  });

  btnSeekRewind.addEventListener('click', () => sendMessageToTab({ type: 'SEEK', seconds: -10 }));
  btnSeekForward.addEventListener('click', () => sendMessageToTab({ type: 'SEEK', seconds: 10 }));
  btnTogglePip.addEventListener('click', () => sendMessageToTab({ type: 'TOGGLE_PIP' }));
  btnToggleMute.addEventListener('click', () => {
    sendMessageToTab({ type: 'GET_STATUS' }, (res) => {
      if (res && res.muted !== undefined) {
        sendMessageToTab({ type: 'SET_VOLUME', volume: res.muted ? 1.0 : 0 });
      }
    });
  });

  volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    volumeVal.textContent = `${val}%`;
    sendMessageToTab({ type: 'SET_VOLUME', volume: val / 100 });
  });

  // Video Filter Sliders
  function updateFilters() {
    const filters = {
      brightness: parseInt(brightSlider.value, 10),
      contrast: parseInt(contrastSlider.value, 10),
      saturation: parseInt(satSlider.value, 10),
      invert: invertToggle.checked
    };
    brightVal.textContent = `${filters.brightness}%`;
    contrastVal.textContent = `${filters.contrast}%`;
    satVal.textContent = `${filters.saturation}%`;

    sendMessageToTab({ type: 'SET_FILTERS', filters });
  }

  brightSlider.addEventListener('input', updateFilters);
  contrastSlider.addEventListener('input', updateFilters);
  satSlider.addEventListener('input', updateFilters);
  invertToggle.addEventListener('change', updateFilters);

  btnResetFilters.addEventListener('click', () => {
    brightSlider.value = 100;
    contrastSlider.value = 100;
    satSlider.value = 100;
    invertToggle.checked = false;
    updateFilters();
  });

  // Settings Toggles
  function updateSettings() {
    const settings = {
      rememberSpeed: rememberSpeedToggle.checked,
      hudEnabled: hudToggle.checked,
      hotkeysEnabled: hotkeysToggle.checked
    };
    chrome.storage.local.set(settings);
    sendMessageToTab({ type: 'UPDATE_SETTINGS', ...settings });
  }

  rememberSpeedToggle.addEventListener('change', updateSettings);
  hudToggle.addEventListener('change', updateSettings);
  hotkeysToggle.addEventListener('change', updateSettings);
});
