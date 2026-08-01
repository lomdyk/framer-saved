'use strict';

/**
 * Lightweight unit tests for the pure logic in content.js.
 * Run with:  node test/unit.test.js
 * (Stubs browser globals so the IIFE can load under Node.)
 */

const noop = () => {};
const fakeEl = () => ({
  style: {},
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop,
  appendChild: noop,
  remove: noop,
  setAttribute: noop,
  getAttribute: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  closest: () => null,
  focus: noop,
  innerHTML: '',
  textContent: ''
});

global.window = {
  location: {
    origin: 'https://www.framer.com',
    href: 'https://www.framer.com/',
    pathname: '/',
    hash: '',
    search: ''
  },
  addEventListener: noop,
  innerWidth: 1280
};
global.history = { pushState: noop, replaceState: noop, back: noop };
global.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => fakeEl(),
  addEventListener: noop,
  body: { appendChild: noop },
  hidden: false
};
global.localStorage = { getItem: () => null, setItem: noop };
global.MutationObserver = class { observe() {} };

const api = require('../content.js');

let failures = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log('  ok  ' + label);
  } else {
    failures++;
    console.log('FAIL  ' + label + '\n      expected ' + e + '\n      actual   ' + a);
  }
}

console.log('normalizeId / canonicalUrl');
eq(api.normalizeId('https://www.framer.com/community/marketplace/components/pixel-cursor-trail/'),
  'community/marketplace/components/pixel-cursor-trail', 'normalizes detail page url');
eq(api.normalizeId('/community/marketplace/templates/navbar/?utm=x&y=1'),
  'community/marketplace/templates/navbar', 'drops query, leading/trailing slashes');
eq(api.canonicalUrl('https://www.framer.com/community/marketplace/components/pixel-cursor-trail'),
  'https://www.framer.com/community/marketplace/components/pixel-cursor-trail/', 'canonical url gets trailing slash');
eq(api.normalizeId('https://www.framer.com/community/marketplace/components/Pixel-Trail/'),
  'community/marketplace/components/pixel-trail', 'lowercases');

console.log('parseTitleAndSubtitle');
eq(api.parseTitleAndSubtitle('Pixel Cursor Trail · Interactive pixel image reveal'),
  { title: 'Pixel Cursor Trail', subtitle: 'Interactive pixel image reveal' }, 'splits on middot');
eq(api.parseTitleAndSubtitle('Card: Big Card'), { title: 'Card', subtitle: 'Big Card' }, 'splits on colon');
eq(api.parseTitleAndSubtitle('Plain Name'), { title: 'Plain Name', subtitle: '' }, 'no delimiter');

console.log('esc');
eq(api.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;', 'escapes html');
eq(api.esc('a"b\'c&d'), 'a&quot;b&#39;c&amp;d', 'escapes quotes and ampersand');

console.log('normalizeStoredItems (legacy migration + dedupe)');
const legacy = [
  { id: 'community_marketplace_components_foo', url: 'https://www.framer.com/community/marketplace/components/foo' },
  { id: 'community_marketplace_components_foo', url: 'https://www.framer.com/community/marketplace/components/foo' },
  { id: 'community_marketplace_components_bar/', url: 'https://www.framer.com/community/marketplace/components/bar/' },
  null,
  'garbage'
];
const migrated = api.normalizeStoredItems(legacy);
eq(migrated.length, 2, 'drops duplicates and junk entries');
eq(migrated[0].id, 'community/marketplace/components/foo', 'legacy underscore id migrated to path form');
eq(migrated[1].url, 'https://www.framer.com/community/marketplace/components/bar/', 'url canonicalized');

console.log('toggleSaveItem / dedupe across entry points');
const metaCard = {
  id: 'community/marketplace/components/foo',
  url: 'https://www.framer.com/community/marketplace/components/foo/',
  title: 'Foo', price: 'Free', creator: 'X', thumbnail: ''
};
eq(api.toggleSaveItem(metaCard), true, 'first save returns true');
eq(api.isItemSaved('community/marketplace/components/foo'), true, 'saved by id');
eq(api.isItemSaved('https://www.framer.com/community/marketplace/components/foo/'), true, 'saved by url');
const metaDetail = {
  id: api.normalizeId('https://www.framer.com/community/marketplace/components/foo'),
  url: 'https://www.framer.com/community/marketplace/components/foo',
  title: 'Foo', price: 'Free', creator: 'X', thumbnail: ''
};
eq(api.toggleSaveItem(metaDetail), false, 'saving same item from detail page removes it (no duplicates)');
eq(api.isItemSaved('https://www.framer.com/community/marketplace/components/foo/'), false, 'removed');

console.log('');
if (failures === 0) {
  console.log('All tests passed.');
  process.exit(0);
} else {
  console.log(failures + ' test(s) failed.');
  process.exit(1);
}
