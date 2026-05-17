"""Shared scraper base — rate limiting, UA rotation, retry, JSONL output.

Per the plan §Phase 2:
- 1 request per 2 seconds, ±500ms jitter
- UA rotation across 3 modern Chrome/Safari UAs
- Exponential backoff on 429 / Cloudflare interstitial
- Write JSONL to ingestion/output/{brand_slug}_products.jsonl
- Public catalog data only — no login bypass

Two scraper bases live here:

  BrandScraper            — abstract; per-brand DOM, subclass implements _scrape_listing
  AEMEdgeBrandScraper     — shared for Alshaya AEM Edge brands (Foot Locker, Mothercare, BBW).
                            Same DOM template across all three; subclasses only define
                            brand_slug + category_urls + origin.
"""
from __future__ import annotations

import asyncio
import json
import os
import random
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import AsyncIterator
from urllib.parse import urlparse

from playwright.async_api import async_playwright, Browser, Page, Playwright, TimeoutError as PlaywrightTimeoutError
from tenacity import retry, stop_after_attempt, wait_exponential

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]

RATE_LIMIT_SEC = float(os.getenv("SCRAPER_RATE_LIMIT_SEC", "2"))
JITTER_MS = int(os.getenv("SCRAPER_JITTER_MS", "500"))


@dataclass
class Product:
    brand_slug: str
    external_id: str
    title: str
    title_ar: str | None
    description: str | None
    price_kwd: float | None
    category: str | None
    subcategory: str | None
    color: str | None
    image_url: str
    product_url: str
    in_stock: bool = True


async def jitter_sleep() -> None:
    delay = RATE_LIMIT_SEC + random.uniform(-JITTER_MS / 1000, JITTER_MS / 1000)
    await asyncio.sleep(max(0.5, delay))


class BrandScraper:
    """Subclass per brand. Override `brand_slug`, `category_urls`, `parse_product`."""

    brand_slug: str = ""
    category_urls: dict[str, list[str]] = {}      # category -> list of listing-page URLs
    target_per_brand: int = int(os.getenv("SCRAPER_TARGET_PER_BRAND", "200"))

    async def run(self) -> None:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            products: list[Product] = []
            for category, urls in self.category_urls.items():
                for url in urls:
                    async for p in self._scrape_listing(browser, url, category):
                        products.append(p)
                        if len(products) >= self.target_per_brand:
                            break
                    if len(products) >= self.target_per_brand:
                        break
            await browser.close()

        self._write_jsonl(products)
        self._summary(products)
        self._guardrail(products)

    async def _scrape_listing(
        self, browser: Browser, listing_url: str, category: str
    ) -> AsyncIterator[Product]:
        """Override in subclasses. Yields Product per item on a listing page."""
        raise NotImplementedError
        # noqa: lint placeholder for async generator
        yield  # type: ignore[unreachable]

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _open_page(self, browser: Browser, url: str) -> Page:
        ctx = await browser.new_context(user_agent=random.choice(USER_AGENTS))
        page = await ctx.new_page()
        resp = await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        if resp and resp.status in (429, 503):
            raise RuntimeError(f"Rate-limited or blocked: {resp.status} on {url}")
        await jitter_sleep()
        return page

    def _write_jsonl(self, products: list[Product]) -> None:
        path = OUTPUT_DIR / f"{self.brand_slug}_products.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for p in products:
                f.write(json.dumps(asdict(p), ensure_ascii=False) + "\n")
        print(f"[{self.brand_slug}] wrote {len(products)} products -> {path}")

    def _summary(self, products: list[Product]) -> None:
        by_cat: dict[str, int] = {}
        for p in products:
            by_cat[p.category or "unknown"] = by_cat.get(p.category or "unknown", 0) + 1
        print(f"[{self.brand_slug}] breakdown: {by_cat}")

    def _guardrail(self, products: list[Product]) -> None:
        """Plan-mandated guardrails (Phase 2)."""
        if len(products) < 150:
            raise SystemExit(
                f"[{self.brand_slug}] FAIL: only {len(products)} products scraped (min 150)."
            )
        blank_images = sum(1 for p in products if not p.image_url)
        if blank_images / max(1, len(products)) > 0.05:
            raise SystemExit(
                f"[{self.brand_slug}] FAIL: {blank_images} products with blank image_url (>5%)."
            )


