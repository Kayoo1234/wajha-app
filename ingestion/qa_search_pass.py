"""QA harness — runs the 31-scenario search-quality pass against the live API.

Output: writes qa_results.json next to itself + prints a compact summary
to stdout. Reads-only against production; does not write to Supabase.

Usage:
    PYTHONIOENCODING=utf-8 .venv/Scripts/python -u qa_search_pass.py
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Match the production deploy. Backend lives at api.wajha-mena.com via Fly.io.
API_BASE = "https://api.wajha-mena.com"
SMART = f"{API_BASE}/search/smart"
TEXT = f"{API_BASE}/search/text"

# Each test = (id, query, lang, expectation_text, mode)
# mode = "smart" (intent-parsed) or "text" (raw kNN, used to probe edge cases)
TESTS: list[tuple[str, str, str, str, str]] = [
    # COLOR
    ("1",  "black t-shirt",              "en", "all top 10 must be black",                "smart"),
    ("2",  "white shirt",                "en", "all top 10 must be white",                "smart"),
    ("3",  "red dress",                  "en", "all top 10 must be red, not pink",         "smart"),
    ("4",  "navy blue jeans",            "en", "navy distinguished from black/royal",      "smart"),
    # CATEGORY
    ("5",  "shoes",                      "en", "shoes, not socks/accessories",            "smart"),
    ("6",  "watch",                      "en", "watches, not straps/boxes",               "smart"),
    ("7",  "bag",                        "en", "bags, not charms/wallets",                "smart"),
    ("8",  "perfume",                    "en", "perfume, not body mist/lotion/candle",    "smart"),
    # PRICE
    ("9",  "t-shirt under 5 KWD",        "en", "every result < 5 KWD",                    "smart"),
    ("10", "dress between 10 and 30 KWD","en", "every result 10-30 KWD",                  "smart"),
    ("11", "cheapest white shirt",       "en", "top result = lowest priced white shirt",  "smart"),
    # COMBINED
    ("12", "black t-shirt under 5 KWD",  "en", "color AND price match",                   "smart"),
    ("13", "summer dress for women under 20 KWD", "en", "gender+season+cat+price",        "smart"),
    ("14", "modest black dress",         "en", "modesty intent respected",                "smart"),
    # ARABIC
    ("15", "فستان أسود",                "ar", "black dress, same quality as EN",          "smart"),
    ("16", "تيشيرت أبيض رخيص",          "ar", "color+price intent",                       "smart"),
    ("17", "حذاء رياضي",                 "ar", "sports shoe",                              "smart"),
    # CROSS-BRAND
    ("18", "white t-shirt",              "en", "multiple brands",                          "smart"),
    ("19", "Pottery Barn pillow",        "en", "OUT OF SCOPE — Pottery Barn not in catalog","smart"),
    ("20", "FIND_SIMILAR_FEATURE",       "en", "feature check — see /complete-the-look",  "skip"),
    # EDGE
    ("21", "",                           "en", "empty query — graceful empty",            "smart"),
    ("22", "asdfgh",                     "en", "gibberish — graceful empty",              "smart"),
    ("23", "tshrit",                     "en", "misspelled — fuzzy should match t-shirt", "smart"),
    ("24", "i am looking for something nice to wear to a formal evening event in summer that is comfortable and stylish and not too expensive", "en", "long query — no crash", "smart"),
    ("25", "a",                          "en", "single char — not entire catalog",        "smart"),
    # VISUAL — skipped programmatically (require image upload, manual test)
    ("26", "VISUAL_BLACK_DRESS",         "en", "MANUAL — image upload required",          "skip"),
    ("27", "VISUAL_BEIGE_PILLOW",        "en", "MANUAL — image upload + Pottery Barn N/A","skip"),
    ("28", "VISUAL_CROSS_BRAND",         "en", "MANUAL — image upload required",          "skip"),
    # INTENT
    ("29", "something for a wedding",    "en", "formal attire not casual",                 "smart"),
    ("30", "gift for my wife",           "en", "women's items, not generic",               "smart"),
    ("31", "matching set",                "en", "coordinated items, not singles",          "smart"),
]


def call_smart(query: str, lang: str, limit: int = 10) -> dict:
    body = {"query": query, "lang": lang, "limit": limit}
    req = urllib.request.Request(
        SMART,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"_error": f"HTTP {e.code}", "_body": e.read().decode("utf-8", errors="replace")[:500]}
    except Exception as e:
        return {"_error": f"{type(e).__name__}: {e}"}


def main() -> None:
    out: list[dict] = []
    for tid, query, lang, expectation, mode in TESTS:
        if mode == "skip":
            out.append({"id": tid, "query": query, "lang": lang, "skipped": True, "expectation": expectation})
            print(f"[Q{tid}]  SKIP: {expectation}")
            continue

        # Empty query — call but don't expect results
        t0 = time.time()
        resp = call_smart(query, lang)
        dt_ms = int((time.time() - t0) * 1000)

        if "_error" in resp:
            out.append({
                "id": tid, "query": query, "lang": lang, "ms": dt_ms,
                "error": resp["_error"], "body": resp.get("_body", ""),
                "expectation": expectation,
            })
            print(f"[Q{tid}]  ERROR ({dt_ms}ms) — {resp['_error']}")
            continue

        hits = resp.get("hits") or []
        intent = resp.get("intent") or {}
        notes = resp.get("notes") or []
        top3 = [
            {
                "title": h.get("title"),
                "color": h.get("color"),
                "price_kwd": h.get("price_kwd"),
                "brand_slug": h.get("brand_slug"),
            }
            for h in hits[:3]
        ]
        all10 = [
            {"title": h.get("title"), "color": h.get("color"), "price_kwd": h.get("price_kwd"), "brand_slug": h.get("brand_slug")}
            for h in hits[:10]
        ]
        out.append({
            "id": tid, "query": query, "lang": lang, "ms": dt_ms,
            "expectation": expectation,
            "intent": intent,
            "notes": notes,
            "n_hits": len(hits),
            "top3": top3,
            "top10": all10,
        })
        i_summary = []
        for k in ("category", "color", "brand", "gender", "audience", "max_price_kwd", "min_price_kwd"):
            v = intent.get(k)
            if v is not None and v != "":
                i_summary.append(f"{k}={v}")
        print(
            f"[Q{tid}]  {dt_ms:>5}ms  hits={len(hits):>2}  "
            f"intent={{{', '.join(i_summary)}}}  "
            f"top1='{(top3[0]['title'] if top3 else '-')[:60]}'"
        )

    out_path = Path(__file__).parent / "qa_results.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[DONE] Results written to {out_path}")
    print(f"  total tests: {len(TESTS)}")
    print(f"  skipped:     {sum(1 for r in out if r.get('skipped'))}")
    print(f"  errors:      {sum(1 for r in out if r.get('error'))}")


if __name__ == "__main__":
    main()
