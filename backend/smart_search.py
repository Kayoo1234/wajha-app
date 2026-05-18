"""Smart Search layer — LLM-assisted retrieval (the Wellboard pattern).

Flow per query:
  1. Groq parses raw user query into structured filters (color, category, price,
     brand, intent).
  2. Backend hands the structured filters to the existing text_search RPC for
     SQL filtering + Cohere kNN within the filtered set.
  3. Response includes the parsed intent so the frontend can render filter chips
     ("Color: black", "Max: 8 KWD") for transparency.

Gemini-based visual rerank is wired but only invoked on demand (slow path — adds
~1-2s per request because it downloads N product images for the model to look at).
"""
from __future__ import annotations

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Literal

from groq import Groq
from pydantic import BaseModel, Field

# Lazy clients so module import doesn't fail if a key is missing.
_groq: Groq | None = None


def groq_client() -> Groq:
    global _groq
    if _groq is None:
        _groq = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _groq


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class Intent(BaseModel):
    """Structured filters extracted from a free-form shopping query."""
    query_cleaned: str = Field(..., description="Semantic core, English, ≤6 words")
    category: str | None = None
    color: str | None = None
    brand: str | None = None
    gender: Literal["men", "women", "unisex"] | None = None
    audience: Literal["adult", "kids", "baby"] | None = None
    max_price_kwd: float | None = None
    min_price_kwd: float | None = None
    intent: Literal[
        "specific_search", "browse", "discounted", "visual_similarity"
    ] = "specific_search"
    # Modesty signal — set when the user asks for "modest" / "covered" / "long
    # sleeve" / "maxi" / Arabic "محتشم". When true, the endpoint drops titles
    # containing mini/crop/strappy/halterneck/bandeau/etc.
    modest: bool | None = None


class SmartSearchRequest(BaseModel):
    query: str
    lang: Literal["en", "ar"] = "en"
    limit: int = 18
    anchor_product_id: str | None = None  # for discounted intent: source product


class SmartSearchResponse(BaseModel):
    intent: Intent
    hits: list[dict]
    total: int
    notes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Groq prompt — kept short and explicit so Llama 3.3 stays on the JSON schema
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You parse natural-language shopping queries (English or Arabic) into structured filters for a Kuwait shopping app named Wajha.

Available brands (use the slug): hm (H&M Kuwait), footlocker (Foot Locker), mothercare (Mothercare), bath_body_works (Bath & Body Works).
Available colors (lowercase, base name only): black, white, grey, navy, blue, red, green, pink, brown, beige, cream, ivory, yellow, orange, purple, khaki, olive, silver, gold, charcoal, burgundy, maroon, peach, mint, lavender, tan, rose, teal, coral.
Currency: KWD.

Return ONLY compact JSON with these keys (use null when unknown):
{
  "query_cleaned": "<semantic core in English, max 6 words>",
  "category": "<short item type, lowercase, e.g. t-shirt, dress, candle, sneaker, body lotion>",
  "color": "<one base color from list above, lowercase, or null>",
  "brand": "<one of hm|footlocker|mothercare|bath_body_works, or null>",
  "gender": "<men|women|unisex, or null>",
  "audience": "<adult|kids|baby, or null>",
  "max_price_kwd": <number or null>,
  "min_price_kwd": <number or null>,
  "intent": "<specific_search|browse|discounted|visual_similarity>",
  "modest": <true | null>
}

Rules:
- Normalize Arabic to English in query_cleaned (e.g. "فستان أبيض" -> "white dress").
- "under 8 KWD" -> max_price_kwd=8. "between 5 and 10" -> min=5, max=10.
- Phrases like "love this but cheaper", "outside my budget", "show me alternatives at a discount" -> intent=discounted.
- Pure "find similar to this" or "what looks like this" -> intent=visual_similarity.
- Generic browse like "show me shoes" -> intent=browse.
- Anything specific like "black t-shirt under 8 KWD" -> intent=specific_search.

