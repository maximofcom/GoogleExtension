# YouTube Subtitle Sidebar Panel

A Chrome extension that displays YouTube video subtitles in a convenient sidebar panel with a 70% height layout.

## Features

- 📺 **Sidebar Panel Integration**: Displays subtitles at the top of YouTube's recommended video sidebar
- 🌐 **Multiple Language Support**: Automatically detects and allows selection of available subtitle tracks
- 🎯 **Smart Subtitle Detection**: 
  - Accesses YouTube's player API
  - Extracts video metadata from `ytInitialPlayerResponse`
  - Prioritizes user-generated subtitles over auto-generated ones
- 🔍 **Request Interception**: Intercepts XHR requests to capture subtitle data in real-time
- ⏱️ **Clickable Timestamps**: Click any subtitle to jump to that moment in the video
- 🎨 **YouTube-Native Styling**: Matches YouTube's design system with dark mode support
- 📱 **Responsive Design**: Adapts to different screen sizes and YouTube viewing modes

## How It Works

The extension uses a multi-layered approach to extract and display subtitles:

### 1. Script Injection
- **inject.js** runs in the page context to access YouTube's global variables
- Gains access to the player API and internal YouTube objects

### 2. Metadata Extraction
- Extracts video metadata from `ytInitialPlayerResponse`
- Parses HTML script tags as fallback
- Accesses player API directly when available

### 3. Subtitle Track Discovery
- Identifies all available caption tracks
- Filters by language
- Prioritizes user-generated captions over auto-generated (ASR)

### 4. Request Interception
- Intercepts XMLHttpRequest calls to subtitle endpoints
- Captures subtitle data in JSON3, SRV3, or XML formats
- Forwards data to content script for display

## Installation

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `GoogleExtension` folder
6. The extension is now installed!

## Usage

1. Navigate to any YouTube video (e.g., `https://www.youtube.com/watch?v=VIDEO_ID`)
2. The subtitle panel will automatically appear at the top of the recommended sidebar
3. If multiple subtitle languages are available, select your preferred language from the dropdown
4. Click on any subtitle line to jump to that timestamp in the video
5. Click the × button to hide the panel

## File Structure

```
GoogleExtension/
├── manifest.json          # Extension configuration
├── content.js            # Content script (runs in page context)
├── inject.js             # Injected script (accesses YouTube APIs)
├── styles.css            # Panel styling
├── README.md             # This file
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Technical Details

### Subtitle Formats Supported
- **JSON3**: YouTube's newer JSON format with timing and segments
- **SRV3/XML**: Traditional XML-based subtitle format
- **Plain text**: Basic text subtitles

### Browser Compatibility
- Chrome (Manifest V3)
- Edge (Chromium-based)
- Brave
- Other Chromium-based browsers

## Troubleshooting

**Panel doesn't appear:**
- Make sure you're on a video page (not homepage or search)
- Check that the video has subtitles/captions available
- Try refreshing the page
- Check browser console for errors (F12)

**Subtitles not loading:**
- Some videos may have restricted subtitle access
- Try selecting a different language track
- Check your internet connection

**Panel styling issues:**
- The extension uses YouTube's CSS variables for theming
- Clear browser cache and reload if styles look broken

## Privacy

This extension:
- ✅ Only runs on YouTube.com
- ✅ Does not collect or transmit any personal data
- ✅ Does not modify video playback or ads
- ✅ Only accesses subtitle/caption data that's already available on YouTube

## Development

To modify the extension:

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Reload the YouTube page to see changes

## License

This project is provided as-is for educational and personal use.

