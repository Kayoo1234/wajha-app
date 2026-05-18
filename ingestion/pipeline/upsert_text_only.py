"""Surgical upsert — text embeddings ONLY.

The main pipeline.upsert blindly writes color=r.get('color') to the
product table, which wipes the backfilled color tags whenever JSONLs
don't include color. This script does only the text-embedding side
so the backfilled colors stay intact.

Run after pipeline.embed_text whenever you've re-generated text
embeddings post-color-backfill.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"


def main() -> None:
    sb = create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )

    print("Loading brand + product maps...")
    brands = sb.schema("shop").table("brand").select("id, slug").execute().data
    slug_to_id = {b["slug"]: b["id"] for b in brands}

    products = (
        sb.schema("shop")
        .table("product")
        .select("id, brand_id, external_id")
        .execute()
        .data
    )
    pid_by_key = {(p["brand_id"], p["external_id"]): p["id"] for p in products}
    print(f"  {len(brands)} brands, {len(products)} products")

    total = 0
    for jsonl in sorted(OUTPUT_DIR.glob("*_text_embeddings.jsonl")):
        seen: set[str] = set()
        rows: list[dict] = []
        for line in jsonl.open(encoding="utf-8"):
            r = json.loads(line)
            brand_id = slug_to_id.get(r["brand_slug"])
            pid = pid_by_key.get((brand_id, r["external_id"]))
            if not pid or pid in seen:
                continue
            seen.add(pid)
            rows.append({"product_id": pid, "text_embedding": r["text_embedding"]})
        if rows:
            sb.schema("shop").table("product_embedding").upsert(
                rows, on_conflict="product_id"
            ).execute()
            total += len(rows)
            print(f"  [{jsonl.stem}] upserted {len(rows)} text embeddings")

    print(f"\n[DONE] total text embeddings upserted: {total}")


if __name__ == "__main__":
    main()
