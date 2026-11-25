const SETTING_KEY = "criteria";
const PRESETS_KEY = "presets";
const LEGACY_KEY = "releaseLabelPattern"; // single release pattern, before 1.7
const ALIGNMENTS = ["left", "center", "right"];
const DEFAULT_CRITERIA = [
  {
    name: "release",
    pattern: "release:([0-9]+[.][0-9]+[.][0-9]+)",
    separator: "",
    align: "right",
    enabled: true,
    column: true,
    pager: true,
  },
];

const $ = (id) => document.getElementById(id);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let rows = []; // criteria: [{ el, auto }]  (auto: pattern still follows the name)
let presets = []; // [{ th, members: Set(row) }], in column order
let matrixSig = "";

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
const pfield = (p, name) => p.th.querySelector("[name=" + name + "]");

function read(row) {
  return {
    name: field(row, "name").value.trim(),
    pattern: field(row, "pattern").value,
    separator: field(row, "separator").value,
    align: field(row, "align").value,
    enabled: field(row, "enabled").checked,
    column: field(row, "column").checked,
    pager: field(row, "pager").checked,
  };
}

function readPreset(p) {
  return {
    name: pfield(p, "pname").value.trim(),
    enabled: pfield(p, "penabled").checked,
    repos: pfield(p, "prepos")
      .value.split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    criteria: rows.filter((r) => p.members.has(r)).map((r) => read(r).name),
  };
}

// Everything the page currently holds, as it would be saved.
function collect() {
  return { criteria: rows.map(read), presets: presets.map(readPreset) };
}

// Validate everything, update previews and the matrix, enable/disable Save.
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
  rows.forEach((r) => r.el.classList.toggle("off", !field(r, "enabled").checked));

  const pseen = new Set();
  for (const p of presets) {
    const name = pfield(p, "pname").value.trim();
    let err = "";
    if (!name) err = "A name is required.";
    else if (pseen.has(name.toLowerCase())) err = "Names must be unique.";
    pseen.add(name.toLowerCase());
    p.th.querySelector(".error").textContent = err;
    p.th.classList.toggle("off", !pfield(p, "penabled").checked);
    if (err) bad = true;
  }

  renderMatrix();
  $("save").disabled = bad;
  $("ok").textContent = "";
}

// ---------------------------------------------------------------- criteria

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
      <label>Enabled</label><span><input type="checkbox" name="enabled"> use this criterion ('off' keeps its settings saved, but does not apply it)</span>
      <label>Pattern</label><input type="text" name="pattern" spellcheck="false" autocomplete="off">
      <label>Separator</label><input type="text" name="separator" spellcheck="false" autocomplete="off">
      <label>Try a label</label><input type="text" name="sample" spellcheck="false" autocomplete="off">
      <label>Column</label><span><input type="checkbox" name="column"> show a column of values before the title</span>
      <label>Alignment</label>
      <select name="align"><option value="left">left</option><option value="center">center</option><option value="right">right</option></select>
      <label>Value list</label><span><input type="checkbox" name="pager"> show a clickable list of values with counts above the table</span>
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
  field(row, "align").value = ALIGNMENTS.includes(c.align) ? c.align : "right";
  field(row, "enabled").checked = c.enabled !== false;
  field(row, "column").checked = c.column !== false;
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
    if (["separator", "sample", "pager", "align", "enabled", "column"].includes(e.target.name)) refresh();
  });
  el.addEventListener("click", (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (act === "up") move(row, -1);
    else if (act === "down") move(row, 1);
    else if (act === "remove") {
      rows.splice(rows.indexOf(row), 1);
      presets.forEach((p) => p.members.delete(row));
      el.remove();
      refresh();
    }
  });
  rows.push(row);
  $("list").append(el);
  return row;
}

// ----------------------------------------------------------------- presets

function movePreset(p, dir) {
  const i = presets.indexOf(p);
  const j = i + dir;
  if (j < 0 || j >= presets.length) return;
  presets.splice(i, 1);
  presets.splice(j, 0, p);
  matrixSig = ""; // force a rebuild in the new order
  refresh();
}

function addPreset(p, members) {
  const th = document.createElement("th");
  th.scope = "col";
  th.innerHTML = `
    <input type="text" name="pname" placeholder="preset name" spellcheck="false" autocomplete="off">
    <label><input type="checkbox" name="penabled"> enabled</label>
    <textarea name="prepos" rows="3" spellcheck="false" placeholder="owner/repo or a pattern, one per line"></textarea>
    <div class="bar">
      <button type="button" data-act="pleft" title="Move left">←</button>
      <button type="button" data-act="pright" title="Move right">→</button>
      <button type="button" data-act="premove">Remove</button>
    </div>
    <p class="error"></p>`;
  const preset = { th, members: members || new Set() };
  pfield(preset, "pname").value = p.name || "";
  pfield(preset, "penabled").checked = p.enabled !== false;
  pfield(preset, "prepos").value = (p.repos || []).join("\n");
  th.addEventListener("input", refresh);
  th.addEventListener("click", (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (act === "pleft") movePreset(preset, -1);
    else if (act === "pright") movePreset(preset, 1);
    else if (act === "premove") {
      presets.splice(presets.indexOf(preset), 1);
      th.remove();
      matrixSig = "";
      refresh();
    }
  });
  presets.push(preset);
  return preset;
}

