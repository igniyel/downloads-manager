# Downloads Manager

> A modern downloads manager for Chromium with live progress tracking, smart filters, theme support, side panel access, and keyboard shortcuts.

![Version](https://img.shields.io/badge/version-3.2.0-4a9eff?style=flat-square)
![Manifest](https://img.shields.io/badge/manifest-v3-7c5cfc?style=flat-square)
![Chrome](https://img.shields.io/badge/chrome-116%2B-34d399?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-fbbf24?style=flat-square)

---

## Overview

Downloads Manager is a Manifest V3 Chromium extension that provides a cleaner alternative to the default browser downloads page. It supports live progress monitoring, status and date filtering, extension-based categorization, bulk actions, and multiple display modes.

The extension can open in:

- the **Chrome Side Panel**
- a dedicated **full-page tab**
- the extension **options page**

It is designed to remain lightweight, with bundled assets and no external runtime dependencies.

---

## Features

### Download management

- Live download progress, speed, and ETA
- Active download count shown on the toolbar badge
- Pause, resume, cancel, open, reveal, and retry actions
- Automatic updates while downloads are in progress

### Filtering and sorting

- Filter by status: **All**, **Complete**, **In Progress**, **Failed**, **Missing**
- Filter by date: **Today**, **Yesterday**, **This week**, **This month**, or custom range
- Filter by file extension using dynamically generated type chips
- Search across filename, source URL, final URL, full path, and directory
- Sort by date, name, or size in ascending or descending order

### Bulk actions

- Multi-select download items
- Delete files from disk and remove their history records
- Remove history records without deleting local files
- Sticky bulk-action bar for long lists

### Appearance and usability

- **Light**, **Midnight**, **Dark**, and **Auto** theme modes
- Theme preference stored locally
- Side panel workflow with full-page fallback
- Keyboard shortcut support
- File-type specific SVG icons for quick recognition

---

## Theme Support

The extension supports four theme modes:

- **Auto**: follows the cool light color palette
- **Light**: always uses the warm light palette
- **Midnight**: always uses the deep navy color palette
- **Dark**: always uses the dark palette

Theme preference is stored locally and restored on startup.

---

## File Type Categories

The UI groups files by extension and renders category-specific SVG icons.

Supported categories include:

- images
- video
- audio
- PDF
- documents
- spreadsheets
- presentations
- archives
- code files
- executables
- fonts
- disk images
- torrents
- generic fallback

When an extension is unavailable, MIME type inference is used as a fallback.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt` + `Shift` + `J` | Open Downloads Manager on Windows / Linux |
| `Ctrl` + `Shift` + `J` | Open Downloads Manager on macOS |
| `Ctrl` / `⌘` + `F` | Focus search |
| `Ctrl` / `⌘` + `A` | Select all visible items |
| `F5` | Refresh the list |
| `Delete` | Delete selected items |
| `Alt` + `S` | Toggle sidebar |
| `Escape` | Close the active UI layer |

Chrome-managed shortcuts can be customized at `chrome://extensions/shortcuts`.

---

## Installation

### Load unpacked in Chromium-based browsers

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder.

After installation:

- click the extension action to open the manager
- use the context menu entry from the action button
- or launch it with the configured keyboard shortcut

---

## Permissions

| Permission | Purpose |
|---|---|
| `downloads` | Read and manage download items |
| `downloads.open` | Open completed downloads |
| `clipboardWrite` | Copy file paths, names, or URLs |
| `storage` | Persist theme and UI preferences |
| `sidePanel` | Render the extension in the Chrome Side Panel |
| `contextMenus` | Add action menu entry for opening the manager |

The extension does not request host permissions.

---

## Browser Compatibility

| Browser | Support |
|---|---|
| Chrome 116+ | Full support |
| Edge 116+ | Full support |
| Brave | Full support on compatible Chromium versions |
| Chromium builds without Side Panel support | Tab fallback |
| Firefox | Not supported |
| Safari | Not supported |

---

## Project Structure

```text
downloads-manager/
├── manifest.json
├── background.js
├── downloads.html
├── downloads.css
├── downloads.js
├── fonts/
└── icons/
└── _locales/
```

### File reference

- `manifest.json` — extension manifest and permissions
- `background.js` — service worker for badge updates, action routing, and side panel behavior
- `downloads.html` — main application shell
- `downloads.css` — UI styling and theme tokens
- `downloads.js` — state management, rendering, filtering, actions, and keyboard behavior

---

## Development

No build step is required.

```bash
https://github.com/igniyel/downloads-manager.git
cd downloads-manager
```

To test locally:

1. Open `chrome://extensions`
2. Load the folder as an unpacked extension
3. Make code changes
4. Reload the extension from the extensions page

---

## Notes

- The extension is built with Manifest V3.
- The minimum Chrome version is **116**.
- Assets such as fonts and icons are bundled locally.
- The interface is optimized for download-heavy workflows and quick inspection.

---

## License

MIT. See [LICENSE](LICENSE.md) for details.
