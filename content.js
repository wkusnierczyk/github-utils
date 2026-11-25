(() => {
  const ID_CLASS = "gh-issue-id";
  // /owner/repo/issues/123 or /owner/repo/pull/123 (no trailing path)
  const PATH_RE = /^\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)\/?$/;
  const ROW_SELECTOR =
    'li, tr, [role="row"], [role="listitem"], .Box-row, [data-testid="list-row"]';

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
      const prev = a.previousElementSibling;
      if (prev && prev.classList.contains(ID_CLASS)) continue; // already done
      if (row.querySelector("." + ID_CLASS)) continue;
      if (rowShowsId(row, n)) continue;
      const span = document.createElement("span");
      span.className = ID_CLASS;
      span.textContent = "#" + n;
      span.title = repo + "#" + n;
      a.parentNode.insertBefore(span, a);
    }
  }

  // Give every id in a list the width of the widest one (right-aligned via CSS).
  function alignIds(rows) {
    for (const [list, entries] of groupByList(rows)) {
      const spans = entries
        .map((e) => e.row.querySelector("." + ID_CLASS))
        .filter(Boolean);
      if (!spans.length) continue;
      const sig = spans.length + ":" + Math.max(...spans.map((s) => s.textContent.length));
      const allSized = spans.every((s) => s.style.minWidth);
      if (list.dataset.ghIdSig === sig && allSized) continue;
      spans.forEach((s) => (s.style.minWidth = ""));
      const w = Math.ceil(Math.max(...spans.map((s) => s.getBoundingClientRect().width)));
      spans.forEach((s) => (s.style.minWidth = w + "px"));
      list.dataset.ghIdSig = sig;
    }
  }

  function process() {
    const rows = collectRows();
    insertIds(rows);
    alignIds(rows);
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
