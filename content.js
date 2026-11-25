(() => {
  const ID_CLASS = "gh-issue-id";
  // /owner/repo/issues/123 or /owner/repo/pull/123 (no trailing path)
  const PATH_RE = /^\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)\/?$/;
  const ROW_SELECTOR =
    'li, tr, [role="row"], [role="listitem"], .Box-row, [data-testid="list-row"]';

  // True if the row already shows "#N" somewhere (e.g. repo-level issue lists),
  // so we don't duplicate it.
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

  function process() {
    const seenRows = new WeakSet();
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
      if (!row) continue; // only touch list rows, not issue headers or timeline refs
      if (seenRows.has(row)) continue;
      seenRows.add(row);

      const prev = a.previousElementSibling;
      if (prev && prev.classList.contains(ID_CLASS)) continue; // already done
      if (row.querySelector("." + ID_CLASS)) continue;
      if (rowShowsId(row, m[1])) continue;

      const span = document.createElement("span");
      span.className = ID_CLASS;
      span.textContent = "#" + m[1];
      span.title = url.pathname.split("/").slice(1, 3).join("/") + "#" + m[1];
      a.parentNode.insertBefore(span, a);
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      process();
    });
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener("turbo:render", schedule);
  document.addEventListener("turbo:load", schedule);
  schedule();
})();
