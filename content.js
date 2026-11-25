(() => {
  const ID_CLASS = "gh-issue-id";
  const COL_CLASS = "gh-issue-col";
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

  // ------------------------------------------------------------- criteria

  // Setting: a list of label criteria (edited on the options page). Each has a unique
  // name, a regular expression matched against the whole label name, a separator for
  // joining several capture groups, the column's text alignment, and whether to list
  // its values above the table.
  // Each criterion gets a column before the title, a "Sort by" entry and click-to-filter.
  const SETTING_KEY = "criteria";
  const LEGACY_KEY = "releaseLabelPattern"; // the single release pattern, before 1.7
  const DEFAULT_CRITERIA = [
    { name: "release", pattern: "release:([0-9]+[.][0-9]+[.][0-9]+)", separator: "", align: "right", pager: true },
  ];
  const ALIGNMENTS = ["left", "center", "right"];
  let criteria = []; // compiled: { name, re, separator, align, pager }

  function compileCriteria(list) {
    const out = [];
    const names = new Set();
    for (const c of Array.isArray(list) ? list : []) {
      const name = String((c && c.name) || "").trim();
      if (!name || names.has(name.toLowerCase())) continue;
      let re;
      try {
        re = new RegExp("^(?:" + c.pattern + ")$");
      } catch {
        continue;
      }
      names.add(name.toLowerCase());
      out.push({
        name,
        re,
        separator: String((c && c.separator) ?? ""),
        align: ALIGNMENTS.includes(c && c.align) ? c.align : "right",
        pager: !!(c && c.pager),
      });
    }
    return out;
  }

  // What is shown for a label under criterion c, or null if it doesn't match.
  // No capture group: the whole label. Otherwise the captured groups, in order,
  // joined by the separator. (options.js has the same rule for its preview.)
  function valueOf(c, label) {
    const m = c.re.exec(label);
    if (!m) return null;
    if (m.length === 1) return label;
    return m.slice(1).filter((g) => g !== undefined).join(c.separator) || label;
  }

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

  // Labels of one criterion are identified by their full name, ordered by shown value.
  const compareLabels = (c, a, b) =>
    compareVersions(valueOf(c, a), valueOf(c, b)) || a.localeCompare(b);

  // ---------------------------------------------------------------- data

  // GitHub embeds each list page's data (including issue labels) as JSON. Rows in
  // compact layout don't render labels, so we read them from there.
  const pageData = new Map(); // "path?query" -> Map("owner/repo#n" -> { criterion: [labels] }) | "loading"

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

  // "owner/repo#n" -> { criterion name: [matching label names] }, for the issues in
  // the embedded data that have labels matching some criterion.
  function labelsIn(json) {
    const out = new Map();
    if (!json || !criteria.length) return out;
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
        const found = Object.create(null);
        let any = false;
        for (const l of o.labels) {
          const name = (l && l.name) || "";
          for (const c of criteria) {
            if (valueOf(c, name) === null) continue;
            (found[c.name] = found[c.name] || []).push(name);
            any = true;
          }
        }
        if (repo && any) out.set(repo.toLowerCase() + "#" + o.number, found);
        return;
      }
      for (const k of Object.keys(o)) visit(o[k], depth + 1);
    };
    visit(json, 0);
    return out;
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

  const parseEmbedded = (doc) => labelsIn(embeddedJson(doc));

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

  function labelsFor(entry, c) {
    const data = pageData.get(pageKey());
    if (!(data instanceof Map)) return [];
    const found = data.get(entry.repo.toLowerCase() + "#" + entry.n);
    return (found && found[c.name]) || [];
  }

  const sortedLabels = (entry, c) =>
    labelsFor(entry, c).slice().sort((a, b) => compareLabels(c, a, b));

  // -------------------------------------------------------------- columns

  const findCol = (row, name) =>
    [...row.querySelectorAll("." + COL_CLASS)].find((s) => s.dataset.ghCrit === name);

  // Keep [id, one column per criterion in settings order] directly before the title.
  function orderBeforeTitle(row, a) {
    const want = [row.querySelector("." + ID_CLASS), ...criteria.map((c) => findCol(row, c.name))].filter(
      Boolean
    );
    let cur = a.previousElementSibling;
    let ok = true;
    for (let i = want.length - 1; i >= 0 && ok; i--) {
      if (cur !== want[i]) ok = false;
      else cur = cur.previousElementSibling;
    }
    if (!ok) want.forEach((el) => a.parentNode.insertBefore(el, a));
  }

  function renderColumns(rows) {
    ensurePageData();
    const known = new Set(criteria.map((c) => c.name));
    document.querySelectorAll("." + COL_CLASS).forEach((el) => {
      if (!known.has(el.dataset.ghCrit)) el.remove(); // criterion removed in settings
    });
    for (const [list, entries] of groupByList(rows)) {
      criteria.forEach((c, i) => {
        const found = entries.map((e) => ({ e, labels: sortedLabels(e, c) }));
        const any = found.some((f) => f.labels.length);
        const spans = [];
        for (const { e, labels } of found) {
          let span = findCol(e.row, c.name);
          if (!any) {
            if (span) span.remove(); // no values in view: reserve no space
            continue;
          }
          if (!span) {
            span = document.createElement("span");
            span.className = COL_CLASS;
            span.dataset.ghCrit = c.name;
            e.a.parentNode.insertBefore(span, e.a);
          }
          const lowest = labels[0] || "";
          const text = lowest ? valueOf(c, lowest) : "";
          const multi = labels.length > 1;
          if (span.textContent !== text) span.textContent = text;
          if (span.dataset.ghAlign !== c.align) span.dataset.ghAlign = c.align;
          if (span.dataset.ghLabel !== lowest) span.dataset.ghLabel = lowest;
          span.classList.toggle(COL_CLASS + "--multi", multi);
          const title = !lowest
            ? ""
            : multi
            ? "Several " + c.name + " values: " + labels.map((l) => valueOf(c, l)).join(", ") +
              " (showing the lowest). Click to filter."
            : "Filter by " + c.name + " " + text;
          if (span.title !== title) span.title = title;
          spans.push(span);
        }
        fitWidth(list, spans, "ghColSig" + i);
      });
      for (const e of entries) orderBeforeTitle(e.row, e.a);
    }
  }

  // ------------------------------------------------------------- filtering

  // label:NAME, -label:NAME, label:"NAME WITH SPACES" in a search query.
  const LABEL_TOKEN = /(^|\s)(-?)label:(?:"([^"]*)"|(\S+))/g;
  const labelToken = (label, negate) =>
    (negate ? "-" : "") + "label:" + (/[\s"]/.test(label) ? '"' + label + '"' : label);

  // The search query with every filter of criterion c (positive or negated) removed.
  function baseQuery(c) {
    const u = new URL(location.href);
    let q = u.searchParams.get("q");
    if (!q || !q.trim()) {
      const input = document.getElementById("issues-index-filter-input");
      q = (input && input.value.trim()) || "is:issue state:open";
    }
    return q
      .replace(LABEL_TOKEN, (all, pre, neg, quoted, bare) =>
        valueOf(c, quoted ?? bare) !== null ? " " : all
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  // What the query currently selects for c: "" (nothing), a label, or NONE.
  const NONE = "none";
  function currentSelection(c) {
    const q = new URL(location.href).searchParams.get("q") || "";
    let sel = "";
    for (const m of q.matchAll(LABEL_TOKEN)) {
      const name = m[3] ?? m[4];
      if (valueOf(c, name) === null) continue;
      if (!m[2]) return name;
      sel = NONE;
    }
    return sel;
  }

  // Go to the same list filtered to `selection` for c (a label, NONE, or "" for all).
  // Other criteria's filters stay. NONE excludes every known label of c, since search
  // has no label wildcard.
  function goToSelection(c, selection, knownLabels) {
    const u = new URL(location.href);
    let q = baseQuery(c);
    if (selection === NONE) {
      q = (q + " " + knownLabels.map((l) => labelToken(l, true)).join(" ")).trim();
    } else if (selection) {
      q = (q + " " + labelToken(selection, false)).trim();
    }
    u.searchParams.set("q", q);
    u.searchParams.delete("page");
    location.assign(u.href);
  }

  // Clicking a value in a column toggles its filter.
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest && e.target.closest("." + COL_CLASS);
      if (!el || !el.dataset.ghLabel) return;
      const c = criteria.find((x) => x.name === el.dataset.ghCrit);
      if (!c) return;
      e.preventDefault();
      e.stopPropagation();
      goToSelection(c, currentSelection(c) === el.dataset.ghLabel ? "" : el.dataset.ghLabel);
    },
    true
  );

  // ----------------------------------------------------------------- sort

  // Adds one entry per criterion to GitHub's "Sort by" menu. It reorders the rows on
  // the page (GitHub paginates, so other pages are not affected) with CSS `order`, so
  // GitHub's own DOM nodes are never moved. Oldest = lowest first, Newest = highest
  // first; issues without a value go last either way. Kept per tab and page, so it
  // survives the reload caused by clicking a value.
  const SORT_KEY = "gh-utils-sort";
  const SORT_ATTR = "data-gh-sort-crit";
  const sort = { crit: null, dir: "desc", path: location.pathname };
  try {
    const saved = JSON.parse(sessionStorage.getItem(SORT_KEY) || "null");
    if (saved && saved.path === location.pathname && typeof saved.crit === "string") {
      sort.crit = saved.crit;
      sort.dir = saved.dir === "asc" ? "asc" : "desc";
    }
  } catch {
    /* storage unavailable: sort just won't persist */
  }

  function setSort(crit, dir) {
    sort.crit = crit;
    if (dir) sort.dir = dir;
    try {
      if (crit) sessionStorage.setItem(SORT_KEY, JSON.stringify({ path: sort.path, crit, dir: sort.dir }));
      else sessionStorage.removeItem(SORT_KEY);
    } catch {
      /* ignore */
    }
    schedule();
  }

  function applySort(rows) {
    const c = criteria.find((x) => x.name === sort.crit);
    for (const [list, entries] of groupByList(rows)) {
      const keyed = entries.map((e) => ({ e, v: c ? sortedLabels(e, c)[0] || "" : "" }));
      if (!(c && keyed.some((k) => k.v))) {
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
        if (!x.v !== !y.v) return x.v ? -1 : 1; // no value last, in both directions
        const byValue = x.v && y.v ? compareLabels(c, x.v, y.v) : 0;
        return sign * byValue || sign * (x.e.n - y.e.n);
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

  // `present`: names of the criteria that have a value in view; others get no entry.
  function injectSortItems(present) {
    const group = document.querySelector('ul[role="group"][aria-label="Sort by"]');
    if (!group) return;
    const ours = new Map();
    group.querySelectorAll("[" + SORT_ATTR + "]").forEach((li) => {
      const name = li.getAttribute(SORT_ATTR);
      if (present.has(name) && !ours.has(name)) ours.set(name, li);
      else li.remove();
    });
    const items = [...group.querySelectorAll(':scope > li[role="menuitemradio"]')].filter(
      (li) => !li.hasAttribute(SORT_ATTR)
    );
    const template =
      items.find((li) => li.textContent.trim() === "Total comments") || items[1] || items[0];
    if (!template) return;
    let anchor = template;
    for (const c of criteria) {
      if (!present.has(c.name)) continue;
      let li = ours.get(c.name);
      if (!li) {
        li = template.cloneNode(true);
        li.removeAttribute("id");
        li.setAttribute(SORT_ATTR, c.name);
        li.setAttribute("tabindex", "-1");
        const label = template.textContent.trim();
        li.querySelectorAll("span").forEach((sp) => {
          if (!sp.children.length && sp.textContent.trim() === label) sp.textContent = c.name;
        });
      }
      if (anchor.nextElementSibling !== li) anchor.after(li);
      anchor = li;
      const want = sort.crit === c.name ? "true" : "false";
      if (li.getAttribute("aria-checked") !== want) li.setAttribute("aria-checked", want);
    }
    if (sort.crit && present.has(sort.crit)) {
      for (const li of items) {
        if (li.getAttribute("aria-checked") !== "false") li.setAttribute("aria-checked", "false");
      }
    }
  }

  function orderFromMenu() {
    const og = document.querySelector('ul[role="group"][aria-label="Order"]');
    const checked = og && og.querySelector('li[aria-checked="true"]');
    return checked && /Oldest/.test(checked.textContent) ? "asc" : "desc";
  }

  function activateSort(name) {
    const dir = orderFromMenu();
    const trigger = document.querySelector('button[aria-haspopup][aria-expanded="true"]');
    setSort(name, dir);
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
        activateSort(li.getAttribute(SORT_ATTR));
        return;
      }
      const label = li.parentElement && li.parentElement.getAttribute("aria-label");
      if (label === "Sort by" && sort.crit) {
        setSort(null); // another sort chosen: hand control back to GitHub
      } else if (label === "Order") {
        sort.dir = /Oldest/.test(li.textContent) ? "asc" : "desc";
        if (sort.crit) setSort(sort.crit, sort.dir);
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
      activateSort(li.getAttribute(SORT_ATTR));
    },
    true
  );

  // --------------------------------------------------------------- pagers

  // GitHub paginates, and search can't order or page by label, so a true label-ordered
  // page isn't possible. Instead, for criteria with "list above the table" on, we read
  // every page of the current query in the background (just the labels) and show a
  // strip above the list: one chip per value with its issue count, "no X" for the
  // rest, and previous/next to step through them in order. Each stop is an ordinary
  // GitHub filter (label:NAME), so the page itself stays GitHub's.
  const PAGERS_CLASS = "gh-pagers";
  const PAGER_CLASS = "gh-label-pager";
  const MAX_PAGES = 40; // 1000 issues; beyond that the counts are partial
  const CONCURRENCY = 4;
  const loaded = new Map(); // "path?query" -> { done, items, total, pages, partial }

  function loadAll(base) {
    const key = location.pathname + "?" + base;
    if (loaded.has(key)) return loaded.get(key);
    const st = { done: false, items: new Map(), total: 0, pages: 1, partial: false };
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
    const merge = (json) => labelsIn(json).forEach((v, k) => st.items.set(k, v));
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

  // What to show for criterion c, or null for nothing.
  function pagerSpec(c, paginated) {
    const note = sort.crit === c.name && paginated;
    if (!c.pager && !note) return null;
    const st = loadAll(baseQuery(c));
    const labels = [...new Set([...st.items.values()].flatMap((f) => f[c.name] || []))].sort(
      (a, b) => compareLabels(c, a, b)
    );
    const showList = st.done && labels.length > 0;
    if (!note && !showList) return null;
    const counts = new Map(labels.map((l) => [l, 0]));
    let withValue = 0;
    for (const f of st.items.values()) {
      if (!f[c.name]) continue;
      withValue++;
      for (const l of new Set(f[c.name])) counts.set(l, counts.get(l) + 1);
    }
    const none = Math.max(0, st.total - withValue);
    const sel = currentSelection(c);
    const sig = JSON.stringify([c.name, labels, [...counts.values()], none, sel, note, showList, st.partial]);
    return { c, labels, counts, none, sel, note, showList, partial: st.partial, sig };
  }

  function buildStrip(spec) {
    const { c, labels, counts, none, sel, note, showList, partial } = spec;
    const strip = document.createElement("div");
    strip.className = PAGER_CLASS;
    strip._crit = c;
    strip._labels = labels;
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = PAGER_CLASS + "__" + cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    // Stops in order; "" (all) is where you are when nothing is selected.
    const stops = labels.concat(none ? [NONE] : []);
    const at = sel ? stops.indexOf(sel) : -1;
    const step = (text, dir, title) => {
      const b = el("button", "step", text);
      b.type = "button";
      b.title = title;
      // From "all", only next is possible (to the first stop).
      const target = at < 0 ? (dir > 0 ? 0 : -1) : at + dir;
      b.disabled = target < 0 || target >= stops.length;
      if (!b.disabled) b.dataset.ghStop = stops[target];
      return b;
    };
    const chip = (value, text, count) => {
      const b = el("button", "chip" + (sel === value ? " " + PAGER_CLASS + "__chip--on" : ""), text + " ");
      b.type = "button";
      b.dataset.ghStop = sel === value ? "" : value; // clicking the active chip clears it
      b.append(el("span", "", String(count)));
      return b;
    };
    // Two cells (name, values) laid out by the .gh-pagers grid.
    const values = el("div", "values");
    if (showList) {
      values.append(step("‹", -1, "Previous " + c.name));
      labels.forEach((l) => values.append(chip(l, valueOf(c, l), counts.get(l))));
      if (none) values.append(chip(NONE, "no " + c.name, none));
      values.append(step("›", 1, "Next " + c.name));
      if (partial) values.append(el("span", "note", "first " + MAX_PAGES * 25 + " issues only"));
    }
    if (note) values.append(el("span", "note", c.name + " sort applies to this page only"));
    strip.append(el("div", "name", c.name), values);
    return strip;
  }

  function renderPagers(rows) {
    const list = rows.length ? rows[0].row.parentElement : null;
    const host = list && list.parentElement;
    const old = document.querySelector("." + PAGERS_CLASS);
    if (!list || !host || !REPO_PAGE_RE.test(location.pathname)) {
      if (old) old.remove();
      return;
    }
    const paginated = isPaginated();
    const specs = criteria.map((c) => pagerSpec(c, paginated)).filter(Boolean);
    if (!specs.length) {
      if (old) old.remove();
      return;
    }
    const sig = specs.map((s) => s.sig).join("|");
    if (old && old.dataset.sig === sig && old.nextElementSibling === list) return;
    const wrap = document.createElement("div");
    wrap.className = PAGERS_CLASS;
    wrap.dataset.sig = sig;
    specs.forEach((s) => wrap.append(buildStrip(s)));
    if (old) old.remove();
    host.insertBefore(wrap, list);
  }

  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest && e.target.closest("." + PAGER_CLASS + " button");
      if (!el || el.disabled || el.dataset.ghStop === undefined) return;
      const strip = el.closest("." + PAGER_CLASS);
      e.preventDefault();
      e.stopPropagation();
      goToSelection(strip._crit, el.dataset.ghStop, strip._labels);
    },
    true
  );

  // ----------------------------------------------------------------- main

  function process() {
    if (sort.path !== location.pathname) {
      sort.path = location.pathname;
      setSort(null); // new page: forget the sort
    }
    const rows = collectRows();
    insertIds(rows);
    hideNativeIds(rows);
    hideRepoLinks(rows);
    showRepoBadges(rows);
    alignIds(rows);
    renderColumns(rows);
    applySort(rows);
    renderPagers(rows);
    const present = new Set(
      criteria.filter((c) => rows.some((r) => labelsFor(r, c).length)).map((c) => c.name)
    );
    injectSortItems(present);
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

  // Apply (new) criteria: forget everything read with the old ones.
  function applyCriteria(list, initial) {
    criteria = compileCriteria(list);
    pageData.clear();
    loaded.clear();
    // On first load, reuse the data embedded in this page: no extra request.
    if (initial) pageData.set(pageKey(), parseEmbedded(document));
    document.querySelectorAll("." + PAGERS_CLASS).forEach((el) => el.remove());
    schedule();
  }

  // Settings from storage; the old single release pattern becomes a "release" entry.
  function criteriaFrom(v) {
    if (v && Array.isArray(v[SETTING_KEY])) return v[SETTING_KEY];
    if (v && v[LEGACY_KEY]) {
      return [{ name: "release", pattern: v[LEGACY_KEY], separator: "", pager: true }];
    }
    return DEFAULT_CRITERIA;
  }

  function start() {
    observe();
    document.addEventListener("turbo:render", schedule);
    document.addEventListener("turbo:load", schedule);
    schedule();
  }

  try {
    chrome.storage.sync.get([SETTING_KEY, LEGACY_KEY], (v) => {
      applyCriteria(criteriaFrom(v), true);
      start();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !(SETTING_KEY in changes)) return;
      applyCriteria(criteriaFrom({ [SETTING_KEY]: changes[SETTING_KEY].newValue }), false);
    });
  } catch {
    applyCriteria(DEFAULT_CRITERIA, true); // no extension storage: defaults
    start();
  }
})();
