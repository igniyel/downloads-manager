'use strict';

const APP_PAGE = 'downloads.html?surface=tab';
const MENU_ID  = 'open-downloads-manager';

/* Fix #12: Allowed message types — strict schema for the message router */
const VALID_MESSAGE_TYPES = new Set([
  'downloads-manager:open-tab',
  'downloads-manager:open-panel',
  'downloads-manager:get-capabilities',
]);

/* ─────────────────────────────────────────────────────────────────────────
   Context menu — only created in onInstalled (menus persist across SW restarts).
   Using removeAll() avoids the duplicate-ID error from create().
   ───────────────────────────────────────────────────────────────────────── */
async function setupContextMenu() {
  if (!chrome.contextMenus?.create) return;
  try { await chrome.contextMenus.removeAll(); } catch { /* nothing to remove */ }
  /* create() is callback-based; pass a callback to consume runtime.lastError */
  chrome.contextMenus.create(
    { id: MENU_ID, title: 'Open Downloads Manager', contexts: ['action'] },
    () => { void chrome.runtime.lastError; }   /* swallow any residual error */
  );
}

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) {
    console.warn('[Downloads Manager] Side panel behavior:', e);
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Badge — debounced
   ───────────────────────────────────────────────────────────────────────── */
let badgeTimer = null;
const BADGE_DEBOUNCE_MS = 250;

function scheduleBadgeUpdate() {
  if (badgeTimer != null) clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => { badgeTimer = null; updateBadge(); }, BADGE_DEBOUNCE_MS);
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

/* ─────────────────────────────────────────────────────────────────────────
   Initialization — split into install-only and every-wake paths.
   Context menu is install-only (persists across restarts).
   Side panel config + badge run on every wake.
   ───────────────────────────────────────────────────────────────────────── */
async function initializeWake() {
  await configureSidePanel();
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
  initializeWake().catch(e => console.warn('[Downloads Manager] onInstalled:', e));
});

chrome.runtime.onStartup?.addListener(() => {
  initializeWake().catch(e => console.warn('[Downloads Manager] onStartup:', e));
});

const swReady = initializeWake().catch(e => console.warn('[Downloads Manager] wake-init:', e));

/* Live badge updates — debounced */
chrome.downloads.onCreated.addListener(scheduleBadgeUpdate);
chrome.downloads.onChanged.addListener(scheduleBadgeUpdate);
chrome.downloads.onErased.addListener(scheduleBadgeUpdate);

/* ─────────────────────────────────────────────────────────────────────────
   Context menu click
   ───────────────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────────────
   Keyboard command — call openManager SYNCHRONOUSLY (no pre-await) so
   the user gesture context is preserved for sidePanel.open().
   ───────────────────────────────────────────────────────────────────────── */
chrome.commands?.onCommand?.addListener(command => {
  if (command !== 'open-manager') return;
  /* Don't await anything before openManager — the gesture chain breaks on
     each await in an MV3 service worker.  openManager will resolve the
     windowId internally if needed. */
  void openManager({ preferPanel: true });
});

/* ─────────────────────────────────────────────────────────────────────────
   Message validation + router
   ───────────────────────────────────────────────────────────────────────── */
function isValidMessage(message, sender) {
  if (!message || typeof message !== 'object') return false;
  if (typeof message.type !== 'string') return false;
  if (!VALID_MESSAGE_TYPES.has(message.type)) return false;
  if (sender.id !== chrome.runtime.id) return false;
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isValidMessage(message, sender)) {
    sendResponse({ ok: false, reason: 'invalid_message' });
    return false;
  }

  (async () => {
    await swReady;
    switch (message.type) {
      case 'downloads-manager:open-tab': {
        const wid = sender.tab?.windowId ?? undefined;
        await openManager({ windowId: wid, preferPanel: false });
        sendResponse({ ok: true });
        break;
      }
      case 'downloads-manager:open-panel': {
        const wid = sender.tab?.windowId ?? message.windowId;
        if (chrome.sidePanel?.open && wid != null) {
          try {
            await chrome.sidePanel.open({ windowId: wid });
            sendResponse({ ok: true });
          } catch {
            /* Message handler context has no user gesture — expected to fail.
               Fall back to tab open. */
            await openManager({ windowId: wid, preferPanel: false });
            sendResponse({ ok: true, fallback: 'tab' });
          }
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
  return true;
});

/* ─────────────────────────────────────────────────────────────────────────
   openManager — side panel is attempted FIRST (before any other await)
   to preserve the user gesture context.  If it fails (no gesture, no
   windowId, API unavailable), fall through silently to tab logic.
   ───────────────────────────────────────────────────────────────────────── */
async function openManager({ windowId, preferPanel = true } = {}) {
  /* Resolve windowId if not provided (keyboard command path) */
  if (windowId == null) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      windowId = tab?.windowId;
    } catch { /* leave null — tab fallback will use currentWindow */ }
  }

  /* Attempt side panel FIRST — this must be the earliest await in the
     gesture chain.  sidePanel.open() requires a user gesture context;
     if the gesture is already gone (message handler, delayed call) it
     will throw — that's expected, and we silently fall through. */
  if (preferPanel && chrome.sidePanel?.open && windowId != null) {
    try {
      await chrome.sidePanel.open({ windowId });
      return;
    } catch {
      /* Gesture context lost or side panel unavailable — fall through to tab */
    }
  }

  const targetUrl = chrome.runtime.getURL(APP_PAGE);
  const query = windowId != null
    ? { url: targetUrl, windowId }
    : { url: targetUrl, currentWindow: true };
  const tabs = await chrome.tabs.query(query);

  if (tabs.length) {
    const t = tabs[0];
    await chrome.tabs.update(t.id, { active: true });
    if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true });
    return;
  }

  await chrome.tabs.create(windowId != null ? { url: targetUrl, windowId } : { url: targetUrl });
}
