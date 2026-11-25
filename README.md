# github-utils

Small utilities for GitHub issue and PR lists, as a Chrome extension (Manifest V3).

## Features

| | Feature | Where |
|---|---|---|
| 1 | Issue and PR ids in front of the title | issue and PR lists, projects |
| 2 | GitHub's trailing id hidden | project tables |
| 3 | Redundant repo name hidden | a repo's own lists |
| 4 | Repo name badge | multi-repo project tables |
| 5 | Release column | issue and PR lists |
| 6 | Sort by release | issue and PR lists |
| 7 | Release pager | a repo's issue and PR lists |
| 8 | Release label pattern (setting) | options page |

### Ids

Shows `#N` between the status icon and the title, right-aligned in a column as wide as the
longest id in view. Hover for `owner/repo#N`. Rows that already show their id are left alone.

### Trailing id

Project tables still show the id after the title. Where ours is shown, GitHub's is hidden
(not removed).

### Repo name after the title

On `/owner/repo/issues` and `/owner/repo/pulls` the `owner/repo` button (and its bullet) is
redundant and hidden. Dashboards, org pages and projects keep it.

### Repo badge in project tables

Project tables don't show the repo. When the issues in view span several repos, a muted repo
name is added after the title (`owner/repo` if owners differ). Single-repo projects get none.

### Release column

Labels matching the release pattern (default `release:1.2.3`, see Settings) are shown after the id as a right-aligned column.

- No release label in view: no space reserved.
- Several releases on one issue: the lowest, in red; hover for all.
- Click a release to filter (`label:release:X` in the search bar); click again to clear.
- Not shown in project views, which don't expose labels.

### Sort by release

Adds **Release** to the *Sort by* menu when a release is in view.

- *Oldest*: lowest first. *Newest*: highest first. Versions compare numerically (`0.9.1` < `0.10.0`).
- Issues without a release go last either way.
- Reorders the current page only. Any other sort hands control back to GitHub.

### Release pager

A strip above the list: a chip per release with its issue count, plus **no release**.

- Click a chip to filter, click the active one to clear. Arrows step through releases in order.
- Counts come from reading all pages of the query in the background (release labels only,
  up to 1,000 issues).
- Each stop is an ordinary GitHub filter, since search can't order or page by label. When the
  release sort is on and the list has several pages, the strip notes that it applies to this
  page only.

## Settings

Open the options page from `chrome://extensions` > github-utils > **Details** > **Extension options**.

- **Release label pattern**: a regular expression matched against the whole label name,
  case-sensitive. Default: `release:([0-9]+[.][0-9]+[.][0-9]+)`.
  The first capture group is what is shown as the release (`0.1.0`); without a group the
  whole label is shown. Filters use the full label, so any naming scheme works, e.g.
  `v([0-9.]+)` or `milestone-(.+)`.
- Saved patterns sync across your Chrome profile and apply to open GitHub tabs at once.
  Invalid patterns can't be saved.

## Install (unpacked)

1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. **Load unpacked**, select the repo folder.
4. Reload any GitHub issues page.

## How it works

`content.js` finds `/owner/repo/issues/N` and `/owner/repo/pull/N` links in list rows and
adds its elements around them. A `MutationObserver` re-runs it as GitHub renders. Labels come
from the JSON GitHub embeds in each page, fetched from the same URL. GitHub's own elements
are hidden or reordered with CSS, never removed or moved.

## License

MIT
