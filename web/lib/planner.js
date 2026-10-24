export const PLANNER_VERSION = "1.0.0";
const fail = () => {
  const e = new Error("Only bounded anonymous study metadata is accepted.");
  e.status = 400;
  throw e;
};
function keys(v, allowed) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !allowed.includes(k))
  )
    fail();
}
export function planQueue(input) {
  keys(input, ["version", "now", "budgetSeconds", "cards"]);
  if (
    input.version !== 1 ||
    !Number.isFinite(input.now) ||
    input.now < 0 ||
    input.now > 4102444800000 ||
    !Number.isInteger(input.budgetSeconds) ||
    input.budgetSeconds < 60 ||
    input.budgetSeconds > 1800 ||
    !Array.isArray(input.cards) ||
    input.cards.length > 240
  )
    fail();
  const ids = new Set();
  for (const c of input.cards) {
    keys(c, ["id", "topicId", "groupId", "dueAt", "seconds", "lapses"]);
    if (
      !/^c_[a-f0-9]{16}$/.test(c.id) ||
      !/^t_[a-f0-9]{16}$/.test(c.topicId) ||
      !/^[cg]_[a-f0-9]{16}$/.test(c.groupId) ||
      ids.has(c.id) ||
      !Number.isFinite(c.dueAt) ||
      c.dueAt < 0 ||
      c.dueAt > 4102444800000 ||
      !Number.isInteger(c.seconds) ||
      c.seconds < 15 ||
      c.seconds > 300 ||
      !Number.isInteger(c.lapses) ||
      c.lapses < 0 ||
      c.lapses > 100000
    )
      fail();
    ids.add(c.id);
  }
  const due = input.cards
    .filter((c) => c.dueAt <= input.now)
    .sort(
      (a, b) =>
        a.dueAt - b.dueAt || b.lapses - a.lapses || a.id.localeCompare(b.id),
    );
  const first = new Map();
  for (const c of due) if (!first.has(c.groupId)) first.set(c.groupId, c);
  const unique = [...first.values()];
  const selected = [],
    seen = new Set(),
    topicCount = new Map();
  let seconds = 0;
  while (true) {
    const choices = unique
      .filter(
        (c) => !seen.has(c.id) && seconds + c.seconds <= input.budgetSeconds,
      )
      .sort(
        (a, b) =>
          (topicCount.get(a.topicId) || 0) - (topicCount.get(b.topicId) || 0) ||
          a.dueAt - b.dueAt ||
          b.lapses - a.lapses ||
          a.id.localeCompare(b.id),
      );
    if (!choices.length) break;
    const c = choices[0];
    selected.push(c.id);
    seen.add(c.id);
    seconds += c.seconds;
    topicCount.set(c.topicId, (topicCount.get(c.topicId) || 0) + 1);
  }
  return {
    plannerVersion: PLANNER_VERSION,
    ids: selected,
    estimatedSeconds: seconds,
    dueConcepts: unique.length,
    remainingDue: unique.length - selected.length,
    nextDueAt:
      input.cards
        .filter((c) => c.dueAt > input.now)
        .sort((a, b) => a.dueAt - b.dueAt)[0]?.dueAt ?? null,
    trace: [
      { tool: "filter_due", count: due.length },
      { tool: "respect_learner_groups", count: unique.length },
      { tool: "balance_topics_within_budget", count: selected.length },
    ],
    medicalContentReceived: false,
  };
}
