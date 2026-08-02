/*
 * extractor.js — runs in the context of a Framer live-preview page
 * (*.framer.website / *.framer.app / *.framer.ai).
 * It:
 *  1. Waits for hydration to settle
 *  2. Scrolls the page to trigger lazy code-split chunks and images
 *  3. Serialises the fully-rendered HTML
 *  4. Collects every resource URL actually loaded (via performance.getEntriesByType)
 *  5. Fetches those resources as Blobs and sends them back (base64) to the
 *     background service worker for URL rewriting + zipping.
 *  6. Reports progress events over chrome.runtime.sendMessage.
 */
(function () {
  'use strict';

  const SCRIPT_VERSION = 1;
  const ALLOWED_FRAMER_DOMAINS = [
    'framerusercontent.com',
    'framer.app',
    'framer.website',
    'framer.ai',
  ];

  function send(message) {
    try {
      chrome.runtime.sendMessage(Object.assign({ v: SCRIPT_VERSION }, message));
    } catch (_) { /* ignore */ }
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const dataUrl = reader.result;
        const comma = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  function resolveUrl(u) {
    try { return new URL(u, location.href).href; } catch (e) { return null; }
  }

  function isAllowed(url) {
    if (!url) return false;
    if (url.startsWith('data:')) return false;
    if (url.startsWith('blob:')) return false;
    if (url.startsWith('chrome-extension:')) return false;
    try {
      const u = new URL(url);
      const host = u.hostname;
      // allow same-origin + framer CDN + Vercel blob storage
      if (host === location.hostname) return true;
      if (ALLOWED_FRAMER_DOMAINS.some(function (d) {
        return host === d || host.endsWith('.' + d);
      })) return true;
      if (/public\.blob\.vercel-storage\.com$/.test(host) || host.endsWith('.public.blob.vercel-storage.com')) return true;
      if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') return true;
      return false;
    } catch (_) { return false; }
  }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  async function autoScroll() {
    send({ type: 'progress', stage: 'scroll', message: 'Scrolling page to trigger lazy assets...' });
    const delay = 150;
    const step = Math.max(400, window.innerHeight * 0.8);
    let pos = 0;
    const bottom = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement.scrollHeight
    );
    // scroll down
    while (pos < bottom) {
      window.scrollTo(0, pos);
      await wait(delay);
      pos += step;
    }
    window.scrollTo(0, bottom);
    await wait(600);
    // scroll back up
    while (pos > 0) {
      window.scrollTo(0, pos);
      await wait(80);
      pos -= step;
    }
    window.scrollTo(0, 0);
    await wait(300);
  }

  function collectResourceUrls() {
    const urls = new Set();
    // 1. performance entries — captures everything actually requested
    const entries = performance.getEntriesByType('resource') || [];
    entries.forEach(function (e) {
      if (e.name && isAllowed(e.name)) urls.add(e.name);
    });

    // 2. DOM resources
    function addFromAttr(el, attr) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v && !v.startsWith('data:') && !v.startsWith('blob:')) {
        const r = resolveUrl(v);
        if (r && isAllowed(r)) urls.add(r);
      }
    }
    document.querySelectorAll('link[href], script[src], img[src], img[srcset], source[src], source[srcset], video[src], audio[src], [style*="url("]').forEach(function (el) {
      addFromAttr(el, 'href');
      addFromAttr(el, 'src');
      if (el.getAttribute('srcset')) {
        el.getAttribute('srcset').split(',').forEach(function (part) {
          const u = part.trim().split(/\s+/)[0];
          if (u) {
            const r = resolveUrl(u);
            if (r && isAllowed(r)) urls.add(r);
          }
        });
      }
      // inline background:url(...)
      if (el.style && el.style.cssText) {
        const m = el.style.cssText.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
        if (m) m.forEach(function (match) {
          const inner = match.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
          const r = resolveUrl(inner);
          if (r && isAllowed(r)) urls.add(r);
        });
      }
    });

    // 3. CSS @import / url(...) from stylesheets
    function scanCssText(text) {
      if (!text) return [];
      const out = [];
      const re = /(?:@import\s+(?:url\()?['"]?|url\(['"]?)([^'")\s]+)['"]?/g;
      let m;
      while ((m = re.exec(text))) {
        const r = resolveUrl(m[1]);
        if (r && isAllowed(r)) out.push(r);
      }
      return out;
    }
    try {
      Array.prototype.forEach.call(document.styleSheets, function (ss) {
        try {
          if (ss.href) urls.add(ss.href);
          Array.prototype.forEach.call(ss.cssRules || [], function (rule) {
            scanCssText(rule.cssText || '').forEach(function (u) { urls.add(u); });
          });
        } catch (_) { /* cross-origin sheets throw */ }
      });
    } catch (_) {}

    // 4. Inline <script type="module"> — extract static import / import() URLs
    document.querySelectorAll('script[type="module"]').forEach(function (s) {
      const text = s.textContent || '';
      const re = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
      let m;
      while ((m = re.exec(text))) {
        const u = m[1] || m[2];
        const r = resolveUrl(u);
        if (r && isAllowed(r)) urls.add(r);
      }
    });

    // 5. preload / modulepreload links (often already in performance entries but safety first)
    document.querySelectorAll('link[rel="modulepreload"][href], link[rel="preload"][href]').forEach(function (el) {
      const r = resolveUrl(el.getAttribute('href'));
      if (r && isAllowed(r)) urls.add(r);
    });

    return Array.from(urls);
  }

  function guessMimeFromUrl(u) {
    const path = u.split('?')[0].split('#')[0].toLowerCase();
    if (path.endsWith('.js') || path.endsWith('.mjs')) return 'text/javascript';
    if (path.endsWith('.css')) return 'text/css';
    if (path.endsWith('.html') || path.endsWith('.htm')) return 'text/html';
    if (path.endsWith('.json')) return 'application/json';
    if (path.endsWith('.svg')) return 'image/svg+xml';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.gif')) return 'image/gif';
    if (path.endsWith('.woff2')) return 'font/woff2';
    if (path.endsWith('.woff')) return 'font/woff';
    if (path.endsWith('.ttf')) return 'font/ttf';
    if (path.endsWith('.otf')) return 'font/otf';
    if (path.endsWith('.mp4')) return 'video/mp4';
    if (path.endsWith('.webm')) return 'video/webm';
    if (path.endsWith('.mp3')) return 'audio/mpeg';
    if (path.endsWith('.ico')) return 'image/x-icon';
    return '';
  }

  function stripFramerBadge(root) {
    // Remove "Made with Framer" badge that Framer injects on published sites
    const candidates = root.querySelectorAll(
      'a[href*="framer.com"], a[href*="framer.website"], a[href*="framer.app"], ' +
      '[data-framer-badge], [data-framer-badge-bottom], [data-badge], div[style*="made with framer" i]'
    );
    candidates.forEach(function (el) {
      const text = (el.textContent || '').toLowerCase().trim();
      const href = (el.getAttribute('href') || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      if (
        /made\s+(?:with|in|on|by)?\s*framer|powered\s+by\s*framer|create\s+a\s+free\s+website/i.test(text) ||
        /made\s+with\s*framer/i.test(aria) ||
        (href.includes('framer.com') && /framer|made|create/i.test(text) && text.length < 60)
      ) {
        el.remove();
      }
    });
  }

  function stripTracking(root) {
    const trackingDomains = [
      'posthog.com', 'static.cloudflareinsights.com', 'googletagmanager.com',
      'google-analytics.com', 'analytics.', 'clarity.ms', 'hotjar.com',
      'fullstory.com', 'segment.io', 'segment.com', 'events.framer.com'
    ];
    root.querySelectorAll('script[src], iframe[src], img[src]').forEach(function (el) {
      const src = el.getAttribute('src') || el.getAttribute('href') || '';
      if (trackingDomains.some(function (d) { return src.includes(d); })) {
        el.remove();
      }
    });
  }

  function serializeHtml(opts) {
    // clone the current document so we can mutate it for export
    const clone = document.documentElement.cloneNode(true);

    if (opts.stripBadge) stripFramerBadge(clone);
    if (opts.stripAnalytics) stripTracking(clone);

    if (opts.stripJs) {
      // remove all scripts and preload links for JS
      clone.querySelectorAll('script, link[rel="modulepreload"], link[as="script"]').forEach(function (el) { el.remove(); });
      // fix initial state: Framer sets opacity:0 / translateY() on elements that JS
      // would animate in — set them to visible state for a static snapshot.
      clone.querySelectorAll('[style]').forEach(function (el) {
        const style = el.getAttribute('style') || '';
        const replaced = style
          .replace(/opacity\s*:\s*0(\s*!important)?\s*;?/gi, 'opacity:1;')
          .replace(/transform\s*:[^;]*translate[YZ]\(\s*-?\d+(?:px|vh|vw|%)\s*\)[^;]*;?/gi, '');
        el.setAttribute('style', replaced);
      });
    }

    // inject <base> removed (we rewrite URLs instead), but we'll do that in bg
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  async function fetchResource(u) {
    try {
      const res = await fetch(u, { credentials: 'omit', cache: 'force-cache' });
      if (!res.ok) return null;
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      return {
        url: u,
        mime: blob.type || guessMimeFromUrl(u),
        base64: base64,
        size: blob.size
      };
    } catch (e) {
      return { url: u, error: String(e && e.message || e), base64: '', mime: guessMimeFromUrl(u), size: 0 };
    }
  }

  async function run(jobId, opts) {
    try {
      send({ type: 'ready', jobId: jobId, href: location.href, title: document.title });
      send({ type: 'progress', stage: 'wait', message: 'Waiting for page to settle...' });

      await wait(opts.waitMs || 2500);
      if (opts.autoScroll) await autoScroll();
      await wait(500);

      send({ type: 'progress', stage: 'collect', message: 'Collecting resource URLs...' });
      const urls = collectResourceUrls();
      send({ type: 'collected', count: urls.length });

      // Send HTML first
      const html = serializeHtml(opts);
      send({
        type: 'html',
        html: html,
        originalHref: location.href
      });

      // Fetch assets in batches
      const BATCH = 6;
      const total = urls.length;
      const results = [];
      for (let i = 0; i < urls.length; i += BATCH) {
        const batch = urls.slice(i, i + BATCH);
        const res = await Promise.all(batch.map(fetchResource));
        res.forEach(function (r) { if (r) results.push(r); });
        send({
          type: 'progress',
          stage: 'fetch',
          done: Math.min(i + BATCH, total),
          total: total,
          message: 'Downloaded ' + Math.min(i + BATCH, total) + '/' + total + ' assets'
        });
      }

      // Also dump inline <style> sheets so bg can merge them into external css if needed
      send({
        type: 'done',
        assets: results,
        count: results.length
      });
    } catch (e) {
      send({ type: 'error', message: String(e && e.message || e) });
    }
  }

  // Wait for message from bg to start
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'start-extract') {
      run(msg.jobId, msg.opts || {});
    }
  });

  // Auto-start if our ?__framer_export=1 flag is present (fallback)
  if (location.search.includes('__framer_export=1')) {
    const opts = {};
    location.search.replace(/[?&]([^=&]+)=([^&]*)/g, function (_, k, v) {
      if (k === 'stripJs') opts.stripJs = v !== '0';
      if (k === 'stripBadge') opts.stripBadge = v !== '0';
      if (k === 'stripAnalytics') opts.stripAnalytics = v !== '0';
      if (k === 'autoScroll') opts.autoScroll = v !== '0';
      if (k === 'jobId') opts.jobId = v;
      if (k === 'waitMs') opts.waitMs = parseInt(v, 10) || 2500;
    });
    run(opts.jobId || 'auto', opts);
  }
})();
