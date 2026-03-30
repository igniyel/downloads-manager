'use strict';

/* ─────────────────────────────────────────────────────────────────────────
   Constants
   ───────────────────────────────────────────────────────────────────────── */
const INITIAL_RENDER_COUNT = 200;
const RENDER_INCREMENT     = 200;
const PREFS_KEY            = 'dlMgrPrefs_v4';
const POLL_INTERVAL_MS     = 1000;
const SPEED_WINDOW_MS      = 5000;

const SORT_FNS = {
  'date-desc': (a, b) => toTime(b.startTime) - toTime(a.startTime),
  'date-asc':  (a, b) => toTime(a.startTime) - toTime(b.startTime),
  'name-asc':  (a, b) => getFilename(a).localeCompare(getFilename(b), undefined, { sensitivity: 'base' }),
  'name-desc': (a, b) => getFilename(b).localeCompare(getFilename(a), undefined, { sensitivity: 'base' }),
  'size-desc': (a, b) => getSize(b) - getSize(a),
  'size-asc':  (a, b) => getSize(a) - getSize(b),
};

const DATE_GROUPS = [
  { label: 'Today',      test: (day, today) => day >= today },
  { label: 'Yesterday',  test: (day, today) => day >= shiftDay(today, -1) },
  { label: 'This week',  test: (day, today) => day >= shiftDay(today, -6) },
  { label: 'This month', test: (day, today) => day >= new Date(today.getFullYear(), today.getMonth(), 1) },
];

const INTERRUPT_LABELS = {
  FILE_NO_SPACE:        'No disk space',
  FILE_FAILED:          'Write failed',
  FILE_NAME_TOO_LONG:   'Filename too long',
  NETWORK_FAILED:       'Network error',
  NETWORK_TIMEOUT:      'Timed out',
  NETWORK_DISCONNECTED: 'Disconnected',
  SERVER_BAD_CONTENT:   'Bad response',
  SERVER_UNAUTHORIZED:  'Unauthorized',
  SERVER_FORBIDDEN:     'Forbidden',
  USER_CANCELED:        'Cancelled',
  CRASH:                'Browser crash',
};

/* ─────────────────────────────────────────────────────────────────────────
   Button icon SVG registry
   ───────────────────────────────────────────────────────────────────────── */
