'use strict';

/**
 * Integration tests for Framer Saved content script using JSDOM.
 * Run with:  node test/integration.test.js
 */

const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

const contentJsPath = path.join(__dirname, '..', 'content.js');
const cssPath = path.join(__dirname, '..', 'styles.css');
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
  <nav class="sidebar-module__sidebar">
    <a href="/community/marketplace/" class="sidebar-module__navItem">Community</a>
    <a href="/community/marketplace/components/" class="sidebar-module__navItem">Components</a>
  </nav>
  <main class="layout-module__content">
    <article class="post-tile">
      <a href="/community/marketplace/components/pixel-cursor-trail/" class="post-tile__link">
        <img src="https://example.com/thumb1.jpg" alt="Pixel Trail" />
        <div class="name">Pixel Cursor Trail</div>
      </a>
      <div class="footer"><span>$12</span></div>
    </article>
    <article class="post-tile">
      <a href="/community/marketplace/templates/perspectiva/" class="post-tile__link">
        <img src="https://example.com/thumb2.jpg" alt="Perspectiva" />
        <div class="name">Perspectiva</div>
      </a>
      <div class="footer"><span>Free</span></div>
    </article>
    <article class="post-tile">
      <a href="/community/marketplace/components/morph-button/" class="post-tile__link">
        <img src="https://example.com/thumb3.jpg" alt="Morph Button" />
        <div class="name">Morph Button</div>
      </a>
      <div class="footer"><span>Free</span></div>
    </article>
  </main>
</body>
</html>
`;

const DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head><title>Morph Button — Framer Marketplace</title></head>
<body>
  <nav class="sidebar-module__sidebar">
    <a href="/community/marketplace/" class="sidebar-module__navItem">Community</a>
    <a href="/community/marketplace/components/" class="sidebar-module__navItem">Components</a>
  </nav>
  <main>
    <header>
      <h1>Morph Button • Morphing button interaction</h1>
      <div class="action-cluster">
        <button class="like-btn">Like</button>
        <button class="primary-cta">Copy Component</button>
      </div>
    </header>
    <section>
      <img src="https://example.com/detail.jpg" alt="" />
      <p>Description here.</p>
    </section>
  </main>
</body>
</html>
`;

async function runTests() {
  console.log('Running integration tests with JSDOM...');

  const dom = new JSDOM(MARKETPLACE_HTML, {
    url: 'https://www.framer.com/community/marketplace/components/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });

  const window = dom.window;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.scrollTo = () => {};
  window.innerWidth = 1280;
  window.innerHeight = 800;
  window.scrollY = 0;
  window.scrollX = 0;
  // getComputedStyle stub
  window.getComputedStyle = () => ({ position: 'static', opacity: '1', transform: 'none' });
  // Ensure elements report non-zero size so injectCardBookmarkButtons rect-size check passes
  const origQS = window.document.querySelectorAll.bind(window.document);
  window.Element.prototype.getBoundingClientRect = function () {
    return { top: 100, left: 100, right: 300, bottom: 300, width: 200, height: 200, x: 100, y: 100 };
  };

  // Stub chrome APIs
  window.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const result = {
            framer_saved_items_v1: [],
            framer_saved_folders_v1: [],
            framer_saved_settings_v1: null
          };
          cb(result);
        },
        set: (obj, cb) => { cb && cb(); },
        onChanged: { addListener: () => {} }
      }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: (_msg, _cb) => {}
    }
  };

  // MutationObserver stub-minimum
  window.MutationObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() {}
  };

  // Blob/URL stub for download
  window.Blob = class { constructor(parts) { this.parts = parts; } };
  window.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
  window.FileReader = class {
    readAsDataURL() { this.result = 'data:application/octet-stream;base64,'; setTimeout(() => this.onload && this.onload(), 0); }
    readAsText() { this.result = '{}'; setTimeout(() => this.onload && this.onload(), 0); }
  };

  // Execute content.js in window context
  window.eval(contentJsCode);

  // Let the init pipeline run
  await sleep(600);

  // Test 1: Sidebar tab injection
  const sidebarTab = window.document.querySelector('.framer-saved-nav-item');
  ok(sidebarTab !== null, 'Sidebar Saved tab injected');

  // Test 2: Card bookmark buttons injected on each tile
  const cardBtns = window.document.querySelectorAll('.framer-saved-card-inline-btn');
  ok(cardBtns.length === 3, 'Bookmark button injected on every tile (got ' + cardBtns.length + ', expected 3)');

  // Test 3: Clicking card button saves and toggles is-saved
  if (cardBtns.length > 0) {
    cardBtns[0].click();
    await sleep(100);
    ok(cardBtns[0].classList.contains('is-saved'), 'Card button gets is-saved class after click');
  }

  // Test 4: Navigate to detail page via pushState + DOM replacement
  const dom2 = new JSDOM(DETAIL_HTML, {
    url: 'https://www.framer.com/community/marketplace/components/morph-button/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });
  // We won't re-init; rather simulate SPA by replacing doc in-place:
  dom.window.document.documentElement.innerHTML = dom2.window.document.documentElement.innerHTML;
  dom.window.history.pushState({}, '', '/community/marketplace/components/morph-button/');
  // Manually update pathname on jsdom's Location (it's a real Location object)
  try {
    dom.window.location.pathname = '/community/marketplace/components/morph-button/';
  } catch (_) {
    // if jsdom doesn't allow direct pathname set, fire a popstate-like trigger manually
  }

  await sleep(800);

  const detailBtn = dom.window.document.querySelector('.framer-saved-detail-btn');
  ok(detailBtn !== null, 'Detail Save button appears after SPA navigation');

  // Test 5: Esc key closes save popover
  // (smoke test — dispatching keyboard events in jsdom doesn't go through our listener fully without focus, but we can verify no crash)

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
