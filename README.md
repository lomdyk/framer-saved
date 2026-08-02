# Framer Saved

A lightweight Chrome extension that adds bookmarking, folder collections, a native "Saved" tab, and one-click **Live Preview export** (HTML/CSS/JS ZIP) to the Framer Marketplace.

Framer Marketplace lacks native bookmarking/favorites and source export. **Framer Saved** injects a Save button into component/template detail headers, quick-bookmark icons on grid cards, a "Saved" tab in Framer's community sidebar, and a code export button that pulls JS/CSS/HTML chunks straight from the Live Preview — all styled to match Framer's dark design system.

---

## Features

- **Sidebar Integration:** A native-looking "Saved" tab (with live count badge) under Community navigation.
- **Saved View:** Framer-native overlay over the content area with Pinterest/Awwwards-style folder pills, search, sort (newest/oldest/title/price) and a settings drawer.
- **Header Save + Export Buttons:** Bordered pill buttons (`Save` / `Saved`) and a blue `Export` button, inserted next to `Copy Component` / `Buy for $X` / `Use for Free`.
- **Tile Card Bookmarks + Export:** Ghost bookmark icons (plus hover-only export icon) on marketplace grid cards.
- **Folders:** Built-in defaults (Minimalist, 3D & Motion, Dark UI, Interactions) + unlimited custom folders. Create/delete/rename, add a component to multiple folders.
- **Deduplicated:** Items saved from a card, detail page, or imported always share the same id — no duplicates.
- **Search, Import & Export:** Filter your collection, bulk-import URLs, export/import a JSON backup, clear all data.
- **⌘/Ctrl+K search focus** and **S key quick-save** (toggle in settings).
- **Sort dropdown** in the Saved overlay (newest / oldest / title A-Z / price).
- **Local Storage First:** Uses `chrome.storage.local`. No servers, no accounts.

### Live Preview Export (HTML/CSS/JS ZIP)

Each saved component card (and every detail page) has a blue **Export** button. One click:

1. Opens the component's Live Preview (`*.framer.website` / `*.framer.app`) in a hidden background tab.
2. Waits for hydration, auto-scrolls to trigger lazy-loaded chunks and images.
3. Scrapes every resource actually loaded (JS `.mjs` chunks, CSS, images, fonts, JSON).
4. Rewrites all URLs to relative paths.
5. Strips analytics (PostHog / GA / Clarity), removes the "Made with Framer" badge (toggleable).
6. Packages everything into a ZIP and saves it to your Downloads as `framer-exports/<slug>-YYYY-MM-DD.zip`.

Open `index.html` from the ZIP via any static server (`npx serve`, `python3 -m http.server`) to get a fully-working offline copy with all Framer animations intact.

**Export options** (in ⚙️ Settings → Live Preview Export):

- **Include JavaScript** — keep Framer runtime for working animations (on by default).
- **Strip JS for static snapshot** — removes JS and fixes `opacity: 0` initial states so the first frame renders correctly.
- **Auto-scroll to trigger lazy assets** (on by default).
- **Remove "Made with Framer" badge** (on by default).
- **Remove analytics/tracking** (on by default).
- **Hydration wait time** (default 2500ms).

---

## Installation

1. Clone or download this repository.
2. Open Chrome (or Edge / Brave) and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the project directory.
5. Visit [Framer Marketplace](https://www.framer.com/community/marketplace/components/).

---

## Notes for maintainers

- The content script deliberately avoids Framer's hashed CSS-module class names and relies on semantic, text-based selectors instead, so it keeps working across Framer deploys.
- All injected strings are HTML-escaped; the saved view is an overlay that never mutates Framer's own layout.
- To open the saved view directly, navigate to any marketplace page with `#saved` appended (e.g. `https://www.framer.com/community/marketplace/components/#saved`).
- Background service worker (`background.js`) manages export jobs: opens a hidden tab, injects `extractor.js` via `chrome.scripting`, collects assets, zips with JSZip, hands to `chrome.downloads`.

---

## Development

```bash
npm install   # dev deps (jsdom for tests)
npm test      # runs unit + integration tests
```

File overview:

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (permissions: storage, downloads, scripting, tabs) |
| `content.js` | Main injected UI (sidebar, buttons, Saved overlay, settings panel, popover, export triggers, hotkeys, sort) |
| `background.js` | Service worker: orchestrates exports, zips with JSZip, settings defaults |
| `extractor.js` | Injected into Live Preview tabs to harvest HTML + assets after scrolling |
| `styles.css` | All UI styles matching Framer's dark theme |
| `popup.html/js` | Toolbar popup with recent items, quick-open, import/export JSON |
| `vendor/jszip.min.js` | JSZip vendored for ZIP generation in the SW |
| `preview.html` | Static UI preview (standalone, for visually checking styles) |
| `test/` | Unit tests (pure functions) + jsdom integration tests |

---

## License

MIT
