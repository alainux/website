# Personal Site — ialan.eu

Source code for [ialan.eu](https://www.ialan.eu), a Zola-powered personal site and blog styled like a terminal/Vim buffer.

**Primary forge:** [codeberg.org/ialan](https://codeberg.org/ialan)

---

## Prerequisites

- [Zola](https://getzola.org/) (static site generator)
- `bash`, `date` (for the build script)

---

## Local Development

### 1. Clone and enter the repo

```bash
git clone https://codeberg.org/ialan/ialan.eu.git
cd ialan.eu
```

### 2. Serve locally with hot reload

```bash
./scripts/build.sh serve
```

Open [http://127.0.0.1:1111](http://127.0.0.1:1111).

> **Note:** Do not run `zola serve` directly — it skips the build timestamp injection that powers the "updated" winbar metadata.

---

## Build for Production

```bash
./scripts/build.sh build
```

The site is compiled into the `public/` directory. The build script also writes the current UTC timestamp to `data/build.toml`, which the templates expose as the site’s last-updated date.

---

## Deploy to statichost.eu

1. Ensure `statichost.yml` exists at the repo root: it already points to the `public/` folder.
2. Push to your git remote (Codeberg, GitHub, etc.).
3. statichost.eu picks up the `statichost.yml` and serves the contents of `public/`.

No additional CI steps are required — the host reads `public: public` from `statichost.yml`.

---

## Project Structure

| Path | Description |
|------|-------------|
| `zola.toml` | Site config, nav labels, date format, taxonomies |
| `content/` | Markdown content (pages, blog, projects)
| `sass/` | SCSS partials (variables, components, markdown, print) |
| `templates/` | Zola/Tera HTML templates |
| `static/` | Fonts, images, JS (no preprocessing)
| `scripts/build.sh` | Wrapper around `zola` that injects `data/build.toml` |

---

## Key Configuration

- **`zola.toml`** — `base_url`, `title`, taxonomies (`tags`), nav labels under `[extra]`.
- **`statichost.yml`** — Points the host at the `public/` build folder.
- **`scripts/build.sh`** — Generates `data/build.toml` with ISO and human-readable timestamps. Must be used for both `build` and `serve`.

---

## Tech Stack

- **Generator:** [Zola](https://www.getzola.org/)
- **Theme:** Custom "Tokyo-Vim" (terminal / Neovim-inspired, flat TUI aesthetic)
- **Palette:** [Tokyo Night](https://github.com/folke/tokyonight.nvim)
- **Font:** JetBrainsMono Nerd Font (self-hosted TTF)
- **Math:** KaTeX (loaded on demand via `page.extra.math`)
- **Features:** Dark/light theme toggle, centered/full-width layout, responsive hamburger nav, print-friendly CV styling

---

## Contact

Questions or contributions? Reach out via the channels listed on the [site](https://www.ialan.eu/contact) or open an issue on [Codeberg](https://codeberg.org/ialan).
