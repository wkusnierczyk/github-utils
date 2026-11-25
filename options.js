const SETTING_KEY = "criteria";
const LEGACY_KEY = "releaseLabelPattern"; // single release pattern, before 1.7
const DEFAULT_CRITERIA = [
  { name: "release", pattern: "release:([0-9]+[.][0-9]+[.][0-9]+)", separator: "", pager: true },
];

const $ = (id) => document.getElementById(id);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let rows = []; // [{ el, auto }]  (auto: pattern still follows the name)

function compile(p) {
  try {
    return { re: new RegExp("^(?:" + p + ")$") };
  } catch (e) {
    return { error: e.message };
  }
}

// Same rule as content.js: no group -> whole label; else captures joined by separator.
function shown(re, separator, label) {
  const m = re.exec(label);
  if (!m) return null;
  if (m.length === 1) return label;
  return m.slice(1).filter((g) => g !== undefined).join(separator) || label;
}

const field = (row, name) => row.el.querySelector("[name=" + name + "]");

function read(row) {
  return {
    name: field(row, "name").value.trim(),
    pattern: field(row, "pattern").value,
    separator: field(row, "separator").value,
    pager: field(row, "pager").checked,
  };
}

// Validate everything, update previews, enable/disable Save.
function refresh() {
  const seen = new Set();
  let bad = false;
  for (const row of rows) {
    const c = read(row);
    let err = "";
    if (!c.name) err = "A name is required.";
    else if (seen.has(c.name.toLowerCase())) err = "Names must be unique.";
    seen.add(c.name.toLowerCase());
    const { re, error } = compile(c.pattern);
    if (!err && !c.pattern) err = "A pattern is required.";
    if (!err && error) err = error;
    row.el.querySelector(".error").textContent = err;
    const sample = field(row, "sample").value;
    const m = re && sample ? shown(re, c.separator, sample) : undefined;
    row.el.querySelector(".result").textContent =
      !re || !sample ? "" : m === null ? "Not matched." : "Shown as: " + m;
    if (err) bad = true;
  }
  $("save").disabled = bad;
  $("ok").textContent = "";
}

function move(row, dir) {
  const i = rows.indexOf(row);
  const j = i + dir;
  if (j < 0 || j >= rows.length) return;
  rows.splice(i, 1);
  rows.splice(j, 0, row);
  rows.forEach((r) => $("list").append(r.el)); // re-append in new order
  refresh();
}

function addRow(c) {
  const el = document.createElement("fieldset");
  el.innerHTML = `
    <div class="grid">
      <label>Name</label><input type="text" name="name" spellcheck="false" autocomplete="off">
      <label>Pattern</label><input type="text" name="pattern" spellcheck="false" autocomplete="off">
      <label>Separator</label><input type="text" name="separator" spellcheck="false" autocomplete="off">
      <label>List above table</label><span><input type="checkbox" name="pager"> a clickable list of values with counts</span>
      <label>Try a label</label><input type="text" name="sample" spellcheck="false" autocomplete="off">
    </div>
    <p class="result"></p><p class="error"></p>
    <div class="bar">
      <button type="button" data-act="up" title="Move up">↑</button>
      <button type="button" data-act="down" title="Move down">↓</button>
      <button type="button" data-act="remove">Remove</button>
    </div>`;
  const row = { el, auto: !c.pattern };
  field(row, "name").value = c.name || "";
  field(row, "pattern").value = c.pattern || "";
  field(row, "separator").value = c.separator || "";
  field(row, "pager").checked = !!c.pager;
  field(row, "sample").value = c.sample || "";
  field(row, "name").addEventListener("input", () => {
    // A new criterion's pattern follows its name until the pattern is edited.
    if (row.auto) {
      const n = field(row, "name").value.trim();
      field(row, "pattern").value = n ? escapeRe(n) + ":(.+)" : "";
    }
    refresh();
  });
  field(row, "pattern").addEventListener("input", () => {
    row.auto = false;
    refresh();
  });
  el.addEventListener("input", (e) => {
    if (e.target.name === "separator" || e.target.name === "sample" || e.target.name === "pager") refresh();
  });
  el.addEventListener("click", (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (act === "up") move(row, -1);
    else if (act === "down") move(row, 1);
    else if (act === "remove") {
      rows.splice(rows.indexOf(row), 1);
      el.remove();
      refresh();
    }
  });
  rows.push(row);
  $("list").append(el);
  return row;
}

function setAll(list) {
  rows = [];
  $("list").textContent = "";
  list.forEach(addRow);
  refresh();
}

$("add").addEventListener("click", () => {
  const row = addRow({ pager: false });
  field(row, "name").focus();
  refresh();
});

$("reset").addEventListener("click", () => setAll(DEFAULT_CRITERIA));

$("save").addEventListener("click", () => {
  const list = rows.map(read).map(({ name, pattern, separator, pager }) => ({ name, pattern, separator, pager }));
  chrome.storage.sync.set({ [SETTING_KEY]: list }, () => {
    chrome.storage.sync.remove(LEGACY_KEY);
    $("ok").textContent = "Saved. Open GitHub tabs update on their own.";
  });
});

chrome.storage.sync.get([SETTING_KEY, LEGACY_KEY], (v) => {
  if (Array.isArray(v[SETTING_KEY])) setAll(v[SETTING_KEY]);
  else if (v[LEGACY_KEY]) setAll([{ name: "release", pattern: v[LEGACY_KEY], separator: "", pager: true }]);
  else setAll(DEFAULT_CRITERIA);
});
