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
  innerHeight: 768
};

global.document = {
  location: global.window.location,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ addEventListener: () => {}, appendChild: () => {}, setAttribute: () => {}, style: {} }),
  body: { appendChild: () => {} },
  addEventListener: () => {}
};

global.history = {
  pushState: () => {},
  replaceState: () => {}
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
eq(api.parseTitleAndSubtitle('Foo : Bar').subtitle, 'Bar', 'splits on colon');
eq(api.parseTitleAndSubtitle('Just Title').subtitle, '', 'no delimiter');

console.log('esc');
eq(api.esc('<b>hello</b>'), '&lt;b&gt;hello&lt;/b&gt;', 'escapes html');
eq(api.esc('"test" & \'more\''), '&quot;test&quot; &amp; &#39;more&#39;', 'escapes quotes and ampersand');

console.log('normalizeStoredItems (legacy migration + dedupe)');
const raw = [
  { id: 'community_marketplace_components_foo', url: 'https://www.framer.com/community/marketplace/components/foo/' },
  { id: 'community/marketplace/components/foo', url: 'https://www.framer.com/community/marketplace/components/foo' },
  { id: 'community/marketplace/components/bar', url: 'https://www.framer.com/community/marketplace/components/bar' },
  null,
  'junk'
];
const migrated = api.normalizeStoredItems(raw);
eq(migrated.length, 2, 'drops duplicates and junk entries');
eq(migrated[0].id, 'community/marketplace/components/foo', 'legacy underscore id migrated to path form');
eq(migrated[1].url, 'https://www.framer.com/community/marketplace/components/bar/', 'url canonicalized');

console.log('isItemSaved / findIndexById — trailing slash tolerance');
const slugUrl = 'https://www.framer.com/community/marketplace/components/foo/';
api.toggleSaveItem({
  id: api.normalizeId(slugUrl),
  url: slugUrl,
  title: 'Foo', price: 'Free', creator: 'X', thumbnail: ''
});
eq(api.isItemSaved('https://www.framer.com/community/marketplace/components/foo'), true, 'isItemSaved matches url without trailing slash');
eq(api.isItemSaved('https://www.framer.com/community/marketplace/components/foo/'), true, 'isItemSaved matches url with trailing slash');
eq(api.findIndexById('https://www.framer.com/community/marketplace/components/foo'), 0, 'findIndexById finds by url without trailing slash');
api.toggleSaveItem({ id: api.normalizeId(slugUrl), url: slugUrl, title: 'Foo', price: 'Free', creator: 'X', thumbnail: '' });

console.log('normalizeId — encoded characters');
eq(api.normalizeId('https://www.framer.com/community/marketplace/components/hello%20world/'),
  'community/marketplace/components/hello world', 'decodes %20 in normalizeId');

console.log('canonicalUrl — no double-encoding');
eq(api.canonicalUrl('https://www.framer.com/community/marketplace/components/hello%20world/'),
  'https://www.framer.com/community/marketplace/components/hello%20world/', 'canonicalUrl does not double-encode %20');

console.log('Folders & Collections API (Pinterest/Awwwards style)');
const createdFolder = api.createFolder('Glassmorphic UI');
eq(createdFolder.id, 'glassmorphic-ui', 'creates normalized folder id');
eq(createdFolder.name, 'Glassmorphic UI', 'preserves display name');

const testItemUrl = 'https://www.framer.com/community/marketplace/components/glass-card/';
api.toggleSaveItem({
  id: api.normalizeId(testItemUrl),
  url: testItemUrl,
  title: 'Glass Card', price: 'Free', creator: 'Dev', thumbnail: ''
});

const inFolder = api.toggleItemFolder(testItemUrl, 'glassmorphic-ui');
eq(inFolder, true, 'adds item to folder');

const removedFolder = api.toggleItemFolder(testItemUrl, 'glassmorphic-ui');
eq(removedFolder, false, 'toggles item out of folder');

console.log('');
if (failures === 0) {
  console.log('All unit tests passed.');
  process.exit(0);
} else {
  console.log(failures + ' test(s) failed.');
  process.exit(1);
}
