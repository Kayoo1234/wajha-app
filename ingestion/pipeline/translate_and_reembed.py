"""One-shot: backfill shop.product.title_ar via Cohere chat, then re-embed text
using the bilingual title and overwrite shop.product_embedding.text_embedding.

Why this exists
---------------
Scrapers captured English titles only. Cohere embed-multilingual-v3 can match
Arabic queries against English documents in principle, but quality is weak — the
demo's Arabic scenario surfaced cosmetics for `فستان` (dress). Fix is to
populate native Arabic titles and re-embed.

Run from the ingestion venv:
    .venv/Scripts/python -m pipeline.translate_and_reembed

Idempotent: re-running overwrites title_ar and text_embedding.
"""
from __future__ import annotations

import os
import re
import time
from pathlib import Path

import cohere
from dotenv import load_dotenv
from supabase import create_client

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_PATH)

TRANSLATE_BATCH = 40
EMBED_BATCH = 96
CHAT_MODEL = "command-r-plus-08-2024"
EMBED_MODEL = "embed-multilingual-v3.0"


def co_client() -> cohere.Client:
    return cohere.Client(os.environ["COHERE_API_KEY"])


def sb_client():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


_NUM_LINE = re.compile(r"^\s*(\d+)[\.\)\-:]\s*(.+?)\s*$")


def _parse_numbered(text: str, n: int) -> list[str]:
    """Pull n numbered Arabic lines out of a chat response, tolerant of stray prose."""
    out: dict[int, str] = {}
    for line in text.splitlines():
        m = _NUM_LINE.match(line)
        if m:
            idx = int(m.group(1))
            if 1 <= idx <= n:
                out[idx] = m.group(2).strip()
    return [out.get(i + 1, "") for i in range(n)]


def translate_titles(co: cohere.Client, titles: list[str]) -> list[str]:
    numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(titles))
    prompt = (
        "Translate each of the following retail product titles into Modern Standard Arabic "
        "as it would appear on a Kuwait e-commerce storefront. Be concise — same length as the "
        "English. Do NOT transliterate; use the natural Arabic equivalent for words like "
        "'T-shirt', 'Jacket', 'Sneaker', 'Candle', etc. Preserve numbers and brand-proper-nouns.\n\n"
        "Output ONLY a numbered list of Arabic translations in the same order. No commentary.\n\n"
        f"Titles:\n{numbered}\n\nArabic translations (numbered, same order):"
    )
    resp = co.chat(message=prompt, model=CHAT_MODEL, temperature=0.1)
    text = getattr(resp, "text", None) or ""
    parsed = _parse_numbered(text, len(titles))
    # Fall back to the English title for any line the model dropped
    return [a if a else t for a, t in zip(parsed, titles)]


def embedding_text(r: dict) -> str:
    parts = [
        r.get("title") or "",
        r.get("title_ar") or "",
        f"Category: {r.get('category') or ''} {r.get('subcategory') or ''}".strip(),
        f"Color: {r.get('color') or ''}".strip(),
        r.get("description") or "",
    ]
    return ". ".join(p for p in parts if p and p != "Category: " and p != "Color:").strip()


def main() -> None:
    co = co_client()
    sb = sb_client()

    print("Fetching products…")
    products = (
        sb.schema("shop").table("product")
        .select("id, title, title_ar, category, subcategory, color, description")
        .execute().data
    )
    print(f"  got {len(products)} products")

    # --- Phase 1: translate ---
    print(f"\nTranslating titles in batches of {TRANSLATE_BATCH}…")
    t0 = time.time()
    updates: list[dict] = []
    for i in range(0, len(products), TRANSLATE_BATCH):
        batch = products[i:i + TRANSLATE_BATCH]
        titles = [p["title"] for p in batch]
        ar = translate_titles(co, titles)
        for p, a in zip(batch, ar):
            p["title_ar"] = a
            updates.append({"id": p["id"], "title_ar": a})
        print(f"  {i + len(batch)}/{len(products)} translated")
    print(f"  translation done in {time.time() - t0:.1f}s")

    # --- Phase 2: bulk write title_ar ---
    print("\nWriting title_ar to Supabase (one row per call — supabase-py limitation)…")
    t0 = time.time()
    for j, u in enumerate(updates, 1):
        sb.schema("shop").table("product").update({"title_ar": u["title_ar"]}).eq("id", u["id"]).execute()
        if j % 100 == 0:
            print(f"  {j}/{len(updates)} written")
    print(f"  title_ar writes done in {time.time() - t0:.1f}s")

    # --- Phase 3: re-embed bilingual text ---
    print(f"\nRe-embedding {len(products)} bilingual texts in batches of {EMBED_BATCH}…")
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

    # --- Phase 4: update text_embedding ---
    print("\nWriting text_embedding to Supabase…")
    t0 = time.time()
    for j, (p, emb) in enumerate(zip(products, embeddings), 1):
        sb.schema("shop").table("product_embedding").update(
            {"text_embedding": emb}
        ).eq("product_id", p["id"]).execute()
        if j % 100 == 0:
            print(f"  {j}/{len(products)} written")
    print(f"  embedding writes done in {time.time() - t0:.1f}s")

    print("\n[DONE] All done. Restart the backend to clear any cached search paths.")


if __name__ == "__main__":
    main()
