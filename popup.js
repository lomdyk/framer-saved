document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'framer_saved_items_v1';
  const ORIGIN = 'https://www.framer.com';

  const countBadge = document.getElementById('count-badge');
  const savedList = document.getElementById('saved-list');
  const openSavedBtn = document.getElementById('open-saved-btn');
  const importLinksBtn = document.getElementById('import-links-btn');
  const exportBtn = document.getElementById('export-json');
  const clearBtn = document.getElementById('clear-all');

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
      return u.pathname.split('/').filter(Boolean).join('/').toLowerCase();
    } catch (e) {
      return String(href || '');
    }
  }

  function canonicalUrl(href) {
    try {
      const u = new URL(href, ORIGIN);
      const path = u.pathname.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      return ORIGIN + '/' + path + '/';
    } catch (e) {
      return String(href || '');
    }
  }

  function getItems(cb) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], (res) => cb(res[STORAGE_KEY] || []));
    } else {
      try {
        cb(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
      } catch (e) {
        cb([]);
      }
    }
  }

  function setItems(items, cb) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: items }, cb || (() => {}));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      if (cb) cb();
    }
  }

  // ----- rendering ------------------------------------------------

  function renderPopup() {
    getItems((items) => {
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

    getItems((saved) => {
      let count = 0;

      lines.forEach((rawUrl) => {
        if (!rawUrl.includes('framer.com')) return;
        const clean = rawUrl.split(/[?#]/)[0];
        const id = normalizeId(clean);
        if (!id) return;
        if (saved.some((item) => item.id === id || item.url === clean)) return;

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
          savedAt: new Date().toISOString()
        });
        count++;
      });

      setItems(saved, () => {
        renderPopup();
        showStatus(count > 0
          ? `Successfully imported ${count} link${count === 1 ? '' : 's'}!`
          : 'No new valid Framer Marketplace links found.');
      });
    });
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
    const savedUrl = 'https://www.framer.com/community/marketplace/components/#saved';
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab && activeTab.url && activeTab.url.includes('framer.com')) {
          chrome.tabs.update(activeTab.id, { url: savedUrl });
        } else {
          chrome.tabs.create({ url: savedUrl });
        }
      });
    } else {
      window.open(savedUrl, '_blank');
    }
  });

  importLinksBtn.addEventListener('click', () => {
    const input = prompt('Paste Framer Marketplace URLs (separated by lines or commas):');
    if (input) importLinks(input);
  });

  exportBtn.addEventListener('click', () => {
    getItems((items) => {
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `framer-saved-components-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all saved components?')) {
      setItems([], renderPopup);
    }
  });

  renderPopup();
});
