/**
 * main.js — HybridNote AI UI logic.
 *
 * Two analysis passes, both through Firebase AI Logic:
 *   Instant → hybrid model (PREFER_ON_DEVICE). The badge is rendered from
 *             result.response.inferenceSource, so it always states which
 *             model actually answered — never an assumption.
 *   Deep    → cloud model (ONLY_IN_CLOUD) with a JSON response schema.
 *
 * All model/user text is inserted with textContent (no innerHTML), and
 * every async path is wrapped so failures land in a labelled state.
 */

import {
  initFirebase,
  ensureAppCheck,
  createInstantModel,
  createDeepModel,
  probeOnDeviceAvailability,
  firebaseState,
  InferenceSource,
} from "./firebase-init.js";
import { SAMPLE_TEXT } from "./sample-data.js";

/* ------------------------------------------------------------------ */
/* Element refs                                                        */
/* ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const els = {
  deviceStatus: $("deviceStatus"),
  deviceStatusText: $("deviceStatusText"),
  configStatus: $("configStatus"),
  configStatusText: $("configStatusText"),
  demoBanner: $("demoBanner"),
  docInput: $("docInput"),
  charCount: $("charCount"),
  inputNote: $("inputNote"),
  fileInput: $("fileInput"),
  sampleBtn: $("sampleBtn"),
  clearBtn: $("clearBtn"),
  instantBtn: $("instantBtn"),
  deepBtn: $("deepBtn"),
  instantStatus: $("instantStatus"),
  instantBody: $("instantBody"),
  instantBadge: $("instantBadge"),
  instantLatency: $("instantLatency"),
  deepBody: $("deepBody"),
  deepBadge: $("deepBadge"),
  deepLatency: $("deepLatency"),
  meterFillOnDevice: $("meterFillOnDevice"),
  meterFillCloud: $("meterFillCloud"),
  meterLast: $("meterLast"),
  meterOnDeviceCount: $("meterOnDeviceCount"),
  meterCloudCount: $("meterCloudCount"),
};

const INSTANT_CHAR_LIMIT = 8000; // sensible ceiling for an on-device pass
const DEEP_CHAR_LIMIT = 60000;
const DEVICE_INIT_TIMEOUT_MS = 12000;
const REQUEST_TIMEOUT_MS = 120000;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function setBadge(badgeEl, kind, text) {
  badgeEl.className = `badge badge-${kind}`;
  badgeEl.textContent = text;
}

function setLatency(el, ms) {
  el.hidden = false;
  el.textContent = formatMs(ms);
}

function renderLoading(bodyEl, note) {
  bodyEl.replaceChildren();
  const wrap = h("div", "loading-state");
  for (const w of ["92%", "100%", "78%", "96%", "60%"]) {
    const bar = h("div", "shimmer");
    bar.style.width = w;
    wrap.appendChild(bar);
  }
  wrap.appendChild(h("p", "loading-note", note));
  bodyEl.appendChild(wrap);
}

function renderError(bodyEl, title, err) {
  bodyEl.replaceChildren();
  const wrap = h("div", "error-state");
  wrap.appendChild(h("p", "error-title", title));
  if (firebaseState.demoMode) {
    wrap.appendChild(
      h(
        "p",
        null,
        "This copy is in demo mode (placeholder Firebase config in src/firebase-config.js), so the request could not reach Firebase AI Logic. Connect a real project and this exact flow goes live."
      )
    );
  }
  const detail = err && err.message ? err.message : String(err || "Unknown error");
  const code = h("p");
  const c = h("code", null, detail);
  code.appendChild(c);
  wrap.appendChild(code);
  bodyEl.appendChild(wrap);
}

/* ------------------------------------------------------------------ */
/* Hybrid meter                                                        */
/* ------------------------------------------------------------------ */
const meter = { onDevice: 0, cloud: 0 };

function recordRequest(kind, passLabel, sourceLabel, ms) {
  if (kind === "on-device") meter.onDevice += 1;
  if (kind === "cloud") meter.cloud += 1;
  const total = meter.onDevice + meter.cloud;
  els.meterFillOnDevice.style.width = total ? `${(meter.onDevice / total) * 100}%` : "0%";
  els.meterFillCloud.style.width = total ? `${(meter.cloud / total) * 100}%` : "0%";
  els.meterOnDeviceCount.textContent = `${meter.onDevice} on-device`;
  els.meterCloudCount.textContent = `${meter.cloud} in cloud`;
  els.meterLast.replaceChildren(
    document.createTextNode("Last request: "),
    h("strong", null, `${passLabel} · ${sourceLabel} · ${formatMs(ms)}`)
  );
}

