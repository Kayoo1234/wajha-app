"""One-shot: re-embed shop.product with an Arabic category descriptor appended
to the document text, then overwrite shop.product_embedding.text_embedding.

Why
---
Single-word Arabic queries (e.g. فستان) embed to a diffuse vector that's near
the distribution centroid. BBW one-word product titles ("Rose", "Pink",
"Hello Happiness") embed near the same centroid because their input text is
extremely short — yielding sim ~0.47 against literally any Arabic query and
crowding real matches off the top-K.

The fix: extend each product's embedding text with an Arabic phrase that
anchors it in the correct semantic region (e.g. add "فساتين نسائية" to all
apparel:women:dresses products, "شموع معطرة" to beauty:candles). With native
Arabic category context in the document, an Arabic query for "فستان" matches
dresses strongly and BBW candles weakly.

This script ONLY re-embeds and updates text_embedding. It assumes
shop.product.title_ar is already populated (see translate_and_reembed.py).

Run from the ingestion venv:
    PYTHONUNBUFFERED=1 .venv/Scripts/python -u -m pipeline.reembed_with_ar_context
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import cohere
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

EMBED_BATCH = 96
EMBED_MODEL = "embed-multilingual-v3.0"

# Arabic descriptor per category. Lookup is by exact match first, then by the
# longest matching prefix. Two-phrase form (Arabic noun + adjective context)
# gives the embedding a stable, category-defining anchor.
AR_CATEGORY: dict[str, str] = {
    "apparel:women:dresses":   "فساتين نسائية، أزياء حريمي",
    "apparel:women:bottoms":   "بنطلونات نسائية، تنانير",
    "apparel:women:tops":      "بلوزات نسائية، قمصان حريمي",
    "apparel:women:accessories": "إكسسوارات نسائية، شالات",
    "apparel:women":           "ملابس نسائية، أزياء حريمي",
    "apparel:men":             "ملابس رجالية، أزياء رجالي",
    "apparel:kids":            "ملابس أطفال، أزياء أطفال",
    "apparel":                 "ملابس، أزياء",

    "footwear:women":          "أحذية نسائية، جزم حريمي",
    "footwear:men:shoes":      "أحذية رجالية، جزم رجالي",
    "footwear:men":            "أحذية رجالية، جزم رجالي",
    "footwear:kids":           "أحذية أطفال، جزم أولاد بنات",
    "footwear":                "أحذية، جزم",

    "kids:girls_clothing":     "ملابس بنات، أزياء بنات",
    "kids:boys_clothing":      "ملابس أولاد، أزياء أولاد",
    "kids:toys":               "ألعاب أطفال، دمى",
    "kids":                    "أطفال، أزياء أطفال",

    "baby:newborn_clothing":   "ملابس مواليد، أزياء حديثي الولادة",
    "baby:feeding":            "أدوات تغذية الرضع، رضاعات",
    "baby":                    "مستلزمات الأطفال الرضع",

    "beauty:candles":          "شموع معطرة، روائح للمنزل",
    "beauty:fresheners":       "معطرات الجو، روائح منزلية",
    "beauty:body_care":        "عناية بالجسم، مستحضرات الاستحمام",
    "beauty:hand_soaps":       "صابون اليدين، عناية باليدين",
    "beauty:mens":             "عناية رجالية، عطور رجالية",
    "beauty:new":              "عناية بالجسم، شموع وعطور",
    "beauty":                  "عناية ومستحضرات تجميل",

    "home":                    "ديكور منزلي، مفروشات",
}


def ar_descriptor(category: str | None) -> str:
    if not category:
        return ""
    if category in AR_CATEGORY:
        return AR_CATEGORY[category]
    # longest-prefix fallback
    parts = category.split(":")
    while parts:
        key = ":".join(parts)
        if key in AR_CATEGORY:
            return AR_CATEGORY[key]
        parts.pop()
    return ""


def embedding_text(r: dict) -> str:
    parts = [
        r.get("title") or "",
        r.get("title_ar") or "",
        ar_descriptor(r.get("category")),
        f"Category: {r.get('category') or ''} {r.get('subcategory') or ''}".strip(),
        f"Color: {r.get('color') or ''}".strip(),
        r.get("description") or "",
    ]
    return ". ".join(p for p in parts if p and p not in ("Category:", "Color:")).strip()


def main() -> None:
    co = cohere.Client(os.environ["COHERE_API_KEY"])
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    print("Fetching products…")
    products = (
        sb.schema("shop").table("product")
        .select("id, title, title_ar, category, subcategory, color, description")
        .execute().data
    )
    print(f"  got {len(products)} products")

    # Spot-check the descriptor coverage
    no_desc = [p for p in products if not ar_descriptor(p.get("category"))]
    if no_desc:
        cats = sorted({p["category"] for p in no_desc})
        print(f"  warning: {len(no_desc)} products have no AR descriptor (categories: {cats})")

    print(f"\nRe-embedding {len(products)} products with Arabic context…")
    t0 = time.time()
    texts = [embedding_text(p) for p in products]
    embeddings: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i:i + EMBED_BATCH]
        resp = co.embed(
            texts=batch,
            model=EMBED_MODEL,
            input_type="search_document",
            embedding_types=["float"],
        )
        embeddings.extend(resp.embeddings.float)
        print(f"  {i + len(batch)}/{len(texts)} embedded")
    print(f"  embed done in {time.time() - t0:.1f}s")

    print("\nWriting text_embedding to Supabase…")
    t0 = time.time()
    for j, (p, emb) in enumerate(zip(products, embeddings), 1):
        sb.schema("shop").table("product_embedding").update(
            {"text_embedding": emb}
        ).eq("product_id", p["id"]).execute()
        if j % 100 == 0:
            print(f"  {j}/{len(products)} written")
    print(f"  embedding writes done in {time.time() - t0:.1f}s")

    print("\n[DONE] Re-embedding complete. Next query will use new vectors (no restart needed).")


if __name__ == "__main__":
    main()
