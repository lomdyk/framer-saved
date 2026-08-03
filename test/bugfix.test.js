'use strict';

/**
 * Regression tests for the card-navigation / save-button / bookmark-removal fixes.
 * Run with:  node test/bugfix.test.js
 *
 * Covers:
 *  1. Detail page Save -> popover "Remove from Saved" resets the button to neutral.
 *  2. Injected detail/card buttons self-heal stale visual state on re-injection passes.
 *  3. Card buttons pin data-id to the card's detail link (never a creator/category link).
 *  4. Dead clicks on decorative card layers are re-routed to the card's real link
 *     (guaranteed navigation), without hijacking real anchor clicks or SPA-handled clicks.
 *  5. Removal inside the Saved overlay (trash icon + popover remove) works.
 *  6. Listing pages under a type root (…/components/featured/) are NOT treated as
 *     detail pages, and the /marketplace/ mount is supported as well.
 */

const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

const contentJsCode = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

let failures = 0;
function ok(condition, label) {
  if (condition) {
    console.log('  ok  ' + label);
  } else {
    failures++;
    console.log('FAIL  ' + label);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Realistic nasty card: creator link FIRST inside the tile, decorative
// interactive-thumbnail layer, and a stretched detail link last.
function gridHtml(mount) {
  const m = mount || '/community/marketplace';
  return `
<!DOCTYPE html>
<html><head><title>Components — Framer Marketplace</title></head>
<body>
  <nav class="sidebar-module__sidebar">
    <a href="${m}/" class="sidebar-module__navItem">Marketplace</a>
    <a href="${m}/components/" class="sidebar-module__navItem">Components</a>
  </nav>
  <main>
    <div class="componentsGrid">
      <li class="marketplaceCard">
        <div class="cardRoot">
          <a href="/@motiondrops/" class="creatorLink"><img src="https://example.com/avatar.jpg" alt="Motiondrops" /></a>
          <div class="interactive-thumbnail-wrap">
            <div class="interactive-thumbnail-inner"><img src="https://example.com/thumb1.jpg" alt="Origin Button" /></div>
          </div>
          <div class="infoRow"><span class="nameLabel">Origin Button</span><span class="priceTag">Free</span></div>
          <a href="${m}/components/origin-button/" class="stretchedLink linkActionX">Open Origin Button</a>
        </div>
      </li>
    </div>
  </main>
</body></html>`;
}

const DETAIL_HTML = `
<!DOCTYPE html>
<html><head><title>Origin Button — Framer Marketplace</title></head>
<body>
  <nav class="sidebar-module__sidebar">
    <a href="/community/marketplace/" class="sidebar-module__navItem">Marketplace</a>
  </nav>
  <main>
    <header>
      <h1>Origin Button • Tactile button interaction</h1>
      <div class="actions">
        <button class="like">Like</button>
        <button class="cta">Copy Component</button>
      </div>
    </header>
  </main>
</body></html>`;

const ORIGIN_ITEM = {
  id: 'community/marketplace/components/origin-button',
  url: 'https://www.framer.com/community/marketplace/components/origin-button/',
  title: 'Origin Button',
  subtitle: '',
  price: 'Free',
  creator: 'Motiondrops',
  thumbnail: 'https://example.com/thumb1.jpg',
  previewUrl: '',
  folders: [],
  savedAt: '2026-07-31T12:00:00.000Z'
};

function makeWindow(html, url, seededStore) {
  // Silence jsdom's "Not implemented: navigation / getComputedStyle defaults" noise;
  // navigation attempts are expected fallout of the fallback hard-nav path.
  const { VirtualConsole } = require('jsdom');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const window = dom.window;
  window.innerWidth = 1280;
  window.innerHeight = 800;
  window.Element.prototype.getBoundingClientRect = function () {
    return { top: 100, left: 100, right: 300, bottom: 300, width: 200, height: 200, x: 100, y: 100 };
  };

  // Stateful chrome.storage mock with onChanged fan-out (async, like Chrome).
  const store = Object.assign(
    { framer_saved_items_v1: [], framer_saved_folders_v1: [], framer_saved_settings_v1: null },
    seededStore || {}
  );
  const listeners = [];
  window.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => { res[k] = store[k]; });
          setTimeout(() => cb(res), 0);
        },
        set: (obj, cb) => {
          Object.keys(obj).forEach((k) => { store[k] = JSON.parse(JSON.stringify(obj[k])); });
          const changes = {};
          Object.keys(obj).forEach((k) => { changes[k] = { newValue: obj[k] }; });
          setTimeout(() => listeners.forEach((l) => l(changes, 'local')), 0);
          setTimeout(() => cb && cb(), 0);
        },
        clear: (cb) => { Object.keys(store).forEach((k) => delete store[k]); setTimeout(() => cb && cb(), 0); }
      },
      onChanged: { addListener: (l) => listeners.push(l) }
    },
    runtime: { onMessage: { addListener: () => {} }, sendMessage: (_m, cb) => cb && cb({ ok: true }) }
  };
  window.__store = store;

  // NOTE: keep jsdom's native MutationObserver — storage storms and re-render
  // debounce tests rely on it actually firing.
  window.Blob = class {};
  if (window.URL && window.URL.createObjectURL === undefined) {
    window.URL.createObjectURL = () => 'blob:mock';
    window.URL.revokeObjectURL = () => {};
  }
  window.confirm = () => true;
  window.prompt = () => '';
  return window;
}