/* ------------------------------------------------------------------ */
/* Header status                                                       */
/* ------------------------------------------------------------------ */
function renderConfigStatus() {
  if (firebaseState.demoMode) {
    els.configStatus.className = "pill pill-warn";
    els.configStatusText.textContent = "Demo mode — placeholder config";
    els.demoBanner.hidden = false;
  } else if (firebaseState.initialized) {
    els.configStatus.className = "pill pill-ok";
    els.configStatusText.textContent = "Firebase AI Logic connected";
    els.demoBanner.hidden = true;
  } else {
    els.configStatus.className = "pill pill-bad";
    els.configStatusText.textContent = "Firebase failed to initialize";
    els.demoBanner.hidden = true;
  }
}

async function renderDeviceStatus() {
  const status = await probeOnDeviceAvailability();
  const map = {
    available: ["pill-ok", "On-device AI: Gemini Nano ready"],
    downloadable: ["pill-warn", "On-device AI: Nano downloadable (starts on first use)"],
    downloading: ["pill-warn", "On-device AI: Nano model downloading…"],
    unavailable: ["pill-warn", "On-device AI: unavailable here — cloud fallback active"],
    unsupported: ["pill-warn", "On-device AI: needs Chrome 139+ desktop — cloud fallback active"],
  };
  const [cls, text] = map[status] || map.unavailable;
  els.deviceStatus.className = `pill ${cls}`;
  els.deviceStatusText.textContent = text;
}

/* ------------------------------------------------------------------ */
/* Input handling                                                      */
/* ------------------------------------------------------------------ */
function updateCharCount() {
  const len = els.docInput.value.length;
  els.charCount.textContent = `${len.toLocaleString()} characters`;
}

function setInputNote(msg) {
  els.inputNote.textContent = msg || "";
}

function getInput(limit) {
  const raw = els.docInput.value;
  if (raw.length > limit) {
    return { text: raw.slice(0, limit), truncated: true };
  }
  return { text: raw, truncated: false };
}

els.docInput.addEventListener("input", updateCharCount);

els.sampleBtn.addEventListener("click", () => {
  els.docInput.value = SAMPLE_TEXT;
  updateCharCount();
  setInputNote("Sample meeting notes loaded — try both analysis passes.");
  els.docInput.focus();
});

els.clearBtn.addEventListener("click", () => {
  els.docInput.value = "";
  updateCharCount();
  setInputNote("");
  els.docInput.focus();
});

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files && els.fileInput.files[0];
  els.fileInput.value = "";
  if (!file) return;
  if (file.size > 500000) {
    setInputNote(`"${file.name}" is too large (max 500 KB).`);
    return;
  }
  try {
    els.docInput.value = await file.text();
    updateCharCount();
    setInputNote(`Loaded "${file.name}".`);
  } catch {
    setInputNote(`Could not read "${file.name}" as text.`);
  }
});

