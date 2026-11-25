(() => {
  const ID_CLASS = "gh-issue-id";
  const REL_CLASS = "gh-issue-release";
  const NATIVE_HIDDEN = "gh-native-id-hidden";
  const REPO_HIDDEN = "gh-repo-link-hidden";
  // Features that will become user settings.
  const HIDE_REPO_LINK = true;
  const SHOW_REPO_IN_PROJECTS = true;
  const REPO_BADGE = "gh-repo-badge";
  // A project page: /users/NAME/projects/N or /orgs/NAME/projects/N
  const PROJECT_PAGE_RE = /^\/(?:users|orgs)\/[^/]+\/projects\/\d+/;
  // A repo's own issue or PR list: /owner/repo/issues, /owner/repo/pulls
  const REPO_PAGE_RE = /^\/([^/]+\/[^/]+)\/(?:issues|pulls)\/?$/;
  // Release labels. Strictly release:MAJOR.MINOR.PATCH for now (to become a setting).
  const RELEASE_LABEL = /^release:(\d+\.\d+\.\d+)$/;
  const FILTER_PREFIX = "label:release:";

  // /owner/repo/issues/123 or /owner/repo/pull/123 (no trailing path)
  const PATH_RE = /^\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)\/?$/;
  const ROW_SELECTOR =
    'li, tr, [role="row"], [role="listitem"], .Box-row, [data-testid="list-row"]';

  // ---------------------------------------------------------------- rows

  // One entry per list row that has a title link to an issue or PR.
  function collectRows() {
    const seen = new Set();
    const out = [];
    const anchors = document.querySelectorAll(
      'a[href*="/issues/"], a[href*="/pull/"]'
    );
    for (const a of anchors) {
      let url;
      try {
        url = new URL(a.href, location.origin);
      } catch {
        continue;
      }
      if (url.hash || url.search) continue;
      const m = PATH_RE.exec(url.pathname);
      if (!m) continue;
      if (!a.textContent.trim()) continue; // icon-only or hidden links
      if (a.getAttribute("aria-hidden") === "true") continue;
      const row = a.closest(ROW_SELECTOR);
      if (!row || seen.has(row)) continue; // only list rows, one per row
      seen.add(row);
      out.push({
        row,
        a,
        n: Number(m[1]),
        repo: url.pathname.split("/").slice(1, 3).join("/"),
      });
    }
    return out;
  }

  function groupByList(rows) {
    const lists = new Map();
    for (const r of rows) {
      const list = r.row.parentElement;
      if (!lists.has(list)) lists.set(list, []);
      lists.get(list).push(r);
    }
    return lists;
  }

  // Give every span in a list the width of the widest one (right-aligned via CSS).
  function fitWidth(list, spans, key) {
    if (!spans.length) return;
    const sig = spans.length + ":" + Math.max(...spans.map((s) => s.textContent.length));
    if (list.dataset[key] === sig && spans.every((s) => s.style.minWidth)) return;
    spans.forEach((s) => (s.style.minWidth = ""));
    const w = Math.ceil(Math.max(...spans.map((s) => s.getBoundingClientRect().width)));
    spans.forEach((s) => (s.style.minWidth = w + "px"));
    list.dataset[key] = sig;
  }

  // ------------------------------------------------------------------ ids

  // A leaf element whose whole text is "#N": GitHub's own id after the title
  // (e.g. in project tables). We hide those instead of treating them as "shown".
  // Compares the element's whole text, not single text nodes: React renders
  // "#{n}" as two text nodes ("#" and "3").
  function isBareId(el, n) {
    return !el.children.length && el.textContent.trim() === "#" + n;
  }

  // True if the row already shows "#N" as part of other text, e.g. "#16 opened
  // by ..." in repo-level lists.
  function rowShowsId(row, n) {
    const re = new RegExp("^#" + n + "(?!\\d)");
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const p = node.parentElement;
      if (!p || p.classList.contains(ID_CLASS) || isBareId(p, n)) continue;
      if (re.test(node.nodeValue.trim())) return true;
      if (!p.children.length && re.test(p.textContent.trim())) return true; // split text nodes
    }
    return false;
  }

  // Hide GitHub's own id after the title in rows where we show ours in front,
  // so the number isn't shown twice. Hidden with a class, never removed, because
  // GitHub's renderer owns those nodes.
  function hideNativeIds(rows) {
    for (const { row, a, n } of rows) {
      const ours = row.querySelector("." + ID_CLASS);
      for (const el of row.querySelectorAll("*")) {
        if (el.classList.contains(ID_CLASS) || !isBareId(el, n)) continue;
        const afterTitle = a.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
        const hide = !!ours && !!afterTitle;
        if (el.classList.contains(NATIVE_HIDDEN) !== hide) el.classList.toggle(NATIVE_HIDDEN, hide);
      }
    }
  }

  // On a repo's own issue/PR list every row is from that repo, so the "owner/repo"
  // button after the title (it only adds a repo: filter) is redundant. Hide it, and
  // the bullet after it, only when it names the page's own repo; on dashboards,
  // org pages and projects, where the repo is informative, it stays.
  function hideRepoLinks(rows) {
    const m = REPO_PAGE_RE.exec(location.pathname);
    const pageRepo = HIDE_REPO_LINK && m ? m[1].toLowerCase() : null;
    const toggle = (el, hide) => {
      if (el.classList.contains(REPO_HIDDEN) !== hide) el.classList.toggle(REPO_HIDDEN, hide);
    };
    for (const { row } of rows) {
      for (const btn of row.querySelectorAll("button")) {
        const text = btn.textContent.trim().toLowerCase();
        if (!/^[^/\s]+\/[^/\s]+$/.test(text)) continue; // not an owner/repo label
        const unit = btn.parentElement;
        if (!unit || unit.textContent.trim().toLowerCase() !== text) continue;
        const hide = pageRepo === text;
        toggle(unit, hide);
        const sep = unit.nextElementSibling;
        if (sep && sep.textContent.trim() === "•") toggle(sep, hide);
      }
    }
  }

  // Project tables don't show which repo an issue is from, which matters when a
  // project spans several. Add a muted "owner/repo" after the title, but only if
  // the issues in view come from more than one repo.
  function showRepoBadges(rows) {
    const onProject = SHOW_REPO_IN_PROJECTS && PROJECT_PAGE_RE.test(location.pathname);
    const mixed = new Set(rows.map((r) => r.repo.toLowerCase())).size > 1;
    const show = onProject && mixed;
    // Same owner everywhere: the owner is noise, show just the repo name.
    const sameOwner = new Set(rows.map((r) => r.repo.split("/")[0].toLowerCase())).size === 1;
    for (const { row, a, repo } of rows) {
      const label = sameOwner ? repo.split("/")[1] : repo;
      let badge = row.querySelector("." + REPO_BADGE);
      if (!show) {
        if (badge) badge.remove();
        continue;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = REPO_BADGE;
        a.after(badge);
      }
      if (badge.textContent !== label) badge.textContent = label;
      if (badge.title !== "Repository: " + repo) badge.title = "Repository: " + repo;
    }
  }

  function insertIds(rows) {
    for (const { row, a, n, repo } of rows) {
      if (row.querySelector("." + ID_CLASS)) continue; // already done
      if (rowShowsId(row, n)) continue;
      const span = document.createElement("span");
      span.className = ID_CLASS;
      span.textContent = "#" + n;
      span.title = repo + "#" + n;
      a.parentNode.insertBefore(span, a);
    }
  }

  function alignIds(rows) {
    for (const [list, entries] of groupByList(rows)) {
      const spans = entries
        .map((e) => e.row.querySelector("." + ID_CLASS))
        .filter(Boolean);
      fitWidth(list, spans, "ghIdSig");
    }
  }

  // ------------------------------------------------------------- releases

  // GitHub embeds each list page's data (including issue labels) as JSON.
  // Rows in compact layout don't render labels, so we read them from there.
  const pageData = new Map(); // "path?query" -> Map("owner/repo#n" -> [versions]) | "loading"

  const pageKey = () => location.pathname + location.search;

  function embeddedJson(doc) {
    const script = doc.querySelector('script[data-target="react-app.embeddedData"]');
    if (!script) return null;
    try {
      return JSON.parse(script.textContent);
    } catch {
      return null;
    }
  }

  // "owner/repo#n" -> [versions], for the issues in the embedded data that carry
  // release labels.
  function releasesIn(json) {
    const releases = new Map();
    if (!json) return releases;
    const visit = (o, depth) => {
      if (!o || typeof o !== "object" || depth > 14) return;
      if (
        !Array.isArray(o) &&
        typeof o.title === "string" &&
        typeof o.number === "number" &&
        Array.isArray(o.labels)
      ) {
        const repo =
          o.repoNameWithOwner || (o.repository && o.repository.nameWithOwner) || "";
        const versions = [];
        for (const l of o.labels) {
          const m = RELEASE_LABEL.exec((l && l.name) || "");
          if (m) versions.push(m[1]);
        }
        if (repo && versions.length) releases.set(repo.toLowerCase() + "#" + o.number, versions);
        return;
      }
      for (const k of Object.keys(o)) visit(o[k], depth + 1);
    };
    visit(json, 0);
    return releases;
  }

  // GitHub's own paging numbers for the query: { totalPages, totalCount }.
  function pageInfoIn(json) {
    let found = null;
    const visit = (o, depth) => {
      if (found || !o || typeof o !== "object" || depth > 8) return;
      if (typeof o.totalPages === "number" && typeof o.totalCount === "number") {
        found = { totalPages: o.totalPages, totalCount: o.totalCount };
        return;
      }
      for (const k of Object.keys(o)) visit(o[k], depth + 1);
    };
    visit(json, 0);
    return found || { totalPages: 1, totalCount: 0 };
  }

  const parseEmbedded = (doc) => releasesIn(embeddedJson(doc));

  function ensurePageData() {
    const key = pageKey();
    if (pageData.has(key)) return;
    pageData.set(key, "loading");
    fetch(location.href, { credentials: "same-origin", headers: { Accept: "text/html" } })
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        pageData.set(key, parseEmbedded(doc));
      })
      .catch(() => pageData.set(key, new Map()))
      .finally(schedule);
  }

  // Seed from the page we were loaded on, so there is no extra request or flicker.
  pageData.set(pageKey(), parseEmbedded(document));

  // Numeric per part (0.9.1 < 0.10.0); falls back to text for non-numeric parts.
  function compareVersions(a, b) {
    const x = a.split(".");
    const y = b.split(".");
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i] ?? "";
      const q = y[i] ?? "";
      const pn = Number(p);
      const qn = Number(q);
      const d =
        p !== "" && q !== "" && !isNaN(pn) && !isNaN(qn) ? pn - qn : p.localeCompare(q);
      if (d) return d;
    }
    return 0;
  }

  function releasesFor(entry) {
    const data = pageData.get(pageKey());
    if (!(data instanceof Map)) return [];
    return data.get(entry.repo.toLowerCase() + "#" + entry.n) || [];
  }

  function renderReleases(rows) {
    ensurePageData();
    for (const [list, entries] of groupByList(rows)) {
      const found = entries.map((e) => ({ e, versions: releasesFor(e).slice().sort(compareVersions) }));
      const any = found.some((f) => f.versions.length);
      const spans = [];
      for (const { e, versions } of found) {
        let span = e.row.querySelector("." + REL_CLASS);
        if (!any) {
          if (span) span.remove(); // no releases in view: reserve no space
          continue;
        }
        if (!span) {
          span = document.createElement("span");
          span.className = REL_CLASS;
          e.a.parentNode.insertBefore(span, e.a);
        }
        const lowest = versions[0] || "";
        const multi = versions.length > 1;
        if (span.textContent !== lowest) span.textContent = lowest;
        span.dataset.ghRelease = lowest;
        span.classList.toggle(REL_CLASS + "--multi", multi);
        const title = !lowest
          ? ""
          : multi
          ? "Several releases: " + versions.join(", ") + " (showing lowest). Click to filter."
          : "Filter by release " + lowest;
        if (span.title !== title) span.title = title;
        spans.push(span);
      }
      fitWidth(list, spans, "ghRelSig");
    }
  }

  // The search query with every release filter (positive or negated) removed.
  function baseQuery() {
    const u = new URL(location.href);
    let q = u.searchParams.get("q");
    if (!q || !q.trim()) {
      const input = document.getElementById("issues-index-filter-input");
      q = (input && input.value.trim()) || "is:issue state:open";
    }
    return q.replace(/(^|\s)-?label:"?release:[^\s"]*"?/g, " ").replace(/\s+/g, " ").trim();
  }

  // What the query currently selects: "" (no release filter), a version, or NONE.
  const NONE = "none";
  function currentSelection() {
    const q = new URL(location.href).searchParams.get("q") || "";
    const pos = /(?:^|\s)label:"?release:([^\s"]+)"?/.exec(q);
    if (pos) return pos[1];
    return /(?:^|\s)-label:"?release:/.test(q) ? NONE : "";
  }

  // Go to the same list filtered to `selection` (a version, NONE, or "" for all).
  // NONE excludes every known release label, since search has no label wildcard.
  function goToSelection(selection, knownVersions) {
    const u = new URL(location.href);
    let q = baseQuery();
    if (selection === NONE) {
      q = (q + " " + knownVersions.map((v) => "-" + FILTER_PREFIX + v).join(" ")).trim();
    } else if (selection) {
      q = (q + " " + FILTER_PREFIX + selection).trim();
    }
    u.searchParams.set("q", q);
    u.searchParams.delete("page");
    location.assign(u.href);
  }

  // Clicking a release in a row toggles its filter.
  function filterByRelease(version) {
    goToSelection(currentSelection() === version ? "" : version);
  }

  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest && e.target.closest("." + REL_CLASS);
      if (!el || !el.dataset.ghRelease) return;
      e.preventDefault();
      e.stopPropagation();
      filterByRelease(el.dataset.ghRelease);
    },
    true
  );

  // ----------------------------------------------------------------- sort

  // Adds "Release" to GitHub's "Sort by" menu. It reorders the rows on the page
  // (GitHub paginates, so other pages are not affected) with CSS `order`, so
  // GitHub's own DOM nodes are never moved. Oldest = lowest release first, Newest =
  // highest first; issues without a release go last either way. Kept per tab and
  // page, so it survives the reload caused by clicking a release.
  const SORT_KEY = "gh-utils-sort-release";
  const SORT_ATTR = "data-gh-sort-release";
  const sort = { on: false, dir: "desc", path: location.pathname };
  try {
    const saved = JSON.parse(sessionStorage.getItem(SORT_KEY) || "null");
    if (saved && saved.path === location.pathname) {
      sort.on = true;
      sort.dir = saved.dir === "asc" ? "asc" : "desc";
    }
  } catch {
    /* storage unavailable: sort just won't persist */
  }

  function setSort(on, dir) {
    sort.on = on;
    if (dir) sort.dir = dir;
    try {
      if (on) sessionStorage.setItem(SORT_KEY, JSON.stringify({ path: sort.path, dir: sort.dir }));
      else sessionStorage.removeItem(SORT_KEY);
    } catch {
      /* ignore */
    }
    schedule();
  }

  function lowestRelease(entry) {
    return releasesFor(entry).slice().sort(compareVersions)[0] || "";
  }

  function applySort(rows) {
    for (const [list, entries] of groupByList(rows)) {
      const keyed = entries.map((e) => ({ e, v: lowestRelease(e) }));
      if (!(sort.on && keyed.some((k) => k.v))) {
        if (list.dataset.ghSorted) {
          entries.forEach((e) => (e.row.style.order = ""));
          list.style.display = "";
          list.style.flexDirection = "";
          delete list.dataset.ghSorted;
        }
        continue;
      }
      const sign = sort.dir === "asc" ? 1 : -1;
      keyed.sort((x, y) => {
        if (!x.v !== !y.v) return x.v ? -1 : 1; // unreleased last, in both directions
        return sign * compareVersions(x.v, y.v) || sign * (x.e.n - y.e.n);
      });
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.dataset.ghSorted = "1";
      keyed.forEach((k, i) => {
        const o = String(i);
        if (k.e.row.style.order !== o) k.e.row.style.order = o;
      });
    }
  }

  function injectSortItem(anyRelease) {
    const group = document.querySelector('ul[role="group"][aria-label="Sort by"]');
    if (!group) return;
    let ours = group.querySelector("[" + SORT_ATTR + "]");
    if (!anyRelease) {
      if (ours) ours.remove(); // no releases in view: nothing to sort by
      return;
    }
    const items = [...group.querySelectorAll(':scope > li[role="menuitemradio"]')];
    if (!ours) {
      const template =
        items.find((li) => li.textContent.trim() === "Total comments") || items[1] || items[0];
      if (!template) return;
      ours = template.cloneNode(true);
      ours.removeAttribute("id");
      ours.setAttribute(SORT_ATTR, "1");
      ours.setAttribute("tabindex", "-1");
      const label = template.textContent.trim();
      ours.querySelectorAll("span").forEach((s) => {
        if (!s.children.length && s.textContent.trim() === label) s.textContent = "Release";
      });
      template.after(ours);
    }
    const want = sort.on ? "true" : "false";
    if (ours.getAttribute("aria-checked") !== want) ours.setAttribute("aria-checked", want);
    if (sort.on) {
      for (const li of items) {
        if (li !== ours && li.getAttribute("aria-checked") !== "false") {
          li.setAttribute("aria-checked", "false");
        }
      }
    }
  }

  function orderFromMenu() {
    const og = document.querySelector('ul[role="group"][aria-label="Order"]');
    const checked = og && og.querySelector('li[aria-checked="true"]');
    return checked && /Oldest/.test(checked.textContent) ? "asc" : "desc";
  }

  function activateSort() {
    const dir = orderFromMenu();
    const trigger = document.querySelector('button[aria-haspopup][aria-expanded="true"]');
    setSort(true, dir);
    if (trigger) trigger.click(); // close GitHub's menu
  }

  document.addEventListener(
    "click",
    (e) => {
      const li = e.target.closest && e.target.closest('li[role="menuitemradio"]');
      if (!li) return;
      if (li.hasAttribute(SORT_ATTR)) {
        e.preventDefault();
        e.stopPropagation();
        activateSort();
        return;
      }
      const label = li.parentElement && li.parentElement.getAttribute("aria-label");
      if (label === "Sort by" && sort.on) {
        setSort(false); // another sort chosen: hand control back to GitHub
      } else if (label === "Order") {
        sort.dir = /Oldest/.test(li.textContent) ? "asc" : "desc";
        if (sort.on) setSort(true, sort.dir);
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const li = e.target.closest && e.target.closest("[" + SORT_ATTR + "]");
      if (!li) return;
      e.preventDefault();
      e.stopPropagation();
      activateSort();
    },
    true
  );

  // ---------------------------------------------------------------- pager

  // GitHub paginates, and search can't order or page by label, so a true
  // release-ordered page isn't possible. Instead we read every page of the current
  // query in the background (just the release labels), and show a strip above the
  // list: one chip per release with its issue count, "none" for the rest, and
  // previous/next to step through them in release order. Each stop is an ordinary
  // GitHub filter (label:release:X), so the page itself stays GitHub's.
  const PAGER_CLASS = "gh-release-pager";
  const MAX_PAGES = 40; // 1000 issues; beyond that the counts are partial
  const CONCURRENCY = 4;
  const loaded = new Map(); // "path?query" -> { done, releases, total, pages, partial }

  function loadAll(base) {
    const key = location.pathname + "?" + base;
    if (loaded.has(key)) return loaded.get(key);
    const st = { done: false, releases: new Map(), total: 0, pages: 1, partial: false };
    loaded.set(key, st);
    const urlFor = (k) => {
      const u = new URL(location.href);
      u.searchParams.set("q", base);
      if (k > 1) u.searchParams.set("page", String(k));
      else u.searchParams.delete("page");
      return u.href;
    };
    const get = (k) =>
      fetch(urlFor(k), { credentials: "same-origin", headers: { Accept: "text/html" } })
        .then((r) => (r.ok ? r.text() : ""))
        .then((html) => embeddedJson(new DOMParser().parseFromString(html, "text/html")))
        .catch(() => null);
    const merge = (json) => releasesIn(json).forEach((v, k) => st.releases.set(k, v));
    get(1)
      .then(async (first) => {
        if (!first) return;
        const info = pageInfoIn(first);
        st.total = info.totalCount;
        st.pages = Math.min(info.totalPages, MAX_PAGES);
        st.partial = info.totalPages > MAX_PAGES;
        merge(first);
        const queue = [];
        for (let k = 2; k <= st.pages; k++) queue.push(k);
        const worker = async () => {
          for (let k = queue.shift(); k; k = queue.shift()) merge(await get(k));
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      })
      .finally(() => {
        st.done = true;
        schedule();
      });
    return st;
  }

  const isPaginated = () =>
    [...document.querySelectorAll('a[href*="page="]')].some((a) =>
      /^(\d+|Next|Previous)$/.test(a.textContent.trim())
    );

  function renderPager(rows) {
    const list = rows.length ? rows[0].row.parentElement : null;
    const host = list && list.parentElement;
    const old = document.querySelector("." + PAGER_CLASS);
    const remove = () => old && old.remove();
    if (!list || !host || !REPO_PAGE_RE.test(location.pathname)) return remove();

    const st = loadAll(baseQuery());
    const versions = [...new Set([...st.releases.values()].flat())].sort(compareVersions);
    const sel = currentSelection();
    const note = sort.on && isPaginated();
    if (!note && !(st.done && versions.length)) return remove();

    const counts = new Map(versions.map((v) => [v, 0]));
    for (const vs of st.releases.values()) for (const v of new Set(vs)) counts.set(v, counts.get(v) + 1);
    const withRelease = st.releases.size;
    const none = Math.max(0, st.total - withRelease);
    const sig = JSON.stringify([versions, [...counts.values()], none, sel, note, st.done, st.partial]);
    if (old && old.dataset.sig === sig && old.nextElementSibling === list) return;

    const strip = document.createElement("div");
    strip.className = PAGER_CLASS;
    strip.dataset.sig = sig;

    // Stops in release order; "" (all) is where you are when no release is selected.
    const stops = versions.concat(none ? [NONE] : []);
    const at = sel ? stops.indexOf(sel) : -1;
    const step = (label, dir, title) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = PAGER_CLASS + "__step";
      b.textContent = label;
      b.title = title;
      // From "all", only next is possible (to the first release).
      const target = at < 0 ? (dir > 0 ? 0 : -1) : at + dir;
      b.disabled = target < 0 || target >= stops.length;
      if (!b.disabled) b.dataset.ghStop = stops[target];
      return b;
    };
    const chip = (value, text, count) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = PAGER_CLASS + "__chip" + (sel === value ? " " + PAGER_CLASS + "__chip--on" : "");
      b.dataset.ghStop = sel === value ? "" : value; // clicking the active chip clears it
      b.textContent = text + " ";
      const n = document.createElement("span");
      n.textContent = String(count);
      b.append(n);
      return b;
    };

    if (st.done && versions.length) {
      strip.append(step("\u2039", -1, "Previous release"));
      versions.forEach((v) => strip.append(chip(v, v, counts.get(v))));
      if (none) strip.append(chip(NONE, "no release", none));
      strip.append(step("\u203a", 1, "Next release"));
      if (st.partial) {
        const p = document.createElement("span");
        p.className = PAGER_CLASS + "__note";
        p.textContent = "first " + MAX_PAGES * 25 + " issues only";
        strip.append(p);
      }
    }
    if (note) {
      const p = document.createElement("span");
      p.className = PAGER_CLASS + "__note";
      p.textContent = "Release sort applies to this page only";
      strip.append(p);
    }
    strip._versions = versions;
    if (old) old.remove();
    host.insertBefore(strip, list);
  }

  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest && e.target.closest("." + PAGER_CLASS + " button");
      if (!el || el.disabled || el.dataset.ghStop === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      goToSelection(el.dataset.ghStop, el.closest("." + PAGER_CLASS)._versions);
    },
    true
  );

  // ----------------------------------------------------------------- main

  function process() {
    if (sort.path !== location.pathname) {
      sort.path = location.pathname;
      setSort(false); // new page: forget the sort
    }
    const rows = collectRows();
    insertIds(rows);
    hideNativeIds(rows);
    hideRepoLinks(rows);
    showRepoBadges(rows);
    alignIds(rows);
    renderReleases(rows);
    applySort(rows);
    renderPager(rows);
    injectSortItem(rows.some((r) => releasesFor(r).length > 0));
  }

  let scheduled = false;
  const observer = new MutationObserver(() => schedule());
  const observe = () =>
    observer.observe(document.documentElement, { childList: true, subtree: true });

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      observer.disconnect(); // don't react to our own DOM changes
      try {
        process();
      } finally {
        observe();
      }
    });
  }

  observe();
  document.addEventListener("turbo:render", schedule);
  document.addEventListener("turbo:load", schedule);
  schedule();
})();
