// Popup Controller Logic — Speed & Playback Extension

document.addEventListener('DOMContentLoaded', async () => {

  // ── Tab switching ──
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // ── DOM refs ──
  const popupContainer      = document.getElementById('popupContainer');
  const speedDisplay        = document.getElementById('speedDisplay');
  const statusPill          = document.getElementById('videoStatusPill');
  const statusText          = document.getElementById('videoStatusText');

  const btnDisable          = document.getElementById('btnDisable');
  const disableLabel        = document.getElementById('disableLabel');
  const disableDesc         = document.getElementById('disableDesc');

  const btnMinus05          = document.getElementById('btnMinus05');
  const btnMinus01          = document.getElementById('btnMinus01');
  const btnMinus005         = document.getElementById('btnMinus005');
  const btnReset            = document.getElementById('btnReset');
  const btnPlus005          = document.getElementById('btnPlus005');
  const btnPlus01           = document.getElementById('btnPlus01');
  const btnPlus05           = document.getElementById('btnPlus05');

  const stepOptBtns         = document.querySelectorAll('.step-opt-btn');
  let activeStep            = 0.10;

  const presetChips         = document.querySelectorAll('.preset-chip');
  const customSpeedInput    = document.getElementById('customSpeedInput');
  const btnApplyCustom      = document.getElementById('btnApplyCustom');

  const btnSeekBack         = document.getElementById('btnSeekBack');
  const btnPlayPause        = document.getElementById('btnPlayPause');
  const btnSeekFwd          = document.getElementById('btnSeekFwd');
  const btnSeekBack5        = document.getElementById('btnSeekBack5');
  const btnSeekFwd5         = document.getElementById('btnSeekFwd5');
  const btnTogglePip        = document.getElementById('btnTogglePip');
  const btnToggleMute       = document.getElementById('btnToggleMute');
  const btnFullscreen       = document.getElementById('btnFullscreen');

  const volumeSlider        = document.getElementById('volumeSlider');
  const volumeVal           = document.getElementById('volumeVal');

  const brightSlider        = document.getElementById('brightSlider');
  const brightVal           = document.getElementById('brightVal');
  const contrastSlider      = document.getElementById('contrastSlider');
  const contrastVal         = document.getElementById('contrastVal');
  const satSlider           = document.getElementById('satSlider');
  const satVal              = document.getElementById('satVal');
  const invertToggle        = document.getElementById('invertToggle');
  const btnResetFilters     = document.getElementById('btnResetFilters');

  const rememberSpeedToggle = document.getElementById('rememberSpeedToggle');
  const hudToggle           = document.getElementById('hudToggle');
  const overlayToggle       = document.getElementById('overlayToggle');

  let tabId = null;
  let activeSpeed = 1.0;
  let extensionDisabled = false;

  // ── Helpers ──
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function msg(message, callback) {
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, message, (res) => {
      if (chrome.runtime.lastError) {
        if (message.type === 'GET_STATUS') {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (res2) => {
              if (chrome.runtime.lastError || !res2) {
                updateStatus(false);
              } else if (callback) {
                callback(res2);
              }
            });
          }, 500);
        }
      } else if (callback) {
        callback(res);
      }
    });
  }

  // ── Status ──
  function updateStatus(hasVideo) {
    if (extensionDisabled) {
      statusPill.classList.remove('active');
      statusPill.classList.add('disabled');
      statusText.textContent = 'Paused';
      return;
    }
    statusPill.classList.remove('disabled');
    if (hasVideo) {
      statusPill.classList.add('active');
      statusText.textContent = 'Active';
    } else {
      statusPill.classList.remove('active');
      statusText.textContent = 'No Video';
    }
  }

  // ── Disable/Enable UI ──
  function updateDisableUI() {
    if (extensionDisabled) {
      btnDisable.textContent = 'Enable';
      btnDisable.classList.add('is-disabled');
      disableLabel.textContent = 'Extension Paused';
      disableDesc.textContent = 'Native player controls active';
      popupContainer.classList.add('ext-disabled');
      updateStatus(false);
    } else {
      btnDisable.textContent = 'Disable';
      btnDisable.classList.remove('is-disabled');
      disableLabel.textContent = 'Extension Active';
      disableDesc.textContent = 'Speed control is running';
      popupContainer.classList.remove('ext-disabled');
    }
  }

  // ── Speed display ──
  function updateSpeedUI(speed) {
    activeSpeed = parseFloat(speed);
    speedDisplay.textContent = activeSpeed.toFixed(2);
    presetChips.forEach(chip => {
      const v = parseFloat(chip.dataset.speed);
      chip.classList.toggle('active', Math.abs(v - activeSpeed) < 0.01);
    });
  }

  // ── Init ──
  const tab = await getActiveTab();
  if (tab) {
    tabId = tab.id;

    // Load disabled state
    chrome.storage.local.get(['extensionDisabled'], (items) => {
      extensionDisabled = !!items.extensionDisabled;
      updateDisableUI();
    });

    msg({ type: 'GET_STATUS' }, (res) => {
      if (!res) { updateStatus(false); return; }
      updateStatus(res.hasVideo);
      updateSpeedUI(res.speed);
      btnPlayPause.textContent = res.paused ? '▶ Play' : '⏸ Pause';
      btnToggleMute.textContent = res.muted ? 'Unmute' : 'Mute';
      const v = Math.round((res.volume || 1) * 100);
      volumeSlider.value = v;
      volumeVal.textContent = `${v}%`;
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
      if (res.overlayEnabled !== undefined) overlayToggle.checked = res.overlayEnabled;
      if (res.step !== undefined) updateStepUI(res.step);
      if (res.extensionDisabled !== undefined) {
        extensionDisabled = res.extensionDisabled;
        updateDisableUI();
      }
    });
  } else {
    chrome.storage.local.get(['step', 'extensionDisabled'], (items) => {
      if (items.step) updateStepUI(items.step);
      extensionDisabled = !!items.extensionDisabled;
      updateDisableUI();
    });
  }

  // ── Disable toggle ──
  btnDisable.addEventListener('click', () => {
    extensionDisabled = !extensionDisabled;
    chrome.storage.local.set({ extensionDisabled });
    updateDisableUI();

    if (extensionDisabled) {
      // Reset speed to 1.0 and tell content script to disable
      updateSpeedUI(1.0);
      msg({ type: 'DISABLE_EXTENSION' });
    } else {
      // Re-enable
      msg({ type: 'ENABLE_EXTENSION' });
      // Re-fetch status
      msg({ type: 'GET_STATUS' }, (res) => {
        if (res) {
          updateStatus(res.hasVideo);
          updateSpeedUI(res.speed);
        }
      });
    }
  });

  // ── Speed actions ──
  function setSpeed(s) {
    if (extensionDisabled) return;
    s = Math.max(0.1, Math.min(16, parseFloat(s)));
    updateSpeedUI(s);
    msg({ type: 'SET_SPEED', speed: s });
  }

  btnMinus05.addEventListener('click', () => setSpeed(activeSpeed - 0.5));
  btnMinus01.addEventListener('click', () => setSpeed(activeSpeed - 0.1));
  btnMinus005.addEventListener('click', () => setSpeed(activeSpeed - 0.05));
  btnReset.addEventListener('click', () => setSpeed(1.0));
  btnPlus005.addEventListener('click', () => setSpeed(activeSpeed + 0.05));
  btnPlus01.addEventListener('click', () => setSpeed(activeSpeed + 0.1));
  btnPlus05.addEventListener('click', () => setSpeed(activeSpeed + 0.5));

  presetChips.forEach(chip => {
    chip.addEventListener('click', () => setSpeed(parseFloat(chip.dataset.speed)));
  });

  btnApplyCustom.addEventListener('click', () => {
    const v = parseFloat(customSpeedInput.value);
    if (!isNaN(v)) setSpeed(v);
  });
  customSpeedInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = parseFloat(customSpeedInput.value);
      if (!isNaN(v)) setSpeed(v);
    }
  });

  // ── Playback ──
  btnPlayPause.addEventListener('click', () => {
    msg({ type: 'TOGGLE_PLAY' }, (res) => {
      if (res) btnPlayPause.textContent = res.paused ? '▶ Play' : '⏸ Pause';
    });
  });

  btnSeekBack.addEventListener('click', () => msg({ type: 'SEEK', seconds: -10 }));
  btnSeekFwd.addEventListener('click', () => msg({ type: 'SEEK', seconds: 10 }));
  btnSeekBack5.addEventListener('click', () => msg({ type: 'SEEK', seconds: -5 }));
  btnSeekFwd5.addEventListener('click', () => msg({ type: 'SEEK', seconds: 5 }));

  btnTogglePip.addEventListener('click', () => msg({ type: 'TOGGLE_PIP' }));

  btnToggleMute.addEventListener('click', () => {
    msg({ type: 'TOGGLE_MUTE' }, (res) => {
      if (res) btnToggleMute.textContent = res.muted ? 'Unmute' : 'Mute';
    });
  });

  btnFullscreen.addEventListener('click', () => {
    if (!tabId) return;
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const videos = document.querySelectorAll('video');
        for (const v of videos) {
          if (!v.paused || v.readyState > 0) {
            const container = v.closest('[class*="player"]') || v.parentElement || v;
            if (container.requestFullscreen) container.requestFullscreen();
            else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
            break;
          }
        }
      }
    });
  });

  volumeSlider.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    volumeVal.textContent = `${val}%`;
    msg({ type: 'SET_VOLUME', volume: val / 100 });
  });

  // ── Filters ──
  function pushFilters() {
    const filters = {
      brightness: parseInt(brightSlider.value, 10),
      contrast: parseInt(contrastSlider.value, 10),
      saturation: parseInt(satSlider.value, 10),
      invert: invertToggle.checked
    };
    brightVal.textContent = `${filters.brightness}%`;
    contrastVal.textContent = `${filters.contrast}%`;
    satVal.textContent = `${filters.saturation}%`;
    msg({ type: 'SET_FILTERS', filters });
  }

  brightSlider.addEventListener('input', pushFilters);
  contrastSlider.addEventListener('input', pushFilters);
  satSlider.addEventListener('input', pushFilters);
  invertToggle.addEventListener('change', pushFilters);

  btnResetFilters.addEventListener('click', () => {
    brightSlider.value = 100; contrastSlider.value = 100;
    satSlider.value = 100; invertToggle.checked = false;
    pushFilters();
  });

  // ── Settings ──
  function updateStepUI(step) {
    activeStep = parseFloat(step);
    stepOptBtns.forEach(btn => {
      const v = parseFloat(btn.dataset.step);
      btn.classList.toggle('active', Math.abs(v - activeStep) < 0.001);
    });
  }

  stepOptBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      updateStepUI(parseFloat(btn.dataset.step));
      pushSettings();
    });
  });

  function pushSettings() {
    const s = {
      rememberSpeed: rememberSpeedToggle.checked,
      hudEnabled: hudToggle.checked,
      overlayEnabled: overlayToggle.checked,
      step: activeStep
    };
    chrome.storage.local.set(s);
    msg({ type: 'UPDATE_SETTINGS', ...s });
  }

  rememberSpeedToggle.addEventListener('change', pushSettings);
  hudToggle.addEventListener('change', pushSettings);
  overlayToggle.addEventListener('change', pushSettings);
});
