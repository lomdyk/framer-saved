# Framer Saved

A lightweight Chrome extension that adds bookmarking and a dedicated "Saved" collection view to the Framer Marketplace.

Framer Marketplace lacks a native bookmarking / favorites feature. **Framer Saved** injects a Save button into component/template detail headers, quick-bookmark icons on grid cards, and a "Saved" tab in Framer's community sidebar — all styled to match Framer's dark design system.

---

## Features

- **Sidebar Integration:** A native-looking "Saved" tab (with live count badge) under Community navigation.
- **Saved View:** Opens as a Framer-native overlay over the content area, so the sidebar stays visible and you can always navigate away. Closes via the **Back to Marketplace** button, **Esc**, clicking any sidebar link, or browser back.
- **Header Save Button:** A bordered pill button (`Save` / `Saved`) matching Framer's action buttons, inserted next to `Copy Component` / `Buy for $8` / `Use for Free`.
- **Tile Card Bookmarks:** Ghost bookmark icons on marketplace grid cards.
- **Deduplicated:** Items saved from a card, from a detail page, or imported always share the same id — no duplicates.
- **Search, Import & Export:** Filter your collection, bulk-import Framer Marketplace URLs (inline panel or popup), and export as JSON.
- **Local Storage First:** Uses `chrome.storage.local`. No servers, no accounts.

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
- All injected strings are HTML-escaped; the saved view is an overlay that never mutates Framer's own layout (no `display` toggling of `main`).
- To open the saved view directly, navigate to `https://www.framer.com/community/marketplace/components/#saved` or use the popup's **Open Saved in Framer**.

---

## License

MIT
