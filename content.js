(function () {
  'use strict';

  // ============================================================
  //  Framer Saved — content script
  //  Robust, Framer-native bookmarking & folders for Marketplace.
  //  - Pinterest & Awwwards style folders & collections.
  //  - Origin-aware Save Popover with Emil Kowalski Design Engineering rules:
  //    * Strong ease-out: cubic-bezier(0.23, 1, 0.32, 1)
  //    * Fast timing <= 200ms
  //    * No scale(0) — enters from scale(0.94) + opacity: 0
  //    * Tactile active press feedback: scale(0.96) on :active
  //  - Automatic background metadata & preview image fetch for imported links.
  //  - All injected strings are HTML-escaped.
  // ============================================================

  const STORAGE_KEY = 'framer_saved_items_v1';
  const FOLDERS_KEY = 'framer_saved_folders_v1';
  const SAVED_HASH = '#saved';
  const OVERLAY_ID = 'framer-saved-overlay';
  const POPOVER_ID = 'framer-saved-folder-popover';

  const win = typeof window !== 'undefined' ? window : {};
  const doc = typeof document !== 'undefined' ? document : {};
  const hist = typeof history !== 'undefined' ? history : {};
  const ORIGIN = win.location ? win.location.origin : 'https://www.framer.com';

  const DEFAULT_FOLDERS = [
    { id: 'minimalist', name: 'Minimalist' },
    { id: '3d-motion', name: '3D & Motion' },
    { id: 'dark-ui', name: 'Dark UI' },
    { id: 'interactions', name: 'Interactions' }
  ];

  let savedItems = [];
  let savedFolders = [];
  let activeFolderId = 'all';
  let enteredViaPush = false;
  let currentSearchQuery = '';
  let toastTimer = null;
  let injectQueued = false;
  let lastUrl = win.location ? (win.location.pathname + win.location.search + win.location.hash) : '';
  const pendingFetches = new Set();

  // ------------------------------------------------------------
  // Icons (stroke="currentColor" so they inherit button colors)
  // ------------------------------------------------------------
  const ICON_BOOKMARK =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
  const ICON_BOOKMARK_FILLED =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
  const ICON_TRASH =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
  const ICON_CLOSE =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
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
  const ICON_CHECK =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

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
    if (!win.location) return '';
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

  function scheduleInject() {
    if (injectQueued) return;
    injectQueued = true;
    setTimeout(function () {
      injectQueued = false;
      injectAll();
    }, 120);
  }

  function normalizeId(href) {
    try {
      const u = new URL(href, ORIGIN);
      return u.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/').toLowerCase();
    } catch (e) {
      return String(href || '').toLowerCase().replace(/^\/+|\/+$/g, '');
    }
  }

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

  function normalizeStoredItems(raw) {
    const seen = {};
    const result = [];
    (Array.isArray(raw) ? raw : []).forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      const source = item.url || item.id || '';
      const id = normalizeId(source);
      if (!id || seen[id]) return;
      seen[id] = true;
      const folders = Array.isArray(item.folders) ? item.folders : [];
      result.push(Object.assign({}, item, { id: id, url: canonicalUrl(source), folders: folders }));
    });
    return result;
  }

  function normalizeStoredFolders(raw) {
    const seen = {};
    const result = [];
    const input = Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_FOLDERS;

    input.forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      const name = (f.name || '').trim();
      if (!name) return;
      const id = (f.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '');
      if (!id || seen[id]) return;
      seen[id] = true;
      result.push({ id: id, name: name });
    });
    return result.length > 0 ? result : DEFAULT_FOLDERS;
  }

  function isItemSaved(idOrUrl) {
    const needle = normalizeId(idOrUrl);
    return savedItems.some(function (item) {
      return item.id === needle || item.url === idOrUrl || normalizeId(item.url) === needle;
    });
  }

  function findIndexById(idOrUrl) {
    const needle = normalizeId(idOrUrl);
    for (let i = 0; i < savedItems.length; i++) {
      if (savedItems[i].id === needle || savedItems[i].url === idOrUrl || normalizeId(savedItems[i].url) === needle) return i;
    }
    return -1;
  }

  function getItemById(idOrUrl) {
    const idx = findIndexById(idOrUrl);
    return idx > -1 ? savedItems[idx] : null;
  }

  function isMarketplacePage() {
    if (!win.location) return false;
    return /^\/community\/marketplace\//.test(win.location.pathname);
  }

  function isDetailPage() {
    if (!win.location) return false;
    return /^\/community\/marketplace\/(components|templates|vectors|plugins)\/[^/]+\/?$/.test(
      win.location.pathname
    );
  }

  function classNameOf(el) {
    if (!el) return '';
    const c = el.className;
    return typeof c === 'string' ? c : (c && c.baseVal) || '';
  }

  // ------------------------------------------------------------
  // Background Metadata & Image Fetcher
  // ------------------------------------------------------------
  function fetchMetadataForItem(item) {
    if (!item || !item.url || item.fetchedMeta || pendingFetches.has(item.id)) return;

    const fetchFn = (typeof fetch !== 'undefined' ? fetch : (win && win.fetch)) || null;
    if (!fetchFn) return;

    pendingFetches.add(item.id);

    fetchFn(item.url)
      .then(function (res) { return res.text(); })
      .then(function (htmlText) {
        pendingFetches.delete(item.id);
        if (typeof DOMParser === 'undefined') return;
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(htmlText, 'text/html');

        const ogImage = parsedDoc.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
        const ogTitle = parsedDoc.querySelector('meta[property="og:title"], meta[name="twitter:title"]');

        let modified = false;

        if (ogImage && ogImage.content && !ogImage.content.includes('community-og.jpg')) {
          item.thumbnail = ogImage.content;
          modified = true;
        }

        if (ogTitle && ogTitle.content) {
          const cleanTitle = ogTitle.content.replace(/—\s*Framer.*$/i, '').trim();
          const parsed = parseTitleAndSubtitle(cleanTitle);
          if (parsed.title) item.title = parsed.title;
          if (parsed.subtitle) item.subtitle = parsed.subtitle;
          modified = true;
        }

        item.fetchedMeta = true;

        if (modified) {
          saveItemsToStorage();
          const overlay = doc.getElementById(OVERLAY_ID);
          if (overlay) renderSavedGrid();
        }
      })
      .catch(function () {
        pendingFetches.delete(item.id);
        item.fetchedMeta = true;
      });
  }

  function fetchMissingMetadataForCollection() {
    savedItems.forEach(function (item) {
      if (!item.thumbnail || item.thumbnail.includes('community-og.jpg') || !item.fetchedMeta) {
        fetchMetadataForItem(item);
      }
    });
  }

  // ------------------------------------------------------------
  // Storage
  // ------------------------------------------------------------
  function loadSavedItems(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY, FOLDERS_KEY], function (res) {
        savedItems = normalizeStoredItems(res[STORAGE_KEY]);
        savedFolders = normalizeStoredFolders(res[FOLDERS_KEY]);
        fetchMissingMetadataForCollection();
        callback && callback();
      });
    } else {
      try {
        const data = localStorage && localStorage.getItem(STORAGE_KEY);
        const fold = localStorage && localStorage.getItem(FOLDERS_KEY);
        savedItems = normalizeStoredItems(data ? JSON.parse(data) : []);
        savedFolders = normalizeStoredFolders(fold ? JSON.parse(fold) : DEFAULT_FOLDERS);
      } catch (e) {
        savedItems = [];
        savedFolders = DEFAULT_FOLDERS;
      }
      fetchMissingMetadataForCollection();
      callback && callback();
    }
  }

  function saveItemsToStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: savedItems, [FOLDERS_KEY]: savedFolders }, function () {
        updateBadgeCount();
      });
    } else {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(savedItems));
          localStorage.setItem(FOLDERS_KEY, JSON.stringify(savedFolders));
        }
      } catch (e) { /* ignore */ }
      updateBadgeCount();
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName === 'local') {
        if (changes[STORAGE_KEY]) savedItems = normalizeStoredItems(changes[STORAGE_KEY].newValue);
        if (changes[FOLDERS_KEY]) savedFolders = normalizeStoredFolders(changes[FOLDERS_KEY].newValue);
        updateBadgeCount();
        fetchMissingMetadataForCollection();
        const overlay = doc.getElementById(OVERLAY_ID);
        if (overlay) {
          renderFolderPills();
          renderSavedGrid();
        }
      }
    });
  }

  // ------------------------------------------------------------
  // Folders API
  // ------------------------------------------------------------
  function createFolder(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!id) return null;

    const existing = savedFolders.find(function (f) { return f.id === id; });
    if (existing) return existing;

    const newFolder = { id: id, name: trimmed };
    savedFolders.push(newFolder);
    saveItemsToStorage();
    const overlay = doc.getElementById ? doc.getElementById(OVERLAY_ID) : null;
    if (overlay) renderFolderPills();
    return newFolder;
  }

  function toggleItemFolder(itemIdOrUrl, folderId) {
    const idx = findIndexById(itemIdOrUrl);
    if (idx === -1) return false;

    const item = savedItems[idx];
    if (!Array.isArray(item.folders)) item.folders = [];

    const fIdx = item.folders.indexOf(folderId);
    if (fIdx > -1) {
      item.folders.splice(fIdx, 1);
    } else {
      item.folders.push(folderId);
    }

    saveItemsToStorage();
    const overlay = doc.getElementById ? doc.getElementById(OVERLAY_ID) : null;
    if (overlay) renderSavedGrid();
    return item.folders.includes(folderId);
  }

  function getItemFolderCount(folderId) {
    if (folderId === 'all') return savedItems.length;
    return savedItems.filter(function (item) {
      return Array.isArray(item.folders) && item.folders.includes(folderId);
    }).length;
  }

  // ------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------
  function showToast(message) {
    if (!doc.body) return;
    let toast = doc.querySelector('.framer-saved-toast');
    if (!toast) {
      toast = doc.createElement('div');
      toast.className = 'framer-saved-toast';
      if (doc.body.appendChild) doc.body.appendChild(toast);
    }
    if (toast) {
      toast.innerHTML = '<span class="framer-saved-toast-icon">' + ICON_BOOKMARK + '</span><span>' + esc(message) + '</span>';
      if (toast.classList) toast.classList.add('show');
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toast && toast.classList) toast.classList.remove('show');
    }, 2200);
  }

  function updateBadgeCount() {
    if (!doc.querySelectorAll) return;
    doc.querySelectorAll('.framer-saved-badge').forEach(function (badge) {
      badge.textContent = savedItems.length;
    });
  }

  // ------------------------------------------------------------
  // Save & Pinterest-Style Save Popover
  // ------------------------------------------------------------
  function closeSavePopover() {
    const existing = doc.getElementById ? doc.getElementById(POPOVER_ID) : null;
    if (existing && existing.remove) existing.remove();
  }

  function openSavePopover(meta, triggerBtn) {
    closeSavePopover();

    const rect = triggerBtn.getBoundingClientRect ? triggerBtn.getBoundingClientRect() : { top: 100, left: 100, bottom: 130, right: 130 };
    const scrollY = win.scrollY || 0;
    const scrollX = win.scrollX || 0;
    const viewportW = win.innerWidth || 1024;
    const viewportH = win.innerHeight || 768;

    let popoverTop = rect.bottom + scrollY + 8;
    let popoverLeft = rect.left + scrollX;
    let originX = 'left';
    let originY = 'top';

    if (rect.left + 280 > viewportW) {
      popoverLeft = Math.max(10, rect.right + scrollX - 270);
      originX = 'right';
    }

    if (rect.bottom + 260 > viewportH) {
      popoverTop = Math.max(10, rect.top + scrollY - 250);
      originY = 'bottom';
    }

    const itemNormId = normalizeId(meta.url || meta.id);
    const canonicalKey = canonicalUrl(meta.url || meta.id);

    const isSaved = isItemSaved(itemNormId);
    if (!isSaved) {
      const newItem = {
        id: itemNormId,
        url: canonicalKey,
        title: meta.title || 'Framer Component',
        subtitle: meta.subtitle || '',
        price: meta.price || 'Free',
        creator: meta.creator || 'Framer Creator',
        thumbnail: meta.thumbnail || '',
        folders: [],
        savedAt: new Date().toISOString()
      };
      savedItems.unshift(newItem);
      saveItemsToStorage();
      fetchMetadataForItem(newItem);
    }

    const popover = doc.createElement('div');
    popover.id = POPOVER_ID;
    popover.className = 'framer-saved-popover';
    popover.style.top = popoverTop + 'px';
    popover.style.left = popoverLeft + 'px';
    if (popover.style.setProperty) {
      popover.style.setProperty('--popover-origin', originY + ' ' + originX);
    }

    function renderPopoverContent() {
      const currentItem = getItemById(itemNormId) || getItemById(canonicalKey) || meta;
      const currentFolders = currentItem && Array.isArray(currentItem.folders) ? currentItem.folders : [];

      let listHtml = '';
      savedFolders.forEach(function (f) {
        const selected = currentFolders.includes(f.id);
        listHtml +=
          '<div class="framer-saved-popover-item' + (selected ? ' is-selected' : '') + '" data-folder-id="' + esc(f.id) + '">' +
          '  <span>' + esc(f.name) + '</span>' +
          '  <span class="framer-saved-popover-item-check">' + (selected ? ICON_CHECK : '') + '</span>' +
          '</div>';
      });

      popover.innerHTML =
        '<div class="framer-saved-popover-header">' +
        '  <span class="framer-saved-popover-title">Save to Collection</span>' +
        '  <button type="button" class="framer-saved-popover-close" title="Close">' + ICON_CLOSE + '</button>' +
        '</div>' +
        '<div class="framer-saved-popover-list">' + listHtml + '</div>' +
        '<div class="framer-saved-popover-add">' +
        '  <input type="text" class="framer-saved-popover-input" placeholder="+ Create folder…" autocomplete="off" />' +
        '  <button type="button" class="framer-saved-popover-add-btn">Add</button>' +
        '</div>' +
        '<div class="framer-saved-popover-footer">' +
        '  <button type="button" class="framer-saved-popover-remove-btn">Remove from Saved</button>' +
        '</div>';

      popover.querySelectorAll('.framer-saved-popover-item').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          const fId = el.getAttribute('data-folder-id');
          const isNowInFolder = toggleItemFolder(itemNormId, fId);
          renderPopoverContent();
          showToast(isNowInFolder ? 'Added to folder' : 'Removed from folder');
          updateAllBtnStates(itemNormId);
        });
      });

      const closeBtn = popover.querySelector('.framer-saved-popover-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          closeSavePopover();
        });
      }

      const addInput = popover.querySelector('.framer-saved-popover-input');
      const addBtn = popover.querySelector('.framer-saved-popover-add-btn');

      function handleAddFolder() {
        if (!addInput) return;
        const val = addInput.value;
        const created = createFolder(val);
        if (created) {
          toggleItemFolder(itemNormId, created.id);
          addInput.value = '';
          renderPopoverContent();
          showToast('Created folder "' + created.name + '"');
        }
      }

      if (addBtn) {
        addBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          handleAddFolder();
        });
      }

      if (addInput) {
        addInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            handleAddFolder();
          }
        });
      }

      const removeBtn = popover.querySelector('.framer-saved-popover-remove-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          const idx = findIndexById(itemNormId);
          if (idx > -1) {
            savedItems.splice(idx, 1);
            saveItemsToStorage();
            showToast('Removed from Saved');
            updateAllBtnStates(itemNormId);
            const overlay = doc.getElementById(OVERLAY_ID);
            if (overlay) renderSavedGrid();
          }
          closeSavePopover();
        });
      }
    }

    renderPopoverContent();
    if (doc.body) doc.body.appendChild(popover);
    showToast('Saved to Favorites!');
    updateAllBtnStates(itemNormId);

    setTimeout(function () {
      function onOutsideClick(e) {
        if (!popover.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
          closeSavePopover();
          doc.removeEventListener('click', onOutsideClick, true);
        }
      }
      if (doc.addEventListener) doc.addEventListener('click', onOutsideClick, true);
    }, 50);
  }

  function toggleSaveItem(meta) {
    const idx = findIndexById(meta.id || meta.url);
    if (idx > -1) {
      savedItems.splice(idx, 1);
      saveItemsToStorage();
      showToast('Removed from Saved');
      return false;
    } else {
      const newItem = {
        id: normalizeId(meta.url),
        url: canonicalUrl(meta.url),
        title: meta.title || 'Framer Component',
        subtitle: meta.subtitle || '',
        price: meta.price || 'Free',
        creator: meta.creator || 'Framer Creator',
        thumbnail: meta.thumbnail || '',
        folders: [],
        savedAt: new Date().toISOString()
      };
      savedItems.unshift(newItem);
      saveItemsToStorage();
      showToast('Saved to Favorites!');
      fetchMetadataForItem(newItem);
      return true;
    }
  }

  function updateAllBtnStates(itemId) {
    const saved = isItemSaved(itemId);

    doc.querySelectorAll('.framer-saved-detail-btn').forEach(function (btn) {
      updateDetailBtnContent(btn, saved);
    });

    doc.querySelectorAll('.framer-saved-card-inline-btn').forEach(function (btn) {
      setCardBtnState(btn, saved);
    });
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
      rawTitle = doc.title ? doc.title.replace(/—\s*Framer\s*(Marketplace)?\s*$/i, '').trim() : '';
    }
    const parsed = parseTitleAndSubtitle(rawTitle);

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
  // CTA button discovery
  // ------------------------------------------------------------
  const CTA_PATTERNS = [
    /^Copy (Component|Template)$/i,
    /^Buy for\b/i,
    /^Use for\b/i,
    /^Get /i,
    /^Remix$/i
  ];

  function findCtaButton() {
    if (!doc.querySelectorAll) return null;
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
    if (!doc.querySelectorAll) return null;
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
    if (!win.location || !win.location.pathname || !win.location.pathname.includes('/community/')) return;
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
  // 2) Detail page "Save" button
  // ------------------------------------------------------------
  function injectDetailBookmarkButton() {
    if (!isDetailPage()) return;

    const ctaBtn = findCtaButton();
    if (!ctaBtn || !ctaBtn.parentElement) return;

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
      openSavePopover(getCurrentPageMetadata(), btn);
    });

    ctaBtn.parentElement.insertBefore(btn, ctaBtn);
  }

  function updateDetailBtnContent(btn, saved) {
    btn.className = 'framer-saved-detail-btn' + (saved ? ' is-saved' : '');
    btn.setAttribute('aria-label', saved ? 'Remove from Saved' : 'Save component');
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.title = saved ? 'Manage folders or remove' : 'Save component';
    btn.innerHTML =
      '<span class="framer-saved-detail-btn-icon">' + (saved ? ICON_BOOKMARK_FILLED : ICON_BOOKMARK) + '</span>' +
      '<span class="framer-saved-detail-btn-label">' + (saved ? 'Saved' : 'Save') + '</span>';
  }

  // ------------------------------------------------------------
  // 3) Marketplace grid card bookmark buttons
  // ------------------------------------------------------------
  function findTile(link) {
    let el = link;
    let topTile = null;

    for (let i = 0; i < 8 && el && el.tagName !== 'BODY'; i++) {
      if (el.tagName === 'A') {
        el = el.parentElement;
        continue;
      }

      const cls = classNameOf(el).toLowerCase();
      const tag = (el.tagName || '').toLowerCase();

      if (/titlerow|info|stats|subline|footer|meta|author|creator|byline|breadcrumb/.test(cls)) {
        el = el.parentElement;
        continue;
      }

      if (/tile|card|post|item/.test(cls) || tag === 'article' || tag === 'li') {
        topTile = el;
        if (/tile/i.test(cls)) break;
      }

      el = el.parentElement;
    }

    return topTile || (link.closest('article, li') || link.parentElement);
  }

  function ensurePositioned(el) {
    try {
      if (win.getComputedStyle(el).position === 'static') el.style.position = 'relative';
    } catch (e) { /* ignore */ }
  }

  function setCardBtnState(btn, saved) {
    btn.className = 'framer-saved-card-inline-btn' + (saved ? ' is-saved' : '');
    btn.setAttribute('aria-label', saved ? 'Manage saved component' : 'Save component');
    btn.title = saved ? 'Manage folders or remove' : 'Save component';
    btn.innerHTML = saved ? ICON_BOOKMARK_FILLED : ICON_BOOKMARK;
  }

  function injectCardBookmarkButtons() {
    if (!isMarketplacePage() || isDetailPage()) return;
    if (!doc.querySelectorAll) return;

    const links = doc.querySelectorAll('a[href*="/marketplace/"]');
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = link.getAttribute('href') || '';

      if (link.closest('nav, [class*="breadcrumb"], [class*="breadCrumb"], [class*="Breadcrumb"]')) continue;

      if (!/\/marketplace\/(components|templates|vectors|plugins)\/[^/?#]+\/?$/.test(href)) continue;
      if (/\/(categories|tags|author|creator|collections)\/?$/i.test(href)) continue;

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

        const meta = {
          id: cardId,
          url: link.href,
          title: parsed.title || 'Framer Component',
          subtitle: parsed.subtitle || '',
          price: priceEl ? (priceEl.textContent || '').trim() : 'Free',
          creator: creator,
          thumbnail: img ? img.src : ''
        };

        openSavePopover(meta, actionBtn);
      });

      ensurePositioned(tile);
      tile.appendChild(actionBtn);
    }
  }

  // ------------------------------------------------------------
  // 4) Saved view overlay with Pinterest / Awwwards Folder Bar
  // ------------------------------------------------------------
  function isSavedRoute() {
    if (!win.location) return false;
    return win.location.hash === SAVED_HASH;
  }

  function openSavedView() {
    if (!isSavedRoute()) {
      enteredViaPush = true;
      try {
        hist.pushState(null, '', SAVED_HASH);
      } catch (e) {
        if (win.location) win.location.hash = SAVED_HASH;
      }
    }
    syncSavedViewState();
  }

  function closeSavedView() {
    if (isSavedRoute()) {
      if (enteredViaPush) {
        enteredViaPush = false;
        hist.back();
      } else {
        const target = win.location.pathname + win.location.search;
        try {
          hist.replaceState(null, '', target);
        } catch (e) {
          if (win.location) win.location.hash = '';
        }
      }
    }
    syncSavedViewState();
  }

  function computeOverlayBounds() {
    const main = doc.querySelector('main, [role="main"], [class*="content"]');
    if (main) {
      const r = main.getBoundingClientRect();
      if (r.width > 120 && r.left >= 0) {
        return {
          top: Math.max(0, r.top),
          right: Math.max(0, (win.innerWidth || 1024) - r.right),
          bottom: Math.max(0, (win.innerHeight || 768) - r.bottom),
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
      '      <h1><span class="framer-saved-title-icon">' + ICON_LOGO + '</span>Saved Collections</h1>' +
      '      <p>Organize your saved Framer components by style, category, or project.</p>' +
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
      '  <div id="framer-saved-folder-bar" class="framer-saved-folder-bar"></div>' +
      '  <div id="framer-saved-grid" class="framer-saved-grid"></div>' +
      '</div>';

    if (doc.body) doc.body.appendChild(overlay);

    const backBtn = overlay.querySelector('.framer-saved-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        closeSavedView();
      });
    }

    const importPanel = overlay.querySelector('.framer-saved-import-panel');
    const importInput = overlay.querySelector('#framer-saved-import-input');
    const importBtn = overlay.querySelector('.framer-saved-import-btn');
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        importPanel.hidden = !importPanel.hidden;
        if (!importPanel.hidden && importInput) importInput.focus();
      });
    }
    const importCancel = overlay.querySelector('.framer-saved-import-cancel');
    if (importCancel) {
      importCancel.addEventListener('click', function () {
        importPanel.hidden = true;
      });
    }
    const importGo = overlay.querySelector('.framer-saved-import-go');
    if (importGo) {
      importGo.addEventListener('click', function () {
        const count = importLinks(importInput ? importInput.value : '');
        if (importInput) importInput.value = '';
        importPanel.hidden = true;
        renderFolderPills();
        renderSavedGrid();
        if (count === 0) showToast('No new valid Framer links found');
      });
    }

    const searchInput = overlay.querySelector('#framer-saved-search');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        currentSearchQuery = e.target.value;
        renderSavedGrid();
      });
    }

    renderFolderPills();
    renderSavedGrid();

    setTimeout(function () {
      if (searchInput && savedItems.length > 0 && (win.innerWidth || 1024) > 640) searchInput.focus();
    }, 50);
  }

  function renderFolderPills() {
    const bar = doc.getElementById('framer-saved-folder-bar');
    if (!bar) return;

    let html =
      '<button type="button" class="framer-saved-folder-pill' + (activeFolderId === 'all' ? ' active' : '') + '" data-folder-id="all">' +
      '  <span>All Items</span>' +
      '  <span class="pill-count">' + getItemFolderCount('all') + '</span>' +
      '</button>';

    savedFolders.forEach(function (f) {
      const count = getItemFolderCount(f.id);
      html +=
        '<button type="button" class="framer-saved-folder-pill' + (activeFolderId === f.id ? ' active' : '') + '" data-folder-id="' + esc(f.id) + '">' +
        '  <span>' + esc(f.name) + '</span>' +
        '  <span class="pill-count">' + count + '</span>' +
        '</button>';
    });

    html +=
      '<button type="button" class="framer-saved-folder-pill framer-saved-folder-add-pill" title="Create new folder">' +
      '  ' + ICON_PLUS + '<span>New Folder</span>' +
      '</button>';

    bar.innerHTML = html;

    bar.querySelectorAll('.framer-saved-folder-pill[data-folder-id]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        activeFolderId = pill.getAttribute('data-folder-id');
        renderFolderPills();
        renderSavedGrid();
      });
    });

    const addPill = bar.querySelector('.framer-saved-folder-add-pill');
    if (addPill) {
      addPill.addEventListener('click', function () {
        const name = typeof win.prompt === 'function' ? win.prompt('Enter new folder name (e.g. Minimalist, Dark UI):') : '';
        const created = createFolder(name);
        if (created) {
          activeFolderId = created.id;
          renderFolderPills();
          renderSavedGrid();
          showToast('Folder "' + created.name + '" created');
        }
      });
    }
  }

  function renderSavedGrid() {
    const grid = doc.getElementById('framer-saved-grid');
    if (!grid) return;

    const q = (currentSearchQuery || '').toLowerCase().trim();
    const filtered = savedItems.filter(function (item) {
      if (activeFolderId !== 'all') {
        if (!Array.isArray(item.folders) || !item.folders.includes(activeFolderId)) return false;
      }
      if (!q) return true;
      return (
        (item.title || '').toLowerCase().includes(q) ||
        (item.subtitle || '').toLowerCase().includes(q) ||
        (item.creator || '').toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      const activeFolderObj = savedFolders.find(function (f) { return f.id === activeFolderId; });
      const folderName = activeFolderObj ? activeFolderObj.name : 'this collection';

      grid.innerHTML =
        '<div class="framer-saved-empty-state">' +
        '  <div class="framer-saved-empty-icon">' + ICON_EMPTY + '</div>' +
        '  <h3>' + esc(savedItems.length === 0 ? 'No saved components yet' : 'No components in ' + folderName) + '</h3>' +
        '  <p>' + esc(savedItems.length === 0
          ? 'Explore the Framer Marketplace, or click Import Links to add items.'
          : 'Save items to "' + folderName + '" from any card or detail page.') + '</p>' +
        '</div>';
      return;
    }

    let html = '<div class="framer-saved-grid-cards">';
    filtered.forEach(function (item) {
      const parsed = parseTitleAndSubtitle(item.title);
      const title = parsed.title || 'Framer Component';

      let folderTagsHtml = '';
      if (Array.isArray(item.folders) && item.folders.length > 0) {
        folderTagsHtml = '<div class="framer-saved-card-folders">';
        item.folders.forEach(function (fId) {
          const fObj = savedFolders.find(function (f) { return f.id === fId; });
          if (fObj) {
            folderTagsHtml += '<span class="framer-saved-card-folder-tag">' + esc(fObj.name) + '</span>';
          }
        });
        folderTagsHtml += '</div>';
      }

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
        folderTagsHtml +
        '  </div>' +
        '</div>';
    });
    html += '</div>';
    grid.innerHTML = html;

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
          renderFolderPills();
          renderSavedGrid();
          showToast('Removed from Saved');
        }
      });
    });
  }

  function syncSavedViewState() {
    const overlay = doc.getElementById ? doc.getElementById(OVERLAY_ID) : null;
    const active = isSavedRoute();

    if (active) {
      buildSavedOverlay();
    } else if (overlay) {
      overlay.remove();
      currentSearchQuery = '';
      closeSavePopover();
    }

    if (doc.querySelectorAll) {
      doc.querySelectorAll('.framer-saved-nav-item').forEach(function (el) {
        el.classList.toggle('active', active);
      });
    }
  }

  // ------------------------------------------------------------
  // Import links with background metadata fetch
  // ------------------------------------------------------------
  function importLinks(urlsText) {
    if (!urlsText) return 0;
    const lines = String(urlsText).split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    let count = 0;
    const newlyImported = [];

    lines.forEach(function (rawUrl) {
      if (!/framer\.com/.test(rawUrl)) return;
      const clean = rawUrl.split(/[?#]/)[0];
      const id = normalizeId(clean);
      if (!id || findIndexById(id) > -1) return;

      const slug = id.split('/').pop() || 'imported-item';
      const formattedTitle = slug
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, function (c) { return c.toUpperCase(); });

      const item = {
        id: id,
        url: canonicalUrl(clean),
        title: formattedTitle,
        subtitle: 'Imported Link',
        price: 'Free',
        creator: 'Imported',
        thumbnail: '',
        folders: [],
        fetchedMeta: false,
        savedAt: new Date().toISOString()
      };

      savedItems.unshift(item);
      newlyImported.push(item);
      count++;
    });

    if (count > 0) {
      saveItemsToStorage();
      updateBadgeCount();
      showToast('Imported ' + count + ' link' + (count === 1 ? '' : 's'));
      newlyImported.forEach(fetchMetadataForItem);
    }
    return count;
  }

  // ------------------------------------------------------------
  // Cleanup stale UI on page change
  // ------------------------------------------------------------
  function clearStaleInjectedUi() {
    if (!doc.querySelectorAll) return;
    doc.querySelectorAll('.framer-saved-detail-btn, .framer-saved-card-inline-btn').forEach(function (el) {
      el.remove();
    });
  }

  // ------------------------------------------------------------
  // History / routing hooks
  // ------------------------------------------------------------
  function patchHistoryAPI() {
    if (!hist.pushState) return;

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

    if (win.addEventListener) {
      win.addEventListener('popstate', function () {
        syncSavedViewState();
        injectAll();
      });
      win.addEventListener('hashchange', function () {
        syncSavedViewState();
        injectAll();
      });
    }

    if (doc.addEventListener) {
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
            if (!isSavedRoute()) return;
            let targetPath = null;
            try {
              targetPath = new URL(link.href, ORIGIN).pathname;
            } catch (err) { /* ignore */ }
            if (targetPath === win.location.pathname) {
              try {
                hist.replaceState(null, '', win.location.pathname + win.location.search);
              } catch (err) { /* ignore */ }
            }
            syncSavedViewState();
          }, 80);
        },
        true
      );

      doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closeSavePopover();
          if (isSavedRoute()) {
            e.preventDefault();
            closeSavedView();
          }
        }
      });
    }
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

    if (typeof MutationObserver !== 'undefined' && doc.body) {
      const observer = new MutationObserver(function () {
        try {
          scheduleInject();
          syncSavedViewState();
        } catch (err) { warn(err); }
      });
      observer.observe(doc.body, { childList: true, subtree: true });
    }

    setInterval(function () {
      if (!doc.hidden) {
        if (urlChanged()) injectAll();
        else scheduleInject();
      }
    }, 500);

    if (win.addEventListener) {
      win.addEventListener('scroll', function () {
        if (!doc.hidden) injectCardBookmarkButtons();
      }, { passive: true });
    }

    injectAll();
    syncSavedViewState();
  }

  // Boot only when in full browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    loadSavedItems(initApp);
  }

  // Exposed for unit tests only
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      esc: esc,
      normalizeId: normalizeId,
      canonicalUrl: canonicalUrl,
      normalizeStoredItems: normalizeStoredItems,
      normalizeStoredFolders: normalizeStoredFolders,
      parseTitleAndSubtitle: parseTitleAndSubtitle,
      isItemSaved: isItemSaved,
      findIndexById: findIndexById,
      toggleSaveItem: toggleSaveItem,
      createFolder: createFolder,
      toggleItemFolder: toggleItemFolder,
      findTile: findTile,
      findCtaButton: findCtaButton
    };
  }
})();
