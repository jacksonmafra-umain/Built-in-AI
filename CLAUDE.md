# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency-free static page that demos Chrome's built-in **Prompt API** (Gemini Nano on-device) for a team
walkthrough. No build step, no package.json, no tests, no linter. It is deployed as static files on GitHub Pages
(`.nojekyll` is there so Pages serves the files as they are).

## Running

ES modules need HTTP, not `file://`:

```sh
python3 -m http.server 8000   # or: npx serve .
```

To verify changes you need desktop Chrome 138+ with Gemini Nano available (flags
`chrome://flags/#prompt-api-for-gemini-nano` and `#optimization-guide-on-device-model`; model state at
`chrome://on-device-internals`). The APIs don't exist in other browsers or headless environments, so the page
shows the "not available" status card there.

## Architecture

- `index.html` declares every panel. `js/lib/tabs.js` builds the tab bar from `#panels > [role="tabpanel"]` using
  each panel's `data-title`, so a new tab means adding a panel in the markup, not touching JS.
- `js/main.js` initialises the parts that don't need the model (backdrop, display, HUD, tabs) right away. The
  model-dependent features start only from `initStatus({ onReady(modalities) })`, which runs after availability is
  checked or the model is downloaded. `#panels` stays `inert` until then.
- `js/features/chat.js` is the core. `initChat()` returns a controller (`state`, `load`, `ensureSession`,
  `onChange`, `addContentProvider`) that the other features (attachments, context meter, compacting, sessions,
  speech output) build on, instead of reaching into the chat DOM themselves.
  - History is kept as plain text (`{ role, content, attachments }`), so a session can be rebuilt at any time by
    replaying it through `initialPrompts` (`buildInitialPrompts`). Freeing, restoring after a reload and
    compacting all rely on this.
  - Compacting stores `role: 'summary'` entries, which get folded into the system prompt (never evicted on
    context overflow) rather than replayed as turns.
  - Sessions are created lazily with the modalities registered through `addContentProvider`, so content
    providers (image/audio) must register before the first session exists.
- `js/lib/model.js` wraps `LanguageModel`: language declaration (`en` only), per-modality availability, and
  fallbacks for older Chrome property/event names (`inputUsage`/`inputQuota`, `quotaoverflow`). Go through it
  rather than calling `LanguageModel` directly.
- `js/lib/log.js`: every Prompt API call should go through `log()` / `timed()`. The visible API call log is the
  point of the demo, and `log()` also dispatches the `ai:call` window event that the header counters
  (`features/hud.js`) listen to. The chat dispatches `ai:token` per streamed chunk, which drives the HUD and the
  canvas backdrop (`lib/backdrop.js`).
- Persistence is `localStorage` under the `built-in-ai-demo:` prefix (`:sessions`, `:display`). Only text is
  persisted. Native sessions live in memory only.
- Voice (`speech-output.js`, `speech-input.js`) uses the Web Speech API, not Gemini Nano. The UI labels
  `local` vs `network` voices and `cloud` dictation so nobody can mistake them for on-device.

## Conventions

- Vanilla JS modules, 4-space indent, one `initX()` per feature file. Short comments explain *why*, often with
  a link to the Chrome docs.
- The styling is a retro terminal look done in CSS and canvas ASCII only. There are no image assets, so don't
  add any.
- Keep the README's feature table and walkthrough in sync when you add or change a demo feature.
