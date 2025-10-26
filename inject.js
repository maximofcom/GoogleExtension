// inject.js
(function() {
  'use strict';
  
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  let currentVideoId = null;

  // Intercept XHR for subtitle data
  XMLHttpRequest.prototype.open = function(m, u, ...r) {
    this._url = u;
    return origOpen.call(this, m, u, ...r);
  };

  XMLHttpRequest.prototype.send = function(...a) {
    const url = this._url;
    if (url?.includes('timedtext')) {
      this.addEventListener('load', function() {
        if (this.status === 200) {
          const data = this.responseText;
          const format = determineFormat(url, data);
          window.postMessage({
            type: 'YT_SUBTITLE_DATA',
            url: url,
            data: data,
            format: format
          }, '*');
        }
      });
    }
    return origSend.apply(this, a);
  };

  const determineFormat = (url, data) => {
    if (url.includes('json3')) return 'json3';
    if (url.includes('srv3')) return 'srv3';
    return data.startsWith('<?xml') ? 'xml' : 'json';
  };

  const extract = () => {
    try {
      const pr = window.ytInitialPlayerResponse;
      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      
      if (tracks?.length) {
        // Sort manual tracks before auto-generated ones
        const sorted = [...tracks].sort((a, b) => (a.kind === 'asr') - (b.kind === 'asr'));
        window.postMessage({
          type: 'YT_SUBTITLE_TRACKS',
          tracks: sorted,
          videoId: pr?.videoDetails?.videoId
        }, '*');
        return sorted;
      }
    } catch (e) {
      console.error('Error extracting subtitle tracks:', e);
    }
    return null;
  };

  const fetchTrack = (track) => {
    if (!track?.baseUrl) return;
    
    const url = track.baseUrl + (track.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
    
    window.fetch(url)
      .then(r => r.text())
      .then(data => {
        const format = determineFormat(url, data);
        window.postMessage({
          type: 'YT_SUBTITLE_DATA',
          url: url,
          data: data,
          format: format,
          trackInfo: track
        }, '*');
      })
      .catch(() => {});
  };

  const check = () => {
    const videoId = new URLSearchParams(location.search).get('v');
    
    if (videoId && videoId !== currentVideoId) {
      currentVideoId = videoId;
      setTimeout(() => {
        const tracks = extract();
        if (tracks?.[0]) {
          fetchTrack(tracks[0]);
        }
      }, 1000);
    }
  };

  // Handle messages from content script
  window.addEventListener('message', (e) => {
    if (e.source === window) {
      if (e.data.type === 'YT_REQUEST_TRACKS') {
        extract();
      } else if (e.data.type === 'YT_FETCH_TRACK') {
        fetchTrack(e.data.track);
      }
    }
  });

  // Initial check
  check();

  // Watch for URL changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      check();
    }
  }).observe(document, { subtree: true, childList: true });

  // Listen for YouTube navigation events
  window.addEventListener('popstate', check);
  window.addEventListener('yt-navigate-finish', check);
})();
