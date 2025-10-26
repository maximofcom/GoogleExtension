(function() {
  'use strict';
  let panel, interval, videoCache, contentCache, settings = { leftClickStep: 2, mouseWheelStep: 2 };
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
    if (old) stopTrack(), old.remove();
    const p = Object.assign(document.createElement('div'), {
      id: 'yt-subtitle-panel',
      className: 'yt-subtitle-panel',
      innerHTML: `<div class="yt-subtitle-header"><div class="yt-subtitle-title">Video Subtitles</div><button class="yt-subtitle-close" title="Hide">×</button></div><div class="yt-subtitle-content"><div class="yt-subtitle-loading">Loading...</div></div>`
    });
    p.querySelector('.yt-subtitle-close').onclick = () => (stopTrack(), p.style.display = 'none');
    return contentCache = null, sec.insertBefore(p, sec.firstChild);
  };

  const parse = (data, fmt) => {
    try {
      return (fmt === 'json3' || fmt === 'json') 
        ? (JSON.parse(data).events || []).filter(e => e.segs).map(e => ({start: e.tStartMs/1000, text: e.segs.map(s => s.utf8||'').join('').trim()})).filter(s => s.text)
        : Array.from(new DOMParser().parseFromString(data, 'text/xml').getElementsByTagName('text')).map(el => ({start: parseFloat(el.getAttribute('start')||0), text: (el.textContent||'').trim()})).filter(s => s.text);
    } catch { return []; }
  };

  const escape = t => t.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const setContent = h => ((contentCache = contentCache || panel?.querySelector('.yt-subtitle-content')) && (contentCache.innerHTML = h));

  const show = subs => {
    if (!subs?.length) return setContent('<div class="yt-subtitle-empty">No subtitles</div>');
    setContent('<div class="yt-subtitle-text">' + subs.map(s => `<span class="yt-subtitle-item" data-start="${s.start}">${escape(s.text)}</span>`).join(' ') + '</div>');
    const tc = panel.querySelector('.yt-subtitle-text');
    tc && (tc.onclick = e => {const item = e.target.closest('.yt-subtitle-item'); item && videoCache?.isConnected && (videoCache.currentTime = parseFloat(item.dataset.start))});
    setTimeout(track, 500);
  };

  const update = () => {
    videoCache?.isConnected || (videoCache = document.querySelector('video'));
    const items = panel?.querySelectorAll('.yt-subtitle-item');
    if (!videoCache || !items?.length) return;
    const t = videoCache.currentTime;
    let active;
    for (const item of items) {
      const s = parseFloat(item.dataset.start), e = item.nextElementSibling ? parseFloat(item.nextElementSibling.dataset.start) : s + 3;
      t >= s && t < e ? (active = item, item.classList.add('active')) : item.classList.remove('active');
    }
    active && contentCache?.isConnected && contentCache.scrollTo({ top: active.offsetTop - (contentCache.clientHeight - active.clientHeight) / 2, behavior: 'smooth' });
  };

  const track = () => (stopTrack(), videoCache = document.querySelector('video'), videoCache && (interval = setInterval(update, 200)));
  const stopTrack = () => interval && (clearInterval(interval), interval = null);
  const ensure = cb => (panel || (panel = create())) ? cb() : setTimeout(() => (panel = create()) && cb(), 1000);

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data.type) return;
    const {type, data, format, tracks: t} = e.data;
    type === 'YT_SUBTITLE_TRACKS' && t?.length ? ensure(() => panel.style.display = 'block') : type === 'YT_SUBTITLE_DATA' && ensure(() => show(parse(data, format)));
  });

  const check = (r = 0) => {
    if (!new URLSearchParams(location.search).get('v')) return;
    const sec = document.querySelector('ytd-watch-flexy #secondary');
    sec ? ((!panel || !document.body.contains(panel)) && (panel = create(), contentCache = null), window.postMessage({type: 'YT_REQUEST_TRACKS'}, '*'), addVideoClickListeners(), createSpeedControl()) : r < 10 && setTimeout(() => check(r + 1), 500);
  };

  const createSpeedControl = () => {
    const video = document.querySelector('video');
    const videoContainer = document.querySelector('.html5-video-player');
    if (!video || !videoContainer || document.getElementById('yt-speed-control')) return;
    
    const speeds = [1, 1.2, 1.5, 2, 2.5];
    const speedControl = document.createElement('div');
    speedControl.id = 'yt-speed-control';
    speedControl.className = 'yt-speed-control';
    speedControl.innerHTML = '<span class="yt-speed-control-label">Speed</span>';
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'yt-speed-control-buttons';
    
    speeds.forEach(speed => {
      const btn = document.createElement('button');
      btn.className = 'yt-speed-btn';
      btn.dataset.speed = speed;
      btn.textContent = speed === 1 ? '1' : speed.toFixed(1);
      btn.title = `${speed}x`;
      buttonsContainer.appendChild(btn);
    });
    
    buttonsContainer.onclick = (e) => {
      const btn = e.target.closest('.yt-speed-btn');
      if (btn) {
        e.stopPropagation();
        video.playbackRate = parseFloat(btn.dataset.speed);
        buttonsContainer.querySelectorAll('.yt-speed-btn').forEach(b => 
          b.classList.toggle('active', b === btn)
        );
      }
    };
    
    speedControl.appendChild(buttonsContainer);
    buttonsContainer.querySelector(`[data-speed="${video.playbackRate}"]`)?.classList.add('active');
    videoContainer.appendChild(speedControl);
  };

  const addVideoClickListeners = () => {
    if (!(videoCache = document.querySelector('video')) || videoCache._clickListenersAdded) return;
    const stop = e => (e.preventDefault(), e.stopPropagation());
    videoCache.addEventListener('click', e => e.button === 0 && (stop(e), (p => (videoCache.currentTime = clamp(videoCache.currentTime - settings.leftClickStep, 0, videoCache.duration), p || videoCache.play().catch(() => {})))(videoCache.paused)), true);
    videoCache.addEventListener('dblclick', stop, true);
    videoCache.addEventListener('contextmenu', e => (stop(e), videoCache.paused ? videoCache.play().catch(() => {}) : videoCache.pause()), true);
    videoCache.addEventListener('wheel', e => (stop(e), videoCache.currentTime = clamp(videoCache.currentTime + (e.deltaY < 0 ? settings.mouseWheelStep : -settings.mouseWheelStep), 0, videoCache.duration)), true);
    videoCache._clickListenersAdded = true;
  };

  chrome.storage.sync.get(['leftClickStep', 'mouseWheelStep'], r => settings = {leftClickStep: r.leftClickStep ?? 2, mouseWheelStep: r.mouseWheelStep ?? 2});
  chrome.runtime.onMessage.addListener(m => {const k = {UPDATE_LEFT_CLICK_STEP: 'leftClickStep', UPDATE_MOUSE_WHEEL_STEP: 'mouseWheelStep'}[m.type]; k && m.value !== undefined && (settings[k] = m.value)});
  
  inject();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => setTimeout(check, 2000)) : setTimeout(check, 2000);
  
  let url = location.href;
  const nav = () => location.href !== url && (url = location.href, videoCache = contentCache = null, document.getElementById('yt-speed-control')?.remove(), setTimeout(check, 2000));
  new MutationObserver(nav).observe(document.querySelector('title') || document.documentElement, {childList: true, subtree: false});
  window.addEventListener('yt-navigate-finish', nav);
})();
