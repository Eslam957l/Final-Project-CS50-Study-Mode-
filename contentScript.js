// contentScript.js
// Applies Study Mode on any page: CSS injection + dynamic DOM hiding + per-site overrides.

const STORAGE_KEY = "studyModeSettingsV1";
const STYLE_ID = "study-mode-focus-shield-style";
const OBSERVER_ATTR = "data-study-hidden";
const PREV_DISPLAY_ATTR = "data-study-prev-display";

const DEFAULTS = {
  global: {
    enabled: true,
    hideAds: true,
    hideComments: false,
    themeEnabled: true,
    saturation: 0.85,
    contrast: 1.08
  },
  sites: {}
};

// ---- Heuristic selectors (kept conservative to reduce false positives) ----
const AD_CSS_SELECTORS = [
  // Common ad containers by naming
  '[id^="ad" i]',
  '[id*="-ad" i]',
  '[id*="_ad" i]',
  '[id*=" ad" i]',
  '[class^="ad" i]',
  '[class*="-ad" i]',
  '[class*="_ad" i]',
  '[class*=" ad" i]',

  // "Sponsored / promoted" markers
  '[id*="sponsor" i]',
  '[class*="sponsor" i]',
  '[id*="promoted" i]',
  '[class*="promoted" i]',
  '[id*="advert" i]',
  '[class*="advert" i]',

  // Google ads / common ad widgets
  ".adsbygoogle",
  'iframe[id*="google_ads" i]',
  'iframe[src*="doubleclick" i]'
];

const COMMENT_CSS_SELECTORS = [
  "#comments",
  '[id*="comment" i]',
  '[class*="comment" i]',
  "#disqus_thread",
  '[class*="disqus" i]',
  '[data-testid*="comment" i]',
  '[data-test*="comment" i]'
];

const AD_DYNAMIC_SELECTORS = [
  '[aria-label*="sponsored" i]',
  '[aria-label*="promoted" i]',
  '[data-ad]',
  '[data-ads]',
  '[data-ad-slot]',
  '[data-adunit]',
  'a[href*="doubleclick" i]',
  'iframe[src*="doubleclick" i]'
];

const COMMENT_DYNAMIC_SELECTORS = [
  "#comments",
  "#disqus_thread",
  '[data-testid*="comment" i]',
  '[data-test*="comment" i]'
];

// ---- Utilities ----
function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && base?.[k] && typeof base[k] === "object") {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function storageGet(key) {
  return new Promise((resolve) => chrome.storage.local.get([key], (res) => resolve(res[key])));
}

function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function hostnameKey() {
  try {
    return window.location.hostname || "";
  } catch {
    return "";
  }
}

async function getAllSettings() {
  const current = (await storageGet(STORAGE_KEY)) || null;
  if (!current) {
    await storageSet({ [STORAGE_KEY]: DEFAULTS });
    return DEFAULTS;
  }
  // Merge missing defaults (future-proof)
  const merged = deepMerge(DEFAULTS, current);
  if (JSON.stringify(merged) !== JSON.stringify(current)) {
    await storageSet({ [STORAGE_KEY]: merged });
  }
  return merged;
}

function computeEffective(settings, host) {
  const g = settings?.global || DEFAULTS.global;
  const site = settings?.sites?.[host];
  const effective = { ...g, ...(site || {}) };

  // sanitize
  effective.enabled = Boolean(effective.enabled);
  effective.hideAds = Boolean(effective.hideAds);
  effective.hideComments = Boolean(effective.hideComments);
  effective.themeEnabled = Boolean(effective.themeEnabled);
  effective.saturation = clamp(effective.saturation, 0.3, 1.3);
  effective.contrast = clamp(effective.contrast, 0.8, 1.4);

  return { effective, hasSiteOverride: Boolean(site) };
}

function ensureStyleEl() {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    el.type = "text/css";
    document.documentElement.appendChild(el);
  }
  return el;
}

function removeStyleEl() {
  const el = document.getElementById(STYLE_ID);
  if (el) el.remove();
}