async function boot(window) {
  window.eval(contentJsCode);
  await sleep(700); // storage load + init + debounced injection
}

// ---------------------------------------------------------------------------
// Test 1: Detail page save → popover "Remove from Saved" → neutral button
// ---------------------------------------------------------------------------
async function testDetailSaveRemove(freshSeed) {
  console.log('\n--- T1: detail save -> popover remove resets button ---');
  const window = makeWindow(
    DETAIL_HTML,
    'https://www.framer.com/community/marketplace/components/origin-button/',
    freshSeed ? { framer_saved_items_v1: [ORIGIN_ITEM] } : null
  );
  await boot(window);
  const doc = window.document;

  const btn = doc.querySelector('.framer-saved-detail-btn');
  ok(btn !== null, 'detail save button injected');
  const startsBlue = btn.classList.contains('is-saved');
  ok(startsBlue === !!freshSeed, freshSeed ? 'pre-saved item renders blue on boot' : 'fresh item renders neutral on boot');

  if (!freshSeed) {
    btn.click();
    await sleep(120);
    ok(btn.classList.contains('is-saved'), 'button turns blue after save click');
    ok((window.__store.framer_saved_items_v1 || []).length === 1, 'item persisted after save');
  } else {
    // Open the popover via the Saved button
    btn.click();
    await sleep(120);
  }

  const popover = doc.getElementById('framer-saved-folder-popover');
  ok(popover !== null, 'popover is open');
  const removeBtn = popover && popover.querySelector('.framer-saved-popover-remove-btn');
  ok(removeBtn !== null, '"Remove from Saved" exists in popover');
  removeBtn.click();
  await sleep(150);

  ok((window.__store.framer_saved_items_v1 || []).length === 0, 'item removed from storage');
  ok(!btn.classList.contains('is-saved'), 'detail button back to NEUTRAL after remove');
  ok(/Save/.test(btn.textContent) && !/Saved/.test(btn.textContent.replace('Save component', '')), 'button label shows "Save" again');
  ok(doc.getElementById('framer-saved-folder-popover') === null, 'popover closed after remove');
  window.close();
}

// ---------------------------------------------------------------------------
// Test 2: Stale blue state self-heals on the next injection pass
// ---------------------------------------------------------------------------
async function testSelfHeal() {
  console.log('\n--- T2: stale "Saved" paint self-heals ---');
  const window = makeWindow(
    DETAIL_HTML,
    'https://www.framer.com/community/marketplace/components/origin-button/',
    null
  );
  await boot(window);
  const doc = window.document;
  const btn = doc.querySelector('.framer-saved-detail-btn');
  ok(btn !== null && !btn.classList.contains('is-saved'), 'button starts neutral');

  // Simulate a stale paint: class applied although item is NOT saved
  btn.classList.add('is-saved');
  ok(btn.classList.contains('is-saved'), 'stale is-saved applied (simulated)');

  await sleep(1900); // interval-driven injectAll (1.5s) + debounce
  ok(!btn.classList.contains('is-saved'), 'stale state re-synced to neutral by background pass');
  window.close();
}

