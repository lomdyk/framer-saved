/*
 * background.js — MV3 service worker.
 * Manages extraction jobs: opens (or reuses) a hidden preview tab, injects
 * extractor.js, streams collected assets back, rewrites URLs to relative
 * paths, zips them via JSZip, and hands the resulting archive to chrome.downloads.
 */

importScripts('vendor/jszip.min.js');

const SETTINGS_KEY = 'framer_saved_settings_v1';
const JOBS = new Map(); // jobId -> { status, resolve, opts, zip, assets, errors }
const TAB_JOB_MAP = new Map(); // tabId -> jobId

const DEFAULT_SETTINGS = {
  export: {
    includeJs: true,           // include JS mjs chunks (animations work when true)
    stripJs: false,            // if true, produce static-only snapshot (no JS)
    stripBadge: true,          // remove "Made with Framer" badge
    stripAnalytics: true,      // remove GA/PostHog/etc tracking
    autoScroll: true,          // auto-scroll to trigger lazy chunks
    waitMs: 2500,              // wait-for-hydration ms
    includeFonts: true,        // include web fonts
    includeImages: true,       // include images
    // future options
  },
  ui: {
    accentColor: '#0099ff',
    sortBy: 'savedAt-desc',    // savedAt-desc | savedAt-asc | title-asc | price-asc
    showExportBtn: true,
    showBadgeCount: true,
    lightMode: false,          // reserved for future light theme
    shortcutSave: true,        // 'S' hotkey on detail pages
    shortcutSearch: true       // Cmd/Ctrl+K focuses search in Saved view
  }
};

// ---------- settings helpers ----------

function loadSettings() {
  return new Promise(function (resolve) {
    chrome.storage.local.get([SETTINGS_KEY], function (res) {
      const stored = res[SETTINGS_KEY] || {};
      const merged = {
        export: Object.assign({}, DEFAULT_SETTINGS.export, stored.export || {}),
        ui: Object.assign({}, DEFAULT_SETTINGS.ui, stored.ui || {})
      };
      resolve(merged);
    });
  });
}

function saveSettings(settings) {
  return new Promise(function (resolve) {
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, function () { resolve(settings); });
  });
}

// Expose settings to content scripts via message
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;

  if (msg.type === 'get-settings') {
    loadSettings().then(sendResponse);
    return true;
  }
  if (msg.type === 'set-settings') {
    loadSettings().then(async function (current) {
      const next = {
        export: Object.assign({}, current.export, msg.patch && msg.patch.export || {}),
        ui: Object.assign({}, current.ui, msg.patch && msg.patch.ui || {})
      };
      await saveSettings(next);
      // Broadcast to all framer tabs
      const tabs = await chrome.tabs.query({ url: 'https://www.framer.com/*' });
      tabs.forEach(function (t) {
        chrome.tabs.sendMessage(t.id, { type: 'settings-updated', settings: next }).catch(() => {});
      });
      sendResponse(next);
    });
    return true;
  }

  if (msg.type === 'start-export') {
    startExport(msg.previewUrl, msg.slug || 'framer-export')
      .then(function (result) { sendResponse({ ok: true, result: result }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err && err.message || err) }); });
    return true;
  }
});

// ---------- url → relative path mapping ----------

function toAssetPath(url, baseOrigin) {
  try {
    const u = new URL(url);
    // host folders to keep cross-origin files in a tidy structure
    let prefix = 'assets/';
    if (u.hostname.includes('framerusercontent.com')) {
      // keep the /sites/<id>/ structure inside assets
      prefix = 'assets/framerusercontent/';
    } else if (u.hostname.includes('vercel-storage.com')) {
      prefix = 'assets/blob/';
    } else if (u.hostname.includes('fonts.g')) {
      prefix = 'assets/fonts/';
    }
    // strip leading slash from path
    let path = decodeURIComponent(u.pathname);
    if (path.startsWith('/')) path = path.slice(1);
    if (!path) path = 'index';
    // if the path has no extension (e.g. some mjs endpoints), preserve as-is
    return prefix + path;
  } catch (e) {
    return 'assets/' + Math.random().toString(36).slice(2);
  }
}

