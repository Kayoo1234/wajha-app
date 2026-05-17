# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo

Working code repo for **Wajha** — the AI shopping discovery layer pitched to Alshaya Group (see parent folder `../` for pitch context, including `DEMO_SCRIPT.md` and `PITCH_NOTES.md`).

The 6-phase build plan in `../docs/reference/alshaya_demo_plan_1.md` is the spec. Do not improvise beyond it.

## Commands

```bash
make setup        # install Python deps + Playwright browsers + Node deps
make ingest       # run all 4 scrapers (Phase 2)
make embed        # CLIP + Cohere embeddings (Phase 3)
make upsert       # push products + embeddings to Supabase (Phase 3)
make demo         # ingest -> embed -> upsert (full cold pipeline)
make backend      # FastAPI on :8000
make frontend     # Next.js on :3000
make clean        # clear caches and JSONL output
```

Run a single backend test:
```bash
cd backend && .venv/Scripts/python -m pytest tests/test_search.py::test_english_text_search -v
```

Run a single scraper:
```bash
cd ingestion && .venv/Scripts/python -m scrapers.hm
```

## Supabase MCP

The Wajha Supabase project is wired via a **project-scoped** MCP server defined in `../.mcp.json` (parent folder, outside this git tree). The tool prefix is `mcp__supabase_wajha__*` — **not** `mcp__supabase__*`. The unprefixed `supabase` server in `~/.claude.json` points at the user's Wellboard project; do not use it for Wajha work.

| Tool | Purpose |
|---|---|
| `mcp__supabase_wajha__apply_migration` | DDL (schema, RPC functions) |
| `mcp__supabase_wajha__execute_sql` | data queries, verification |
| `mcp__supabase_wajha__list_tables` | schema inspection |
| `mcp__supabase_wajha__get_advisors` | RLS / security check before pilot |
| `mcp__supabase_wajha__get_logs` | debugging |

If the prefix doesn't resolve in a session, the project-scoped MCP either wasn't approved on session start or `.mcp.json` is missing. Restart Claude Code from the `Wajha-Mena/` folder.

## Architecture (big picture)

Three independent services + a Postgres store. Each runs in its own venv / node_modules. They communicate only through Supabase Postgres (no in-process imports across boundaries).

```
ingestion/  --writes-->  Supabase Postgres (shop schema)
                              ^
                              | reads
                              |
backend/  (FastAPI)  <--HTTP--  frontend/  (Next.js)
```

- **ingestion/** is offline batch. Scrapers write JSONL to `output/`, then pipeline scripts read JSONL, compute embeddings, and upsert. No web server; no API.
- **backend/** is the only thing the frontend talks to. It owns Supabase access and embedding-at-query-time (Cohere for text, CLIP for image). The frontend never hits Supabase directly.
- **frontend/** is stateless. Calls `/search/text`, `/search/visual`, `/search/complete_the_look`. No server-side data fetching beyond SWR.
- **supabase/** is DDL only. The `shop` schema is isolated from any other Supabase project state. RLS is off (demo only); production pilot turns RLS on.

## Why this layering matters

- Embeddings are computed on **two** sides: ingestion (once, batch, for the catalog) and backend (live, for queries). Same models on both sides — if you change one, change both, or kNN distances become meaningless.
- Text embeddings use Cohere's `input_type='search_document'` at ingestion and `'search_query'` at the backend. These are asymmetric — do not confuse them.
- Image embeddings (CLIP ViT-B/32) are symmetric — same forward pass at ingestion and backend.

## Hard rules

1. **Public catalog data only.** No login bypass. Rate limit: 1 req / 2s per scraper with ±500ms jitter.
2. **Brand rows are seeded once** via `supabase/seed.sql`. Do not recreate brands at scraper-runtime.
3. **The `shop` schema is the only schema this app touches.** Never write to `public` or modify other Supabase projects.
4. **PII never enters the embedding store.** Vectors come from public product catalogs only.
5. **`.env` is gitignored.** API keys live there, never in code, never in this CLAUDE.md.
6. **Auth model.** Demo: no auth, no per-user state, RLS off (public catalog data only). Pilot: any per-member table (history, saved items, recommendations cache) is RLS-gated on `auth.uid() = aura_member_id`. Service role bypasses RLS for backend ingestion and cross-member ops only.

## Known deviations from the plan

- **Next.js version**: plan says 14; `create-next-app@latest` installed Next 16.2.6 with React 19 and Tailwind 4. Fully compatible with our use (App Router, RSC patterns are stable). If a tutorial-style snippet from the plan breaks, it's likely a Next 14→16 API surface change; consult Vercel docs or the `vercel:nextjs` skill.
- **shadcn package rename**: plan says `npx shadcn-ui@latest init`; the package is now `npx shadcn@latest init`. Use the new name. Not yet installed — run it inside `frontend/` when Phase 5 starts.
- **Python version**: plan says 3.11; this environment uses 3.12. Compatible.
- **Supabase region**: plan didn't specify; project lives in ap-southeast-1 (Singapore). If pilot raises Kuwait data residency, migration plan is in `../docs/PITCH_NOTES.md`.
- **Supabase API key names**: legacy `anon` / `service_role` are deprecated; new names are `publishable` / `secret`. The supabase-py client accepts either. Env var names in `.env.example` use the plan's legacy names for plan-fidelity.
