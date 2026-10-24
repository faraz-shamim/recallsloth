import { esc, citation, eligible, stats } from "./core.js";
const e = esc;
export const clock = (t) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(t));
export function button(label, action, kind = "primary", attrs = "") {
  return `<button class="button ${kind}" data-action="${action}" ${attrs}>${label}</button>`;
}
export function shell(s, u) {
  const st = stats(s);
  return `<header class="top"><a href="/" class="brand" aria-label="RecallSloth home"><img src="/icon.svg" alt=""/>Recall<span>Sloth</span></a><nav aria-label="Main navigation">${[
    ["today", "Today"],
    ["notes", "My notes"],
    ["overlap", "Overlap scout"],
    ["progress", "My rhythm"],
  ]
    .map(
      ([id, label]) =>
        `<button data-view="${id}" class="${u.view === id ? "active" : ""}" ${u.view === id ? 'aria-current="page"' : ""}>${label}</button>`,
    )
    .join(
      "",
    )}</nav><button class="privacy" data-action="about">◌ <span>Local-first learning</span></button></header><main>${u.storageError ? '<div class="warning">Browser storage is unavailable. Your changes are in memory only. Export a backup before closing.</div>' : ""}${u.view === "today" ? today(s, u, st) : u.view === "notes" ? notes(s, u) : u.view === "overlap" ? overlap(s, u) : progress(s, u, st)}</main><footer><span>Small sessions. A little less sorting. A little more remembering.</span><a href="https://github.com/faraz-shamim/recallsloth" target="_blank" rel="noopener">Open source ↗</a><button data-action="about">Data & model</button></footer>`;
}
function heading(k, title, sub) {
  return `<div class="page-heading"><span class="eyebrow">${k}</span><h1>${title}</h1><p>${sub}</p></div>`;
}
function today(s, u, st) {
  if (u.studying && s.session) return study(s, u);
  const ready = eligible(s),
    groups = new Set(
      ready.filter((c) => c.dueAt <= Date.now()).map((c) => c.groupId || c.id),
    ).size;
  return `<section class="hero"><div><span class="eyebrow">A GENTLER MEDICAL REVISION DESK</span><h1>A small step.<br/>Then back to life.</h1><p>Turn your notes into source-linked recall cards.<br class="desktop"/> Let a sleepy little system handle the daily sorting.</p><div class="actions">${s.cards.length ? button(s.session && s.session.index < s.session.ids.length ? "Resume my session" : "Pick my next few minutes", "start") : button("Try the sample notes", "demo")}${button(s.cards.length ? "Add more notes" : "Bring my own notes", "go-notes", "soft")}</div><span class="micro">Your notes stay in this browser. No account needed.</span></div><div class="hero-art" role="img" aria-label="A resting sloth beside a short stack of medical study cards"><span class="art-caption">Room to take it slowly.</span></div></section>
 <div class="overview"><article><span>YOUR LIBRARY</span><b>${st.cards}<small> source cards</small></b></article><article><span>READY TO RECALL</span><b>${groups}<small> concepts due</small></b></article><article><span>YOUR PACE</span><b>${s.settings.budget / 60}<small> minutes per session</small></b></article></div>
 <div class="columns"><section class="panel daily"><div class="panel-head"><div><span class="eyebrow">YOUR NEXT LITTLE SESSION</span><h2>Just enough for today.</h2></div><span class="pill">No streak to protect</span></div><p>A bounded queue picks due, approved cards and balances topics. Only groups you have confirmed count as one concept.</p><label class="field inline">Session budget<select id="budget" ${s.session && s.session.index < s.session.ids.length ? "disabled" : ""}>${[120, 300, 600].map((n) => `<option value="${n}" ${s.settings.budget === n ? "selected" : ""}>${n / 60} minutes</option>`).join("")}</select></label><label class="check"><input id="cloud" type="checkbox" ${s.settings.cloud ? "checked" : ""}/>Use the Render queue planner <span class="micro">Anonymous IDs and schedule metadata only.</span></label>${st.approved < st.cards ? `<div class="notice"><b>${st.cards - st.approved} cards need a source check.</b><p>Review the extracted definitions before they enter a session.</p>${button("Review my source cards", "approve", "soft")}</div>` : ""}${st.cards ? `<div class="actions">${button(s.session && s.session.index < s.session.ids.length ? "Resume session" : "Build my study queue", "start", "primary", u.busy ? "disabled" : "")}${s.session && s.session.index < s.session.ids.length ? button("End this session", "end-session", "text") : ""}</div>` : '<div class="empty-inline">Start with twelve short physiology cards, or import your own lecture definitions.</div>'}${u.busy ? `<p id="model-progress" role="status">${e(u.status)}</p>` : ""}${u.plan ? `<details class="plan-trace"><summary>Queue tool trace · ${e(u.plan.runtime)}</summary><pre>${e(JSON.stringify(u.plan.trace, null, 2))}</pre><p>No note text was sent to the planner.</p></details>` : ""}</section>
 <section class="panel soft-panel"><span class="eyebrow">SET UP ONCE. COME BACK LIGHTER.</span><h2>Let the little things<br/>look after themselves.</h2><ol class="steps"><li><b>Bring the notes</b><span>Term → definition becomes an exact-source recall card.</span></li><li><b>Spot the overlap</b><span>A local open model finds similar explanations. You choose what belongs together.</span></li><li><b>Recall, then rest</b><span>Your own rating sets the next due date. No catch-up marathon.</span></li></ol></section></div>
 <div class="scope-note">Educational prototype for personal revision. Check cards against trusted course sources. No patient records, clinical decisions, or claimed learning-outcome validation.</div>`;
}
function study(s, u) {
  const session = s.session,
    c = s.cards.find((c) => c.id === session.ids[session.index]),
    last = s.reviews.at(-1),
    undoable = last?.sessionId === session.id && Array.isArray(last.before);
  if (!c)
    return `${heading("THAT IS ENOUGH FOR NOW", "A little recall. A little room.", "Your ratings are saved in this browser. The due dates will be waiting next time.")}<section class="panel finish"><img src="/icon.svg" alt="A contented sloth"/><h2>You finished ${session.ids.length} small steps.</h2><p>No streak lost. No extra cards sneaking in.</p><div class="actions">${button("Back to my desk", "end-session")}${undoable ? button("Undo last rating", "undo", "soft") : ""}</div></section>`;
  const source = citation(s, c);
  return `<div class="session-top"><button class="text-button" data-action="leave-session">← Back to desk</button><span>${session.index + 1} / ${session.ids.length} · ${e(session.runtime === "render" ? "Render queue" : "On-device queue")}</span><button class="text-button" data-action="undo" ${undoable ? "" : "disabled"}>Undo last rating</button></div><div class="session-progress"><i style="width:${(session.index / session.ids.length) * 100}%"></i></div><section class="recall-card" aria-label="Recall card"><span class="eyebrow">${e(c.topic)}</span><p class="recall-label">Can you explain this from memory?</p><h1>${e(c.term)}</h1>${
    u.revealed
      ? `<div class="answer"><span class="eyebrow">YOUR SOURCE DEFINITION</span><p>${e(c.answer)}</p><button class="text-button" data-action="source" data-id="${c.id}">${e(source?.name)} · line ${source?.line} ↗</button></div><p class="rating-label">How did that feel? Your rating is a self-report.</p><div class="ratings">${[
          ["again", "Again", "1 minute"],
          ["hard", "Hard", "Slow it down"],
          ["good", "Good", "Keep it steady"],
          ["easy", "Easy", "A little later"],
        ]
          .map(
            ([id, label, sub], i) =>
              `<button data-action="rate" data-rating="${id}" class="rating ${id}"><b>${label}</b><small>${sub}</small><kbd>${i + 1}</kbd></button>`,
          )
          .join("")}</div>`
      : `<p class="recall-hint">Take a breath. There is no timer to beat.</p>${button("Reveal the source answer", "reveal")}<small class="micro">Space to reveal · 1–4 to rate after revealing</small>`
  }</section><p class="session-footnote">Intervals are a simple study aid, not a validated retention model. A grouped card updates the due date of its learner-confirmed siblings.</p>`;
}
function notes(s, u) {
  return `${heading("YOUR MATERIAL, LESS MANUAL SETUP", "A home for the notes.", "One definition per line becomes a source-linked draft card. You approve what you want to study.")}<div class="columns notes-columns"><section class="panel"><h2>Bring a small chapter.</h2><label class="field">Note title<input id="note-name" maxlength="100" placeholder="e.g. Respiratory physiology"/></label><label class="field">Your lecture definitions<textarea id="note-text" rows="10" placeholder="# Respiratory physiology&#10;**Ventilation**: Air moves into and out of the lungs.&#10;Perfusion: Blood flows through pulmonary capillaries."></textarea></label><div class="actions">${button("Make source cards", "import-text")}<label class="button soft file-button">Import TXT / MD<input id="note-files" type="file" accept=".txt,.md,text/plain,text/markdown" multiple/></label></div><p class="micro">Keep patient information out of study notes. Up to 60,000 characters per note; 240 cards total. PDF and clinical-record ingestion are not supported.</p></section><section class="panel soft-panel"><span class="eyebrow">A GOOD START IS ENOUGH</span><h2>Less formatting,<br/>more useful recall.</h2><p>Use <code>Term: definition</code> or <code>**Term**: definition</code>. Add <code># Topic</code> headings to balance your queue across subjects.</p><p>The app keeps the definition exactly as written. It does not invent medical answers or check whether your notes are correct.</p>${button("Load the physiology sample", "demo", "soft")}<p class="micro">Twelve original study definitions grounded in <a href="https://www.nhlbi.nih.gov/health/lungs/breathing-benefits" target="_blank" rel="noopener">NIH/NHLBI factual references</a>. Source: National Heart, Lung, and Blood Institute; National Institutes of Health; U.S. Department of Health and Human Services. No agency endorsement.</p></section></div>
 <section class="panel library"><div class="panel-head"><div><span class="eyebrow">YOUR SOURCE LIBRARY</span><h2>${s.sources.length} ${s.sources.length === 1 ? "note" : "notes"} · ${s.cards.length} cards</h2></div>${s.cards.length ? button("Review & approve cards", "approve", "soft") : ""}</div>${s.sources.length ? s.sources.map((source) => `<article class="source-row"><div><h3>${e(source.name)}</h3><span>${s.cards.filter((c) => c.sourceId === source.id).length} exact-source cards · text checksum ${e(source.hash.slice(0, 10))}…</span></div><button class="text-button" data-action="remove-source" data-id="${source.id}">Remove note</button></article>`).join("") : '<p class="empty-inline">A quiet shelf, ready for your first chapter.</p>'}
 ${s.cards.length ? `<div class="card-library">${s.cards.map((c) => `<article class="mini-card"><span class="eyebrow">${e(c.topic)}</span><h3>${e(c.term)}</h3><p>${e(c.answer)}</p><div class="mini-actions"><button data-action="toggle-approval" data-id="${c.id}" class="tag-button ${c.approved ? "selected" : ""}">${c.approved ? "✓ Approved" : "Approve source"}</button><button data-action="pause" data-id="${c.id}" class="tag-button">${c.paused ? "Resume" : "Pause"}</button><button data-action="source" data-id="${c.id}" class="text-button">Source ↗</button></div></article>`).join("")}</div>` : ""}</section>`;
}
function overlap(s, u) {
  const pairs = (u.pairs || []).filter((p) => {
      const a = s.cards.find((c) => c.id === p.a),
        b = s.cards.find((c) => c.id === p.b);
      return (
        a &&
        b &&
        !s.dismissed.includes(p.key) &&
        !(a.groupId && a.groupId === b.groupId)
      );
    }),
    groups = [...new Set(s.cards.map((c) => c.groupId).filter(Boolean))];
  return `${heading("THE LOCAL AI OVERLAP SCOUT", "Same chapter. Fewer repeats.", "A small open model finds similar definitions. Similarity is a prompt to compare, not proof that two medical facts are equivalent.")}<section class="panel scout-banner"><div><h2>A little curation, once.</h2><p>Group only cards that ask the same fact. Opposite directions, negation, and different clinical details should remain separate. Grouping is always your decision; original cards are preserved.</p></div>${button(u.busy ? "Scouting…" : "Find overlaps with local AI", "scout", "primary", u.busy || s.cards.length < 2 ? "disabled" : "")}</section>${u.busy ? `<div class="notice" id="model-progress" role="status">${e(u.status)}</div>` : ""}${s.modelRun ? `<p class="micro">Real browser inference: ${e(s.modelRun.modelId)} · ${(s.modelRun.durationMs / 1000).toFixed(1)} seconds for the last run. Generic assets cached for offline use. Unflagged comparisons appear first; the limited contrast check covers gas terms, negation and numeric tokens.</p>` : ""}
 ${s.modelRun ? `<div class="actions">${button("Run the fixed sample diagnostic", "benchmark", "soft", u.busy ? "disabled" : "")}<span class="micro">Eight sample alias lookups, with a word-overlap baseline. This is not an independent evaluation.</span></div>` : ""}<div class="overlap-list">${pairs
   .map((p) => {
     const a = s.cards.find((c) => c.id === p.a),
       b = s.cards.find((c) => c.id === p.b);
     return `<article class="panel pair" data-pair="${p.key}"><div class="pair-head"><span class="eyebrow">COMPARE THE ORIGINAL DEFINITIONS</span><span class="pill">Cosine ${p.score.toFixed(2)}</span></div>${p.flags?.length ? `<div class="warning">${p.flags.map(e).join(" · ")} · Related wording can describe different facts.</div>` : ""}<div class="pair-cards">${[a, b].map((c) => `<div><h3>${e(c.term)}</h3><p>${e(c.answer)}</p><button class="text-button" data-action="source" data-id="${c.id}">Inspect original source ↗</button></div>`).join("")}</div><div class="pair-actions">${button("Keep separate", "dismiss", "text", `data-key="${p.key}"`)}${button("These test the same fact", "group", "soft", `data-a="${p.a}" data-b="${p.b}"`)}</div></article>`;
   })
   .join(
     "",
   )}</div>${!pairs.length ? '<div class="empty-inline">Run the scout to compare your notes, or leave every card separate. Nothing is merged automatically.</div>' : ""}
 ${
   groups.length
     ? `<section class="panel"><span class="eyebrow">YOUR CONFIRMED GROUPS</span><h2>Kept together, by you.</h2>${groups
         .map(
           (id) =>
             `<div class="source-row"><div><h3>${s.cards
               .filter((c) => c.groupId === id)
               .map((c) => e(c.term))
               .join(
                 " + ",
               )}</h3><p>One recall step; all original sources retained.</p></div>${button("Ungroup", "ungroup", "text", `data-id="${id}"`)}</div>`,
         )
         .join("")}</section>`
     : ""
 }`;
}
function progress(s, u, st) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + i);
    const key = date.toLocaleDateString();
    return {
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      count: s.reviews.filter(
        (r) => new Date(r.at).toLocaleDateString() === key,
      ).length,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  return `${heading("A RHYTHM, NOT A STREAK", "Your pace is a good pace.", "Due dates move with your own recall ratings. Taking a rest day does not erase anything.")}<div class="overview"><article><span>APPROVED CONCEPTS</span><b>${st.concepts}</b></article><article><span>COMPLETED RECALL STEPS</span><b>${st.reviews}</b></article><article><span>REPEATED CARDS AVOIDED</span><b>${st.avoided}</b></article></div><div class="columns"><section class="panel"><h2>A few small returns.</h2><div class="rhythm" role="img" aria-label="Reviews in the last seven days: ${days.map((d) => d.label + " " + d.count).join(", ")}">${days.map((d) => `<div><b>${d.count}</b><i style="height:${Math.max(4, (d.count / max) * 130)}px"></i><span>${d.label}</span></div>`).join("")}</div><p class="micro">Counts are self-rated practice steps, not measured mastery.</p></section><section class="panel soft-panel"><span class="eyebrow">THE SMALL PAYOFF</span><h2>${Math.round((st.estimatedSecondsAvoided / 60) * 10) / 10} fewer estimated minutes<br/>for a full deck pass.</h2><p>${st.avoided} repeated cards avoided across ${st.approved} approved cards after your group decisions. The estimate assumes 45 seconds per card; it is not a measured learning benefit or actual time saved.</p><div class="actions">${button("Export deck backup", "export", "soft")}<label class="button text file-button">Restore backup<input id="backup-input" type="file" accept=".json,application/json"/></label></div><p class="micro">Backup includes source text, cards, groups and schedules. It excludes session history. Keep it private; restoring replaces the current deck.</p></section></div><section class="panel"><div class="panel-head"><h2>Recent little steps.</h2>${button("Clear this browser’s study data", "clear", "text")}</div>${
    s.reviews.length
      ? s.reviews
          .slice(-12)
          .reverse()
          .map(
            (r) =>
              `<div class="history-row"><span>${e(s.cards.find((c) => c.id === r.cardId)?.term || "Removed card")}</span><b>${e(r.rating)}</b><time>${e(clock(r.at))}</time></div>`,
          )
          .join("")
      : '<p class="empty-inline">Your first session will leave a little trail here.</p>'
  }</section>`;
}
export function sourceMarkup(s, c) {
  const x = citation(s, c);
  if (!x) throw Error("The source no longer matches this card.");
  return `<p><strong>${e(c.term)}</strong> · ${e(x.name)} · line ${x.line}</p><blockquote>${e(c.answer)}</blockquote><pre class="source-text">${e(x.source.text.slice(0, c.start))}<mark>${e(c.answer)}</mark>${e(x.source.text.slice(c.end))}</pre><p class="micro">SHA-256 of original UTF-8 note text: ${e(x.hash)}</p>`;
}
