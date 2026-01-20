// options.js

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
function storageClear() {
  return new Promise((resolve) => chrome.storage.local.clear(resolve));
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

function $(id) {
  return document.getElementById(id);
}

const ui = {
  g_enabled: $("g_enabled"),
  g_hideAds: $("g_hideAds"),
  g_hideComments: $("g_hideComments"),
  g_themeEnabled: $("g_themeEnabled"),
  g_saturation: $("g_saturation"),
  g_contrast: $("g_contrast"),

  saveGlobal: $("saveGlobal"),
  resetAll: $("resetAll"),
  status: $("status"),

  sitesCount: $("sitesCount"),
  sitesList: $("sitesList"),

  exportBtn: $("exportBtn"),
  importFile: $("importFile")
};

let settings = null;

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

function setStatus(msg) {
  ui.status.textContent = msg || "";
}

function renderGlobal() {
  ui.g_enabled.checked = Boolean(settings.global.enabled);
  ui.g_hideAds.checked = Boolean(settings.global.hideAds);
  ui.g_hideComments.checked = Boolean(settings.global.hideComments);
  ui.g_themeEnabled.checked = Boolean(settings.global.themeEnabled);

  ui.g_saturation.value = String(clamp(settings.global.saturation, 0.3, 1.3));
  ui.g_contrast.value = String(clamp(settings.global.contrast, 0.8, 1.4));
}

function renderSites() {
  const sites = settings.sites || {};
  const hosts = Object.keys(sites).sort();

  ui.sitesCount.textContent = `${hosts.length} site override(s).`;
  ui.sitesList.innerHTML = "";

  if (hosts.length === 0) {
    ui.sitesList.innerHTML = `<div class="muted">No per-site overrides yet. (Use the popup on a site and enable “Use custom settings for this site”.)</div>`;
    return;
  }

  for (const host of hosts) {
    const card = document.createElement("div");
    card.className = "siteCard";

    const head = document.createElement("div");
    head.className = "siteHead";

    const title = document.createElement("div");
    title.className = "siteHost";
    title.textContent = host;

    const actions = document.createElement("div");
    actions.className = "siteActions";

    const del = document.createElement("button");
    del.className = "smallBtn";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      delete settings.sites[host];
      await storageSet({ [STORAGE_KEY]: settings });
      setStatus(`Deleted override: ${host}`);
      renderSites();
    });

    const view = document.createElement("button");
    view.className = "smallBtn";
    view.textContent = "View JSON";
    const pre = document.createElement("pre");
    pre.style.display = "none";
    pre.textContent = JSON.stringify(sites[host], null, 2);
    view.addEventListener("click", () => {
      const show = pre.style.display === "none";
      pre.style.display = show ? "block" : "none";
      view.textContent = show ? "Hide JSON" : "View JSON";
    });

    actions.appendChild(view);
    actions.appendChild(del);

    head.appendChild(title);
    head.appendChild(actions);

    card.appendChild(head);
    card.appendChild(pre);
    ui.sitesList.appendChild(card);
  }
}

async function saveGlobal() {
  settings.global.enabled = Boolean(ui.g_enabled.checked);
  settings.global.hideAds = Boolean(ui.g_hideAds.checked);
  settings.global.hideComments = Boolean(ui.g_hideComments.checked);
  settings.global.themeEnabled = Boolean(ui.g_themeEnabled.checked);

  settings.global.saturation = clamp(ui.g_saturation.value, 0.3, 1.3);
  settings.global.contrast = clamp(ui.g_contrast.value, 0.8, 1.4);

  await storageSet({ [STORAGE_KEY]: settings });
  setStatus("Saved global defaults.");
}

function download(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportJson() {
  const s = await getAllSettings();
  download("study-mode-settings.json", JSON.stringify(s, null, 2));
  setStatus("Exported settings JSON.");
}

async function importJson(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    setStatus("Invalid JSON file.");
    return;
  }

  // Merge into defaults to ensure required fields exist.
  settings = deepMerge(DEFAULTS, parsed);
  await storageSet({ [STORAGE_KEY]: settings });

  renderGlobal();
  renderSites();
  setStatus("Imported settings.");
}

async function resetEverything() {
  // Nuke local storage (only extension's area) then restore defaults.
  await storageClear();
  await storageSet({ [STORAGE_KEY]: DEFAULTS });
  settings = await getAllSettings();
  renderGlobal();
  renderSites();
  setStatus("Reset done (restored defaults).");
}

function wire() {
  ui.saveGlobal.addEventListener("click", () => saveGlobal().catch(() => setStatus("Save failed.")));

  ui.resetAll.addEventListener("click", () => {
    const ok = confirm("This will delete ALL global + per-site settings. Continue?");
    if (!ok) return;
    resetEverything().catch(() => setStatus("Reset failed."));
  });

  ui.exportBtn.addEventListener("click", () => exportJson().catch(() => setStatus("Export failed.")));

  ui.importFile.addEventListener("change", async () => {
    const f = ui.importFile.files?.[0];
    ui.importFile.value = "";
    if (!f) return;
    await importJson(f);
  });
}

(async function init() {
  wire();
  settings = await getAllSettings();
  renderGlobal();
  renderSites();
  setStatus("");
})();
