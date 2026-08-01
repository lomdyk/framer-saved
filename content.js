(function () {
  'use strict';

  const STORAGE_KEY = 'framer_saved_items_v1';
  let savedItems = [];
  let isMutating = false;

  // SVG Icons
  const BOOKMARK_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  const BOOKMARK_FILLED_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#0099ff" stroke="#0099ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  const TRASH_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
  const SEARCH_ICON = `<svg width="12" height="12" fill="currentColor" overflow="visible" aria-hidden="true" focusable="false"><path d="M 8.878 7.817 L 11.78 10.72 C 12.073 11.013 12.073 11.487 11.78 11.78 C 11.487 12.073 11.013 12.073 10.72 11.78 L 7.817 8.878 C 7.001 9.482 5.992 9.846 4.923 9.846 C 2.204 9.846 0 7.642 0 4.923 C 0 2.204 2.204 0 4.923 0 C 7.642 0 9.846 2.204 9.846 4.923 C 9.846 5.992 9.482 7.001 8.878 7.817 Z M 4.923 1.5 C 3.032 1.5 1.5 3.032 1.5 4.923 C 1.5 6.814 3.032 8.346 4.923 8.346 C 6.814 8.346 8.346 6.814 8.346 4.923 C 8.346 3.032 6.814 1.5 4.923 1.5 Z"></path></svg>`;
  const PLUS_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const EMPTY_BOOKMARK_ICON = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;

  loadSavedItems();

  function loadSavedItems() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        savedItems = res[STORAGE_KEY] || [];
        updateBadgeCount();
        initApp();
      });
    } else {
      const data = localStorage.getItem(STORAGE_KEY);
      savedItems = data ? JSON.parse(data) : [];
      updateBadgeCount();
      initApp();
    }
  }

  function saveItemsToStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: savedItems }, () => {
        updateBadgeCount();
      });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedItems));
      updateBadgeCount();
    }
  }

  function showToast(message) {
    let toast = document.querySelector('.framer-saved-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'framer-saved-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `${BOOKMARK_ICON} <span>${message}</span>`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  function updateBadgeCount() {
    const badge = document.querySelector('.framer-saved-badge');
    if (badge) {
      badge.textContent = savedItems.length;
    }
  }

  function isItemSaved(urlOrId) {
    return savedItems.some(item => item.id === urlOrId || item.url === urlOrId);
  }

  function toggleSaveItem(itemData) {
    const index = savedItems.findIndex(item => item.id === itemData.id || item.url === itemData.url);
    if (index > -1) {
      savedItems.splice(index, 1);
      saveItemsToStorage();
      showToast('Removed from Saved');
      return false;
    } else {
      savedItems.unshift(itemData);
      saveItemsToStorage();
      showToast('Saved to Favorites!');
      return true;
    }
  }

  function parseTitleAndSubtitle(rawTitle) {
    if (!rawTitle) return { title: 'Framer Component', subtitle: '' };
    const delimiters = [' • ', ' · ', ' - '];
    for (const delim of delimiters) {
      if (rawTitle.includes(delim)) {
        const parts = rawTitle.split(delim);
        return {
          title: parts[0].trim(),
          subtitle: parts.slice(1).join(delim).trim()
        };
      }
    }
    return { title: rawTitle.trim(), subtitle: '' };
  }

  function importLinks(urlsText) {
    if (!urlsText) return 0;
    const lines = urlsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    let count = 0;

    lines.forEach(rawUrl => {
      if (!rawUrl.includes('framer.com')) return;
      const cleanUrl = rawUrl.split('?')[0];
      const parts = cleanUrl.split('/').filter(Boolean);
      const slug = parts[parts.length - 1] || 'imported-item';
      const formattedTitle = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const id = parts.join('_') || cleanUrl;

      if (!isItemSaved(id)) {
        savedItems.unshift({
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
      saveItemsToStorage();
      showToast(`Imported ${count} link(s)!`);
    }
    return count;
  }

  function getCurrentPageMetadata() {
    const url = window.location.href.split('?')[0];
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const id = pathParts.join('_') || url;

    const h1 = document.querySelector('h1') || document.querySelector('[class*="h1"]');
    const rawTitle = h1 ? h1.innerText.trim() : document.title.replace('— Framer Marketplace', '').trim();
    const { title, subtitle } = parseTitleAndSubtitle(rawTitle);

    const allElements = document.querySelectorAll('button, a, [class*="button"], [class*="Button"]');
    let buyBtn = null;

    for (const el of allElements) {
      if (el.closest('nav')) continue;
      const txt = (el.innerText || el.textContent || '').trim();
      if (
        txt === 'Copy Component' || 
        txt === 'Copy Template' || 
        txt.startsWith('Buy for') || 
        txt.startsWith('Use for') || 
        txt.startsWith('Get ') || 
        txt === 'Remix'
      ) {
        buyBtn = el;
        break;
      }
    }

    const price = buyBtn ? buyBtn.textContent.trim() : 'Free';

    const creatorEl = document.querySelector('[class*="creator"], [class*="author"], [class*="byLine"]');
    const creator = creatorEl ? creatorEl.innerText.trim() : 'Framer Creator';

    const imgEl = document.querySelector('main img, [class*="preview"] img, [class*="thumbnail"] img');
    const thumbnail = imgEl ? imgEl.src : 'https://www.framer.com/creators/seo/community-og.jpg';

    return {
      id,
      url,
      title,
      subtitle,
      price,
      creator,
      thumbnail,
      savedAt: new Date().toISOString()
    };
  }

  // --- SPA ROUTING & PAGE VISIBILITY HANDLER ---
  function syncPageViewState() {
    const isSavedRoute = window.location.hash === '#saved';
    const mainContent = document.querySelector('.layout-module-scss-module__P9S6KG__content, main, [role="main"]');
    let savedWrapper = document.getElementById('framer-saved-page-wrapper');

    const savedNavBtn = document.querySelector('.framer-saved-nav-item');
    document.querySelectorAll('.sidebar-module-scss-module__s7LA8a__navItem, .framer-saved-nav-item').forEach(el => {
      el.classList.remove('active');
    });

    if (isSavedRoute) {
      if (savedNavBtn) savedNavBtn.classList.add('active');
      if (mainContent) mainContent.style.display = 'none';

      if (!savedWrapper) {
        savedWrapper = document.createElement('div');
        savedWrapper.id = 'framer-saved-page-wrapper';
        const parent = (mainContent && mainContent.parentElement) || document.body;
        parent.appendChild(savedWrapper);
      }
      savedWrapper.style.display = 'block';

      if (savedWrapper.getAttribute('data-rendered') !== 'true') {
        renderSavedView(savedWrapper);
      }
    } else {
      if (mainContent) mainContent.style.display = '';
      if (savedWrapper) {
        savedWrapper.style.display = 'none';
        savedWrapper.removeAttribute('data-rendered');
      }

      const currentPath = window.location.pathname;
      const activeLink = document.querySelector(`.sidebar-module-scss-module__s7LA8a__navItem[href="${currentPath}"]`);
      if (activeLink) activeLink.classList.add('active');
    }
  }

  function patchHistoryAPI() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
      originalPushState.apply(this, arguments);
      setTimeout(syncPageViewState, 20);
    };

    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      setTimeout(syncPageViewState, 20);
    };

    window.addEventListener('popstate', syncPageViewState);
    window.addEventListener('hashchange', syncPageViewState);
  }

  // Inject Sidebar Tab
  function injectSidebarTab() {
    if (document.querySelector('.framer-saved-nav-item')) return;

    const navItems = document.querySelectorAll('.sidebar-module-scss-module__s7LA8a__navItem, a[href*="/community/"]');
    let targetContainer = null;
    let targetSibling = null;

    navItems.forEach(item => {
      if (item.getAttribute('href') === '/community/members/' || item.innerText.includes('Members')) {
        targetContainer = item.parentElement;
        targetSibling = item;
      }
    });

    if (!targetContainer) {
      const sidebars = document.querySelectorAll('nav');
      if (sidebars.length > 0) targetContainer = sidebars[0];
    }

    if (!targetContainer) return;

    const savedTab = document.createElement('a');
    savedTab.className = 'framer-saved-nav-item';
    savedTab.href = '#saved';
    savedTab.innerHTML = `
      <span class="framer-saved-nav-icon">${BOOKMARK_ICON}</span>
      <span>Saved</span>
      <span class="framer-saved-badge">${savedItems.length}</span>
    `;

    savedTab.addEventListener('click', (e) => {
      e.preventDefault();
      history.pushState(null, '', '#saved');
      syncPageViewState();
    });

    if (targetSibling && targetSibling.nextSibling) {
      targetContainer.insertBefore(savedTab, targetSibling.nextSibling);
    } else {
      targetContainer.appendChild(savedTab);
    }

    syncPageViewState();
  }

  // Inject Detail Page Save Button - 100% DIRECT CTA BUTTON FINDER & INSERTION
  function injectDetailBookmarkButton() {
    if (document.querySelector('.framer-saved-detail-btn')) return;

    const allElements = document.querySelectorAll('button, a, [class*="button"], [class*="Button"]');
    let ctaBtn = null;

    // 1. Exact Match for CTA Buttons ("Copy Component", "Copy Template", "Buy for...", "Use for...", "Get...", "Remix")
    for (const el of allElements) {
      if (el.closest('nav')) continue; // Exclude sidebar!
      const txt = (el.innerText || el.textContent || '').trim();
      if (
        txt === 'Copy Component' || 
        txt === 'Copy Template' || 
        txt.startsWith('Buy for') || 
        txt.startsWith('Use for') || 
        txt.startsWith('Get ') || 
        txt === 'Remix'
      ) {
        ctaBtn = el;
        break;
      }
    }

    // 2. Fallback: Search for any element containing primary action text
    if (!ctaBtn) {
      for (const el of allElements) {
        if (el.closest('nav')) continue;
        if (el.children.length > 2) continue;
        const txt = (el.innerText || el.textContent || '').trim();
        if (txt.includes('Copy Component') || txt.includes('Copy Template') || txt.includes('Buy for') || txt.includes('Use for Free')) {
          ctaBtn = el;
          break;
        }
      }
    }

    if (!ctaBtn || !ctaBtn.parentElement) return;

    const targetParent = ctaBtn.parentElement;
    const metadata = getCurrentPageMetadata();
    const isSaved = isItemSaved(metadata.id);

    const btn = document.createElement('button');
    btn.className = `framer-saved-detail-btn ${isSaved ? 'is-saved' : ''}`;
    btn.type = 'button';
    btn.title = isSaved ? 'Remove from Saved' : 'Save component';
    btn.ariaLabel = 'Bookmark Component';
    btn.innerHTML = `${isSaved ? BOOKMARK_FILLED_ICON : BOOKMARK_ICON}`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentMeta = getCurrentPageMetadata();
      const nowSaved = toggleSaveItem(currentMeta);
      btn.className = `framer-saved-detail-btn ${nowSaved ? 'is-saved' : ''}`;
      btn.title = nowSaved ? 'Remove from Saved' : 'Save component';
      btn.innerHTML = `${nowSaved ? BOOKMARK_FILLED_ICON : BOOKMARK_ICON}`;
    });

    // Insert right before CTA button (between heart icon and Copy Component / Buy button!)
    targetParent.insertBefore(btn, ctaBtn);
  }

  // Inject Inline Action Bookmark Icon
  function injectCardBookmarkButtons() {
    const footers = document.querySelectorAll('[class*="post-tile-module__"][class*="__footer"], [class*="post-tile"] [class*="footer"]');

    footers.forEach(footer => {
      if (footer.querySelector('.framer-saved-card-inline-btn')) return;

      const tile = footer.closest('[class*="tile"], [class*="card"], [class*="item"]') || footer.parentElement;
      if (!tile) return;

      const link = tile.querySelector('a[href*="/marketplace/components/"], a[href*="/marketplace/templates/"], a[href*="/marketplace/vectors/"], a[href*="/marketplace/plugins/"]');
      if (!link) return;

      const href = link.getAttribute('href');
      const cardId = href.split('?')[0];
      const isSaved = isItemSaved(cardId);

      const actionBtn = document.createElement('button');
      actionBtn.className = `framer-saved-card-inline-btn ${isSaved ? 'is-saved' : ''}`;
      actionBtn.type = 'button';
      actionBtn.title = isSaved ? 'Remove from Saved' : 'Save component';
      actionBtn.ariaLabel = 'Bookmark Component';
      actionBtn.innerHTML = isSaved ? BOOKMARK_FILLED_ICON : BOOKMARK_ICON;

      actionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const img = tile.querySelector('img');
        const rawTitleEl = tile.querySelector('[class*="name"], [class*="title"], h2, h3, h4');
        const rawText = rawTitleEl ? rawTitleEl.innerText.trim() : 'Framer Component';
        const { title, subtitle } = parseTitleAndSubtitle(rawText);

        const priceEl = tile.querySelector('[class*="subline"], [class*="price"]');
        const creatorEl = tile.querySelector('[class*="creator"], [class*="author"]');

        const itemMeta = {
          id: cardId,
          url: window.location.origin + href,
          title: title,
          subtitle: subtitle,
          price: priceEl ? priceEl.innerText.trim() : 'Free',
          creator: creatorEl ? creatorEl.innerText.trim() : 'Framer Creator',
          thumbnail: img ? img.src : 'https://www.framer.com/creators/seo/community-og.jpg',
          savedAt: new Date().toISOString()
        };

        const nowSaved = toggleSaveItem(itemMeta);
        actionBtn.className = `framer-saved-card-inline-btn ${nowSaved ? 'is-saved' : ''}`;
        actionBtn.title = nowSaved ? 'Remove from Saved' : 'Save component';
        actionBtn.innerHTML = nowSaved ? BOOKMARK_FILLED_ICON : BOOKMARK_ICON;
      });

      footer.appendChild(actionBtn);
    });
  }

  // Render Saved View inside #framer-saved-page-wrapper
  function renderSavedView(container) {
    if (!container) return;
    container.setAttribute('data-rendered', 'true');

    container.innerHTML = `
      <div class="framer-saved-view-header">
        <div class="framer-saved-title-group">
          <h1>${BOOKMARK_ICON} Saved Components</h1>
          <p>Your personal collection of bookmarked Framer components, templates, and UI kits.</p>
        </div>
        <div class="framer-saved-controls">
          <button class="framer-saved-import-btn" id="framer-saved-import-btn">
            ${PLUS_ICON} <span>Import Links</span>
          </button>
          <div class="framer-saved-search-field">
            <span class="framer-saved-search-icon">${SEARCH_ICON}</span>
            <input type="text" class="framer-saved-search-input" id="framer-saved-search" placeholder="Search saved components…" />
          </div>
        </div>
      </div>
      <div id="framer-saved-grid-target"></div>
    `;

    const searchInput = document.getElementById('framer-saved-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderSavedGridItems(e.target.value);
      });
    }

    const importBtn = document.getElementById('framer-saved-import-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const input = prompt('Paste Framer Marketplace URLs (separated by new lines or commas):');
        if (input) {
          importLinks(input);
          renderSavedGridItems(searchInput ? searchInput.value : '');
        }
      });
    }

    renderSavedGridItems();
  }

  function renderSavedGridItems(filterQuery = '') {
    const gridTarget = document.getElementById('framer-saved-grid-target');
    if (!gridTarget) return;

    const filtered = savedItems.filter(item => 
      item.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(filterQuery.toLowerCase())) ||
      (item.creator && item.creator.toLowerCase().includes(filterQuery.toLowerCase()))
    );

    if (filtered.length === 0) {
      gridTarget.innerHTML = `
        <div class="framer-saved-empty-state">
          <div class="framer-saved-empty-icon">${EMPTY_BOOKMARK_ICON}</div>
          <h3>${savedItems.length === 0 ? 'No saved components yet' : 'No components match your search'}</h3>
          <p>${savedItems.length === 0 ? 'Explore the Framer Marketplace or click Import Links to add items.' : 'Try a different search term.'}</p>
        </div>
      `;
      return;
    }

    let html = `<div class="framer-saved-grid">`;
    filtered.forEach(item => {
      const { title } = parseTitleAndSubtitle(item.title);

      html += `
        <div class="framer-saved-card" data-id="${item.id}">
          <div class="framer-saved-card-thumb-wrapper">
            <a href="${item.url}" target="_self">
              <img class="framer-saved-card-thumb" src="${item.thumbnail}" alt="${title}" loading="lazy" />
            </a>
          </div>
          <div class="framer-saved-card-info">
            <div class="framer-saved-card-row1">
              <a href="${item.url}" class="framer-saved-card-title" title="${title}">${title}</a>
              <button class="framer-saved-card-remove-btn" data-id="${item.id}" title="Remove from Saved">
                ${TRASH_ICON}
              </button>
            </div>
            <div class="framer-saved-card-row2">
              <span class="framer-saved-card-price">${item.price || 'Free'}</span>
              <span class="framer-saved-card-creator">by ${item.creator || 'Creator'}</span>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div>`;

    gridTarget.innerHTML = html;

    gridTarget.querySelectorAll('.framer-saved-card-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idToRemove = btn.getAttribute('data-id');
        const idx = savedItems.findIndex(i => i.id === idToRemove);
        if (idx > -1) {
          savedItems.splice(idx, 1);
          saveItemsToStorage();
          const searchInput = document.getElementById('framer-saved-search');
          renderSavedGridItems(searchInput ? searchInput.value : '');
          showToast('Removed from Saved');
        }
      });
    });
  }

  function initApp() {
    patchHistoryAPI();
    injectSidebarTab();
    injectDetailBookmarkButton();
    injectCardBookmarkButtons();

    const observer = new MutationObserver(() => {
      if (isMutating) return;
      isMutating = true;

      try {
        injectSidebarTab();
        injectDetailBookmarkButton();
        injectCardBookmarkButtons();
      } finally {
        setTimeout(() => { isMutating = false; }, 30);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(() => {
      if (isMutating) return;
      injectSidebarTab();
      injectDetailBookmarkButton();
      injectCardBookmarkButtons();
    }, 400);

    window.addEventListener('scroll', () => {
      if (!isMutating) injectCardBookmarkButtons();
    }, { passive: true });
  }

})();
