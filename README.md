# Study Mode
## Video Demo:
[Watch on YouTube](https://youtu.be/qAvPq9HY8Uw)
#### Description:


# Study Mode — CS50 Final Project

## Introduction
Study Mode is a Chrome extension whose goal is to reduce distractions while studying or reading online. Many websites today are full of attention-grabbing elements: endless comment sections, ad spaces, pop-ups, and intense colors that increase visual fatigue. The extension provides a “study mode” that you can enable or disable quickly from a small Popup. When enabled, it applies an eye-friendly theme (reduced saturation and increased contrast) and hides common ad and comment patterns. Most importantly, it saves user preferences: global settings that apply to all websites, and per-site settings (per-site overrides) when the user needs different behavior on a specific domain.

## The Problem This Project Solves
The main problem is “frequent breaks in focus” while reading or consuming educational content. Even if the goal is to follow a lesson or an article, comments, ad banners, and constant page changes pull the user away from the primary task. Study Mode focuses on a practical, easy-to-measure solution in a demo: one click produces an immediate “before/after” on the same page, with adjustable effects based on user preference—without unnecessary complexity.

## Main Features
1) Enable/Disable: an Enabled toggle to turn study mode on or off.
2) Hide ads (Heuristics): hides common ad-like elements using CSS selectors and general patterns (such as common class/id names and some ad iframes).
3) Hide comments: hides common comment sections like `#comments` and Disqus, plus frequent naming patterns in elements.
4) Study Theme: a simple study theme using CSS filters to control Saturation and Contrast, adjustable from the UI.
5) Save settings: settings are stored in `chrome.storage.local`, so they persist after restarting the browser.
6) Per-site settings: a “Use custom settings for this site” option to create an override for the current domain, with a “Reset site settings” button to remove that site override.
7) Options page: an advanced settings page to edit global defaults and manage the list of site overrides, with JSON export/import.

## How to Run (Installation / Run)
1) Open Chrome and go to: `chrome://extensions`
2) Enable Developer mode.
3) Click Load unpacked.
4) Select the project folder that contains `manifest.json` (e.g., `study-mode-extension/`).
5) Open any normal website, then click the extension icon in the toolbar to open the control popup.
Note: Chrome restricts running content scripts on certain pages such as `chrome://...` or the Chrome Web Store, so the extension may show “unsupported” behavior on those pages.

## Design and How It Works
The extension is built with Chrome Extensions Manifest V3 and consists of three main parts:
- `contentScript.js`: runs inside web pages. It loads settings from storage, then computes “effective settings” by merging global settings with the current domain’s overrides (if any). It injects a `<style>` element into the page to apply the theme and hide elements via CSS selectors. In addition, it applies extra programmatic hiding for some elements (such as Sponsored/Promoted markers) and marks hidden nodes with `data-study-hidden` so they can be restored when disabled. Because many modern sites add content after load (infinite scroll or SPA), it uses a `MutationObserver` to watch DOM changes and re-apply hiding, with throttling to reduce overhead.
- `popup.js` + `popup.html`: the quick control UI. When opened, the popup asks the content script for page context (hostname and effective settings). Any user change is saved to storage and then a `RELOAD_SETTINGS` message is sent to the active tab so the content script re-applies everything immediately without requiring a page reload.
- `options.js` + `options.html`: a settings management UI. It lets the user edit global defaults, shows a list of sites with overrides (with delete buttons), and provides JSON export/import for backup or transfer.

## File Overview
- `manifest.json`: defines the extension, permissions, and connects the popup, options page, and content script.
- `background.js`: a simple service worker to ensure default settings exist on installation and to provide helper messages.
- `contentScript.js`: the core of the project (CSS injection + DOM heuristics + MutationObserver + settings merge).
- `popup.html / popup.css / popup.js`: the popup UI and settings updates.
- `options.html / options.css / options.js`: advanced settings management, listing per-site overrides, and JSON export/import.

## Testing and Verification
The project is designed for easy “before/after” testing. It’s recommended to try the extension on:
- a news site or blog: to observe hiding common ad-like blocks and sidebars.
- a site with a visible comment section: to confirm Hide comments works.
- a simple site like Wikipedia: to measure the theme effect and verify settings persistence.
Important checks: (1) settings persist after refresh, (2) create per-site settings then open another site to confirm global settings still apply, (3) scroll down on a dynamic page to ensure the MutationObserver continues hiding newly loaded elements.

## Limitations
Ad hiding here is heuristic-based, not a full ad blocker. The goal is to reduce distractions using general patterns without the complexity of filter lists or network interception. Therefore, some sites may not be fully affected, or some ad-like elements might still appear. The selectors were kept conservative to reduce accidental hiding of useful content.

## Future Improvements
Possible future work includes adding a keyboard shortcut to toggle mode quickly, supporting whitelist/blacklist, allowing user-defined CSS selectors per site, or adding a lightweight Pomodoro timer in the popup. Accuracy can also be improved by adding site-specific rules for well-known websites while maintaining the “works anywhere” behavior.

## Info
Name: Islam Hassan
CS50 Final Project — Study Mode
