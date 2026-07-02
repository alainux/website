# Deploy Plan — Replace Old Site on Codeberg

- Do not do this yet -

## Context

- **Old site:** `ialan/pages` on Codeberg (`ssh://git@codeberg.org/ialan/pages.git`), branch `pages`. Simple static `index.html` + old `statichost.yml`.
- **New site:** Zola site in local directory `website/`, currently on branch `main`.
- **Goal:** Fully replace the old site with the new Zola site, keeping the same remote.

---

## Step 1 — Add Remote & Rename Branch

In the new `website/` repo:

```bash
# Add the existing Codeberg remote
git remote add origin ssh://git@codeberg.org/ialan/pages.git

# Rename local 'main' to 'pages'
git branch -m main pages

# Tell git to track your local 'pages' against remote 'pages'
git branch --set-upstream-to=origin/pages pages
```

---

## Step 2 — Commit statichost.yml (if not already)

```bash
git add statichost.yml
git commit -m "Add statichost.yml for statichost.eu SSG build"
```

---

## Step 3 — Force-Push to Replace Old Site

```bash
# Overwrite the old 'pages' branch on Codeberg with your new site
git push --force origin pages
```

---

## Post-Deploy Check

- statichost.eu will read the `statichost.yml` at repo root.
- It will pull the Zola Docker image, run `zola build`, and serve `public/`.
- Verify the site is live at [ialan.eu](https://www.ialan.eu).

---

## Done

That's it. The old `index.html` site is replaced by the new Zola build on the same `pages` branch.
