"""Bath & Body Works Kuwait scraper.

Alshaya-operated, AEM Edge Delivery platform. Shares the AEMEdgeBrandScraper
DOM contract with Foot Locker and Mothercare.
"""
from __future__ import annotations

import asyncio

from ._base import AEMEdgeBrandScraper

ORIGIN = "https://www.bathandbodyworks.com.kw"


class BathBodyWorksKuwait(AEMEdgeBrandScraper):
    brand_slug = "bath_body_works"
    origin = ORIGIN
    # Top-level category slugs verified live from BBW Kuwait nav (2026-05-16).
    category_urls = {
        "beauty:new":        [f"{ORIGIN}/en/shop-new"],
        "beauty:top_offers": [f"{ORIGIN}/en/shop-top-offers"],
        "beauty:body_care":  [f"{ORIGIN}/en/shop-body-care"],
        "beauty:candles":    [f"{ORIGIN}/en/shop-candles"],
        "beauty:hand_soaps": [f"{ORIGIN}/en/shop-hand-soaps-sanitizers"],
        "beauty:fresheners": [f"{ORIGIN}/en/shop-fresheners"],
        "beauty:mens":       [f"{ORIGIN}/en/shop-mens-shop"],
        "beauty:gifts":      [f"{ORIGIN}/en/shop-gifts"],
    }


if __name__ == "__main__":
    asyncio.run(BathBodyWorksKuwait().run())