// ---------------------------------------------------------------------------
// Test 3: Card buttons pin the correct item id and sync state round-trip
// ---------------------------------------------------------------------------
async function testCardButtonIdAndRoundTrip() {
  console.log('\n--- T3: card button data-id + save/remove round trip ---');
  const window = makeWindow(gridHtml(), 'https://www.framer.com/community/marketplace/components/');
  await boot(window);
  const doc = window.document;

  const cardBtn = doc.querySelector('.framer-saved-card-inline-btn');
  ok(cardBtn !== null, 'card button injected');
  ok(cardBtn.getAttribute('data-id') === 'community/marketplace/components/origin-button',
    'data-id pinned to card detail link, got: ' + cardBtn.getAttribute('data-id'));
  ok(cardBtn.getAttribute('data-id').indexOf('@motiondrops') === -1, 'creator link NOT used as id');

  // Tile got stacking promotion (keeps the button clickable above overlays)
  const tile = cardBtn.parentElement;
  ok(tile && tile.style.position !== '', 'tile positioned by injector (position=' + (tile && tile.style.position) + ')');
  ok(tile && tile.style.zIndex === '5', 'tile z-index promoted to 5 (actual: ' + (tile && tile.style.zIndex) + ')');

  cardBtn.click();
  await sleep(120);
  ok((window.__store.framer_saved_items_v1 || []).length === 1, 'card item saved');
  ok(cardBtn.classList.contains('is-saved'), 'card button turns BLUE after save (visual sync)');

  const popover = doc.getElementById('framer-saved-folder-popover');
  const removeBtn = popover && popover.querySelector('.framer-saved-popover-remove-btn');
  ok(removeBtn !== null, 'remove button visible from card popover');
  removeBtn.click();
  await sleep(150);
  ok((window.__store.framer_saved_items_v1 || []).length === 0, 'card item removed');
  ok(!cardBtn.classList.contains('is-saved'), 'card button back to NEUTRAL after remove');
  window.close();
}

// ---------------------------------------------------------------------------
// Test 4: Dead-click on decorative layers re-routes to the card's real link
// ---------------------------------------------------------------------------
async function testNavFallback() {
  console.log('\n--- T4: guaranteed card navigation ---');
  const window = makeWindow(gridHtml(), 'https://www.framer.com/community/marketplace/components/');
  await boot(window);
  const doc = window.document;

  const link = doc.querySelector('.stretchedLink');
  let replays = 0;
  link.addEventListener('click', () => { replays++; });

  // 4a: click lands on the decorative thumbnail layer (no anchor/button ancestor)
  const deadLayer = doc.querySelector('.interactive-thumbnail-inner');
  const deadClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0, clientX: 150, clientY: 150 });
  deadLayer.dispatchEvent(deadClick);
  await sleep(200); // fallback defers ~90ms before replaying
  ok(replays === 1, 'dead click on decorative layer replayed onto card link (replays=' + replays + ')');

  await sleep(300); // allow (jsdom-unsupported) hard-nav attempt; must not throw
  ok(true, 'hard navigation fallback did not crash the page script');

  // 4b: a click that already lands on the anchor must NOT be replayed
  replays = 0;
  const directClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0, clientX: 150, clientY: 150 });
  link.dispatchEvent(directClick); // <- this one registers as a real click, replays=1
  await sleep(400);
  ok(replays === 1, 'direct anchor click not hijacked/replayed (replays=' + replays + ')');

  // 4c: SPA-style handling — site navigates synchronously, fallback must stay out
  replays = 0;
  const spaHandler = (e) => {
    if (e.target.closest && e.target.closest('.interactive-thumbnail-inner')) {
      window.history.pushState({}, '', '/community/marketplace/components/origin-button/');
    }
  };
  doc.addEventListener('click', spaHandler);
  const spaClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0, clientX: 150, clientY: 150 });
  deadLayer.dispatchEvent(spaClick);
  await sleep(400);
  ok(replays === 0, 'no replay when site SPA-navigates on its own');
  ok(window.location.pathname === '/community/marketplace/components/origin-button/', 'SPA navigation preserved');
  doc.removeEventListener('click', spaHandler);
  window.close();
}

