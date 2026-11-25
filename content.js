(() => {
  const ID_CLASS = "gh-issue-id";
  const REL_CLASS = "gh-issue-release";
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

  // True if the row already shows "#N" itself (e.g. repo-level lists).
  function rowShowsId(row, n) {
    const re = new RegExp("^#" + n + "(?!\\d)");
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement && node.parentElement.classList.contains(ID_CLASS)) continue;
      if (re.test(node.nodeValue.trim())) return true;
    }
    return false;
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

  function parseEmbedded(doc) {
    const script = doc.querySelector('script[data-target="react-app.embeddedData"]');
    const releases = new Map();
    if (!script) return releases;
    let json;
    try {
      json = JSON.parse(script.textContent);
    } catch {
      return releases;
    }
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

  function compareVersions(a, b) {
    const x = a.split(".").map(Number);
    const y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
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

  // Clicking a release toggles `label:release:X` in the search query.
  function filterByRelease(version) {
    const u = new URL(location.href);
    let q = u.searchParams.get("q");
    if (!q || !q.trim()) {
      const input = document.getElementById("issues-index-filter-input");
      q = (input && input.value.trim()) || "is:issue state:open";
    }
    const token = FILTER_PREFIX + version;
    const had = q.split(/\s+/).includes(token);
    q = q.replace(/(^|\s)label:"?release:[^\s"]*"?/g, " ").replace(/\s+/g, " ").trim();
    if (!had) q = (q + " " + token).trim();
    u.searchParams.set("q", q);
    u.searchParams.delete("page");
    location.assign(u.href);
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

  // ----------------------------------------------------------------- main

  function process() {
    const rows = collectRows();
    insertIds(rows);
    alignIds(rows);
    renderReleases(rows);
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
