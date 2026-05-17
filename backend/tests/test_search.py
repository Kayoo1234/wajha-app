"""Phase 4 gate tests — the 4 hardcoded acceptance tests from the plan.

All 4 must pass before Phase 4 is considered done. Run from repo root:
    cd backend && .venv/Scripts/python -m pytest tests/test_search.py -v

Each test is marked `xfail` until backend implementations land. Flip the
xfail mark once the corresponding code in search.py is wired.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


@pytest.mark.xfail(reason="Phase 4: pending text_search RPC wiring")
def test_english_text_search():
    """'black t-shirt' returns >=5 results all with dark color attribute."""
    r = client.post("/search/text", json={"query": "black t-shirt", "lang": "en", "limit": 20})
    assert r.status_code == 200
    hits = r.json()["hits"]
    assert len(hits) >= 5
    dark = {"black", "navy", "charcoal", "dark", "graphite"}
    assert all((h.get("color") or "").lower() in dark for h in hits), \
        "Anti-gaming: actually verify colors, not just count"


@pytest.mark.xfail(reason="Phase 4: pending visual_search RPC wiring")
def test_visual_search_cross_brand():
    """Visual search on an H&M dress returns >=3 dresses from other brands in top 10."""
    # TODO Phase 4: seed a known-good H&M dress product_id in test fixtures.
    product_id = "REPLACE_WITH_KNOWN_HM_DRESS_ID"
    r = client.post("/search/visual", json={"product_id": product_id, "limit": 10})
    assert r.status_code == 200
    hits = r.json()["hits"]
    other_brand_dresses = [h for h in hits if h["brand_slug"] != "hm" and h.get("subcategory") == "dress"]
    assert len(other_brand_dresses) >= 3


@pytest.mark.xfail(reason="Phase 4: pending complete_the_look RPC wiring")
def test_complete_the_look():
    """Returns >=2 home items AND >=2 beauty items for an H&M apparel source."""
    product_id = "REPLACE_WITH_KNOWN_HM_APPAREL_ID"
    r = client.post("/search/complete_the_look", json={"product_id": product_id, "limit_per_category": 4})
    assert r.status_code == 200
    body = r.json()
    assert len(body["home"]) >= 2
    assert len(body["beauty"]) >= 2


@pytest.mark.xfail(reason="Phase 4: pending Arabic text_search wiring")
def test_arabic_search():
    """'فستان' returns dresses."""
    r = client.post("/search/text", json={"query": "فستان", "lang": "ar", "limit": 10})
    assert r.status_code == 200
    hits = r.json()["hits"]
    assert len(hits) >= 3
    assert any("dress" in (h.get("subcategory") or "").lower() for h in hits)


def test_health():
    """Smoke — health endpoint always works."""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
