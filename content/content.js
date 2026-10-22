// Universal Video Speed & Playback Controller — Content Script

(function () {
  'use strict';

  if (window.__JIO_HOTSTAR_CONTROLLER_INJECTED__) return;
  window.__JIO_HOTSTAR_CONTROLLER_INJECTED__ = true;

  let currentSpeed = 1.0;
  let speedStep = 0.1;
  let rememberSpeed = true;
  let hudEnabled = true;
  let overlayEnabled = true;
  let extensionDisabled = false;
  let isRateLocking = false;
  let hudTimeout = null;
  let overlayWidget = null;

  let videoFilters = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    invert: false
  };

  const EXCLUDED_DOMAINS = [
    'meet.google.com', 'zoom.us', 'teams.microsoft.com', 'teams.live.com',
    'discord.com', 'whereby.com', 'webex.com', 'meet.jit.si', 'gather.town'
  ];

  function isExcludedDomain() {
    const hostname = window.location.hostname.toLowerCase();
    return EXCLUDED_DOMAINS.some(d => hostname.includes(d));
  }

  function isLiveStream(video) {
    if (!isFinite(video.duration) || isNaN(video.duration)) return true;
    if (video.duration === 0) return true;
    return false;
  }

  if (isExcludedDomain()) return;

  // Load initial settings
  chrome.storage.local.get(['speed', 'step', 'rememberSpeed', 'hudEnabled', 'overlayEnabled', 'filters', 'extensionDisabled'], (res) => {
    if (res.speed) currentSpeed = parseFloat(res.speed);
    if (res.step) speedStep = parseFloat(res.step);
    if (res.rememberSpeed !== undefined) rememberSpeed = res.rememberSpeed;
    if (res.hudEnabled !== undefined) hudEnabled = res.hudEnabled;
    if (res.overlayEnabled !== undefined) overlayEnabled = res.overlayEnabled;
    if (res.filters) videoFilters = res.filters;
    extensionDisabled = !!res.extensionDisabled;

    if (!extensionDisabled) {
      applySpeedToAllVideos(currentSpeed, false);
      applyFiltersToAllVideos();
    }
  });

  const trackedVideos = new WeakSet();

  function getAllVideos(root = document) {
    let videos = Array.from(root.querySelectorAll('video'));
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) videos = videos.concat(getAllVideos(el.shadowRoot));
    }
    return videos.filter(v => {
      if (v.readyState > 0 && isLiveStream(v)) return false;
      const rect = v.getBoundingClientRect();
      if (rect.width < 80 && rect.height < 80 && rect.width > 0) return false;
      return true;
    });
  }

  function getPrimaryVideo() {
    const videos = getAllVideos();
    if (videos.length === 0) return null;
    const playing = videos.find(v => !v.paused && v.readyState > 0);
    if (playing) return playing;
    const ready = videos.find(v => v.readyState > 0);
    if (ready) return ready;
    return videos.reduce((best, curr) => {
      const bR = best.getBoundingClientRect(), cR = curr.getBoundingClientRect();
      return (cR.width * cR.height > bR.width * bR.height) ? curr : best;
    }, videos[0]);
  }

  function attachVideoListeners(video) {
    if (trackedVideos.has(video)) return;
    trackedVideos.add(video);
    const enforceSpeed = () => {
      if (extensionDisabled) return;
      if (video.readyState > 0 && isLiveStream(video)) return;
      if (rememberSpeed && currentSpeed !== 1.0) {
        if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
          isRateLocking = true;
          video.playbackRate = currentSpeed;
          isRateLocking = false;
        }
      }
      applyFiltersToVideo(video);
      createOrUpdateOverlay();
    };
    ['play', 'playing', 'loadeddata', 'loadedmetadata', 'canplay'].forEach(ev =>
      video.addEventListener(ev, enforceSpeed)
    );
    video.addEventListener('ratechange', () => {
      if (extensionDisabled) return;
      if (isRateLocking) return;
      if (video.readyState > 0 && isLiveStream(video)) return;
      if (rememberSpeed && Math.abs(video.playbackRate - currentSpeed) > 0.01) {
        setTimeout(() => {
          if (extensionDisabled) return;
          isRateLocking = true;
          video.playbackRate = currentSpeed;
          isRateLocking = false;
        }, 50);
      }
    });
    enforceSpeed();
  }

  const observer = new MutationObserver(() => getAllVideos().forEach(attachVideoListeners));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  getAllVideos().forEach(attachVideoListeners);
  setInterval(() => {
    getAllVideos().forEach(attachVideoListeners);
    if (!extensionDisabled) createOrUpdateOverlay();
  }, 2000);

  function formatOverlaySpeed(speed) {
    const s = parseFloat(speed.toFixed(2));
    if (s % 1 === 0) return `${s.toFixed(1)}x`;
    return `${s}x`;
  }

  // ──────────────────────────────────────
  // Disable / Enable Extension
  // ──────────────────────────────────────
  function disableExtension() {
    extensionDisabled = true;
    currentSpeed = 1.0;
    chrome.storage.local.set({ extensionDisabled: true, speed: 1.0 });

    // Reset all videos to native 1x speed
    getAllVideos().forEach(video => {
      try {
        isRateLocking = true;
        video.playbackRate = 1.0;
        isRateLocking = false;
        video.style.filter = '';
      } catch (e) { /* ignore */ }
    });

    // Remove overlay and HUD
    if (overlayWidget) { overlayWidget.remove(); overlayWidget = null; }
    const hud = document.getElementById('jio-speed-hud-container');
    if (hud) hud.remove();

    chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', speed: 1.0 }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  }

  function enableExtension() {
    extensionDisabled = false;
    chrome.storage.local.set({ extensionDisabled: false });
    // Reload saved speed
    chrome.storage.local.get(['speed'], (res) => {
      if (res.speed && res.speed !== 1.0) {
        currentSpeed = parseFloat(res.speed);
      } else {
        currentSpeed = 1.0;
      }
      applySpeedToAllVideos(currentSpeed, false);
      applyFiltersToAllVideos();
    });
  }

  // ──────────────────────────────────────
  // Overlay Widget (mid-left of video)
  // ──────────────────────────────────────
  function createOrUpdateOverlay() {
    if (!overlayEnabled || extensionDisabled) {
      if (overlayWidget) { overlayWidget.remove(); overlayWidget = null; }
      return;
    }
    const video = getPrimaryVideo();
    if (!video) {
      if (overlayWidget) { overlayWidget.remove(); overlayWidget = null; }
      return;
    }

    const parent = video.closest('.html5-video-player, [class*="player-container"], [class*="video-container"]') || video.parentElement || document.body;
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    if (!overlayWidget || !parent.contains(overlayWidget)) {
      if (overlayWidget) overlayWidget.remove();
      overlayWidget = document.createElement('div');
      overlayWidget.id = 'jio-mini-overlay';
      overlayWidget.innerHTML = `
        <button class="jio-mini-btn" id="jio-mini-minus" title="−${speedStep}x">−</button>
        <button class="jio-mini-btn jio-mini-btn-fine" id="jio-mini-minus-005" title="−0.05x">−.05</button>
        <span class="jio-mini-speed" id="jio-mini-speed-val" title="Reset to 1.0x">${formatOverlaySpeed(currentSpeed)}</span>
        <button class="jio-mini-btn jio-mini-btn-fine" id="jio-mini-plus-005" title="+0.05x">+.05</button>
        <button class="jio-mini-btn" id="jio-mini-plus" title="+${speedStep}x">+</button>
      `;
      parent.appendChild(overlayWidget);

      overlayWidget.querySelector('#jio-mini-minus').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        applySpeedToAllVideos(currentSpeed - speedStep);
      });
      overlayWidget.querySelector('#jio-mini-minus-005').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        applySpeedToAllVideos(currentSpeed - 0.05);
      });
      overlayWidget.querySelector('#jio-mini-speed-val').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        applySpeedToAllVideos(1.0);
      });
      overlayWidget.querySelector('#jio-mini-plus-005').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        applySpeedToAllVideos(currentSpeed + 0.05);
      });
      overlayWidget.querySelector('#jio-mini-plus').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        applySpeedToAllVideos(currentSpeed + speedStep);
      });

      ['click', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'].forEach(evt => {
        overlayWidget.addEventListener(evt, e => e.stopPropagation());
      });
    }

    const speedEl = overlayWidget.querySelector('#jio-mini-speed-val');
    if (speedEl) speedEl.textContent = formatOverlaySpeed(currentSpeed);
  }

  // ──────────────────────────────────────
  // Speed & Filter Application
  // ──────────────────────────────────────
  function applySpeedToAllVideos(speed, showHudNotification = true) {
    if (extensionDisabled) return;
    speed = Math.max(0.1, Math.min(16.0, parseFloat(speed.toFixed(2))));
    currentSpeed = speed;
    const videos = getAllVideos();
    videos.forEach(video => {
      if (video.readyState > 0 && isLiveStream(video)) return;
      try {
        isRateLocking = true;
        video.playbackRate = speed;
        video.preservesPitch = true;
        video.webkitPreservesPitch = true;
        isRateLocking = false;
      } catch (err) { /* ignore */ }
    });
    chrome.storage.local.set({ speed });
    chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', speed }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
    createOrUpdateOverlay();
    if (showHudNotification && videos.length > 0) {
      showHUD(formatOverlaySpeed(speed), 'Speed');
    }
  }

  function applyFiltersToVideo(video) {
    if (!video || extensionDisabled) return;
    const { brightness, contrast, saturation, invert } = videoFilters;
    let f = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    if (invert) f += ' invert(100%)';
    video.style.filter = f;
  }

  function applyFiltersToAllVideos() {
    if (extensionDisabled) return;
    getAllVideos().forEach(applyFiltersToVideo);
  }

  // ──────────────────────────────────────
  // HUD Toast
  // ──────────────────────────────────────
  function showHUD(message, subtext = '') {
    if (!hudEnabled || extensionDisabled) return;
    let hud = document.getElementById('jio-speed-hud-container');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'jio-speed-hud-container';
      hud.innerHTML = `
        <div class="jio-speed-hud-badge">
          <span class="jio-speed-hud-text" id="jio-hud-msg"></span>
          <span class="jio-speed-hud-subtext" id="jio-hud-sub"></span>
        </div>
      `;
      const vid = getPrimaryVideo();
      const p = vid ? (vid.parentElement || document.body) : document.body;
      if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
      p.appendChild(hud);
    }
    const msgEl = document.getElementById('jio-hud-msg');
    const subEl = document.getElementById('jio-hud-sub');
    if (msgEl) msgEl.textContent = message;
    if (subEl) subEl.textContent = subtext;
    hud.classList.add('hud-visible');
    if (hudTimeout) clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => hud.classList.remove('hud-visible'), 1800);
  }

  // ──────────────────────────────────────
  // Playback Actions
  // ──────────────────────────────────────
  function togglePlay() {
    const v = getPrimaryVideo(); if (!v) return;
    if (v.paused) { v.play(); showHUD('▶', 'Play'); }
    else { v.pause(); showHUD('⏸', 'Pause'); }
  }

  function seekVideo(seconds) {
    const v = getPrimaryVideo(); if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + seconds));
    showHUD(seconds > 0 ? `+${seconds}s` : `${seconds}s`, 'Seek');
  }

  async function togglePiP() {
    const v = getPrimaryVideo(); if (!v) return;
    try {
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); }
      else { await v.requestPictureInPicture(); }
    } catch (err) { /* ignore */ }
  }

  function toggleMute() {
    const v = getPrimaryVideo(); if (!v) return;
    v.muted = !v.muted;
  }

  function setVolume(vol) {
    const v = getPrimaryVideo(); if (!v) return;
    v.volume = Math.max(0, Math.min(1, vol));
    v.muted = false;
  }

  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}` : `${m}:${sec.toString().padStart(2,'0')}`;
  }

  // ──────────────────────────────────────
  // Message Listener
  // ──────────────────────────────────────
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const video = getPrimaryVideo();

    if (request.type === 'GET_STATUS') {
      if (!video) return false;
      sendResponse({
        hasVideo: true, speed: currentSpeed, paused: video.paused,
        muted: video.muted, volume: video.volume,
        currentTime: video.currentTime, duration: video.duration,
        filters: videoFilters, hudEnabled, overlayEnabled, rememberSpeed,
        step: speedStep, extensionDisabled,
        formattedTime: formatTime(video.currentTime),
        formattedDuration: formatTime(video.duration),
        isLive: isLiveStream(video)
      });
      return true;
    }

    if (request.type === 'DISABLE_EXTENSION') {
      disableExtension();
      sendResponse({ success: true });
    } else if (request.type === 'ENABLE_EXTENSION') {
      enableExtension();
      sendResponse({ success: true });
    } else if (request.type === 'SET_SPEED') {
      applySpeedToAllVideos(request.speed);
      sendResponse({ success: true, speed: currentSpeed });
    } else if (request.type === 'STEP_SPEED') {
      applySpeedToAllVideos(currentSpeed + request.delta);
      sendResponse({ success: true, speed: currentSpeed });
    } else if (request.type === 'TOGGLE_PLAY') {
      togglePlay();
      const v = getPrimaryVideo();
      sendResponse({ success: true, paused: v ? v.paused : true });
    } else if (request.type === 'SEEK') {
      seekVideo(request.seconds);
      sendResponse({ success: true });
    } else if (request.type === 'TOGGLE_PIP') {
      togglePiP();
      sendResponse({ success: true });
    } else if (request.type === 'TOGGLE_MUTE') {
      toggleMute();
      const v = getPrimaryVideo();
      sendResponse({ success: true, muted: v ? v.muted : false });
    } else if (request.type === 'SET_VOLUME') {
      setVolume(request.volume);
      sendResponse({ success: true });
    } else if (request.type === 'SET_FILTERS') {
      videoFilters = { ...videoFilters, ...request.filters };
      applyFiltersToAllVideos();
      chrome.storage.local.set({ filters: videoFilters });
      sendResponse({ success: true });
    } else if (request.type === 'UPDATE_SETTINGS') {
      if (request.hudEnabled !== undefined) hudEnabled = request.hudEnabled;
      if (request.overlayEnabled !== undefined) overlayEnabled = request.overlayEnabled;
      if (request.rememberSpeed !== undefined) rememberSpeed = request.rememberSpeed;
      if (request.step !== undefined) speedStep = request.step;
      chrome.storage.local.set({ hudEnabled, overlayEnabled, rememberSpeed, step: speedStep });
      createOrUpdateOverlay();
      sendResponse({ success: true });
    }
    return true;
  });

})();
