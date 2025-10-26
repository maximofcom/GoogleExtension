// content.js - Content script that injects into YouTube pages
(function() {
  'use strict';

  let subtitlePanel = null;
  let currentSubtitles = [];
  let availableTracks = [];
  let trackingInterval = null;

  const injectPageScript = () => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  };

  const createSubtitlePanel = () => {
    const secondary = document.querySelector('ytd-watch-flexy #secondary');
    if (!secondary) return null;

    const existing = document.getElementById('yt-subtitle-panel');
    if (existing) {
      stopTracking();
      existing.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'yt-subtitle-panel';
    panel.className = 'yt-subtitle-panel';
    panel.innerHTML = `
      <div class="yt-subtitle-header">
        <div class="yt-subtitle-title">Video Subtitles</div>
        <div class="yt-subtitle-controls">
          <select class="yt-subtitle-track-select"><option value="">Select language...</option></select>
          <button class="yt-subtitle-close" title="Hide subtitle panel">×</button>
        </div>
      </div>
      <div class="yt-subtitle-content"><div class="yt-subtitle-loading">Loading subtitles...</div></div>
    `;

    panel.querySelector('.yt-subtitle-track-select').addEventListener('change', handleTrackChange);
    panel.querySelector('.yt-subtitle-close').addEventListener('click', () => {
      stopTracking();
      panel.style.display = 'none';
    });

    secondary.insertBefore(panel, secondary.firstChild);
    return panel;
  };

  const handleTrackChange = (e) => {
    const idx = parseInt(e.target.value);
    if (isNaN(idx) || !availableTracks[idx]) return;
    window.postMessage({ type: 'YT_FETCH_TRACK', track: availableTracks[idx] }, '*');
    updateSubtitleContent('<div class="yt-subtitle-loading">Loading subtitles...</div>');
  };

  const parseSubtitles = (data, format) => {
    const subtitles = [];
    try {
      if (format === 'json3' || format === 'json') {
        (JSON.parse(data).events || []).forEach(e => {
          if (e.segs) {
            const text = e.segs.map(s => s.utf8 || '').join('').trim();
            if (text) subtitles.push({ start: e.tStartMs / 1000, duration: e.dDurationMs / 1000, text });
          }
        });
      } else if (format === 'srv3' || format === 'xml') {
        const xmlDoc = new DOMParser().parseFromString(data, 'text/xml');
        Array.from(xmlDoc.getElementsByTagName('text')).forEach(el => {
          const text = el.textContent?.trim();
          if (text) {
            subtitles.push({
              start: parseFloat(el.getAttribute('start') || 0),
              duration: parseFloat(el.getAttribute('dur') || 0),
              text
            });
          }
        });
      }
    } catch (e) {}
    return subtitles;
  };

  const updateSubtitleContent = (html) => {
    const content = subtitlePanel?.querySelector('.yt-subtitle-content');
    if (content) content.innerHTML = html;
  };

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  const displaySubtitles = (subs) => {
    if (!subs?.length) return updateSubtitleContent('<div class="yt-subtitle-empty">No subtitles available</div>');
    
    const html = '<div class="yt-subtitle-text">' + 
      subs.map(s => `<span class="yt-subtitle-item" data-start="${s.start}">${escapeHtml(s.text)}</span>`).join(' ') + 
      '</div>';
    
    updateSubtitleContent(html);
    subtitlePanel.querySelectorAll('.yt-subtitle-item').forEach(item => {
      item.addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) video.currentTime = parseFloat(item.getAttribute('data-start'));
      });
    });
    setTimeout(startTracking, 500);
  };

  const updateActiveSubtitle = () => {
    const video = document.querySelector('video');
    if (!video || !subtitlePanel) return;

    const time = video.currentTime;
    const items = subtitlePanel.querySelectorAll('.yt-subtitle-item');
    if (!items.length) return;
    
    let active = null;
    items.forEach(item => {
      const start = parseFloat(item.getAttribute('data-start'));
      const end = item.nextElementSibling ? parseFloat(item.nextElementSibling.getAttribute('data-start')) : start + 3;
      
      if (time >= start && time < end) {
        active = item;
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  };

  const startTracking = () => {
    stopTracking();
    if (document.querySelector('video')) trackingInterval = setInterval(updateActiveSubtitle, 200);
  };

  const stopTracking = () => {
    if (trackingInterval) {
      clearInterval(trackingInterval);
      trackingInterval = null;
    }
  };

  const updateTrackSelector = (tracks) => {
    const select = subtitlePanel?.querySelector('.yt-subtitle-track-select');
    if (!select) return;
    
    select.innerHTML = tracks.map((t, i) => {
      const name = t.name?.simpleText || t.languageCode || 'Unknown';
      const type = t.kind === 'asr' ? ' (Auto-generated)' : '';
      return `<option value="${i}">${name}${type}</option>`;
    }).join('');
    
    if (tracks.length) select.selectedIndex = 0;
  };

  const ensurePanel = (callback) => {
    if (!subtitlePanel) {
      subtitlePanel = createSubtitlePanel();
      if (!subtitlePanel) {
        setTimeout(() => {
          subtitlePanel = createSubtitlePanel();
          if (subtitlePanel) callback();
        }, 1000);
        return false;
      }
    }
    return true;
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    
    if (e.data.type === 'YT_SUBTITLE_TRACKS') {
      availableTracks = e.data.tracks || [];
      if (ensurePanel(() => {
        updateTrackSelector(availableTracks);
        if (availableTracks.length) subtitlePanel.style.display = 'block';
      }) && availableTracks.length) {
        updateTrackSelector(availableTracks);
        subtitlePanel.style.display = 'block';
      }
    } else if (e.data.type === 'YT_SUBTITLE_DATA') {
      currentSubtitles = parseSubtitles(e.data.data, e.data.format);
      if (ensurePanel(() => displaySubtitles(currentSubtitles))) {
        displaySubtitles(currentSubtitles);
      }
    }
  });

  const checkAndCreatePanel = (retries = 0) => {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) return;
    
    if (document.querySelector('ytd-watch-flexy #secondary')) {
      if (!subtitlePanel || !document.body.contains(subtitlePanel)) {
        subtitlePanel = createSubtitlePanel();
      }
      window.postMessage({ type: 'YT_REQUEST_TRACKS' }, '*');
    } else if (retries < 10) {
      setTimeout(() => checkAndCreatePanel(retries + 1), 500);
    }
  };

  injectPageScript();
  
  const init = () => setTimeout(checkAndCreatePanel, 2000);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
  
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(checkAndCreatePanel, 2000);
    }
  }).observe(document, { subtree: true, childList: true });
})();
