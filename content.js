// content.js - Content script that injects into YouTube pages
(function() {
  'use strict';

  console.log('[YT Subtitles] Content script loaded');

  let subtitlePanel = null;
  let currentSubtitles = [];
  let currentTrackIndex = 0;
  let availableTracks = [];

  // Inject the page script to access YouTube's global variables
  function injectPageScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('[YT Subtitles] Page script injected');
  }

  // Create the subtitle panel UI
  function createSubtitlePanel() {
    // Find the secondary (sidebar) element
    const secondary = document.querySelector('#secondary');
    if (!secondary) {
      console.log('[YT Subtitles] Secondary sidebar not found, retrying...');
      return null;
    }

    // Remove existing panel if any
    const existing = document.getElementById('yt-subtitle-panel');
    if (existing) {
      existing.remove();
    }

    // Create panel container
    const panel = document.createElement('div');
    panel.id = 'yt-subtitle-panel';
    panel.className = 'yt-subtitle-panel';

    // Create header
    const header = document.createElement('div');
    header.className = 'yt-subtitle-header';
    
    const title = document.createElement('div');
    title.className = 'yt-subtitle-title';
    title.textContent = 'Video Subtitles';
    
    const controls = document.createElement('div');
    controls.className = 'yt-subtitle-controls';
    
    const trackSelect = document.createElement('select');
    trackSelect.className = 'yt-subtitle-track-select';
    trackSelect.innerHTML = '<option value="">Select language...</option>';
    trackSelect.addEventListener('change', handleTrackChange);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'yt-subtitle-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Hide subtitle panel';
    closeBtn.addEventListener('click', () => {
      panel.style.display = 'none';
    });
    
    controls.appendChild(trackSelect);
    controls.appendChild(closeBtn);
    
    header.appendChild(title);
    header.appendChild(controls);

    // Create subtitle content area
    const content = document.createElement('div');
    content.className = 'yt-subtitle-content';
    content.innerHTML = '<div class="yt-subtitle-loading">Loading subtitles...</div>';

    panel.appendChild(header);
    panel.appendChild(content);

    // Insert at the top of secondary
    secondary.insertBefore(panel, secondary.firstChild);
    
    console.log('[YT Subtitles] Panel created');
    return panel;
  }

  // Handle track selection change
  function handleTrackChange(event) {
    const trackIndex = parseInt(event.target.value);
    if (isNaN(trackIndex) || !availableTracks[trackIndex]) return;
    
    currentTrackIndex = trackIndex;
    const track = availableTracks[trackIndex];
    
    // Request the inject script to fetch this track
    window.postMessage({
      type: 'YT_FETCH_TRACK',
      track: track
    }, '*');
    
    updateSubtitleContent('<div class="yt-subtitle-loading">Loading subtitles...</div>');
  }

  // Parse subtitle data based on format
  function parseSubtitles(data, format) {
    const subtitles = [];
    
    try {
      if (format === 'json3' || format === 'json') {
        const parsed = JSON.parse(data);
        const events = parsed.events || [];
        
        for (const event of events) {
          if (event.segs) {
            const text = event.segs.map(seg => seg.utf8 || '').join('');
            if (text.trim()) {
              subtitles.push({
                start: event.tStartMs / 1000,
                duration: event.dDurationMs / 1000,
                text: text.trim()
              });
            }
          }
        }
      } else if (format === 'srv3' || format === 'xml') {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data, 'text/xml');
        const textElements = xmlDoc.getElementsByTagName('text');
        
        for (const element of textElements) {
          const start = parseFloat(element.getAttribute('start') || 0);
          const duration = parseFloat(element.getAttribute('dur') || 0);
          const text = element.textContent;
          
          if (text && text.trim()) {
            subtitles.push({
              start: start,
              duration: duration,
              text: text.trim()
            });
          }
        }
      }
    } catch (e) {
      console.error('[YT Subtitles] Error parsing subtitles:', e);
    }
    
    return subtitles;
  }

  // Format time in MM:SS format
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Update subtitle content display
  function updateSubtitleContent(html) {
    if (!subtitlePanel) return;
    const content = subtitlePanel.querySelector('.yt-subtitle-content');
    if (content) {
      content.innerHTML = html;
    }
  }

  // Display parsed subtitles
  function displaySubtitles(subtitles) {
    if (!subtitles || subtitles.length === 0) {
      updateSubtitleContent('<div class="yt-subtitle-empty">No subtitles available</div>');
      return;
    }

    let html = '<div class="yt-subtitle-list">';
    for (const subtitle of subtitles) {
      const timeStr = formatTime(subtitle.start);
      html += `
        <div class="yt-subtitle-item" data-start="${subtitle.start}">
          <div class="yt-subtitle-time">${timeStr}</div>
          <div class="yt-subtitle-text">${escapeHtml(subtitle.text)}</div>
        </div>
      `;
    }
    html += '</div>';
    
    updateSubtitleContent(html);
    
    // Add click handlers to seek to subtitle time
    const items = subtitlePanel.querySelectorAll('.yt-subtitle-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const startTime = parseFloat(item.getAttribute('data-start'));
        seekToTime(startTime);
      });
    });
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Seek video to specific time
  function seekToTime(seconds) {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = seconds;
    }
  }

  // Update track selector dropdown
  function updateTrackSelector(tracks) {
    if (!subtitlePanel) return;
    
    const select = subtitlePanel.querySelector('.yt-subtitle-track-select');
    if (!select) return;
    
    select.innerHTML = '';
    
    tracks.forEach((track, index) => {
      const option = document.createElement('option');
      option.value = index;
      
      const languageName = track.name?.simpleText || track.languageCode || 'Unknown';
      const trackType = track.kind === 'asr' ? ' (Auto-generated)' : '';
      option.textContent = `${languageName}${trackType}`;
      
      select.appendChild(option);
    });
    
    // Auto-select first track
    if (tracks.length > 0) {
      select.selectedIndex = 0;
    }
  }

  // Listen for messages from inject script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    if (event.data.type === 'YT_SUBTITLE_TRACKS') {
      console.log('[YT Subtitles] Received subtitle tracks:', event.data.tracks);
      availableTracks = event.data.tracks || [];
      
      if (!subtitlePanel) {
        subtitlePanel = createSubtitlePanel();
      }
      
      if (subtitlePanel && availableTracks.length > 0) {
        updateTrackSelector(availableTracks);
        subtitlePanel.style.display = 'block';
      }
    } else if (event.data.type === 'YT_SUBTITLE_DATA') {
      console.log('[YT Subtitles] Received subtitle data:', event.data.format);
      
      const subtitles = parseSubtitles(event.data.data, event.data.format);
      currentSubtitles = subtitles;
      
      if (!subtitlePanel) {
        subtitlePanel = createSubtitlePanel();
      }
      
      displaySubtitles(subtitles);
    }
  });

  // Monitor for page changes and recreate panel if needed
  function checkAndCreatePanel() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    
    if (videoId && document.querySelector('#secondary')) {
      if (!subtitlePanel || !document.body.contains(subtitlePanel)) {
        subtitlePanel = createSubtitlePanel();
      }
      
      // Request subtitle tracks
      window.postMessage({ type: 'YT_REQUEST_TRACKS' }, '*');
    }
  }

  // Initialize
  function initialize() {
    // Inject the page script first
    injectPageScript();
    
    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(checkAndCreatePanel, 1000);
      });
    } else {
      setTimeout(checkAndCreatePanel, 1000);
    }
    
    // Monitor for navigation changes
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(checkAndCreatePanel, 1500);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  initialize();
})();

