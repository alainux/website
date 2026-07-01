# AGENTS.md: Technical Specification - Tokyo-Vim Zola Theme

## Project Overview

This document serves as the definitive technical specification for the development and maintenance of the "Tokyo-Vim" Zola theme. The project is a high-fidelity Terminal User Interface (TUI) implementation designed for an AI Engineer's portfolio and blog.

The core objective is to transform the web experience from a traditional "widget-based" website into a professional, optimized terminal environment. The aesthetic must mimic a modern Neovim configuration (specifically `kickstart.vim`) using the Tokyo Night color palette. The primary user experience focus is the seamless, high-performance reading of Markdown content as if it were being viewed directly within a Vim buffer.

---

## 1. Visual Identity and Aesthetic

### 1.1 Core Concept

The UI must avoid modern web "widget" aesthetics (rounded corners, heavy drop shadows, or thick window frames). Instead, it should utilize a flat, character-based rendering style characteristic of a terminal emulator.

### 1.2 Chromatic Palette

Strict adherence to the [tokyonight.nvim](https://github.com/folke/tokyonight.nvim) specification is required:

- **Dark Mode (Default):** `night` variant.
- **Light Mode:** `day` variant.
- **Theme Switching:** Must support system-level preference detection and manual user toggles via a minimal statusline button.

### 1.3 Typography and Glyphs

- **Font Family:** All text, including UI elements and metadata, must use a **Nerd Font** (JetBrainsMono Nerd Font, self-hosted as TTF in `static/fonts/`).
- **Iconography:** Unicode glyphs preferred over Nerd Font PUA symbols for clarity (`›`, `│`, `◆`, `▭`, `▬`, `☾`, `☀`, `▰`, `≡`, `⏱`, `↻`, `↓`, `‹`).

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
  - The **chip backgrounds** (`.tui-panel__head`, `.tui-panel__foot`) are painted with `var(--bg)` so the border line is masked by the chip's own text region. Without this opaque fill, the 1px border bleeds through the chip text as horizontal strikethrough lines.
  - Chip geometry lives on `:root`:
    - `--chip-h: 22px` — vertical chip height (controls `top` / `bottom` offset so the chip's centrelines land exactly on the panel's top/bottom 1px border).
  - Both `.tui-panel__head` and `.tui-panel__foot` are positioned `left: 16px` / `right: 16px` respectively (offset from the panel edge) with compact `padding: 0 8px`. No pseudo-element arms or connector characters — the chip simply masks the border underneath with its opaque background.
  - Border colour uses `--border-soft` (a brighter `--fg-dim`) so panels feel more prominent than the muted dividers used inside lists.
  - The **bottom border** uses `.tui-panel__foot`, with two alignment variants sharing the same geometry:
    - `.tui-panel__foot` (default, centered) — general purpose centered chip
    - `.tui-panel__foot--right` — right-aligned (pagination, action buttons like `[ VIEW ALL POSTS ]`, `[ BACK ]`, …). All panels now consistently use `--right` for footer actions, including blog pagination. Buttons inside the foot chip are borderless (no `.terminal-btn` border) with green hover colour.
- **Bracket Convention:** All interactive segments (nav items, controls, buttons) wrap content in `[ ]` for visual consistency. Active states use a brighter (green) bracket colour rather than underlines.

### 1.5 Statusline Architecture

The header (`.vim-statusline`) and footer (`.vim-winbar`) function as Vim `statusline` and `winbar` components. Each segment displays real, functional metadata rather than decoration.

Statusline layout (left → right):

```
◆~/blog/first-post │[ home ] [blog] [projects] [cv] [contact]           │[▭ CENTERED][☾ DARK]
```

Three flex segments:

1. **PATH** — `.status-path` leftmost, accent (blue) background with dark text + `◆` glyph. Never shrinks. Always shows its path text on every breakpoint.
2. **NAV TABS** — `.status-nav` is `display:flex` and horizontally scrollable (`overflow-x: auto, scrollbar-width: none`). Active tab uses solid bg + accent text + green brackets. No underlines.
3. **CONTROLS** — `.status-controls` right-pinned. `[▭ CENTERED]` and `[☾ DARK]` always rendered, each bracket-wrapped; state persists in `localStorage`. May include `[▰ ES]` language badge for non-English pages.

- On screens `≤720px`, the mainland `.status-nav` collapses into a CSS-only `<details class="nav-hamburger">`. The summary chip `[ ☰ menu ]` (× icon when open) takes its place in the bar. **The hamburger dropdown carries navigation links only** — neither the layout toggle nor the theme toggle appears inside it. The layout toggle is `display: none` at this breakpoint (full-width and centered are visually identical at single-column width, so the switch is meaningless on mobile). The theme toggle keeps its icon+text on the horizontal bar (rightmost cell) on every breakpoint. The hamburger `summary` and its `×` / `☰` icon are locked to fixed dimensions so opening/closing the menu never enlarges the bar.
- A `?menu=open` (or `?nav=open`) URL flag auto-opens the hamburger on load — useful for deep-linking screenshots.

Winbar layout (left → right):

```
[≡ 320 words] [⏱ 2 min] [↻ updated 1 Jul 2026]  │  [↓ Top] [‹ home]
```

- `≡` word count, `⏱` read time (220 wpm), `↻` last-updated date.
- The `↻ updated …` value reflects either **the page's frontmatter `date`** (when present, e.g. blog posts — labelled "article") or **the site's last build time** (when the page has no `date` — labelled "site"). See §3.5.
- `↓` scroll progress (Top / Start / N% / End / Bottom).
- `‹ home` link always returns to root.

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

Both states are persisted in `localStorage` under `layout` and applied pre-paint via inline `<head>` JavaScript to avoid FOUC.

### 2.3 Localization (i18n)

- The site is **English-language by default**. There is no multi-language URL routing, no translation switcher UI, and no parallel content directories per language.
- **Spanish posts are supported** as a tagging mechanism: any post whose frontmatter includes `extra.lang = "es"` renders Spanish content with a visible `[▰ ES]` badge in the statusline. The `<html lang>` attribute reflects the per-post language for screen-reader and SEO correctness, but all UI chrome and default copy stays English.
- Translation strings (UI labels like `nav_home`, `latest_posts`, `view_all_posts`, etc.) live in `[extra]` of `zola.toml` for future i18n, but a user-facing language switcher is explicitly out of scope.

---

## 3. Technical Standards

### 3.1 Codebase Structure

CSS partials (in `sass/`) are imported in this order by `style.scss`:

1. **variables** — Tokyo Night tokens (including `--bg-page` for the outer page/desktop surface) + self-hosted `@font-face` for JetBrainsMono Nerd Font, scoped via `:root` / `[data-theme="light"]`.
2. **base** — global reset, body typography (`background-color: var(--bg-page)`), links, selection, scrollbars.
3. **window** — `.terminal-container` (uses `--bg-page`), `.terminal-window` (uses `--bg`), `.vim-statusline`, `.vim-winbar`, `<main class="window-body">`, layout modes, responsive breakpoints.
4. **boxes** — `.tui-panel`, `.tui-panel__head`, `.tui-panel__body`, `.tui-panel__foot` (centered) / `--right`, `.grid-two-cols`.
5. **navigation** — `.terminal-btn`, `.terminal-link`, `.item-tag`, `.terminal-list`, `.list-item`, `.item-lang-badge`, tag filter, print-btn-row, welcome panel content, dividers.
6. **markdown** — `.markdown-content`, `.page-meta`, heading decorations, code/pre styling, tables, blockquotes, KaTeX.
7. **print** — overrides for CV/document PDF export (always imported last).

Templates compile from `templates/`:

- **base.html** — `<head>` (meta, inline pre-paint script, KaTeX on demand), `.vim-statusline`, `.window-body`, `.vim-winbar`, post-paint JS (theme/layout toggle, scroll, word count).
- **index.html**, **page.html**, **section.html**, **taxonomy_single.html**, **taxonomy_list.html** — call into `base.html` blocks.
- **partials/tag_filter.html** — shared tag filter component.

### 3.2 Code Quality and Architecture

- **Minimalism:** Implement the minimum amount of code necessary to achieve the desired effect. Avoid heavy JavaScript frameworks or unnecessary dependencies.
- **Clean Code:** The codebase is modular, organized, and follows DRY principles for CSS and Zola templates. Print rules and live styles are kept in separate partials; partials for dead code (`.crt.scss`, `.lists.scss`) have been removed.
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
  - `human` — human-friendly stamp (e.g. `01 Jul 2026`)
  - `unix`  — unix epoch seconds
- `templates/base.html` loads it via
  `{% set build_data = load_data(path="data/build.toml", format="toml") %}`
  and exposes `{{ site_updated_label }}` (= `human`) for the winbar.
- Always run `./scripts/build.sh build` (or the same with `serve`)
  rather than invoking `zola build` directly, so the timestamp stays in
  sync with each deploy.

Usage in the winbar: `{% if page.date and not page.extra.print %}{{ page.date | date(format=…) }}{% else %}{{ site_updated_label }}{% endif %}`. CV pages and any other static page therefore get a meaningful "site-updated" reading instead of an empty slot.

### 3.6 Visual Verification (headless screenshots)

For visual regressions run a local server and use Chrome's headless mode:

```bash
./scripts/build.sh build
python3 -m http.server 1111 --directory public &
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --disable-gpu \
  --window-size=1280,800 --hide-scrollbars \
  --user-data-dir=/tmp/chrome-shot \
  --virtual-time-budget=5000 \
  --force-dark-mode --enable-features=WebContentsForceDark \
  --screenshot=./public/_shot_dark.png \
  "http://127.0.0.1:1111/?menu=open"
```

Notes:
- `--force-dark-mode` flips `prefers-color-scheme` so the Tokyo Night
  night palette is rendered, otherwise Chrome's headless defaults to
  light which produces a contrasting preview.
- `?menu=open` triggers the deep-link helper that opens the mobile
  hamburger automatically — useful for inspecting the dropdown layout
  without the need for click automation.
