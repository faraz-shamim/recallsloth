# Third-party work and provenance

Application code is MIT. Exact npm package versions/integrity hashes are pinned in `package-lock.json`.

| Work                                                                      | Version                                    | License                 | Role                             |
| ------------------------------------------------------------------------- | ------------------------------------------ | ----------------------- | -------------------------------- |
| [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) | `751bff37182d3f1213fa05d7196b954e230abad9` | Apache-2.0              | Local q8 semantic embeddings     |
| [Transformers.js](https://github.com/huggingface/transformers.js)         | 4.3.1                                      | Apache-2.0              | Model inference and tokenization |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)              | `1.31.0-dev.20260914-8d85527a0`            | MIT and bundled notices | Self-hosted CPU WASM engine      |
| [Express](https://github.com/expressjs/express)                           | 5.3.0                                      | MIT                     | Stateless queue API              |
| [Vite](https://github.com/vitejs/vite)                                    | 8.3.4                                      | MIT                     | Build tooling                    |
| [Playwright](https://github.com/microsoft/playwright)                     | 1.64.1                                     | Apache-2.0              | Isolated browser testing         |

Runtime notices are copied to `/licenses/` during asset preparation. The ONNX upstream license and third-party notices are preserved at their pinned commit in `vendor/onnxruntime/provenance.json`.

## Prior project code

The generic pinned browser MiniLM loader (`web/model-worker.js`, `web/lib/model.js`), WASM asset compression and service-worker shell patterns are adapted from [ReferralGlass](https://github.com/faraz-shamim/referralglass), MIT, Copyright 2026 Faraz Shamim. Its source notice is preserved by this repository's MIT license. General Express protection/compression patterns also informed the server setup.

The parser, study-card source model, overlap/contrast workflow, learner groups, scheduler and due-queue tool, IndexedDB store, study UI, backup validation and project tests were newly written for Week 3. The Week 2 referral-packet product is not resubmitted.

## Study sample

The twelve definitions are newly written study examples grounded in the factual text of [NHLBI: What Breathing Does for the Body](https://www.nhlbi.nih.gov/health/lungs/breathing-benefits) and [NHLBI: The Respiratory System](https://www.nhlbi.nih.gov/health/lungs/respiratory-system). They are not quotations or modified versions of agency publications. No agency illustrations, animations, logos or formatted multimedia are reproduced.

Source: National Heart, Lung, and Blood Institute; National Institutes of Health; U.S. Department of Health and Human Services. No agency endorsement, curriculum approval or clinical validation is implied. See the [NHLBI public-domain and reuse policy](https://www.nhlbi.nih.gov/about/contact/trademark-branding-and-logo). The small original study fixture is distributed under this project’s MIT license; government factual material retains its public-domain status.

## Artwork and assistance

Cover illustration: OpenAI image generation tool in Codex; exact prompt, original file and web asset in [docs/artwork.md](docs/artwork.md). The sloth icon is original SVG. Interface screenshots show the actual application. AI coding assistance was used. No images represent measured educational results.