const BTN_ICONS = {
  open:   `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`,
  reveal: `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>`,
  delete: `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`,
  cancel: `<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
  pause:  `<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`,
  resume: `<polygon points="5 3 19 12 5 21 5 3"/>`,
  again:  `<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>`,
  more:   `<circle cx="12" cy="5"  r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>`,
};

/** Build button innerHTML: SVG icon + optional text label */
function btnIcon(key, text) {
  const svg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BTN_ICONS[key]}</svg>`;
  return text ? `${svg}<span>${escapeHtml(text)}</span>` : svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   File icon registry — SVG paths + category colours
   ───────────────────────────────────────────────────────────────────────── */
const ICON_DEFS = {
  image: {
    color: '#a78bfa', label: 'IMG',
    path: `<rect x="3" y="3" width="18" height="18" rx="2" stroke-width="1.6"/>
           <path d="M3 14l4-4 4 4 3-3 5 5" stroke-width="1.6" stroke-linejoin="round"/>
           <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>`,
  },
  video: {
    color: '#f87171', label: 'VID',
    path: `<rect x="2" y="6" width="14" height="12" rx="2" stroke-width="1.6"/>
           <path d="M16 9.5l6-3v11l-6-3V9.5z" stroke-width="1.6" stroke-linejoin="round"/>`,
  },
  audio: {
    color: '#34d399', label: 'AUD',
    path: `<path d="M9 18V5l12-2v13" stroke-width="1.6" stroke-linejoin="round"/>
           <circle cx="6" cy="18" r="3" stroke-width="1.6"/>
           <circle cx="18" cy="16" r="3" stroke-width="1.6"/>`,
  },
  pdf: {
    color: '#f87171', label: 'PDF',
    path: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="1.6"/>
           <polyline points="14 2 14 8 20 8" stroke-width="1.6" stroke-linejoin="round"/>
           <line x1="7" y1="13" x2="17" y2="13" stroke-width="1.6"/>
           <line x1="7" y1="17" x2="13" y2="17" stroke-width="1.6"/>`,
  },
  doc: {
    color: '#60a5fa', label: 'DOC',
    path: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="1.6"/>
           <polyline points="14 2 14 8 20 8" stroke-width="1.6" stroke-linejoin="round"/>
           <line x1="7" y1="13" x2="17" y2="13" stroke-width="1.6"/>
           <line x1="7" y1="17" x2="17" y2="17" stroke-width="1.6"/>
           <line x1="7" y1="9" x2="10" y2="9" stroke-width="1.6"/>`,
  },
  sheet: {
    color: '#4ade80', label: 'XLS',
    path: `<rect x="3" y="3" width="18" height="18" rx="2" stroke-width="1.6"/>
           <line x1="3" y1="9" x2="21" y2="9" stroke-width="1.4"/>
           <line x1="3" y1="15" x2="21" y2="15" stroke-width="1.4"/>
           <line x1="9" y1="3" x2="9" y2="21" stroke-width="1.4"/>
           <line x1="15" y1="3" x2="15" y2="21" stroke-width="1.4"/>`,
  },
  slide: {
    color: '#fb923c', label: 'PPT',
    path: `<rect x="2" y="4" width="20" height="14" rx="2" stroke-width="1.6"/>
           <line x1="8" y1="21" x2="16" y2="21" stroke-width="1.6"/>
           <line x1="12" y1="18" x2="12" y2="21" stroke-width="1.6"/>
           <line x1="7" y1="9" x2="17" y2="9" stroke-width="1.5"/>
           <line x1="7" y1="13" x2="13" y2="13" stroke-width="1.5"/>`,
  },
  archive: {
    color: '#fbbf24', label: 'ZIP',
    path: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="1.6"/>
           <polyline points="14 2 14 8 20 8" stroke-width="1.6" stroke-linejoin="round"/>
           <line x1="12" y1="9"  x2="12" y2="9.01"  stroke-width="2" stroke-linecap="round"/>
           <line x1="12" y1="12" x2="12" y2="12.01" stroke-width="2" stroke-linecap="round"/>
           <line x1="12" y1="15" x2="12" y2="15.01" stroke-width="2" stroke-linecap="round"/>
           <line x1="12" y1="18" x2="12" y2="18.01" stroke-width="2" stroke-linecap="round"/>`,
  },
  code: {
    color: '#22d3ee', label: 'CODE',
    path: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="1.6"/>
           <polyline points="14 2 14 8 20 8" stroke-width="1.6" stroke-linejoin="round"/>
           <polyline points="9 13 7 15 9 17" stroke-width="1.6" stroke-linejoin="round"/>
           <polyline points="15 13 17 15 15 17" stroke-width="1.6" stroke-linejoin="round"/>
           <line x1="12" y1="13" x2="12" y2="17" stroke-width="1.6"/>`,
  },
  exe: {
    color: '#94a3b8', label: 'EXE',
    path: `<path d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2z" stroke-width="1.6"/>
           <path d="M12 8v4" stroke-width="2" stroke-linecap="round"/>
           <path d="M8.46 10.46l2.83 2.83" stroke-width="1.8" stroke-linecap="round"/>
           <path d="M8 14h4" stroke-width="2" stroke-linecap="round"/>
           <path d="M8.46 17.54l2.83-2.83" stroke-width="1.8" stroke-linecap="round"/>
           <path d="M12 16v4" stroke-width="2" stroke-linecap="round"/>
           <path d="M15.54 17.54l-2.83-2.83" stroke-width="1.8" stroke-linecap="round"/>
           <path d="M16 14h-4" stroke-width="2" stroke-linecap="round"/>
           <path d="M15.54 10.46l-2.83 2.83" stroke-width="1.8" stroke-linecap="round"/>`,
  },
  font: {
    color: '#c084fc', label: 'FONT',
    path: `<path d="M4 7V4h16v3" stroke-width="1.6" stroke-linejoin="round"/>
           <path d="M9 20h6" stroke-width="1.6" stroke-linecap="round"/>
           <line x1="12" y1="4" x2="12" y2="20" stroke-width="1.6"/>`,
  },
  disk: {
    color: '#f472b6', label: 'DMG',
    path: `<ellipse cx="12" cy="12" rx="10" ry="6" stroke-width="1.6"/>
           <path d="M2 12v5c0 3.31 4.48 6 10 6s10-2.69 10-6v-5" stroke-width="1.6"/>
           <ellipse cx="12" cy="12" rx="3" ry="1.8" stroke-width="1.5"/>`,
  },
  torrent: {
    color: '#38bdf8', label: 'TRR',
    path: `<path d="M12 2L2 7l10 5 10-5-10-5z" stroke-width="1.6" stroke-linejoin="round"/>
           <path d="M2 17l10 5 10-5" stroke-width="1.6" stroke-linejoin="round"/>
           <path d="M2 12l10 5 10-5" stroke-width="1.6" stroke-linejoin="round"/>`,
  },
  generic: {
    color: '#64748b', label: 'FILE',
    path: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="1.6"/>
           <polyline points="14 2 14 8 20 8" stroke-width="1.6" stroke-linejoin="round"/>`,
  },
};

/* Extension → category lookup */
const EXT_MAP = {
  png:'image',jpg:'image',jpeg:'image',gif:'image',webp:'image',svg:'image',
  bmp:'image',avif:'image',heic:'image',heif:'image',ico:'image',tif:'image',tiff:'image',
  mp4:'video',mov:'video',mkv:'video',webm:'video',avi:'video',m4v:'video',
  flv:'video',wmv:'video',ts:'video',mts:'video',mxf:'video',
  mp3:'audio',wav:'audio',flac:'audio',aac:'audio',ogg:'audio',m4a:'audio',
  opus:'audio',wma:'audio',alac:'audio',aiff:'audio',
  pdf:'pdf',
  doc:'doc',docx:'doc',odt:'doc',rtf:'doc',pages:'doc',txt:'doc',md:'doc',
  rst:'doc',tex:'doc',wpd:'doc',
  xls:'sheet',xlsx:'sheet',csv:'sheet',tsv:'sheet',ods:'sheet',numbers:'sheet',
  ppt:'slide',pptx:'slide',odp:'slide',key:'slide',
  zip:'archive',rar:'archive','7z':'archive',tar:'archive',gz:'archive',
  bz2:'archive',xz:'archive',zst:'archive',cab:'archive',lz:'archive',
  html:'code',css:'code',js:'code',ts:'code',jsx:'code',tsx:'code',
  json:'code',yaml:'code',yml:'code',xml:'code',
  py:'code',rb:'code',go:'code',rs:'code',php:'code',sh:'code',
  bat:'code',ps1:'code',lua:'code',c:'code',cpp:'code','h':'code',
  java:'code',kt:'code',swift:'code',dart:'code',
  exe:'exe',msi:'exe',apk:'exe',pkg:'exe',deb:'exe',appimage:'exe',
  snap:'exe',rpm:'exe',
  ttf:'font',otf:'font',woff:'font',woff2:'font',eot:'font',
  dmg:'disk',iso:'disk',img:'disk',vhd:'disk',vmdk:'disk',
  torrent:'torrent',
};

function getIconDef(item) {
  const ext = getExtension(item).toLowerCase();
  const cat = EXT_MAP[ext] || inferFromMime(item.mime || '');
  return { def: ICON_DEFS[cat] || ICON_DEFS.generic, ext: ext.toUpperCase(), cat };
}

function inferFromMime(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('pdf'))      return 'pdf';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) return 'archive';
  if (mime.includes('text/') || mime.includes('javascript') || mime.includes('json')) return 'code';
  return 'generic';
}

function createFileIcon(item) {
  const { def, ext } = getIconDef(item);
  const color = def.color;
  const label = ext || def.label;

  const wrap = document.createElement('div');
  wrap.className = 'file-icon-wrap';
  wrap.style.setProperty('--fi-color', color);
  wrap.style.setProperty('--fi-bg', colorWithAlpha(color, 0.1));

  const header = document.createElement('div');
  header.className = 'fi-header';

  const body = document.createElement('div');
  body.className = 'fi-body';

  const iconEl = document.createElement('div');
  iconEl.className = 'fi-icon';
  iconEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${def.path}</svg>`;

  const extEl = document.createElement('span');
  extEl.className = 'fi-ext';
  extEl.textContent = label.slice(0, 5);

  body.appendChild(iconEl);
  body.appendChild(extEl);
  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

function colorWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ─────────────────────────────────────────────────────────────────────────
   State
   ───────────────────────────────────────────────────────────────────────── */
const state = {
  downloads:       [],
  selected:        new Set(),
  searchQuery:     '',
  sortBy:          'date-desc',
  filterStatus:    'all',
  dateFilterMode:  'all',   // 'all' | 'today' | 'yesterday' | 'range'
  dateFrom:        null,    // ISO date string 'YYYY-MM-DD' for range start
  dateTo:          null,    // ISO date string 'YYYY-MM-DD' for range end
  renderCount:     INITIAL_RENDER_COUNT,
  isLoading:       true,
  isRefreshing:    false,
  surface:         'panel',
  renderScheduled: false,
  availableDateMin: null,
  availableDateMax: null,
  extFilter:       'all',   // 'all' | lowercase ext e.g. 'pdf'
  themeMode:       'auto',  // 'auto' | 'light' | 'dark'
};

const modalState   = { resolve: null, lastFocused: null };
const speedHistory = new Map();
let   pollTimer    = null;
let   prevCounts   = {};

/* Batch-erase state — pending IDs are flushed in a microtask */
const pendingEraseIds  = new Set();
let   eraseFlushQueued = false;

/* ─────────────────────────────────────────────────────────────────────────
   DOM helpers
   ───────────────────────────────────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function setText(sel, value) {
  const node = $(sel);
  if (node) node.textContent = value;
  return node;
}

function setHtml(sel, value) {
  const node = $(sel);
  if (node) node.innerHTML = value;
  return node;
}

function toggleClass(sel, className, force) {
  const node = $(sel);
  if (node) node.classList.toggle(className, force);
  return node;
}

function setAttr(sel, name, value) {
  const node = $(sel);
  if (node) node.setAttribute(name, value);
  return node;
}

function removeAttr(sel, name) {
  const node = $(sel);
  if (node) node.removeAttribute(name);
  return node;
}

const urlParams = new URLSearchParams(location.search);
state.surface = urlParams.get('surface') === 'tab' ? 'tab' : 'panel';

/* ─────────────────────────────────────────────────────────────────────────
   Micro-interaction: ripple
   ───────────────────────────────────────────────────────────────────────── */
function addRipple(e) {
  const btn  = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const x    = e.clientX - rect.left - 20;
  const y    = e.clientY - rect.top  - 20;
  const rip  = document.createElement('span');
  rip.className = 'ripple';
  rip.style.cssText = `left:${x}px;top:${y}px`;
  btn.appendChild(rip);
  rip.addEventListener('animationend', () => rip.remove(), { once: true });
}
function attachRipple(el) { el.addEventListener('click', addRipple); }

/* ─────────────────────────────────────────────────────────────────────────
   Pure helpers
   ───────────────────────────────────────────────────────────────────────── */
function toTime(v) { const t = new Date(v || 0).getTime(); return Number.isFinite(t) ? t : 0; }

function shiftDay(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getSize(item) {
  return Math.max(item.fileSize || 0, item.totalBytes || 0, item.bytesReceived || 0);
}

function getFilename(item) {
  if (item.filename) {
    const norm  = item.filename.replace(/\\/g, '/');
    const parts = norm.split('/').filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  const url = item.finalUrl || item.url;
  if (url) {
    try {
      const seg = new URL(url).pathname.split('/').filter(Boolean).pop();
      if (seg) return decodeURIComponent(seg);
    } catch {
      const seg = url.split('/').filter(Boolean).pop();
      if (seg) return decodeURIComponent(seg.split('?')[0]);
    }
  }
  return `download-${item.id}`;
}

function getParentPath(item) {
  if (!item.filename) return '';
  const norm  = item.filename.replace(/\\/g, '/');
  const slash = norm.lastIndexOf('/');
  return slash > 0 ? norm.slice(0, slash) : '';
}

function getExtension(item) {
  const name = getFilename(item);
  const dot  = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1) : '';
}

function formatSize(bytes) {
  if (bytes == null || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx   = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${idx === 0 ? (bytes / Math.pow(1024, idx)) : (bytes / Math.pow(1024, idx)).toFixed(1)} ${units[idx]}`;
}

function formatRelDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000)      return 'Just now';
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 172_800_000) return 'Yesterday';
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return date.toLocaleDateString(undefined, { month:'short', day:'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year:'numeric' } : {}) });
}

function formatFullDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function truncateUrl(value, max = 58) {
  if (!value) return '—';
  try {
    const p = new URL(value);
    const d = p.hostname + p.pathname;
    return d.length > max ? `${d.slice(0, max)}…` : d;
  } catch {
    return value.length > max ? `${value.slice(0, max)}…` : value;
  }
}

function clampIsoDate(value, min, max) {
  if (!value) return null;
  let next = value;
  if (min && next < min) next = min;
  if (max && next > max) next = max;
  return next;
}

function getAvailableDateBounds(items = state.downloads) {
  const dated = items
    .map(item => item?.startTime ? new Date(item.startTime) : null)
    .filter(date => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  if (!dated.length) return { min: null, max: null };
  return {
    min: isoDateStr(dated[0]),
    max: isoDateStr(dated[dated.length - 1]),
  };
}

function formatDateInputLabel(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function syncDateInputs({ source = null } = {}) {
  const dateFromEl = $('#date-from');
  const dateToEl = $('#date-to');
  const hintEl = $('#date-range-hint');
  const applyBtn = $('#btn-apply-range');
  if (!dateFromEl || !dateToEl || !hintEl || !applyBtn) return;

  const { min, max } = getAvailableDateBounds();
  state.availableDateMin = min;
  state.availableDateMax = max;

  if (!min || !max) {
    dateFromEl.value = '';
    dateToEl.value = '';
    dateFromEl.min = '';
    dateFromEl.max = '';
    dateToEl.min = '';
    dateToEl.max = '';
    dateFromEl.disabled = true;
    dateToEl.disabled = true;
    applyBtn.disabled = true;
    hintEl.textContent = 'No dated downloads available yet.';
    return;
  }

  dateFromEl.disabled = false;
  dateToEl.disabled = false;
  applyBtn.disabled = false;

  let from = clampIsoDate(dateFromEl.value || state.dateFrom || min, min, max);
  let to = clampIsoDate(dateToEl.value || state.dateTo || max, min, max);

  if (from && to && from > to) {
    if (source === 'from') to = from;
    else if (source === 'to') from = to;
    else from = to;
  }

  dateFromEl.min = min;
  dateFromEl.max = to || max;
  dateToEl.min = from || min;
  dateToEl.max = max;
  dateFromEl.value = from || '';
  dateToEl.value = to || '';

  hintEl.textContent = `Available range: ${formatDateInputLabel(min)} – ${formatDateInputLabel(max)}`;
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function debounce(fn, wait) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
  return node;
}

/* ─────────────────────────────────────────────────────────────────────────
   Chrome API wrapper
   ───────────────────────────────────────────────────────────────────────── */
function invoke(api, method, ...args) {
  const fn = api?.[method];
  if (typeof fn !== 'function') return Promise.reject(new Error(`Missing API: ${method}`));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done  = (err, val) => { if (settled) return; settled = true; err ? reject(err) : resolve(val); };
    try {
      const cb = val => { const e = chrome.runtime.lastError; done(e ? new Error(e.message) : null, val); };
      const r  = fn.call(api, ...args, cb);
      if (r && typeof r.then === 'function') r.then(v => done(null, v)).catch(e => done(e));
    } catch (e) { done(e); }
  });
}

function sendMsg(payload) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(payload, r => {
        resolve(chrome.runtime.lastError ? { ok: false } : (r || { ok: false }));
      });
    } catch { resolve({ ok: false }); }
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Speed & ETA
   ───────────────────────────────────────────────────────────────────────── */
function recordSpeed(id, bytes) {
  if (bytes == null || bytes < 0) return;
  const now  = Date.now();
  const hist = speedHistory.get(id) || [];
  hist.push({ time: now, bytes });
  const cut = now - SPEED_WINDOW_MS;
  let i = 0;
  while (i < hist.length - 1 && hist[i].time < cut) i++;
  speedHistory.set(id, hist.slice(i));
}

function getSpeedBps(id) {
  const h = speedHistory.get(id);
  if (!h || h.length < 2) return null;
  const dt = (h[h.length - 1].time - h[0].time) / 1000;
  if (dt < 0.25) return null;
  const db = h[h.length - 1].bytes - h[0].bytes;
  return db < 0 ? null : db / dt;
}

function getEtaSec(item, bps) {
  if (!bps || bps <= 0 || !item.totalBytes) return null;
  const rem = (item.totalBytes - (item.bytesReceived || 0));
  return rem <= 0 ? null : rem / bps;
}

function fmtSpeed(bps) { return bps != null ? `${formatSize(bps)}/s` : null; }

function fmtEta(s) {
  if (s == null || !Number.isFinite(s) || s < 0) return null;
  if (s < 60)   return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

/* ─────────────────────────────────────────────────────────────────────────
   Polling — uses patchActiveCard instead of full renders
   ───────────────────────────────────────────────────────────────────────── */
function startPollIfNeeded() {
  const active = state.downloads.some(d => d.state === 'in_progress');
  if (active && !pollTimer)  pollTimer = setInterval(pollActive, POLL_INTERVAL_MS);
  else if (!active && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function pollActive() {
  try {
    const items = await invoke(chrome.downloads, 'search', { state: 'in_progress' });
    if (!Array.isArray(items) || !items.length) { clearInterval(pollTimer); pollTimer = null; return; }
    for (const u of items) {
      const ex = state.downloads.find(d => d.id === u.id);
      if (ex) { recordSpeed(u.id, u.bytesReceived); Object.assign(ex, u); patchActiveCard(ex); }
    }
    updateSidebarStats();
  } catch { /* ignore */ }
}

/* ─────────────────────────────────────────────────────────────────────────
   In-place card patching — avoids full list rebuild for progress updates
   ───────────────────────────────────────────────────────────────────────── */
/**
 * Patches a visible card's progress bar, status badge, and speed/ETA
 * without rebuilding the entire list.  Returns true if the card was found
 * in the DOM; false if it wasn't rendered (caller can decide what to do).
 */
function patchActiveCard(item) {
  const card = document.querySelector(`.dl-card[data-id="${item.id}"]`);
  if (!card) return false;

  const status = getStatusInfo(item);

  /* — Progress bar — */
  const progWrap = card.querySelector('.progress-wrap');
  const progFill = card.querySelector('.progress-fill');
  if (status.progress != null) {
    if (progFill) {
      progFill.style.width = `${status.progress}%`;
      progWrap?.setAttribute('aria-valuenow', String(status.progress));
    } else {
      // Card didn't previously have a bar (e.g. unknown total); inject it
      const info = card.querySelector('.file-info');
      if (info) {
        info.appendChild(el('div', {
          class:'progress-wrap', role:'progressbar',
          'aria-valuemin':'0', 'aria-valuemax':'100', 'aria-valuenow': String(status.progress),
        }, el('div', { class:'progress-fill', style:`width:${status.progress}%` })));
      }
    }
  } else if (progWrap) {
    progWrap.remove();
  }

  /* — Status badge (preserves the dot element to maintain pulse animation) — */
  const badge = card.querySelector('.status-badge');
  if (badge) {
    const existingDot = badge.querySelector('.badge-dot');
    badge.className = `status-badge ${status.cls}`;
    badge.innerHTML = '';
    if (status.dot) {
      badge.appendChild(existingDot || el('span', { class:'badge-dot' }));
    }
    badge.appendChild(document.createTextNode(' ' + status.label));
  }

  /* — Speed & ETA — remove stale, inject fresh — */
  const meta = card.querySelector('.file-meta');
  if (meta) {
    // Remove existing speed badge and its preceding dot
    const oldSpeed = meta.querySelector('.speed-badge');
    if (oldSpeed) {
      const prev = oldSpeed.previousElementSibling;
      if (prev?.classList.contains('meta-dot')) prev.remove();
      oldSpeed.remove();
    }
    // Remove existing ETA text
    meta.querySelector('.eta-text')?.remove();

    // Inject fresh speed/ETA if actively downloading
    if (item.state === 'in_progress' && !item.paused) {
      const bps = getSpeedBps(item.id);
      if (bps != null) {
        const spd = fmtSpeed(bps);
        const eta = fmtEta(getEtaSec(item, bps));
        if (spd) {
          meta.appendChild(el('span', { class:'meta-dot' }));
          meta.appendChild(el('span', { class:'speed-badge', text: spd }));
        }
        if (eta) meta.appendChild(el('span', { class:'eta-text', text: `· ${eta} left` }));
      }
    }
  }

  return true;
}

/* ─────────────────────────────────────────────────────────────────────────
   Status helpers
   ───────────────────────────────────────────────────────────────────────── */
function getStatusInfo(item) {
  if (item.state === 'complete') {
    if (item.exists === false)
      return { label: 'Missing',   cls: 'badge-missing',  dot: true, progress: null };
    return   { label: 'Complete',  cls: 'badge-complete', dot: true, progress: null };
  }
  if (item.state === 'in_progress') {
    if (item.paused)
      return { label: 'Paused',    cls: 'badge-paused',   dot: true, progress: progressPct(item) };
    const p = progressPct(item);
    return   { label: p != null ? `${p}%` : 'Downloading', cls: 'badge-progress', dot: true, progress: p };
  }
  if (item.state === 'interrupted') {
    return { label: INTERRUPT_LABELS[item.error] || item.error || 'Failed', cls: 'badge-failed', dot: true, progress: null };
  }
  return { label: item.state || 'Unknown', cls: 'badge-failed', dot: false, progress: null };
}

function progressPct(item) {
  if (!item.totalBytes || item.totalBytes <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((item.bytesReceived / item.totalBytes) * 100)));
}

/* ─────────────────────────────────────────────────────────────────────────
   Search highlighting
   ───────────────────────────────────────────────────────────────────────── */
function highlight(text, query) {
  if (!query || !text) return escapeHtml(text || '');
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return escapeHtml(text).replace(new RegExp(escapeHtml(esc), 'gi'), m => `<mark>${m}</mark>`);
  } catch { return escapeHtml(text); }
}

/* ─────────────────────────────────────────────────────────────────────────
   Filter / sort / group
   ───────────────────────────────────────────────────────────────────────── */
function getFiltered() {
  let items = state.downloads;
  switch (state.filterStatus) {
    case 'complete':    items = items.filter(d => d.state === 'complete' && d.exists !== false); break;
    case 'in_progress': items = items.filter(d => d.state === 'in_progress'); break;
    case 'failed':      items = items.filter(d => d.state === 'interrupted'); break;
    case 'missing':     items = items.filter(d => d.state === 'complete' && d.exists === false); break;
  }
  if (state.dateFilterMode !== 'all') {
    const todayStr     = isoDateStr(new Date());
    const yesterStr    = isoDateStr(shiftDay(new Date(), -1));
    items = items.filter(d => {
      if (!d.startTime) return false;
      const s = isoDateStr(new Date(d.startTime));
      if (state.dateFilterMode === 'today')     return s === todayStr;
      if (state.dateFilterMode === 'yesterday') return s === yesterStr;
      if (state.dateFilterMode === 'range') {
        if (state.dateFrom && s < state.dateFrom) return false;
        if (state.dateTo   && s > state.dateTo)   return false;
        return true;
      }
      return true;
    });
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    items = items.filter(d =>
      [getFilename(d), d.url, d.finalUrl, d.filename, getParentPath(d)]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }
  if (state.extFilter && state.extFilter !== 'all') {
    items = items.filter(d => getExtension(d).toLowerCase() === state.extFilter);
  }
  return [...items].sort(SORT_FNS[state.sortBy] || SORT_FNS['date-desc']);
}

function groupItems(items) {
  if (!state.sortBy.startsWith('date')) {
    const label = state.sortBy.startsWith('name') ? 'Sorted by name' : 'Sorted by size';
    return [{ label, items }];
  }
  const now    = new Date();
  const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const groups = [];
  const map    = new Map();
  for (const item of items) {
    const d   = new Date(item.startTime || 0);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let label = null;
    for (const g of DATE_GROUPS) { if (g.test(day, today)) { label = g.label; break; } }
    if (!label) label = Number.isNaN(d.getTime()) ? 'Unknown date' :
      d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!map.has(label)) { const b = { label, items: [] }; map.set(label, b); groups.push(b); }
    map.get(label).items.push(item);
  }
  return groups;
}

/* ─────────────────────────────────────────────────────────────────────────
   Rendering
   ───────────────────────────────────────────────────────────────────────── */
/** ISO date string from a Date object: 'YYYY-MM-DD' */
function isoDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Update the visible-count badge in the topbar-status */
function updateVisibleCountBar(filtered) {
  const el = $('#visible-count-bar');
  if (!el) return;
  const n = filtered.length;
  el.textContent = `${n} download${n !== 1 ? 's' : ''}`;
}

function scheduleRender() {
  if (state.renderScheduled) return;
  state.renderScheduled = true;
  requestAnimationFrame(() => { state.renderScheduled = false; renderAll(); });
}

function resetRenderCount() { state.renderCount = INITIAL_RENDER_COUNT; }

function pruneSelection() {
  const valid = new Set(getFiltered().map(d => d.id));
  for (const id of [...state.selected]) { if (!valid.has(id)) state.selected.delete(id); }
}

function renderAll() {
  toggleClass('#loading-state', 'hidden', !state.isLoading);
  syncDateInputs();
  if (state.isLoading) return;

  const filtered = getFiltered();
  const rendered = filtered.slice(0, state.renderCount);

  updateCounts(filtered);
  updateSummary(filtered, rendered);
  updateVisibleCountBar(filtered);
  updateBulkBar(filtered);
  updateFooter(filtered, rendered);
  setEmpty(filtered);
  buildExtChips();
  startPollIfNeeded();

  const list = $('#downloads-list');
  if (!list) return;
  list.innerHTML = '';
  if (!rendered.length) return;

  for (const group of groupItems(rendered)) {
    const sec = el('section', { class: 'date-group', 'data-label': group.label },
      el('h2', { class: 'date-group-label', text: group.label })
    );
    for (const item of group.items) sec.appendChild(buildCard(item));
    list.appendChild(sec);
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   updateCounts — updates sidebar stats including selection-aware total size
   ───────────────────────────────────────────────────────────────────────── */
function updateCounts(filtered) {
  const all = state.downloads;
  const c = {
    all:     all.length,
    done:    all.filter(d => d.state === 'complete' && d.exists !== false).length,
    active:  all.filter(d => d.state === 'in_progress').length,
    failed:  all.filter(d => d.state === 'interrupted').length,
    missing: all.filter(d => d.state === 'complete' && d.exists === false).length,
  };

  updateCount('#count-all',        c.all,     prevCounts.all);
  updateCount('#count-complete',   c.done,    prevCounts.done);
  updateCount('#count-inprogress', c.active,  prevCounts.active);
  updateCount('#count-failed',     c.failed,  prevCounts.failed);
  updateCount('#count-missing',    c.missing, prevCounts.missing);
  prevCounts = { ...c };

  setText('#visible-count', filtered.length);
  setText('#selected-total', state.selected.size);
  setText('#active-count', c.active || '—');

  // Total size: use selected subset when any items are selected, else all visible
  const sizeSource = state.selected.size > 0
    ? filtered.filter(d => state.selected.has(d.id))
    : filtered;
  const total = sizeSource.reduce((s, d) => s + getSize(d), 0);
  setText('#total-size', total > 0 ? formatSize(total) : '—');
}

/**
 * Lightweight stat update used by patchActiveCard / pollActive
 * — avoids a full renderAll() for progress-only changes.
 */
function updateSidebarStats() {
  const filtered = getFiltered();
  const all      = state.downloads;
  const c = {
    all:     all.length,
    done:    all.filter(d => d.state === 'complete' && d.exists !== false).length,
    active:  all.filter(d => d.state === 'in_progress').length,
    failed:  all.filter(d => d.state === 'interrupted').length,
    missing: all.filter(d => d.state === 'complete' && d.exists === false).length,
  };
  updateCount('#count-all',        c.all,     prevCounts.all);
  updateCount('#count-complete',   c.done,    prevCounts.done);
  updateCount('#count-inprogress', c.active,  prevCounts.active);
  updateCount('#count-failed',     c.failed,  prevCounts.failed);
  updateCount('#count-missing',    c.missing, prevCounts.missing);
  prevCounts = { ...c };

  setText('#visible-count', filtered.length);
  setText('#selected-total', state.selected.size);
  setText('#active-count', c.active || '—');

  const sizeSource = state.selected.size > 0
    ? filtered.filter(d => state.selected.has(d.id))
    : filtered;
  const total = sizeSource.reduce((s, d) => s + getSize(d), 0);
  setText('#total-size', total > 0 ? formatSize(total) : '—');
}

function updateCount(sel, next, prev) {
  const node = $(sel);
  if (!node) return;
  const ns = String(next);
  if (node.textContent !== ns) {
    node.textContent = ns;
    if (next !== prev) {
      node.classList.remove('popped');
      void node.offsetWidth;
      node.classList.add('popped');
    }
  }
}

function updateSummary(filtered, rendered) {
  const node = $('#results-summary');
  if (!node) return;
  const q    = state.searchQuery ? ` for "${state.searchQuery}"` : '';
  const name = { all:'downloads', complete:'complete files', in_progress:'active downloads',
    failed:'failed', missing:'missing files' }[state.filterStatus] || 'downloads';
  if (state.isLoading) { node.textContent = 'Loading…'; return; }
  if (!filtered.length) { node.textContent = `0 ${name}${q}`; return; }
  const shown = Math.min(rendered.length, filtered.length);
  node.textContent = shown < filtered.length
    ? `Showing ${shown} of ${filtered.length} ${name}${q}`
    : `${filtered.length} ${name}${q}`;
}

function updateBulkBar(filtered) {
  const bar  = $('#bulk-toolbar');
  const cnt  = state.selected.size;
  const vIds = filtered.map(d => d.id);
  const vSel = vIds.filter(id => state.selected.has(id)).length;

  if (bar) bar.classList.toggle('hidden', cnt === 0);
  if (cnt > 0) setText('#selected-count', `${cnt} selected`);

  const cb = $('#select-all');
  cb.checked       = Boolean(vIds.length) && vSel === vIds.length;
  cb.indeterminate = vSel > 0 && vSel < vIds.length;
  setText('#selected-total', cnt);
}

function updateFooter(filtered, rendered) {
  const footer  = $('#results-footer');
  const hasMore = rendered.length < filtered.length;
  if (!footer) return;
  if (!filtered.length) { footer.classList.add('hidden'); return; }
  footer.classList.remove('hidden');
  setText('#results-footer-text', hasMore
    ? `${filtered.length - rendered.length} more available`
    : '');
  toggleClass('#btn-load-more', 'hidden', !hasMore);
}

function setEmpty(filtered) {
  const emp = $('#empty-state');
  if (!emp) return;
  if (filtered.length) { emp.classList.add('hidden'); return; }
  emp.classList.remove('hidden');
  const msg = { complete:'No completed downloads', in_progress:'No active downloads',
    failed:'No failed downloads', missing:'No missing files' };
  setText('#empty-message', state.searchQuery
    ? `No results for "${state.searchQuery}"`
    : (msg[state.filterStatus] || 'No downloads yet'));
}

/* ─────────────────────────────────────────────────────────────────────────
   Card builder
   ───────────────────────────────────────────────────────────────────────── */
function buildCard(item) {
  const status     = getStatusInfo(item);
  const filename   = getFilename(item);
  const isSelected = state.selected.has(item.id);
  const isComplete = item.state === 'complete' && item.exists !== false;
  const isMissing  = item.state === 'complete' && item.exists === false;
  const isActive   = item.state === 'in_progress';
  const canAgain   = Boolean(item.finalUrl || item.url);
  const q          = state.searchQuery;

  const classes = ['dl-card',
    isSelected ? 'is-selected' : '',
    isMissing  ? 'is-missing'  : '',
    isActive   ? 'is-active'   : '',
  ].filter(Boolean).join(' ');

  const card = el('article', {
    class: classes,
    role:  'listitem',
    'data-id': item.id,
    oncontextmenu: e => showCtxMenu(e, item),
    ondblclick: () => { if (isComplete) openFile(item.id); },
    onclick: e => {
      // Don't intercept clicks on interactive children
      if (e.target.closest('button, a, input, label')) return;
      toggleSel(item.id);
    },
  });

  /* Checkbox */
  const cb = el('input', { class:'item-check', type:'checkbox', 'aria-label':`Select ${filename}` });
  cb.checked = isSelected;
  cb.addEventListener('change', () => toggleSel(item.id));

  /* File icon */
  const iconWrap = createFileIcon(item);

  /* Info */
  const nameEl = el('div', { class:'file-name', title: filename });
  nameEl.innerHTML = q ? highlight(filename, q) : escapeHtml(filename);

  const urlVal = item.finalUrl || item.url || '';
  const urlEl  = el('div', { class:'file-url' });
  if (urlVal) {
    const a = el('a', { href:urlVal, target:'_blank', rel:'noopener noreferrer', title:urlVal });
    a.innerHTML = q ? highlight(truncateUrl(urlVal), q) : escapeHtml(truncateUrl(urlVal));
    urlEl.appendChild(a);
  } else {
    urlEl.textContent = 'No source URL';
  }

  const pathEl = el('div', { class:'file-path', title: item.filename || '',
    text: item.filename || 'Path unavailable' });

  /* Meta row */
  const meta = el('div', { class:'file-meta' });

  const addMeta = (text, title) => {
    const s = el('span', { class:'meta-text' }); s.textContent = text;
    if (title) s.title = title;
    meta.appendChild(s);
  };
  const dot = () => meta.appendChild(el('span', { class:'meta-dot' }));

  addMeta(formatSize(getSize(item)));
  dot();
  addMeta(formatRelDate(item.startTime), formatFullDate(item.startTime));
  dot();

  /* Status badge */
  const badge = el('span', { class:`status-badge ${status.cls}` });
  if (status.dot) badge.appendChild(el('span', { class:'badge-dot' }));
  badge.appendChild(document.createTextNode(' ' + status.label));
  meta.appendChild(badge);

  /* Speed & ETA for active downloads */
  if (isActive && !item.paused) {
    const bps = getSpeedBps(item.id);
    if (bps != null) {
      const spd = fmtSpeed(bps);
      const eta = fmtEta(getEtaSec(item, bps));
      if (spd) {
        dot();
        meta.appendChild(el('span', { class:'speed-badge', text: spd }));
      }
      if (eta) meta.appendChild(el('span', { class:'eta-text', text: `· ${eta} left` }));
    }
  }

  const info = el('div', { class:'file-info' }, nameEl, urlEl, pathEl, meta);

  /* Progress bar */
  if (isActive && status.progress != null) {
    info.appendChild(el('div', {
      class:'progress-wrap', role:'progressbar',
      'aria-valuemin':'0', 'aria-valuemax':'100', 'aria-valuenow': String(status.progress),
    }, el('div', { class:'progress-fill', style:`width:${status.progress}%` })));
  }

  /* Actions */
  const actions = el('div', { class:'item-actions' });

  if (isComplete) {
    actions.appendChild(mkBtn(btnIcon('open',   'Open'),   () => openFile(item.id),   `Open ${filename}`));
    actions.appendChild(mkBtn(btnIcon('reveal', 'Reveal'), () => revealFile(item.id), `Reveal ${filename} in folder`));
  } else if (isActive) {
    const pauseLabel = item.paused ? 'Resume' : 'Pause';
    const pauseKey   = item.paused ? 'resume' : 'pause';
    actions.appendChild(mkBtn(btnIcon(pauseKey, pauseLabel),
      () => item.paused ? resumeDl(item.id) : pauseDl(item.id),
      `${pauseLabel} ${filename}`));
    const cBtn = mkBtn(btnIcon('cancel', 'Cancel'), () => cancelDl(item.id), `Cancel ${filename}`);
    cBtn.classList.add('btn-cancel');
    actions.appendChild(cBtn);
  } else if (canAgain) {
    actions.appendChild(mkBtn(btnIcon('again', 'Again'), () => dlAgain(item), `Download ${filename} again`));
  }

  /* Delete button — always does delete+erase for one-click cleanup */
  const delHtml = isMissing
    ? btnIcon('delete', 'Gone')
    : btnIcon('delete', 'Delete');
  const delBtn = mkBtn(delHtml, () => deleteAndErase(item.id), `Delete ${filename}`);
  delBtn.disabled = isMissing || (!isComplete && !isMissing);
  delBtn.classList.add('btn-delete');
  actions.appendChild(delBtn);

  const moreBtn = mkBtn(btnIcon('more'), e => { e.stopPropagation(); showCtxMenu(e, item); },
    `More options for ${filename}`, 'btn-more');
  actions.appendChild(moreBtn);

  card.append(cb, iconWrap, info, actions);
  return card;
}

/** Create an action button with HTML content (SVG icon + optional label). */
function mkBtn(htmlContent, handler, ariaLabel, extra = '') {
  const b = document.createElement('button');
  b.className = `action-btn glass-btn ${extra}`.trim();
  b.type = 'button';
  b.setAttribute('aria-label', ariaLabel);
  b.innerHTML = htmlContent;
  b.addEventListener('click', e => { e.stopPropagation(); handler(e); });
  attachRipple(b);
  return b;
}

/* ─────────────────────────────────────────────────────────────────────────
   Selection
   ───────────────────────────────────────────────────────────────────────── */
function toggleSel(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  scheduleRender();
}

function clearSel() { state.selected.clear(); scheduleRender(); }

function selectAllFiltered() {
  const filtered = getFiltered();
  const allSel   = filtered.every(d => state.selected.has(d.id));
  if (allSel) filtered.forEach(d => state.selected.delete(d.id));
  else        filtered.forEach(d => state.selected.add(d.id));
  scheduleRender();
}

/* ─────────────────────────────────────────────────────────────────────────
   Modal
   ───────────────────────────────────────────────────────────────────────── */
function showModal({ title, bodyHtml, confirmLabel = 'Confirm', confirmCls = 'danger-btn', icon = '' }) {
  return new Promise(resolve => {
    modalState.lastFocused = document.activeElement;
    modalState.resolve     = resolve;
    setText('#modal-icon', icon);
    setText('#modal-title', title);
    setHtml('#modal-body', bodyHtml);
    const confirmBtn = $('#modal-confirm');
    confirmBtn.className = `glass-btn modal-btn ${confirmCls}`;
    if (confirmBtn) confirmBtn.textContent = confirmLabel;
    toggleClass('#modal-overlay', 'hidden', false);
    confirmBtn?.focus();
  });
}

function closeModal(confirmed) {
  toggleClass('#modal-overlay', 'hidden', true);
  modalState.resolve?.(confirmed);
  modalState.resolve = null;
  modalState.lastFocused?.focus();
  modalState.lastFocused = null;
}

/* ─────────────────────────────────────────────────────────────────────────
   Toasts
   ───────────────────────────────────────────────────────────────────────── */
const TOAST_ICONS = {
  success: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  warning: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

function toast(message, type = 'info', duration = 4000) {
  const container = $('#toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;

  const ind = document.createElement('div');
  ind.className = 'toast-indicator';
  ind.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;

  const msg = document.createElement('span');
  msg.textContent = message;

  const cls = document.createElement('button');
  cls.className = 'toast-close-btn';
  cls.setAttribute('aria-label', 'Dismiss');
  cls.innerHTML = '×';
  cls.addEventListener('click', () => removeToast(t));

  t.append(ind, msg, cls);
  container.appendChild(t);

  if (duration > 0) setTimeout(() => removeToast(t), duration);
}

function removeToast(t) {
  if (!t.isConnected || t.classList.contains('toast-removing')) return;
  t.classList.add('toast-removing');
  t.addEventListener('animationend', () => t.remove(), { once: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   Context menu
   ───────────────────────────────────────────────────────────────────────── */
function hideCtx() {
  const m = $('#context-menu');
  if (!m) return;
  m.classList.add('hidden');
  m.innerHTML = '';
}

function ctxSvg(paths) {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function addCtxItem(menu, { iconHtml, label, onClick, danger = false, disabled = false }) {
  const btn = document.createElement('button');
  btn.className = ['ctx-item', danger ? 'ctx-danger' : '', disabled ? 'ctx-disabled' : ''].filter(Boolean).join(' ');
  btn.type = 'button';
  btn.setAttribute('role', 'menuitem');
  btn.disabled = disabled;

  const iconEl = document.createElement('span');
  iconEl.className = 'ctx-icon';
  iconEl.innerHTML = iconHtml;

  const lbl = document.createElement('span');
  lbl.textContent = label;

  btn.append(iconEl, lbl);
  if (!disabled && onClick) btn.addEventListener('click', () => { hideCtx(); onClick(); });
  attachRipple(btn);
  menu.appendChild(btn);
}

function ctxDiv(menu) {
  const d = document.createElement('div');
  d.className = 'ctx-sep';
  d.setAttribute('role', 'separator');
  menu.appendChild(d);
}

/* Focus trap for modal accessibility */
function trapTab(e) {
  const overlay = $('#modal-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  if (e.key !== 'Tab') return;
  const focusable = $$('button:not(:disabled), [href], input, select', overlay);
  if (!focusable.length) return;
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey) { if (document.activeElement === first) { last.focus(); e.preventDefault(); } }
  else            { if (document.activeElement === last)  { first.focus(); e.preventDefault(); } }
}

function showCtxMenu(e, item) {
  e.preventDefault();
  hideCtx();

  const isComplete = item.state === 'complete' && item.exists !== false;
  const isMissing  = item.state === 'complete' && item.exists === false;
  const isActive   = item.state === 'in_progress';
  const canAgain   = Boolean(item.finalUrl || item.url);
  const menu       = $('#context-menu');
  menu.innerHTML   = '';
  menu.classList.remove('hidden');
  menu.setAttribute('role', 'menu');

  if (isComplete) {
    addCtxItem(menu, { iconHtml: ctxSvg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'), label:'Open file', onClick:()=>openFile(item.id) });
    addCtxItem(menu, { iconHtml: ctxSvg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'), label:'Reveal in folder', onClick:()=>revealFile(item.id) });
    ctxDiv(menu);
  }
  if (isActive) {
    addCtxItem(menu, { iconHtml: item.paused
      ? ctxSvg('<polygon points="5 3 19 12 5 21 5 3"/>')
      : ctxSvg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
      label: item.paused ? 'Resume' : 'Pause',
      onClick: () => item.paused ? resumeDl(item.id) : pauseDl(item.id) });
    addCtxItem(menu, { iconHtml: ctxSvg('<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'), label:'Cancel download', danger:true, onClick:()=>cancelDl(item.id) });
    ctxDiv(menu);
  }
  if (canAgain && !isActive) {
    addCtxItem(menu, { iconHtml: ctxSvg('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'), label:'Download again', onClick:()=>dlAgain(item) });
    ctxDiv(menu);
  }
  addCtxItem(menu, { iconHtml: ctxSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'), label:'Delete file from disk', disabled:!isComplete||isMissing, onClick:()=>deleteFromDisk(item.id) });
  addCtxItem(menu, { iconHtml: ctxSvg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="5" y1="3" x2="19" y2="21"/>'), label:'Delete + remove history', danger:true, disabled:!isComplete||isMissing, onClick:()=>deleteAndErase(item.id) });
  ctxDiv(menu);
  addCtxItem(menu, { iconHtml: ctxSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'), label:'Remove from history', onClick:()=>eraseHistory(item.id) });
  addCtxItem(menu, { iconHtml: ctxSvg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'), label:'Copy URL', disabled:!item.url&&!item.finalUrl, onClick:async()=>{ try{ await navigator.clipboard.writeText(item.finalUrl||item.url); toast('URL copied.','success'); }catch{ toast('Clipboard failed.','error'); }} });
  addCtxItem(menu, { iconHtml: ctxSvg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'), label:'Copy file path', disabled:!item.filename, onClick:async()=>{ try{ await navigator.clipboard.writeText(item.filename); toast('Path copied.','success'); }catch{ toast('Clipboard failed.','error'); }} });
  addCtxItem(menu, { iconHtml: ctxSvg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'), label:'Copy filename', onClick:async()=>{ try{ await navigator.clipboard.writeText(getFilename(item)); toast('Filename copied.','success'); }catch{ toast('Clipboard failed.','error'); }} });

  /* Position — keep within viewport */
  document.body.appendChild(menu);
  requestAnimationFrame(() => {
    const r  = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let   x  = e.clientX;
    let   y  = e.clientY;
    if (x + r.width  + 10 > vw) x = vw - r.width  - 10;
    if (y + r.height + 10 > vh) y = vh - r.height - 10;
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top  = `${Math.max(8, y)}px`;
    // Hint CSS transform-origin
    menu.style.setProperty('--ctx-origin', `${e.clientX < vw/2 ? 'left' : 'right'} ${e.clientY < vh/2 ? 'top' : 'bottom'}`);
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Download operations
   ───────────────────────────────────────────────────────────────────────── */
async function openFile(id) {
  try { await invoke(chrome.downloads, 'open', id); }
  catch(e) { toast(`Could not open: ${e.message}`, 'error'); }
}

/** Reveal in Finder/Explorer — fire-and-forget to avoid stalls on some forks */
function revealFile(id) {
  try { void chrome.downloads.show(id); }
  catch(e) { toast(`Could not reveal: ${e.message}`, 'error'); }
}

async function pauseDl(id) {
  try { await invoke(chrome.downloads, 'pause', id);  toast('Paused.',   'info',    2200); }
  catch(e) { toast(`Pause failed: ${e.message}`, 'error'); }
}

async function resumeDl(id) {
  try { await invoke(chrome.downloads, 'resume', id); toast('Resumed.', 'success', 2200); }
  catch(e) { toast(`Resume failed: ${e.message}`, 'error'); }
}

async function cancelDl(id) {
  const item = state.downloads.find(d => d.id === id);
  if (!item) return;
  const ok = await showModal({
    title: 'Cancel download?',
    bodyHtml: `<strong>${escapeHtml(getFilename(item))}</strong> will stop and any partial file removed.`,
    confirmLabel: 'Cancel download', confirmCls: 'danger-btn', icon: '⏹️',
  });
  if (!ok) return;
  try { await invoke(chrome.downloads, 'cancel', id); toast('Download cancelled.', 'info', 2800); }
  catch(e) { toast(`Cancel failed: ${e.message}`, 'error'); }
}

async function dlAgain(item) {
  const url = item.finalUrl || item.url;
  if (!url) { toast('No source URL.', 'warning'); return; }
  try { await invoke(chrome.downloads, 'download', { url, saveAs: false }); toast('Download started again.', 'success'); }
  catch(e) { toast(`Could not restart: ${e.message}`, 'error'); }
}

function markMissing(id) {
  const item = state.downloads.find(d => d.id === id);
  if (item) item.exists = false;
}

async function deleteFromDisk(id, { skipConfirm = false } = {}) {
  const item = state.downloads.find(d => d.id === id);
  if (!item) return false;
  if (!skipConfirm) {
    const ok = await showModal({
      title: 'Delete file from disk?',
      bodyHtml: `<strong>${escapeHtml(getFilename(item))}</strong> will be permanently removed. History record stays.`,
      confirmLabel: 'Delete file', confirmCls: 'danger-btn', icon: '🗑️',
    });
    if (!ok) return false;
  }
  try {
    await invoke(chrome.downloads, 'removeFile', id);
    markMissing(id); toast(`Deleted "${getFilename(item)}".`, 'success'); scheduleRender(); return true;
  } catch(e) {
    if (/not exist|already|No such/i.test(e.message)) {
      markMissing(id); toast('File was already missing.', 'warning'); scheduleRender(); return true;
    }
    toast(`Delete failed: ${e.message}`, 'error'); return false;
  }
}

async function eraseHistory(id, { skipConfirm = false } = {}) {
  const item = state.downloads.find(d => d.id === id);
  if (!item) return false;
  if (!skipConfirm) {
    const ok = await showModal({
      title: 'Remove from history?',
      bodyHtml: `<strong>${escapeHtml(getFilename(item))}</strong> removed from history. File on disk untouched.`,
      confirmLabel: 'Remove', confirmCls: 'ghost-btn', icon: '📋',
    });
    if (!ok) return false;
  }
  try { await invoke(chrome.downloads, 'erase', { id }); toast('Removed from history.', 'success'); return true; }
  catch(e) { toast(`Removal failed: ${e.message}`, 'error'); return false; }
}

/**
 * Delete the file from disk AND remove the history record.
 * This is what the per-item "Delete" card button calls.
 */
async function deleteAndErase(id) {
  const item = state.downloads.find(d => d.id === id);
  if (!item) return;
  const isComplete = item.state === 'complete' && item.exists !== false;
  if (!isComplete) {
    // If file is missing or not complete, just erase history
    await eraseHistory(id);
    return;
  }
  const ok = await showModal({
    title: 'Delete + remove history?',
    bodyHtml: `<strong>${escapeHtml(getFilename(item))}</strong> will be deleted from disk and removed from history.`,
    confirmLabel: 'Delete + remove', confirmCls: 'danger-btn', icon: '🗑️',
  });
  if (!ok) return;
  await deleteFromDisk(id, { skipConfirm: true });
  await eraseHistory(id,   { skipConfirm: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   Bulk operations
   ───────────────────────────────────────────────────────────────────────── */
async function bulkDelete() {
  const sel  = getFiltered().filter(d => state.selected.has(d.id));
  const elig = sel.filter(d => d.state === 'complete' && d.exists !== false);
  if (!elig.length) { toast('No eligible items.', 'warning'); return; }

  const list = elig.map(d => `<li>${escapeHtml(getFilename(d))}</li>`).join('');
  const skip = sel.length - elig.length;
  const ok   = await showModal({
    title: `Delete + remove ${elig.length} item${elig.length === 1 ? '' : 's'}?`,
    bodyHtml: `Files will be deleted from disk and removed from history.<ul class="modal-file-list">${list}</ul>${skip ? `<p style="margin-top:8px">${skip} item${skip === 1 ? '' : 's'} skipped (not complete or already missing).</p>` : ''}`,
    confirmLabel: `Delete ${elig.length}`, confirmCls: 'danger-btn', icon: '🗑️',
  });
  if (!ok) return;

  let done = 0;
  for (const d of elig) {
    const ok1 = await deleteFromDisk(d.id, { skipConfirm: true });
    await eraseHistory(d.id, { skipConfirm: true });
    if (ok1) done++;
  }
  toast(`Deleted ${done} of ${elig.length}.`, done === elig.length ? 'success' : 'warning');
  clearSel();
}

async function bulkErase() {
  const ids = [...state.selected];
  if (!ids.length) return;
  const ok = await showModal({
    title: `Remove ${ids.length} from history?`,
    bodyHtml: 'Files on disk are untouched.',
    confirmLabel: 'Remove history', confirmCls: 'ghost-btn', icon: '📋',
  });
  if (!ok) return;
  let done = 0;
  for (const id of ids) { if (await eraseHistory(id, { skipConfirm: true })) done++; }
  toast(`Removed ${done}.`, 'success');
  clearSel();
}

async function clearAll() {
  if (!state.downloads.length) return;
  const ok = await showModal({
    title: 'Clear all download history?',
    bodyHtml: `All ${state.downloads.length} records removed. Files on disk unaffected.`,
    confirmLabel: 'Clear history', confirmCls: 'ghost-btn', icon: '🗂️',
  });
  if (!ok) return;
  try {
    await invoke(chrome.downloads, 'erase', {});
    state.downloads = []; speedHistory.clear();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    clearSel(); scheduleRender(); toast('History cleared.', 'success');
  } catch(e) { toast(`Failed: ${e.message}`, 'error'); }
}

/* ─────────────────────────────────────────────────────────────────────────
   Sidebar toggle
   ───────────────────────────────────────────────────────────────────────── */
function handleSidebarToggle() {
  const app = $('#app');
  if (window.innerWidth <= 1080) {
    const open = app.classList.contains('sidebar-open');
    app.classList.toggle('sidebar-open', !open);
    toggleClass('#sidebar-overlay', 'hidden', open);
    setAttr('#btn-sidebar-toggle', 'aria-expanded', String(!open));
  } else {
    const collapsed = app.classList.contains('sidebar-collapsed');
    app.classList.toggle('sidebar-collapsed', !collapsed);
    setAttr('#btn-sidebar-toggle', 'aria-expanded', String(collapsed));
    persistPrefs();
  }
}

function closeMobileSidebar() {
  $('#app').classList.remove('sidebar-open');
  toggleClass('#sidebar-overlay', 'hidden', true);
  setAttr('#btn-sidebar-toggle', 'aria-expanded', 'false');
}

/* ─────────────────────────────────────────────────────────────────────────
   Prefs
   ───────────────────────────────────────────────────────────────────────── */
function persistPrefs() {
  invoke(chrome.storage.local, 'set', { [PREFS_KEY]: {
    sortBy:           state.sortBy,
    filterStatus:     state.filterStatus,
    sidebarCollapsed: $('#app').classList.contains('sidebar-collapsed'),
  }}).catch(() => {});
}

async function restorePrefs() {
  try {
    const r = await invoke(chrome.storage.local, 'get', { [PREFS_KEY]: null });
    const p = r?.[PREFS_KEY];
    if (!p) return;
    if (p.sortBy && SORT_FNS[p.sortBy]) state.sortBy = p.sortBy;
    if (p.filterStatus) state.filterStatus = p.filterStatus;
    if (p.sidebarCollapsed && window.innerWidth > 1080) {
      $('#app').classList.add('sidebar-collapsed');
      setAttr('#btn-sidebar-toggle', 'aria-expanded', 'false');
    }
  } catch { /* ignore */ }
}

/* ─────────────────────────────────────────────────────────────────────────
   Load / refresh
   ───────────────────────────────────────────────────────────────────────── */
async function loadDownloads({ silent = false } = {}) {
  if (!silent) state.isLoading = true;
  try {
    const items = await invoke(chrome.downloads, 'search', { orderBy: ['-startTime'], limit: 0 });
    state.downloads = Array.isArray(items) ? items : [];
  } finally { state.isLoading = false; }
}

async function refresh() {
  if (state.isRefreshing) return;
  state.isRefreshing = true;
  const btn = $('#btn-refresh');
  if (btn) btn.setAttribute('aria-busy', 'true');
  try {
    await loadDownloads({ silent: true });
    toast('Refreshed.', 'info', 2400);
    scheduleRender();
  } catch(e) { toast(`Refresh failed: ${e.message}`, 'error'); }
  finally { state.isRefreshing = false; if (btn) btn.removeAttribute('aria-busy'); }
}

/* ─────────────────────────────────────────────────────────────────────────
   Chrome event listeners
   ───────────────────────────────────────────────────────────────────────── */
function bindChrome() {
  /* New download — prepend to state and render */
  chrome.downloads.onCreated.addListener(item => {
    state.downloads.unshift(item);
    startPollIfNeeded();
    scheduleRender();
  });

  /* Download changed — patch in place for progress-only; full render for structural changes */
  chrome.downloads.onChanged.addListener(delta => {
    const item = state.downloads.find(d => d.id === delta.id);
    if (!item) return;

    // Snapshot before applying delta
    const prevState  = item.state;
    const prevPaused = item.paused;

    // Apply delta to cached state
    for (const [k, v] of Object.entries(delta)) {
      if (k === 'id') continue;
      if (v && typeof v === 'object' && 'current' in v) item[k] = v.current;
    }
    // Clear speed data when download finishes/fails
    if (delta.state?.current && delta.state.current !== 'in_progress') {
      speedHistory.delete(delta.id);
    }
    startPollIfNeeded();

    // Decide: progress-only patch (no structural change) vs full render
    const stateChanged  = item.state  !== prevState;
    const pauseChanged  = item.paused !== prevPaused;
    const hasFilenameChange = Boolean(delta.filename);
    const hasError          = Boolean(delta.error);

    const isProgressOnly =
      !stateChanged &&
      !pauseChanged &&
      !hasFilenameChange &&
      !hasError &&
      item.state === 'in_progress';

    if (isProgressOnly) {
      // Update speed history from delta bytes if available
      if (item.bytesReceived != null) recordSpeed(item.id, item.bytesReceived);
      patchActiveCard(item);
      updateSidebarStats();
    } else {
      // Structural change (state transition, pause, completion, error) — full render
      scheduleRender();
    }
  });

  /* Erased — batch rapid consecutive erasures into a single state mutation + render */
  chrome.downloads.onErased.addListener(id => {
    pendingEraseIds.add(id);
    if (eraseFlushQueued) return;
    eraseFlushQueued = true;
    Promise.resolve().then(() => {
      eraseFlushQueued = false;
      if (!pendingEraseIds.size) return;
      // Single pass filter for all pending IDs
      state.downloads = state.downloads.filter(d => !pendingEraseIds.has(d.id));
      for (const eid of pendingEraseIds) {
        state.selected.delete(eid);
        speedHistory.delete(eid);
      }
      pendingEraseIds.clear();
      scheduleRender();
    });
  });
}


/* ─────────────────────────────────────────────────────────────────────────
   Theme management
   ───────────────────────────────────────────────────────────────────────── */
const THEME_CYCLE  = ['auto', 'light', 'dark'];
const THEME_LABELS = { auto: 'Mode: Automatic', light: 'Mode: Light', dark: 'Mode: Dark' };

function applyTheme(mode) {
  state.themeMode = mode;
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  if (mode === 'light') root.setAttribute('data-theme', 'light');
  if (mode === 'dark')  root.setAttribute('data-theme', 'dark');

  const btn   = $('#btn-theme');
  const label = $('#theme-btn-label');
  if (btn) {
    btn.dataset.themeMode = mode;
  }
  if (label) label.textContent = THEME_LABELS[mode];
  invoke(chrome.storage.local, 'set', { dlMgrTheme: mode }).catch(() => {});
}

function cycleTheme() {
  const idx = THEME_CYCLE.indexOf(state.themeMode);
  applyTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
}

async function restoreTheme() {
  try {
    const r = await invoke(chrome.storage.local, 'get', { dlMgrTheme: 'auto' });
    applyTheme(r?.dlMgrTheme || 'auto');
  } catch { applyTheme('auto'); }
}

/* ─────────────────────────────────────────────────────────────────────────
   Extension filter
   ───────────────────────────────────────────────────────────────────────── */
/** Category colour map matching ICON_DEFS */
const EXT_COLORS = {
  image:'#a78bfa', video:'#f87171', audio:'#34d399', pdf:'#f87171',
  doc:'#60a5fa',   sheet:'#4ade80', slide:'#fb923c', archive:'#fbbf24',
  code:'#22d3ee',  exe:'#94a3b8',   font:'#c084fc',  disk:'#f472b6',
  torrent:'#38bdf8', generic:'#64748b',
};
function getExtColor(ext) {
  const cat = EXT_MAP[ext.toLowerCase()] || 'generic';
  return EXT_COLORS[cat] || EXT_COLORS.generic;
}

/** Sorted list of {ext, count} present in current downloads */
function getAvailableExtensions() {
  const counts = new Map();
  for (const d of state.downloads) {
    const ext = getExtension(d).toLowerCase();
    if (!ext) continue;
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([ext, count]) => ({ ext, count }));
}

function buildExtChips() {
  const chipList = $('#ext-chip-list');
  const popover  = $('#ext-popover');
  const btn      = $('#btn-ext-filter');
  const clearBtn = $('#btn-clear-ext');
  const lbl      = $('#ext-filter-label');
  if (!chipList) return;

  const exts = getAvailableExtensions();

  // Show/hide popover btn if no exts
  if (btn) btn.classList.toggle('hidden', !exts.length);

  chipList.innerHTML = '';
  for (const { ext, count } of exts) {
    const chip = document.createElement('button');
    chip.type      = 'button';
    chip.className = 'ext-chip' + (state.extFilter === ext ? ' active' : '');
    chip.dataset.ext = ext;
    chip.setAttribute('aria-pressed', String(state.extFilter === ext));
    chip.title = `${count} file${count !== 1 ? 's' : ''}`;

    const dot = document.createElement('span');
    dot.className = 'ext-chip-dot';
    dot.style.background = getExtColor(ext);

    const lbEl = document.createElement('span');
    lbEl.textContent = ext.toUpperCase();

    const ctEl = document.createElement('span');
    ctEl.className = 'ext-chip-count';
    ctEl.textContent = count;

    chip.append(dot, lbEl, ctEl);
    chip.addEventListener('click', () => {
      applyExtFilter(ext === state.extFilter ? 'all' : ext);
      closeExtPopover();
    });
    attachRipple(chip);
    chipList.appendChild(chip);
  }

  const isFiltered = state.extFilter !== 'all';
  if (clearBtn) clearBtn.classList.toggle('hidden', !isFiltered);
  if (btn)      btn.classList.toggle('is-active', isFiltered);
  if (lbl)      lbl.textContent = isFiltered ? state.extFilter.toUpperCase() : 'All types';

  // Update visible count bar accent
  const vcBar = $('#visible-count-bar');
  if (vcBar) vcBar.classList.toggle('filtered', isFiltered || state.dateFilterMode !== 'all');
}

function applyExtFilter(ext) {
  state.extFilter = ext || 'all';
  resetRenderCount(); pruneSelection(); scheduleRender();
}

function openExtPopover() {
  const p = $('#ext-popover');
  const b = $('#btn-ext-filter');
  if (p) p.classList.remove('hidden');
  if (b) b.setAttribute('aria-expanded', 'true');
}
function closeExtPopover() {
  const p = $('#ext-popover');
  const b = $('#btn-ext-filter');
  if (p) p.classList.add('hidden');
  if (b) b.setAttribute('aria-expanded', 'false');
}
function toggleExtPopover() {
  const p = $('#ext-popover');
  if (!p) return;
  p.classList.contains('hidden') ? openExtPopover() : closeExtPopover();
}

/* ─────────────────────────────────────────────────────────────────────────
   UI wiring
   ───────────────────────────────────────────────────────────────────────── */
function wire() {
  $$('.glass-btn, .filter-tab').forEach(attachRipple);

  // ── Date filter popover ──────────────────────────────────
  const dateFilterWrap = $('#date-filter-wrap');
  const datePopover    = $('#date-popover');
  const btnDateFilter  = $('#btn-date-filter');
  const btnClearDate   = $('#btn-clear-date');
  const dateFromEl     = $('#date-from');
  const dateToEl       = $('#date-to');
  const dateFilterLbl  = $('#date-filter-label');

  syncDateInputs();

  function openDatePopover() {
    syncDateInputs();
    datePopover.classList.remove('hidden');
    if (btnDateFilter) btnDateFilter.setAttribute('aria-expanded', 'true');
  }
  function closeDatePopover() {
    datePopover.classList.add('hidden');
    if (btnDateFilter) btnDateFilter.setAttribute('aria-expanded', 'false');
  }
  function toggleDatePopover() {
    datePopover.classList.contains('hidden') ? openDatePopover() : closeDatePopover();
  }

  function applyDateMode(mode, from, to) {
    const min = state.availableDateMin;
    const max = state.availableDateMax;
    state.dateFilterMode = mode;
    state.dateFrom = mode === 'range' ? clampIsoDate(from || min, min, max) : null;
    state.dateTo   = mode === 'range' ? clampIsoDate(to || max, min, max) : null;

    if (mode === 'range' && state.dateFrom && state.dateTo && state.dateFrom > state.dateTo) {
      state.dateTo = state.dateFrom;
    }

    $$('.date-opt', datePopover).forEach(b =>
      b.classList.toggle('active', b.dataset.dateOpt === mode)
    );

    if (mode === 'range' && state.dateFrom && state.dateTo) {
      if (dateFilterLbl) dateFilterLbl.textContent = `${formatDateInputLabel(state.dateFrom)} – ${formatDateInputLabel(state.dateTo)}`;
      dateFromEl.value = state.dateFrom;
      dateToEl.value = state.dateTo;
    } else {
      const labels = { all: 'To date', today: 'Today', yesterday: 'Yesterday', range: 'Custom range' };
      if (dateFilterLbl) dateFilterLbl.textContent = labels[mode] || 'To date';
      syncDateInputs();
    }

    const isFiltered = mode !== 'all';
    if (btnClearDate) btnClearDate.classList.toggle('hidden', !isFiltered);
    if (btnDateFilter) btnDateFilter.classList.toggle('is-active', isFiltered);
    resetRenderCount(); pruneSelection(); scheduleRender();
    closeDatePopover();
  }

  btnDateFilter.addEventListener('click', e => { e.stopPropagation(); toggleDatePopover(); });

  $$('.date-opt', datePopover).forEach(btn => {
    btn.addEventListener('click', () => applyDateMode(btn.dataset.dateOpt));
  });

  dateFromEl.addEventListener('input', () => syncDateInputs({ source: 'from' }));
  dateToEl.addEventListener('input', () => syncDateInputs({ source: 'to' }));

  $('#btn-apply-range').addEventListener('click', () => {
    syncDateInputs();
    if (!state.availableDateMin || !state.availableDateMax) return;
    const from = clampIsoDate(dateFromEl.value || state.availableDateMin, state.availableDateMin, state.availableDateMax);
    const to   = clampIsoDate(dateToEl.value || state.availableDateMax, state.availableDateMin, state.availableDateMax);
    applyDateMode('range', from, to);
  });

  btnClearDate.addEventListener('click', () => {
    syncDateInputs();
    applyDateMode('all');
  });

  // Close popover when clicking outside
  document.addEventListener('click', e => {
    if (!dateFilterWrap || !dateFilterWrap.contains(e.target)) closeDatePopover();
  });

  // Theme
  $('#btn-theme')?.addEventListener('click', cycleTheme);
  // Ext filter trigger
  $('#btn-ext-filter')?.addEventListener('click', e => { e.stopPropagation(); toggleExtPopover(); });
  // Ext clear
  $('#btn-clear-ext')?.addEventListener('click', () => { applyExtFilter('all'); });
  // Close ext popover on outside click (added to existing click handler below)
  $('#btn-refresh').addEventListener('click', refresh);
  $('#btn-load-more').addEventListener('click', () => {
    state.renderCount += RENDER_INCREMENT;
    scheduleRender();
  });
  $('#btn-open-tab').addEventListener('click', async () => {
    const r = await sendMsg({ type: 'downloads-manager:open-tab' });
    if (!r?.ok) toast('Could not open tab.', 'error');
  });
  $('#btn-clear-all').addEventListener('click', clearAll);
  $('#btn-bulk-delete').addEventListener('click', bulkDelete);
  $('#btn-bulk-erase').addEventListener('click', bulkErase);
  $('#btn-cancel-select').addEventListener('click', clearSel);
  $('#select-all').addEventListener('change', selectAllFiltered);

  const searchInput = $('#search-input');
  const clearSearch = $('#btn-clear-search');
  searchInput.addEventListener('input', debounce(e => {
    const v = e.target.value || '';
    applySearch(v);
    if (clearSearch) clearSearch.classList.toggle('hidden', !v.trim());
  }, 130));
  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    if (clearSearch) clearSearch.classList.add('hidden');
    applySearch('');
    searchInput.focus();
  });

  $('#sort-select').addEventListener('change', e => applySort(e.target.value));

  $$('.filter-tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.filter-tab').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
    applyFilter(btn.dataset.filter || 'all');
    if (window.innerWidth <= 1080) closeMobileSidebar();
  }));

  $('#btn-sidebar-toggle').addEventListener('click', handleSidebarToggle);
  $('#btn-sidebar-close').addEventListener('click', closeMobileSidebar);
  $('#sidebar-overlay').addEventListener('click', closeMobileSidebar);

  $('#modal-cancel').addEventListener('click',  () => closeModal(false));
  $('#modal-confirm').addEventListener('click', () => closeModal(true));
  $('#modal-overlay').addEventListener('click', e => {
    if (e.target === $('#modal-overlay')) closeModal(false);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#context-menu') && !e.target.closest('.btn-more')) hideCtx();
    if (!e.target.closest('#ext-filter-wrap')) closeExtPopover();
    if (!e.target.closest('#date-filter-wrap')) {
      $('#date-popover')?.classList.add('hidden');
      $('#btn-date-filter')?.setAttribute('aria-expanded','false');
    }
  });

  document.addEventListener('keydown', e => {
    trapTab(e);
    const inSearch  = document.activeElement === searchInput;
    const modalOpen = !$('#modal-overlay').classList.contains('hidden');

    if (e.key === 'Escape') {
      if (modalOpen) { closeModal(false); return; }
      if (!$('#context-menu').classList.contains('hidden')) { hideCtx(); return; }
      if (state.selected.size > 0) { clearSel(); return; }
      if ($('#app').classList.contains('sidebar-open')) { closeMobileSidebar(); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault(); searchInput.focus(); searchInput.select(); return;
    }
    if (e.key === 'F5' && !inSearch && !modalOpen) {
      e.preventDefault(); refresh(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !inSearch && !modalOpen) {
      e.preventDefault(); selectAllFiltered(); return;
    }
    if (e.key === 'Delete' && state.selected.size > 0 && !inSearch && !modalOpen) {
      e.preventDefault(); bulkDelete(); return;
    }
    if (e.altKey && e.key.toLowerCase() === 's' && !modalOpen) {
      e.preventDefault(); handleSidebarToggle(); return;
    }
  });

  $('#scroll-area').addEventListener('scroll', debounce(maybeLoadMore, 40));

  if (state.surface === 'tab') toggleClass('#btn-open-tab', 'hidden', true);
}

function maybeLoadMore() {
  const filtered = getFiltered();
  if (state.renderCount >= filtered.length) return;
  const s = $('#scroll-area');
  if (!s) return;
  if (s.scrollTop + s.clientHeight >= s.scrollHeight - 500) {
    state.renderCount += RENDER_INCREMENT;
    scheduleRender();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   State change helpers
   ───────────────────────────────────────────────────────────────────────── */
function applyFilter(f) { state.filterStatus = f; state.extFilter = 'all'; resetRenderCount(); pruneSelection(); persistPrefs(); scheduleRender(); }
function applySort(s)   { state.sortBy = s;        resetRenderCount(); persistPrefs(); scheduleRender(); }
function applySearch(v) { state.searchQuery = v.trim(); resetRenderCount(); pruneSelection(); scheduleRender(); }

function syncControls() {
  const sortSelect = $('#sort-select');
  if (sortSelect) sortSelect.value = state.sortBy;
  $$('.filter-tab').forEach(btn => {
    const a = btn.dataset.filter === state.filterStatus;
    btn.classList.toggle('active', a);
    btn.setAttribute('aria-pressed', String(a));
  });
  document.documentElement?.setAttribute('data-surface', state.surface);
}

/* ─────────────────────────────────────────────────────────────────────────
   Init
   ───────────────────────────────────────────────────────────────────────── */
async function init() {
  wire();
  bindChrome();

  const requiredRoots = ['#downloads-list', '#scroll-area', '#topbar', '#sidebar'];
  const missingRoots = requiredRoots.filter(sel => !$(sel));
  if (missingRoots.length) {
    throw new Error(`Missing required UI nodes: ${missingRoots.join(', ')}`);
  }
  await restoreTheme();
  await restorePrefs();
  syncControls();
  await loadDownloads();
  renderAll();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    state.isLoading = false;
    toggleClass('#loading-state', 'hidden', true);
    toggleClass('#empty-state', 'hidden', false);
    setText('#empty-message', 'Could not load downloads');
    toast(err?.message || 'Initialization failed.', 'error');
    console.error('[Downloads Manager]', err);
  });
});