GENDER / AUDIENCE EXTRACTION (important — controls the catalog subset):
- "for man", "men's", "male", "guys", Arabic "رجالي", "للرجال", "للرجل" -> gender=men, audience=adult.
- "for woman", "women's", "female", "ladies", "her", Arabic "نسائي", "للمرأة", "للنساء" -> gender=women, audience=adult.
- "kids", "child", "children", Arabic "أطفال", "للأطفال" -> audience=kids; if "boy/boys" -> gender=men, if "girl/girls" -> gender=women.
- "baby", "newborn", "infant", "toddler", Arabic "رضيع", "حديث الولادة" -> audience=baby.
- Strong category signals: "dress" alone -> gender=women audience=adult (women's catalog); "blouse"/"skirt" -> gender=women adult; "polo"/"jersey" without modifier -> gender unset.
- If user does not specify and there's no strong category signal, leave both fields null. Do NOT guess.

OCCASION → AUDIENCE inference (gift-giving and event language signals an adult shopper):
- "wedding", "anniversary", "engagement", "graduation", "date night", "formal event", "evening event" -> audience=adult.
- "birthday party" alone is ambiguous — do NOT infer audience from "birthday" alone.

RELATIONAL → GENDER / AUDIENCE inference (the recipient drives the catalog):
- "my wife", "for my wife", "for her", "anniversary gift for her", "gift for mom", "for my girlfriend", "my mother" -> gender=women, audience=adult.
- "my husband", "for my husband", "for him", "for my boyfriend", "gift for dad", "my father" -> gender=men, audience=adult.
- "my daughter", "for my niece" -> audience=kids, gender=women.
- "my son", "for my nephew" -> audience=kids, gender=men.
- "my baby", "for the baby", "new-mom gift", "baby shower" -> audience=baby.

MODESTY signal (set the optional "modest" field to true when present, else omit/null):
- "modest", "covered", "long sleeve", "long-sleeve", "longer hem", "maxi" (dress/skirt), "abaya-style", Arabic "محتشم", "محتشمة" -> set "modest": true.

Be conservative — only fill a field if you're confident."""


def extract_intent(raw_query: str) -> Intent:
    """Single Groq call. ~250-500ms warm. Returns Intent or raises on parse failure."""
    resp = groq_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": raw_query},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content
    data = json.loads(content)
    # Defensive: normalize strings to expected case/whitespace
    for k in ("color", "brand", "gender", "audience"):
        if data.get(k):
            data[k] = str(data[k]).strip().lower()
    if data.get("query_cleaned"):
        data["query_cleaned"] = str(data["query_cleaned"]).strip()
    # Coerce out-of-vocab gender/audience to None (validators would reject otherwise)
    if data.get("gender") not in (None, "men", "women", "unisex"):
        data["gender"] = None
    if data.get("audience") not in (None, "adult", "kids", "baby"):
        data["audience"] = None
    # Modest must be bool or None — coerce stray strings
    if data.get("modest") in ("false", "False", False, 0, ""):
        data["modest"] = None
    elif data.get("modest") in ("true", "True", True, 1):
        data["modest"] = True
    else:
        data["modest"] = None
    return Intent(**data)


# ---------------------------------------------------------------------------
# Cache (1-hour TTL) + hard-timeout wrapper
# ---------------------------------------------------------------------------
# In-memory cache keyed on (query, lang). Survives only the lifetime of the
# process — fine for demo + early pilot. Pilot at scale would graduate this to
# Redis with the same key shape.
_INTENT_CACHE: dict[tuple[str, str], tuple[Intent, float]] = {}
_CACHE_TTL_S = 3600.0
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="groq")


def warmup() -> None:
    """Fire throwaway Groq calls so the first real user query is warm.
    Two calls because Groq cold spikes occasionally hit the second request
    too. Failures are silent — the timeout wrapper on real calls handles
    any cold-start spillover."""
    for q in ("warmup ping", "warmup ping 2"):
        try:
            extract_intent(q)
        except Exception:
            pass


