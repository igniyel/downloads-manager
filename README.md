# Downloads Manager — v3.1.0

A minimal, liquid-glass downloads manager for Chromium browsers. Runs as a **Side Panel**, full-page **tab**, or **options page**.

---

## Design system — Deep Glass

| Token | Value | Purpose |
|---|---|---|
| Background | `#07080e` | Near-black canvas |
| Glass surface | `rgba(255,255,255,0.042)` | Card/panel fill |
| Glass border | `rgba(255,255,255,0.07)` | Subtle edge |
| Top-edge highlight | `rgba(255,255,255,0.12)` | Inset box-shadow — the "glass catches light" effect |
| Accent | `#4a9eff` | Electric blue, used sparingly |
| Font (display) | **Sora** (Google Fonts) | Clean, geometric, distinctive |
| Font (mono) | **JetBrains Mono** | Filenames, paths, sizes |

**Microinteractions implemented:**
- Button **ripple** — expanding circle on every click
- Card **lift** — `translateY(-1px)` + shadow increase on hover
- Card **entrance** — `cardIn` stagger animation (8 child delay steps)
- Progress bar **shimmer** — sliding highlight overlay on active bars
- Badge **pop** — `scale(1.3)` spring when count value changes
- Toast **spring-in** — 3-keyframe bounce from right
- Toast **slide-out** — `slideRightOut` on remove
- Modal **scale-in** — `fadeScaleIn` with spring easing
- Context menu **scale-in** — `fadeScaleIn` from transform-origin
- Search focus **glow ring** — `0 0 0 3px var(--accent-glow)` on focus-within
- Active download **pulse dot** — CSS keyframe on badge dot
- Refresh icon **spin** — `spinRefresh` when `aria-busy="true"`

---

## File icon registry

No emojis. Every file type renders as a proper **SVG document badge**:
- A coloured header band (category colour, 14px tall)
- A category-specific SVG icon path
- A 3-5 char extension label
- Colour is derived from the file category, set as a CSS custom property `--fi-color`

**Categories and accent colours:**

| Category | Colour | Extensions (sample) |
|---|---|---|
| Image | `#a78bfa` (violet) | png jpg jpeg gif webp svg avif heic |
| Video | `#f87171` (red) | mp4 mov mkv webm avi m4v |
| Audio | `#34d399` (green) | mp3 wav flac aac ogg m4a |
| PDF   | `#f87171` (red) | pdf |
| Document | `#60a5fa` (blue) | doc docx txt md rtf pages |
| Spreadsheet | `#4ade80` (green) | xls xlsx csv ods numbers |
| Presentation | `#fb923c` (orange) | ppt pptx key odp |
| Archive | `#fbbf24` (amber) | zip rar 7z tar gz bz2 |
| Code | `#22d3ee` (cyan) | js ts py rb go rs html css json |
| Executable | `#94a3b8` (slate) | exe msi apk deb pkg appimage |
| Font | `#c084fc` (purple) | ttf otf woff woff2 |
| Disk image | `#f472b6` (pink) | dmg iso img vhd |
| Torrent | `#38bdf8` (sky) | torrent |
| Generic | `#64748b` (gray) | anything else |

MIME-type fallback is also implemented for cases where the extension is missing.

---

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker — badge, context menu, panel/tab routing |
| `downloads.html` | App shell — Sora + JetBrains Mono fonts, semantic HTML |
| `downloads.css` | Deep Glass design system, microinteraction keyframes |
| `downloads.js` | State, SVG icon registry, speed/ETA, rendering, all operations |
| `icons/` | Toolbar icons |

---

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** → select this folder.
3. Use **Alt+Shift+J** (Win/Linux) or **Ctrl+Shift+J** (Mac) to open.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl/⌘ + F` | Focus search |
| `F5` | Refresh list |
| `Ctrl/⌘ + A` | Select all visible |
| `Delete` | Bulk delete selected |
| `Alt + S` | Toggle sidebar |
| `Escape` | Close modal → menu → selection → mobile sidebar |
| `Alt+Shift+J` | Open manager |

---

## Notes

- `chrome.downloads.removeFile()` only works for completed downloads.
- `chrome.downloads.show()` is called as a void/fire-and-forget to avoid stalls on some Chromium forks.
- Speed is calculated over a 5-second sliding window; requires at least 2 data points 250 ms apart.
- The native `chrome://downloads` page is not overridden.
