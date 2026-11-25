# github-utils

Small utilities for GitHub, as a Chrome extension (Manifest V3). More to come.

## Features

### Issue and PR ids in list views

GitHub's list views no longer show issue numbers after the title. This puts the
number (e.g. **#13**) at the front of each row, between the status icon and the
title. Hovering it shows `owner/repo#13`.

Ids are right-aligned in a column as wide as the longest id in the list, so titles
start at the same position whether the id is `#9` or `#123`.

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
