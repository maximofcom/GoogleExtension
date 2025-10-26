// popup.js
'use strict';

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup initialized');
  
  // Initialize left click step input
  const leftClickStepInput = document.getElementById('leftClickStep');
  const mouseWheelStepInput = document.getElementById('mouseWheelStep');
  
  // Load saved values from storage
  chrome.storage.sync.get(['leftClickStep', 'mouseWheelStep'], (result) => {
    const savedLeftClick = result.leftClickStep || 2.0;
    const savedMouseWheel = result.mouseWheelStep || 2;
    
    leftClickStepInput.value = savedLeftClick;
    mouseWheelStepInput.value = savedMouseWheel;
  });
  
  // Update and save left click step value when input changes
  leftClickStepInput.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    
    // Save to chrome storage
    chrome.storage.sync.set({ leftClickStep: value }, () => {
      console.log('Left click step saved:', value);
    });
    
    // Send message to content script
    sendMessageToContentScript({
      type: 'UPDATE_LEFT_CLICK_STEP',
      value: value
    });
  });
  
  // Update and save mouse wheel step value when input changes
  mouseWheelStepInput.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    
    // Save to chrome storage
    chrome.storage.sync.set({ mouseWheelStep: value }, () => {
      console.log('Mouse wheel step saved:', value);
    });
    
    // Send message to content script
    sendMessageToContentScript({
      type: 'UPDATE_MOUSE_WHEEL_STEP',
      value: value
    });
  });
});

// Example: Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in popup:', message);
  
  // Handle different message types here
  if (message.type === 'UPDATE_POPUP') {
    // Update popup UI based on message
  }
  
  sendResponse({ status: 'received' });
});

// Example: Query active tab
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Example: Send message to content script
async function sendMessageToContentScript(message) {
  const tab = await getActiveTab();
  if (tab && tab.url?.includes('youtube.com')) {
    chrome.tabs.sendMessage(tab.id, message);
  }
}

