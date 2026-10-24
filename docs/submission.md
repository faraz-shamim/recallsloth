---
title: "RecallSloth: Your Medical Revision Queue Can Do the Sorting"
published: false
tags: devchallenge, hf26challenge, ai, education
cover_image: https://raw.githubusercontent.com/faraz-shamim/recallsloth/main/web/public/art/recallsloth-cover.webp
description: "Source-linked medical recall cards, local AI overlap scouting, and a small Render-powered study queue."
---

_This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19)._

I wanted opening a revision app to end with one small choice: **start**.

No rearranging a deck. No deciding which chapter deserves attention. No reviewing the same fact twice because it appeared under two different headings.

**RecallSloth** is the little system I built around that idea: a medical revision desk that turns definition notes into source-linked recall cards, uses an open model to find overlapping explanations, and picks a short daily queue. A very contented sloth keeps it company.

## What I Built

The intended user is a medical student or another learner revising physiology from their own trusted notes. The effort I want to remove is the repeated organization around studying: formatting definitions into cards, spotting duplicates, balancing due topics, and carrying unfinished sessions forward.

The flow is small enough to explain without a tutorial:

1. Import TXT/Markdown notes with one `Term: definition` per line.
2. Check and approve the extracted source cards.
3. Let the **local AI overlap scout** find explanations worth comparing. Confirm any groups yourself.
4. Choose a two-, five-, or ten-minute session and start recalling.
5. Reveal the exact source answer, self-rate, and let the due date move.

Every source card survives grouping. Each answer points back to the original note, line, character range and text checksum. Nothing invents a new medical explanation.

