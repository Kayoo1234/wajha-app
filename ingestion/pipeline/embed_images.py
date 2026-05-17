"""Phase 3 — image embeddings via OpenCLIP ViT-B/32.

Reads all JSONL files in ingestion/output/, downloads each product image into
ingestion/cache/images/{brand_slug}/{external_id}.jpg, and computes a 512-dim
embedding per image. Writes results to ingestion/output/{brand_slug}_image_embeddings.jsonl.

Model: sentence-transformers wrapper around OpenCLIP ViT-B/32.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
from PIL import Image
from sentence_transformers import SentenceTransformer

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"
CACHE_DIR = Path(__file__).resolve().parents[1] / "cache" / "images"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

_MODEL: SentenceTransformer | None = None


def model() -> SentenceTransformer:
    """Lazy-load CLIP. Same model is used at backend query time — DO NOT change one without the other."""
    global _MODEL
    if _MODEL is None:
        _MODEL = SentenceTransformer("clip-ViT-B-32")
    return _MODEL


async def download_image(client: httpx.AsyncClient, url: str, dest: Path) -> bool:
    if dest.exists():
        return True
    for attempt in range(3):
        try:
            r = await client.get(url, timeout=10.0, follow_redirects=True)
            r.raise_for_status()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(r.content)
            return True
        except Exception:
            if attempt == 2:
                return False
            await asyncio.sleep(1 + attempt)
    return False


async def run() -> None:
    m = model()
    async with httpx.AsyncClient(http2=True) as client:
        for jsonl in OUTPUT_DIR.glob("*_products.jsonl"):
            brand_slug = jsonl.stem.replace("_products", "")
            out_path = OUTPUT_DIR / f"{brand_slug}_image_embeddings.jsonl"
            with jsonl.open(encoding="utf-8") as fin, out_path.open("w", encoding="utf-8") as fout:
                count = 0
                for line in fin:
                    rec = json.loads(line)
                    cache_path = CACHE_DIR / brand_slug / f"{rec['external_id']}.jpg"
                    ok = await download_image(client, rec["image_url"], cache_path)
                    if not ok:
                        print(f"SKIP {brand_slug}/{rec['external_id']} — image download failed")
                        continue
                    try:
                        img = Image.open(cache_path).convert("RGB")
                        emb = m.encode(img).tolist()  # 512-dim
                    except Exception as e:
                        print(f"SKIP {brand_slug}/{rec['external_id']} — encode failed: {e}")
                        continue
                    fout.write(json.dumps({
                        "brand_slug": brand_slug,
                        "external_id": rec["external_id"],
                        "image_embedding": emb,
                    }) + "\n")
                    count += 1
                print(f"[{brand_slug}] embedded {count} images -> {out_path}")


if __name__ == "__main__":
    asyncio.run(run())