function buildCss(effective) {
  if (!effective.enabled) return "";

  let css = "";

  if (effective.themeEnabled) {
    const sat = effective.saturation;
    const con = effective.contrast;

    css += `
/* ---- Study Theme ---- */
:root { color-scheme: dark; }
html {
  filter: saturate(${sat}) contrast(${con});
}
body {
  background: #0b1220 !important;
  color: #e5e7eb !important;
}
a { color: #93c5fd !important; }
img, video { filter: saturate(1.03) contrast(1.03); }

/* Reduce annoying motion (best-effort) */
*, *::before, *::after {
  scroll-behavior: auto !important;
  transition-duration: 0.01ms !important;
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
}
`;
  }

  if (effective.hideAds) {
    css += `
/* ---- Hide Ads (heuristics) ---- */
${AD_CSS_SELECTORS.join(",\n")} {
  display: none !important;
  visibility: hidden !important;
}
`;
  }

  if (effective.hideComments) {
    css += `
/* ---- Hide Comments (heuristics) ---- */
${COMMENT_CSS_SELECTORS.join(",\n")} {
  display: none !important;
  visibility: hidden !important;
}
`;
  }

  return css;
}

function hideEl(el) {
  if (!el || el.nodeType !== 1) return;
  if (el.getAttribute(OBSERVER_ATTR) === "1") return;

  const prev = el.style.display ?? "";
  el.setAttribute(PREV_DISPLAY_ATTR, prev);
  el.style.display = "none";
  el.setAttribute(OBSERVER_ATTR, "1");
}

function restoreHiddenEls() {
  const hidden = document.querySelectorAll(`[${OBSERVER_ATTR}="1"]`);
  hidden.forEach((el) => {
    const prev = el.getAttribute(PREV_DISPLAY_ATTR);
    el.style.display = prev || "";
    el.removeAttribute(OBSERVER_ATTR);
    el.removeAttribute(PREV_DISPLAY_ATTR);
  });
}

function bestContainer(el) {
  // Hide a slightly higher container to avoid leaving blank "Sponsored" labels floating.
  // Keep it conservative (at most 3 parents).
  let cur = el;
  for (let i = 0; i < 3; i++) {
    if (!cur?.parentElement) break;
    const p = cur.parentElement;

    const tag = (p.tagName || "").toLowerCase();
    const role = (p.getAttribute("role") || "").toLowerCase();
    const cls = (p.className || "").toString().toLowerCase();

    if (role.includes("banner") || cls.includes("ad") || cls.includes("sponsor") || tag === "aside") {
      cur = p;
      break;
    }
    cur = p;
  }
  return cur;
}

function applyDynamicHides(effective) {
  if (!effective.enabled) return;

  if (effective.hideAds) {
    for (const sel of AD_DYNAMIC_SELECTORS) {
      document.querySelectorAll(sel).forEach((el) => hideEl(bestContainer(el)));
    }
  }

  if (effective.hideComments) {
    for (const sel of COMMENT_DYNAMIC_SELECTORS) {
      document.querySelectorAll(sel).forEach((el) => hideEl(bestContainer(el)));
    }
  }
}

function throttle(fn, waitMs) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    const remaining = waitMs - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
}

let observer = null;
let currentEffective = null;

function startObserver() {
  if (observer) return;
  const tick = throttle(() => {
    if (currentEffective?.enabled) applyDynamicHides(currentEffective);
  }, 250);

  observer = new MutationObserver(() => tick());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function stopObserver() {
  if (!observer) return;
  observer.disconnect();
  observer = null;
}

async function applyFromStorage() {
  const host = hostnameKey();
  const settings = await getAllSettings();
  const { effective } = computeEffective(settings, host);
  currentEffective = effective;

  if (!effective.enabled) {
    removeStyleEl();
    stopObserver();
    restoreHiddenEls();
    return;
  }

  const css = buildCss(effective);
  const styleEl = ensureStyleEl();
  styleEl.textContent = css;

  applyDynamicHides(effective);
  startObserver();
}

// Initial apply
applyFromStorage().catch(() => {});

// Messages from popup/options
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return;

    if (msg.type === "RELOAD_SETTINGS") {
      await applyFromStorage();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "GET_CONTEXT") {
      const host = hostnameKey();
      const settings = await getAllSettings();
      const { effective, hasSiteOverride } = computeEffective(settings, host);
      sendResponse({
        ok: true,
        hostname: host,
        effective,
        hasSiteOverride
      });
      return;
    }
  })()
    .then(() => true)
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));

  return true;
});


// with help chat gpt 