def extract_intent_resilient(
    raw_query: str, lang: str = "en", timeout_ms: int = 1500
) -> tuple[Intent | None, str]:
    """Returns (intent_or_None, note). note is empty on cache hit, 'cached', 'timeout',
    or 'fresh' to help the endpoint annotate transparency notes for the UI."""
    key = (raw_query.strip().lower(), lang)
    now = time.time()

    # Cache lookup
    if key in _INTENT_CACHE:
        intent, ts = _INTENT_CACHE[key]
        if now - ts < _CACHE_TTL_S:
            return intent, "cache hit"
        # else fall through to refresh

    # Fresh call with hard timeout
    fut = _executor.submit(extract_intent, raw_query)
    try:
        intent = fut.result(timeout=timeout_ms / 1000.0)
    except FutureTimeoutError:
        return None, f"Groq exceeded {timeout_ms}ms; using plain kNN"
    except Exception as e:
        return None, f"intent extraction failed ({type(e).__name__}); using plain kNN"

    _INTENT_CACHE[key] = (intent, now)
    return intent, ""


# ---------------------------------------------------------------------------
# Category → embedding-prefix helper
# ---------------------------------------------------------------------------

_CATEGORY_TO_PREFIX = {
    # apparel
    "t-shirt": "apparel",
    "tshirt": "apparel",
    "shirt": "apparel",
    "dress": "apparel:women:dresses",
    "trousers": "apparel",
    "pants": "apparel",
    "jeans": "apparel",
    "jacket": "apparel",
    "coat": "apparel",
    "blazer": "apparel:women",
    "skirt": "apparel:women",
    "top": "apparel:women:tops",
    "scarf": "apparel:women:accessories",
    "leggings": "apparel:women:bottoms",
    "joggers": "apparel:women:bottoms",
    "shorts": "apparel",
    "short": "apparel",
    "vest": "apparel",
    "polo": "apparel",
    "hoodie": "apparel",
    "sweater": "apparel",
    "sweatshirt": "apparel",
    "jersey": "apparel",
    "swimwear": "apparel",
    "tracksuit": "apparel",
    # footwear
    "sneaker": "footwear",
    "shoe": "footwear",
    "shoes": "footwear",
    "trainers": "footwear",
    "boots": "footwear",
    # beauty / home
    "candle": "beauty:candles",
    "body lotion": "beauty:body_care",
    "lotion": "beauty:body_care",
    "soap": "beauty:hand_soaps",
    "fragrance": "beauty",
    "perfume": "beauty",
    "freshener": "beauty:fresheners",
    # kids / baby
    "baby": "baby",
    "kids": "kids",
    "toy": "kids:toys",
    # home
    "home": "home",
}


