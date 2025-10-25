// inject.js - Runs in page context to access YouTube's global variables and player API
(function() {
  'use strict';

  console.log('[YT Subtitles] Inject script loaded');

  // XMLHttpRequest interceptor to capture subtitle requests
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    // Listen for subtitle/caption URLs
    if (this._url && (this._url.includes('timedtext') || this._url.includes('api/timedtext'))) {
      console.log('[YT Subtitles] Intercepted subtitle request:', this._url);
      
      this.addEventListener('load', function() {
        if (this.status === 200) {
          try {
            const subtitleData = this.responseText;
            // Send subtitle data to content script
            window.postMessage({
              type: 'YT_SUBTITLE_DATA',
              url: this._url,
              data: subtitleData,
              format: detectSubtitleFormat(this._url, subtitleData)
            }, '*');
          } catch (e) {
            console.error('[YT Subtitles] Error processing subtitle data:', e);
          }
        }
      });
    }
    
    return originalXHRSend.apply(this, args);
  };

  // Detect subtitle format (JSON3, SRV3, or plain text)
  function detectSubtitleFormat(url, data) {
    if (url.includes('fmt=json3')) return 'json3';
    if (url.includes('fmt=srv3')) return 'srv3';
    if (data.startsWith('<?xml')) return 'xml';
    try {
      JSON.parse(data);
      return 'json';
    } catch (e) {
      return 'text';
    }
  }

  // Extract video metadata and subtitle tracks
  function extractVideoData() {
    try {
      // Method 1: ytInitialPlayerResponse
      if (window.ytInitialPlayerResponse) {
        const playerResponse = window.ytInitialPlayerResponse;
        const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (captionTracks && captionTracks.length > 0) {
          console.log('[YT Subtitles] Found caption tracks:', captionTracks);
          
          // Prioritize: user-generated > auto-generated
          const sortedTracks = [...captionTracks].sort((a, b) => {
            if (a.kind === 'asr' && b.kind !== 'asr') return 1;
            if (a.kind !== 'asr' && b.kind === 'asr') return -1;
            return 0;
          });
          
          window.postMessage({
            type: 'YT_SUBTITLE_TRACKS',
            tracks: sortedTracks,
            videoId: playerResponse?.videoDetails?.videoId
          }, '*');
          
          return sortedTracks;
        }
      }

      // Method 2: Try to access player API
      const player = document.getElementById('movie_player') || 
                     document.querySelector('.html5-video-player');
      
      if (player && typeof player.getAvailableQualityLevels === 'function') {
        console.log('[YT Subtitles] Player API accessible');
        // Store player reference for later use
        window._ytPlayer = player;
      }

      // Method 3: Parse from HTML
      const scriptTags = document.querySelectorAll('script');
      for (const script of scriptTags) {
        const text = script.textContent || '';
        if (text.includes('ytInitialPlayerResponse')) {
          const match = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
          if (match) {
            const playerResponse = JSON.parse(match[1]);
            const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            
            if (captionTracks) {
              window.postMessage({
                type: 'YT_SUBTITLE_TRACKS',
                tracks: captionTracks,
                videoId: playerResponse?.videoDetails?.videoId
              }, '*');
              
              return captionTracks;
            }
          }
        }
      }
    } catch (e) {
      console.error('[YT Subtitles] Error extracting video data:', e);
    }
    
    return null;
  }

  // Monitor for video changes (SPA navigation)
  let currentVideoId = null;
  
  function checkVideoChange() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    
    if (videoId && videoId !== currentVideoId) {
      currentVideoId = videoId;
      console.log('[YT Subtitles] Video changed:', videoId);
      
      // Wait for player response to be available
      setTimeout(() => {
        const tracks = extractVideoData();
        if (tracks && tracks.length > 0) {
          // Auto-fetch first available subtitle track
          const firstTrack = tracks[0];
          fetchSubtitleTrack(firstTrack);
        }
      }, 1000);
    }
  }

  // Fetch subtitle track data
  function fetchSubtitleTrack(track) {
    if (!track || !track.baseUrl) return;
    
    console.log('[YT Subtitles] Fetching subtitle track:', track.name?.simpleText);
    
    // Request JSON3 format for easier parsing
    let url = track.baseUrl;
    if (!url.includes('fmt=')) {
      url += (url.includes('?') ? '&' : '?') + 'fmt=json3';
    }
    
    fetch(url)
      .then(response => response.text())
      .then(data => {
        window.postMessage({
          type: 'YT_SUBTITLE_DATA',
          url: url,
          data: data,
          format: detectSubtitleFormat(url, data),
          trackInfo: track
        }, '*');
      })
      .catch(error => {
        console.error('[YT Subtitles] Error fetching subtitles:', error);
      });
  }

  // Listen for subtitle track selection from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    if (event.data.type === 'YT_REQUEST_TRACKS') {
      extractVideoData();
    } else if (event.data.type === 'YT_FETCH_TRACK') {
      fetchSubtitleTrack(event.data.track);
    }
  });

  // Initialize
  checkVideoChange();
  
  // Monitor URL changes (YouTube is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      checkVideoChange();
    }
  }).observe(document, { subtree: true, childList: true });

  // Also listen to popstate events
  window.addEventListener('popstate', checkVideoChange);
  window.addEventListener('yt-navigate-finish', checkVideoChange);

  console.log('[YT Subtitles] Inject script initialized');
})();

