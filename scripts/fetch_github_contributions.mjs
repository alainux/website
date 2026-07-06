#!/usr/bin/env node
/* ============================================================
 * fetch_github_contributions.mjs
 * ------------------------------------------------------------
 * Queries the GitHub GraphQL API for the contribution calendar
 * of `github_user` (defaults to "alainux") and writes a compact
 * JSON file to `data/github_contributions.json` consumed by the
 * homepage's Three.js isometric chart + HTML commit log.
 *
 * Auth: GITHUB_TOKEN read from `.env` (or env).
 *
 * Output shape (see bottom of file):
 *   - weeks:    [ [{date,count,level}, ...7], ... ]
 *   - repos:    top repositories, masked for private org repos
 *   - commits:  recent commits authored by USER across their
 *               visible repos, with repo names masked when
 *               the repo is private and owned by an org.
 *
 * Soft-fails (exit 0) on missing token / network errors so the
 * Zola build never breaks.
 * ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const USER = process.env.GITHUB_USER || 'alainux';
const COMMIT_LIMIT = 30;

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('[fetch_github] GITHUB_TOKEN missing — skipping.');
  process.exit(0);
}

const GRAPHQL = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays { date contributionCount weekday }
          }
        }
        commitContributionsByRepository(maxRepositories: 20) {
          contributions { totalCount }
          repository {
            nameWithOwner
            url
            visibility
            isPrivate
            owner { login }
          }
        }
      }
    }
  }
`;

function levelFor(count) {
  if (count <= 0) return 0;
  if (count <= 2)  return 1;
  if (count <= 5)  return 2;
  if (count <= 8)  return 3;
  return 4;
}

function headers() {
  return {
    'Authorization': `bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'ialan-website-fetch',
  };
}

/* Mask private repositories owned by an org (i.e. not by USER).
   - private + org-owned  → shown as `(private repo)` with no org leak
   - everything else      → shown with full nameWithOwner + URL      */
function maskRepo(repo) {
  const owner = repo.owner?.login || '';
  const isPrivate = repo.isPrivate || repo.visibility === 'PRIVATE';
  const ownedByOrg = owner && owner.toLowerCase() !== USER.toLowerCase();
  if (isPrivate && ownedByOrg) {
    return {
      name: '(private repo)',
      url: '',
      owner,
      isPrivate: true,
      masked: true,
      count: 0, // we cannot read its commits — keep count for chart only
    };
  }
  return {
    name: repo.nameWithOwner,
    url: repo.url,
    owner,
    isPrivate: !!isPrivate,
    masked: false,
  };
}

/* Fetch recent commits for a given repo (filter `author=` only
   when the repo is NOT owned by USER — for personal repos every
   commit on the default branch is yours anyway, and the filter
   is empty because the git author email often differs from the
   GH login). Returns [] on any error (rate-limit, private, etc.). */
async function fetchCommitsForRepo(repo) {
  if (repo.masked) return [];
  const ownedByUser = (repo.owner || '').toLowerCase() === USER.toLowerCase();
  const url = ownedByUser
    ? `https://api.github.com/repos/${repo.name}/commits?per_page=30`
    : `https://api.github.com/repos/${repo.name}/commits?author=${USER}&per_page=30`;
  try {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr.map((c) => ({
      sha: (c.sha || '').slice(0, 7),
      message: (c.commit?.message || '').split('\n')[0],
      date: c.commit?.author?.date || c.commit?.committer?.date || '',
      repo: repo.name,
      repoUrl: repo.url,
      private: !!repo.isPrivate,
    }));
  } catch {
    return [];
  }
}

async function main() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query: GRAPHQL, variables: { login: USER } }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[fetch_github] HTTP ${res.status}: ${txt.slice(0, 200)}`);
    process.exit(0);
  }
  const json = await res.json();
  if (json.errors) {
    console.error('[fetch_github] GraphQL errors:', json.errors);
    process.exit(0);
  }

  const cal = json.data.user.contributionsCollection;

  let max = 0;
  const weeks = cal.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => {
      if (d.contributionCount > max) max = d.contributionCount;
      return {
        date: d.date,
        count: d.contributionCount,
        level: levelFor(d.contributionCount),
      };
    })
  );

  const rawRepos = (cal.commitContributionsByRepository || []).map((r) => {
    const masked = maskRepo(r.repository);
    return { ...masked, count: r.contributions.totalCount };
  });

  /* Also discover personal repos (owned by USER) via REST, in case they
     don't show up in the contributions top list (which is dominated by
     private org repos). Merge + dedupe. */
  let personalRepos = [];
  try {
    const rres = await fetch(
      `https://api.github.com/users/${USER}/repos?per_page=100&type=owner&sort=pushed`,
      { headers: headers() }
    );
    if (rres.ok) {
      const arr = await rres.json();
      personalRepos = (arr || [])
        .filter((r) => !r.fork)
        .map((r) => ({
          name: r.full_name,
          url: r.html_url,
          owner: r.owner?.login || USER,
          isPrivate: r.private,
          masked: false,
          count: 0,
        }));
    }
  } catch { /* ignore */ }

  /* Aggregate masked (private org) repos into a single summary entry
     so the public JSON never leaks the org name or repo count. */
  const maskedCount = rawRepos
    .filter((r) => r.masked)
    .reduce((s, r) => s + (r.count || 0), 0);
  const maskedSummary = maskedCount > 0
    ? [{
        name: '(private repos)',
        url: '',
        owner: '',
        isPrivate: true,
        masked: true,
        count: maskedCount,
      }]
    : [];

  const byName = new Map();
  for (const r of rawRepos) if (!r.masked) byName.set(r.name, r);
  for (const m of maskedSummary) byName.set(m.name, m);
  for (const r of personalRepos) if (!byName.has(r.name)) byName.set(r.name, r);
  const allRepos = [...byName.values()];

  /* Fetch commits in parallel for non-masked repos, most-recent-first. */
  const fetchable = allRepos.filter((r) => !r.masked);
  const commitLists = await Promise.all(fetchable.map(fetchCommitsForRepo));
  const commits = commitLists
    .flat()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, COMMIT_LIMIT);

  const out = {
    user: USER,
    total: cal.contributionCalendar.totalContributions,
    max,
    fetched: new Date().toISOString(),
    weeks,
    repos: allRepos,
    commits,
  };

  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  const dest = path.join(ROOT, 'data/github_contributions.json');
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(
    `[fetch_github] ${USER}: ${out.total} contributions, ${rawRepos.length} repos (${rawRepos.filter((r) => r.masked).length} private-masked), ${commits.length} commits -> ${dest}`
  );
}

main().catch((e) => {
  console.error('[fetch_github] failed:', e.message);
  process.exit(0);
});