def category_to_prefix(
    category: str | None,
    gender: str | None = None,
    audience: str | None = None,
) -> str | None:
    """Pick the narrowest category prefix supported by our catalog.

    Mapping precedence: audience > gender > base category.
    Examples:
      ("shorts", "men", "adult")     -> apparel:men
      ("shorts", None,  "kids")      -> kids:boys_clothing (defaults to boys)
      ("shorts", "women", "kids")    -> kids:girls_clothing
      ("dress",  "women", "adult")   -> apparel:women:dresses
      ("sneaker", "women", "adult")  -> footwear:women
      ("sneaker", None,  "kids")     -> footwear:kids
      ("candle", None,   None)       -> beauty:candles
    """
    if not category:
        # Audience alone can still narrow the catalog
        if audience == "baby":
            return "baby"
        if audience == "kids":
            if gender == "men":
                return "kids:boys_clothing"
            if gender == "women":
                return "kids:girls_clothing"
            return "kids"
        return None
    k = category.strip().lower()
    base = _CATEGORY_TO_PREFIX.get(k)
    if base is None:
        for tok in k.split():
            if tok in _CATEGORY_TO_PREFIX:
                base = _CATEGORY_TO_PREFIX[tok]
                break

    # Audience routing — baby first because of newborn-specific catalog
    if audience == "baby":
        return "baby"
    if audience == "kids":
        if base and base.startswith("footwear"):
            return "footwear:kids"
        if gender == "women":
            return "kids:girls_clothing"
        if gender == "men":
            return "kids:boys_clothing"
        return "apparel:kids"

    # Adult routing — gender narrows when known.
    # Non-clothing bases (beauty / home / baby / kids) keep their own prefix
    # because gender doesn't reroute them. Everything else defaults to
    # apparel:[gender] so the SQL filter actually pins to that demographic.
    _gender_passthrough_prefixes = ("beauty", "home", "baby", "kids")
    if gender == "women":
        if k == "dress" or "dress" in k:
            return "apparel:women:dresses"
        if base and base.startswith("footwear"):
            return "footwear:women"
        if base and any(base.startswith(p) for p in _gender_passthrough_prefixes):
            return base
        # Clothing or unknown base → women's apparel subset
        return "apparel:women"
    if gender == "men":
        if base and base.startswith("footwear"):
            return "footwear:men"
        if base and any(base.startswith(p) for p in _gender_passthrough_prefixes):
            return base
        return "apparel:men"

    # No demographics — return base as-is (or None if base was None)
    return base


# ---------------------------------------------------------------------------
# Title-keyword rules — used by /search/smart to throw out "apparel-but-not-the-thing"
# kNN false positives. Without this, "black t-shirt" returns black polos, vests,
# trousers, dresses, because the SQL filter prefix is `apparel` and the kNN ranks
# loosely. With this, we require the title to contain a sensible token (e.g.
# t-shirt | tee) before the result counts.
# ---------------------------------------------------------------------------
_CATEGORY_TITLE_RULES: dict[str, dict[str, list[str]]] = {
    "t-shirt":   {"requires_any": ["t-shirt", "tee"]},
    "tshirt":    {"requires_any": ["t-shirt", "tee"]},
    "tee":       {"requires_any": ["t-shirt", "tee"]},
    # "shirt" must NOT match "shirt dress" — shirt-dresses are dresses.
    "shirt":     {"requires_any": ["shirt"], "excludes": ["t-shirt", "tee", "dress"]},
    "dress":     {"requires_any": ["dress"]},
    "candle":    {"requires_any": ["candle"]},
    "scarf":     {"requires_any": ["scarf"]},
    "jacket":    {"requires_any": ["jacket", "windbreaker", "bomber", "coat", "parka"]},
    "blazer":    {"requires_any": ["blazer"]},
    "trousers":  {"requires_any": ["trouser", "pant", "jogger", "legging"]},
    "pants":     {"requires_any": ["trouser", "pant", "jogger", "legging"]},
    "jeans":     {"requires_any": ["jeans", "denim"]},
    "skirt":     {"requires_any": ["skirt"]},
    "shorts":    {"requires_any": ["shorts", "boxer", "trunk"], "excludes": ["dress"]},
    "short":     {"requires_any": ["shorts", "boxer", "trunk"], "excludes": ["dress"]},
    "top":       {"requires_any": ["top", "blouse", "vest"], "excludes": ["t-shirt"]},
    "blouse":    {"requires_any": ["blouse"]},
    # Footwear rules: removed brand names from requires_any (they false-match
    # Jordan hoodies, Nike jerseys, adidas pants, etc.). Excludes catch the
    # apparel items that share a brand prefix with actual shoes.
    "shoe":      {
        "requires_any": ["shoe", "sneaker", "boot", "loafer", "trainer", "sandal", "slipper", "slide"],
        "excludes":     ["hoodie", "jersey", "pants", "shirt", "tee", "shorts", "jacket", "blouse", "skirt", "set", "dress", "vest", "scarf", "cap", "hat", "sock"],
    },
    "shoes":     {
        "requires_any": ["shoe", "sneaker", "boot", "loafer", "trainer", "sandal", "slipper", "slide"],
        "excludes":     ["hoodie", "jersey", "pants", "shirt", "tee", "shorts", "jacket", "blouse", "skirt", "set", "dress", "vest", "scarf", "cap", "hat", "sock"],
    },
    "sneaker":   {
        "requires_any": ["shoe", "sneaker", "trainer", "slide"],
        "excludes":     ["hoodie", "jersey", "pants", "shirt", "tee", "shorts", "jacket", "blouse", "skirt", "set", "vest", "scarf", "cap", "hat", "sock"],
    },
    "trainers":  {
        "requires_any": ["shoe", "sneaker", "trainer", "slide"],
        "excludes":     ["hoodie", "jersey", "pants", "shirt", "tee", "shorts", "jacket", "blouse", "skirt", "set", "vest", "scarf", "cap", "hat", "sock"],
    },
    # "bag" must match actual bags, not storage baskets or vest tops.
    "bag":       {
        "requires_any": ["bag", "tote", "backpack", "handbag", "satchel", "purse", "rucksack", "clutch"],
        "excludes":     ["basket", "vest", "shirt", "dress", "blanket", "pillow", "cushion", "blouse", "skirt", "set"],
    },
    "tote":      {"requires_any": ["bag", "tote", "handbag", "satchel"]},
    "handbag":   {"requires_any": ["bag", "handbag", "tote"]},
    "backpack":  {"requires_any": ["bag", "backpack", "rucksack"]},
    # Watches not in catalog yet — keep rule so a future scrape populates cleanly.
    "watch":     {"requires_any": ["watch", "smartwatch"], "excludes": ["strap", "band", "box", "case"]},
    "lotion":    {"requires_any": ["lotion", "cream"]},
    "soap":      {"requires_any": ["soap"]},
    "perfume":   {"requires_any": ["perfume", "cologne", "eau de", "spray", "mist", "fragrance"]},
    "fragrance": {"requires_any": ["perfume", "cologne", "eau de", "spray", "mist", "fragrance"]},
    "body lotion": {"requires_any": ["lotion", "cream"]},
    "body cream":  {"requires_any": ["lotion", "cream"]},
}


