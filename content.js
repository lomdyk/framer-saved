(function () {
  'use strict';

  // ============================================================
  //  Framer Saved — content script
  //  Robust, Framer-native bookmarking for the Marketplace.
  //  - No reliance on Framer's hashed CSS-module class names.
  //  - Saved view renders as an overlay that *always* closes
  //    (Back button, Esc, sidebar click, hashchange, popstate).
  //  - Consistent item ids across cards / detail pages / import.
  //  - All injected strings are HTML-escaped.
  // ============================================================

  const STORAGE_KEY = 'framer_saved_items_v1';
  const SAVED_HASH = '#saved';
  const OVERLAY_ID = 'framer-saved-overlay';

  const win = window;
  const doc = document;
  const hist = history;
  const ORIGIN = win.location.origin;

  let savedItems = [];
  let enteredViaPush = false; // did we open the view via history.pushState?
  let currentSearchQuery = '';
  let toastTimer = null;
  let injectQueued = false;
  let lastUrl = win.location.pathname + win.location.search + win.location.hash;

  // ------------------------------------------------------------
  // Icons (stroke="currentColor" so they inherit button colors)
  // ------------------------------------------------------------
  const ICON_BOOKMARK =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
  const ICON_BOOKMARK_FILLED =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
  const ICON_TRASH =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
  const ICON_SEARCH =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
  const ICON_PLUS =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
  const ICON_ARROW_LEFT =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';
  const ICON_EMPTY =
    '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
  const ICON_LOGO =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';

  // ------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------
  function warn(err) {
    if (win.console && console.warn) console.warn('Framer Saved:', err);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function currentUrlKey() {
    return win.location.pathname + win.location.search + win.location.hash;
  }

  function urlChanged() {
    const now = currentUrlKey();
    if (now !== lastUrl) {
      lastUrl = now;
      return true;
    }
    return false;
  }

  /** Leading-edge throttle: reacts fast, doesn't starve during mutation storms. */
  function scheduleInject() {
    if (injectQueued) return;
    injectQueued = true;
    setTimeout(function () {
      injectQueued = false;
      injectAll();
    }, 120);
  }

  /** Canonical item id: lowercase pathname without slashes, e.g. "community/marketplace/components/slug". */
  function normalizeId(href) {
    try {
      const u = new URL(href, ORIGIN);
      return u.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/').toLowerCase();
    } catch (e) {
      return String(href || '');
    }
  }

  /** Canonical page url for storage. */
  function canonicalUrl(href) {
    try {
      const u = new URL(href, ORIGIN);
      const decoded = u.pathname.split('/').filter(Boolean).map(function (seg) {
        try {
          return decodeURIComponent(seg);
        } catch (e) {
          return seg;
        }
      });
      return ORIGIN + '/' + decoded.map(encodeURIComponent).join('/') + '/';
    } catch (e) {
      return String(href || '');
    }
  }

  /**
   * Normalize items read from storage: migrate legacy underscore ids
   * (e.g. "community_marketplace_components_foo") to the canonical
   * path form and drop duplicates.
   */
  function normalizeStoredItems(raw) {
    const seen = {};
    const result = [];
    (Array.isArray(raw) ? raw : []).forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      const source = item.url || item.id || '';
      const id = normalizeId(source);
      if (!id || seen[id]) return;
      seen[id] = true;
      result.push(Object.assign({}, item, { id: id, url: canonicalUrl(source) }));
    });
    return result;
  }

  function isItemSaved(idOrUrl) {
    const needle = normalizeId(idOrUrl);
    return savedItems.some(function (item) {
      return item.id === needle || normalizeId(item.url) === needle;
    });
  }

  function findIndexById(idOrUrl) {
    const needle = normalizeId(idOrUrl);
    for (let i = 0; i < savedItems.length; i++) {
      if (savedItems[i].id === needle || normalizeId(savedItems[i].url) === needle) return i;
    }
    return -1;
  }

  function isMarketplacePage() {
    return /^\/community\/marketplace\//.test(win.location.pathname);
  }

  function isDetailPage() {
    return /^\/community\/marketplace\/(components|templates|vectors|plugins)\/[^/]+\/?$/.test(
      win.location.pathname
    );
  }

  // ------------------------------------------------------------
  // Storage
  // ------------------------------------------------------------
  function loadSavedItems(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], function (res) {
        savedItems = normalizeStoredItems(res[STORAGE_KEY]);
        callback && callback();
      });
    } else {
      try {
        const data = localStorage.getItem(STORAGE_KEY);
        savedItems = normalizeStoredItems(data ? JSON.parse(data) : []);
      } catch (e) {
        savedItems = [];
      }
      callback && callback();
    }
  }

  function saveItemsToStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: savedItems }, function () {
        updateBadgeCount();
      });
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedItems));
      } catch (e) { /* ignore */ }
      updateBadgeCount();
    }
  }

  // Keep the page in sync when the popup / another tab changes storage.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName === 'local' && changes[STORAGE_KEY]) {
        savedItems = normalizeStoredItems(changes[STORAGE_KEY].newValue);
        updateBadgeCount();
        const overlay = doc.getElementById(OVERLAY_ID);
        if (overlay) renderSavedGrid();
      }
    });
  }

  // ------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------
  function showToast(message) {
    let toast = doc.querySelector('.framer-saved-toast');
    if (!toast) {
      toast = doc.createElement('div');
      toast.className = 'framer-saved-toast';
      doc.body.appendChild(toast);
    }
    toast.innerHTML = '<span class="framer-saved-toast-icon">' + ICON_BOOKMARK + '</span><span>' + esc(message) + '</span>';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2200);
  }

  function updateBadgeCount() {
    doc.querySelectorAll('.framer-saved-badge').forEach(function (badge) {
      badge.textContent = savedItems.length;
    });
  }

  // ------------------------------------------------------------
  // Toggle / metadata
  // ------------------------------------------------------------
  function toggleSaveItem(meta) {
    const idx = findIndexById(meta.id || meta.url);
    if (idx > -1) {
      savedItems.splice(idx, 1);
      saveItemsToStorage();
      showToast('Removed from Saved');
      return false;
    } else {
      savedItems.unshift({
        id: normalizeId(meta.url),
        url: canonicalUrl(meta.url),
        title: meta.title || 'Framer Component',
        subtitle: meta.subtitle || '',
        price: meta.price || 'Free',
        creator: meta.creator || 'Framer Creator',
        thumbnail: meta.thumbnail || '',
        savedAt: new Date().toISOString()
      });
      saveItemsToStorage();
      showToast('Saved to Favorites!');
      return true;
    }
  }

  function parseTitleAndSubtitle(rawTitle) {
    if (!rawTitle) return { title: 'Framer Component', subtitle: '' };
    const delimiters = [' • ', ' · ', ' — ', ' – ', ' - ', ':'];
    for (let i = 0; i < delimiters.length; i++) {
      const d = delimiters[i];
      if (rawTitle.includes(d)) {
        const parts = rawTitle.split(d);
        return { title: parts[0].trim(), subtitle: parts.slice(1).join(d).trim() };
      }
    }
    return { title: rawTitle.trim(), subtitle: '' };
  }

  function getCurrentPageMetadata() {
    const url = win.location.href.split(/[?#]/)[0];
    const id = normalizeId(url);

    const h1 = doc.querySelector('h1') || doc.querySelector('[class*="h1"]');
    let rawTitle = '';
    if (h1) {
      rawTitle = (h1.innerText || h1.textContent || '').trim();
    } else {
      rawTitle = doc.title.replace(/—\s*Framer\s*(Marketplace)?\s*$/i, '').trim();
    }
    const parsed = parseTitleAndSubtitle(rawTitle);

    // Find the primary CTA button ("Buy for $8", "Copy Component", "Use for Free"…)
    let price = 'Free';
    let ctaBtn = findCtaButton();
    if (ctaBtn) {
      const btnText = (ctaBtn.textContent || '').trim();
      const money = btnText.match(/\$\s?\d+(?:[.,]\d+)?/);
      if (money) price = money[0].replace(/\s/g, '');
      else if (/use for free|copy component|copy template|remix/i.test(btnText)) price = 'Free';
      else price = btnText;
    }

    let creator = 'Framer Creator';
    const creatorEl = doc.querySelector(
      '[class*="creator"], [class*="author"], [class*="byLine"], [class*="avatar"]'
    );
    if (creatorEl) {
      const txt = (
        creatorEl.innerText ||
        creatorEl.textContent ||
        creatorEl.getAttribute('alt') ||
        ''
      ).trim();
      if (txt && txt.length < 80) creator = txt;
    }

    let thumbnail = '';
    const imgEl = doc.querySelector('main img, [class*="preview"] img, [class*="thumbnail"] img');
    if (imgEl && imgEl.src) thumbnail = imgEl.src;

    return {
      id: id,
      url: url,
      title: parsed.title || 'Framer Component',
      subtitle: parsed.subtitle || '',
      price: price,
      creator: creator,
      thumbnail: thumbnail,
      savedAt: new Date().toISOString()
    };
  }

  // ------------------------------------------------------------
  // CTA button discovery (text based, no fragile class names)
  // ------------------------------------------------------------
  const CTA_PATTERNS = [
    /^Copy (Component|Template)$/i,
    /^Buy for\b/i,
    /^Use for\b/i,
    /^Get /i,
    /^Remix$/i
  ];

  function findCtaButton() {
    const candidates = doc.querySelectorAll(
      'button, a[href], [role="button"], [class*="button"], [class*="Button"]'
    );
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.closest('nav')) continue;
      if (el.closest('#' + OVERLAY_ID)) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length > 60) continue;
      if (CTA_PATTERNS.some(function (re) { return re.test(text); })) return el;
    }
    return null;
  }

  // ------------------------------------------------------------
  // 1) Sidebar "Saved" tab
  // ------------------------------------------------------------
  function findSidebarContext() {
    // Anchor on the "Members" nav item (stable, text-based).
    const links = doc.querySelectorAll('nav a[href], aside a[href], [class*="sidebar"] a[href], a[href*="/community/"]');
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = (link.getAttribute('href') || '').split(/[?#]/)[0];
      const text = (link.textContent || '').trim();
      if (href === '/community/members/' || text === 'Members' || text === 'Community') {
        const container = link.parentElement;
        if (container) return { container: container, sibling: link };
      }
    }
    // Fallback: any nav/aside that contains community links.
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = (link.getAttribute('href') || '') || '';
      if (href.includes('/community/')) {
        const container = link.closest('nav, aside, [class*="sidebar"], [class*="menu"]');
        if (container) return { container: container, sibling: null };
      }
    }
    const fallbackNav = doc.querySelector('aside, nav[class*="side"]');
    return fallbackNav ? { container: fallbackNav, sibling: null } : null;
  }

  function injectSidebarTab() {
    if (!win.location.pathname.includes('/community/')) return;
    if (doc.querySelector('.framer-saved-nav-item')) return;

    const ctx = findSidebarContext();
    if (!ctx || !ctx.container) return;

    const tab = doc.createElement('a');
    tab.className = 'framer-saved-nav-item';
    tab.href = SAVED_HASH;
    tab.title = 'Open your saved components';
    tab.innerHTML =
      '<span class="framer-saved-nav-icon">' + ICON_BOOKMARK + '</span>' +
      '<span class="framer-saved-nav-label">Saved</span>' +
      '<span class="framer-saved-badge">' + savedItems.length + '</span>';

    tab.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (isSavedRoute()) {
        closeSavedView();
      } else {
        openSavedView();
      }
    });

    if (ctx.sibling && ctx.sibling.nextSibling) {
      ctx.container.insertBefore(tab, ctx.sibling.nextSibling);
    } else {
      ctx.container.appendChild(tab);
    }

    updateBadgeCount();
  }

  // ------------------------------------------------------------
  // 2) Detail page "Save" button — styled like Framer's actions
  // ------------------------------------------------------------
  function injectDetailBookmarkButton() {
    if (!isDetailPage()) return;

    const ctaBtn = findCtaButton();
    if (!ctaBtn || !ctaBtn.parentElement) return;

    // Already injected in this exact spot? Check siblings
    const siblings = Array.prototype.slice.call(ctaBtn.parentElement.children);
    if (siblings.some(function (s) {
      return s.classList && s.classList.contains('framer-saved-detail-btn');
    })) return;

    const metadata = getCurrentPageMetadata();
    const saved = isItemSaved(metadata.id);

    const btn = doc.createElement('button');
    btn.type = 'button';
    updateDetailBtnContent(btn, saved);

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const nowSaved = toggleSaveItem(getCurrentPageMetadata());
      updateDetailBtnContent(btn, nowSaved);
    });

    // Insert between the vote/action icons and the primary CTA.
    ctaBtn.parentElement.insertBefore(btn, ctaBtn);
  }

  function updateDetailBtnContent(btn, saved) {
    btn.className = 'framer-saved-detail-btn' + (saved ? ' is-saved' : '');
    btn.setAttribute('aria-label', saved ? 'Remove from Saved' : 'Save component');
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.title = saved ? 'Remove from Saved' : 'Save component';
    btn.innerHTML =
      '<span class="framer-saved-detail-btn-icon">' + (saved ? ICON_BOOKMARK_FILLED : ICON_BOOKMARK) + '</span>' +
      '<span class="framer-saved-detail-btn-label">' + (saved ? 'Saved' : 'Save') + '</span>';
  }

  // ------------------------------------------------------------
  // 3) Marketplace grid card bookmark buttons
  // ------------------------------------------------------------
  function classNameOf(el) {
    if (!el) return '';
    const c = el.className;
    return typeof c === 'string' ? c : (c && c.baseVal) || '';
  }

  /**
   * Climb from the card's <a> to the tile/card container.
   * Never returns the <a> itself — its class often contains
   * "post-tile"/"tile" too, which used to break the lookup.
   */
  function findTile(link) {
    let el = link;
    for (let i = 0; i < 7 && el; i++) {
      if (el.tagName === 'A') {
        el = el.parentElement; // Step over the <a> itself!
        continue;
      }
      const cls = classNameOf(el).toLowerCase();
      const tag = (el.tagName || '').toLowerCase();
      if (/tile|card|post|item/.test(cls) || tag === 'article' || tag === 'li') return el;
      el = el.parentElement;
    }
    const parent = link.parentElement;
    return parent && parent.tagName !== 'BODY' ? parent : null;
  }

  function ensurePositioned(el) {
    try {
      if (win.getComputedStyle(el).position === 'static') el.style.position = 'relative';
    } catch (e) { /* ignore */ }
  }

  function setCardBtnState(btn, saved) {
    btn.className = 'framer-saved-card-inline-btn' + (saved ? ' is-saved' : '');
    btn.setAttribute('aria-label', saved ? 'Remove from Saved' : 'Save component');
    btn.title = saved ? 'Remove from Saved' : 'Save component';
    btn.innerHTML = saved ? ICON_BOOKMARK_FILLED : ICON_BOOKMARK;
  }

  function injectCardBookmarkButtons() {
    if (!isMarketplacePage()) return;

    const links = doc.querySelectorAll('a[href*="/marketplace/"]');
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = link.getAttribute('href') || '';
      // Detail-page link only: /marketplace/<type>/<slug>[/]
      if (!/\/marketplace\/(components|templates|vectors|plugins)\/[^/?#]+\/?$/.test(href)) continue;

      const tile = findTile(link);
      if (!tile) continue;
      if (tile.closest('#' + OVERLAY_ID)) continue;
      if (tile.querySelector('.framer-saved-card-inline-btn')) continue;

      const cardId = normalizeId(href);
      const saved = isItemSaved(cardId);

      const actionBtn = doc.createElement('button');
      actionBtn.type = 'button';
      setCardBtnState(actionBtn, saved);

      actionBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const img = link.querySelector('img') || tile.querySelector('img');
        const titleEl =
          tile.querySelector('[class*="name"], [class*="title"], h2, h3, h4') || link;
        const rawText = (titleEl.innerText || titleEl.textContent || '').trim();
        const parsed = parseTitleAndSubtitle(rawText);

        const priceEl = tile.querySelector('[class*="price"], [class*="subline"]');
        const creatorEl = tile.querySelector('[class*="creator"], [class*="author"], img[alt]');

        let creator = 'Framer Creator';
        if (creatorEl) {
          const txt = (creatorEl.innerText || creatorEl.textContent || creatorEl.getAttribute('alt') || '').trim();
          if (txt && txt.length < 80) creator = txt;
        }

        const nowSaved = toggleSaveItem({
          id: cardId,
          url: link.href,
          title: parsed.title || 'Framer Component',
          subtitle: parsed.subtitle || '',
          price: priceEl ? (priceEl.textContent || '').trim() : 'Free',
          creator: creator,
          thumbnail: img ? img.src : ''
        });

        setCardBtnState(actionBtn, nowSaved);
      });

      ensurePositioned(tile);
      tile.appendChild(actionBtn);
    }
  }

  // ------------------------------------------------------------
  // 4) Saved view — a Framer-native overlay over the content area
  // ------------------------------------------------------------
  function isSavedRoute() {
    return win.location.hash === SAVED_HASH;
  }

  function openSavedView() {
    if (!isSavedRoute()) {
      enteredViaPush = true;
      try {
        hist.pushState(null, '', SAVED_HASH);
      } catch (e) {
        win.location.hash = SAVED_HASH;
      }
    }
    syncSavedViewState();
  }

  function closeSavedView() {
    if (isSavedRoute()) {
      if (enteredViaPush) {
        enteredViaPush = false;
        hist.back(); // popstate → syncSavedViewState() removes the overlay
      } else {
        // Opened via direct URL load — drop the hash in place, no reload.
        const target = win.location.pathname + win.location.search;
        try {
          hist.replaceState(null, '', target);
        } catch (e) {
          win.location.hash = '';
        }
      }
    }
    syncSavedViewState();
  }

  function computeOverlayBounds() {
    // Cover exactly Framer's content area (right of the sidebar).
    const main = doc.querySelector('main, [role="main"], [class*="content"]');
    if (main) {
      const r = main.getBoundingClientRect();
      if (r.width > 120 && r.left >= 0) {
        return {
          top: Math.max(0, r.top),
          right: Math.max(0, win.innerWidth - r.right),
          bottom: Math.max(0, win.innerHeight - r.bottom),
          left: Math.max(0, r.left)
        };
      }
    }
    const aside = doc.querySelector('aside, [class*="sidebar"]');
    if (aside) {
      const r = aside.getBoundingClientRect();
      return { top: Math.max(0, r.top), right: 0, bottom: 0, left: Math.max(0, r.right) };
    }
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  function buildSavedOverlay() {
    if (doc.getElementById(OVERLAY_ID)) return;

    const bounds = computeOverlayBounds();
    const overlay = doc.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'framer-saved-overlay';
    overlay.style.top = bounds.top + 'px';
    overlay.style.right = bounds.right + 'px';
    overlay.style.bottom = bounds.bottom + 'px';
    overlay.style.left = bounds.left + 'px';

    overlay.innerHTML =
      '<div class="framer-saved-overlay-inner">' +
      '  <header class="framer-saved-view-header">' +
      '    <div class="framer-saved-title-group">' +
      '      <h1><span class="framer-saved-title-icon">' + ICON_LOGO + '</span>Saved Components</h1>' +
      '      <p>Your personal collection of bookmarked Framer components, templates, and UI kits.</p>' +
      '    </div>' +
      '    <div class="framer-saved-controls">' +
      '      <button type="button" class="framer-saved-btn framer-saved-btn-ghost framer-saved-back-btn" title="Back to the Marketplace (Esc)">' +
      '        ' + ICON_ARROW_LEFT + '<span>Back to Marketplace</span>' +
      '      </button>' +
      '      <button type="button" class="framer-saved-btn framer-saved-btn-ghost framer-saved-import-btn" title="Import Framer Marketplace links">' +
      '        ' + ICON_PLUS + '<span>Import Links</span>' +
      '      </button>' +
      '      <div class="framer-saved-search-field">' +
      '        <span class="framer-saved-search-icon">' + ICON_SEARCH + '</span>' +
      '        <input type="text" id="framer-saved-search" class="framer-saved-search-input" placeholder="Search saved items…" autocomplete="off" />' +
      '      </div>' +
      '    </div>' +
      '    <div class="framer-saved-import-panel" hidden>' +
      '      <textarea id="framer-saved-import-input" placeholder="Paste Framer Marketplace URLs — one per line or comma separated."></textarea>' +
      '      <div class="framer-saved-import-actions">' +
      '        <button type="button" class="framer-saved-btn framer-saved-btn-primary framer-saved-import-go">' + ICON_PLUS + '<span>Import</span></button>' +
      '        <button type="button" class="framer-saved-btn framer-saved-btn-ghost framer-saved-import-cancel">Cancel</button>' +
      '      </div>' +
      '    </div>' +
      '  </header>' +
      '  <div id="framer-saved-grid" class="framer-saved-grid"></div>' +
      '</div>';

    doc.body.appendChild(overlay);

    // Back button
    overlay.querySelector('.framer-saved-back-btn').addEventListener('click', function () {
      closeSavedView();
    });

    // Import panel toggle
    const importPanel = overlay.querySelector('.framer-saved-import-panel');
    const importInput = overlay.querySelector('#framer-saved-import-input');
    overlay.querySelector('.framer-saved-import-btn').addEventListener('click', function () {
      importPanel.hidden = !importPanel.hidden;
      if (!importPanel.hidden) importInput.focus();
    });
    overlay.querySelector('.framer-saved-import-cancel').addEventListener('click', function () {
      importPanel.hidden = true;
    });
    overlay.querySelector('.framer-saved-import-go').addEventListener('click', function () {
      const count = importLinks(importInput.value);
      importInput.value = '';
      importPanel.hidden = true;
      renderSavedGrid();
      if (count === 0) showToast('No new valid Framer links found');
    });

    // Search
    overlay.querySelector('#framer-saved-search').addEventListener('input', function (e) {
      currentSearchQuery = e.target.value;
      renderSavedGrid();
    });

    renderSavedGrid();

    // Focus search unless the collection is empty.
    setTimeout(function () {
      const input = overlay.querySelector('#framer-saved-search');
      if (input && savedItems.length > 0 && win.innerWidth > 640) input.focus();
    }, 50);
  }

  function renderSavedGrid() {
    const grid = doc.getElementById('framer-saved-grid');
    if (!grid) return;

    const q = (currentSearchQuery || '').toLowerCase().trim();
    const filtered = savedItems.filter(function (item) {
      if (!q) return true;
      return (
        (item.title || '').toLowerCase().includes(q) ||
        (item.subtitle || '').toLowerCase().includes(q) ||
        (item.creator || '').toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      grid.innerHTML =
        '<div class="framer-saved-empty-state">' +
        '  <div class="framer-saved-empty-icon">' + ICON_EMPTY + '</div>' +
        '  <h3>' + esc(savedItems.length === 0 ? 'No saved components yet' : 'Nothing matches your search') + '</h3>' +
        '  <p>' + esc(savedItems.length === 0
          ? 'Explore the Framer Marketplace, or click Import Links to add items.'
          : 'Try a different search term.') + '</p>' +
        '</div>';
      return;
    }

    let html = '<div class="framer-saved-grid-cards">';
    filtered.forEach(function (item) {
      const parsed = parseTitleAndSubtitle(item.title);
      const title = parsed.title || 'Framer Component';
      html +=
        '<div class="framer-saved-card" data-id="' + esc(item.id) + '">' +
        '  <a class="framer-saved-card-thumb-link" href="' + esc(item.url) + '" title="' + esc(title) + '">' +
        '    <span class="framer-saved-card-thumb-wrap">' +
        '      <span class="framer-saved-card-thumb-fallback">' + ICON_BOOKMARK + '</span>' +
        (item.thumbnail ? '      <img class="framer-saved-card-thumb" src="' + esc(item.thumbnail) + '" alt="' + esc(title) + '" loading="lazy" decoding="async" />' : '') +
        '    </span>' +
        '  </a>' +
        '  <div class="framer-saved-card-info">' +
        '    <div class="framer-saved-card-row1">' +
        '      <a class="framer-saved-card-title" href="' + esc(item.url) + '" title="' + esc(item.title || '') + '">' + esc(title) + '</a>' +
        '      <button type="button" class="framer-saved-card-remove-btn" data-id="' + esc(item.id) + '" title="Remove from Saved" aria-label="Remove from Saved">' + ICON_TRASH + '</button>' +
        '    </div>' +
        '    <div class="framer-saved-card-row2">' +
        '      <span class="framer-saved-card-price">' + esc(item.price || 'Free') + '</span>' +
        '      <span class="framer-saved-card-creator">' + esc(item.creator || '') + '</span>' +
        '    </div>' +
        '  </div>' +
        '</div>';
    });
    html += '</div>';
    grid.innerHTML = html;

    // Broken image fallback (attach via JS — the page CSP may block inline handlers).
    grid.querySelectorAll('img.framer-saved-card-thumb').forEach(function (img) {
      function markBroken() {
        img.classList.add('is-broken');
        const wrap = img.parentElement;
        if (wrap) wrap.classList.add('has-broken-image');
      }
      img.addEventListener('error', markBroken, { once: true });
      if (img.complete && img.naturalWidth === 0) markBroken();
    });

    grid.querySelectorAll('.framer-saved-card-remove-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const idx = findIndexById(btn.getAttribute('data-id'));
        if (idx > -1) {
          savedItems.splice(idx, 1);
          saveItemsToStorage();
          renderSavedGrid();
          showToast('Removed from Saved');
        }
      });
    });
  }

  function syncSavedViewState() {
    const overlay = doc.getElementById(OVERLAY_ID);
    const active = isSavedRoute();

    if (active) {
      buildSavedOverlay();
    } else if (overlay) {
      overlay.remove();
      currentSearchQuery = '';
    }

    doc.querySelectorAll('.framer-saved-nav-item').forEach(function (el) {
      el.classList.toggle('active', active);
    });
  }

  // ------------------------------------------------------------
  // Import links
  // ------------------------------------------------------------
  function importLinks(urlsText) {
    if (!urlsText) return 0;
    const lines = String(urlsText).split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    let count = 0;

    lines.forEach(function (rawUrl) {
      if (!/framer\.com/.test(rawUrl)) return;
      const clean = rawUrl.split(/[?#]/)[0];
      const id = normalizeId(clean);
      if (!id || findIndexById(id) > -1) return;

      const slug = id.split('/').pop() || 'imported-item';
      const formattedTitle = slug
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, function (c) { return c.toUpperCase(); });

      savedItems.unshift({
        id: id,
        url: canonicalUrl(clean),
        title: formattedTitle,
        subtitle: 'Imported Link',
        price: 'Free',
        creator: 'Imported',
        thumbnail: '',
        savedAt: new Date().toISOString()
      });
      count++;
    });

    if (count > 0) {
      saveItemsToStorage();
      updateBadgeCount();
      showToast('Imported ' + count + ' link' + (count === 1 ? '' : 's'));
    }
    return count;
  }

  // ------------------------------------------------------------
  // Cleanup stale UI on page change
  // ------------------------------------------------------------
  function clearStaleInjectedUi() {
    doc.querySelectorAll('.framer-saved-detail-btn, .framer-saved-card-inline-btn').forEach(function (el) {
      el.remove();
    });
  }

  // ------------------------------------------------------------
  // History / routing hooks — make sure the view always closes
  // ------------------------------------------------------------
  function patchHistoryAPI() {
    const originalPushState = hist.pushState;
    const originalReplaceState = hist.replaceState;

    hist.pushState = function () {
      const ret = originalPushState.apply(this, arguments);
      setTimeout(function () {
        syncSavedViewState();
        injectAll();
      }, 20);
      return ret;
    };

    hist.replaceState = function () {
      const ret = originalReplaceState.apply(this, arguments);
      setTimeout(function () {
        syncSavedViewState();
        injectAll();
      }, 20);
      return ret;
    };

    win.addEventListener('popstate', function () {
      syncSavedViewState();
      injectAll();
    });
    win.addEventListener('hashchange', function () {
      syncSavedViewState();
      injectAll();
    });

    // If Framer's router doesn't react to a sidebar click (e.g. the link points
    // to the page we are already on), force-close the overlay ourselves.
    doc.addEventListener(
      'click',
      function (e) {
        const link = e.target && e.target.closest ? e.target.closest('a') : null;
        if (!link) return;
        const href = link.getAttribute('href') || '';
        if (href.startsWith('#') || link.classList.contains('framer-saved-nav-item')) return;

        const isNavLink = href.startsWith('/') || href.startsWith(ORIGIN) || href.startsWith('http');
        if (!isNavLink) return;

        setTimeout(function () {
          if (!isSavedRoute()) return; // already closed
          let targetPath = null;
          try {
            targetPath = new URL(link.href, ORIGIN).pathname;
          } catch (err) { /* ignore */ }
          if (targetPath === win.location.pathname) {
            // Same-page link while in saved view → drop the hash ourselves.
            try {
              hist.replaceState(null, '', win.location.pathname + win.location.search);
            } catch (err) { /* ignore */ }
          }
          syncSavedViewState();
        }, 80);
      },
      true
    );

    // Escape always closes the saved view.
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isSavedRoute()) {
        e.preventDefault();
        closeSavedView();
      }
    });
  }

  // ------------------------------------------------------------
  // Injection pipeline
  // ------------------------------------------------------------
  function injectAll() {
    if (urlChanged()) clearStaleInjectedUi();
    try {
      injectSidebarTab();
    } catch (err) { warn(err); }
    try {
      injectDetailBookmarkButton();
    } catch (err) { warn(err); }
    try {
      injectCardBookmarkButtons();
    } catch (err) { warn(err); }
    try {
      syncSavedViewState();
    } catch (err) { warn(err); }
  }

  function initApp() {
    patchHistoryAPI();

    const observer = new MutationObserver(function () {
      try {
        scheduleInject();
        syncSavedViewState(); // cheap; keeps the overlay alive across SPA re-renders
      } catch (err) { warn(err); }
    });
    observer.observe(doc.body, { childList: true, subtree: true });

    // Safety net for SPA transitions MutationObserver might miss.
    setInterval(function () {
      if (!doc.hidden) {
        if (urlChanged()) injectAll();
        else scheduleInject();
      }
    }, 500);

    let scrollRaf = 0;
    win.addEventListener('scroll', function () {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () {
        scrollRaf = 0;
        if (!doc.hidden) injectCardBookmarkButtons();
      });
    }, { passive: true });

    win.addEventListener('resize', function () {
      var overlay = doc.getElementById(OVERLAY_ID);
      if (overlay) {
        var bounds = computeOverlayBounds();
        overlay.style.top = bounds.top + 'px';
        overlay.style.right = bounds.right + 'px';
        overlay.style.bottom = bounds.bottom + 'px';
        overlay.style.left = bounds.left + 'px';
      }
    }, { passive: true });

    injectAll();
    syncSavedViewState();
  }

  // ------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------
  loadSavedItems(initApp);

  // Exposed for unit tests only — no-op inside a browser content script.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      esc: esc,
      normalizeId: normalizeId,
      canonicalUrl: canonicalUrl,
      normalizeStoredItems: normalizeStoredItems,
      parseTitleAndSubtitle: parseTitleAndSubtitle,
      isItemSaved: isItemSaved,
      findIndexById: findIndexById,
      toggleSaveItem: toggleSaveItem,
      findTile: findTile,
      findCtaButton: findCtaButton
    };
  }
})();
