// content.js
(function() {
  'use strict';
  
  // State variables
  let panel, interval, videoCache, contentCache;
  const tracks = [];
  let settings = { leftClickStep: 2.0, mouseWheelStep: 2 };
  
  // Constants
  const TRACK_INTERVAL = 200;
  const CHECK_DELAY = 2000;
  const CREATE_RETRY = 1000;
  
  // Utility functions
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const inject = () => {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('inject.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  };

  const create = () => {
    const sec = document.querySelector('ytd-watch-flexy #secondary');
    if (!sec) return null;
    
    const old = document.getElementById('yt-subtitle-panel');
    if (old) {
      stopTrack();
      old.remove();
    }
    
    const p = document.createElement('div');
    p.id = 'yt-subtitle-panel';
    p.className = 'yt-subtitle-panel';
    p.innerHTML = `<div class="yt-subtitle-header"><div class="yt-subtitle-title">Video Subtitles</div>
      <button class="yt-subtitle-close" title="Hide">×</button></div>
      <div class="yt-subtitle-content"><div class="yt-subtitle-loading">Loading...</div></div>`;
    
    p.querySelector('.yt-subtitle-close').onclick = () => {
      stopTrack();
      p.style.display = 'none';
    };
    
    contentCache = null;
    return sec.insertBefore(p, sec.firstChild);
  };

  const parseJsonFormat = (data) => {
    const parsed = JSON.parse(data);
    return (parsed.events || [])
      .filter(e => e.segs)
      .map(e => ({
        start: e.tStartMs / 1000,
        text: e.segs.map(s => s.utf8 || '').join('').trim()
      }))
      .filter(s => s.text);
  };

  const parseXmlFormat = (data) => {
    const doc = new DOMParser().parseFromString(data, 'text/xml');
    return Array.from(doc.getElementsByTagName('text'))
      .map(el => ({
        start: parseFloat(el.getAttribute('start') || 0),
        text: (el.textContent || '').trim()
      }))
      .filter(s => s.text);
  };

  const parse = (data, fmt) => {
    try {
      return (fmt === 'json3' || fmt === 'json') 
        ? parseJsonFormat(data)
        : parseXmlFormat(data);
    } catch (e) {
      return [];
    }
  };

  const escape = (t) => t.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));

  const setContent = (h) => {
    if (!contentCache) {
      contentCache = panel?.querySelector('.yt-subtitle-content');
    }
    if (contentCache) {
      contentCache.innerHTML = h;
    }
  };

  const show = (subs) => {
    if (!subs?.length) {
      setContent('<div class="yt-subtitle-empty">No subtitles</div>');
      return;
    }
    
    const html = '<div class="yt-subtitle-text">' +
      subs.map(s => `<span class="yt-subtitle-item" data-start="${s.start}">${escape(s.text)}</span>`).join(' ') +
      '</div>';
    setContent(html);
    
    // Use event delegation instead of individual listeners
    const textContainer = panel.querySelector('.yt-subtitle-text');
    if (textContainer) {
      textContainer.onclick = (e) => {
        const item = e.target.closest('.yt-subtitle-item');
        if (item && videoCache?.isConnected) {
          videoCache.currentTime = parseFloat(item.dataset.start);
        }
      };
    }
    
    setTimeout(track, 500);
  };

  const update = () => {
    if (!videoCache?.isConnected) {
      videoCache = document.querySelector('video');
    }
    
    const items = panel?.querySelectorAll('.yt-subtitle-item');
    if (!videoCache || !items?.length) return;
    
    const t = videoCache.currentTime;
    let active = null;
    
    for (const item of items) {
      const s = parseFloat(item.dataset.start);
      const e = item.nextElementSibling 
        ? parseFloat(item.nextElementSibling.dataset.start) 
        : s + 3;
      
      if (t >= s && t < e) {
        active = item;
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    }
    
    if (active && contentCache?.isConnected) {
      const scrollTop = active.offsetTop - (contentCache.clientHeight - active.clientHeight) / 2;
      contentCache.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }
  };

  const track = () => {
    stopTrack();
    videoCache = document.querySelector('video');
    if (videoCache) {
      interval = setInterval(update, TRACK_INTERVAL);
    }
  };

  const stopTrack = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  const ensure = (cb) => {
    if (panel || (panel = create())) {
      cb();
    } else {
      setTimeout(() => {
        panel = create();
        if (panel) cb();
      }, CREATE_RETRY);
    }
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data.type) return;
    
    const { type, data, format, tracks: newTracks } = e.data;
    
    if (type === 'YT_SUBTITLE_TRACKS' && newTracks?.length) {
      ensure(() => panel.style.display = 'block');
    } else if (type === 'YT_SUBTITLE_DATA') {
      ensure(() => show(parse(data, format)));
    }
  });

  const check = (retries = 0) => {
    if (!new URLSearchParams(location.search).get('v')) return;
    
    const secondary = document.querySelector('ytd-watch-flexy #secondary');
    if (secondary) {
      if (!panel || !document.body.contains(panel)) {
        panel = create();
        contentCache = null;
      }
      window.postMessage({ type: 'YT_REQUEST_TRACKS' }, '*');
      addVideoClickListeners();
    } else if (retries < 10) {
      setTimeout(() => check(retries + 1), 500);
    }
  };

  const addVideoClickListeners = () => {
    videoCache = document.querySelector('video');
    if (!videoCache || videoCache._clickListenersAdded) return;
    
    const preventDefaultStop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    // Left click - rewind by leftClickStep seconds without pausing
    videoCache.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      preventDefaultStop(e);
      
      const wasPaused = videoCache.paused;
      videoCache.currentTime = clamp(videoCache.currentTime - settings.leftClickStep, 0, videoCache.duration);
      
      if (!wasPaused) {
        videoCache.play().catch(() => {});
      }
    }, true);
    
    // Double click - prevent fullscreen
    videoCache.addEventListener('dblclick', preventDefaultStop, true);
    
    // Right click - toggle pause
    videoCache.addEventListener('contextmenu', (e) => {
      preventDefaultStop(e);
      videoCache.paused ? videoCache.play().catch(() => {}) : videoCache.pause();
    }, true);
    
    // Mouse wheel - forward/backward by mouseWheelStep seconds
    videoCache.addEventListener('wheel', (e) => {
      preventDefaultStop(e);
      const delta = e.deltaY < 0 ? settings.mouseWheelStep : -settings.mouseWheelStep;
      videoCache.currentTime = clamp(videoCache.currentTime + delta, 0, videoCache.duration);
    }, true);
    
    videoCache._clickListenersAdded = true;
  };

  // Load settings from storage
  chrome.storage.sync.get(['leftClickStep', 'mouseWheelStep'], (result) => {
    settings = {
      leftClickStep: result.leftClickStep ?? settings.leftClickStep,
      mouseWheelStep: result.mouseWheelStep ?? settings.mouseWheelStep
    };
  });
  
  // Listen for updates to settings
  chrome.runtime.onMessage.addListener((message) => {
    const updateMap = {
      'UPDATE_LEFT_CLICK_STEP': 'leftClickStep',
      'UPDATE_MOUSE_WHEEL_STEP': 'mouseWheelStep'
    };
    
    const key = updateMap[message.type];
    if (key && message.value !== undefined) {
      settings[key] = message.value;
    }
  });

  inject();
  
  // Initial setup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(check, CHECK_DELAY));
  } else {
    setTimeout(check, CHECK_DELAY);
  }
  
  // Watch for URL changes (YouTube SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      videoCache = null;
      contentCache = null;
      setTimeout(check, CHECK_DELAY);
    }
  }).observe(document, { subtree: true, childList: true });
})();
