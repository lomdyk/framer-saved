'use strict';

/**
 * Integration tests for Framer Saved content script using JSDOM.
 * Run with:  node test/integration.test.js
 */

const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

const contentJsPath = path.join(__dirname, '..', 'content.js');
const contentJsCode = fs.readFileSync(contentJsPath, 'utf8');

let failures = 0;
function ok(condition, label) {
  if (condition) {
    console.log('  ok  ' + label);
  } else {
    failures++;
    console.log('FAIL  ' + label);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MARKETPLACE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Framer Marketplace</title></head>
<body>
  <nav class="sidebar-module-scss-module__s7LA8a__sidebar">
    <a href="/community/members/" class="sidebar-module-scss-module__s7LA8a__navItem">Members</a>
  </nav>
  <main class="layout-module-scss-module__P9S6KG__content">
    <div class="post-tile-module__s7LA8a__tile">
      <a href="/community/marketplace/components/pixel-cursor-trail/" class="post-tile-module__s7LA8a__link">
        <img src="https://example.com/thumb1.jpg" alt="Pixel Trail" />
        <div class="name">Pixel Cursor Trail</div>
      </a>
      <div class="footer"><span>💬 2</span></div>
    </div>
    <div class="post-tile-module__s7LA8a__tile">
      <a href="/community/marketplace/templates/perspectiva/" class="post-tile-module__s7LA8a__link">
        <img src="https://example.com/thumb2.jpg" alt="Perspectiva" />
        <div class="name">Perspectiva</div>
      </a>
      <div class="footer"><span>💬 5</span></div>
    </div>
    <div class="post-tile-module__s7LA8a__tile">
      <a href="/community/marketplace/components/morph-button/" class="post-tile-module__s7LA8a__link">
        <img src="https://example.com/thumb3.jpg" alt="Morph Button" />
        <div class="name">Morph Button</div>
      </a>
      <div class="footer"><span>💬 0</span></div>
    </div>
  </main>
</body>
</html>
`;

const DETAIL_MAIN = `
  <header>
    <h1>Morph Button • Morphing button interaction</h1>
    <div class="action-cluster">
      <button class="like-btn"><svg><use href="#heart"></use></svg></button>
      <button class="primary-cta">Copy Component</button>
    </div>
  </header>
`;

async function runTests() {
  console.log('Running integration tests with JSDOM...');

  const dom = new JSDOM(MARKETPLACE_HTML, {
    url: 'https://www.framer.com/community/marketplace/components/',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  const window = dom.window;

  // Stub chrome.storage
  window.chrome = {
    storage: {
      local: {
        get: (keys, cb) => cb({ framer_saved_items_v1: [] }),
        set: (obj, cb) => cb && cb()
      },
      onChanged: { addListener: () => {} }
    }
  };

  // Execute content.js in window context
  window.eval(contentJsCode);

  await sleep(300);

  // Test 1: Sidebar tab injection
  const sidebarTab = window.document.querySelector('.framer-saved-nav-item');
  ok(sidebarTab !== null, 'Sidebar Saved tab injected');

  // Test 2: Card bookmark buttons injected
  const cardBtns = window.document.querySelectorAll('.framer-saved-card-inline-btn');
  ok(cardBtns.length === 3, 'Bookmark button injected on every tile (3/3)');

  // Test 3: Card button click toggles state
  if (cardBtns.length > 0) {
    cardBtns[0].click();
    ok(cardBtns[0].classList.contains('is-saved'), 'Card button gets is-saved class after click');
  }

  // Test 4: SPA Navigation simulation
  window.history.pushState({}, '', '/community/marketplace/components/morph-button/');
  const main = window.document.querySelector('main');
  if (main) main.innerHTML = DETAIL_MAIN;

  await sleep(400);

  const detailBtn = window.document.querySelector('.framer-saved-detail-btn');
  ok(detailBtn !== null, 'Detail Save button appears after SPA navigation');

  // Test 5: Pure pushState without DOM changes
  window.history.pushState({}, '', '/community/marketplace/components/pixel-cursor-trail/');
  await sleep(600);

  ok(window.document.querySelector('.framer-saved-detail-btn') !== null, 'Detail button (re)injected after pure pushState navigation');

  console.log('');
  if (failures === 0) {
    console.log('All integration tests passed.');
    process.exit(0);
  } else {
    console.log(failures + ' integration test(s) failed.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
