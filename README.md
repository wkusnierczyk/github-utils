# github-utils

Small utilities for GitHub, as a Chrome extension (Manifest V3). More to come.

## Features

### Issue and PR ids in list views

GitHub's list views no longer show issue numbers after the title. This puts the
number (e.g. **#13**) at the front of each row, between the status icon and the
title. Hovering it shows `owner/repo#13`.

Ids are right-aligned in a column as wide as the longest id in the list, so titles
start at the same position whether the id is `#9` or `#123`.

In project table views GitHub still shows the number after the title. Where the extension
shows the id in front, GitHub's trailing one is hidden (not removed), so the number isn't
shown twice.

### Repo name after the title

On a repo's own issue or PR list (`/owner/repo/issues`, `/owner/repo/pulls`) every row is
from that repo, so the `owner/repo` button after the title, and the bullet after it, are
hidden. It stays wherever it is informative: the cross-repo dashboard, org pages and
projects. It is only hidden when it names the repo of the page you are on.

### Repo name in project tables

Project tables don't show which repo an issue is from. When the issues in view come from
more than one repo, a muted repo name is added after the title (just the repo name if all
repos share an owner, `owner/repo` otherwise). A single-repo project gets nothing, since
it would be noise.

### Release column

If you label issues with release versions, e.g. `release:0.1.0`, the version is shown
right after the id, before the title, as its own right-aligned column.

- Only labels of the form `release:MAJOR.MINOR.PATCH` count (for now).
- Issues without a release label get an empty slot, so titles stay aligned. If no issue
  in the view has a release label, no space is reserved and the list looks as without it.
- If an issue has several release labels (it shouldn't), the lowest is shown, in red.
  Hover for the full list.
- Click a release to filter the list: the search bar gets `label:release:X`. Click it again
  to remove the filter.
- Label data comes from the JSON GitHub embeds in the page (the compact list layout doesn't
  render label chips). For a filter or page change, the extension fetches the same URL once
  to read it. Label edits show up after the next page load or filter change.

### Sort by release

When any issue in view has a release label, **Release** is added to GitHub's *Sort by* menu.

- *Oldest* puts the lowest release first, *Newest* the highest. Versions compare as numbers,
  so `0.9.1` comes before `0.10.0`. Ties are ordered by issue number in the same direction.
- Issues without a release always go last, in either direction.
- It reorders the rows on the current page only. GitHub paginates, so other pages are not
  affected.
- Choosing any other sort hands control back to GitHub. The choice is remembered per tab and
  page, so it survives the reload from clicking a release.

### General

- Works on the cross-repo dashboard (`github.com/issues`), repo issue lists and PR lists.
- Skips rows that already show their own `#N`, so nothing is duplicated.

## Install (unpacked)

1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repo folder.
4. Reload any GitHub issues page.

## How it works

`content.js` finds links of the form `/owner/repo/issues/N` or `/owner/repo/pull/N`
inside list rows, reads `N` from the link, and inserts a `<span class="gh-issue-id">`
before the title link, then sets every id in a list to the width of the widest one. A `MutationObserver` re-runs it as GitHub renders or navigates.

## License

MIT
