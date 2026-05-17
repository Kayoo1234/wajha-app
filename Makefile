# Wajha demo — top-level orchestration.
# `make demo` runs the full pipeline cold from a fresh clone.
#
# Windows note: run from Git Bash. The .venv/Scripts/ paths below are Windows-style;
# replace with .venv/bin/ on macOS/Linux.

PY_ING := ingestion/.venv/Scripts/python
PY_BE  := backend/.venv/Scripts/python

.PHONY: help setup setup-ingestion setup-backend setup-frontend \
        ingest embed upsert backend frontend demo clean lint test

help:
	@echo "Targets:"
	@echo "  setup       install Python deps + Playwright browsers + Node deps"
	@echo "  ingest      run all 4 scrapers (Phase 2)"
	@echo "  embed       run image + text embedding pipelines (Phase 3)"
	@echo "  upsert      push products + embeddings to Supabase (Phase 3)"
	@echo "  demo        ingest -> embed -> upsert"
	@echo "  backend     run FastAPI on :8000 (Phase 4)"
	@echo "  frontend    run Next.js on :3000 (Phase 5)"
	@echo "  test        run backend tests (the 4 hardcoded acceptance tests)"
	@echo "  clean       clear caches and JSONL output"

setup: setup-ingestion setup-backend setup-frontend

setup-ingestion:
	cd ingestion && python -m venv .venv
	$(PY_ING) -m pip install --upgrade pip
	$(PY_ING) -m pip install -r ingestion/requirements.txt
	$(PY_ING) -m playwright install chromium

setup-backend:
	cd backend && python -m venv .venv
	$(PY_BE) -m pip install --upgrade pip
	$(PY_BE) -m pip install -r backend/requirements.txt

setup-frontend:
	cd frontend && npm install

ingest:
	$(PY_ING) -m ingestion.scrapers.hm
	$(PY_ING) -m ingestion.scrapers.footlocker
	$(PY_ING) -m ingestion.scrapers.mothercare
	$(PY_ING) -m ingestion.scrapers.bath_body_works

embed:
	$(PY_ING) -m ingestion.pipeline.embed_images
	$(PY_ING) -m ingestion.pipeline.embed_text

upsert:
	$(PY_ING) -m ingestion.pipeline.upsert

demo: ingest embed upsert
	@echo "Pipeline done. Now run: 'make backend' and 'make frontend' in separate terminals."

backend:
	cd backend && ../$(PY_BE) -m uvicorn main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	$(PY_BE) -m pytest backend/tests -v

clean:
	rm -rf ingestion/cache ingestion/output/*.jsonl
	rm -rf ingestion/__pycache__ ingestion/**/__pycache__
	rm -rf backend/__pycache__ backend/**/__pycache__
