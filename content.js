// content.js
(function() {
  let panel, tracks = [], interval;

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
    if (old) stopTrack(), old.remove();
    const p = document.createElement('div');
    p.id = 'yt-subtitle-panel';
    p.className = 'yt-subtitle-panel';
    p.innerHTML = `<div class="yt-subtitle-header"><div class="yt-subtitle-title">Video Subtitles</div>
      <div class="yt-subtitle-controls"><select class="yt-subtitle-track-select"></select>
      <button class="yt-subtitle-close" title="Hide">×</button></div></div>
      <div class="yt-subtitle-content"><div class="yt-subtitle-loading">Loading...</div></div>`;
    p.querySelector('.yt-subtitle-track-select').onchange = e => {
      const i = parseInt(e.target.value);
      !isNaN(i) && tracks[i] && (window.postMessage({ type: 'YT_FETCH_TRACK', track: tracks[i] }, '*'), setContent('<div class="yt-subtitle-loading">Loading...</div>'));
    };
    p.querySelector('.yt-subtitle-close').onclick = () => (stopTrack(), p.style.display = 'none');
    return sec.insertBefore(p, sec.firstChild);
  };

  const parse = (data, fmt) => {
    const subs = [];
    try {
      (fmt === 'json3' || fmt === 'json' 
        ? (JSON.parse(data).events || []).filter(e => e.segs).map(e => ({ start: e.tStartMs / 1000, text: e.segs.map(s => s.utf8 || '').join('').trim() }))
        : Array.from(new DOMParser().parseFromString(data, 'text/xml').getElementsByTagName('text')).map(el => ({ start: parseFloat(el.getAttribute('start') || 0), text: el.textContent?.trim() || '' }))
      ).forEach(s => s.text && subs.push(s));
    } catch (e) {}
    return subs;
  };

  const escape = t => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
  const setContent = h => { const c = panel?.querySelector('.yt-subtitle-content'); if (c) c.innerHTML = h; };

  const show = subs => {
    if (!subs?.length) return setContent('<div class="yt-subtitle-empty">No subtitles</div>');
    setContent('<div class="yt-subtitle-text">' + subs.map(s => `<span class="yt-subtitle-item" data-start="${s.start}">${escape(s.text)}</span>`).join(' ') + '</div>');
    panel.querySelectorAll('.yt-subtitle-item').forEach(item => item.onclick = () => { const v = document.querySelector('video'); if (v) v.currentTime = parseFloat(item.dataset.start); });
    setTimeout(track, 500);
  };

  const update = () => {
    const v = document.querySelector('video'), items = panel?.querySelectorAll('.yt-subtitle-item');
    if (!v || !items?.length) return;
    const t = v.currentTime;
    let active;
    items.forEach(item => {
      const s = parseFloat(item.dataset.start), e = item.nextElementSibling ? parseFloat(item.nextElementSibling.dataset.start) : s + 3;
      (t >= s && t < e) ? (active = item, item.classList.add('active')) : item.classList.remove('active');
    });
    if (active) {
      const c = panel.querySelector('.yt-subtitle-content');
      if (c) c.scrollTo({ top: active.offsetTop - (c.clientHeight - active.clientHeight) / 2, behavior: 'smooth' });
    }
  };

  const track = () => { stopTrack(); if (document.querySelector('video')) interval = setInterval(update, 200); };
  const stopTrack = () => { if (interval) { clearInterval(interval); interval = null; } };

  const setTracks = t => {
    const sel = panel?.querySelector('.yt-subtitle-track-select');
    if (!sel) return;
    sel.innerHTML = t.map((tr, i) => `<option value="${i}">${tr.name?.simpleText || tr.languageCode || 'Unknown'}${tr.kind === 'asr' ? ' (Auto)' : ''}</option>`).join('');
    if (t.length) sel.selectedIndex = 0;
  };

  const ensure = cb => (panel || (panel = create())) ? cb() : setTimeout(() => (panel = create()) && cb(), 1000);

  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data.type === 'YT_SUBTITLE_TRACKS') (tracks = e.data.tracks || []) && ensure(() => { setTracks(tracks); if (tracks.length) panel.style.display = 'block'; });
    else if (e.data.type === 'YT_SUBTITLE_DATA') ensure(() => show(parse(e.data.data, e.data.format)));
  });

  const check = (r = 0) => {
    if (!new URLSearchParams(location.search).get('v')) return;
    document.querySelector('ytd-watch-flexy #secondary') 
      ? ((panel && document.body.contains(panel)) || (panel = create()), window.postMessage({ type: 'YT_REQUEST_TRACKS' }, '*'))
      : r < 10 && setTimeout(() => check(r + 1), 500);
  };

  const addVideoClickListeners = () => {
    const video = document.querySelector('video');
    if (!video || video._clickListenersAdded) return;
    
    // Left click - rewind 2 seconds without pausing
    video.addEventListener('click', (e) => {
      if (e.button === 0) { // Left mouse button
        e.preventDefault();
        e.stopPropagation();
        
        const wasPaused = video.paused;
        
        // Rewind 2 seconds
        if (video.currentTime >= 2) {
          video.currentTime -= 2;
        } else {
          video.currentTime = 0;
        }
        
        // Resume playing if it was playing before
        if (!wasPaused) {
          video.play().catch(() => {});
        }
      }
    }, true);
    
    // Double click - prevent fullscreen
    video.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, true);
    
    // Right click - pause video
    video.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      
      return false;
    }, true);
    
    video._clickListenersAdded = true;
  };

  const setupVideoListeners = () => {
    addVideoClickListeners();
    // Re-check periodically in case video element changes
    setInterval(() => {
      const video = document.querySelector('video');
      if (video && !video._clickListenersAdded) {
        addVideoClickListeners();
      }
    }, 1000);
  };

  inject();
  (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => setTimeout(check, 2000)) : setTimeout(check, 2000));
  let url = location.href;
  new MutationObserver(() => location.href !== url && (url = location.href, setTimeout(check, 2000))).observe(document, { subtree: true, childList: true });
  
  // Setup video click listeners
  setupVideoListeners();
})();
