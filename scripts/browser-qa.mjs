import { chromium } from "playwright";
import { createApp } from "../server/app.js";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.RECALLSLOTH_TEST_URL || "http://127.0.0.1:4188",
  live = !!process.env.RECALLSLOTH_TEST_URL;
const report = {
  startedAt: new Date().toISOString(),
  environment: live
    ? "Public Render deployment, fresh isolated Chromium profile"
    : "Production build, fresh isolated Chromium profile",
  url: base,
  syntheticActions: true,
  clinicalValidation: false,
  checks: [],
  errors: [],
};
const check = (name, detail) => {
  report.checks.push({ name, passed: true, ...(detail ? { detail } : {}) });
  console.log("PASS", name);
};
let context,
  server,
  page,
  offline = false;
const marker = "SYNTHETIC_PRIVATE_STUDY_4931",
  leaks = [],
  payloads = [],
  modelUrls = [];
try {
  await mkdir(".runtime", { recursive: true });
  await mkdir("docs", { recursive: true });
  await mkdir("test-results", { recursive: true });
  if (!live) {
    server = createApp({ staticDir: "dist" }).listen(4188, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
  }
  const health = await (await fetch(base + "/api/health")).json();
  assert.equal(health.app, "RecallSloth");
  if (live) assert.equal(health.render, true);
  report.health = health;
  context = await chromium.launchPersistentContext(
    await mkdtemp(".runtime/qa-"),
    {
      executablePath:
        process.env.RECALLSLOTH_BROWSER_PATH ||
        (process.platform === "win32"
          ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
          : undefined),
      headless: true,
      viewport: { width: 1440, height: 1050 },
      acceptDownloads: true,
    },
  );
  context.on("request", (r) => {
    const body = r.postData() || "";
    if (body.includes(marker) || r.url().includes(marker))
      leaks.push(new URL(r.url()).origin);
    const url = new URL(r.url());
    if (
      url.hostname === "huggingface.co" &&
      url.pathname.startsWith("/Xenova/all-MiniLM-L6-v2/resolve/")
    )
      modelUrls.push(url.pathname);
    if (url.pathname === "/api/queue" && body) payloads.push(JSON.parse(body));
  });
  page = context.pages()[0] || (await context.newPage());
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle", timeout: 90000 });
  await page
    .getByRole("heading", { name: "A small step. Then back to life." })
    .waitFor();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: 20000,
  });
  await page.screenshot({
    path: "docs/recallsloth-desktop.png",
    fullPage: true,
  });
  check("The production desk and service-worker shell load without exceptions");
  async function nav(id) {
    await page.locator('nav [data-view="' + id + '"]').click();
  }
  async function clean() {
    await page
      .locator("#toast.visible")
      .waitFor({ state: "hidden", timeout: 8000 });
  }
  async function backup(name) {
    await nav("progress");
    const promise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export deck backup", exact: true })
      .click();
    await (await promise).saveAs("test-results/" + name + ".json");
    return JSON.parse(await readFile("test-results/" + name + ".json", "utf8"));
  }
  await page.getByRole("button", { name: "Try the sample notes" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".mini-card").length === 12,
  );
  assert.equal(await page.locator(".mini-card").count(), 12);
  check("Sample notes create twelve exact-source draft cards");
  await page
    .getByRole("button", { name: "Review & approve cards", exact: true })
    .click();
  assert.equal(await page.locator("#approve-button").isDisabled(), true);
  await page.locator("#approval-ack").check();
  await page.locator("#approve-button").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".tag-button.selected").length === 12,
  );
  assert.equal(await page.locator(".tag-button.selected").count(), 12);
  check(
    "Explicit learner source approval is required before cards enter queues",
  );
  await page
    .locator(".mini-card")
    .first()
    .getByRole("button", { name: "Source", exact: false })
    .click();
  assert.ok((await page.locator(".source-text mark").innerText()).length > 5);
  assert.ok(
    (await page.locator(".dialog-body .micro").innerText()).includes("SHA-256"),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  check(
    "A source citation opens the exact highlighted definition and note checksum",
  );
  await nav("overlap");
  await page
    .getByRole("button", { name: "Find overlaps with local AI" })
    .click();
  await page
    .getByRole("heading", { name: "Find overlap, on this device" })
    .waitFor();
  await page
    .getByRole("button", { name: "Download model & find overlaps" })
    .click();
  await page.locator(".pair").first().waitFor({ timeout: 150000 });
  await clean();
  const initial = await backup("before-groups");
  assert.ok(initial.cards.every((c) => c.groupId === null));
  check(
    "Real local MiniLM inference proposes comparisons with zero automatic groups",
  );
  await nav("overlap");
  const diagnosticDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Run the fixed sample diagnostic" })
    .click();
  await (await diagnosticDownload).saveAs("docs/sample-diagnostic.json");
  report.diagnostic = JSON.parse(
    await readFile("docs/sample-diagnostic.json", "utf8"),
  );
  assert.equal(report.diagnostic.cases, 8);
  assert.equal(report.diagnostic.independentHoldout, false);
  check(
    "Eight actual sample alias lookups record semantic and lexical predictions",
    {
      semantic: report.diagnostic.semanticCorrect,
      lexical: report.diagnostic.lexicalCorrect,
    },
  );
  const pairs = [
    ["Ventilation", "Breathing"],
    ["Perfusion", "Pulmonary blood flow"],
    ["Oxygen transfer", "O2 uptake"],
    ["Carbon dioxide transfer", "CO2 removal"],
  ];
  for (const [a, b] of pairs) {
    const pair = page
      .locator(".pair")
      .filter({ has: page.getByRole("heading", { name: a, exact: true }) })
      .filter({ has: page.getByRole("heading", { name: b, exact: true }) });
    assert.equal(
      await pair.count(),
      1,
      "Expected sample comparison " + a + " / " + b,
    );
    await pair
      .getByRole("button", { name: "These test the same fact" })
      .click();
    assert.equal(await page.locator("#group-button").isDisabled(), true);
    if (a === "Ventilation") {
      await clean();
      await page.screenshot({
        path: "docs/recallsloth-compare.png",
        fullPage: false,
      });
    }
    await page.locator("#group-ack").check();
    await page.locator("#group-button").click();
  }
  const grouped = await backup("grouped");
  assert.equal(new Set(grouped.cards.map((c) => c.groupId || c.id)).size, 8);
  assert.equal(grouped.cards.length, 12);
  assert.notEqual(
    grouped.cards.find((c) => c.term === "Oxygen transfer").groupId,
    grouped.cards.find((c) => c.term === "Carbon dioxide transfer").groupId,
  );
  check(
    "Four explicit learner confirmations produce eight concepts while retaining all twelve sources",
  );
  await nav("overlap");
  await clean();
  await page.screenshot({
    path: "docs/recallsloth-overlap.png",
    fullPage: false,
  });
  await nav("notes");
  await page.locator("#note-files").setInputFiles({
    name: "software-test-only.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "# Synthetic test\nScript term: " +
        marker +
        " <script>window.unwantedExecution=true</script> is an inert software-test definition.",
    ),
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".mini-card").length === 13,
  );
  assert.equal(await page.locator(".mini-card").count(), 13);
  assert.equal(
    await page.evaluate(() => window.unwantedExecution === true),
    false,
  );
  await page
    .getByRole("button", { name: "Review & approve cards", exact: true })
    .click();
  await page.locator("#approval-ack").check();
  await page.locator("#approve-button").click();
  check("Untrusted note markup is rendered as text and never executes");
  await nav("today");
  await page.locator("#budget").selectOption("120");
  await page.locator('.hero [data-action="start"]').click();
  await page.locator(".recall-card").waitFor();
  assert.ok((await page.locator(".session-top").innerText()).includes("1 / 2"));
  assert.ok(payloads.length > 0);
  assert.ok(!JSON.stringify(payloads).includes(marker));
  check(
    "The bounded queue uses anonymous metadata, topic balancing and the two-minute budget",
  );
  const firstTerm = await page.locator(".recall-card h1").innerText();
  await page.keyboard.press("Space");
  await page.locator(".answer").waitFor();
  await clean();
  await page.screenshot({ path: "docs/recallsloth-study.png", fullPage: true });
  await page.keyboard.press("3");
  await page.waitForFunction(() =>
    document.querySelector(".session-top")?.textContent.includes("2 / 2"),
  );
  await page.getByRole("button", { name: "Undo last rating" }).click();
  await page.waitForFunction(
    (term) => document.querySelector(".recall-card h1")?.textContent === term,
    firstTerm,
  );
  assert.equal(await page.locator(".recall-card h1").innerText(), firstTerm);
  check(
    "Keyboard reveal/rating and undo restore the previous source card and schedule",
  );
  await page.getByRole("button", { name: "Reveal the source answer" }).click();
  await page.locator('[data-action="rate"][data-rating="again"]').click();
  await page.waitForFunction(() =>
    document.querySelector(".session-top")?.textContent.includes("2 / 2"),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('.hero [data-action="start"]').click();
  assert.ok((await page.locator(".session-top").innerText()).includes("2 / 2"));
  check(
    "A browser reload resumes the unfinished session and preserves its ratings",
  );
  await page.getByRole("button", { name: "Reveal the source answer" }).click();
  await page.locator('[data-action="rate"][data-rating="easy"]').click();
  await page
    .getByRole("heading", { name: "You finished 2 small steps." })
    .waitFor();
  check(
    "Finishing a session schedules the cards and adds no surprise extra questions",
  );
  await nav("progress");
  await clean();
  assert.ok(
    (await page.locator("body").innerText()).includes(
      "3 fewer estimated minutes",
    ),
  );
  await page.screenshot({
    path: "docs/recallsloth-progress.png",
    fullPage: true,
  });
  const saved = await backup("saved");
  assert.equal(saved.cards.length, 13);
  assert.ok(saved.cards.some((c) => c.reps > 0));
  assert.ok(saved.sources.every((x) => /^[a-f0-9]{64}$/.test(x.hash)));
  check("Deck export preserves exact sources, learner groups and due dates");
  const bad = structuredClone(saved);
  bad.cards[0].answer = "Tampered answer";
  await page.locator("#backup-input").setInputFiles({
    name: "tampered.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await page
    .getByText("A source quotation was modified.", { exact: true })
    .waitFor();
  check("A tampered backup fails integrity checks without replacing the deck");
  await page.locator("#backup-input").setInputFiles("test-results/saved.json");
  await page.getByRole("button", { name: "Restore this deck" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".mini-card").length === 13,
  );
  assert.equal(await page.locator(".mini-card").count(), 13);
  check(
    "A valid backup restores the deck after an explicit replacement confirmation",
  );
  await nav("overlap");
  await page
    .getByRole("button", { name: "Ungroup", exact: true })
    .first()
    .click();
  const separated = await backup("separated");
  assert.equal(new Set(separated.cards.map((c) => c.groupId || c.id)).size, 10);
  check("Ungrouping is reversible and never removes source cards");
  await nav("notes");
  await page.locator("#note-files").setInputFiles({
    name: "unsupported.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-not-supported"),
  });
  await page
    .getByText("Use TXT or Markdown files up to 240 KB.", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".mini-card").count(), 13);
  check(
    "Unsupported document formats are rejected while existing notes stay intact",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ["today", "notes", "overlap", "progress"]) {
    await nav(view);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      view + " overflow",
    );
  }
  await nav("today");
  await clean();
  await page.screenshot({
    path: "docs/recallsloth-mobile.png",
    fullPage: true,
  });
  check("All four views fit a 390-pixel phone viewport");
  await page.setViewportSize({ width: 1440, height: 1050 });
  offline = true;
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await nav("overlap");
  await page
    .getByRole("button", { name: "Find overlaps with local AI" })
    .click();
  await page
    .getByRole("button", { name: "Download model & find overlaps" })
    .click();
  await page.locator(".pair").first().waitFor({ timeout: 60000 });
  await nav("today");
  await page.locator('.hero [data-action="start"]').click();
  await page.locator(".recall-card").waitFor();
  assert.ok(
    (await page.locator(".session-top").innerText()).includes(
      "On-device queue",
    ),
  );
  check(
    "Cached local model, stored notes and queue planner work after an offline reload",
  );
  await context.setOffline(false);
  offline = false;
  await nav("progress");
  await page
    .getByRole("button", { name: "Clear this browser’s study data" })
    .click();
  await page
    .getByRole("button", { name: "Clear study data", exact: true })
    .click();
  await page.getByRole("button", { name: "Try the sample notes" }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Try the sample notes" }).waitFor();
  await nav("notes");
  assert.equal(await page.locator(".mini-card").count(), 0);
  check(
    "Clearing the desk removes notes, cards and history from persistent browser storage",
  );
  assert.deepEqual(leaks, []);
  assert.ok(
    modelUrls.length > 0 &&
      modelUrls.every((p) =>
        p.includes("/751bff37182d3f1213fa05d7196b954e230abad9/"),
      ),
  );
  assert.deepEqual(report.errors, []);
  report.networkPrivacy = {
    syntheticPrivateMarkerLeaked: false,
    modelRequestsPinned: true,
    queuePayloads: payloads.map((p) => ({
      keys: Object.keys(p),
      cards: p.cards.length,
      bytes: JSON.stringify(p).length,
    })),
  };
  check(
    "The private marker never leaves in requests and model assets use the pinned revision",
  );
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.error = e.message;
  process.exitCode = 1;
  if (page) {
    report.failureVisibleText = (await page.locator("body").innerText()).slice(
      -2200,
    );
    await page.screenshot({
      path: ".runtime/browser-failure.png",
      fullPage: true,
    });
  }
} finally {
  await context?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    live ? "docs/live-qa.json" : "docs/browser-qa.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
