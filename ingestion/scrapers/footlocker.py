"""Foot Locker Kuwait scraper.

Alshaya-operated, AEM Edge Delivery platform. Shares the AEMEdgeBrandScraper
DOM contract with Mothercare and Bath & Body Works.
"""
from __future__ import annotations

import asyncio

from ._base import AEMEdgeBrandScraper

ORIGIN = "https://www.footlocker.com.kw"


class FootLockerKuwait(AEMEdgeBrandScraper):
    brand_slug = "footlocker"
    origin = ORIGIN
    category_urls = {
        "footwear:men":         [f"{ORIGIN}/en/shop-mens"],
        "footwear:women":       [f"{ORIGIN}/en/shop-womens"],
        "footwear:kids":        [f"{ORIGIN}/en/shop-kids"],
        "footwear:new":         [f"{ORIGIN}/en/shop-new-arrivals"],
        "footwear:men:shoes":   [f"{ORIGIN}/en/shop-mens/shoes"],
    }


if __name__ == "__main__":
    asyncio.run(FootLockerKuwait().run())