# ---------------------------------------------------------------------------
# Shared base for Alshaya AEM Edge Delivery brands.
#
# Foot Locker, Mothercare, and Bath & Body Works (Kuwait) all run on the same
# Alshaya AEM Edge platform with an identical product-card DOM template:
#
#   div.product-item.card
#     [data-id="LF314201296108"]                  -> external_id
#     .item-images img
#         [alt="Asics GEL-KAYANO 14 - Unisex Shoes"]  -> title  (universal across brands)
#         [src="https://media.alshaya.com/adobe/..."] -> image_url
#     a[data-link="pdp"][href="/en/buy-..."]          -> product_url (relative)
#     [class*="price"]  innerText "KWD 52.000"        -> price_kwd (3 decimals)
#
# Subclasses only need to set:
#   - brand_slug   ('footlocker', 'mothercare', 'bath_body_works')
#   - origin       ('https://www.footlocker.com.kw' etc.)
#   - category_urls  { 'footwear:men': ['https://.../en/shop-mens'], ... }
# ---------------------------------------------------------------------------


def _parse_kwd_3dp(text: str | None) -> float | None:
    """Alshaya AEM Edge brands print 'KWD x.xxx' — strip and take the first numeric token.
    Handles strike-through original prices in the same element by picking the first parseable value.
    """
    if not text:
        return None
    cleaned = text.replace("KWD", "").replace("\xa0", " ").strip()
    for token in cleaned.split():
        try:
            return float(token)
        except ValueError:
            continue
    return None


class AEMEdgeBrandScraper(BrandScraper):
    origin: str = ""

    @property
    def _origin(self) -> str:
        if self.origin:
            return self.origin
        for urls in self.category_urls.values():
            if urls:
                u = urlparse(urls[0])
                return f"{u.scheme}://{u.netloc}"
        return ""

    async def _scrape_listing(
        self, browser: Browser, listing_url: str, category: str
    ) -> AsyncIterator[Product]:
        page = await self._open_page(browser, listing_url)
        # Detect 404 redirect: Alshaya AEM Edge serves /en/404 with a "recommended
        # products" widget that still renders div.product-item.card. Without this
        # check, a wrong category slug would silently contaminate the catalog with
        # ~20 generic recommendations per failed URL.
        landed = page.url.rstrip("/")
        if landed.endswith("/404") or "/en/404" in landed:
            print(f"[{self.brand_slug}] {listing_url} -> 404 ({landed}); skipping")
            await page.context.close()
            return
        try:
            await page.wait_for_selector("div.product-item.card", timeout=25_000)
        except PlaywrightTimeoutError:
            print(f"[{self.brand_slug}] no cards on {listing_url} — skipping")
            await page.context.close()
            return

        # AEM Edge lazy-renders some cards on scroll; nudge to populate.
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
        await asyncio.sleep(1.5)
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(1.5)

        origin = self._origin
        cards = await page.query_selector_all("div.product-item.card")
        for card in cards:
            external_id = (await card.get_attribute("data-id")) or ""

            # Skip carousel-wraparound clones — the brand's intended "first" image
            # is the first non-clone in DOM order. Without this filter, we'd grab
            # whatever variant the carousel happened to be showing at scrape time
            # (e.g., BBW's `_6.jpg` Arabic marketing card instead of `_1.jpg` packshot).
            img_el = await card.query_selector(".item-images img:not(.clone)")
            if img_el is None:
                img_el = await card.query_selector(".item-images img")  # belt-and-suspenders
            title = (await img_el.get_attribute("alt")) if img_el else None
            image_url = (await img_el.get_attribute("src")) if img_el else ""

            url_el = await card.query_selector('a[data-link="pdp"]')
            href = (await url_el.get_attribute("href")) if url_el else None
            product_url = f"{origin}{href}" if href and href.startswith("/") else (href or "")

            price_el = await card.query_selector('[class*="price"]')
            price_text = (await price_el.inner_text()) if price_el else None
            price_kwd = _parse_kwd_3dp(price_text)

            if not external_id or not title or not product_url:
                continue

            yield Product(
                brand_slug=self.brand_slug,
                external_id=external_id,
                title=title.strip(),
                title_ar=None,
                description=None,
                price_kwd=price_kwd,
                category=category,
                subcategory=None,
                color=None,
                image_url=image_url,
                product_url=product_url,
            )

        await page.context.close()
