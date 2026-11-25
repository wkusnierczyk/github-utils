# github-utils

Small utilities for GitHub issue and PR lists, as a Chrome extension (Manifest V3).

## Features

| | Feature | Where |
|---|---|---|
| 1 | Issue and PR ids in front of the title | issue and PR lists, projects |
| 2 | GitHub's trailing id hidden | project tables |
| 3 | Redundant repo name hidden | a repo's own lists |
| 4 | Repo name badge | multi-repo project tables |
| 5 | Label columns | issue and PR lists |
| 6 | Sort by label criterion | issue and PR lists |
| 7 | Value list with counts above the table | a repo's issue and PR lists |
| 8 | User-defined label criteria: add, edit, reorder, enable or disable, pick what to show | options page |

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

### Label criteria

A criterion picks out one kind of label, e.g. `release:0.1.0`, `worker:agent`,
`category:G-features`. Each criterion (see Settings) adds:

- **A column** (if its *Column* switch is on) between the id and the title, in settings order,
  aligned as set (right by default). Rows without a value stay empty; a criterion with no
  value in view reserves no space. Not shown in project views, which don't expose labels.
- **Click-to-filter** on the column's values: click one to add `label:...` to the search bar,
  click again to clear it. Filters of other criteria are kept.
- **A *Sort by* entry**: *Oldest* sorts lowest first, *Newest* highest first. Values compare
  numerically per dot-separated part (`0.9.1` < `0.10.0`), otherwise as text. Issues without
  a value go last. It reorders the current page only; any other sort hands control back to
  GitHub.
- **A list above the table** (if its *Value list* switch is on), one row per criterion in a
  two-column table (name right-aligned, values left-aligned): a chip per value with its issue count,
  plus "no X", with arrows to step through them. It counts by reading all pages of the query
  in the background (labels only, up to 1,000 issues). Each stop is an ordinary GitHub
  filter, since search can't order or page by label. When the criterion's sort is on and the
  list has several pages, the strip notes that it applies to this page only.

An issue with several labels of one criterion shows the lowest, in red; hover for all.

## Settings

Open the options page from `chrome://extensions` > github-utils > **Details** > **Extension options**.

Add, edit, reorder and remove criteria. Each has:

| Field | |
|---|---|
| Name | Required, unique. Shown in the *Sort by* menu and next to the value list. |
| Enabled | Off keeps the criterion's settings but hides it everywhere (column, sort entry, list). |
| Pattern | A regular expression matched against the whole label name, case-sensitive. A new criterion starts with `name:(.+)`. |
| Separator | Joins several capture groups. Optional. |
| Column | Show the column of values before the title (and click-to-filter on it). With it off, the *Sort by* entry and value list still work. |
| Alignment | Column text alignment: left, center or right (default). |
| Value list | Show the list of values with counts above the table. |

What is shown for a matching label:

| Pattern | Label | Shown |
|---|---|---|
| `release:[0-9]+[.][0-9]+[.][0-9]+` (no group) | `release:0.1.0` | `release:0.1.0` |
| `release:([0-9]+[.][0-9]+[.][0-9]+)` (one group) | `release:0.1.0` | `0.1.0` |
| `release:([0-9]+)[.]([0-9]+)[.]([0-9]+)`, separator `:` | `release:0.1.0` | `0:1:0` |

The default is a single `release` criterion with the one-group pattern above. Settings sync
across your Chrome profile and apply to open GitHub tabs at once. A pattern from an earlier
version (single release setting) becomes the `release` criterion.

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
