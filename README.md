# alshaya-shop-demo

Working code repo for the **Wajha** AI shopping discovery demo.

Pitch context, executive summary, demo script, and architecture notes live in `../docs/` (Wajha-Mena root). This repo holds the runnable artifact.

The canonical 6-phase build plan is `../docs/reference/alshaya_demo_plan_1.md`. Treat it as the spec.

---

## Quickstart

Prereqs: Python 3.11+, Node 18+, git, GNU make (Git Bash on Windows ships with it). Supabase project provisioned (project ref `uqxvgfvkgwnckkglkauj`, see root `CLAUDE.md`).

```powershell
# 1. install deps
make setup

# 2. fill in keys
copy .env.example .env             # then edit .env
copy ingestion\.env.example ingestion\.env
copy backend\.env.example backend\.env

# 3. deploy DB schema (one-time)
#    paste supabase/schema.sql then supabase/seed.sql into the Supabase SQL editor,
#    or use the supabase MCP server via Claude Code.

# 4. ingest -> embed -> upsert
make demo

# 5. run services (separate terminals)
make backend
make frontend
```

If `make` isn't available, run the equivalent commands from the Makefile directly. Each phase is one shell command.

---

## Layout

```
alshaya-shop-demo/
  ingestion/       Phase 2 (scrapers) + Phase 3 (embeddings, upsert)
    scrapers/      one per brand
    pipeline/      embed_images / embed_text / upsert
    output/        JSONL files written by scrapers
    cache/images/  downloaded product images
  backend/         Phase 4 — FastAPI search service
    tests/         hardcoded acceptance tests from the plan
  frontend/        Phase 5 — Next.js 14 demo UI (scaffolded by create-next-app)
  supabase/        Phase 1 — schema + seed SQL
  docs/            pointer up to root pitch docs
  Makefile
```

---

## Phase gates

The plan defines a gate at the end of each phase. Don't proceed without it.

| Phase | Gate |
|---|---|
| 0 | Folder structure exists, venvs install cleanly, Next.js dev server runs on :3000 |
| 1 | Schema deployed, 4 brand rows present, no errors on the indexes |
| 2 | 4 JSONL files in ingestion/output/, each with 150–200 products, each spot-checked |
| 3 | ~800 products in DB, ~800 image + text embeddings, sanity check (cosine > 0.999) passes |
| 4 | FastAPI on :8000, all 4 backend tests pass |
| 5 | All 5 demo scenarios work end-to-end on :3000 |
| 6 | Pitch artifacts complete (already done — see `../docs/`) |

---

## Anti-gaming guardrails

The plan requires verification at every gate (see plan §"Anti-Gaming Guardrails"). Do not skip them.

1. Scrapers: spot-check 5 random products manually (open product_url in a browser, verify price + title + image).
2. Embeddings: re-embed 3 random products, verify cosine similarity to the stored vector > 0.999.
3. Backend: run `pytest backend/tests/test_search.py` — all 4 tests must pass.
4. Frontend: open in incognito, run the 5 scenarios, time each. Any > 60s is a fail.
5. End-to-end: fresh `git clone` to a new folder, `make demo`, verify it works from zero.
