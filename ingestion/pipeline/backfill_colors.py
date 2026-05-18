"""One-shot: backfill shop.product.color by parsing the brand-site URL slug.

Why
---
Scrapers didn't capture color into a structured field. Color appears in the
product URL slug for ~all SKUs. The slug-tail format on Foot Locker is
`<product-name>-<modifier?> <primary> [<modifier?> <accent>] [<idx>]`, e.g.
`buy-air-jordan-4-retro-toro-bravo-mens-shoes-fire-red-white-black-cement-grey`.

The previous version of this script picked the LAST base-color token from the
slug. That gave the right answer for single-color products (`-shoes-black`)
but was wrong for two-/three-color products: it picked the trailing accent
instead of the visible primary. Worse, for `-mens-jersey-black` on a "Chicago
White Sox" jersey it accidentally picked `white` from the team name.

The fix is two-fold:
  1. Walk tokens in REVERSE, collecting consecutive trailing color/modifier
     words. STOP at the first non-color word — that's the boundary between
     the product name and the colorway suffix. "Chicago White Sox" can't
     leak in because "sox", "jersey" etc. aren't colors.
  2. Within the collected suffix, return the LEFTMOST BASE color (skipping
     modifiers like `fire`, `summit`, `core`, `wonder`, `metallic`). That's
     the primary color the human sees.

Idempotent. Color is normalized to a single base name (e.g. "light-pink"
collapses to "pink"; "gray" → "grey").

Run from the ingestion venv:
    .venv/Scripts/python -m pipeline.backfill_colors
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

# Base colors — what we tag products with. Order doesn't matter; matching is set-based.
BASE_COLORS: set[str] = {
    "black", "white", "grey", "gray", "navy", "blue", "red", "green", "pink",
    "brown", "beige", "cream", "ivory", "yellow", "orange", "purple", "khaki",
    "olive", "silver", "gold", "charcoal", "burgundy", "maroon", "peach",
    "mint", "lavender", "tan", "rose", "violet", "turquoise", "teal", "coral",
    "salmon", "mustard", "denim", "stone", "sage", "sky", "lime",
}

# Words that QUALIFY a base color but are not themselves the primary tag.
# Brands like Foot Locker stuff these into the slug ("core black", "summit
# white", "fire red", "wonder white", "lucid blue"). Keep this list growing
# whenever a new shoe drops a new modifier — coverage gaps cause silent
# mistags because the reverse-walk stops one token too early.
COLOR_MODIFIERS: set[str] = {
    # generic shade qualifiers
    "light", "dark", "pale", "deep", "bright", "off", "soft", "medium",
    "neon", "metallic", "matte", "pastel",
    # Foot Locker / Nike / Jordan / adidas colorway modifiers seen in catalog
    "fire", "summit", "university", "wonder", "preloved", "lucid",
    "midnight", "core", "aurora", "warm", "blackened", "pine", "royal",
    "cool", "hot", "wash", "vanilla", "gym", "electric", "crystal",
    "wolf", "cement", "college", "hyper", "equipment", "ray", "liquid",
    "copper", "met", "rays", "ridge", "moyen", "gum", "ghost", "carbon",
    "magic", "sand", "iron", "shadow", "frost", "pearl", "smoke",
    "lab", "blast", "ivy", "phantom", "pure", "natural", "elemental",
    "atmosphere", "toro", "bravo", "obsidian", "rose", "sail", "platinum",
    "armory", "anthracite", "graphite", "fog",
    "merl", "rock", "bone", "chalk", "ash", "slate", "fossil", "haze",
    "mocha", "biscuit", "almond", "honey", "stripe",
}

GREY_ALIASES = {"gray": "grey"}

TOKEN_RE = re.compile(r"[a-z]+")


def extract_color(product_url: str) -> str | None:
    """Pick the primary base color from a brand URL slug.

    Two conventions coexist in the catalog:

      (A) Foot Locker / Nike / Jordan / adidas — color is in the trailing
          suffix:  ...mens-shoes-summit-white-metallic-silver-black
      (B) Bath & Body Works / Mothercare — color is in the product name at
          the START of the slug:  rose-fragrance-mist, pink-apple-punch-candle

    Strategy: try (A) first by walking right-to-left and collecting the
    contiguous trailing block of color-or-modifier tokens. If that block
    is non-empty, return its leftmost BASE color (skipping modifiers like
    "summit", "fire", "core"). Otherwise fall back to (B): scan the slug
    left-to-right and return the first BASE color found anywhere.
    """
    path = urlparse(product_url).path.lower()
    tokens = TOKEN_RE.findall(path)

    # (A) Trailing-block: walk reverse, collect consecutive color/modifier
    # tokens, stop at first non-color word.
    suffix: list[str] = []
    for tok in reversed(tokens):
        if tok in BASE_COLORS or tok in COLOR_MODIFIERS:
            suffix.append(tok)
        else:
            break

    if suffix:
        suffix.reverse()
        for tok in suffix:
            if tok in BASE_COLORS:
                return GREY_ALIASES.get(tok, tok)

    # (B) Fall back to first base color anywhere in the slug (BBW / Mothercare).
    for tok in tokens:
        if tok in BASE_COLORS:
            return GREY_ALIASES.get(tok, tok)
    return None


def main() -> None:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    print("Fetching products...")
    rows = (
        sb.schema("shop")
        .table("product")
        .select("id, title, product_url, color")
        .execute()
        .data
    )
    print(f"  got {len(rows)} products")

    hits: dict[str, int] = {}
    miss = 0
    updates: list[dict] = []
    changes: list[tuple[str, str, str | None, str]] = []  # (title, url, old, new)
    for r in rows:
        url = r.get("product_url") or ""
        new_color = extract_color(url)
        if new_color:
            hits[new_color] = hits.get(new_color, 0) + 1
            if r.get("color") != new_color:
                updates.append({"id": r["id"], "color": new_color})
                changes.append((r.get("title", ""), url, r.get("color"), new_color))
        else:
            miss += 1
            if r.get("color") is not None:
                # Slug no longer parses to a color — clear stale value
                updates.append({"id": r["id"], "color": None})
                changes.append((r.get("title", ""), url, r.get("color"), None))

    print("\nColor detection summary:")
    for color, n in sorted(hits.items(), key=lambda x: -x[1]):
        print(f"  {color:>12}: {n}")
    print(f"  {'(no match)':>12}: {miss}")
    print(f"\n  total detected:  {sum(hits.values())}/{len(rows)}")
    print(f"  rows to write:   {len(updates)}")

    if changes:
        print("\nFirst 25 changes:")
        for title, url, old, new in changes[:25]:
            slug_tail = url.rsplit("/", 1)[-1][-80:]
            print(f"  [{old} -> {new}]  {slug_tail}")

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