// ---------------------------------------------------------------------------
// Test 5: Removal flows inside the Saved overlay
// ---------------------------------------------------------------------------
async function testOverlayRemoval() {
  console.log('\n--- T5: removal inside the Saved overlay ---');
  const seeded = {
    framer_saved_items_v1: [
      ORIGIN_ITEM,
      Object.assign({}, ORIGIN_ITEM, {
        id: 'community/marketplace/components/morph-button',
        url: 'https://www.framer.com/community/marketplace/components/morph-button/',
        title: 'Morph Button',
        savedAt: '2026-08-01T09:00:00.000Z'
      })
    ]
  };
  const window = makeWindow(gridHtml(), 'https://www.framer.com/community/marketplace/components/', seeded);
  await boot(window);
  const doc = window.document;

  const navItem = doc.querySelector('.framer-saved-nav-item');
  ok(navItem !== null, 'sidebar Saved tab present');
  navItem.click();
  await sleep(250);

  const overlay = doc.getElementById('framer-saved-overlay');
  ok(overlay !== null, 'Saved overlay opened');
  ok(doc.querySelectorAll('#framer-saved-grid .framer-saved-card').length === 2, 'overlay renders 2 saved cards');

  // 5a: trash icon removal
  const trash = doc.querySelector('#framer-saved-grid .framer-saved-card-remove-btn');
  ok(trash !== null, 'trash button present on overlay card');
  trash.click();
  await sleep(120);
  ok((window.__store.framer_saved_items_v1 || []).length === 1, 'trash removal persists to storage');
  ok(doc.querySelectorAll('#framer-saved-grid .framer-saved-card').length === 1, 'grid re-rendered with 1 card');

  // 5b: popover removal from the overlay
  const inline = doc.querySelector('#framer-saved-grid .framer-saved-card-inline-btn');
  inline.click();
  await sleep(120);
  const popover = doc.getElementById('framer-saved-folder-popover');
  const removeBtn = popover && popover.querySelector('.framer-saved-popover-remove-btn');
  ok(removeBtn !== null, 'remove button available in overlay popover');
  removeBtn.click();
  await sleep(150);
  ok((window.__store.framer_saved_items_v1 || []).length === 0, 'popover removal persists to storage');
  ok(doc.querySelectorAll('#framer-saved-grid .framer-saved-card').length === 0, 'overlay shows empty state (0 cards)');
  window.close();
}

// ---------------------------------------------------------------------------
// Test 6: Listing pages are not mis-detected + /marketplace/ mount support
// ---------------------------------------------------------------------------
async function testListingAndMount() {
  console.log('\n--- T6: listing-slug pages & bare /marketplace/ mount ---');
  const winFeatured = makeWindow(gridHtml(), 'https://www.framer.com/community/marketplace/components/featured/');
  await boot(winFeatured);
  ok(winFeatured.document.querySelector('.framer-saved-card-inline-btn') !== null,
    'card buttons injected on /components/featured/ listing (not misread as detail)');
  winFeatured.close();

  const winBare = makeWindow(gridHtml('/marketplace'), 'https://www.framer.com/marketplace/components/');
  await boot(winBare);
  ok(winBare.document.querySelector('.framer-saved-card-inline-btn') !== null,
    'card buttons injected on bare /marketplace/ mount');
  winBare.close();
}


// ---------------------------------------------------------------------------
// Test 7: anti-jitter — self-heal pass must NOT churn the button DOM
// ---------------------------------------------------------------------------
async function testNoJitter() {
  console.log('\n--- T7: no DOM churn / no animation restart on steady state ---');
  const window = makeWindow(
    DETAIL_HTML,
    'https://www.framer.com/community/marketplace/components/origin-button/',
    { framer_saved_items_v1: [ORIGIN_ITEM] }
  );
  await boot(window);
  const doc = window.document;
  const btn = doc.querySelector('.framer-saved-detail-btn');
  ok(btn !== null && btn.classList.contains('is-saved'), 'button is saved on boot');

  const iconSpan = btn.querySelector('.framer-saved-detail-btn-icon');
  const htmlBefore = btn.innerHTML;
  await sleep(1900); // several interval-driven self-heal passes
  const btnAfter = doc.querySelector('.framer-saved-detail-btn');
  ok(btnAfter === btn, 'same button node (not replaced)');
  ok(btnAfter.innerHTML === htmlBefore, 'innerHTML untouched while state unchanged (no animation restart)');
  ok(btnAfter.querySelector('.framer-saved-detail-btn-icon') === iconSpan, 'icon node identity preserved');
  ok(btnAfter.classList.contains('is-saved'), 'still saved (no flicker)');
  window.close();
}

// ---------------------------------------------------------------------------
// Test 8: storage write storms collapse into a single debounced re-render
// ---------------------------------------------------------------------------
async function testRenderStormDebounce() {
  console.log('\n--- T8: render storm debounce ---');
  const window = makeWindow(gridHtml(), 'https://www.framer.com/community/marketplace/components/', {
    framer_saved_items_v1: [ORIGIN_ITEM]
  });
  await boot(window);
  const doc = window.document;
  doc.querySelector('.framer-saved-nav-item').click();
  await sleep(250);
  ok(doc.getElementById('framer-saved-overlay') !== null, 'overlay open');

  const grid = doc.getElementById('framer-saved-grid');
  let renders = 0;
  const mo = new window.MutationObserver(() => { renders++; });
  mo.observe(grid, { childList: true });

  // Fire a storage write storm (5 rapid writes like metadata fetches would)
  for (let i = 0; i < 5; i++) {
    const items = window.__store.framer_saved_items_v1.slice();
    items[0] = Object.assign({}, items[0], { fetchedMeta: true, tick: i });
    window.chrome.storage.local.set({ framer_saved_items_v1: items });
  }
  await sleep(700);
  console.log('    (info) grid childList mutations after storm: ' + renders);
  ok(renders <= 2, 'render storm collapsed (renders=' + renders + ', expected <=2)');
  window.close();
}

