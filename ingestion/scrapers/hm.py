"""H&M Kuwait scraper.

Migrated 2026-05-16 from H&M's global SFCC (www2.hm.com/en_kw — now decommissioned)
to Alshaya's AEM Edge Delivery platform (kw.hm.com). Now shares the
AEMEdgeBrandScraper DOM contract with Foot Locker, Mothercare, and Bath & Body Works.

URL structure is one level deeper than the other three brands:
    /en/shop-{audience}/shop-product/{category}
vs. the others:
    /en/shop-{category}
"""
from __future__ import annotations

import asyncio

from ._base import AEMEdgeBrandScraper

ORIGIN = "https://kw.hm.com"


class HMKuwait(AEMEdgeBrandScraper):
    brand_slug = "hm"
    origin = ORIGIN
    category_urls = {
        "apparel:women":         [f"{ORIGIN}/en/shop-women/shop-product/view-all"],
        "apparel:men":           [f"{ORIGIN}/en/shop-men/shop-product/view-all"],
        "apparel:kids":          [f"{ORIGIN}/en/shop-kids/shop-product/view-all"],
        "home":                  [f"{ORIGIN}/en/shop-home/shop-product/view-all"],
        "beauty":                [f"{ORIGIN}/en/shop-beauty/shop-product/view-all"],
        "apparel:women:dresses": [f"{ORIGIN}/en/shop-women/shop-product/dresses"],
    }


if __name__ == "__main__":
    asyncio.run(HMKuwait().run())
