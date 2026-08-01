# Framer Saved

A lightweight Chrome extension that adds bookmarking and a native "Saved" collection tab to the Framer Marketplace.

Framer Marketplace currently lacks a native bookmarking or favorites feature. **Framer Saved** injects a bookmark button into component/template detail headers, grid cards, and adds a dedicated "Saved" tab to Framer's sidebar navigation matching its dark UI design system.

---

## Features

- **Sidebar Integration:** Adds a native "Saved" tab under Community navigation that renders your collection directly inside Framer without page reloads.
- **Header Bookmark Button:** Injects a bookmark button in detail page headers, sitting beside upvotes and action buttons (`Copy Component`, `Buy`, `Use for Free`).
- **Tile Card Bookmarks:** Quick bookmark icons on marketplace grid tiles.
- **Bulk Import & Export:** Import lists of Framer Marketplace URLs or export your saved collection as JSON.
- **Local Storage First:** Uses `chrome.storage.local`. No external servers or account registration required.

---

## Installation

1. Clone or download this repository.
2. Open Chrome (or Edge / Brave) and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the project directory.
5. Visit [Framer Marketplace](https://www.framer.com/community/marketplace/components/).

---

## License

MIT
