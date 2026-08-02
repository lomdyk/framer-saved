document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'framer_saved_items_v1';
  const FOLDERS_KEY = 'framer_saved_folders_v1';
  const ORIGIN = 'https://www.framer.com';

  const countBadge = document.getElementById('count-badge');
  const savedList = document.getElementById('saved-list');
  const openSavedBtn = document.getElementById('open-saved-btn');
  const importLinksBtn = document.getElementById('import-links-btn');
  const exportBtn = document.getElementById('export-json');
  const importJsonBtn = document.getElementById('import-json');
  const clearBtn = document.getElementById('clear-all');
  const importFile = document.getElementById('import-file');

  // ----- helpers -------------------------------------------------

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeId(href) {
    try {
      const u = new URL(href, ORIGIN);
      return u.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/').toLowerCase();
    } catch (e) {
      return String(href || '');
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

  function getAll(cb) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY, FOLDERS_KEY], (res) => {
        cb({
          items: normalizeStoredItems(res[STORAGE_KEY]),
          folders: Array.isArray(res[FOLDERS_KEY]) ? res[FOLDERS_KEY] : []
        });
      });
    } else {
      try {
        cb({
          items: normalizeStoredItems(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')),
          folders: JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]')
        });
      } catch (e) {
        cb({ items: [], folders: [] });
      }
    }
  }

  function setData(data, cb) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(data, cb || (() => {}));
    } else {
      try {
        if (data[STORAGE_KEY]) localStorage.setItem(STORAGE_KEY, JSON.stringify(data[STORAGE_KEY]));
        if (data[FOLDERS_KEY]) localStorage.setItem(FOLDERS_KEY, JSON.stringify(data[FOLDERS_KEY]));
      } catch (e) { /* ignore */ }
      if (cb) cb();
    }
  }

  // ----- rendering ------------------------------------------------

  function renderPopup() {
    getAll(({ items }) => {
      countBadge.textContent = items.length;

      if (items.length === 0) {
        savedList.innerHTML = '<div class="empty">No saved components yet</div>';
        return;
      }

      let html = '';
      items.slice(0, 5).forEach((item) => {
        const title = (item.title || 'Framer Component').split(/[•·—–:\-]/)[0].trim();
        const thumb = item.thumbnail
          ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy" />`
          : '';
        html += `
          <a class="item" href="${esc(item.url)}" target="_blank" rel="noopener">
            ${thumb}
            <span class="item-title">${esc(title)}</span>
            <span class="item-price">${esc(item.price || 'Free')}</span>
          </a>
        `;
      });

      savedList.innerHTML = html;
    });
  }

  // ----- actions ---------------------------------------------------

  function importLinks(urlsText) {
    if (!urlsText) return;
    const lines = urlsText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

    getAll(({ items: saved, folders }) => {
      let count = 0;

      lines.forEach((rawUrl) => {
        if (!rawUrl.includes('framer.com')) return;
        const clean = rawUrl.split(/[?#]/)[0];
        const id = normalizeId(clean);
        if (!id) return;
        if (saved.some((item) => item.id === id || normalizeId(item.url) === id)) return;

        const slug = id.split('/').pop() || 'imported-item';
        const formattedTitle = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        saved.unshift({
          id: id,
          url: canonicalUrl(clean),
          title: formattedTitle,
          subtitle: 'Imported Link',
          price: 'Free',
          creator: 'Imported',
          thumbnail: '',
          fetchedMeta: false,
          folders: [],
          savedAt: new Date().toISOString()
        });
        count++;
      });

      setData({ [STORAGE_KEY]: saved, [FOLDERS_KEY]: folders }, () => {
        renderPopup();
        showStatus(count > 0
          ? `Successfully imported ${count} link${count === 1 ? '' : 's'}!`
          : 'No new valid Framer Marketplace links found.');
      });
    });
  }

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        const items = normalizeStoredItems(data.items || data);
        const folders = Array.isArray(data.folders) ? data.folders : [];
        setData({ [STORAGE_KEY]: items, [FOLDERS_KEY]: folders }, () => {
          renderPopup();
          showStatus(`Imported ${items.length} items from backup.`);
        });
      } catch (e) {
        showStatus('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  }

  let statusTimer = null;
  function showStatus(message) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ----- wiring ----------------------------------------------------

  openSavedBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // Try to preserve current marketplace section if possible
    const fallbackUrl = 'https://www.framer.com/community/marketplace/components/#saved';
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        let target = fallbackUrl;
        if (activeTab && activeTab.url && activeTab.url.includes('framer.com/community/marketplace/')) {
          // Use same path, append #saved
          try {
            const u = new URL(activeTab.url);
            u.hash = '#saved';
            u.search = '';
            target = u.toString();
          } catch (_) {}
          chrome.tabs.update(activeTab.id, { url: target });
        } else {
          chrome.tabs.create({ url: target });
        }
      });
    } else {
      window.open(fallbackUrl, '_blank');
    }
  });

  importLinksBtn.addEventListener('click', () => {
    const input = prompt('Paste Framer Marketplace URLs (separated by lines or commas):');
    if (input) importLinks(input);
  });

  exportBtn.addEventListener('click', () => {
    getAll(({ items, folders }) => {
      const payload = {
        items: items,
        folders: folders,
        exportedAt: new Date().toISOString(),
        version: 1
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `framer-saved-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 200);
      showStatus('Backup downloaded.');
    });
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all saved components and folders?')) {
      setData({ [STORAGE_KEY]: [], [FOLDERS_KEY]: [] }, () => {
        renderPopup();
        showStatus('All data cleared.');
      });
    }
  });

  if (importJsonBtn && importFile) {
    importJsonBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const f = importFile.files && importFile.files[0];
      if (f) {
        importJsonFile(f);
        importFile.value = '';
      }
    });
  }

  // Live-refresh the popup when storage changes
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes[STORAGE_KEY] || changes[FOLDERS_KEY])) {
        renderPopup();
      }
    });
  }

  renderPopup();
});
