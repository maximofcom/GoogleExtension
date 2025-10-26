'use strict';
const send = async (t, v) => {const [tab] = await chrome.tabs.query({active: true, currentWindow: true}); tab?.url?.includes('youtube.com') && chrome.tabs.sendMessage(tab.id, {type: t, value: v}).catch(() => {})};
const save = (k, v, t) => (chrome.storage.sync.set({[k]: v}), send(t, v));

document.addEventListener('DOMContentLoaded', () => {
  const l = document.getElementById('leftClickStep'), m = document.getElementById('mouseWheelStep');
  chrome.storage.sync.get(['leftClickStep', 'mouseWheelStep'], r => (l.value = r.leftClickStep ?? 2, m.value = r.mouseWheelStep ?? 2));
  l.addEventListener('input', e => save('leftClickStep', parseFloat(e.target.value), 'UPDATE_LEFT_CLICK_STEP'));
  m.addEventListener('input', e => save('mouseWheelStep', parseInt(e.target.value), 'UPDATE_MOUSE_WHEEL_STEP'));
});