/* ------------------------------------------------------------------ */
/* Instant analysis — hybrid, on-device first                          */
/* ------------------------------------------------------------------ */
function buildInstantPrompt(text) {
  return [
    "You are a precise summarization engine. Read the document and reply in EXACTLY this format:",
    "",
    "SUMMARY:",
    "<a 2-3 sentence summary of the document>",
    "",
    "KEY POINTS:",
    "- <one key point>",
    "- <one key point>",
    "(3 to 5 key points, one per line, each starting with '- ')",
    "",
    "Document:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

function parseInstant(text) {
  const clean = (text || "").trim();
  const splitAt = clean.search(/KEY POINTS:/i);
  let summaryPart = splitAt >= 0 ? clean.slice(0, splitAt) : clean;
  summaryPart = summaryPart.replace(/^\s*SUMMARY:\s*/i, "").trim();
  let points = [];
  if (splitAt >= 0) {
    points = clean
      .slice(splitAt)
      .replace(/^\s*KEY POINTS:\s*/i, "")
      .split("\n")
      .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
      .filter((line) => line.length > 0);
  }
  return { summary: summaryPart || clean, points };
}

function renderInstant(result, source, ms) {
  const { summary, points } = parseInstant(result);
  els.instantBody.replaceChildren();

  const summarySection = h("div", "result-section");
  summarySection.appendChild(h("h3", null, "Summary"));
  summarySection.appendChild(h("p", null, summary));
  els.instantBody.appendChild(summarySection);

  if (points.length) {
    const pointsSection = h("div", "result-section");
    pointsSection.appendChild(h("h3", null, "Key points"));
    const ul = h("ul");
    for (const point of points) ul.appendChild(h("li", null, point));
    pointsSection.appendChild(ul);
    els.instantBody.appendChild(pointsSection);
  }

  const note = h("p", "source-note");
  if (source === InferenceSource.ON_DEVICE) {
    const strong = h("span", "on-device-text", "On-device · private · works offline");
    note.append(strong, document.createTextNode(" — answered by Gemini Nano in this browser. No data left the device and the request cost $0.00."));
  } else if (source === InferenceSource.IN_CLOUD) {
    const strong = h("span", "cloud-text", "In-cloud");
    note.append(strong, document.createTextNode(" — the on-device model was not available for this request, so Firebase AI Logic fell back to a cloud Gemini model."));
  } else {
    note.textContent = "The SDK did not report an inference source for this response.";
  }
  els.instantBody.appendChild(note);
  setLatency(els.instantLatency, ms);
}

async function runInstant() {
  if (!els.docInput.value.trim()) {
    renderError(els.instantBody, "Nothing to analyze yet", new Error("Paste or load a document first — the sample button fills one in for you."));
    setBadge(els.instantBadge, "error", "No input");
    return;
  }
  els.instantBtn.disabled = true;
  setBadge(els.instantBadge, "idle", "Working…");
  els.instantLatency.hidden = true;
  renderLoading(els.instantBody, "Asking Gemini Nano on-device first…");
  els.instantStatus.textContent = "";

  try {
    ensureAppCheck();
    const model = createInstantModel();

    // Per the Firebase AI Logic docs, initializeDeviceModel() must be
    // called after a user interaction and before the first request; it
    // also reports on-device model download progress.
    try {
      await withTimeout(
        Promise.resolve(
          model.initializeDeviceModel((fraction) => {
            els.instantStatus.textContent = `Downloading on-device model — ${Math.round(fraction * 100)}%`;
          })
        ),
        DEVICE_INIT_TIMEOUT_MS,
        "On-device model initialization"
      );
    } catch {
      // Not fatal: PREFER_ON_DEVICE falls back to the cloud on its own,
      // and inferenceSource will report what actually answered.
      els.instantStatus.textContent = "";
    }

    const { text, truncated } = getInput(INSTANT_CHAR_LIMIT);
    if (truncated) {
      setInputNote(`Instant pass used the first ${INSTANT_CHAR_LIMIT.toLocaleString()} characters (on-device context is limited). Deep analysis reads more.`);
    }
    const started = performance.now();
    const result = await withTimeout(
      model.generateContent(buildInstantPrompt(text)),
      REQUEST_TIMEOUT_MS,
      "Instant analysis"
    );
    const ms = performance.now() - started;
    const source = result.response.inferenceSource; // InferenceSource.ON_DEVICE | InferenceSource.IN_CLOUD | undefined
    const output = result.response.text();

    renderInstant(output, source, ms);
    if (source === InferenceSource.ON_DEVICE) {
      setBadge(els.instantBadge, "on-device", "● On-device · Gemini Nano");
      recordRequest("on-device", "Instant analysis", "On-device (Gemini Nano)", ms);
    } else if (source === InferenceSource.IN_CLOUD) {
      setBadge(els.instantBadge, "cloud", "● In-cloud · on-device unavailable");
      recordRequest("cloud", "Instant analysis", "In-cloud fallback (Gemini)", ms);
    } else {
      setBadge(els.instantBadge, "cloud", "● Answered · source unreported");
      recordRequest("other", "Instant analysis", "Source unreported", ms);
    }
  } catch (err) {
    setBadge(els.instantBadge, "error", "Failed");
    renderError(els.instantBody, "Instant analysis failed", err);
  } finally {
    els.instantStatus.textContent = "";
    els.instantBtn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Deep analysis — cloud, structured JSON                              */
/* ------------------------------------------------------------------ */
function buildDeepPrompt(text) {
  return [
    "Analyze the following document and return the structured analysis as JSON.",
    "Extract every action item you can find (with its owner and deadline as written; use 'Unassigned' / 'Not specified' when absent),",
    "every decision that was made, and every risk, blocker or unresolved concern.",
    "Finish with exactly 3 flashcards that would help someone study this document.",
    "",
    "Document:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

function parseDeepJson(raw) {
  let text = (raw || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  return JSON.parse(text);
}

function renderDeep(data, rawText) {
  els.deepBody.replaceChildren();

  const summarySection = h("div", "result-section");
  summarySection.appendChild(h("h3", null, "Executive summary"));
  summarySection.appendChild(h("p", null, data.executiveSummary || rawText || "No summary returned."));
  els.deepBody.appendChild(summarySection);

  const items = Array.isArray(data.actionItems) ? data.actionItems : [];
  if (items.length) {
    const section = h("div", "result-section");
    section.appendChild(h("h3", null, `Action items (${items.length})`));
    for (const item of items) {
      const row = h("div", "action-item");
      row.appendChild(h("span", "task", item.task || "Untitled action"));
      row.appendChild(h("span", "chip", item.owner || "Unassigned"));
      if (item.due && item.due !== "Not specified") {
        row.appendChild(h("span", "chip due", item.due));
      }
      section.appendChild(row);
    }
    els.deepBody.appendChild(section);
  }

  for (const [key, title] of [["decisions", "Decisions"], ["risks", "Risks & open concerns"]]) {
    const list = Array.isArray(data[key]) ? data[key] : [];
    if (!list.length) continue;
    const section = h("div", "result-section");
    section.appendChild(h("h3", null, title));
    const ul = h("ul");
    for (const entry of list) ul.appendChild(h("li", null, String(entry)));
    section.appendChild(ul);
    els.deepBody.appendChild(section);
  }

  const cards = Array.isArray(data.flashcards) ? data.flashcards : [];
  if (cards.length) {
    const section = h("div", "result-section");
    section.appendChild(h("h3", null, "Flashcards — click to flip"));
    const grid = h("div", "flashcards");
    for (const card of cards) {
      const btn = h("button", "flashcard");
      btn.type = "button";
      const inner = h("span", "flashcard-inner");
      const front = h("span", "flashcard-face flashcard-front");
      front.append(h("span", "fc-tag", "Question"), h("span", null, card.question || ""));
      const back = h("span", "flashcard-face flashcard-back");
      back.append(h("span", "fc-tag", "Answer"), h("span", null, card.answer || ""));
      inner.append(front, back);
      btn.appendChild(inner);
      btn.addEventListener("click", () => btn.classList.toggle("flipped"));
      grid.appendChild(btn);
    }
    section.appendChild(grid);
    els.deepBody.appendChild(section);
  }
}

async function runDeep() {
  if (!els.docInput.value.trim()) {
    renderError(els.deepBody, "Nothing to analyze yet", new Error("Paste or load a document first — the sample button fills one in for you."));
    setBadge(els.deepBadge, "error", "No input");
    return;
  }
  els.deepBtn.disabled = true;
  setBadge(els.deepBadge, "idle", "Working…");
  els.deepLatency.hidden = true;
  renderLoading(els.deepBody, "Cloud Gemini is reading the full document…");

  try {
    ensureAppCheck();
    const model = createDeepModel();
    const { text, truncated } = getInput(DEEP_CHAR_LIMIT);
    if (truncated) {
      setInputNote(`Deep pass used the first ${DEEP_CHAR_LIMIT.toLocaleString()} characters of the document.`);
    }
    const started = performance.now();
    const result = await withTimeout(
      model.generateContent(buildDeepPrompt(text)),
      REQUEST_TIMEOUT_MS,
      "Deep analysis"
    );
    const ms = performance.now() - started;
    const raw = result.response.text();

    let data = null;
    try {
      data = parseDeepJson(raw);
    } catch {
      data = null;
    }
    if (data && typeof data === "object") {
      renderDeep(data, raw);
    } else {
      // Defensive fallback: show the raw text rather than failing.
      renderDeep({ executiveSummary: raw }, raw);
      const note = h("p", "source-note", "The model returned unstructured text this time; showing it raw.");
      els.deepBody.appendChild(note);
    }
    setBadge(els.deepBadge, "cloud", "● In-cloud · Gemini");
    setLatency(els.deepLatency, ms);
    recordRequest("cloud", "Deep analysis", "In-cloud (Gemini)", ms);
  } catch (err) {
    setBadge(els.deepBadge, "error", "Failed");
    renderError(els.deepBody, "Deep analysis failed", err);
  } finally {
    els.deepBtn.disabled = false;
  }
}

els.instantBtn.addEventListener("click", runInstant);
els.deepBtn.addEventListener("click", runDeep);

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
initFirebase();
renderConfigStatus();
renderDeviceStatus();
updateCharCount();
