# Recorded verification

Recorded for this implementation on 2026-11-13 (Asia/Hong_Kong). This report distinguishes completed automated checks from device, browser, and external-service checks that remain unverified.

## Completed checks

| Command/check | Result |
| --- | --- |
| `cd frontend && npm run build` | Passed TypeScript checking and Vite production build. |
| `cd backend && .venv/bin/python -m unittest discover -s tests -v` | 21 tests passed, zero skipped, with the production frontend build present. Tests use temporary isolated databases. |
| `node --test frontend/src/pose/analysis.test.mjs` | Nine pose analysis tests passed. |
| `git diff --check` | Passed whitespace/error checks. |
| `FITPILOT_DB_PATH=/tmp/fitpilot-supervisor-qa-20261113.db python3 scripts/dev.py` | Both Uvicorn and Vite reached ready state using an isolated database. Ctrl+C exited with status 0 and stopped the owned processes; a subsequent port check found no listeners on 8000/5173. |
| Component render smoke using Vite `ssrLoadModule`, React, and `react-dom/server.renderToString` | Passed rendering of current plan approval/meals/validation/provenance, a legacy plan with the original meal shape, preference fields/weekday picker, and nested agent output arrays/booleans. This was a server render check, not browser UI verification. |
| Compile `scripts/dev.py` with Python's `compile(...)` | Passed syntax validation. |
| Resolve repository-relative links in README and `docs/*.md` | Passed local documentation link validation. |

Backend coverage includes typed API validation, schedule/time/catalog/diet/budget checks, atomic plan approval and stale-draft rejection, saved workflows/history, pose summary and landmark validation, agent feedback/adaptation, fallback behavior, and the OpenAI-compatible transport using a local mock HTTP service. Transport checks verify the request path, model, bearer authorization, and Qwen-specific options. A mock service does not prove availability of the real TACC endpoint.

The legacy migration test starts from a fixture of the original schema, initializes the current schema twice, and verifies that existing profile data, workout records, plan JSON, plan sources/active flags, and a custom recipe survive. It also checks additive defaults and the availability of new agent/pose tables. The built-frontend route test uses FastAPI TestClient to verify index, JavaScript/CSS assets, docs, and OpenAPI responses, plus 404 handling for an unknown API route. These HTTP checks do not execute browser JavaScript.

Pose tests cover angle geometry, full and partial repetitions, confidence gating, visible-side selection, tracking gaps, circle counting, numerical snapshot bounds, and snapshot sampling. These tests exercise the pure state machine with synthetic landmark inputs; they do not run the MediaPipe model on real video.

The original development database was not used for automated test writes or reset. Existing user files and local database records were retained. This task did not publish a hosted website.

## Verification limits

Browser automation could not open the local preview because the browser permission gate rejected the local origin. Consequently, no successful visual inspection, browser interaction pass, live camera permission test, hardware MediaPipe inference, or real-clip accuracy check is claimed. Successful process startup, TestClient HTTP checks, and component server rendering do not replace those browser checks.

Live TACC/OpenAI-compatible inference remains unverified without a reachable configured service. A valid model URL in `/api/health` reports configuration only. Use `/api/model/status` and inspect each result's source after configuring the intended service.

The course proposal's labeled video evaluation and baseline comparisons remain separate work. See [QA.md](QA.md) for manual checks and the proposed evaluation matrix. No clinical or rep-accuracy benchmark is implied by the automated results above.
