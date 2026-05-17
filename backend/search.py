"""Phase 4 — query-side search logic.

Patterns:
- TEXT:   embed query via Cohere (input_type='search_query', 1024-dim) → kNN on text_embedding
- VISUAL: embed image via CLIP ViT-B/32 (512-dim) → kNN on image_embedding
- COMPLETE-THE-LOOK: source product's image embedding → bucketed kNN across category families

Backend embedding models MUST match ingestion-side models exactly. If you change one, change the
other — otherwise kNN distances become meaningless. See:
  - ingestion/pipeline/embed_text.py  (Cohere embed-multilingual-v3, input_type='search_document')
  - ingestion/pipeline/embed_images.py (sentence-transformers clip-ViT-B-32)

Every search goes through a Postgres RPC (deployed via migration 0005_search_rpcs) so the
similarity computation stays inside the DB, against the HNSW index, with one round-trip.
"""
from __future__ import annotations

import base64
import io
import os
from typing import Any, Iterable

import cohere
import pillow_avif  # noqa: F401 — registers AVIF decoder with PIL so Image.open() handles .avif
from PIL import Image
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client

from schemas import (
    CompleteTheLookRequest,
    CompleteTheLookResponse,
    Product,
    SearchHit,
    SearchResponse,
    TextSearchRequest,
    VisualSearchRequest,
)

_co: cohere.Client | None = None
_clip: SentenceTransformer | None = None
_sb: Client | None = None


def cohere_client() -> cohere.Client:
    global _co
    if _co is None:
        _co = cohere.Client(os.environ["COHERE_API_KEY"])
    return _co


def clip_model() -> SentenceTransformer:
    global _clip
    if _clip is None:
        _clip = SentenceTransformer("clip-ViT-B-32")
    return _clip


def sb() -> Client:
    global _sb
    if _sb is None:
        _sb = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _sb


# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------

def _embed_text(query: str) -> list[float]:
    """1024-dim Cohere multilingual embedding (query side)."""
    resp = cohere_client().embed(
        texts=[query],
        model="embed-multilingual-v3.0",
        input_type="search_query",  # query-side; ingestion uses 'search_document'
        embedding_types=["float"],
    )
    return resp.embeddings.float[0]


def _embed_image_from_b64(b64: str) -> list[float]:
    """512-dim CLIP embedding. Same model class as ingestion."""
    # Strip data:image/...;base64, prefix if present
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    return clip_model().encode(img).tolist()


# ---------------------------------------------------------------------------
# RPC -> SearchHit mapping
# ---------------------------------------------------------------------------

_HIT_FIELDS = {
    "id", "brand_slug", "brand_name", "external_id", "title", "title_ar", "description",
    "price_kwd", "currency", "category", "subcategory", "color", "image_url", "product_url",
    "in_stock", "similarity",
}


def _rows_to_hits(rows: Iterable[dict[str, Any]]) -> list[SearchHit]:
    hits: list[SearchHit] = []
    for i, r in enumerate(rows):
        # Drop unknown keys (e.g. RPC may emit 'bucket'); coerce price to float for pydantic.
        cleaned = {k: v for k, v in r.items() if k in _HIT_FIELDS}
        if cleaned.get("price_kwd") is not None:
            cleaned["price_kwd"] = float(cleaned["price_kwd"])
        hits.append(SearchHit(**cleaned, rank=i + 1))
    return hits


# ---------------------------------------------------------------------------
# Public search entrypoints (called by main.py)
# ---------------------------------------------------------------------------

def text_search(req: TextSearchRequest) -> SearchResponse:
    query_emb = _embed_text(req.query)
    resp = sb().schema("shop").rpc(
        "text_search",
        {
            "query_emb":       query_emb,
            "result_limit":    req.limit,
            "brand_slugs":     req.brand_filter,
            "max_price":       req.max_price_kwd,
            "category_prefix": req.category_filter,
        },
    ).execute()
    hits = _rows_to_hits(resp.data or [])
    return SearchResponse(hits=hits, total=len(hits))


def visual_search(req: VisualSearchRequest) -> SearchResponse:
    if req.product_id:
        resp = sb().schema("shop").rpc(
            "visual_search_by_product",
            {
                "source_id":          req.product_id,
                "result_limit":       req.limit,
                "exclude_same_brand": req.exclude_same_brand,
            },
        ).execute()
    elif req.image_base64:
        query_emb = _embed_image_from_b64(req.image_base64)
        resp = sb().schema("shop").rpc(
            "visual_search_by_vector",
            {
                "query_emb":     query_emb,
                "result_limit":  req.limit,
                "exclude_brand": None,
            },
        ).execute()
    else:
        raise ValueError("Provide product_id or image_base64")

    hits = _rows_to_hits(resp.data or [])
    return SearchResponse(hits=hits, total=len(hits))


def complete_the_look(req: CompleteTheLookRequest) -> CompleteTheLookResponse:
    # First, fetch the source product so the response can render the anchor.
    source = get_product(req.product_id)
    if source is None:
        raise ValueError(f"product {req.product_id} not found")

    resp = sb().schema("shop").rpc(
        "complete_the_look",
        {
            "source_id":         req.product_id,
            "per_bucket_limit":  req.limit_per_category,
        },
    ).execute()

    buckets: dict[str, list[dict[str, Any]]] = {
        "apparel": [], "beauty": [], "footwear": [], "family": [],
    }
    # Foot Locker carries some athleisure apparel (skirts, sweatpants, jerseys)
    # that the upstream RPC tags into the "footwear" bucket because of brand
    # affiliation. Demote any item whose title doesn't read as actual footwear
    # to the "apparel" bucket so the demo Footwear section stays honest.
    _shoe_keywords = (
        "shoe", "sneaker", "boot", "sandal", "loafer", "trainer",
        "slipper", "force", "jordan", "nike", "air max", "vomero",
        "dunk", "kobe", "adidas", "puma",
    )
    for r in resp.data or []:
        b = r.get("bucket")
        if b == "footwear":
            title = (r.get("title") or "").lower()
            if not any(kw in title for kw in _shoe_keywords):
                b = "apparel"
        if b in buckets:
            buckets[b].append(r)

    return CompleteTheLookResponse(
        source=source,
        apparel=_rows_to_hits(buckets["apparel"]),
        beauty=_rows_to_hits(buckets["beauty"]),
        footwear=_rows_to_hits(buckets["footwear"]),
        family=_rows_to_hits(buckets["family"]),
    )


def get_product(product_id: str) -> Product | None:
    resp = sb().schema("shop").rpc("get_product", {"p_id": product_id}).execute()
    rows = resp.data or []
    if not rows:
        return None
    r = rows[0]
    if r.get("price_kwd") is not None:
        r["price_kwd"] = float(r["price_kwd"])
    return Product(**{k: v for k, v in r.items() if k in Product.model_fields})
