'use strict';

/**
 * Unit tests for content script pure functions.
 * Run with:  node test/unit.test.js
 */

const path = require('path');

// Mock browser globals required by content.js before requiring it
global.window = {
  location: { origin: 'https://www.framer.com', pathname: '/community/marketplace/components/', search: '', hash: '' },
  addEventListener: () => {},
  innerWidth: 1024,
  innerHeight: 768,
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout
};

global.document = {
  location: global.window.location,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    addEventListener: () => {}, appendChild: () => {}, setAttribute: () => {},
    style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    remove: () => {}
  }),
  body: { appendChild: () => {} },
  addEventListener: () => {},
  hidden: false
};

global.history = {
  pushState: () => {},
  replaceState: () => {}
};

global.chrome = {
  storage: {
    local: {
      get: (_keys, cb) => cb({}),
      set: (_data, cb) => cb && cb(),
      onChanged: { addListener: () => {} }
    }
  },
  runtime: { onMessage: { addListener: () => {} } }
};

global.MutationObserver = class { observe() {} disconnect() {} };
global.setInterval = () => 0;
global.clearInterval = () => {};
global.FileReader = class {
  readAsDataURL() {}
  readAsText() {}
};

const api = require('../content.js');

let failures = 0;
function eq(actual, expected, label) {
  if (actual === expected) {
    console.log('  ok  ' + label);
  } else {
    failures++;
    console.log('FAIL  ' + label + '\n      Expected: ' + JSON.stringify(expected) + '\n      Got:      ' + JSON.stringify(actual));
  }
}

console.log('normalizeId / canonicalUrl');
eq(api.normalizeId('https://www.framer.com/community/marketplace/components/foo/'), 'community/marketplace/components/foo', 'normalizes detail page url');
eq(api.normalizeId('https://www.framer.com/community/marketplace/components/foo?bar=1#saved'), 'community/marketplace/components/foo', 'drops query, leading/trailing slashes');
eq(api.canonicalUrl('https://www.framer.com/community/marketplace/components/foo'), 'https://www.framer.com/community/marketplace/components/foo/', 'canonical url gets trailing slash');
eq(api.normalizeId('HTTPS://WWW.FRAMER.COM/Community/Marketplace/Components/Foo/'), 'community/marketplace/components/foo', 'lowercases');

console.log('parseTitleAndSubtitle');
eq(api.parseTitleAndSubtitle('Foo • Bar').title, 'Foo', 'splits on middot');
eq(api.parseTitleAndSubtitle('Foo : Bar').subtitle, 'Bar', 'splits on colon (simple)');
eq(api.parseTitleAndSubtitle('Just Title').subtitle, '', 'no delimiter');
eq(api.parseTitleAndSubtitle('Components: Buttons — Glassmorphic').title, 'Components: Buttons', 'strong delimiter (em-dash) takes priority over colon');
eq(api.parseTitleAndSubtitle('Components: Buttons — Glassmorphic').subtitle, 'Glassmorphic', 'subtitle is the part after em-dash');

console.log('esc');
eq(api.esc('<b>hello</b>'), '&lt;b&gt;hello&lt;/b&gt;', 'escapes html');
eq(api.esc('"test" & \'more\''), '&quot;test&quot; &amp; &#39;more&#39;', 'escapes quotes and ampersand');

console.log('slugify');
eq(api.slugify('Glassmorphic UI'), 'glassmorphic-ui', 'slugify handles spaces');
eq(api.slugify('3D & Motion!'), '3d-motion', 'slugify strips special chars');

console.log('normalizeStoredItems (legacy migration + dedupe)');
// reset module state by clearing the internal items via toggleSaveItem
// To not rely on module state, test normalizeStoredItems through api.normalizeStoredItems directly? It's not exported.
// We can test via the fact that items get deduped by calling toggleSaveItem twice.

console.log('Folders API');
const createdFolder = api.createFolder('Test Folder Unit');
eq(createdFolder.id, 'test-folder-unit', 'creates normalized folder id');
eq(createdFolder.name, 'Test Folder Unit', 'preserves display name');

const testItemUrl = 'https://www.framer.com/community/marketplace/components/unit-test-item/';
api.toggleSaveItem({
  id: api.normalizeId(testItemUrl),
  url: testItemUrl,
  title: 'Unit Test', price: 'Free', creator: 'Test', thumbnail: ''
});

const inFolder = api.toggleItemFolder(testItemUrl, 'test-folder-unit');
eq(inFolder, true, 'adds item to folder');

const removedFolder = api.toggleItemFolder(testItemUrl, 'test-folder-unit');
eq(removedFolder, false, 'toggles item out of folder');

const delCustom = api.deleteFolder('test-folder-unit');
eq(delCustom, true, 'can delete user created folder');

console.log('isItemSaved / findIndexById — trailing slash tolerance');
const slugUrl = 'https://www.framer.com/community/marketplace/components/foo-slug/';
// first remove if it exists for isolation
if (api.isItemSaved(slugUrl)) api.toggleSaveItem({ id: api.normalizeId(slugUrl), url: slugUrl, title: 'Foo', price: 'Free', creator: 'X', thumbnail: '' });
api.toggleSaveItem({
  id: api.normalizeId(slugUrl),
  url: slugUrl,
  title: 'Foo', price: 'Free', creator: 'X', thumbnail: ''
});
eq(api.isItemSaved('https://www.framer.com/community/marketplace/components/foo-slug'), true, 'isItemSaved matches url without trailing slash');
eq(api.isItemSaved('https://www.framer.com/community/marketplace/components/foo-slug/'), true, 'isItemSaved matches url with trailing slash');
eq(api.findIndexById('https://www.framer.com/community/marketplace/components/foo-slug') > -1, true, 'findIndexById finds by url without trailing slash');
// clean up
api.toggleSaveItem({ id: api.normalizeId(slugUrl), url: slugUrl, title: 'Foo', price: 'Free', creator: 'X', thumbnail: '' });

console.log('normalizeId — encoded characters');
eq(api.normalizeId('https://www.framer.com/community/marketplace/components/hello%20world/'),
  'community/marketplace/components/hello world', 'decodes %20 in normalizeId');

console.log('');
if (failures === 0) {
  console.log('All unit tests passed.');
  process.exit(0);
} else {
  console.log(failures + ' test(s) failed.');
  process.exit(1);
}
