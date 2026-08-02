(function () {
  'use strict';

  // ============================================================
  //  Framer Saved — content script (v1.2)
  //  Robust, Framer-native bookmarking, folders & one-click
  //  live-preview export to ZIP (HTML/CSS/JS).
  // ============================================================

  const STORAGE_KEY = 'framer_saved_items_v1';
  const FOLDERS_KEY = 'framer_saved_folders_v1';
  const SETTINGS_KEY = 'framer_saved_settings_v1';
  const SAVED_HASH = '#saved';
  const OVERLAY_ID = 'framer-saved-overlay';
  const POPOVER_ID = 'framer-saved-folder-popover';
  const SETTINGS_PANEL_ID = 'framer-saved-settings-panel';
  const EXPORT_PROGRESS_ID = 'framer-saved-export-progress';

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

  const DEFAULT_SETTINGS = {
    export: {
      includeJs: true,
      stripJs: false,
      stripBadge: true,
      stripAnalytics: true,
      autoScroll: true,
      waitMs: 2500,
      includeFonts: true,
      includeImages: true
    },
    ui: {
      sortBy: 'savedAt-desc',
      showExportBtn: true,
      showBadgeCount: true,
      shortcutSave: true,
      shortcutSearch: true
    }
  };

  let savedItems = [];
  let savedFolders = [];
  let settings = deepClone(DEFAULT_SETTINGS);
  let activeFolderId = 'all';
  let enteredViaPush = false;
  let currentSearchQuery = '';
  let toastTimer = null;
  let injectQueued = false;
  let lastUrl = win.location ? (win.location.pathname + win.location.search + win.location.hash) : '';
  const pendingFetches = new Set();

  // ------------------------------------------------------------
  // Icons
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
  const ICON_SETTINGS =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
  const ICON_DOWNLOAD =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
  const ICON_SORT =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M6 12h12M10 18h4"></path></svg>';
  const ICON_FOLDER_DELETE =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-2 14H7L5 6"></path></svg>';

  // ------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------
  function deepClone(o) {
    try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; }
  }

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
    }, 150);
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
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
        try { return decodeURIComponent(seg); } catch (e) { return seg; }
      });
      return ORIGIN + '/' + decoded.map(encodeURIComponent).join('/') + '/';
    } catch (e) {
      return String(href || '');
    }
  }

  function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
      const id = (f.id || slugify(name));
      if (!id || seen[id]) return;
      seen[id] = true;
      result.push({ id: id, name: name });
    });
    return result.length > 0 ? result : DEFAULT_FOLDERS.slice();
  }

  function mergeSettings(raw) {
    const out = deepClone(DEFAULT_SETTINGS);
    if (!raw || typeof raw !== 'object') return out;
    if (raw.export) Object.assign(out.export, raw.export);
    if (raw.ui) Object.assign(out.ui, raw.ui);
    return out;
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
  // Settings storage
  // ------------------------------------------------------------
  function loadSettings(cb) {
    const done = function (raw) {
      settings = mergeSettings(raw);
      applySettingsToDom();
      cb && cb();
    };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([SETTINGS_KEY], function (res) { done(res[SETTINGS_KEY]); });
    } else {
      try { done(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')); }
      catch (e) { done(null); }
    }
  }

  function saveSettingsToStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    } else {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
    }
  }

  function applySettingsToDom() {
    const showBadge = !!(settings.ui && settings.ui.showBadgeCount);
    doc.querySelectorAll('.framer-saved-badge').forEach(function (b) {
      b.style.display = showBadge ? '' : 'none';
    });
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
        const ogPreview = parsedDoc.querySelector('a[href*="framer.website"], a[href*="framer.app"], a[href*="framer.ai"]');

        let modified = false;

        if (ogImage && ogImage.content && !ogImage.content.includes('community-og.jpg')) {
          item.thumbnail = ogImage.content;
          modified = true;
        }
        if (ogTitle && ogTitle.content) {
          const cleanTitle = ogTitle.content.replace(/[—–-]\s*Framer.*$/i, '').trim();
          const parsed = parseTitleAndSubtitle(cleanTitle);
          if (parsed.title) item.title = parsed.title;
          if (parsed.subtitle) item.subtitle = parsed.subtitle;
          modified = true;
        }
        if (ogPreview && ogPreview.href && !item.previewUrl) {
          item.previewUrl = ogPreview.href;
          modified = true;
        } else {
          // second pass: look for "Open Preview" text
          parsedDoc.querySelectorAll('a').forEach(function (a) {
            const t = (a.textContent || '').trim().toLowerCase();
            const h = a.getAttribute('href') || '';
            if ((t === 'open preview' || t.includes('preview')) &&
                (h.includes('framer.website') || h.includes('framer.app') || h.includes('framer.ai'))) {
              if (!item.previewUrl) { item.previewUrl = h; modified = true; }
            }
          });
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
      if (!item.thumbnail || item.thumbnail.includes('community-og.jpg') || !item.fetchedMeta || !item.previewUrl) {
        fetchMetadataForItem(item);
      }
    });
  }

  // ------------------------------------------------------------
  // Storage for items/folders
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
        savedFolders = DEFAULT_FOLDERS.slice();
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
      if (areaName !== 'local') return;
      if (changes[STORAGE_KEY]) savedItems = normalizeStoredItems(changes[STORAGE_KEY].newValue);
      if (changes[FOLDERS_KEY]) savedFolders = normalizeStoredFolders(changes[FOLDERS_KEY].newValue);
      if (changes[SETTINGS_KEY]) settings = mergeSettings(changes[SETTINGS_KEY].newValue);
      updateBadgeCount();
      applySettingsToDom();
      fetchMissingMetadataForCollection();
      const overlay = doc.getElementById(OVERLAY_ID);
      if (overlay) {
        renderFolderPills();
        renderSavedGrid();
      }
    });
  }

  // Listen for messages from background (export progress etc.)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg) return;
      if (msg.type === 'export-progress') {
        showExportProgress(msg);
      }
      if (msg.type === 'settings-updated') {
        settings = mergeSettings(msg.settings);
        applySettingsToDom();
        renderFolderPills();
        renderSavedGrid();
      }
    });
  }

  // ------------------------------------------------------------
  // Folders API
  // ------------------------------------------------------------
  function createFolder(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const id = slugify(trimmed);
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

  function deleteFolder(id) {
    const idx = savedFolders.findIndex(function (f) { return f.id === id; });
    if (idx === -1) return false;
    // Don't allow deleting default folders
    if (DEFAULT_FOLDERS.some(function (d) { return d.id === id; })) return false;
    savedFolders.splice(idx, 1);
    // Remove this folder from items
    savedItems.forEach(function (it) {
      if (Array.isArray(it.folders)) {
        const fi = it.folders.indexOf(id);
        if (fi > -1) it.folders.splice(fi, 1);
      }
    });
    if (activeFolderId === id) activeFolderId = 'all';
    saveItemsToStorage();
    return true;
  }

  function renameFolder(id, newName) {
    const folder = savedFolders.find(function (f) { return f.id === id; });
    if (!folder) return null;
    const trimmed = (newName || '').trim();
    if (!trimmed) return null;
    folder.name = trimmed;
    saveItemsToStorage();
    return folder;
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
  function showToast(message, kind) {
    if (!doc.body) return;
    let toast = doc.querySelector('.framer-saved-toast');
    if (!toast) {
      toast = doc.createElement('div');
      toast.className = 'framer-saved-toast';
      if (doc.body.appendChild) doc.body.appendChild(toast);
    }
    toast.classList.remove('is-error', 'is-success');
    if (kind === 'error') toast.classList.add('is-error');
    if (kind === 'success') toast.classList.add('is-success');
    toast.innerHTML = '<span class="framer-saved-toast-icon">' + (kind === 'error' ? ICON_CLOSE : ICON_BOOKMARK) + '</span><span>' + esc(message) + '</span>';
    if (toast.classList) toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toast && toast.classList) toast.classList.remove('show');
    }, 2600);
  }

  function updateBadgeCount() {
    if (!doc.querySelectorAll) return;
    const show = !!(settings.ui && settings.ui.showBadgeCount);
    doc.querySelectorAll('.framer-saved-badge').forEach(function (badge) {
      badge.textContent = savedItems.length;
      badge.style.display = show ? '' : 'none';
    });
  }

  // ------------------------------------------------------------
  // Export progress UI
  // ------------------------------------------------------------
  function showExportProgress(msg) {
    let el = doc.getElementById(EXPORT_PROGRESS_ID);
    if (!el && doc.body) {
      el = doc.createElement('div');
      el.id = EXPORT_PROGRESS_ID;
      el.className = 'framer-saved-export-progress';
      el.innerHTML =
        '<div class="framer-saved-ep-head">' +
        '  <span class="framer-saved-ep-title">Exporting Live Preview…</span>' +
        '  <button class="framer-saved-ep-close" type="button">' + ICON_CLOSE + '</button>' +
        '</div>' +
        '<div class="framer-saved-ep-bar"><div class="framer-saved-ep-fill"></div></div>' +
        '<div class="framer-saved-ep-msg">Starting…</div>';
      doc.body.appendChild(el);
      el.querySelector('.framer-saved-ep-close').addEventListener('click', function () {
        el.remove();
      });
    }
    if (!el) return;

    const fill = el.querySelector('.framer-saved-ep-fill');
    const message = el.querySelector('.framer-saved-ep-msg');
    const title = el.querySelector('.framer-saved-ep-title');

    if (msg.status === 'done') {
      title.textContent = 'Export ready!';
      fill.style.width = '100%';
      message.textContent = 'Download has started.';
      setTimeout(function () { if (el) el.remove(); }, 3500);
      return;
    }
    if (msg.status === 'error') {
      title.textContent = 'Export failed';
      message.textContent = msg.message || 'Something went wrong';
      el.classList.add('is-error');
      return;
    }
    el.classList.remove('is-error');
    if (msg.message) message.textContent = msg.message;
    if (typeof msg.done === 'number' && typeof msg.total === 'number' && msg.total > 0) {
      fill.style.width = Math.min(100, Math.round((msg.done / msg.total) * 100)) + '%';
    }
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

    // Position relative to viewport (fixed), using rect coordinates (they are viewport-relative)
    let popoverTop = rect.bottom + 8;
    let popoverLeft = rect.left;
    let originX = 'left';
    let originY = 'top';

    if (rect.left + 280 > viewportW - 8) {
      popoverLeft = Math.max(10, rect.right - 270);
      originX = 'right';
    }

    if (rect.bottom + 280 > viewportH - 8 && rect.top > 280) {
      popoverTop = Math.max(10, rect.top - 270);
      originY = 'bottom';
    }

    const itemNormId = normalizeId(meta.url || meta.id);
    const canonicalKey = canonicalUrl(meta.url || meta.id);

    const wasSaved = isItemSaved(itemNormId);
    if (!wasSaved) {
      const newItem = {
        id: itemNormId,
        url: canonicalKey,
        title: meta.title || 'Framer Component',
        subtitle: meta.subtitle || '',
        price: meta.price || 'Free',
        creator: meta.creator || 'Framer Creator',
        thumbnail: meta.thumbnail || '',
        previewUrl: meta.previewUrl || '',
        folders: [],
        savedAt: new Date().toISOString()
      };
      savedItems.unshift(newItem);
      saveItemsToStorage();
      fetchMetadataForItem(newItem);
      showToast('Saved to Favorites!', 'success');
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
        const isDefault = DEFAULT_FOLDERS.some(function (d) { return d.id === f.id; });
        listHtml +=
          '<div class="framer-saved-popover-item' + (selected ? ' is-selected' : '') + '" data-folder-id="' + esc(f.id) + '">' +
          '  <span>' + esc(f.name) + '</span>' +
          '  <span class="framer-saved-popover-item-actions">' +
          (!isDefault ? '<button class="framer-saved-popover-folder-del" type="button" title="Delete folder">' + ICON_FOLDER_DELETE + '</button>' : '') +
          '  <span class="framer-saved-popover-item-check">' + (selected ? ICON_CHECK : '') + '</span>' +
          '  </span>' +
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
          if (e.target.closest('.framer-saved-popover-folder-del')) return;
          const fId = el.getAttribute('data-folder-id');
          const isNowInFolder = toggleItemFolder(itemNormId, fId);
          renderPopoverContent();
          renderFolderPills();
          showToast(isNowInFolder ? 'Added to folder' : 'Removed from folder');
          updateAllBtnStates(itemNormId);
        });
        const del = el.querySelector('.framer-saved-popover-folder-del');
        if (del) {
          del.addEventListener('click', function (e) {
            e.stopPropagation();
            const fId = el.getAttribute('data-folder-id');
            const fObj = savedFolders.find(function (x) { return x.id === fId; });
            if (!fObj) return;
            if (confirm('Delete folder "' + fObj.name + '"? Items inside will be kept (just untagged).')) {
              deleteFolder(fId);
              renderPopoverContent();
              renderFolderPills();
              showToast('Folder deleted');
            }
          });
        }
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
          renderFolderPills();
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
            renderFolderPills();
            const overlay = doc.getElementById(OVERLAY_ID);
            if (overlay) renderSavedGrid();
          }
          closeSavePopover();
        });
      }
    }

    renderPopoverContent();
    if (doc.body) doc.body.appendChild(popover);
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
        previewUrl: meta.previewUrl || '',
        folders: [],
        savedAt: new Date().toISOString()
      };
      savedItems.unshift(newItem);
      saveItemsToStorage();
      showToast('Saved to Favorites!', 'success');
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
    // Split on bullet/em-dash/en-dash/middot FIRST — colon can appear inside titles like "Foo: Bar"
    // but if there's no other delimiter, fall back to colon
    const strongDelims = [' • ', ' · ', ' — ', ' – ', ' - '];
    for (let i = 0; i < strongDelims.length; i++) {
      const d = strongDelims[i];
      if (rawTitle.includes(d)) {
        const parts = rawTitle.split(d);
        return { title: parts[0].trim(), subtitle: parts.slice(1).join(d).trim() };
      }
    }
    // Colon fallback only if it looks like "Label: Title" (first colon early)
    const ci = rawTitle.indexOf(':');
    if (ci > 2 && ci < 30 && ci < rawTitle.length - 2) {
      return { title: rawTitle.slice(0, ci).trim(), subtitle: rawTitle.slice(ci + 1).trim() };
    }
    return { title: rawTitle.trim(), subtitle: '' };
  }

  function findPreviewLink() {
    if (!doc.querySelectorAll) return null;
    const as = doc.querySelectorAll('a[href]');
    for (let i = 0; i < as.length; i++) {
      const a = as[i];
      const h = (a.getAttribute('href') || '').trim();
      const t = (a.textContent || '').trim().toLowerCase();
      if ((h.includes('framer.website') || h.includes('framer.app') || h.includes('framer.ai')) &&
          !h.includes('www.framer.com') && !h.includes('framer.com/community')) {
        if (t.includes('preview') || t.includes('open')) return a;
      }
    }
    // Fallback: first anchor to *.framer.website in the page
    for (let i = 0; i < as.length; i++) {
      const a = as[i];
      const h = (a.getAttribute('href') || '').trim();
      if (/https?:\/\/[a-z0-9-]+\.framer\.(website|app|ai)\//i.test(h) ||
          /https?:\/\/[a-z0-9-]+\.framer\.(website|app|ai)$/i.test(h)) {
        return a;
      }
    }
    return null;
  }

  function getCurrentPageMetadata() {
    const url = win.location.href.split(/[?#]/)[0];
    const id = normalizeId(url);

    const h1 = doc.querySelector('h1');
    let rawTitle = '';
    if (h1) {
      rawTitle = (h1.innerText || h1.textContent || '').trim();
    } else {
      rawTitle = doc.title ? doc.title.replace(/[—–-]\s*Framer\s*(Marketplace)?\s*$/i, '').trim() : '';
    }
    const parsed = parseTitleAndSubtitle(rawTitle);

    let price = 'Free';
    const ctaBtn = findCtaButton();
    if (ctaBtn) {
      const btnText = (ctaBtn.textContent || '').trim();
      const money = btnText.match(/\$\s?\d+(?:[.,]\d+)?/);
      if (money) price = money[0].replace(/\s/g, '');
      else if (/use for free|copy component|copy template|remix/i.test(btnText)) price = 'Free';
      else if (btnText.length < 30) price = btnText;
    }

    // Creator: look near the avatar or the author byline (skip related sections)
    let creator = 'Framer Creator';
    // Try structured: find CTA parent container (header area) first
    let scope = ctaBtn && ctaBtn.closest('header, section, div') ? ctaBtn.closest('header, section, div') : null;
    // If the CTA container is too small, go up more
    let scans = 0;
    while (scope && scope.querySelectorAll && scope.querySelectorAll('img[src*="avatars"], img[src*="creators/"]').length === 0 && scans < 5) {
      scope = scope.parentElement;
      scans++;
    }
    const creatorEl = scope && scope.querySelector ? scope.querySelector(
      'a[href*="/@"], a[href*="/creators/"], img[alt][src*="avatars/"], img[alt][src*="creators/"]'
    ) : null;
    if (creatorEl) {
      const alt = creatorEl.getAttribute && creatorEl.getAttribute('alt');
      const txt = (creatorEl.innerText || creatorEl.textContent || '').trim();
      const candidate = (txt && txt.length < 80 ? txt : alt) || '';
      if (candidate && candidate.length < 80 && candidate.length > 1) creator = candidate;
    }

    let thumbnail = '';
    const metaImg = doc.querySelector('meta[property="og:image"]');
    if (metaImg && metaImg.content) thumbnail = metaImg.content;
    if (!thumbnail) {
      const imgEl = doc.querySelector('main img[src], [class*="preview"] img[src], [class*="Thumbnail"] img[src]');
      if (imgEl && imgEl.src) thumbnail = imgEl.src;
    }

    let previewUrl = '';
    const prevLink = findPreviewLink();
    if (prevLink) previewUrl = prevLink.href;

    return {
      id: id,
      url: url,
      title: parsed.title || 'Framer Component',
      subtitle: parsed.subtitle || '',
      price: price,
      creator: creator,
      thumbnail: thumbnail,
      previewUrl: previewUrl,
      savedAt: new Date().toISOString()
    };
  }

  // ------------------------------------------------------------
  // CTA button discovery
  // ------------------------------------------------------------
  const CTA_PATTERNS = [
    /^Copy (Component|Template|Plugin)$/i,
    /^Buy for\b/i,
    /^Use for Free\b/i,
    /^Get (Started|Access|It)\b/i,
    /^Remix$/i
  ];

  function findCtaButton() {
    if (!doc.querySelectorAll) return null;
    // Scope to main/header region to avoid nav/footer lookalikes
    const scopes = [
      doc.querySelector('header'),
      doc.querySelector('main'),
      doc.querySelector('[class*="Header"]'),
      doc.querySelector('[class*="Action"]')
    ].filter(Boolean);

    let candidates = [];
    scopes.forEach(function (scope) {
      const nodes = scope.querySelectorAll('button, a[href], [role="button"]');
      nodes.forEach(function (el) { candidates.push(el); });
    });
    // Add global fallback
    const all = doc.querySelectorAll('button, a[href], [role="button"]');
    for (let i = 0; i < all.length; i++) candidates.push(all[i]);

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.closest('nav')) continue;
      if (el.closest('#' + OVERLAY_ID)) continue;
      if (el.closest('[class*="sidebar"], aside')) continue;
      if (el.closest('[class*="related"], [class*="more-from"]')) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length > 50) continue;
      if (CTA_PATTERNS.some(function (re) { return re.test(text); })) return el;
    }
    return null;
  }

  // ------------------------------------------------------------
  // Sidebar "Saved" tab
  // ------------------------------------------------------------
  function findSidebarContext() {
    if (!doc.querySelectorAll) return null;

    // Framer community sidebar has nav links; look for "Community" section
    // Strategy: find a link that points to /community/marketplace/... — its parent
    // list container is the sidebar menu.
    const links = doc.querySelectorAll('nav a[href], aside a[href], [class*="sidebar"] a[href], a[href*="/community/"]');
    let communityList = null;
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = (link.getAttribute('href') || '').split(/[?#]/)[0];
      if (href === '/community/marketplace/components/' ||
          href === '/community/marketplace/' ||
          href === '/community/') {
        // walk up to the <ul> or container of nav items
        let p = link.parentElement;
        for (let k = 0; k < 6 && p; k++) {
          if (p.tagName === 'UL' || p.tagName === 'NAV' || /list|nav|menu/i.test(classNameOf(p))) {
            communityList = p;
            break;
          }
          p = p.parentElement;
        }
        if (communityList) return { container: communityList, sibling: link };
      }
    }

    // Fallback: any nav/aside
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
  // Detail page Save + Export buttons
  // ------------------------------------------------------------
  function injectDetailButtons() {
    if (!isDetailPage()) return;

    const ctaBtn = findCtaButton();
    if (!ctaBtn || !ctaBtn.parentElement) return;

    const siblings = Array.prototype.slice.call(ctaBtn.parentElement.children);
    const hasSave = siblings.some(function (s) {
      return s.classList && s.classList.contains('framer-saved-detail-btn');
    });
    const hasExport = siblings.some(function (s) {
      return s.classList && s.classList.contains('framer-saved-export-detail-btn');
    });

    const metadata = getCurrentPageMetadata();
    const saved = isItemSaved(metadata.id);

    if (!hasSave) {
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

    if (!hasExport && settings.ui && settings.ui.showExportBtn) {
      const prevLink = findPreviewLink();
      if (prevLink) {
        const ebtn = doc.createElement('button');
        ebtn.type = 'button';
        ebtn.className = 'framer-saved-export-detail-btn';
        ebtn.title = 'Export live preview (HTML/CSS/JS ZIP)';
        ebtn.innerHTML = '<span class="framer-saved-detail-btn-icon">' + ICON_DOWNLOAD + '</span><span>Export</span>';
        ebtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          triggerExport(getCurrentPageMetadata());
        });
        ctaBtn.parentElement.insertBefore(ebtn, ctaBtn);
      }
    }
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

  function triggerExport(meta) {
    if (!meta) meta = getCurrentPageMetadata();
    let previewUrl = meta.previewUrl || '';
    if (!previewUrl) {
      const link = findPreviewLink();
      if (link) previewUrl = link.href;
    }
    if (!previewUrl) {
      showToast('No Live Preview found on this page', 'error');
      return;
    }
    const slug = (meta.id || meta.url || 'framer-component').split('/').pop() || 'framer-component';
    showToast('Starting export…', 'success');
    try {
      chrome.runtime.sendMessage(
        { type: 'start-export', previewUrl: previewUrl, slug: slug },
        function (resp) {
          if (chrome.runtime.lastError) {
            showToast('Export error: ' + chrome.runtime.lastError.message, 'error');
            return;
          }
          if (!resp || !resp.ok) {
            showToast('Export failed: ' + (resp && resp.error || 'unknown'), 'error');
          }
        }
      );
    } catch (e) {
      showToast('Export error: ' + e.message, 'error');
    }
  }

  // ------------------------------------------------------------
  // Marketplace grid card bookmark buttons
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

      if (/titlerow|info|stats|subline|footer|meta|author|creator|byline|breadcrumb|actions/i.test(cls)) {
        el = el.parentElement;
        continue;
      }

      // Skip sidebar/nav tiles
      if (el.closest && el.closest('aside, nav, [class*="sidebar"]')) return null;

      if (/tile|card|post|item/i.test(cls) || tag === 'article' || tag === 'li') {
        topTile = el;
        if (/tile|card/i.test(cls)) break;
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

      if (link.closest('nav, aside, [class*="sidebar"], [class*="breadcrumb"], [class*="breadCrumb"], [class*="Breadcrumb"]')) continue;
      if (link.closest('#' + OVERLAY_ID)) continue;

      if (!/\/marketplace\/(components|templates|vectors|plugins)\/[^/?#]+\/?$/.test(href)) continue;
      if (/\/(categories|tags|author|creator|collections)\/?/i.test(href)) continue;

      const tile = findTile(link);
      if (!tile) continue;
      if (tile.closest('#' + OVERLAY_ID)) continue;
      if (tile.querySelector('.framer-saved-card-inline-btn')) continue;
      // Avoid injecting into tiles in tiny / nav-like contexts
      const rect = tile.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) continue;

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
  // Saved view overlay
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
    closeSettingsPanel();
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
      '      <p>Organize your saved Framer components by style, category, or project. Export live previews as ZIP.</p>' +
      '    </div>' +
      '    <div class="framer-saved-controls">' +
      '      <button type="button" class="framer-saved-btn framer-saved-btn-ghost framer-saved-back-btn" title="Back to the Marketplace (Esc)">' +
      '        ' + ICON_ARROW_LEFT + '<span>Back to Marketplace</span>' +
      '      </button>' +
      '      <button type="button" class="framer-saved-btn framer-saved-btn-ghost framer-saved-import-btn" title="Import Framer Marketplace links">' +
      '        ' + ICON_PLUS + '<span>Import Links</span>' +
      '      </button>' +
      '      <button type="button" class="framer-saved-btn framer-saved-btn-ghost framer-saved-settings-btn" title="Settings">' +
      '        ' + ICON_SETTINGS + '<span>Settings</span>' +
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
      '  <div class="framer-saved-toolbar">' +
      '    <div id="framer-saved-folder-bar" class="framer-saved-folder-bar"></div>' +
      '    <div class="framer-saved-sort">' +
      '      <span class="framer-saved-sort-icon">' + ICON_SORT + '</span>' +
      '      <select id="framer-saved-sort-select" class="framer-saved-sort-select">' +
      '        <option value="savedAt-desc">Newest first</option>' +
      '        <option value="savedAt-asc">Oldest first</option>' +
      '        <option value="title-asc">Title A→Z</option>' +
      '        <option value="price-asc">Price (Free first)</option>' +
      '      </select>' +
      '    </div>' +
      '  </div>' +
      '  <div id="framer-saved-grid" class="framer-saved-grid"></div>' +
      '</div>';

    if (doc.body) doc.body.appendChild(overlay);

    const backBtn = overlay.querySelector('.framer-saved-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        closeSavedView();
      });
    }

    const settingsBtn = overlay.querySelector('.framer-saved-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', toggleSettingsPanel);
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

    const sortSelect = overlay.querySelector('#framer-saved-sort-select');
    if (sortSelect) {
      sortSelect.value = (settings.ui && settings.ui.sortBy) || 'savedAt-desc';
      sortSelect.addEventListener('change', function () {
        if (!settings.ui) settings.ui = {};
        settings.ui.sortBy = sortSelect.value;
        saveSettingsToStorage();
        renderSavedGrid();
      });
    }

    renderFolderPills();
    renderSavedGrid();

    setTimeout(function () {
      if (searchInput && savedItems.length > 0 && (win.innerWidth || 1024) > 640) searchInput.focus();
    }, 100);
  }

  function closeSettingsPanel() {
    const p = doc.getElementById(SETTINGS_PANEL_ID);
    if (p) p.remove();
  }

  function toggleSettingsPanel() {
    const existing = doc.getElementById(SETTINGS_PANEL_ID);
    if (existing) { existing.remove(); return; }
    buildSettingsPanel();
  }

  function buildSettingsPanel() {
    closeSettingsPanel();
    const ov = doc.getElementById(OVERLAY_ID);
    if (!ov) return;
    const panel = doc.createElement('div');
    panel.id = SETTINGS_PANEL_ID;
    panel.className = 'framer-saved-settings-panel';
    const e = settings.export || {};
    const u = settings.ui || {};
    panel.innerHTML =
      '<div class="framer-saved-settings-head">' +
      '  <h3>Settings</h3>' +
      '  <button class="framer-saved-settings-close" type="button">' + ICON_CLOSE + '</button>' +
      '</div>' +
      '<div class="framer-saved-settings-body">' +
      '  <div class="framer-saved-settings-section">' +
      '    <h4>Interface</h4>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-ui="showBadgeCount" ' + (u.showBadgeCount ? 'checked' : '') + ' /><span>Show saved count badge in sidebar</span></label>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-ui="showExportBtn" ' + (u.showExportBtn ? 'checked' : '') + ' /><span>Show Export button on detail pages</span></label>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-ui="shortcutSave" ' + (u.shortcutSave ? 'checked' : '') + ' /><span>Press S to quick-save on detail pages</span></label>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-ui="shortcutSearch" ' + (u.shortcutSearch ? 'checked' : '') + ' /><span>Press Ctrl/Cmd+K to focus search</span></label>' +
      '  </div>' +
      '  <div class="framer-saved-settings-section">' +
      '    <h4>Live Preview Export</h4>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-export="includeJs" ' + (e.includeJs ? 'checked' : '') + ' /><span>Include JavaScript (animations &amp; interactivity)</span></label>' +
      '    <label class="framer-saved-toggle framer-saved-indent"><input type="checkbox" data-export="stripJs" ' + (e.stripJs ? 'checked' : '') + ' /><span>Strip JS for static snapshot</span></label>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-export="autoScroll" ' + (e.autoScroll ? 'checked' : '') + ' /><span>Auto-scroll to trigger lazy assets</span></label>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-export="stripBadge" ' + (e.stripBadge ? 'checked' : '') + ' /><span>Remove "Made with Framer" badge</span></label>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-export="stripAnalytics" ' + (e.stripAnalytics ? 'checked' : '') + ' /><span>Remove analytics/tracking scripts</span></label>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-export="includeImages" ' + (e.includeImages ? 'checked' : '') + ' /><span>Include images</span></label>' +
      '    <label class="framer-saved-toggle"><input type="checkbox" data-export="includeFonts" ' + (e.includeFonts ? 'checked' : '') + ' /><span>Include web fonts</span></label>' +
      '    <div class="framer-saved-field">' +
      '      <span>Wait for hydration (ms)</span>' +
      '      <input type="number" min="500" max="10000" step="250" data-export-num="waitMs" value="' + esc(e.waitMs || 2500) + '" />' +
      '    </div>' +
      '  </div>' +
      '  <div class="framer-saved-settings-section">' +
      '    <h4>Data</h4>' +
      '    <div class="framer-saved-settings-actions">' +
      '      <button type="button" class="framer-saved-btn framer-saved-btn-ghost" data-action="export-json">' + ICON_DOWNLOAD + '<span>Export JSON backup</span></button>' +
      '      <button type="button" class="framer-saved-btn framer-saved-btn-ghost" data-action="import-json">' + ICON_PLUS + '<span>Import JSON</span></button>' +
      '      <input type="file" id="fs-import-file" accept="application/json" hidden />' +
      '      <button type="button" class="framer-saved-btn framer-saved-btn-ghost danger" data-action="clear-all">' + ICON_TRASH + '<span>Clear all data</span></button>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    ov.appendChild(panel);
    panel.querySelector('.framer-saved-settings-close').addEventListener('click', closeSettingsPanel);

    // Bind toggles
    panel.querySelectorAll('input[type="checkbox"][data-ui]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        const key = cb.getAttribute('data-ui');
        if (!settings.ui) settings.ui = {};
        settings.ui[key] = cb.checked;
        saveSettingsToStorage();
        applySettingsToDom();
        if (key === 'showExportBtn') renderSavedGrid();
      });
    });
    panel.querySelectorAll('input[type="checkbox"][data-export]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        const key = cb.getAttribute('data-export');
        if (!settings.export) settings.export = {};
        settings.export[key] = cb.checked;
        saveSettingsToStorage();
      });
    });
    panel.querySelectorAll('input[type="number"][data-export-num]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        const key = inp.getAttribute('data-export-num');
        const val = parseInt(inp.value, 10);
        if (!isNaN(val) && val > 0) {
          if (!settings.export) settings.export = {};
          settings.export[key] = val;
          saveSettingsToStorage();
        }
      });
    });

    // Actions
    panel.querySelector('[data-action="export-json"]').addEventListener('click', exportJson);
    panel.querySelector('[data-action="import-json"]').addEventListener('click', function () {
      panel.querySelector('#fs-import-file').click();
    });
    const fileInput = panel.querySelector('#fs-import-file');
    fileInput.addEventListener('change', function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(reader.result);
          if (data && Array.isArray(data.items)) {
            savedItems = normalizeStoredItems(data.items);
            if (Array.isArray(data.folders)) savedFolders = normalizeStoredFolders(data.folders);
            saveItemsToStorage();
            renderFolderPills();
            renderSavedGrid();
            showToast('Imported ' + savedItems.length + ' items');
          } else showToast('Invalid JSON format', 'error');
        } catch (e) {
          showToast('Failed to parse JSON', 'error');
        }
      };
      reader.readAsText(f);
    });
    panel.querySelector('[data-action="clear-all"]').addEventListener('click', function () {
      if (confirm('Clear all saved items, folders and reset settings? This cannot be undone.')) {
        savedItems = [];
        savedFolders = DEFAULT_FOLDERS.slice();
        settings = deepClone(DEFAULT_SETTINGS);
        try {
          chrome.storage.local.clear(function () {
            saveItemsToStorage();
            saveSettingsToStorage();
            renderFolderPills();
            renderSavedGrid();
            showToast('All data cleared');
            closeSettingsPanel();
          });
        } catch (e) {
          saveItemsToStorage();
          saveSettingsToStorage();
          renderFolderPills();
          renderSavedGrid();
          showToast('All data cleared');
        }
      }
    });
  }

  function exportJson() {
    const payload = {
      items: savedItems,
      folders: savedFolders,
      settings: settings,
      exportedAt: new Date().toISOString(),
      version: 1
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = 'framer-saved-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    doc.body.appendChild(a);
    a.click();
    setTimeout(function () {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);
    showToast('Backup exported');
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
      const isDefault = DEFAULT_FOLDERS.some(function (d) { return d.id === f.id; });
      const hasDel = !isDefault;
      html +=
        '<div class="framer-saved-folder-pill-wrap' + (hasDel ? ' has-del' : '') + '">' +
        '<button type="button" class="framer-saved-folder-pill' + (activeFolderId === f.id ? ' active' : '') + '" data-folder-id="' + esc(f.id) + '">' +
        '  <span>' + esc(f.name) + '</span>' +
        '  <span class="pill-count">' + count + '</span>' +
        '</button>' +
        (hasDel ? '<button class="framer-saved-folder-pill-del" type="button" data-folder-id="' + esc(f.id) + '" title="Delete folder">' + ICON_CLOSE + '</button>' : '') +
        '</div>';
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

    bar.querySelectorAll('.framer-saved-folder-pill-del').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = b.getAttribute('data-folder-id');
        const fObj = savedFolders.find(function (x) { return x.id === id; });
        if (!fObj) return;
        if (confirm('Delete folder "' + fObj.name + '"?')) {
          deleteFolder(id);
          renderFolderPills();
          renderSavedGrid();
          showToast('Folder deleted');
        }
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

  function sortItems(items) {
    const mode = (settings.ui && settings.ui.sortBy) || 'savedAt-desc';
    const sorted = items.slice();
    function byKey(fn, dir) {
      return function (a, b) {
        const va = fn(a); const vb = fn(b);
        if (va === vb) return 0;
        return (va < vb ? -1 : 1) * dir;
      };
    }
    switch (mode) {
      case 'savedAt-asc':
        sorted.sort(byKey(function (i) { return (i.savedAt || '').slice(0, 19); }, 1));
        break;
      case 'title-asc':
        sorted.sort(byKey(function (i) { return (i.title || '').toLowerCase(); }, 1));
        break;
      case 'price-asc':
        sorted.sort(byKey(function (i) {
          const m = (i.price || '').match(/\d+(?:[.,]\d+)?/);
          return m ? parseFloat(m[0].replace(',', '.')) : -1;
        }, 1));
        break;
      case 'savedAt-desc':
      default:
        sorted.sort(byKey(function (i) { return (i.savedAt || '').slice(0, 19); }, -1));
    }
    return sorted;
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

    const sorted = sortItems(filtered);

    if (sorted.length === 0) {
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
    sorted.forEach(function (item) {
      const parsed = parseTitleAndSubtitle(item.title);
      const title = parsed.title || 'Framer Component';

      let folderTagsHtml = '<div class="framer-saved-card-folders">';
      if (Array.isArray(item.folders) && item.folders.length > 0) {
        item.folders.forEach(function (fId) {
          const fObj = savedFolders.find(function (f) { return f.id === fId; });
          if (fObj) {
            folderTagsHtml += '<button type="button" class="framer-saved-card-folder-tag" data-id="' + esc(item.id) + '" title="Manage folders">' + esc(fObj.name) + '</button>';
          }
        });
      }
      folderTagsHtml += '<button type="button" class="framer-saved-card-folder-tag framer-saved-card-add-folder-btn" data-id="' + esc(item.id) + '" title="Add to collection">' + ICON_PLUS + '<span>Folder</span></button>';
      folderTagsHtml += '</div>';

      const canExport = !!(settings.ui && settings.ui.showExportBtn && item.previewUrl);
      const exportBtn = canExport
        ? '<button type="button" class="framer-saved-card-export-btn" data-id="' + esc(item.id) + '" title="Export live preview as ZIP">' + ICON_DOWNLOAD + '</button>'
        : '';

      html +=
        '<div class="framer-saved-card" data-id="' + esc(item.id) + '">' +
        '  <a class="framer-saved-card-thumb-link" href="' + esc(item.url) + '" title="' + esc(title) + '">' +
        '    <span class="framer-saved-card-thumb-wrap">' +
        '      <span class="framer-saved-card-thumb-fallback">' + ICON_BOOKMARK + '</span>' +
        (item.thumbnail ? '      <img class="framer-saved-card-thumb" src="' + esc(item.thumbnail) + '" alt="' + esc(title) + '" loading="lazy" decoding="async" />' : '') +
        '    </span>' +
        '    <button type="button" class="framer-saved-card-inline-btn is-saved" data-id="' + esc(item.id) + '" title="Manage folders or remove" aria-label="Manage folders">' + ICON_BOOKMARK_FILLED + '</button>' +
        exportBtn +
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

    // Popover triggers
    grid.querySelectorAll('.framer-saved-card-folder-tag, .framer-saved-card-inline-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const itemId = btn.getAttribute('data-id');
        const itemObj = getItemById(itemId);
        if (itemObj) openSavePopover(itemObj, btn);
      });
    });

    // Export on card
    grid.querySelectorAll('.framer-saved-card-export-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const itemObj = getItemById(id);
        if (itemObj) triggerExport(itemObj);
      });
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
      closeSettingsPanel();
    }

    if (doc.querySelectorAll) {
      doc.querySelectorAll('.framer-saved-nav-item').forEach(function (el) {
        el.classList.toggle('active', active);
      });
    }
  }

  // ------------------------------------------------------------
  // Import links
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
        previewUrl: '',
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
    doc.querySelectorAll('.framer-saved-detail-btn, .framer-saved-card-inline-btn, .framer-saved-export-detail-btn').forEach(function (el) {
      if (!el.closest('#' + OVERLAY_ID)) el.remove();
    });
  }

  // ------------------------------------------------------------
  // History / routing hooks + hotkeys
  // ------------------------------------------------------------
  function patchHistoryAPI() {
    if (!hist.pushState) return;

    const originalPushState = hist.pushState;
    const originalReplaceState = hist.replaceState;

    function trigger() {
      setTimeout(function () {
        syncSavedViewState();
        injectAll();
      }, 20);
    }

    hist.pushState = function () {
      const ret = originalPushState.apply(this, arguments);
      trigger();
      return ret;
    };

    hist.replaceState = function () {
      const ret = originalReplaceState.apply(this, arguments);
      trigger();
      return ret;
    };

    if (win.addEventListener) {
      win.addEventListener('popstate', trigger);
      win.addEventListener('hashchange', trigger);
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
        // Escape
        if (e.key === 'Escape') {
          const sp = doc.getElementById(SETTINGS_PANEL_ID);
          if (sp) { closeSettingsPanel(); return; }
          closeSavePopover();
          if (isSavedRoute()) {
            e.preventDefault();
            closeSavedView();
          }
        }

        // Ctrl/Cmd+K search focus
        if (settings.ui && settings.ui.shortcutSearch && (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
          const inp = doc.getElementById('framer-saved-search');
          if (isSavedRoute() && inp) {
            e.preventDefault();
            inp.focus();
            inp.select();
          }
        }

        // S hotkey to save on detail pages
        if (settings.ui && settings.ui.shortcutSave && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
          // Only if not typing in an input
          const tgt = doc.activeElement;
          if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
          if (isDetailPage()) {
            e.preventDefault();
            const meta = getCurrentPageMetadata();
            openSavePopover(meta, doc.querySelector('.framer-saved-detail-btn') || doc.body);
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
    try { injectSidebarTab(); } catch (err) { warn(err); }
    try { injectDetailButtons(); } catch (err) { warn(err); }
    try { injectCardBookmarkButtons(); } catch (err) { warn(err); }
    try { syncSavedViewState(); } catch (err) { warn(err); }
  }

  const scheduleInjectDebounced = debounce(function () {
    injectQueued = false;
    injectAll();
  }, 150);

  function scheduleInjectNew() {
    if (injectQueued) return;
    injectQueued = true;
    scheduleInjectDebounced();
  }

  function initApp() {
    patchHistoryAPI();

    if (typeof MutationObserver !== 'undefined' && doc.body) {
      const observer = new MutationObserver(function () {
        try {
          scheduleInjectNew();
        } catch (err) { warn(err); }
      });
      observer.observe(doc.body, { childList: true, subtree: true });
    }

    // Periodic check every 1.5s (slower than 500ms to reduce overhead)
    setInterval(function () {
      if (!doc.hidden) {
        if (urlChanged()) injectAll();
        else scheduleInjectNew();
      }
    }, 1500);

    if (win.addEventListener) {
      let scrollTimer;
      win.addEventListener('scroll', function () {
        if (doc.hidden) return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(injectCardBookmarkButtons, 150);
      }, { passive: true });
    }

    injectAll();
    syncSavedViewState();
  }

  // Boot only when in full browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    loadSavedItems(function () {
      loadSettings(initApp);
    });
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
      deleteFolder: deleteFolder,
      toggleItemFolder: toggleItemFolder,
      findTile: findTile,
      findCtaButton: findCtaButton,
      slugify: slugify
    };
  }
})();
