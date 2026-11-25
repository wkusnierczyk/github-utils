(() => {
  const ID_CLASS = "gh-issue-id";
  const REL_CLASS = "gh-issue-release";
  const NATIVE_HIDDEN = "gh-native-id-hidden";
  const REPO_HIDDEN = "gh-repo-link-hidden";
  // Features that will become user settings.
  const HIDE_REPO_LINK = true;
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
    hideNativeIds(rows);
    hideRepoLinks(rows);
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
