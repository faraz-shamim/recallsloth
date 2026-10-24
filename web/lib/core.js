export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function sha(text) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function emptyState() {
  return {
    version: 1,
    sources: [],
    cards: [],
    reviews: [],
    dismissed: [],
    settings: { budget: 300, cloud: true },
    session: null,
    modelRun: null,
  };
}
export async function parseNotes(text, name = "My notes", now = Date.now()) {
  if (
    typeof text !== "string" ||
    text.length > 60000 ||
    text.length < 5 ||
    text.includes("\0")
  )
    throw Error("Use 5–60,000 characters of plain notes.");
  const hash = await sha(text),
    source = {
      id: "s_" + hash.slice(0, 16),
      name: String(name).slice(0, 100),
      text,
      hash,
      createdAt: now,
    };
  let topic = "General revision";
  const cards = [];
  for (const match of text.matchAll(/[^\r\n]+/g)) {
    const line = match[0];
    if (/^#{1,6}\s+/.test(line)) {
      topic = line
        .replace(/^#{1,6}\s+/, "")
        .trim()
        .slice(0, 80);
      continue;
    }
    const fact = line.match(
      /^\s*(?:[-*]\s+)?(?:\*\*)?([^:\n]{2,90}?)(?:\*\*)?\s*(?:::|:)\s+(.{8,700})$/,
    );
    if (!fact) continue;
    const term = fact[1].replace(/\*\*/g, "").trim(),
      answer = fact[2].trim(),
      start = match.index + line.lastIndexOf(answer);
    if (term.toLowerCase() === "source" || term.toLowerCase() === "url")
      continue;
    const id = "c_" + (await sha(source.id + ":" + start)).slice(0, 16),
      topicId = "t_" + (await sha(topic)).slice(0, 16);
    cards.push({
      id,
      sourceId: source.id,
      topic,
      topicId,
      term,
      answer,
      start,
      end: start + answer.length,
      approved: false,
      paused: false,
      groupId: null,
      dueAt: now,
      intervalDays: 0,
      reps: 0,
      lapses: 0,
    });
  }
  if (!cards.length)
    throw Error(
      "No definition cards found. Use one “Term: definition” per line, with optional # headings.",
    );
  if (cards.length > 120)
    throw Error("Use at most 120 definition lines in one note.");
  return { source, cards };
}
export function citation(state, card) {
  const source = state.sources.find((s) => s.id === card.sourceId);
  if (!source || source.text.slice(card.start, card.end) !== card.answer)
    return null;
  return {
    name: source.name,
    text: card.answer,
    line: source.text.slice(0, card.start).split("\n").length,
    hash: source.hash,
    source,
  };
}
export function approveCards(state) {
  for (const c of state.cards) if (citation(state, c)) c.approved = true;
  state.session = null;
}
export function cosine(a, b) {
  if (a.length !== b.length) throw Error("Embedding sizes differ.");
  return Math.max(
    -1,
    Math.min(
      1,
      a.reduce((n, v, i) => n + v * b[i], 0),
    ),
  );
}
export function contrastFlags(a, b) {
  const flags = [];
  const gases = (text) =>
    [
      ...text.toLowerCase().matchAll(/\b(?:carbon dioxide|co2|oxygen|o2)\b/g),
    ].map((x) =>
      ["co2", "carbon dioxide"].includes(x[0]) ? "carbon dioxide" : "oxygen",
    );
  const aa = [...new Set(gases(a))].sort().join("|"),
    bb = [...new Set(gases(b))].sort().join("|");
  if (aa && bb && aa !== bb) flags.push("Different gas terms");
  if (
    /\b(?:not|no|never|without)\b/i.test(a) !==
    /\b(?:not|no|never|without)\b/i.test(b)
  )
    flags.push("Negation differs");
  const numbers = (text) =>
    [...new Set(text.match(/\b\d+(?:\.\d+)?\b/g) || [])].sort().join("|");
  if (numbers(a) !== numbers(b)) flags.push("Numeric detail differs");
  return flags;
}
export function overlapPairs(cards, vectors, dismissed = []) {
  if (cards.length !== vectors.length)
    throw Error("Each card needs an embedding.");
  const pairs = [];
  for (let a = 0; a < cards.length; a++)
    for (let b = a + 1; b < cards.length; b++) {
      if (cards[a].groupId && cards[a].groupId === cards[b].groupId) continue;
      const key = [cards[a].id, cards[b].id].sort().join("|");
      if (dismissed.includes(key)) continue;
      const score = cosine(vectors[a], vectors[b]);
      if (score >= 0.6)
        pairs.push({
          key,
          a: cards[a].id,
          b: cards[b].id,
          score: Math.round(score * 10000) / 10000,
          flags: contrastFlags(cards[a].answer, cards[b].answer),
        });
    }
  return pairs
    .sort(
      (a, b) =>
        Number(a.flags.length > 0) - Number(b.flags.length > 0) ||
        b.score - a.score ||
        a.key.localeCompare(b.key),
    )
    .slice(0, 24);
}
export function groupCards(state, aId, bId) {
  const a = state.cards.find((c) => c.id === aId),
    b = state.cards.find((c) => c.id === bId);
  if (!a || !b || a === b || !citation(state, a) || !citation(state, b))
    throw Error("Both source cards must still exist.");
  const old = new Set([a.groupId, b.groupId].filter(Boolean)),
    members = state.cards.filter(
      (c) => c === a || c === b || old.has(c.groupId),
    );
  const id = "g_" + members.map((c) => c.id.slice(2)).sort()[0];
  // Grouped cards share a conservative due date so grouping cannot postpone a due concept.
  const due = Math.min(...members.map((c) => c.dueAt)),
    interval = Math.min(...members.map((c) => c.intervalDays));
  for (const c of members) {
    c.groupId = id;
    c.dueAt = due;
    c.intervalDays = interval;
  }
  state.session = null;
  return id;
}
export function ungroup(state, id) {
  for (const c of state.cards) if (c.groupId === id) c.groupId = null;
  state.session = null;
}
export function eligible(state) {
  return state.cards.filter(
    (c) => c.approved && !c.paused && citation(state, c),
  );
}
export function metadata(state, now = Date.now()) {
  return {
    version: 1,
    now,
    budgetSeconds: state.settings.budget,
    cards: eligible(state).map((c) => ({
      id: c.id,
      topicId: c.topicId,
      groupId: c.groupId || c.id,
      dueAt: c.dueAt,
      seconds: 45,
      lapses: c.lapses,
    })),
  };
}
export function schedule(card, rating, now = Date.now()) {
  if (!["again", "hard", "good", "easy"].includes(rating))
    throw Error("Unknown recall rating.");
  const days =
    rating === "again"
      ? 0
      : rating === "hard"
        ? Math.min(365, Math.max(1, Math.round(card.intervalDays * 1.2)))
        : rating === "good"
          ? card.intervalDays
            ? Math.min(365, Math.round(card.intervalDays * 2.2))
            : 1
          : card.intervalDays
            ? Math.min(365, Math.round(card.intervalDays * 3))
            : 4;
  return {
    dueAt: now + (rating === "again" ? 60000 : days * 86400000),
    intervalDays: days,
    reps: card.reps + 1,
    lapses: card.lapses + (rating === "again" ? 1 : 0),
  };
}
export function rate(state, rating, now = Date.now()) {
  const session = state.session,
    card = state.cards.find((c) => c.id === session?.ids[session.index]);
  if (!card || !citation(state, card))
    throw Error("Start a valid session before rating.");
  const members = card.groupId
    ? state.cards.filter((c) => c.groupId === card.groupId)
    : [card];
  const before = members.map((c) => ({
    id: c.id,
    dueAt: c.dueAt,
    intervalDays: c.intervalDays,
    reps: c.reps,
    lapses: c.lapses,
  }));
  const next = schedule(card, rating, now);
  for (const c of members) Object.assign(c, next);
  const event = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    cardId: card.id,
    rating,
    at: now,
    before,
  };
  state.reviews.push(event);
  state.reviews = state.reviews.slice(-1000);
  session.index++;
  return event;
}
export function undo(state) {
  const event = state.reviews.at(-1);
  if (
    !event ||
    event.sessionId !== state.session?.id ||
    state.session.index === 0
  )
    throw Error("No rating from this session to undo.");
  for (const old of event.before) {
    const c = state.cards.find((c) => c.id === old.id);
    if (c) Object.assign(c, old);
  }
  state.reviews.pop();
  state.session.index--;
}
export function stats(state) {
  const active = eligible(state),
    groups = new Set(active.map((c) => c.groupId || c.id));
  return {
    cards: state.cards.length,
    approved: active.length,
    concepts: groups.size,
    avoided: active.length - groups.size,
    reviews: state.reviews.length,
    estimatedSecondsAvoided: (active.length - groups.size) * 45,
  };
}
export async function validateBackup(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.cards) ||
    value.sources.length > 20 ||
    value.cards.length > 240
  )
    throw Error("Unsupported or oversized RecallSloth backup.");
  const rebuilt = emptyState(),
    ids = new Set();
  for (const s of value.sources) {
    if (typeof s.text !== "string" || typeof s.name !== "string")
      throw Error("Invalid source.");
    const p = await parseNotes(s.text, s.name);
    if (p.source.id !== s.id || p.source.hash !== s.hash || ids.has(s.id))
      throw Error("Source checksum mismatch or duplicate.");
    ids.add(s.id);
    rebuilt.sources.push(p.source);
    for (const c of p.cards) {
      const saved = value.cards.find((x) => x.id === c.id);
      if (!saved) throw Error("Backup is missing a source card.");
      if (
        saved.answer !== c.answer ||
        saved.start !== c.start ||
        saved.end !== c.end
      )
        throw Error("A source quotation was modified.");
      if (
        !Number.isFinite(saved.dueAt) ||
        saved.dueAt < 0 ||
        saved.dueAt > 4102444800000 ||
        !Number.isInteger(saved.intervalDays) ||
        saved.intervalDays < 0 ||
        saved.intervalDays > 365
      )
        throw Error("Invalid schedule.");
      for (const key of ["reps", "lapses"])
        if (
          !Number.isInteger(saved[key]) ||
          saved[key] < 0 ||
          saved[key] > 100000
        )
          throw Error("Invalid review count.");
      if (saved.groupId !== null && !/^g_[a-f0-9]{16}$/.test(saved.groupId))
        throw Error("Invalid group.");
      Object.assign(c, {
        approved: !!saved.approved,
        paused: !!saved.paused,
        groupId: saved.groupId,
        dueAt: saved.dueAt,
        intervalDays: saved.intervalDays,
        reps: saved.reps,
        lapses: saved.lapses,
      });
      rebuilt.cards.push(c);
    }
  }
  if (
    rebuilt.cards.length !== value.cards.length ||
    rebuilt.sources.reduce((n, s) => n + s.text.length, 0) > 200000
  )
    throw Error("Backup contains unknown or oversized content.");
  const budget = value.settings?.budget;
  if (![120, 300, 600].includes(budget)) throw Error("Invalid study budget.");
  rebuilt.settings = { budget, cloud: value.settings.cloud !== false };
  // A backup restores the deck and due dates, not untrusted session/history commands.
  return rebuilt;
}