The sample contains twelve newly written pulmonary-physiology definitions grounded in [NIH/NHLBI factual references](https://www.nhlbi.nih.gov/health/lungs/breathing-benefits). They are educational examples, not patient records or an endorsed curriculum. Your own course notes remain the authority for what you study.

## Demo

### [Open RecallSloth →](https://recallsloth.onrender.com/)

The app runs on Render's Free plan. It can take a little time to wake after inactivity. The first local-model download needs internet; later cached runs can work offline.

![RecallSloth's real study desk, with a small daily session budget and a resting sloth](https://raw.githubusercontent.com/faraz-shamim/recallsloth/main/docs/recallsloth-desktop.png)

Choose **Try the sample notes**, then **Review & approve cards**. Open **Overlap scout** and consent to the model download. Compare the proposed pairs; only group cards if they test the same fact, including direction and context.

![The real source-comparison dialog asks the learner to confirm that two definitions test the same fact](https://raw.githubusercontent.com/faraz-shamim/recallsloth/main/docs/recallsloth-compare.png)

Return to **Today**, set your budget, and start a queue. Think about the term, press **Space** to reveal its source answer, then use **1–4** to self-rate. The queue stops when its selected cards are done. There is no timer to race or streak to protect.

![An actual RecallSloth recall session with its original source answer and four self-rating controls](https://raw.githubusercontent.com/faraz-shamim/recallsloth/main/docs/recallsloth-study.png)

Close the tab halfway through and return: the unfinished session resumes from browser storage. If a rating was a misclick, undo it during that in-memory session. You can pause cards, separate a group, export a checksum-verified deck backup, restore it after confirmation, or clear the browser's study data.

## The Lazy Payoff

In the sample, four learner-confirmed pairs turn **twelve source cards into eight recall steps** for a complete pass. All twelve originals remain inspectable.

At the app's illustrative estimate of **45 seconds per step**, that is **three fewer estimated minutes** per full pass. It is arithmetic on a demonstration deck—not measured time saved or a learning-outcome claim. A daily session may cover only part of that deck.

The repeatable payoff is the routine: notes come in once, approved groups stay together, ratings update due dates, and the next queue respects the chosen budget. Taking a rest day does not erase progress. The system does the sorting again whenever you return.

## Code

[Source, tests, measured diagnostic, licenses and self-hosting instructions](https://github.com/faraz-shamim/recallsloth)

```sh
npm ci --ignore-scripts
npm run dev
```

The application code is MIT. Model/runtime licenses and reused infrastructure code are credited separately.

## How I Built It

### Keep the answers attached to the notes

The card parser does one narrow job: extract explicitly defined terms from the learner's notes. It preserves each definition's exact source span. Unstructured prose without definition lines is rejected rather than converted into speculative questions.

The app checks a citation against its source before approval or study. A modified answer in an imported backup fails validation. Restoring a backup never replays session or history commands.

Notes, cards, groups, due dates and review history persist in **local, unencrypted IndexedDB**. A backup contains the source text, so it belongs somewhere private. This is personal study software; patient records should stay out.

### Use an open model for the fuzzy part

The overlap scout runs [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), pinned to revision `751bff37182d3f1213fa05d7196b954e230abad9`. Transformers.js loads quantized weights into ONNX Runtime Web and produces normalized 384-dimensional embeddings on WASM CPU.

It encodes the source definitions, compares cosine similarity, and offers the highest-ranking comparisons above an illustrative threshold. It generates no answers, approves no cards, and merges nothing automatically.

The most useful debugging result was a failure. Two gas-transfer definitions could look very similar to the model while describing different facts. A high cosine score was enough to justify comparison, but it did not establish equivalence.

I added a small contrast check that flags different gas terms, negation and numeric details, and moves flagged comparisons behind unflagged ones. Its vocabulary is deliberately limited. It cannot verify medical meaning, and every group still needs the learner's explicit confirmation.

### Publish the misses too

The app includes a downloadable diagnostic: eight directional alias lookups across the twelve sample definitions, compared with Jaccard word overlap.

| Method                                    | Expected alias ranked first |
| ----------------------------------------- | --------------------------: |
| Word-overlap baseline                     |                   **4 / 8** |
| Raw MiniLM similarity                     |                   **5 / 8** |
| MiniLM with the limited contrast ordering |                   **6 / 8** |

The [raw report](https://github.com/faraz-shamim/recallsloth/blob/main/docs/sample-diagnostic.json) includes every prediction, its source checksum, the pinned model and actual inference duration.

These examples were revised during development. The contrast check was added after observing related errors. This is **not an independent holdout**, and those numbers establish no general or medical accuracy. Even the contrast-aware version misses two expected aliases. Alternatives, source inspection and reversible learner decisions remain part of the product.

### Let Render handle a very small tool

**Render hosts the study-agent frontend, the queue-planning API, and the compressed inference runtime assets.** The model and note text stay on the learner's device.

The queue tool receives only opaque card/topic/group IDs, due timestamps, lapse counts, estimated step durations and the time budget. The browser offers only approved, unpaused cards with valid source citations. The tool then:

- keeps future cards out;
- choose one representative per learner-confirmed group;
- balance due topics within the budget;
- return a visible tool trace and the selected IDs.

Its schema rejects extra fields and unbounded inputs. There is no note-upload endpoint or server database. The browser checks the result against the same deterministic planner running locally. If the service is waking or unavailable, the queue can still be built on-device. You can turn the server option off yourself.

The model loader, tokenizer files and runtime are pinned. Generic runtime assets are self-hosted with correct compression/MIME headers, and a service worker caches the app shell. The real browser check disables the network, reloads the stored deck, runs actual model inference again, and starts an on-device queue.

### Test the quiet details

A [fresh Linux CI run](https://github.com/faraz-shamim/recallsloth/actions/runs/40074739937) passed the build and complete software checks. The repository includes **26 unit/API tests** and **21 browser checks** covering source fidelity, grouping, schedule boundaries, undo, persistence, keyboard controls, backup tampering, mobile layouts and offline use.

A unique synthetic private marker in a test note never appears in outgoing request URLs or bodies. The browser test uses real embeddings and synthetic actions; model responses are not mocked. It runs in its own isolated browser profile, never a signed-in user's existing browser.

The interval ladder is intentionally transparent: Again is one minute; Hard, Good and Easy increase the interval at different rates, capped at 365 days. A grouped card moves its confirmed siblings together. This is a simple prototype schedule, not a validated retention model or a claim of mastery.

## Why Does Open Innovation Matter?

The open model can do the fuzzy comparison on a laptop CPU while the note text stays in the browser. There is no inference API key, per-definition API charge or GPU dependency. The learner can inspect a failure, keep an alternative separate, and continue with cached assets offline.

The surrounding rules are open too. Someone can change the queue budget, examine the contrast vocabulary, replace the scheduling ladder, or evaluate another embedding model without depending on a hosted model's hidden behavior.

There are still practical limits. First use downloads generic assets; providers can see ordinary connection metadata; browsers can evict caches; and Render's Free service sleeps and shares workspace allowances. Local storage is unencrypted, and backups contain notes. The current deployment is a free educational prototype, with no clinical use, student trial, retention validation or measured educational outcome.

## Prize Categories

**Best Use of Render** — the single partner category I am entering. Render serves the study-agent frontend, strict queue tool, and self-hosted runtime assets, with a functioning on-device fallback.

## Credits

Built by **@faraz_s_0a6e70a4bbdc6622** with AI coding assistance. The cover was generated with OpenAI's built-in image tool; [the exact prompt and saved asset paths](https://github.com/faraz-shamim/recallsloth/blob/main/docs/artwork.md) are included. Screenshots show the actual app.

The generic pinned browser-model loader, WASM compression and service-worker patterns are adapted from my earlier [ReferralGlass](https://github.com/faraz-shamim/referralglass) project and credited in [THIRD_PARTY.md](https://github.com/faraz-shamim/recallsloth/blob/main/THIRD_PARTY.md). RecallSloth's study workflow, source-card parser, overlap/contrast controls, grouping, scheduler, IndexedDB store, UI and tests were written for Week 3.

Factual background for the newly written sample: National Heart, Lung, and Blood Institute; National Institutes of Health; U.S. Department of Health and Human Services. No agency endorsement is implied. No agency images, logos or formatted publications are reproduced.

What part of setting up a revision session would you most like to hand over to a sloth?