def title_matches_category(title: str | None, category: str | None) -> bool:
    """True if a product title plausibly matches the requested category.

    Returns True (i.e. don't filter) when category is unknown or no rule is
    defined — we'd rather over-include than wrongly drop hits."""
    if not title or not category:
        return True
    rules = _CATEGORY_TITLE_RULES.get(category.strip().lower())
    if not rules:
        return True
    t = title.lower()
    requires = rules.get("requires_any") or []
    excludes = rules.get("excludes") or []
    if requires and not any(kw in t for kw in requires):
        return False
    if excludes and any(kw in t for kw in excludes):
        return False
    return True


# ---------------------------------------------------------------------------
# Demographics title filter — catches obvious gender/audience mis-matches
# that survive the category-prefix narrowing. e.g. user asks "short for man",
# Cohere kNN still surfaces "Short tunic dress" because it has "Short" in
# the title; this filter rejects the dress because the gender is "women".
# ---------------------------------------------------------------------------
_GENDER_EXCLUDE_TITLE_TOKENS = {
    "men":   ["women", "ladies", "girl", "girls", "dress", "skirt", "blouse"],
    "women": ["men's", " men ", "men-", "boy", "boys"],
}
_AUDIENCE_EXCLUDE_TITLE_TOKENS = {
    "adult": ["kids", "kid's", "infant", "newborn", "toddler", "baby", "boys", "girls",
              "pre school", "pre-school", "preschool", "grade school"],
    "kids":  ["women", "ladies", " men ", "men's", "men-"],
}


