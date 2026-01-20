// popup.js

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

function storageGet(key) {
  return new Promise((resolve) => chrome.storage.local.get([key], (res) => resolve(res[key])));
}
function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

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

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

async function getAllSettings() {
  const current = (await storageGet(STORAGE_KEY)) || null;
  if (!current) {
    await storageSet({ [STORAGE_KEY]: DEFAULTS });
    return DEFAULTS;
  }
  const merged = deepMerge(DEFAULTS, current);
  if (JSON.stringify(merged) !== JSON.stringify(current)) {
    await storageSet({ [STORAGE_KEY]: merged });
  }
  return merged;
}

function computeEffective(settings, hostname) {
  const g = settings?.global || DEFAULTS.global;
  const site = settings?.sites?.[hostname];
  const effective = { ...g, ...(site || {}) };

  effective.enabled = Boolean(effective.enabled);
  effective.hideAds = Boolean(effective.hideAds);
  effective.hideComments = Boolean(effective.hideComments);
  effective.themeEnabled = Boolean(effective.themeEnabled);
  effective.saturation = clamp(effective.saturation, 0.3, 1.3);
  effective.contrast = clamp(effective.contrast, 0.8, 1.4);

  return { effective, hasSiteOverride: Boolean(site) };
}

function sendToActiveTab(message) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (!tab?.id) return resolve({ ok: false, error: "No active tab." });

      chrome.tabs.sendMessage(tab.id, message, (resp) => {
        if (chrome.runtime.lastError) {
          return resolve({ ok: false, error: chrome.runtime.lastError.message });
        }
        resolve(resp || { ok: true });
      });
    });
  });
}

function $(id) {
  return document.getElementById(id);
}

const ui = {
  siteLine: $("siteLine"),
  statusPill: $("statusPill"),
  note: $("note"),

  enabled: $("enabled"),
  hideAds: $("hideAds"),
  hideComments: $("hideComments"),
  themeEnabled: $("themeEnabled"),
  saturation: $("saturation"),
  contrast: $("contrast"),
  satVal: $("satVal"),
  conVal: $("conVal"),

  useSiteOverride: $("useSiteOverride"),
  resetSite: $("resetSite"),
  openOptions: $("openOptions")
};

let hostname = "";
let settings = null;

function renderPill(effective) {
  ui.statusPill.textContent = effective.enabled ? "ON" : "OFF";
  ui.statusPill.style.borderColor = effective.enabled ? "rgba(96,165,250,0.6)" : "rgba(255,255,255,0.15)";
}

function renderControls(effective, hasSiteOverride) {
  ui.enabled.checked = effective.enabled;
  ui.hideAds.checked = effective.hideAds;
  ui.hideComments.checked = effective.hideComments;
  ui.themeEnabled.checked = effective.themeEnabled;

  ui.saturation.value = effective.saturation;
  ui.contrast.value = effective.contrast;
  ui.satVal.textContent = String(effective.saturation);
  ui.conVal.textContent = String(effective.contrast);

  ui.useSiteOverride.checked = hasSiteOverride;
  ui.resetSite.disabled = !hasSiteOverride;

  renderPill(effective);
}

async function applyAndRefresh() {
  // Ask content script to reload settings.
  await sendToActiveTab({ type: "RELOAD_SETTINGS" });
  // Re-fetch context to reflect effective values.
  await loadContext();
}

async function loadContext() {
  ui.note.textContent = "";
  const ctx = await sendToActiveTab({ type: "GET_CONTEXT" });

  if (!ctx?.ok) {
    ui.siteLine.textContent = "This page is not supported (e.g., chrome://).";
    ui.statusPill.textContent = "N/A";
    ui.note.textContent = ctx?.error ? `Error: ${ctx.error}` : "";
    // Disable controls
    for (const k of ["enabled","hideAds","hideComments","themeEnabled","saturation","contrast","useSiteOverride","resetSite"]) {
      ui[k].disabled = true;
    }
    return;
  }

  hostname = ctx.hostname || "";
  ui.siteLine.textContent = hostname ? `Site: ${hostname}` : "Site: (unknown)";
  settings = await getAllSettings();

  const { effective, hasSiteOverride } = computeEffective(settings, hostname);
  renderControls(effective, hasSiteOverride);
}

async function saveSetting(key, value) {
  if (!settings) settings = await getAllSettings();
  if (!settings.sites) settings.sites = {};

  const hasOverride = Boolean(settings.sites[hostname]);
  const shouldUseOverride = ui.useSiteOverride.checked;

  if (shouldUseOverride) {
    if (!settings.sites[hostname]) {
      // Create a full snapshot of current effective settings as a starting point.
      const { effective } = computeEffective(settings, hostname);
      settings.sites[hostname] = { ...effective };
    }
    settings.sites[hostname][key] = value;
  } else {
    // Global change
    settings.global[key] = value;
    // Leave site overrides untouched if any exist.
  }

  await storageSet({ [STORAGE_KEY]: settings });
}

async function toggleSiteOverride(enable) {
  if (!settings) settings = await getAllSettings();
  if (!settings.sites) settings.sites = {};

  if (enable) {
    if (!settings.sites[hostname]) {
      const { effective } = computeEffective(settings, hostname);
      settings.sites[hostname] = { ...effective };
    }
  } else {
    delete settings.sites[hostname];
  }

  await storageSet({ [STORAGE_KEY]: settings });
}

function wire() {
  ui.openOptions.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  ui.enabled.addEventListener("change", async () => {
    await saveSetting("enabled", ui.enabled.checked);
    await applyAndRefresh();
  });

  ui.hideAds.addEventListener("change", async () => {
    await saveSetting("hideAds", ui.hideAds.checked);
    await applyAndRefresh();
  });

  ui.hideComments.addEventListener("change", async () => {
    await saveSetting("hideComments", ui.hideComments.checked);
    await applyAndRefresh();
  });

  ui.themeEnabled.addEventListener("change", async () => {
    await saveSetting("themeEnabled", ui.themeEnabled.checked);
    await applyAndRefresh();
  });

  ui.saturation.addEventListener("input", async () => {
    ui.satVal.textContent = ui.saturation.value;
  });
  ui.saturation.addEventListener("change", async () => {
    await saveSetting("saturation", Number(ui.saturation.value));
    await applyAndRefresh();
  });

  ui.contrast.addEventListener("input", async () => {
    ui.conVal.textContent = ui.contrast.value;
  });
  ui.contrast.addEventListener("change", async () => {
    await saveSetting("contrast", Number(ui.contrast.value));
    await applyAndRefresh();
  });

  ui.useSiteOverride.addEventListener("change", async () => {
    await toggleSiteOverride(ui.useSiteOverride.checked);
    await applyAndRefresh();
  });

  ui.resetSite.addEventListener("click", async () => {
    if (!settings) settings = await getAllSettings();
    if (settings?.sites?.[hostname]) {
      delete settings.sites[hostname];
      await storageSet({ [STORAGE_KEY]: settings });
      ui.note.textContent = "Site settings reset.";
      await applyAndRefresh();
    }
  });
}

(async function init() {
  wire();
  // Make sure defaults exist.
  chrome.runtime.sendMessage({ type: "ENSURE_DEFAULTS" }, () => {});
  await loadContext();
})();


//with help chat gpt
