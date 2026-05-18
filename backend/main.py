"""Wajha search backend (Phase 4).

FastAPI service exposing text, visual, and complete-the-look search.
Frontend (Next.js on :3000) is the only consumer.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    Brand,
    CompleteTheLookRequest,
    CompleteTheLookResponse,
    Product,
    SearchResponse,
    TextSearchRequest,
    VisualSearchRequest,
)
import search
import smart_search

load_dotenv()

app = FastAPI(title="Wajha Search", version="0.1.0")


@app.on_event("startup")
def _warmup():
    """Pre-warm Groq so the first user query is warm (cold-start ~1.5s otherwise)."""
    try:
        smart_search.warmup()
    except Exception:
        pass

app.add_middleware(
    CORSMiddleware,
    # Allows:
    #   - localhost / 127.0.0.1 on any port (dev)
    #   - wajha-mena.com + www.wajha-mena.com (production)
    #   - *.vercel.app (Vercel preview deployments per branch)
    # Anything else gets a CORS reject — no wildcards in production paths.
    allow_origin_regex=(
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"(www\.)?wajha-mena\.com|"
        r"[a-zA-Z0-9-]+\.vercel\.app"
        r")(:\d+)?$"
    ),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/search/text", response_model=SearchResponse)
def search_text(req: TextSearchRequest):
    try:
        return search.text_search(req)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))


@app.post("/search/smart", response_model=smart_search.SmartSearchResponse)
def search_smart(req: smart_search.SmartSearchRequest):
    """
    LLM-assisted search.

    Pipeline:
      1. Groq parses raw query into structured filters (color, category, price).
         Wrapped in cache (1h) + 800ms hard timeout. Falls back to plain kNN.
      2. Over-fetch from RPC (50 hits) so post-filters have headroom.
      3. Title-keyword filter (e.g. require "t-shirt"/"tee" when category=t-shirt)
         — cuts the "apparel-but-not-the-thing" false-positives.
      4. Color filter (graceful fallback if it matches 0).
      5. If intent=discounted OR raw query has a deal-word, sort by price ASC.
      6. Anchored discounted intent: pivot to visual_search with price cap.

    Returns the parsed Intent + hits + transparency notes for the UI.
    """
    notes: list[str] = []

    # 0) Reject empty / single-char queries up front. Avoids the 500 we used
    # to throw when Cohere was called with an empty string, and stops a
    # single-char "a" from returning the whole catalog.
    if len((req.query or "").strip()) < 2:
        return smart_search.SmartSearchResponse(
            intent=smart_search.Intent(query_cleaned="", intent="browse"),
            hits=[],
            total=0,
            notes=["Query too short — try at least 2 characters, e.g. \"white t-shirt\" or \"فستان أحمر\"."],
        )

    # 1) Parse intent (cache + timeout)
    intent, intent_note = smart_search.extract_intent_resilient(req.query, req.lang, timeout_ms=4500)
    if intent_note:
        notes.append(intent_note)

    # 1b) Low-signal query (no structured intent AND short raw text). Return
    # empty + suggestion rather than random kNN hits. Demo discipline.
    if smart_search.is_low_signal(req.query, intent):
        return smart_search.SmartSearchResponse(
            intent=intent or smart_search.Intent(query_cleaned=req.query.strip(), intent="browse"),
            hits=[],
            total=0,
            notes=notes + ["We didn't catch a clear search intent. Try a category or color, e.g. \"black t-shirt\" or \"summer dress\"."],
        )

    if intent is None:
        # Groq timed out / errored — fall back to plain text search
        plain = search.text_search(__import__("schemas").TextSearchRequest(
            query=req.query, lang=req.lang, limit=req.limit,
        ))
        return smart_search.SmartSearchResponse(
            intent=smart_search.Intent(query_cleaned=req.query, intent="specific_search"),
            hits=[h.model_dump() for h in plain.hits],
            total=plain.total,
            notes=notes,
        )

    # 2) Map structured filters into the existing text_search request
    cat_prefix = smart_search.category_to_prefix(intent.category, intent.gender, intent.audience)
    brand_filter = [intent.brand] if intent.brand else None

    # Anchored "discounted" intent — when called from a product page
    if intent.intent == "discounted" and req.anchor_product_id:
        anchor = search.get_product(req.anchor_product_id)
        if anchor:
            max_p = float(anchor.price_kwd or 0) - 0.001 if anchor.price_kwd else None
            visual_req = __import__("schemas").VisualSearchRequest(
                product_id=req.anchor_product_id, limit=req.limit, exclude_same_brand=False,
            )
            visual_resp = search.visual_search(visual_req)
            filtered = [
                h for h in visual_resp.hits
                if max_p is None or (h.price_kwd is not None and h.price_kwd <= max_p)
            ]
            filtered.sort(key=lambda h: h.price_kwd if h.price_kwd is not None else float("inf"))
            notes.append(f"discounted intent: filtered to price ≤ {max_p}, sorted ascending")
            return smart_search.SmartSearchResponse(
                intent=intent,
                hits=[h.model_dump() for h in filtered[:req.limit]],
                total=len(filtered),
                notes=notes,
            )

    # 3) Over-fetch: ask the RPC for more than we'll return, so post-filters
    # (title keyword, color) have headroom before we trim to req.limit.
    over_fetch = max(req.limit * 3, 50)
    text_req = __import__("schemas").TextSearchRequest(
        query=intent.query_cleaned or req.query,
        lang=req.lang,
        limit=over_fetch,
        brand_filter=brand_filter,
        max_price_kwd=intent.max_price_kwd,
        category_filter=cat_prefix,
    )
    text_resp = search.text_search(text_req)
    hits = text_resp.hits
    initial_n = len(hits)

    # 4) Title-keyword filter (require sensible title for known categories)
    if intent.category:
        title_filtered = [h for h in hits if smart_search.title_matches_category(h.title, intent.category)]
        if title_filtered:
            hits = title_filtered
            notes.append(f"title rule for '{intent.category}': {len(title_filtered)} of {initial_n} matched")
        else:
            # Category requested, but nothing in catalog matches the rule.
            # When a rule EXISTS for the category, return empty rather than
            # leaking unrelated kNN hits — better demo UX than showing
            # "watches" that are actually BBW body sprays.
            rules_exist = intent.category.strip().lower() in smart_search._CATEGORY_TITLE_RULES
            if rules_exist:
                notes.append(
                    f"No {intent.category} in our catalog right now. "
                    f"This is the prototype's 4-brand demo — Cane's / Starbucks / "
                    f"PF Chang's / Cheesecake Factory tabs will expand the catalog."
                )
                return smart_search.SmartSearchResponse(
                    intent=intent, hits=[], total=0, notes=notes,
                )
            notes.append(f"title rule for '{intent.category}' not defined — showing kNN")

    # 4b) Demographics filter — reject titles that contradict gender / audience
    if intent.gender or intent.audience:
        before_demo = len(hits)
        demo_filtered = [
            h for h in hits
            if smart_search.title_matches_demographics(h.title, intent.gender, intent.audience)
        ]
        if demo_filtered:
            hits = demo_filtered
            demo_str = " · ".join(filter(None, [intent.audience, intent.gender]))
            notes.append(f"demographics filter ({demo_str}): {len(demo_filtered)} of {before_demo} kept")
        else:
            demo_str = " · ".join(filter(None, [intent.audience, intent.gender]))
            notes.append(f"demographics filter ({demo_str}) matched 0 — keeping unfiltered set")

    # 5) Color filter (separate from title filter; both may apply)
    if intent.color:
        before_color = len(hits)
        color_filtered = [h for h in hits if (h.color or "").lower() == intent.color]
        if color_filtered:
            hits = color_filtered
            notes.append(f"color filter: {intent.color} ({len(color_filtered)} of {before_color} matched)")
        else:
            # Be specific about which constraint dropped the result count to zero.
            cat_phrase = intent.category or "items"
            price_phrase = ""
            if intent.max_price_kwd is not None:
                price_phrase = f" under {intent.max_price_kwd:g} KWD"
            elif intent.min_price_kwd is not None:
                price_phrase = f" over {intent.min_price_kwd:g} KWD"
            notes.append(
                f"No {intent.color} {cat_phrase}{price_phrase} matched — relaxing color and showing closest {cat_phrase}{price_phrase}."
            )

    # 5b) Modesty filter — drops titles containing mini/crop/strappy/halter
    # when the user signalled modest intent. Belt + braces: if Groq missed
    # the modest field but the raw query contains a modesty keyword, still
    # apply the filter. This survives Groq cold-start timeouts.
    modest_signal = bool(intent.modest) or any(
        w in (req.query or "").lower()
        for w in ("modest", "covered", "long sleeve", "long-sleeve", "محتشم", "محتشمة")
    )
    if modest_signal:
        before_modest = len(hits)
        modest_filtered = [h for h in hits if smart_search.title_matches_modesty(h.title, True)]
        if modest_filtered:
            hits = modest_filtered
            notes.append(f"modesty filter: {len(modest_filtered)} of {before_modest} kept")
        else:
            notes.append("modesty filter matched 0 — keeping unfiltered set")

    # 6) Deal-word sort: ascending by price when the user signals price preference
    if smart_search.is_deal_query(req.query, intent.intent):
        hits = sorted(hits, key=lambda h: h.price_kwd if h.price_kwd is not None else float("inf"))
        notes.append("deal intent: sorted by price ascending")

    return smart_search.SmartSearchResponse(
        intent=intent,
        hits=[h.model_dump() for h in hits[:req.limit]],
        total=len(hits),
        notes=notes,
    )


@app.post("/search/visual", response_model=SearchResponse)
def search_visual(req: VisualSearchRequest):
    try:
        return search.visual_search(req)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))


@app.post("/search/complete_the_look", response_model=CompleteTheLookResponse)
def complete_the_look(req: CompleteTheLookRequest):
    try:
        return search.complete_the_look(req)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))


@app.get("/products/{product_id}", response_model=Product)
def get_product(product_id: str):
    p = search.get_product(product_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"product {product_id} not found")
    return p


@app.get("/brands", response_model=list[Brand])
def list_brands():
    sb = search.sb()
    brands = sb.schema("shop").table("brand").select("id,name,slug").execute().data
    # Count products per brand
    counts: dict[str, int] = {}
    rows = sb.schema("shop").table("product").select("brand_id").execute().data
    for r in rows:
        counts[r["brand_id"]] = counts.get(r["brand_id"], 0) + 1
    return [
        Brand(id=b["id"], name=b["name"], slug=b["slug"], product_count=counts.get(b["id"], 0))
        for b in brands
    ]
