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
    # PF Chang's — appetizers
    "PF-CHICKEN-LETTUCE-WRAPS":  "chicken lettuce wraps asian",
    "PF-CRAB-WONTONS":           "crab wonton fried appetizer",
    "PF-DYNAMITE-SHRIMP":        "crispy fried shrimp asian",
    "PF-CALAMARI":               "fried calamari golden",
    # PF Chang's — soup
    "PF-EGG-DROP-SOUP":          "egg drop soup chinese",
    "PF-HOT-SOUR-SOUP":          "hot sour soup chinese",
    # PF Chang's — chicken mains
    "PF-CHANGS-SPICY-CHICKEN":   "spicy chinese chicken chili",
    "PF-KUNG-PAO-CHICKEN":       "kung pao chicken peanuts",
    "PF-ORANGE-PEEL-CHICKEN":    "orange chicken sauce",
    "PF-CRISPY-HONEY-CHICKEN":   "crispy honey chicken",
    "PF-SWEET-SOUR-CHICKEN":     "sweet sour chicken pineapple",
    "PF-GINGER-CHICKEN-BROCCOLI": "chicken broccoli stir fry",
    # PF Chang's — beef
    "PF-MONGOLIAN-BEEF":         "mongolian beef stir fry",
    "PF-PEPPER-STEAK":           "pepper steak wok asian",
    "PF-BEEF-SICHUAN":           "sichuan beef crispy",
    # PF Chang's — seafood
    "PF-SHRIMP-SAUCE":           "shrimp asian sauce",
    # PF Chang's — noodles
    "PF-PAD-THAI":               "pad thai noodles",
    "PF-SINGAPORE-NOODLES":      "singapore curry noodles",
    "PF-LO-MEIN-CHICKEN":        "chicken lo mein noodles",
    # PF Chang's — rice
    "PF-FRIED-RICE-COMBO":       "combination fried rice",
    "PF-FRIED-RICE-CHICKEN":     "chicken fried rice",
    # PF Chang's — salad / side / vegetarian
    "PF-ASIAN-CAESAR":           "asian caesar salad",
    "PF-CRISPY-GREEN-BEANS":     "crispy green beans tempura",
    "PF-SICHUAN-ASPARAGUS":      "sichuan asparagus stir fry",
    "PF-COCONUT-CURRY":          "coconut curry vegetables tofu",
    # PF Chang's — dessert
    "PF-BANANA-SPRING-ROLLS":    "banana spring rolls dessert",
    "PF-GREAT-WALL-CHOCOLATE":   "chocolate layer cake slice",
    # PF Chang's — drinks
    "PF-JASMINE-TEA":            "jasmine green tea cup",
    "PF-LYCHEE-MOJITO":          "lychee cocktail mocktail",
    # Cheesecake Factory — cheesecakes (the namesake)
    "CCF-ORIGINAL-CHEESECAKE":      "plain new york cheesecake slice",
    "CCF-STRAWBERRY-CHEESECAKE":    "strawberry cheesecake slice",
    "CCF-OREO-CHEESECAKE":          "oreo chocolate cheesecake slice",
    "CCF-REESES-CHEESECAKE":        "peanut butter chocolate cheesecake",
    "CCF-TIRAMISU-CHEESECAKE":      "tiramisu dessert slice",
    "CCF-SALTED-CARAMEL-CHEESECAKE": "salted caramel cheesecake slice",
    "CCF-CARROT-CHEESECAKE":        "carrot cake slice frosting",
    "CCF-GODIVA-CHEESECAKE":        "chocolate cheesecake decadent",
    # Cheesecake Factory — burgers
    "CCF-CLASSIC-BURGER":           "classic beef cheeseburger fries",
    "CCF-BBQ-BACON-BURGER":         "bbq bacon cheeseburger",
    "CCF-MUSHROOM-BURGER":          "mushroom swiss burger",
    # Cheesecake Factory — pasta
    "CCF-FETTUCCINI-ALFREDO":       "fettuccini alfredo creamy pasta",
    "CCF-SHRIMP-SCAMPI-PASTA":      "shrimp scampi pasta lemon",
    "CCF-CARBONARA":                "pasta carbonara bacon",
    "CCF-CAJUN-JAMBALAYA":          "cajun pasta shrimp chicken",
    # Cheesecake Factory — pizza
    "CCF-MARGHERITA-PIZZA":         "margherita pizza basil",
    "CCF-BBQ-CHICKEN-PIZZA":        "bbq chicken pizza",
    # Cheesecake Factory — appetizers
    "CCF-AVOCADO-EGGROLLS":         "avocado egg rolls appetizer",
    "CCF-FRIED-MAC-CHEESE":         "fried mac and cheese balls",
    "CCF-BUFFALO-WINGS":            "buffalo chicken wings spicy",
    "CCF-SPINACH-CHEESE-DIP":       "spinach artichoke cheese dip",
    # Cheesecake Factory — salads
    "CCF-COBB-SALAD":               "cobb salad chicken bacon avocado",
    "CCF-CHINESE-CHICKEN-SALAD":    "chinese chicken salad noodles",
    "CCF-CAESAR-SALAD":             "caesar salad chicken croutons",
    # Cheesecake Factory — mains
    "CCF-SALMON":                   "grilled salmon fillet lemon",
    "CCF-CHICKEN-MARSALA":          "chicken marsala mushroom sauce",
    # Cheesecake Factory — sides
    "CCF-SWEET-POTATO-FRIES":       "sweet potato fries crispy",
    "CCF-MASHED-POTATOES":          "creamy mashed potatoes",
    # Cheesecake Factory — drinks
    "CCF-STRAWBERRY-LEMONADE":      "strawberry lemonade glass",
    "CCF-ICED-TEA":                 "iced black tea glass",
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

    # Optional CLI filter: ` --prefix PF-` only processes external_ids
    # matching the prefix. Stops the script from re-touching already-
    # approved photos for other brands when adding a new brand.
    import sys
    prefix_filter: str | None = None
    if "--prefix" in sys.argv:
        i = sys.argv.index("--prefix")
        if i + 1 < len(sys.argv):
            prefix_filter = sys.argv[i + 1]
            print(f"  filter: external_id starting with '{prefix_filter}'")

    sb = create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )

    items_to_process = (
        {k: v for k, v in ITEMS.items() if k.startswith(prefix_filter)}
        if prefix_filter
        else ITEMS
    )
    if not items_to_process:
        print(f"  no items match prefix '{prefix_filter}'")
        return

    results: list[tuple[str, str | None]] = []
    for i, (external_id, query) in enumerate(items_to_process.items(), 1):
        url = fetch_one(api_key, query)
        results.append((external_id, url))
        marker = "[OK]" if url else "[--]"
        print(f"  [{i:>2}/{len(items_to_process)}] {marker} {external_id}  ({query})")
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
