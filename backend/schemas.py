"""Pydantic schemas for the Wajha search backend."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class TextSearchRequest(BaseModel):
    query: str
    lang: Literal["en", "ar"] = "en"
    limit: int = 20
    brand_filter: list[str] | None = None
    max_price_kwd: float | None = None
    category_filter: str | None = None


class VisualSearchRequest(BaseModel):
    product_id: str | None = None
    image_base64: str | None = None
    limit: int = 20
    exclude_same_brand: bool = False


class CompleteTheLookRequest(BaseModel):
    product_id: str
    limit_per_category: int = 4


class Product(BaseModel):
    id: str
    brand_slug: str
    brand_name: str
    external_id: str
    title: str
    title_ar: str | None = None
    description: str | None = None
    price_kwd: float | None = None
    currency: str = "KWD"
    category: str | None = None
    subcategory: str | None = None
    color: str | None = None
    image_url: str
    product_url: str
    in_stock: bool = True


class SearchHit(Product):
    similarity: float = Field(..., description="Cosine similarity, 0-1")
    rank: int


class SearchResponse(BaseModel):
    hits: list[SearchHit]
    total: int


class CompleteTheLookResponse(BaseModel):
    source: Product
    # Cross-brand buckets — one per non-source brand. Source brand is excluded
    # so complete-the-look is always genuinely cross-brand.
    apparel:  list[SearchHit] = []   # H&M (when source is not H&M)
    beauty:   list[SearchHit] = []   # Bath & Body Works
    footwear: list[SearchHit] = []   # Foot Locker
    family:   list[SearchHit] = []   # Mothercare


class Brand(BaseModel):
    id: str
    name: str
    slug: str
    product_count: int
