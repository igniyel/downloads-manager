'use strict';

const APP_PAGE = 'downloads.html?surface=tab';
const MENU_ID  = 'open-downloads-manager';

async function ensureContextMenu() {
  if (!chrome.contextMenus?.create) return;
  try { await chrome.contextMenus.remove(MENU_ID); } catch { /* item may not exist yet */ }
  try {
    chrome.contextMenus.create({ id: MENU_ID, title: 'Open Downloads Manager', contexts: ['action'] });
  } catch { /* duplicate on fast reload */ }
}

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); }
  catch (e) { console.warn('[Downloads Manager] Side panel behavior:', e); }
}

async function updateBadge() {
  if (!chrome.action?.setBadgeText) return;
  try {
    const items = await invokeDownloads('search', { state: 'in_progress' });
    const count = Array.isArray(items) ? items.length : 0;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#1d6ff5' : [0, 0, 0, 0] });
  } catch { /* ignore */ }
}

function invokeDownloads(method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      const cb = val => {
        const e = chrome.runtime.lastError;
        if (e) reject(new Error(e.message)); else resolve(val);
      };
      const result = chrome.downloads[method](...args, cb);
      if (result && typeof result.then === 'function') result.then(resolve).catch(reject);
    } catch (e) { reject(e); }
  });
}

async function initialize() {
  await ensureContextMenu();
  await configureSidePanel();
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(() => {
  initialize().catch(e => console.warn('[Downloads Manager] onInstalled:', e));
});

chrome.runtime.onStartup?.addListener(() => {
  initialize().catch(e => console.warn('[Downloads Manager] onStartup:', e));
});

/* Live badge updates */
chrome.downloads.onCreated.addListener(updateBadge);
chrome.downloads.onChanged.addListener(updateBadge);
chrome.downloads.onErased.addListener(updateBadge);

/* Context menu */
chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  void openManager({ windowId: tab?.windowId, preferPanel: true });
});

/* Action click — only fires when side panel API is unavailable */
if (!chrome.sidePanel?.setPanelBehavior) {
  chrome.action?.onClicked?.addListener(tab => {
    void openManager({ windowId: tab?.windowId, preferPanel: true });
  });
}

/* Keyboard command */
chrome.commands?.onCommand?.addListener(async command => {
  if (command !== 'open-manager') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  void openManager({ windowId: tab?.windowId, preferPanel: true });
});

/* Message router */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'downloads-manager:open-tab': {
        const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(APP_PAGE) });
        sendResponse({ ok: true, tabId: tab.id });
        break;
      }
      case 'downloads-manager:open-panel': {
        const wid = sender.tab?.windowId ?? message.windowId;
        if (chrome.sidePanel?.open && wid != null) {
          await chrome.sidePanel.open({ windowId: wid });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, reason: 'side_panel_unavailable' });
        }
        break;
      }
      case 'downloads-manager:get-capabilities': {
        sendResponse({
          ok: true,
          capabilities: {
            hasSidePanel: Boolean(chrome.sidePanel?.open),
            hasClipboard: Boolean(globalThis.navigator?.clipboard || chrome?.clipboard),
          },
        });
        break;
      }
      default:
        sendResponse({ ok: false, reason: 'unknown_message' });
    }
  })().catch(e => {
    console.error('[Downloads Manager]', e);
    sendResponse({ ok: false, reason: e?.message || 'unknown_error' });
  });
  return true; /* keep channel open for async */
});

async function openManager({ windowId, preferPanel = true } = {}) {
  if (preferPanel && chrome.sidePanel?.open && windowId != null) {
    try { await chrome.sidePanel.open({ windowId }); return; }
    catch (e) { console.warn('[Downloads Manager] Side panel fallback:', e); }
  }

  const targetUrl = chrome.runtime.getURL(APP_PAGE);
  const query = windowId != null ? { url: targetUrl, windowId } : { url: targetUrl, currentWindow: true };
  const tabs  = await chrome.tabs.query(query);

  if (tabs.length) {
    const t = tabs[0];
    await chrome.tabs.update(t.id, { active: true });
    if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true });
    return;
  }

  await chrome.tabs.create(windowId != null ? { url: targetUrl, windowId } : { url: targetUrl });
}
