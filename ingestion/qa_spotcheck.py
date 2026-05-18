"""5-query spotcheck — verifies the highest-value QA fixes are live.

Runs slowly enough not to trip Groq rate limits (10s between calls).
"""
import json, time, urllib.request

API = "https://api.wajha-mena.com/search/smart"

CHECKS = [
    ("Q5 shoes", "shoes", "en", "should return only shoes; no hoodies/jerseys"),
    ("Q14 modest", "modest black dress", "en", "no mini/strappy/halterneck in top 10"),
    ("Q17 ar-shoe", "حذاء رياضي", "ar", "first hit should be an actual shoe"),
    ("Q29 wedding", "something for a wedding", "en", "no Mothercare baby items"),
    ("Q22 gibberish", "asdfgh", "en", "must return 0 hits + suggestion note"),
]

for name, q, lang, expectation in CHECKS:
    t0 = time.time()
    body = json.dumps({"query": q, "lang": lang, "limit": 10}).encode("utf-8")
    req = urllib.request.Request(API, data=body, headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    dt = int((time.time()-t0)*1000)
    intent = data.get("intent", {})
    hits = data.get("hits", [])
    notes = data.get("notes", [])
    isig = ", ".join(f"{k}={v}" for k,v in intent.items() if v not in (None, "", "specific_search") and k != "query_cleaned")
    print(f"\n=== {name}  ({dt}ms)  expects: {expectation} ===")
    print(f"  intent: {{{isig}}}")
    print(f"  notes:  {notes}")
    print(f"  hits ({len(hits)}):")
    for h in hits[:5]:
        print(f"    - {h.get('brand_slug')}: {h.get('title')}  color={h.get('color')} price={h.get('price_kwd')}")
    time.sleep(10)  # generous spacing to avoid Groq rate limit
