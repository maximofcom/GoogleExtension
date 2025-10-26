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
    if (old) { stopTrack(); old.remove(); }

    const p = document.createElement('div');
    p.id = 'yt-subtitle-panel';
    p.className = 'yt-subtitle-panel';
    p.innerHTML = `<div class="yt-subtitle-header"><div class="yt-subtitle-title">Video Subtitles</div>
      <div class="yt-subtitle-controls"><select class="yt-subtitle-track-select"></select>
      <button class="yt-subtitle-close" title="Hide">×</button></div></div>
      <div class="yt-subtitle-content"><div class="yt-subtitle-loading">Loading...</div></div>`;

    p.querySelector('.yt-subtitle-track-select').onchange = e => {
      const i = parseInt(e.target.value);
      if (!isNaN(i) && tracks[i]) {
        window.postMessage({ type: 'YT_FETCH_TRACK', track: tracks[i] }, '*');
        setContent('<div class="yt-subtitle-loading">Loading...</div>');
      }
    };
    p.querySelector('.yt-subtitle-close').onclick = () => { stopTrack(); p.style.display = 'none'; };

    sec.insertBefore(p, sec.firstChild);
    return p;
  };

  const parse = (data, fmt) => {
    const subs = [];
    try {
      if (fmt === 'json3' || fmt === 'json') {
        (JSON.parse(data).events || []).forEach(e => {
          if (e.segs) {
            const txt = e.segs.map(s => s.utf8 || '').join('').trim();
            if (txt) subs.push({ start: e.tStartMs / 1000, text: txt });
          }
        });
      } else {
        Array.from(new DOMParser().parseFromString(data, 'text/xml').getElementsByTagName('text')).forEach(el => {
          const txt = el.textContent?.trim();
          if (txt) subs.push({ start: parseFloat(el.getAttribute('start') || 0), text: txt });
        });
      }
    } catch (e) {}
    return subs;
  };

  const escape = t => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
  const setContent = h => { const c = panel?.querySelector('.yt-subtitle-content'); if (c) c.innerHTML = h; };

  const show = subs => {
    if (!subs?.length) return setContent('<div class="yt-subtitle-empty">No subtitles</div>');
    setContent('<div class="yt-subtitle-text">' + subs.map(s => 
      `<span class="yt-subtitle-item" data-start="${s.start}">${escape(s.text)}</span>`).join(' ') + '</div>');
    panel.querySelectorAll('.yt-subtitle-item').forEach(item => 
      item.onclick = () => { const v = document.querySelector('video'); if (v) v.currentTime = parseFloat(item.dataset.start); });
    setTimeout(track, 500);
  };

  const update = () => {
    const v = document.querySelector('video');
    if (!v || !panel) return;
    const t = v.currentTime, items = panel.querySelectorAll('.yt-subtitle-item');
    if (!items.length) return;
    let active;
    items.forEach(item => {
      const s = parseFloat(item.dataset.start);
      const e = item.nextElementSibling ? parseFloat(item.nextElementSibling.dataset.start) : s + 3;
      if (t >= s && t < e) { active = item; item.classList.add('active'); } 
      else item.classList.remove('active');
    });
    if (active) {
      const c = panel.querySelector('.yt-subtitle-content');
      if (c) {
        const o = active.offsetTop - (c.clientHeight - active.clientHeight) / 2;
        c.scrollTo({ top: o, behavior: 'smooth' });
      }
    }
  };

  const track = () => { stopTrack(); if (document.querySelector('video')) interval = setInterval(update, 200); };
  const stopTrack = () => { if (interval) { clearInterval(interval); interval = null; } };

  const setTracks = t => {
    const sel = panel?.querySelector('.yt-subtitle-track-select');
    if (!sel) return;
    sel.innerHTML = t.map((tr, i) => 
      `<option value="${i}">${tr.name?.simpleText || tr.languageCode || 'Unknown'}${tr.kind === 'asr' ? ' (Auto)' : ''}</option>`).join('');
    if (t.length) sel.selectedIndex = 0;
  };

  const ensure = cb => {
    if (!panel && !(panel = create())) return setTimeout(() => { panel = create(); if (panel) cb(); }, 1000);
    return cb();
  };

  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data.type === 'YT_SUBTITLE_TRACKS') {
      tracks = e.data.tracks || [];
      ensure(() => { setTracks(tracks); if (tracks.length) panel.style.display = 'block'; });
    } else if (e.data.type === 'YT_SUBTITLE_DATA') {
      ensure(() => show(parse(e.data.data, e.data.format)));
    }
  });

  const check = (r = 0) => {
    if (!new URLSearchParams(location.search).get('v')) return;
    if (document.querySelector('ytd-watch-flexy #secondary')) {
      if (!panel || !document.body.contains(panel)) panel = create();
      window.postMessage({ type: 'YT_REQUEST_TRACKS' }, '*');
    } else if (r < 10) setTimeout(() => check(r + 1), 500);
  };

  inject();
  const init = () => setTimeout(check, 2000);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
  
  let url = location.href;
  new MutationObserver(() => { if (location.href !== url) { url = location.href; setTimeout(check, 2000); } })
    .observe(document, { subtree: true, childList: true });
})();
