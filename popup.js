document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'framer_saved_items_v1';
  const countBadge = document.getElementById('count-badge');
  const savedList = document.getElementById('saved-list');
  const openSavedBtn = document.getElementById('open-saved-btn');
  const importLinksBtn = document.getElementById('import-links-btn');
  const exportBtn = document.getElementById('export-json');
  const clearBtn = document.getElementById('clear-all');

  function renderPopup() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const items = res[STORAGE_KEY] || [];
        displayItems(items);
      });
    } else {
      const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      displayItems(items);
    }
  }

  function displayItems(items) {
    countBadge.textContent = items.length;

    if (items.length === 0) {
      savedList.innerHTML = '<div class="empty">No saved components yet</div>';
      return;
    }

    let html = '';
    items.slice(0, 5).forEach(item => {
      html += `
        <a class="item" href="${item.url}" target="_blank">
          <img src="${item.thumbnail}" alt="" />
          <span class="item-title">${item.title}</span>
        </a>
      `;
    });

    savedList.innerHTML = html;
  }

  function importLinks(urlsText) {
    if (!urlsText) return;
    const lines = urlsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

    chrome.storage.local.get([STORAGE_KEY], (res) => {
      let saved = res[STORAGE_KEY] || [];
      let count = 0;

      lines.forEach(rawUrl => {
        if (!rawUrl.includes('framer.com')) return;
        const cleanUrl = rawUrl.split('?')[0];
        const parts = cleanUrl.split('/').filter(Boolean);
        const slug = parts[parts.length - 1] || 'imported-item';
        const formattedTitle = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const id = parts.join('_') || cleanUrl;

        const exists = saved.some(item => item.id === id || item.url === cleanUrl);
        if (!exists) {
          saved.unshift({
            id: id,
            url: cleanUrl,
            title: formattedTitle,
            subtitle: 'Imported Link',
            price: 'Free',
            creator: 'Imported',
            thumbnail: 'https://www.framer.com/creators/seo/community-og.jpg',
            savedAt: new Date().toISOString()
          });
          count++;
        }
      });

      if (count > 0) {
        chrome.storage.local.set({ [STORAGE_KEY]: saved }, () => {
          renderPopup();
          alert(`Successfully imported ${count} link(s)!`);
        });
      } else {
        alert('No new valid Framer Marketplace links found.');
      }
    });
  }

  openSavedBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.url.includes('framer.com')) {
          chrome.tabs.update(activeTab.id, { url: 'https://www.framer.com/community/marketplace/components/#saved' });
        } else {
          chrome.tabs.create({ url: 'https://www.framer.com/community/marketplace/components/#saved' });
        }
      });
    } else {
      window.open('https://www.framer.com/community/marketplace/components/#saved', '_blank');
    }
  });

  importLinksBtn.addEventListener('click', () => {
    const input = prompt('Paste Framer Marketplace URLs (separated by lines or commas):');
    if (input) {
      importLinks(input);
    }
  });

  exportBtn.addEventListener('click', () => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const items = res[STORAGE_KEY] || [];
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `framer-saved-components-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    });
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all saved components?')) {
      chrome.storage.local.set({ [STORAGE_KEY]: [] }, () => {
        renderPopup();
      });
    }
  });

  renderPopup();
});
