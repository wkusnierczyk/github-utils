const DEFAULT_PATTERN = "release:([0-9]+[.][0-9]+[.][0-9]+)";
const SETTING_KEY = "releaseLabelPattern";

const $ = (id) => document.getElementById(id);
const pattern = $("pattern");

function compile(p) {
  try {
    return { re: new RegExp("^(?:" + p + ")$") };
  } catch (e) {
    return { error: e.message };
  }
}

// Same rule as content.js: first capture group, else the whole label.
function preview() {
  const { re, error } = compile(pattern.value);
  $("error").textContent = error ? error : "";
  $("save").disabled = !!error || !pattern.value;
  const label = $("sample").value;
  const m = re && re.exec(label);
  $("result").textContent = !re
    ? ""
    : m
    ? "Release, shown as: " + (m[1] !== undefined ? m[1] : label)
    : "Not a release label.";
  $("ok").textContent = "";
}

pattern.addEventListener("input", preview);
$("sample").addEventListener("input", preview);

$("save").addEventListener("click", () => {
  chrome.storage.sync.set({ [SETTING_KEY]: pattern.value }, () => {
    $("ok").textContent = "Saved. Open GitHub tabs update on their own.";
  });
});

$("reset").addEventListener("click", () => {
  pattern.value = DEFAULT_PATTERN;
  preview();
});

chrome.storage.sync.get({ [SETTING_KEY]: DEFAULT_PATTERN }, (v) => {
  pattern.value = v[SETTING_KEY] || DEFAULT_PATTERN;
  preview();
});