// Criteria as rows, presets as columns, a checkbox per pair. The preset headers are
// kept (they hold inputs); only the body is rebuilt, and only when its shape changes.
function renderMatrix() {
  const names = rows.map((r) => [read(r).name, field(r, "enabled").checked]);
  const sig = JSON.stringify([names, presets.length]);
  const head = $("mhead");
  const body = $("mbody");
  // Header cells in preset order; only moved when the order differs, so a focused
  // input isn't disturbed while typing.
  const cells = [...head.children].filter((c) => !c.classList.contains("corner"));
  if (cells.length !== presets.length || presets.some((p, i) => cells[i] !== p.th)) {
    presets.forEach((p) => head.append(p.th));
  }
  if (sig === matrixSig) return;
  matrixSig = sig;
  body.textContent = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    const c = read(row);
    th.textContent = c.name || "(unnamed)";
    if (!c.enabled) {
      const small = document.createElement("small");
      small.textContent = " (off globally)";
      th.append(small);
    }
    tr.append(th);
    presets.forEach((p) => {
      const td = document.createElement("td");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = p.members.has(row);
      box.title = (c.name || "(unnamed)") + " in " + (pfield(p, "pname").value || "this preset");
      box.addEventListener("change", () => {
        if (box.checked) p.members.add(row);
        else p.members.delete(row);
      });
      td.append(box);
      tr.append(td);
    });
    body.append(tr);
  });
}

// ------------------------------------------------------------ load and save

function setAll(criteriaList, presetList) {
  rows = [];
  presets = [];
  $("list").textContent = "";
  $("mhead").querySelectorAll("th:not(.corner)").forEach((th) => th.remove());
  criteriaList.forEach(addRow);
  const byName = new Map(rows.map((r) => [read(r).name.toLowerCase(), r]));
  (presetList || []).forEach((p) => {
    const members = new Set();
    for (const n of p.criteria || []) {
      const r = byName.get(String(n).trim().toLowerCase());
      if (r) members.add(r);
    }
    addPreset(p, members);
  });
  matrixSig = "";
  refresh();
}

$("add").addEventListener("click", () => {
  const row = addRow({ enabled: true, column: true, pager: false });
  field(row, "name").focus();
  refresh();
});

$("padd").addEventListener("click", () => {
  const p = addPreset({ enabled: true });
  pfield(p, "pname").focus();
  matrixSig = "";
  refresh();
});

$("reset").addEventListener("click", () => setAll(DEFAULT_CRITERIA, []));

$("save").addEventListener("click", () => {
  chrome.storage.sync.set(collect(), () => {
    chrome.storage.sync.remove(LEGACY_KEY);
    $("ok").textContent = "Saved. Open GitHub tabs update on their own.";
  });
});

// ------------------------------------------------------------ export, import

$("export").addEventListener("click", () => {
  const data = { app: "github-utils", version: 1, ...collect() };
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "github-utils-settings.json";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $("io").textContent = "Exported.";
});

// Check an imported file and keep only what we know; throws a readable Error.
function sanitize(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not a settings file");
  if (!Array.isArray(data.criteria)) throw new Error("no list of criteria");
  const str = (v) => (typeof v === "string" ? v : "");
  const criteria = data.criteria.map((c, i) => {
    if (!c || typeof c !== "object") throw new Error("criterion " + (i + 1) + " is not an object");
    const out = {
      name: str(c.name).trim(),
      pattern: str(c.pattern),
      separator: str(c.separator),
      align: ALIGNMENTS.includes(c.align) ? c.align : "right",
      enabled: c.enabled !== false,
      column: c.column !== false,
      pager: !!c.pager,
    };
    if (!out.name) throw new Error("criterion " + (i + 1) + " has no name");
    if (!out.pattern) throw new Error("criterion '" + out.name + "' has no pattern");
    return out;
  });
  const list = Array.isArray(data.presets) ? data.presets : [];
  const presets = list.map((p, i) => {
    if (!p || typeof p !== "object") throw new Error("preset " + (i + 1) + " is not an object");
    const strs = (a) => (Array.isArray(a) ? a.map(str).map((s) => s.trim()).filter(Boolean) : []);
    const out = { name: str(p.name).trim(), enabled: p.enabled !== false, repos: strs(p.repos), criteria: strs(p.criteria) };
    if (!out.name) throw new Error("preset " + (i + 1) + " has no name");
    return out;
  });
  return { criteria, presets };
}

$("import").addEventListener("click", () => $("file").click());

$("file").addEventListener("change", () => {
  const file = $("file").files && $("file").files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const { criteria, presets: list } = sanitize(JSON.parse(reader.result));
      setAll(criteria, list);
      $("io").textContent =
        "Imported " + criteria.length + " criteria and " + list.length + " presets. Review, then click Save to apply.";
    } catch (e) {
      $("io").textContent = "Import failed: " + e.message + ". Nothing was changed.";
    }
    $("file").value = "";
  };
  reader.onerror = () => {
    $("io").textContent = "Import failed: the file could not be read.";
  };
  reader.readAsText(file);
});

chrome.storage.sync.get([SETTING_KEY, PRESETS_KEY, LEGACY_KEY], (v) => {
  const list = Array.isArray(v[SETTING_KEY])
    ? v[SETTING_KEY]
    : v[LEGACY_KEY]
    ? [{ name: "release", pattern: v[LEGACY_KEY], pager: true }]
    : DEFAULT_CRITERIA;
  setAll(list, Array.isArray(v[PRESETS_KEY]) ? v[PRESETS_KEY] : []);
});
