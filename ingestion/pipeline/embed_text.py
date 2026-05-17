"""Phase 3 — text embeddings via Cohere embed-multilingual-v3.

Reads JSONL products, builds an embedding string per product, batches 96 at a time
(Cohere max), and writes 1024-dim vectors to ingestion/output/{brand_slug}_text_embeddings.jsonl.

CRITICAL: input_type='search_document' at ingestion. Backend uses 'search_query'.
These are asymmetric and must not be confused.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import cohere
from dotenv import load_dotenv

load_dotenv()

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"
MODEL = "embed-multilingual-v3.0"
BATCH_SIZE = 96


def embedding_text(rec: dict) -> str:
    parts = [
        rec.get("title") or "",
        rec.get("title_ar") or "",  # bilingual for Cohere multilingual model
        f"Category: {rec.get('category') or ''} {rec.get('subcategory') or ''}".strip(),
        f"Color: {rec.get('color') or ''}".strip(),
        rec.get("description") or "",
    ]
    return ". ".join(p for p in parts if p).strip()


def run() -> None:
    api_key = os.getenv("COHERE_API_KEY")
    if not api_key:
        raise SystemExit("COHERE_API_KEY missing — set it in ingestion/.env")
    co = cohere.Client(api_key)

    for jsonl in OUTPUT_DIR.glob("*_products.jsonl"):
        brand_slug = jsonl.stem.replace("_products", "")
        out_path = OUTPUT_DIR / f"{brand_slug}_text_embeddings.jsonl"
        records = [json.loads(l) for l in jsonl.open(encoding="utf-8")]
        texts = [embedding_text(r) for r in records]

        embeddings: list[list[float]] = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            resp = co.embed(
                texts=batch,
                model=MODEL,
                input_type="search_document",
                embedding_types=["float"],
            )
            embeddings.extend(resp.embeddings.float)

        with out_path.open("w", encoding="utf-8") as fout:
            for rec, emb in zip(records, embeddings):
                fout.write(json.dumps({
                    "brand_slug": brand_slug,
                    "external_id": rec["external_id"],
                    "text_embedding": emb,
                }) + "\n")
        print(f"[{brand_slug}] embedded {len(embeddings)} texts -> {out_path}")


if __name__ == "__main__":
    run()
