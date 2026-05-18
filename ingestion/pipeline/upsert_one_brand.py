"""Upsert a single brand's products into shop.product without touching
the other brands' rows.

Why this exists separately from pipeline.upsert: pipeline.upsert iterates
EVERY *_products.jsonl in output/ and re-writes every row across all
brands. That wipes any post-scrape data fixes (color backfill, Pexels
image URLs, category migrations) for brands we're not re-ingesting.

This script accepts a single brand slug and only upserts that brand.

Usage:
    .venv/Scripts/python -m pipeline.upsert_one_brand pf_changs
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: python -m pipeline.upsert_one_brand <brand_slug>")
    target_slug = sys.argv[1]

    sb = create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )

    # Map brand slug to id
    brands = sb.schema("shop").table("brand").select("id, slug").execute().data
    slug_to_id = {b["slug"]: b["id"] for b in brands}
    brand_id = slug_to_id.get(target_slug)
    if not brand_id:
        raise SystemExit(f"Brand '{target_slug}' not found. Available: {list(slug_to_id)}")

    jsonl_path = OUTPUT_DIR / f"{target_slug}_products.jsonl"
    if not jsonl_path.exists():
        raise SystemExit(f"JSONL not found: {jsonl_path}")

    rows: list[dict] = []
    seen: set[str] = set()
    for line in jsonl_path.open(encoding="utf-8"):
        r = json.loads(line)
        if r["external_id"] in seen:
            continue
        seen.add(r["external_id"])
        rows.append({
            "brand_id": brand_id,
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
        print(f"No rows to upsert for {target_slug}.")
        return

    resp = (
        sb.schema("shop")
        .table("product")
        .upsert(rows, on_conflict="brand_id,external_id")
        .execute()
    )
    affected = len(resp.data or [])
    print(f"[{target_slug}] upserted {affected} products (no other brands touched)")


if __name__ == "__main__":
    main()
