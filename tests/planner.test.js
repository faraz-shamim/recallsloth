import test from "node:test";
import assert from "node:assert/strict";
import { planQueue } from "../web/lib/planner.js";
const now = Date.UTC(2026, 9, 24),
  card = (n, topic = "a") => ({
    id: "c_" + n.toString(16).padStart(16, "0"),
    topicId: "t_" + topic.repeat(16),
    groupId: "c_" + n.toString(16).padStart(16, "0"),
    dueAt: now,
    seconds: 45,
    lapses: 0,
  });
const input = (cards) => ({ version: 1, now, budgetSeconds: 120, cards });
test("Queue stays within the budget and balances different topics", () => {
  const m = input([card(1), card(2), card(3, "b")]),
    p = planQueue(m);
  assert.deepEqual(p.ids, [card(1).id, card(3).id]);
  assert.equal(p.estimatedSeconds, 90);
  assert.equal(p.remainingDue, 1);
});
test("Future cards never enter a due queue and an empty next date is null", () => {
  const c = { ...card(1), dueAt: now + 1000 };
  const p = planQueue(input([c]));
  assert.deepEqual(p.ids, []);
  assert.equal(p.nextDueAt, now + 1000);
  assert.equal(planQueue(input([])).nextDueAt, null);
});
test("Only one representative from a confirmed group enters the queue", () => {
  const a = card(1),
    b = { ...card(2), groupId: a.groupId };
  const p = planQueue(input([a, b]));
  assert.equal(p.ids.length, 1);
  assert.equal(p.dueConcepts, 1);
});
test("The earliest-due representative wins when grouped metadata differs", () => {
  const a = { ...card(1), dueAt: now - 100 },
    b = { ...card(2), groupId: a.groupId };
  assert.equal(planQueue(input([a, b])).ids[0], a.id);
});
test("Raw text, extra fields, invalid IDs and malformed budgets fail without echoing data", () => {
  for (const m of [
    { ...input([]), note: "PRIVATE_NOTE" },
    input([{ ...card(1), answer: "PRIVATE_NOTE" }]),
    input([{ ...card(1), id: "PRIVATE_NOTE" }]),
    { ...input([]), budgetSeconds: 1 },
    input([card(1), card(1)]),
  ])
    assert.throws(
      () => planQueue(m),
      (e) => e.status === 400 && !e.message.includes("PRIVATE_NOTE"),
    );
});
