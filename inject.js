(function() {
  'use strict';
  const oO = XMLHttpRequest.prototype.open, oS = XMLHttpRequest.prototype.send;
  let vid = null;
  const fmt = (u, d) => u.includes('json3') ? 'json3' : u.includes('srv3') ? 'srv3' : d.startsWith('<?xml') ? 'xml' : 'json';
  
  XMLHttpRequest.prototype.open = function(m, u, ...r) { this._url = u; return oO.call(this, m, u, ...r); };
  XMLHttpRequest.prototype.send = function(...a) {
    const u = this._url;
    u?.includes('timedtext') && this.addEventListener('load', function() { this.status === 200 && window.postMessage({type: 'YT_SUBTITLE_DATA', url: u, data: this.responseText, format: fmt(u, this.responseText)}, '*'); });
    return oS.apply(this, a);
  };

  const extract = () => {
    try {
      const t = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (t?.length) {
        const s = [...t].sort((a, b) => (a.kind === 'asr') - (b.kind === 'asr'));
        window.postMessage({type: 'YT_SUBTITLE_TRACKS', tracks: s, videoId: window.ytInitialPlayerResponse?.videoDetails?.videoId}, '*');
        return s;
      }
    } catch {}
    return null;
  };

  const fetch = t => t?.baseUrl && window.fetch(t.baseUrl + (t.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3').then(r => r.text()).then(d => window.postMessage({type: 'YT_SUBTITLE_DATA', url: t.baseUrl, data: d, format: fmt(t.baseUrl, d), trackInfo: t}, '*')).catch(() => {});
  const check = () => {const v = new URLSearchParams(location.search).get('v'); v && v !== vid && (vid = v, setTimeout(() => {const t = extract(); t?.[0] && fetch(t[0])}, 1000))};
  
  window.addEventListener('message', e => e.source === window && e.data?.type && (e.data.type === 'YT_REQUEST_TRACKS' ? extract() : e.data.type === 'YT_FETCH_TRACK' && fetch(e.data.track)));
  check();
  
  let url = location.href;
  const nav = () => location.href !== url && (url = location.href, check());
  window.addEventListener('yt-navigate-finish', nav);
  window.addEventListener('popstate', nav);
})();
