"""Replace food product image_urls with real Pexels photos.

Why
---
Demo had brand-color emoji cards which feel prototype-y. Pexels API
returns curated commercial-use-licensed stock food photography matched
to a keyword. One API call per item, takes the top result, stores the
URL in shop.product.image_url. ~45 calls total, ~5 minutes.

Pexels API
- Free tier: 200 req/hr, 20k req/month
- License: free for commercial use, no attribution required for digital use
- Endpoint: https://api.pexels.com/v1/search?query=<keyword>
- Auth: Authorization: <API_KEY> header

Run from the ingestion venv:
    PYTHONUNBUFFERED=1 .venv/Scripts/python -u -m pipeline.fetch_pexels_food_photos
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Keyword curation per item. Picked to maximize chance of a real food
# photo of the right type — Pexels has good results for generic terms
# ("chicken sandwich", "iced latte") but suffers on brand-specific
# names ("Caniac Combo" returns random photos).
ITEMS: dict[str, str] = {
    # Cane's mains
    "RC-BOX-COMBO":        "fried chicken tenders meal",
    "RC-CANIAC-COMBO":     "fried chicken tenders large platter",
    "RC-SANDWICH-COMBO":   "fried chicken sandwich meal",
    "RC-3-FINGER-COMBO":   "fried chicken tenders three",
    "RC-KIDS-COMBO":       "kids chicken nuggets meal",
    "RC-TAILGATES-25":     "fried chicken party platter",
    "RC-TAILGATES-50":     "fried chicken family bucket",
    "RC-TAILGATES-100":    "fried chicken bucket large",
    # Cane's sides
    "RC-FRIES":            "crinkle cut french fries",
    "RC-COLESLAW":         "coleslaw salad bowl",
    "RC-TEXAS-TOAST":      "buttered texas toast bread",
    "RC-EXTRA-SAUCE":      "dipping sauce ramekin",
    # Cane's drinks
    "RC-LEMONADE":         "fresh lemonade glass",
    "RC-SWEET-TEA":        "iced sweet tea glass",
    "RC-WATER":            "bottled water",
    # Starbucks hot espresso
    "SB-LATTE":                  "latte art coffee cup",
    "SB-CAPPUCCINO":             "cappuccino foam coffee",
    "SB-CAFFE-MOCHA":            "mocha coffee chocolate",
    "SB-AMERICANO":              "americano black coffee",
    "SB-FLAT-WHITE":             "flat white coffee",
    "SB-CARAMEL-MACCHIATO":      "caramel macchiato drizzle",
    "SB-ESPRESSO-DOPPIO":        "espresso shot crema",
    "SB-VANILLA-LATTE":          "vanilla latte coffee",
    "SB-WHITE-MOCHA":            "white chocolate mocha coffee",
    # Iced
    "SB-ICED-LATTE":             "iced latte coffee glass",
    "SB-ICED-AMERICANO":         "iced americano black coffee",
    "SB-COLD-BREW":              "cold brew coffee glass",
    "SB-NITRO-COLD-BREW":        "nitro cold brew coffee",
    "SB-ICED-CARAMEL-MACCHIATO": "iced caramel macchiato",
    # Frappuccinos
    "SB-MOCHA-FRAPP":            "mocha frappuccino whipped cream",
    "SB-CARAMEL-FRAPP":          "caramel frappuccino drizzle",
    "SB-JAVA-CHIP-FRAPP":        "java chip frappuccino chocolate",
    "SB-VANILLA-BEAN-FRAPP":     "vanilla bean frappuccino white",
    # Refreshers
    "SB-MANGO-DRAGONFRUIT":      "mango dragonfruit fruit drink",
    "SB-STRAWBERRY-ACAI":        "strawberry acai drink red",
    "SB-PINK-DRINK":             "pink strawberry milk drink",
    # Tea
    "SB-CHAI-LATTE":             "chai latte tea spice",
    "SB-MATCHA-LATTE":           "matcha green tea latte",
    "SB-ICED-GREEN-TEA":         "iced green tea glass",
    # Hot chocolate
    "SB-HOT-CHOCOLATE":          "hot chocolate whipped cream",
    # Pastries / sandwich / sweets
    "SB-ALMOND-CROISSANT":       "almond croissant pastry",
    "SB-CHICKEN-PANINI":         "chicken panini sandwich grilled",
    "SB-BLUEBERRY-MUFFIN":       "blueberry muffin bakery",
    "SB-CHOC-CHIP-COOKIE":       "chocolate chip cookie",
    "SB-CHEESECAKE":             "new york cheesecake slice",
}

PEXELS_SEARCH = "https://api.pexels.com/v1/search"


def fetch_one(api_key: str, query: str) -> str | None:
    """Return the top-result photo URL (large size) for a keyword, or None."""
    params = {"query": query, "per_page": 3, "orientation": "square"}
    resp = requests.get(
        f"{PEXELS_SEARCH}?{urlencode(params)}",
        headers={"Authorization": api_key},
        timeout=15,
    )
    if resp.status_code != 200:
        print(f"  HTTP {resp.status_code} for '{query}'  body={resp.text[:200]}")
        return None
    data = resp.json()
    photos = data.get("photos") or []
    if not photos:
        return None
    # Prefer the "large" size — ~940px wide, plenty for our 600x600 cards.
    # Pexels lets us add fit/crop params to the URL for tighter framing.
    src = photos[0].get("src", {})
    base = src.get("large") or src.get("medium") or src.get("original")
    if not base:
        return None
    # Force square 600x600 crop for consistent card framing
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}w=600&h=600&fit=crop&auto=compress&cs=tinysrgb"


def main() -> None:
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key:
        raise SystemExit(
            "PEXELS_API_KEY missing.\n"
            "  Get one at https://pexels.com/api (30 seconds, no card)\n"
            "  Add to ingestion/.env:\n"
            "    PEXELS_API_KEY=<your-key>"
        )

    sb = create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )

    results: list[tuple[str, str | None]] = []
    for i, (external_id, query) in enumerate(ITEMS.items(), 1):
        url = fetch_one(api_key, query)
        results.append((external_id, url))
        marker = "[OK]" if url else "[--]"
        print(f"  [{i:>2}/{len(ITEMS)}] {marker} {external_id}  ({query})")
        # Be polite to Pexels — 200 req/hr free tier; spacing keeps headroom.
        time.sleep(0.3)

    hits = [r for r in results if r[1]]
    misses = [r for r in results if not r[1]]
    print(f"\nResults: {len(hits)} hits, {len(misses)} misses out of {len(results)}")

    if misses:
        print("\nMisses (will keep existing image_url for these):")
        for m, _ in misses:
            print(f"  - {m}")

    if not hits:
        print("\nNothing to write.")
        return

    print(f"\nWriting {len(hits)} image_url updates to Supabase...")
    for j, (ext_id, url) in enumerate(hits, 1):
        sb.schema("shop").table("product").update({"image_url": url}).eq(
            "external_id", ext_id
        ).execute()
        if j % 10 == 0:
            print(f"  {j}/{len(hits)} written")
    print(f"\n[DONE] {len(hits)} food images replaced with Pexels photos.")


if __name__ == "__main__":
    main()
