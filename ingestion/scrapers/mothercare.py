"""Mothercare Kuwait scraper.

Alshaya-operated, AEM Edge Delivery platform. Shares the AEMEdgeBrandScraper
DOM contract with Foot Locker and Bath & Body Works.
"""
from __future__ import annotations

import asyncio

from ._base import AEMEdgeBrandScraper

ORIGIN = "https://www.mothercare.com.kw"


class MothercareKuwait(AEMEdgeBrandScraper):
    brand_slug = "mothercare"
    origin = ORIGIN
    category_urls = {
        "baby:newborn_clothing": [f"{ORIGIN}/en/shop-newborn-clothing"],
        "kids:boys_clothing":    [f"{ORIGIN}/en/shop-boys-clothing"],
        "kids:girls_clothing":   [f"{ORIGIN}/en/shop-girls-clothing"],
        "baby:feeding":          [f"{ORIGIN}/en/shop-feeding"],
        "kids:toys":             [f"{ORIGIN}/en/shop-toys"],
    }


if __name__ == "__main__":
    asyncio.run(MothercareKuwait().run())