def title_matches_demographics(
    title: str | None, gender: str | None, audience: str | None
) -> bool:
    """True if a product title doesn't obviously contradict the requested
    gender / audience. False means the title contains a token that
    contradicts the demographics (e.g. 'dress' when gender=men).

    Like title_matches_category, this is intentionally tolerant — only
    rejects on clear contradictions, not absence."""
    if not title:
        return True
    t = title.lower()
    if gender and gender in _GENDER_EXCLUDE_TITLE_TOKENS:
        if any(tok in t for tok in _GENDER_EXCLUDE_TITLE_TOKENS[gender]):
            return False
    if audience and audience in _AUDIENCE_EXCLUDE_TITLE_TOKENS:
        if any(tok in t for tok in _AUDIENCE_EXCLUDE_TITLE_TOKENS[audience]):
            return False
    return True


# ---------------------------------------------------------------------------
# Deal-word detection — covers cases where Groq fails to set intent=discounted
# but the raw query clearly signals price-asc preference (e.g. "discount on
# T-shirt", "cheap pink dress", Arabic "خصم", "أرخص").
# ---------------------------------------------------------------------------
_DEAL_WORDS = {
    "discount", "discounted", "deal", "deals", "sale", "on sale",
    "cheap", "cheaper", "budget", "affordable", "promo", "offer", "offers",
    "خصم", "تخفيض", "تخفيضات", "أرخص", "ارخص", "رخيص", "رخيصة",
}


def is_deal_query(raw_query: str, intent_value: str) -> bool:
    if intent_value == "discounted":
        return True
    q = raw_query.lower()
    return any(w in q for w in _DEAL_WORDS)


# ---------------------------------------------------------------------------
# Modesty filter — drops titles containing tokens that contradict "modest"
# intent. Activated only when Intent.modest == True.
# ---------------------------------------------------------------------------
_MODESTY_EXCLUDE_TITLE_TOKENS = [
    "mini",        # mini dress / mini skirt
    "crop",        # crop top
    "strappy",     # strappy dress
    "halterneck", "halter",
    "plunge", "plunging",
    "low-cut", "low cut",
    "bandeau", "tube",
    "off-shoulder", "off shoulder",
    "bralette", "bra",
    "bikini", "thong",
    "sheer",
    "backless", "open back",
]


def title_matches_modesty(title: str | None, modest: bool | None) -> bool:
    """True if a title doesn't contradict modesty intent.

    Returns True (don't filter) when modest is falsy — modesty is opt-in.
    When modest=True, rejects titles containing mini/crop/strappy/halter
    /bandeau/etc."""
    if not modest or not title:
        return True
    t = title.lower()
    return not any(tok in t for tok in _MODESTY_EXCLUDE_TITLE_TOKENS)


# ---------------------------------------------------------------------------
# Low-signal-query detection — when the parsed Intent has no structured
# signal AND the raw query is short/gibberish, we'd otherwise return random
# kNN matches that look like demo failure. Better to return empty + suggest.
# ---------------------------------------------------------------------------
def is_low_signal(raw_query: str, intent: "Intent | None") -> bool:
    """True if the query lacks both structured intent AND meaningful length.

    Specifically: no category, color, brand, gender, audience, or price
    constraint AND the query (post-strip) is shorter than 6 chars. Used by
    the endpoint to short-circuit gibberish like 'asdfgh' or 'a'."""
    q = (raw_query or "").strip()
    if len(q) < 2:
        return True
    if intent is None:
        # Groq timed out / errored / got rate-limited: treat short queries
        # as low-signal so we don't spray random kNN at a demo.
        return len(q) <= 7
    has_signal = any([
        intent.category, intent.color, intent.brand,
        intent.gender, intent.audience,
        intent.max_price_kwd is not None, intent.min_price_kwd is not None,
    ])
    if has_signal:
        return False
    # No structured intent. Short-ish query → almost certainly gibberish.
    # 7 chars catches "asdfgh", "qwerty", "zxcvbn" but lets real words like
    # "shirt" / "dress" through (they would have had intent.category set
    # anyway by Groq; this branch only fires when Groq returned nothing).
    return len(q) <= 7
