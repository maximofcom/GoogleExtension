// inject.js
(function() {
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(m, u, ...r) { this._url = u; return origOpen.call(this, m, u, ...r); };
  XMLHttpRequest.prototype.send = function(...a) {
    if (this._url?.includes('timedtext')) {
      this.addEventListener('load', function() {
        if (this.status === 200) {
          const d = this.responseText;
          window.postMessage({ type: 'YT_SUBTITLE_DATA', url: this._url, data: d, 
            format: this._url.includes('json3') ? 'json3' : this._url.includes('srv3') ? 'srv3' : 
                    d.startsWith('<?xml') ? 'xml' : 'json' }, '*');
        }
      });
    }
    return origSend.apply(this, a);
  };

  const extract = () => {
    try {
      const pr = window.ytInitialPlayerResponse;
      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) {
        const sorted = [...tracks].sort((a, b) => (a.kind === 'asr') - (b.kind === 'asr'));
        window.postMessage({ type: 'YT_SUBTITLE_TRACKS', tracks: sorted, videoId: pr?.videoDetails?.videoId }, '*');
        return sorted;
      }
    } catch (e) {}
    return null;
  };

  let vid = null;
  const check = () => {
    const v = new URLSearchParams(location.search).get('v');
    if (v && v !== vid) {
      vid = v;
      setTimeout(() => { const t = extract(); if (t?.[0]) fetch(t[0]); }, 1000);
    }
  };

  const fetch = t => {
    if (!t?.baseUrl) return;
    let u = t.baseUrl + (t.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
    window.fetch(u).then(r => r.text()).then(d => 
      window.postMessage({ type: 'YT_SUBTITLE_DATA', url: u, data: d, 
        format: u.includes('json3') ? 'json3' : u.includes('srv3') ? 'srv3' : 'xml', trackInfo: t }, '*')
    ).catch(() => {});
  };

  window.addEventListener('message', e => {
    if (e.source === window) {
      if (e.data.type === 'YT_REQUEST_TRACKS') extract();
      else if (e.data.type === 'YT_FETCH_TRACK') fetch(e.data.track);
    }
  });

  check();
  let url = location.href;
  new MutationObserver(() => { if (location.href !== url) { url = location.href; check(); } })
    .observe(document, { subtree: true, childList: true });
  window.addEventListener('popstate', check);
  window.addEventListener('yt-navigate-finish', check);
})();
