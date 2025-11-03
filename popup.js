'use strict';
const send = async (t, v) => {const [tab] = await chrome.tabs.query({active: true, currentWindow: true}); tab?.url?.includes('youtube.com') && chrome.tabs.sendMessage(tab.id, {type: t, value: v}).catch(() => {})};
const save = (k, v, t) => (chrome.storage.sync.set({[k]: v}), send(t, v));
document.addEventListener('DOMContentLoaded', () => {
  const l = document.getElementById('leftClickStep'), m = document.getElementById('mouseWheelStep');
  chrome.storage.sync.get(['leftClickStep', 'mouseWheelStep'], r => (l.value = r.leftClickStep ?? 2, m.value = r.mouseWheelStep ?? 2));
  l.addEventListener('input', e => save('leftClickStep', parseFloat(e.target.value), 'UPDATE_LEFT_CLICK_STEP'));
  m.addEventListener('input', e => save('mouseWheelStep', parseInt(e.target.value), 'UPDATE_MOUSE_WHEEL_STEP'));
});

let activeDialog = null, prevFocus = null;
const escHandler = e => e.key === 'Escape' && activeDialog && closeDialog(activeDialog);
window.openDialog = id => {
  const d = document.getElementById(id);
  if (!d) return;
  prevFocus = document.activeElement;
  d.setAttribute('data-state', 'open');
  activeDialog = id;
  setTimeout(() => d.querySelector('.dialog-content')?.focus(), 100);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', escHandler);
};
window.closeDialog = id => {
  const d = document.getElementById(id);
  if (!d) return;
  d.setAttribute('data-state', 'closed');
  setTimeout(() => {
    activeDialog = null;
    document.body.style.overflow = '';
    prevFocus?.focus();
    prevFocus = null;
  }, 150);
  document.removeEventListener('keydown', escHandler);
};
window.handleOverlayClick = (e, id) => e.target.classList.contains('dialog-overlay') && closeDialog(id);
window.handleDialogConfirm = id => (console.log('Dialog confirmed:', id), closeDialog(id));

