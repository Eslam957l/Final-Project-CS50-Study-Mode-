// background.js (service worker)

const STORAGE_KEY = "studyModeSettingsV1";

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

async function ensureDefaults() {
  const current = await storageGet(STORAGE_KEY);
  if (!current) {
    await storageSet({ [STORAGE_KEY]: DEFAULTS });
    return;
  }
  // In case of future upgrades, merge missing fields.
  const merged = deepMerge(DEFAULTS, current);
  await storageSet({ [STORAGE_KEY]: merged });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return;

    if (msg.type === "ENSURE_DEFAULTS") {
      await ensureDefaults();
      sendResponse({ ok: true });
      return;
    }

    // Useful: re-apply settings to the sender tab (or active tab) on demand.
    if (msg.type === "PING_APPLY_ACTIVE_TAB") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "RELOAD_SETTINGS" }, () => {
        // Ignore errors for restricted pages.
        sendResponse({ ok: !chrome.runtime.lastError });
      });
      return;
    }
  })()
    .then(() => true)
    .catch((e) => {
      sendResponse({ ok: false, error: String(e?.message || e) });
    });

  return true; // keep the message channel open for async
});

// with sample help chat gpt 