function base64ToUint8Array(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/**
 * Walks a string and replaces all occurrences of known absolute asset URLs
 * with the corresponding relative path. Handles a few quote contexts.
 */
function rewriteUrlsInText(text, urlMap) {
  if (!text) return text;
  let out = text;
  // longer URLs first so we don't partially match
  const entries = Array.from(urlMap.entries()).sort(function (a, b) { return b[0].length - a[0].length; });
  entries.forEach(function ([abs, rel]) {
    // HTML-entity encoded (href=&quot;https://...&quot;)
    out = out.split(abs).join(rel);
    // try without trailing slash variant
    if (abs.endsWith('/')) {
      out = out.split(abs.slice(0, -1)).join(rel.replace(/\/+$/, ''));
    }
  });
  return out;
}

// ---------- export job orchestration ----------

function makeJobId() {
  return 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

async function waitForTabComplete(tabId, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve('timeout');
    }, timeoutMs || 45000);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve('complete');
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function startExport(previewUrl, slug) {
  const settings = await loadSettings();
  const opts = Object.assign({}, settings.export);
  const jobId = makeJobId();

  const job = {
    id: jobId,
    previewUrl: previewUrl,
    slug: slug,
    opts: opts,
    status: 'starting',
    zip: new JSZip(),
    urlMap: new Map(), // absolute url -> relative path
    html: '',
    assetCount: 0,
    errors: [],
    createdAt: Date.now()
  };
  // Wire up extractor message listener early so errors are caught too
  const listener = function (msg, sender) {
    if (!msg || sender.tab && sender.tab.id !== job.tabId) return;
    handleExtractorMessage(jobId, msg);
  };
  job.listener = listener;
  chrome.runtime.onMessage.addListener(listener);

  JOBS.set(jobId, job);

  broadcast({ type: 'export-progress', jobId: jobId, status: 'starting', message: 'Opening preview tab...' });

  let tab;
  try {
    tab = await chrome.tabs.create({ url: previewUrl, active: false });
  } catch (e) {
    cleanupJob(jobId, false);
    throw new Error('Could not open preview tab: ' + e.message);
  }
  TAB_JOB_MAP.set(tab.id, jobId);
  job.tabId = tab.id;

  // Wait for load
  await waitForTabComplete(tab.id, 45000);
  job.status = 'loaded';
  broadcast({ type: 'export-progress', jobId: jobId, status: 'loaded', message: 'Injecting extractor...' });

  // Small wait so Framer runtime boots
  await new Promise(function (r) { setTimeout(r, 800); });

  // Inject extractor.js
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      files: ['extractor.js'],
      world: 'ISOLATED'
    });
  } catch (e) {
    await cleanupJob(jobId, false);
    throw new Error('Failed to inject extractor: ' + e.message);
  }

  // Kick off extraction
  chrome.tabs.sendMessage(tab.id, { type: 'start-extract', jobId: jobId, opts: opts }).catch(function (e) {
    job.errors.push('sendMessage: ' + e.message);
  });

  // Wait for done/error with overall timeout
  const zipBlob = await new Promise(function (resolve, reject) {
    job.resolve = resolve;
    job.reject = reject;
    // Safety timeout 90s
    job.timeout = setTimeout(function () {
      reject(new Error('Export timed out after 90s'));
    }, 90000);
  });

  // Download the blob
  const safeSlug = String(slug || 'framer-export').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'framer-export';
  const filename = 'framer-exports/' + safeSlug + '-' + new Date().toISOString().slice(0, 10) + '.zip';
  const downloadUrl = await blobToDataUrl(zipBlob);
  const downloadId = await chrome.downloads.download({
    url: downloadUrl,
    filename: filename,
    conflictAction: 'uniquify',
    saveAs: false
  });

  await cleanupJob(jobId, true);
  return { jobId: jobId, downloadId: downloadId, filename: filename, assetCount: job.assetCount };
}

function blobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(blob);
  });
}

async function cleanupJob(jobId, ok) {
  const job = JOBS.get(jobId);
  if (!job) return;
  clearTimeout(job.timeout);
  if (job.listener) chrome.runtime.onMessage.removeListener(job.listener);
  if (job.tabId) {
    try { await chrome.tabs.remove(job.tabId); } catch (_) {}
    TAB_JOB_MAP.delete(job.tabId);
  }
  if (!ok) {
    // still close tab
    JOBS.delete(jobId);
  }
}

