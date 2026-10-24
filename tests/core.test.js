import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  parseNotes,
  citation,
  approveCards,
  metadata,
  overlapPairs,
  groupCards,
  ungroup,
  rate,
  undo,
  schedule,
  validateBackup,
  stats,
  esc,
  contrastFlags,
} from "../web/lib/core.js";
import { DEMO_TEXT, DEMO_NAME } from "../web/lib/demo.js";
import { planQueue } from "../web/lib/planner.js";
const now = Date.UTC(2026, 9, 24, 12);
async function fixture() {
  const s = emptyState(),
    p = await parseNotes(DEMO_TEXT, DEMO_NAME, now);
  s.sources.push(p.source);
  s.cards.push(...p.cards);
  return s;
}
test("The sample produces twelve cards with exact, independently checkable source ranges", async () => {
  const s = await fixture();
  assert.equal(s.cards.length, 12);
  for (const c of s.cards) {
    const x = citation(s, c);
    assert.ok(x);
    assert.equal(s.sources[0].text.slice(c.start, c.end), c.answer);
    assert.match(x.hash, /^[a-f0-9]{64}$/);
  }
});
test("Plain definitions and bold Markdown terms parse without inventing answers", async () => {
  const p = await parseNotes(
    "# Kidney\n**Nephron**: A test definition from the notes.\nCell :: Another defined term for testing.",
  );
  assert.equal(p.cards[0].term, "Nephron");
  assert.equal(p.cards[1].term, "Cell");
  assert.equal(p.cards[0].topic, "Kidney");
  await assert.rejects(
    () => parseNotes("A paragraph with no definition separators."),
    /No definition cards/,
  );
});
test("Identical source text has stable IDs regardless of filename", async () => {
  const a = await parseNotes(DEMO_TEXT, "a"),
    b = await parseNotes(DEMO_TEXT, "b");
  assert.equal(a.source.id, b.source.id);
  assert.deepEqual(
    a.cards.map((c) => c.id),
    b.cards.map((c) => c.id),
  );
});
test("Markup stays inert and oversized or binary-like notes are rejected", async () => {
  assert.equal(esc('<script>"&'), "&lt;script&gt;&quot;&amp;");
  await assert.rejects(() => parseNotes("x".repeat(60001)));
  await assert.rejects(() => parseNotes("Term: text\0evil"));
});
test("Changed source text invalidates citations and cannot become approved", async () => {
  const s = await fixture();
  s.sources[0].text = "Changed";
  assert.equal(citation(s, s.cards[0]), null);
  approveCards(s);
  assert.ok(s.cards.every((c) => !c.approved));
});
test("Queue metadata contains no note text, terms, answers or source names", async () => {
  const s = await fixture();
  approveCards(s);
  const m = metadata(s, now);
  assert.equal(m.cards.length, 12);
  const serialized = JSON.stringify(m);
  for (const value of [DEMO_NAME, "Ventilation", "Air moves"])
    assert.ok(!serialized.includes(value));
  assert.deepEqual(Object.keys(m.cards[0]), [
    "id",
    "topicId",
    "groupId",
    "dueAt",
    "seconds",
    "lapses",
  ]);
});
test("Unapproved and paused cards stay out of study queues", async () => {
  const s = await fixture();
  assert.equal(metadata(s, now).cards.length, 0);
  approveCards(s);
  s.cards[0].paused = true;
  assert.equal(metadata(s, now).cards.length, 11);
});
test("Semantic overlap suggestions never mutate or group source cards", async () => {
  const s = await fixture(),
    cards = s.cards.slice(0, 3);
  const before = JSON.stringify(cards),
    pairs = overlapPairs(cards, [
      [1, 0],
      [0.99, 0.01],
      [0, 1],
    ]);
  assert.equal(pairs.length, 1);
  assert.equal(JSON.stringify(cards), before);
  assert.ok(s.cards.every((c) => c.groupId === null));
});
test("Dismissed pairs and already-confirmed same groups stay out of suggestions", async () => {
  const s = await fixture(),
    cards = s.cards.slice(0, 2),
    vectors = [
      [1, 0],
      [1, 0],
    ],
    pair = overlapPairs(cards, vectors)[0];
  assert.equal(overlapPairs(cards, vectors, [pair.key]).length, 0);
  groupCards(s, cards[0].id, cards[1].id);
  assert.equal(overlapPairs(cards, vectors).length, 0);
});
test("Grouping preserves original cards and cannot postpone an already-due concept", async () => {
  const s = await fixture();
  const a = s.cards[0],
    b = s.cards[1];
  b.dueAt = now + 86400000;
  b.intervalDays = 4;
  groupCards(s, a.id, b.id);
  assert.equal(a.dueAt, now);
  assert.equal(b.dueAt, now);
  assert.equal(b.intervalDays, 0);
  assert.equal(s.cards.length, 12);
  ungroup(s, a.groupId);
  assert.equal(a.groupId, null);
  assert.equal(b.groupId, null);
});
test("Confirmed grouping reduces study steps while preserving sources", async () => {
  const s = await fixture();
  approveCards(s);
  groupCards(s, s.cards[0].id, s.cards[1].id);
  assert.deepEqual(
    { ...stats(s) },
    {
      cards: 12,
      approved: 12,
      concepts: 11,
      avoided: 1,
      reviews: 0,
      estimatedSecondsAvoided: 45,
    },
  );
  assert.equal(planQueue(metadata(s, now)).dueConcepts, 11);
});
test("Rating and undo update every learner-confirmed sibling exactly once", async () => {
  const s = await fixture();
  approveCards(s);
  groupCards(s, s.cards[0].id, s.cards[1].id);
  s.session = { id: "test", ids: [s.cards[0].id], index: 0 };
  rate(s, "good", now);
  assert.equal(s.cards[0].dueAt, now + 86400000);
  assert.equal(s.cards[1].dueAt, now + 86400000);
  assert.equal(s.session.index, 1);
  assert.equal(s.reviews.length, 1);
  undo(s);
  assert.equal(s.session.index, 0);
  assert.equal(s.reviews.length, 0);
  assert.equal(s.cards[0].dueAt, now);
  assert.equal(s.cards[1].dueAt, now);
});
test("Again waits one minute, other ratings use bounded intervals, and invalid ratings fail", async () => {
  const s = await fixture(),
    c = s.cards[0];
  assert.equal(schedule(c, "again", now).dueAt, now + 60000);
  assert.equal(schedule(c, "easy", now).intervalDays, 4);
  assert.equal(
    schedule({ ...c, intervalDays: 365 }, "easy", now).intervalDays,
    365,
  );
  assert.equal(
    schedule({ ...c, intervalDays: 365 }, "hard", now).intervalDays,
    365,
  );
  assert.throws(() => schedule(c, "mastered", now));
});
test("Backup restoration verifies source hashes and exact quotations", async () => {
  const s = await fixture();
  approveCards(s);
  const copy = await validateBackup(structuredClone(s));
  assert.equal(copy.cards.length, 12);
  assert.equal(copy.cards[0].approved, true);
  const bad = structuredClone(s);
  bad.cards[0].answer = "Invented";
  await assert.rejects(() => validateBackup(bad), /quotation/);
  const tamper = structuredClone(s);
  tamper.sources[0].hash = "0".repeat(64);
  await assert.rejects(() => validateBackup(tamper), /checksum/);
});
test("Backup rejects unknown cards, duplicate sources and invalid schedules", async () => {
  const s = await fixture();
  const bad = structuredClone(s);
  bad.cards[0].dueAt = Infinity;
  await assert.rejects(() => validateBackup(bad), /schedule/);
  const dup = structuredClone(s);
  dup.sources.push(dup.sources[0]);
  await assert.rejects(() => validateBackup(dup), /duplicate/);
  const unknown = structuredClone(s);
  unknown.cards.push({ ...s.cards[0], id: "c_1234567890123456" });
  await assert.rejects(() => validateBackup(unknown), /unknown/);
});
test("Backup restores schedules but never replays untrusted session/history commands", async () => {
  const s = await fixture();
  s.session = { ids: ["bad"], index: 0 };
  s.reviews = [{ command: "danger" }];
  const restored = await validateBackup(s);
  assert.equal(restored.session, null);
  assert.deepEqual(restored.reviews, []);
});

test("Limited contrast warnings expose different gases, negation and numeric detail without claiming equivalence", () => {
  assert.deepEqual(
    contrastFlags(
      "Oxygen enters the bloodstream.",
      "Carbon dioxide enters the air sacs.",
    ),
    ["Different gas terms"],
  );
  assert.deepEqual(
    contrastFlags("Not attached 10 units.", "Attached 20 units."),
    ["Negation differs", "Numeric detail differs"],
  );
  assert.deepEqual(
    contrastFlags(
      "Oxygen moves from alveoli to blood.",
      "O2 moves from air sacs to blood.",
    ),
    [],
  );
});
