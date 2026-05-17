"""One-shot: backfill shop.product.color by parsing the brand-site URL slug.

Why
---
Scrapers didn't capture color into a structured field. Color appears in the
product URL slug for ~all SKUs (e.g. `buy-shirt-black-1`,
`buy-cotton-t-shirt-light-pink-hawaii-0`). We extract the last matching color
token so the SQL filter at search time can pin results to the requested color.

Run from the ingestion venv:
    PYTHONUNBUFFERED=1 .venv/Scripts/python -u -m pipeline.backfill_colors

Idempotent. Color is normalized to a single base name (e.g. "light-pink" → "pink").
"""
from __future__ import annotations

import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Order matters for compound colors: "off-white" → "white", "dark-grey" → "grey".
# We scan tokens in the slug and pick the LAST match (most slugs end with the
# primary color before a trailing index, e.g. `-black-1`).
BASE_COLORS = [
    "black", "white", "grey", "gray", "navy", "blue", "red", "green", "pink",
    "brown", "beige", "cream", "ivory", "yellow", "orange", "purple", "khaki",
    "olive", "silver", "gold", "charcoal", "burgundy", "maroon", "peach",
    "mint", "lavender", "tan", "rose", "violet", "turquoise", "teal", "coral",
    "salmon", "mustard", "denim", "stone",
]
COLOR_RE = re.compile(r"[a-z]+")
GREY_ALIASES = {"gray": "grey"}


def extract_color(product_url: str) -> str | None:
    """Pick the last base-color token from a product URL slug, normalised."""
    path = urlparse(product_url).path.lower()
    tokens = COLOR_RE.findall(path)
    # Walk in reverse — primary color is usually toward end of slug.
    for tok in reversed(tokens):
        if tok in BASE_COLORS:
            return GREY_ALIASES.get(tok, tok)
    return None


def main() -> None:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    print("Fetching products...")
    rows = sb.schema("shop").table("product").select("id, title, product_url, color").execute().data
    print(f"  got {len(rows)} products")

    # Histogram of detected colors + miss count
    hits: dict[str, int] = {}
    miss = 0
    updates: list[dict] = []
    for r in rows:
        c = extract_color(r["product_url"] or "")
        if c:
            hits[c] = hits.get(c, 0) + 1
            if r.get("color") != c:
                updates.append({"id": r["id"], "color": c})
        else:
            miss += 1

    print(f"\nColor detection summary:")
    for color, n in sorted(hits.items(), key=lambda x: -x[1]):
        print(f"  {color:>12}: {n}")
    print(f"  {'(no match)':>12}: {miss}")
    print(f"\n  total detected:  {sum(hits.values())}/{len(rows)}")
    print(f"  rows to write:   {len(updates)}")

    if not updates:
        print("\nNothing to update.")
        return

    print(f"\nWriting color column to Supabase ({len(updates)} rows)...")
    t0 = time.time()
    for j, u in enumerate(updates, 1):
        sb.schema("shop").table("product").update({"color": u["color"]}).eq("id", u["id"]).execute()
        if j % 100 == 0:
            print(f"  {j}/{len(updates)} written")
    print(f"  writes done in {time.time() - t0:.1f}s")
    print("\n[DONE] Color backfill complete. Run pipeline.reembed_with_color next to refresh vectors.")


if __name__ == "__main__":
    main()
