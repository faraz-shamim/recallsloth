import "./style.css";
import {
  emptyState,
  parseNotes,
  esc,
  sha,
  citation,
  approveCards,
  overlapPairs,
  groupCards,
  ungroup,
  metadata,
  rate,
  undo,
  stats,
  validateBackup,
  cosine,
  contrastFlags,
} from "./lib/core.js";
import { planQueue } from "./lib/planner.js";
import { loadState, saveState, clearState } from "./lib/storage.js";
import { embedTexts, resetModel, MODEL } from "./lib/model.js";
import { DEMO_TEXT, DEMO_NAME, EXPECTED_PAIRS } from "./lib/demo.js";
import { shell, button, sourceMarkup } from "./lib/views.js";
let s = emptyState();
const u = {
  view: "today",
  studying: false,
  revealed: false,
  busy: false,
  status: "",
  storageError: false,
  pairs: [],
  consent: false,
  plan: null,
};
let operation = 0,
  timer,
  focusBefore = null;
const root = document.querySelector("#app"),
  dialogs = document.querySelector("#dialogs");
function render() {
  root.innerHTML = shell(s, u);
}
function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove("visible"), 6000);
}
function status(text) {
  u.status = text;
  const el = document.querySelector("#model-progress");
  if (el) el.textContent = text;
}
async function persist() {
  try {
    await saveState(s);
    u.storageError = false;
  } catch (e) {
    u.storageError = true;
    toast(e.message + " Export a backup before closing.");
  }
  render();
}
function close() {
  dialogs.innerHTML = "";
  root.inert = false;
  focusBefore?.focus?.();
}
function modal(title, body) {
  if (!dialogs.children.length) focusBefore = document.activeElement;
  root.inert = true;
  dialogs.innerHTML = `<div class="modal-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><h2 id="dialog-title">${esc(title)}</h2><button data-action="close" aria-label="Close dialog">×</button></header><div class="dialog-body">${body}</div></section></div>`;
  dialogs.querySelector("button,input,textarea")?.focus();
}
function download(name, value) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function invalidate() {
  operation++;
  resetModel();
  u.busy = false;
  u.pairs = [];
  s.modelRun = null;
  s.session = null;
  u.studying = false;
  u.revealed = false;
}
function navigate(view) {
  if (!["today", "notes", "overlap", "progress"].includes(view)) return;
  u.view = view;
  u.studying = false;
  render();
  scrollTo({ top: 0, behavior: "instant" });
}
async function importNote(text, name) {
  if (u.busy) throw Error("Wait for the current operation to finish.");
  const added = await parseNotes(text, name);
  if (s.sources.some((x) => x.id === added.source.id)) {
    toast("Those exact notes are already on your shelf.");
    return;
  }
  if (
    s.sources.length >= 20 ||
    s.cards.length + added.cards.length > 240 ||
    s.sources.reduce((n, x) => n + x.text.length, 0) + text.length > 200000
  )
    throw Error(
      "This deck is full. Use at most 20 notes, 240 cards and 200,000 source characters.",
    );
  invalidate();
  s.sources.push(added.source);
  s.cards.push(...added.cards);
  u.view = "notes";
  await persist();
  toast(
    `${added.cards.length} source cards created. Review and approve them before studying.`,
  );
}
async function start() {
  if (u.busy) return;
  if (s.session && s.session.index < s.session.ids.length) {
    u.studying = true;
    u.revealed = false;
    u.view = "today";
    render();
    scrollTo(0, 0);
    return;
  }
  const input = metadata(s),
    expected = planQueue(input);
  if (!input.cards.length) {
    toast("Review and approve some source cards first.");
    return;
  }
  u.busy = true;
  u.status = "Picking a small, balanced queue…";
  render();
  let plan = { ...expected, runtime: "on-device" };
  try {
    if (s.settings.cloud && navigator.onLine) {
      try {
        const response = await fetch("/api/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw Error();
        const remote = await response.json();
        if (
          JSON.stringify(remote.ids) !== JSON.stringify(expected.ids) ||
          remote.estimatedSeconds !== expected.estimatedSeconds
        )
          throw Error();
        plan = remote;
      } catch {
        plan.runtime = "local-fallback";
        toast("The same queue planner ran on this device.");
      }
    }
    if (!plan.ids.length) {
      toast("Nothing is due right now. Taking a break is allowed.");
      return;
    }
    s.session = {
      id: crypto.randomUUID(),
      ids: plan.ids,
      index: 0,
      createdAt: Date.now(),
      runtime: plan.runtime,
      estimatedSeconds: plan.estimatedSeconds,
    };
    u.plan = plan;
    u.view = "today";
    u.studying = true;
    u.revealed = false;
  } finally {
    u.busy = false;
    await persist();
    scrollTo(0, 0);
  }
}
async function scout() {
  if (u.busy || s.cards.length < 2) return;
  if (!u.consent) {
    modal(
      "Find overlap, on this device",
      `<p>A small open model will encode your source definitions in this browser. First use downloads generic model and runtime assets, roughly 30 MB compressed depending on cache and transport. Your note text is not sent to Hugging Face or Render.</p><p>Similar wording can describe different medical facts. The scout proposes comparisons; it never groups or removes a card automatically.</p><p class="micro">Keep the page open during first use. A recent desktop browser works best. Cached assets support offline scouting.</p><div class="dialog-actions">${button("Cancel", "close", "text")}${button("Download model & find overlaps", "consent-scout")}</div>`,
    );
    return;
  }
  const job = ++operation,
    cards = s.cards.filter((c) => citation(s, c));
  u.busy = true;
  u.status = "Preparing local semantic comparison…";
  u.view = "overlap";
  render();
  try {
    const embedded = await embedTexts(
      cards.map((c) => c.answer),
      (m) =>
        status(
          m.type === "batch"
            ? `Encoded ${m.done} of ${m.total} definitions locally…`
            : m.status === "progress"
              ? `Loading ${String(m.file || "model asset")
                  .split("/")
                  .pop()} · ${Math.round(m.progress || 0)}%`
              : "Preparing the local open model…",
        ),
    );
    if (job !== operation) return;
    u.pairs = overlapPairs(cards, embedded.vectors, s.dismissed);
    s.modelRun = {
      modelId: MODEL.id,
      durationMs: embedded.durationMs,
      at: Date.now(),
    };
    toast(
      `${u.pairs.length} similar-definition comparisons ready. Nothing was grouped automatically.`,
    );
  } catch (e) {
    if (job === operation) toast(e.message);
  } finally {
    if (job === operation) {
      u.busy = false;
      await persist();
    }
  }
}
function approval() {
  if (!s.cards.length) {
    toast("Add notes first.");
    return;
  }
  modal(
    "Check the cards against your notes",
    `<p>These definitions were extracted directly from your notes. They have not been fact-checked by the model. Confirm the source text is correct and suitable for your own revision.</p>${s.cards.map((c) => `<div class="approve-row"><b>${esc(c.term)}</b><p>${esc(c.answer)}</p><button class="text-button" data-action="source" data-id="${c.id}">Inspect source ↗</button></div>`).join("")}<label class="check"><input id="approval-ack" type="checkbox"/>I checked these definitions against trusted course material.</label><div class="dialog-actions">${button("Keep reviewing", "close", "text")}${button("Approve all source cards", "confirm-approve", "primary", 'id="approve-button" disabled')}</div>`,
  );
}
async function benchmark() {
  if (u.busy) return;
  if (!u.consent) {
    toast(
      "Run the local overlap scout first to consent to the model download.",
    );
    return;
  }
  u.busy = true;
  u.status = "Running the fixed sample diagnostic…";
  render();
  try {
    const p = await parseNotes(DEMO_TEXT, DEMO_NAME),
      cards = p.cards,
      r = await embedTexts(
        cards.map((c) => c.answer),
        (m) =>
          status(
            m.type === "batch"
              ? `Encoded ${m.done} / ${m.total} sample definitions…`
              : "Loading local model…",
          ),
      );
    const words = (t) =>
      new Set(
        (t.toLowerCase().match(/[a-z0-9]+/g) || []).filter(
          (x) =>
            !["the", "of", "in", "and", "to", "a", "into", "from"].includes(x),
        ),
      );
    const jaccard = (a, b) => {
      const aa = words(a),
        bb = words(b);
      return (
        [...aa].filter((x) => bb.has(x)).length / new Set([...aa, ...bb]).size
      );
    };
    let semantic = 0,
      lexical = 0,
      guarded = 0;
    const results = [];
    for (const pair of EXPECTED_PAIRS)
      for (const term of pair) {
        const i = cards.findIndex((c) => c.term === term),
          target = pair.find((x) => x !== term),
          ranked = cards
            .map((c, j) => ({
              term: c.term,
              score: cosine(r.vectors[i], r.vectors[j]),
              flags: contrastFlags(cards[i].answer, c.answer),
            }))
            .filter((_, j) => j !== i)
            .sort((a, b) => b.score - a.score),
          base = cards
            .filter((_, j) => j !== i)
            .map((c) => ({
              term: c.term,
              score: jaccard(cards[i].answer, c.answer),
            }))
            .sort((a, b) => b.score - a.score);
        const guardedRank = [...ranked].sort(
          (a, b) =>
            Number(a.flags.length > 0) - Number(b.flags.length > 0) ||
            b.score - a.score,
        );
        guarded += guardedRank[0].term === target;
        semantic += ranked[0].term === target;
        lexical += base[0].term === target;
        results.push({
          query: term,
          expected: target,
          semanticFirst: ranked[0].term,
          lexicalFirst: base[0].term,
          contrastAwareFirst: guardedRank[0].term,
          semanticTargetRank: ranked.findIndex((x) => x.term === target) + 1,
          semanticTopScore: ranked[0].score,
        });
      }
    const report = {
      format: "recallsloth-sample-diagnostic-v1",
      createdAt: new Date().toISOString(),
      model: MODEL,
      device: "wasm CPU",
      sourceSha256: p.source.hash,
      cases: results.length,
      semanticCorrect: semantic,
      contrastAwareCorrect: guarded,
      lexicalCorrect: lexical,
      contrastRule:
        "Unflagged comparisons first; gas-term, negation and numeric-token differences flagged. Added after observing errors in related development examples. This sample was revised during development and is not an independent evaluation.",
      baseline:
        "Jaccard overlap of lowercased words with a fixed small stop list",
      modelDurationMs: r.durationMs,
      independentHoldout: false,
      clinicalValidation: false,
      results,
    };
    u.report = report;
    download("recallsloth-sample-diagnostic.json", report);
    toast(
      `Sample check: raw semantic ${semantic}/8, contrast-aware ${guarded}/8, word overlap ${lexical}/8. This is a sample diagnostic, not clinical validation.`,
    );
  } catch (e) {
    toast(e.message);
  } finally {
    u.busy = false;
    render();
  }
}
const actions = {
  close,
  "go-notes": () => navigate("notes"),
  demo: async () => {
    await importNote(DEMO_TEXT, DEMO_NAME);
  },
  "import-text": async () => {
    await importNote(
      document.querySelector("#note-text").value,
      document.querySelector("#note-name").value.trim() || "My lecture notes",
    );
  },
  approve: approval,
  "confirm-approve": async () => {
    if (!document.querySelector("#approval-ack")?.checked) return;
    approveCards(s);
    close();
    await persist();
    toast("Source cards approved. Your next queue can use them.");
  },
  source: ({ id }) => {
    const card = s.cards.find((c) => c.id === id);
    if (card) modal("The original source", sourceMarkup(s, card));
  },
  "toggle-approval": async ({ id }) => {
    const c = s.cards.find((c) => c.id === id);
    if (!c || !citation(s, c)) return;
    c.approved = !c.approved;
    s.session = null;
    await persist();
  },
  pause: async ({ id }) => {
    const c = s.cards.find((c) => c.id === id);
    if (!c) return;
    c.paused = !c.paused;
    s.session = null;
    await persist();
  },
  start,
  scout,
  "consent-scout": () => {
    u.consent = true;
    close();
    return scout();
  },
  reveal: () => {
    u.revealed = true;
    render();
  },
  rate: async ({ rating }) => {
    if (!u.revealed) return;
    rate(s, rating);
    u.revealed = false;
    await persist();
  },
  undo: async () => {
    undo(s);
    u.revealed = false;
    await persist();
  },
  "leave-session": () => {
    u.studying = false;
    render();
  },
  "end-session": async () => {
    s.session = null;
    u.studying = false;
    u.revealed = false;
    await persist();
  },
  group: ({ a, b }) => {
    const aa = s.cards.find((c) => c.id === a),
      bb = s.cards.find((c) => c.id === b);
    modal(
      "One fact, two explanations?",
      `<p>Only group these if recalling either definition demonstrates the same fact. Related concepts, opposite gas directions and negations should stay separate.</p>${contrastFlags(aa.answer, bb.answer).length ? `<div class="warning">${contrastFlags(aa.answer, bb.answer).map(esc).join(" · ")}. Inspect the exact meaning before grouping.</div>` : ""}<h3>${esc(aa.term)}</h3><blockquote>${esc(aa.answer)}</blockquote><h3>${esc(bb.term)}</h3><blockquote>${esc(bb.answer)}</blockquote><label class="check"><input id="group-ack" type="checkbox"/>I checked the sources: these test the same fact, including direction and context. Their due dates can move together.</label><div class="dialog-actions">${button("Keep separate", "close", "text")}${button("Confirm this group", "confirm-group", "primary", `id="group-button" disabled data-a="${a}" data-b="${b}"`)}</div>`,
    );
  },
  "confirm-group": async ({ a, b }) => {
    if (!document.querySelector("#group-ack")?.checked) return;
    groupCards(s, a, b);
    close();
    await persist();
    toast("Grouped by you. Both original cards are preserved.");
  },
  dismiss: async ({ key }) => {
    s.dismissed.push(key);
    await persist();
  },
  ungroup: async ({ id }) => {
    ungroup(s, id);
    await persist();
    toast("Cards separated. No source text was changed.");
  },
  benchmark,
  export: () => {
    download("recallsloth-deck-backup.json", {
      version: 1,
      sources: s.sources,
      cards: s.cards,
      settings: s.settings,
    });
    toast("Deck saved locally. It includes your note text and due dates.");
  },
  "remove-source": ({ id }) =>
    modal(
      "Remove this note?",
      `<p>This removes the note and its cards from this browser. Export a backup first if you want to keep them.</p><div class="dialog-actions">${button("Keep it", "close", "text")}${button("Remove note and cards", "confirm-remove", "primary", `data-id="${id}"`)}</div>`,
    ),
  "confirm-remove": async ({ id }) => {
    invalidate();
    const removed = s.cards.filter((c) => c.sourceId === id).map((c) => c.id);
    s.sources = s.sources.filter((x) => x.id !== id);
    s.cards = s.cards.filter((c) => c.sourceId !== id);
    s.reviews = s.reviews.filter((r) => !removed.includes(r.cardId));
    close();
    await persist();
  },
  clear: () =>
    modal(
      "Clear this browser’s study data?",
      `<p>This deletes your local notes, cards, groups, schedules and review history. Export a deck backup first if you need one. Generic model assets remain cached.</p><div class="dialog-actions">${button("Keep my desk", "close", "text")}${button("Clear study data", "confirm-clear")}</div>`,
    ),
  "confirm-clear": async () => {
    invalidate();
    await clearState();
    s = emptyState();
    close();
    u.view = "today";
    await persist();
    toast("This browser’s study desk is clear.");
  },
  about: () =>
    modal(
      "A smaller, quieter data footprint",
      `<p><b>Medical revision, at your pace.</b> RecallSloth is an educational prototype. It does not generate medical advice, check clinical accuracy, or validate learning outcomes. Use trusted course notes and keep patient information out.</p><p><b>Your notes stay in this browser.</b> Source text, cards, groups, due dates and history persist in unencrypted IndexedDB on this device. This is not a secure clinical-record system. Clear the desk on a shared device; downloaded backups contain note text.</p><p><b>What Render receives.</b> When enabled, the stateless queue planner receives hashed internal IDs, due timestamps, topic/group IDs, lapse counts and a time budget. No note text, terms or answers are sent. Hosts can see ordinary connection metadata. You can turn the option off; offline planning uses the same code.</p><p><b>Open local AI.</b> <a href="https://huggingface.co/Xenova/all-MiniLM-L6-v2" target="_blank" rel="noopener">MiniLM</a> runs on WASM CPU via Transformers.js, with pinned q8 weights. Generic model/tokenizer downloads come from Hugging Face; its servers see download connection metadata, not your notes. Runtime assets are self-hosted. Cached assets can work offline, but browsers can evict caches.</p><p><b>Simple scheduling.</b> Again schedules one minute later; Hard, Good and Easy use a transparent interval ladder. Ratings are self-reports, not measured mastery. Grouping preserves every source and is learner-confirmed. The 45-second/card time estimate is illustrative.</p><p class="micro">Source code MIT. Generic model-loader, runtime and service-worker patterns adapted from <a href="https://github.com/faraz-shamim/referralglass">ReferralGlass</a>; the study, grouping and scheduling workflow is new.</p>`,
    ),
};
actions["confirm-restore"] = async () => {
  if (!u.backup) return;
  invalidate();
  s = u.backup;
  u.backup = null;
  close();
  u.view = "notes";
  await persist();
  toast("Deck and due dates restored. Session history starts fresh.");
};
document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-action],[data-view]");
  if (el?.disabled) return;
  if (el?.dataset.view) {
    event.preventDefault();
    navigate(el.dataset.view);
    return;
  }
  if (el?.dataset.action) {
    event.preventDefault();
    try {
      await actions[el.dataset.action]?.(el.dataset);
    } catch (error) {
      toast(error.message || "That step could not finish.");
    }
    return;
  }
  if (event.target.classList.contains("modal-backdrop")) close();
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  try {
    if (el.id === "approval-ack")
      document.querySelector("#approve-button").disabled = !el.checked;
    else if (el.id === "group-ack")
      document.querySelector("#group-button").disabled = !el.checked;
    else if (el.id === "budget") {
      const n = Number(el.value);
      if (![120, 300, 600].includes(n))
        throw Error("Choose a listed session budget.");
      s.settings.budget = n;
      await persist();
    } else if (el.id === "cloud") {
      s.settings.cloud = el.checked;
      await persist();
    } else if (el.id === "note-files") {
      for (const file of [...el.files]) {
        if (!/\.(txt|md)$/i.test(file.name) || file.size > 240000)
          throw Error("Use TXT or Markdown files up to 240 KB.");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          await file.arrayBuffer(),
        );
        await importNote(text, file.name);
      }
    } else if (el.id === "backup-input" && el.files[0]) {
      if (el.files[0].size > 2000000) throw Error("Backup is too large.");
      const candidate = await validateBackup(
        JSON.parse(await el.files[0].text()),
      );
      u.backup = candidate;
      modal(
        "Replace this browser’s deck?",
        `<p>This restores ${candidate.cards.length} cards and their due dates from a checksum-verified backup. It replaces the current notes, grouping and history. Export your current deck first if needed.</p><div class="dialog-actions">${button("Keep current deck", "close", "text")}${button("Restore this deck", "confirm-restore")}</div>`,
      );
    }
  } catch (error) {
    toast(error.message || "The file could not be opened.");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dialogs.children.length) {
    close();
    return;
  }
  if (event.key === "Tab" && dialogs.children.length) {
    const nodes = [
      ...dialogs.querySelectorAll(
        "button:not([disabled]),input:not([disabled]),a[href],textarea,select",
      ),
    ].filter((x) => x.offsetParent !== null);
    if (event.shiftKey && document.activeElement === nodes[0]) {
      event.preventDefault();
      nodes.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
      event.preventDefault();
      nodes[0]?.focus();
    }
    return;
  }
  if (
    dialogs.children.length ||
    /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) ||
    !u.studying
  )
    return;
  if (event.code === "Space" && !u.revealed) {
    event.preventDefault();
    actions.reveal();
  } else if (u.revealed && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    actions
      .rate({
        rating: ["again", "hard", "good", "easy"][Number(event.key) - 1],
      })
      .catch((e) => toast(e.message));
  }
});
try {
  s = await loadState();
} catch (error) {
  u.storageError = true;
  toast("Saved study data could not open: " + error.message);
}
render();
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
