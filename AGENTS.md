# AGENTS.md: Technical Specification - Tokyo-Vim Zola Theme

## Project Overview

This document serves as the definitive technical specification for the development and maintenance of the "Tokyo-Vim" Zola theme. The project is a high-fidelity Terminal User Interface (TUI) implementation designed for an AI Engineer's portfolio and blog.

The core objective is to transform the web experience from a traditional "widget-based" website into a professional, optimized terminal environment. The aesthetic must mimic a modern Neovim configuration (specifically `kickstart.vim`) using the Tokyo Night color palette. The primary user experience focus is the seamless, high-performance reading of Markdown content as if it were being viewed directly within a Vim buffer.

---

## 1. Visual Identity and Aesthetic

### 1.1 Core Concept

The UI must avoid modern web "widget" aesthetics (rounded corners, heavy drop shadows, or thick window frames). Instead, it should utilize a flat, character-based rendering style characteristic of a terminal emulator.

### 1.2 Chromatic Palette

Strict adherence to the [tokyonight.nvim](https://github.com/folke/tokyonight.nvim) specification is required for the **default** palette. The site supports several terminal color themes, but they are **owner-configured only** — visitors cannot switch the palette.

- **Color Themes:** The active palette family is selected in `zola.toml` via `config.extra.theme` (default `tokyo-night`; also `gruvbox`, `catppuccin`, `solarized`). It renders as `data-color-theme` on `<html>` and is never modified by client JavaScript, so readers cannot change it — only the site owner can, by editing the config and rebuilding.
- **Dark Mode (Default):** `night` variant of the active theme.
- **Light Mode:** `day` / light variant of the active theme.
- **Brightness Toggle:** Must support system-level preference detection and manual user toggles via a minimal statusline button. This switches the *brightness* (`data-theme` dark/light) **within** the selected color theme, not the palette family.

### 1.3 Typography and Glyphs

- **Font Family:** All text, including UI elements and metadata, must use a **Nerd Font** (JetBrainsMono Nerd Font, self-hosted as TTF in `static/fonts/`).
- **Iconography:** Unicode glyphs preferred over Nerd Font PUA symbols for clarity (`›`, `│`, `◆`, `▭`, `▬`, `☾`, `☀`, `▰`, `≡`, `⏱`, `↻`, `↑`, `‹`).

### 1.4 Structural Elements

- **ASCII Border Rendering:** Containers, panels, and interactive areas must use 1px CSS borders (no box-shadow, no border-radius). Box-drawing Unicode chars are NOT used to draw borders or as chip connectors.
- **TUI Floating Window Style:** Each `.tui-panel` is rendered as a Vim floating buffer window:
  ```
  ┌─────────────────────────────────────────────────┐
  │  [ TITLE ]                                      │
  │                                                  │
  │  body content                                    │
  │                                                  │
  └──────────────────────────[ VIEW ALL POSTS ]──────┘
  ```
  - The **panel body** (`.tui-panel__body`) is fully transparent — panels read as "just borders", letting the page background show through.
  - The **chip backgrounds** (`.tui-panel__head`, `.tui-panel__foot`) are painted with `var(--surface)` so the border line is masked by the chip's own text region. Without this opaque fill, the 1px border bleeds through the chip text as horizontal strikethrough lines.
  - Chip geometry lives on `:root`:
    - `--chip-h: 22px` — vertical chip height (controls `top` / `bottom` offset so the chip's centrelines land exactly on the panel's top/bottom 1px border).
  - Both `.tui-panel__head` and `.tui-panel__foot` are positioned `left: 16px` / `right: 16px` respectively (offset from the panel edge) with compact `padding: 0 8px`. No pseudo-element arms or connector characters — the chip simply masks the border underneath with its opaque background.
  - Border colour uses `--border-strong` (a brighter `--text-muted`) so panels feel more prominent than the muted dividers used inside lists.
  - The **bottom border** uses `.tui-panel__foot`, with two alignment variants sharing the same geometry:
    - `.tui-panel__foot` (default, centered) — general purpose centered chip
    - `.tui-panel__foot--right` — right-aligned (pagination, action buttons like `[ VIEW ALL POSTS ]`, `[ BACK ]`, …). All panels now consistently use `--right` for footer actions, including blog pagination. Buttons inside the foot chip are borderless (no `.terminal-btn` border) with green hover colour.
- **Bracket Convention:** All interactive segments (nav items, controls, buttons) wrap content in `[ ]` for visual consistency. Active states use a brighter (green) bracket colour rather than underlines.

### 1.5 Statusline Architecture

The header (`.vim-statusline`) and footer (`.vim-winbar`) function as Vim `statusline` and `winbar` components. Each segment displays real, functional metadata rather than decoration. Both bars share the same height (`--bar-h`), font-size (`--bar-font-size`), padding (`--bar-pad-x`), and icon-size (`--bar-icon-size`) for visual consistency.

Statusline layout (left → right):

```
◆~/blog/first-post │[ home ] [blog] [projects] [cv] [contact]           │[▭ CENTERED][☾ DARK]
```

Three flex segments:

1. **PATH** — `.status-path` leftmost, accent (blue) background with dark text + `◆` glyph. Never shrinks. Always shows its path text on every breakpoint.
2. **NAV TABS** — `.status-nav` is `display:flex` and horizontally scrollable (`overflow-x: auto, scrollbar-width: none`). Active tab uses solid bg + accent text + green brackets. No underlines.
3. **CONTROLS** — `.status-controls` right-pinned. `[▭ CENTERED]` and `[☾ DARK]` always rendered, each bracket-wrapped; state persists in `localStorage`. May include `[▰ ES]` language badge for non-English pages.

- On screens `≤900px`, the main `.status-nav` collapses into a CSS-only `<details class="nav-hamburger">`. The summary chip `[ ☰ menu ]` (× icon when open) takes its place in the bar. **The hamburger dropdown carries navigation links only** — neither the layout toggle nor the theme toggle appears inside it. The layout toggle is `display: none` at this breakpoint (full-width and centered are visually identical at single-column width, so the switch is meaningless on mobile). The theme toggle keeps its icon+text on the horizontal bar (rightmost cell) on every breakpoint. The hamburger `summary` and its `×` / `☰` icon are locked to fixed dimensions so opening/closing the menu never enlarges the bar.
- A `?menu=open` (or `?nav=open`) URL flag auto-opens the hamburger on load — useful for deep-linking screenshots.

Winbar layout (left → right):

```
[≡ 320 words] [⏱ 2 min] [↻ updated 2026-07-02] │ [↑ Top] [‹ home]
```

- `≡` word count, `⏱` read time (220 wpm), `↻` last-updated date.
- The `↻ updated …` value is **always the site's last build time** (labelled "site"). It deliberately does not show a page's frontmatter `date` — see §3.5.
- `↑ top` anchor (returns to page start). `‹ home` link always returns to root.

---

## 2. Functional Requirements

### 2.1 Content Rendering

- **Markdown Fidelity:** Blog posts render to feel like a `.md` buffer in Vim.
- **Heading Logic:** Headings are prepended with their respective Markdown depth indicators (`#`, `##`, `###` …) in green to reinforce the terminal environment.
- **LaTeX Support:** KaTeX is loaded conditionally when `page.extra.math` is set, so technical AI/mathematical posts render equations inline.

### 2.2 Layout Modes

The user toggles between two distinct viewing modes via the `[▭ CENTERED] ↔ [▬ FULL]` control:

- **Centered Mode:** A fixed-width, optimized column (`--max-width-centered: 920px`) for long-form reading.
- **Full-Width Mode:** The full viewport (`--max-width-full: 100%`) for high-density data.

Both states are persisted in `localStorage` under `layout` and applied pre-paint via `static/js/prepaint.js` (synchronous `<head>` include) to avoid FOUC. The post-paint interactive logic (toggle handlers, scroll tracking, word count, tag filter) lives in `static/js/main.js` — loaded with a plain `<script src>` at the end of `<body>`. No inline JavaScript.

### 2.3 Localization (i18n)

- The site is **English-language by default**. There is no multi-language URL routing, no translation switcher UI, and no parallel content directories per language.
- **Spanish posts are supported** as a tagging mechanism: any post whose frontmatter includes `extra.lang = "es"` renders Spanish content with a visible `[▰ ES]` badge in the statusline. The `<html lang>` attribute reflects the per-post language for screen-reader and SEO correctness, but all UI chrome and default copy stays English.
- Translation strings (UI labels like `nav_home`, `latest_posts`, `view_all_posts`, etc.) live in `[extra]` of `zola.toml` for future i18n, but a user-facing language switcher is explicitly out of scope.

---

## 3. Technical Standards

### 3.1 Codebase Structure

CSS partials (in `sass/`) are imported in this order by `style.scss`:

1. **variables** — Tokyo Night tokens (including `--page-bg` for the outer page/desktop surface, `--bar-*` tokens for statusline/winbar dimensions) + self-hosted `@font-face` for JetBrainsMono Nerd Font, scoped via `:root` / `[data-theme="light"]`.
2. **base** — global reset, body typography (`background-color: var(--page-bg)`), links, selection, scrollbars. No global transition wildcards.
3. **window** — `.terminal-container` (uses `--page-bg`), `.terminal-window` (uses `--surface`), `.vim-statusline`, `.vim-winbar` (both use `--bar-*` tokens for unified sizing), `<main class="window-body">`, layout modes, responsive breakpoints.
4. **boxes** — `.tui-panel`, `.tui-panel__head`, `.tui-panel__body`, `.tui-panel__foot` (centered) / `--right`, `.grid-two-cols`.
5. **navigation** — `.terminal-btn`, `.terminal-link`, `.item-tag`, `.terminal-list`, `.list-item`, `.item-lang-badge`, tag filter, print-btn-row, welcome panel content, dividers.
6. **markdown** — `.markdown-content`, `.page-meta`, heading decorations, code/pre styling, tables, blockquotes, KaTeX.
7. **print** — overrides for CV/document PDF export (always imported last).

Templates compile from `templates/`:

- **base.html** — `<head>` (meta, pre-paint script, KaTeX on demand), `.vim-statusline`, `.window-body`, `.vim-winbar`, `main.js` (theme/layout toggle, scroll, word count, tag filter, print button).
- **index.html**, **page.html**, **section.html**, **taxonomy_single.html**, **taxonomy_list.html** — call into `base.html` blocks.
- **partials/winbar.html** — single winbar component; updated date always from build timestamp (no per-page date branching). - **partials/tag_filter.html** — shared tag filter component.

### 3.2 Code Quality and Architecture

- **Minimalism:** Implement the minimum amount of code necessary to achieve the desired effect. Avoid heavy JavaScript frameworks or unnecessary dependencies.
- **Clean Code:** The codebase is modular, organized, and follows DRY principles for CSS and Zola templates. Print rules and live styles are kept in separate partials; partials for dead code (`.crt.scss`, `.lists.scss`) have been removed. No inline JavaScript — all logic lives in `static/js/prepaint.js` (FOUC prevention, synchronous `<head>`) and `static/js/main.js` (post-DOM interactive logic, end-of-body).
- **Efficiency:** Prioritize minimal DOM depth and optimized CSS selectors for rapid rendering.

### 3.3 SEO and Performance

- **SEO Optimization:** All pages use semantic HTML5 elements (`<main>`, `<article>`, `<nav>`, `<header>`, `<footer>`). Sitemap and robots.txt are generated automatically. `<html lang>`, `<title>`, `<meta description>`, Open Graph and Twitter Card tags are populated per page. Article pages include `article:published_time` and `article:author` OG meta.
- **Performance:** As a static site (Zola), the primary metric is Time to Interactive (TTI) and First Contentful Paint (FCP). All assets are optimized for high-speed delivery; fonts self-hosted as TTF.

### 3.4 Compliance

- All third-party fonts, icons, and libraries used are open-source and compliant with their respective licenses (MIT, Apache, etc.). KaTeX is loaded from jsDelivr's npm bundle.

### 3.5 Build Timestamp Injection

Zola's Tera does **not** expose a built-in `now()` function, so the
site's last-built timestamp is injected via a pre-build side-channel:

- `scripts/build.sh` writes `data/build.toml` (re-generated on every
  invocation) containing three fields:
  - `iso`   — UTC ISO-8601 stamp (e.g. `2026-07-01T17:12:22Z`)
  - `human` — ISO-8601 date stamp (e.g. `2026-07-02`)
  - `unix`  — unix epoch seconds
- `templates/base.html` loads it via
  `{% set build_data = load_data(path="data/build.toml", format="toml") %}`
  and exposes `{{ site_updated_label }}` (= `human`) for the winbar.
- Always run `./scripts/build.sh build` (or the same with `serve`)
  rather than invoking `zola build` directly, so the timestamp stays in
  sync with each deploy.

Usage in the winbar: the `↻ updated …` slot **always** shows the site's last
build time (`site_updated_label`, = `human`). It intentionally does **not**
fall back to a page's `date` — the winbar is a footer that describes the whole
site's freshness, so per-page dates would be misleading on list/section/taxonomy
pages. CV pages and any other static page therefore get a meaningful
"site-updated" reading instead of an empty slot. (Per-post dates are shown in
the article header via `page.html`'s `page-meta` block, not in the winbar.)

### 3.6.1 Code Maintainability

Whenever touching existing code, prefer leaving it **more** maintainable than
you found it. Concretely:
- Factor long inline blocks into named helpers; one responsibility each.
- Delete dead/abandoned variable initializations and unreachable branches
  (e.g. a half-finished GSAP timeline immediately followed by `.kill()` and
  a restart — write the final version, not both).
- Hoist duplicated magic numbers (cell gap, bar height, palette tokens,
  durations) into a single named constant block at the top of the module.
- Keep the module shape of each script consistent with its neighbours. The
  global scripts (`prepaint.js`, `main.js`) are plain scripts; the chart is a
  set of native ES modules under `static/js/gh-chart/` (no bundler). Do not
  mix the two styles.
- When a function accumulates more than ~3 levels of nesting, extract.
- Comments only when they earn their keep — never restate code.

### 3.7 GitHub Contributions Chart (homepage)

A 3D isometric contribution graph rendered with **Three.js** (`InstancedMesh`
of `BoxGeometry` + a `MeshStandardMaterial` whose `emissive` is driven per
theme) and **GSAP** (staggered entrance wave + theme-switch replay). Lives on
the homepage inside a standard `.tui-panel`, sitting between the
`[ WELCOME ]` banner and the two-column `grid-two-cols`.

Build-time data path:

- `scripts/fetch_github_contributions.mjs` queries the GitHub GraphQL API
  (token read from `.env` `GITHUB_TOKEN`, user defaults to `alainux`) and
  writes a compact `data/github_contributions.json` with the four
  contribution levels (`level` ∈ 0..4) plus totals. It **soft-fails** (exit
  0) on a missing token or network error so `zola build` never breaks.
- `scripts/build.sh` invokes the fetcher *before* `zola build`/`serve`, so
  every build refreshes the data alongside the timestamp in
  `data/build.toml`.
- `templates/partials/github_contributions.html` `load_data`s that JSON,
  guards the whole section on its presence (`{% if gh %}`), emits a
  `<script type="application/json" id="gh-contrib-data">` blob, then a
  `<script type="module">` for `static/js/contrib-chart.js`.

Runtime:

- `static/js/contrib-chart.js` is a thin entrypoint that imports and runs
  `initContribChart()` (it bails until `DOMContentLoaded` if needed). It is
  loaded only on the homepage (no global weight). The implementation is split
  into focused ES modules under `static/js/gh-chart/`:
  - `config.js` — geometry + motion constants and tunables.
  - `data.js` — normalises the raw `{ weeks: [...] }` payload into the flat
    `cells` array + the count range used for colour mapping.
  - `theme.js` — maps the site's semantic CSS custom properties to the
    Three.js colour set (follows light/dark switching).
  - `scene.js` — owns the Three.js scene graph (renderer, camera, lights,
    floor grids, instanced bars + Tron edges, today marker, month labels).
  - `chart.js` — the orchestrator: entrance + render loops, hover/tooltip,
    resize, auto-rotate pausing, and live theme switching.
  All modules lazy-import `three@0.169.0` + `gsap@3.12.5` from `esm.sh`
  (same module-graph philosophy as the KaTeX CDN include — no npm/bundler).
  The chart renders to `#gh-contrib-canvas` inside `.gh-chart-stage`, exposes
  a legend swatch row, and supports `OrbitControls` drag-to-rotate with
  auto-rotate that pauses 4s after interaction.
- Theme is honoured by reading Tokyo-Night CSS variables off `:root` via
  `getComputedStyle`. A `MutationObserver` on `document.documentElement`
  watches `data-theme` and recomputes every instance colour + the grid
  helper, then replays the entrance animation so the bar高三 swaps
  visibly.
- A CSS partial `sass/_github_chart.scss` (imported between `boxes` and
  `navigation` in `sass/style.scss`) styles the canvas + legend swatches
  and includes light-theme overrides.
- `prefers-reduced-motion` users get a shorter static-friendly canvas
  height; `ResizeObserver` keeps the aspect correct across the centered /
  full layout toggle.

### 3.8 Display, Print & Accessibility Principles

The theme targets three distinct rendering contexts that must each be
handled deliberately: the **live terminal** (screen), the **printed / PDF
page**, and **browser Reading Mode / distilled views**. Follow these
principles whenever touching styles or templates:

- **One palette, scoped by context.** Every colour is a CSS custom
  property on `:root`, with a `[data-theme="light"]` override block. Any
  surface that paints must reference a token — never a literal hex. This
  single rule is what makes theme switching *and* the print reset possible
  (`sass/_variables.scss`).
- **Hover / motion stay restrained.** Interactive panels use a single
  `.tui-panel__glare` layer whose intensity is governed by
  `--glare-strong` / `--glare-soft` (low alpha) with a slow `~0.4s` fade;
  the hover border uses `--panel-hover-border` (a soft blue), not a loud
  accent. Avoid bright full-opacity gradients or fast, jarring
  transitions.
- **Print is a token reset, not a rewrite.** `@media print` in
  `sass/_print.scss` re-declares the palette tokens on `:root` to a light
  scheme (`--bg:#fff`, `--md-code-*` to readable greys, etc.) so every
  `var(...)` surface repaints light instead of leaking the dark terminal
  colours. Do **not** hand-paint each element — when a new token is added,
  extend the token reset rather than adding a one-off print override.
- **Print chrome is structural, not decorative.** TUI borders are
  `border:none` in print: a 1px frame repeats on every page fragment of a
  long article and sits flush against the (zero-padded) body. Panel titles
  are promoted to real `h2` headings; the 3D GitHub chart, footer actions
  and glare layer are hidden. List bleed is neutralized
  (`.terminal-list { margin: 0 }`) so Blog / Projects indexes don't shift
  into the page margin.
- **Chips & links print sober.** `.item-tag` / `.item-lang-badge` drop
  their dashed colour border / uppercase and render as plain muted text.
  Markdown links drop the `[ ]` TUI bracket `::before` / `::after`
  decoration (`content:none`) so they read as plain text, never as a
  dangling `[`.
- **Reading Mode / a11y is separate from the screen.** Content meant only
  for Reading Mode or assistive tech is marked `sr-only` (visually hidden
  via `clip`, present in the a11y tree). Because Reading Mode strips author
  CSS, an `sr-only` element re-emerges as plain text there. The math
  warning (`.math-note`, gated on `page.extra.math`) uses exactly this:
  hidden on the live site, announced to screen readers, visible in Reading
  Mode, and `display:none` in print where KaTeX renders correctly.
- **Print styles have a single owner.** All print rules live in
  `_print.scss` (imported last). There must be no stray `@media print`
  block in another partial (the old one in `_boxes.scss` was removed) —
  keep print concerns in one place.