function handleExtractorMessage(jobId, msg) {
  const job = JOBS.get(jobId);
  if (!job) return;

  switch (msg.type) {
    case 'ready':
      broadcast({ type: 'export-progress', jobId: jobId, status: 'ready', message: 'Page ready, waiting for hydration...' });
      break;

    case 'progress':
      broadcast({
        type: 'export-progress',
        jobId: jobId,
        status: msg.stage,
        message: msg.message,
        done: msg.done,
        total: msg.total
      });
      break;

    case 'collected':
      broadcast({ type: 'export-progress', jobId: jobId, status: 'collected', message: 'Found ' + msg.count + ' assets, downloading...', total: msg.count });
      break;

    case 'html':
      job.html = msg.html;
      job.originalHref = msg.originalHref;
      break;

    case 'done': {
      // Write every asset into the zip, build url map
      const assets = msg.assets || [];
      assets.forEach(function (a) {
        if (!a || a.error || !a.base64) {
          if (a && a.error) job.errors.push(a.url + ': ' + a.error);
          return;
        }
        const rel = toAssetPath(a.url, job.previewUrl);
        job.urlMap.set(a.url, rel);
        try {
          job.zip.file(rel, base64ToUint8Array(a.base64));
          job.assetCount++;
        } catch (e) {
          job.errors.push('zip ' + a.url + ': ' + e.message);
        }
      });

      finalizeZip(job).then(function (blob) {
        clearTimeout(job.timeout);
        if (job.resolve) job.resolve(blob);
        JOBS.delete(jobId);
      }).catch(function (err) {
        clearTimeout(job.timeout);
        if (job.reject) job.reject(err);
        JOBS.delete(jobId);
      });
      break;
    }

    case 'error':
      clearTimeout(job.timeout);
      if (job.reject) job.reject(new Error(msg.message));
      cleanupJob(jobId, false);
      break;
  }
}

async function finalizeZip(job) {
  // 1. Rewrite URLs in HTML so all absolute refs are relative to local files
  let html = job.html || '<html></html>';

  // Ensure our URL map contains the origin itself (so "/" etc resolve correctly)
  try {
    const origin = new URL(job.originalHref || job.previewUrl).origin;
    job.urlMap.set(origin + '/', './');
    job.urlMap.set(origin, './');
  } catch (_) {}

  // We need to additionally re-parse HTML to find inline module script static imports
  // The extractor already collects those URLs into assets, so they are in urlMap;
  // rewrite will take care of their string forms.
  html = rewriteUrlsInText(html, job.urlMap);

  // If stripJs is requested we also strip <script> tags ourselves (safety net in case
  // the page added scripts after DOMContentLoaded).
  if (job.opts.stripJs) {
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    html = html.replace(/<link[^>]+rel=["']?(?:modulepreload|preload)["']?[^>]*>/gi, function (m) {
      return /as=["']?script["']?/i.test(m) ? '' : m;
    });
  }

  // Add a small README
  const readme = [
    '# Framer Live Preview Export',
    '',
    'Exported from: ' + (job.originalHref || job.previewUrl),
    'Exported at: ' + new Date().toISOString(),
    'Asset count: ' + job.assetCount,
    '',
    '## To view locally',
    '',
    'Because Framer sites use ES Modules, you must serve this folder over HTTP',
    '(opening index.html directly via file:// will be blocked by browser CORS).',
    '',
    '  npx serve .',
    '  # or',
    '  python3 -m http.server 8000',
    '',
    'Then open http://localhost:3000 (or :8000).',
    '',
    job.errors.length ? ('\n## Errors during export:\n' + job.errors.slice(0, 20).join('\n')) : ''
  ].join('\n');
  job.zip.file('README.md', readme);
  job.zip.file('index.html', html);

  // Generate zip
  const blob = await job.zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  }, function (metadata) {
    broadcast({
      type: 'export-progress',
      jobId: job.id,
      status: 'zipping',
      message: 'Packing ZIP... ' + Math.round(metadata.percent) + '%',
      done: Math.round(metadata.percent),
      total: 100
    });
  });
  broadcast({ type: 'export-progress', jobId: job.id, status: 'done', message: 'Export complete! Starting download...' });
  return blob;
}

function broadcast(msg) {
  chrome.tabs.query({ url: 'https://www.framer.com/*' }, function (tabs) {
    (tabs || []).forEach(function (t) {
      chrome.tabs.sendMessage(t.id, msg).catch(() => {});
    });
  });
}

// Handle install / update
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    // seed default settings if missing
    loadSettings().then(function (s) { saveSettings(s); });
  }
});
