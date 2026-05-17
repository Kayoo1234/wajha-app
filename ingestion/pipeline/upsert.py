"""Phase 3 — upsert products + embeddings into Supabase.

Reads from ingestion/output/*.jsonl and pushes to Supabase tables in the `shop` schema.
Uses the service-role key (bypasses RLS). Idempotent: upserts on (brand_id, external_id)
for shop.product and on (product_id) for shop.product_embedding.

Plan §Phase 3 sanity queries (run after upsert):
    SELECT count(*) FROM shop.product;                                      -- ~800
    SELECT count(*) FROM shop.product_embedding WHERE image_embedding IS NOT NULL;  -- ~800
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"


def client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        raise SystemExit("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing")
    return create_client(url, key)


def run() -> None:
    sb = client()

    # 1. Map brand slug -> brand id (brands are seeded via seed.sql)
    brands = sb.schema("shop").table("brand").select("id,slug").execute().data
    slug_to_id = {b["slug"]: b["id"] for b in brands}
    if len(slug_to_id) < 4:
        raise SystemExit(f"Expected 4 seeded brands, found {len(slug_to_id)}. Run supabase/seed.sql first.")

    # 2. Upsert products
    total_products = 0
    product_id_by_key: dict[tuple[str, str], str] = {}
    for jsonl in OUTPUT_DIR.glob("*_products.jsonl"):
        # A single brand JSONL can contain the same external_id under multiple
        # categories (e.g., the same Foot Locker sneaker appears in shop-mens AND
        # shop-new-arrivals). PostgREST's ON CONFLICT can't touch the same row
        # twice in one batch, so dedupe in Python — keep the first occurrence.
        seen: set[tuple[str, str]] = set()
        rows = []
        for line in jsonl.open(encoding="utf-8"):
            r = json.loads(line)
            slug = r["brand_slug"]
            if slug not in slug_to_id:
                continue
            key = (slug_to_id[slug], r["external_id"])
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "brand_id": slug_to_id[slug],
                "external_id": r["external_id"],
                "title": r["title"],
                "title_ar": r.get("title_ar"),
                "description": r.get("description"),
                "price_kwd": r.get("price_kwd"),
                "category": r.get("category"),
                "subcategory": r.get("subcategory"),
                "color": r.get("color"),
                "image_url": r["image_url"],
                "product_url": r["product_url"],
                "in_stock": r.get("in_stock", True),
            })
        if not rows:
            continue
        resp = sb.schema("shop").table("product").upsert(
            rows, on_conflict="brand_id,external_id"
        ).execute()
        for row in resp.data or []:
            product_id_by_key[(row["brand_id"], row["external_id"])] = row["id"]
        total_products += len(rows)
        print(f"[{jsonl.stem}] upserted {len(rows)} products")

    # 3. Upsert image embeddings
    img_count = _upsert_embeddings(sb, product_id_by_key, slug_to_id, "image")
    # 4. Upsert text embeddings
    txt_count = _upsert_embeddings(sb, product_id_by_key, slug_to_id, "text")

    print(f"\nTotal products: {total_products}")
    print(f"Image embeddings: {img_count}")
    print(f"Text embeddings:  {txt_count}")


def _upsert_embeddings(sb, product_id_by_key, slug_to_id, kind: str) -> int:
    suffix = "_image_embeddings.jsonl" if kind == "image" else "_text_embeddings.jsonl"
    col = "image_embedding" if kind == "image" else "text_embedding"
    total = 0
    for jsonl in OUTPUT_DIR.glob(f"*{suffix}"):
        # Dedupe by product_id for the same reason as the product upsert above.
        seen: set[str] = set()
        rows = []
        for line in jsonl.open(encoding="utf-8"):
            r = json.loads(line)
            brand_id = slug_to_id.get(r["brand_slug"])
            pid = product_id_by_key.get((brand_id, r["external_id"]))
            if not pid or pid in seen:
                continue
            seen.add(pid)
            rows.append({"product_id": pid, col: r[col]})
        if not rows:
            continue
        sb.schema("shop").table("product_embedding").upsert(
            rows, on_conflict="product_id"
        ).execute()
        total += len(rows)
        print(f"[{jsonl.stem}] upserted {len(rows)} {kind} embeddings")
    return total


if __name__ == "__main__":
    run()