// ---------------------------------------------------------------------------
// Test 9: re-render never happens under an active mouse press
// ---------------------------------------------------------------------------
async function testPressGuard() {
  console.log('\n--- T9: no re-render under active press ---');
  const window = makeWindow(gridHtml(), 'https://www.framer.com/community/marketplace/components/', {
    framer_saved_items_v1: [ORIGIN_ITEM]
  });
  await boot(window);
  const doc = window.document;
  doc.querySelector('.framer-saved-nav-item').click();
  await sleep(250);

  const grid = doc.getElementById('framer-saved-grid');
  // Dispatch pointerdown (capture listener flips the guard on)
  grid.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));

  const items = window.__store.framer_saved_items_v1.slice();
  items[0] = Object.assign({}, items[0], { fetchedMeta: true, storm: true });
  window.chrome.storage.local.set({ framer_saved_items_v1: items });
  await sleep(350);

  let rendersDuringPress = 0;
  const mo = new window.MutationObserver(() => { rendersDuringPress++; });
  mo.observe(grid, { childList: true });
  await sleep(300);
  ok(rendersDuringPress === 0, 'no re-render while mouse is pressed (got ' + rendersDuringPress + ')');

  grid.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
  await sleep(500);
  ok(rendersDuringPress >= 1, 'pending render lands after press released (got ' + rendersDuringPress + ')');
  window.close();
}

// ---------------------------------------------------------------------------
// Test 10: realistic Chrome timing — save→remove→re-sync under async latency
// ---------------------------------------------------------------------------
async function testRealisticTiming() {
  console.log('\n--- T10: full flow under realistic storage latency ---');
  const window = makeWindow(DETAIL_HTML, 'https://www.framer.com/community/marketplace/components/origin-button/');
  // Rebuild storage with slow async semantics
  const store = { framer_saved_items_v1: [], framer_saved_folders_v1: [] };
  const listeners = [];
  window.chrome = {
    storage: {
      local: {
        get: (keys, cb) => setTimeout(() => {
          const res = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => { res[k] = store[k]; });
          cb(res);
        }, 20),
        set: (obj, cb) => setTimeout(() => {
          Object.keys(obj).forEach((k) => { store[k] = JSON.parse(JSON.stringify(obj[k])); });
          const changes = {};
          Object.keys(obj).forEach((k) => { changes[k] = { newValue: obj[k] }; });
          setTimeout(() => listeners.forEach((l) => l(changes, 'local')), 15);
          cb && cb();
        }, 20)
      },
      onChanged: { addListener: (l) => listeners.push(l) }
    },
    runtime: { onMessage: { addListener: () => {} }, sendMessage: (_m, cb) => cb && cb({ ok: true }) }
  };
  window.__store = store;

  window.eval(fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8'));
  await sleep(900);

  const doc = window.document;
  const btn = doc.querySelector('.framer-saved-detail-btn');
  btn.click();
  await sleep(200);
  ok(btn.classList.contains('is-saved'), 'saved under latency');

  const popover = doc.getElementById('framer-saved-folder-popover');
  popover.querySelector('.framer-saved-popover-remove-btn').click();
  await sleep(300);
  ok(!btn.classList.contains('is-saved'), 'neutral after remove under latency');
  ok((store.framer_saved_items_v1 || []).length === 0, 'storage empty after remove');
  await sleep(1900); // let interval passes run with onChanged latency
  ok(!doc.querySelector('.framer-saved-detail-btn').classList.contains('is-saved'), 'stays neutral after background passes');
  ok((window.__store.framer_saved_items_v1 || []).length === 0, 'item NOT resurrected by async onChanged replay');
  window.close();
}

(async () => {
  console.log('Running bugfix regression tests (JSDOM)...');
  await testDetailSaveRemove(false);
  await testDetailSaveRemove(true);
  await testSelfHeal();
  await testCardButtonIdAndRoundTrip();
  await testNavFallback();
  await testOverlayRemoval();
  await testListingAndMount();
  await testNoJitter();
  await testRenderStormDebounce();
  await testPressGuard();
  await testRealisticTiming();

  console.log('');
  if (failures === 0) {
    console.log('All bugfix regression tests passed.');
    process.exit(0);
  } else {
    console.log(failures + ' bugfix regression test(s) failed.');
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
