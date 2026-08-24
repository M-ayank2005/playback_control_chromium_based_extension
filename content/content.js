// JioHotstar & Universal Video Speed & Playback Controller Content Script

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__JIO_HOTSTAR_CONTROLLER_INJECTED__) return;
  window.__JIO_HOTSTAR_CONTROLLER_INJECTED__ = true;

  let currentSpeed = 1.0;
  let speedStep = 0.1;
  let rememberSpeed = true;
  let hudEnabled = true;
  let isRateLocking = false;
  let hudTimeout = null;

  let videoFilters = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    invert: false
  };

  // Load initial settings
  chrome.storage.local.get(['speed', 'step', 'rememberSpeed', 'hudEnabled', 'filters'], (res) => {
    if (res.speed) currentSpeed = parseFloat(res.speed);
    if (res.step) speedStep = parseFloat(res.step);
    if (res.rememberSpeed !== undefined) rememberSpeed = res.rememberSpeed;
    if (res.hudEnabled !== undefined) hudEnabled = res.hudEnabled;
    if (res.filters) videoFilters = res.filters;

    applySpeedToAllVideos(currentSpeed, false);
    applyFiltersToAllVideos();
  });

  // Keep track of observed videos
  const trackedVideos = new WeakSet();

  // Find all video elements, including shadow DOMs if any
  function getAllVideos(root = document) {
    let videos = Array.from(root.querySelectorAll('video'));

    // Search inside shadow roots
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        videos = videos.concat(getAllVideos(el.shadowRoot));
      }
    }
    return videos;
  }

  // Get primary active video (largest visible video or playing video)
  function getPrimaryVideo() {
    const videos = getAllVideos();
    if (videos.length === 0) return null;

    // Return currently playing video first
    const playing = videos.find(v => !v.paused && v.readyState > 2);
    if (playing) return playing;

    // Otherwise return largest visible video
    return videos.reduce((best, curr) => {
      const bRect = best.getBoundingClientRect();
      const cRect = curr.getBoundingClientRect();
      return (cRect.width * cRect.height > bRect.width * bRect.height) ? curr : best;
    }, videos[0]);
  }

  // Attach event listeners to newly detected video elements
  function attachVideoListeners(video) {
    if (trackedVideos.has(video)) return;
    trackedVideos.add(video);

    // Apply speed when video loads metadata or starts playing
    const enforceSpeed = () => {
      if (rememberSpeed && currentSpeed !== 1.0) {
        if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
          isRateLocking = true;
          video.playbackRate = currentSpeed;
          isRateLocking = false;
        }
      }
      applyFiltersToVideo(video);
    };

    video.addEventListener('play', enforceSpeed);
    video.addEventListener('loadedmetadata', enforceSpeed);
    video.addEventListener('ratechange', () => {
      if (isRateLocking) return;
      // If website script (like JioHotstar ad/quality shift) changes playbackRate, re-apply user speed if rememberSpeed is true
      if (rememberSpeed && Math.abs(video.playbackRate - currentSpeed) > 0.01) {
        setTimeout(() => {
          isRateLocking = true;
          video.playbackRate = currentSpeed;
          isRateLocking = false;
        }, 50);
      }
    });

    enforceSpeed();
  }

  // Monitor DOM for dynamically added video elements (e.g. JioHotstar single-page app navigation)
  const observer = new MutationObserver(() => {
    const videos = getAllVideos();
    videos.forEach(attachVideoListeners);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Initial attach
  getAllVideos().forEach(attachVideoListeners);

  // Apply speed to all videos on page
  function applySpeedToAllVideos(speed, showHudNotification = true) {
    speed = Math.max(0.1, Math.min(16.0, parseFloat(speed.toFixed(2))));
    currentSpeed = speed;

    const videos = getAllVideos();
    if (videos.length === 0) return;

    videos.forEach(video => {
      try {
        isRateLocking = true;
        video.playbackRate = speed;
        video.preservesPitch = true;
        video.webkitPreservesPitch = true;
        isRateLocking = false;
      } catch (err) {
        console.warn('JioHotstar Controller: Could not set playback rate', err);
      }
    });

    // Save to storage
    chrome.storage.local.set({ speed });

    // Notify background for badge
    chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', speed });

    if (showHudNotification) {
      showHUD(`⚡ ${speed.toFixed(2)}x Speed`);
    }
  }

  // Apply visual CSS filters to videos
  function applyFiltersToVideo(video) {
    if (!video) return;
    const { brightness, contrast, saturation, invert } = videoFilters;
    let filterStr = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    if (invert) filterStr += ' invert(100%)';
    video.style.filter = filterStr;
  }

  function applyFiltersToAllVideos() {
    getAllVideos().forEach(applyFiltersToVideo);
  }

  // Create HUD Toast on video
  function showHUD(message, subtext = '') {
    if (!hudEnabled) return;

    let hudContainer = document.getElementById('jio-speed-hud-container');
    if (!hudContainer) {
      hudContainer = document.createElement('div');
      hudContainer.id = 'jio-speed-hud-container';
      hudContainer.innerHTML = `
        <div class="jio-speed-hud-badge">
          <div class="jio-speed-hud-icon">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span class="jio-speed-hud-text" id="jio-hud-msg"></span>
          <span class="jio-speed-hud-subtext" id="jio-hud-sub"></span>
        </div>
      `;
      
      const primaryVid = getPrimaryVideo();
      const parent = primaryVid ? (primaryVid.parentElement || document.body) : document.body;
      if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(hudContainer);
    }

    const msgEl = document.getElementById('jio-hud-msg');
    const subEl = document.getElementById('jio-hud-sub');
    if (msgEl) msgEl.textContent = message;
    if (subEl) subEl.textContent = subtext;

    hudContainer.classList.add('hud-visible');

    if (hudTimeout) clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
      hudContainer.classList.remove('hud-visible');
    }, 1800);
  }

  // Handle Playback Actions
  function togglePlay() {
    const video = getPrimaryVideo();
    if (!video) return;
    if (video.paused) {
      video.play();
      showHUD('▶ Playing');
    } else {
      video.pause();
      showHUD('⏸ Paused');
    }
  }

  function seekVideo(seconds) {
    const video = getPrimaryVideo();
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
    showHUD(seconds > 0 ? `⏩ +${seconds}s` : `⏪ ${seconds}s`);
  }

  async function togglePiP() {
    const video = getPrimaryVideo();
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        showHUD('🖼️ Exited PiP');
      } else {
        await video.requestPictureInPicture();
        showHUD('🖼️ Picture-in-Picture');
      }
    } catch (err) {
      console.warn('JioHotstar Controller: PiP Error', err);
      showHUD('⚠️ PiP Not Allowed');
    }
  }

  // Message listener from popup and background service worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_STATUS') {
      const video = getPrimaryVideo();
      sendResponse({
        hasVideo: !!video,
        speed: currentSpeed,
        paused: video ? video.paused : true,
        muted: video ? video.muted : false,
        volume: video ? video.volume : 1.0,
        currentTime: video ? video.currentTime : 0,
        duration: video ? video.duration : 0,
        filters: videoFilters,
        hudEnabled,
        rememberSpeed
      });
    } else if (request.type === 'SET_SPEED') {
      applySpeedToAllVideos(request.speed);
      sendResponse({ success: true });
    } else if (request.type === 'STEP_SPEED') {
      applySpeedToAllVideos(currentSpeed + request.delta);
      sendResponse({ success: true });
    } else if (request.type === 'TOGGLE_PLAY') {
      togglePlay();
      sendResponse({ success: true });
    } else if (request.type === 'SEEK') {
      seekVideo(request.seconds);
      sendResponse({ success: true });
    } else if (request.type === 'TOGGLE_PIP') {
      togglePiP();
      sendResponse({ success: true });
    } else if (request.type === 'SET_VOLUME') {
      const video = getPrimaryVideo();
      if (video) video.volume = Math.max(0, Math.min(1, request.volume));
      sendResponse({ success: true });
    } else if (request.type === 'SET_FILTERS') {
      videoFilters = { ...videoFilters, ...request.filters };
      applyFiltersToAllVideos();
      chrome.storage.local.set({ filters: videoFilters });
      sendResponse({ success: true });
    } else if (request.type === 'UPDATE_SETTINGS') {
      if (request.hudEnabled !== undefined) hudEnabled = request.hudEnabled;
      if (request.rememberSpeed !== undefined) rememberSpeed = request.rememberSpeed;
      if (request.step !== undefined) speedStep = request.step;
      sendResponse({ success: true });
    }
    return true;
  });

})();
