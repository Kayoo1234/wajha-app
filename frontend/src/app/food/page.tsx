"use client";

import { Suspense, useEffect, useMemo, useState, createContext, useContext } from "react";
import {
  api,
  type SearchHit,
  FOOD_BRAND_SLUGS,
  CRAVING_MOODS,
  BRAND_LABELS,
} from "@/lib/api";
import ProductCard from "@/components/ProductCard";

// ─────────────────────────────────────────────────────────────────────────────
// Brand filter — shared across all 3 modes via context.
//
// Brands with 0 catalog items (PF Chang's, Cheesecake Factory) render
// disabled. Selected brand state lives at the page level so a user can
// pick a brand once and have it apply to Search, Build-a-meal AND
// Craving — same shape as the fashion text-search experience.
// ─────────────────────────────────────────────────────────────────────────────
type BrandFilter = string | null;
const BrandFilterContext = createContext<{
  brand: BrandFilter;
  setBrand: (b: BrandFilter) => void;
  brandCounts: Record<string, number>;
}>({ brand: null, setBrand: () => {}, brandCounts: {} });

function useBrandFilter() {
  return useContext(BrandFilterContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// /food — the Food vertical landing.
//
// Three modes on one route, switched via internal tab state:
//
//   1. Search        — free-text + Arabic across the food vertical.
//   2. Build-a-meal  — pick a main, get drink/side/dessert pairings via Cohere.
//   3. Craving       — five mood chips, semantic match across food brands.
//
// All three modes hit /search/smart and post-filter results to the food
// brand slugs client-side. No backend change required.
// ─────────────────────────────────────────────────────────────────────────────

type Mode = "search" | "build" | "craving";

const FOOD_SET = new Set(FOOD_BRAND_SLUGS);
const onlyFood = (hits: SearchHit[]) => hits.filter((h) => FOOD_SET.has(h.brand_slug));
const onlyBrand = (hits: SearchHit[], brand: BrandFilter) =>
  brand ? hits.filter((h) => h.brand_slug === brand) : hits;
const onlyFoodAndBrand = (hits: SearchHit[], brand: BrandFilter) =>
  onlyBrand(onlyFood(hits), brand);

function detectLang(q: string): "en" | "ar" {
  return /[؀-ۿ]/.test(q) ? "ar" : "en";
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand chip strip — sticky at the top of the page; drives the shared filter.
// ─────────────────────────────────────────────────────────────────────────────
// Known-populated brands. Render as available immediately, before the
// async /brands call resolves. Without this the chips spend the first
// 1-2s of page load as "soon"-disabled stubs which looked broken in
// Ali's mobile screenshot.
const KNOWN_POPULATED = new Set(["raising_canes", "starbucks"]);

function BrandChipStrip() {
  const { brand, setBrand, brandCounts } = useBrandFilter();
  // Order: chains with catalog first, then "coming soon" stubs
  const chips: Array<{ slug: string; available: boolean }> = [
    { slug: "raising_canes",      available: KNOWN_POPULATED.has("raising_canes") || (brandCounts.raising_canes ?? 0) > 0 },
    { slug: "starbucks",          available: KNOWN_POPULATED.has("starbucks")     || (brandCounts.starbucks     ?? 0) > 0 },
    { slug: "pf_changs",          available: (brandCounts.pf_changs ?? 0) > 0 },
    { slug: "cheesecake_factory", available: (brandCounts.cheesecake_factory ?? 0) > 0 },
  ];

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
        Browse by brand
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setBrand(null)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            brand === null
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"
          }`}
        >
          All Food
        </button>
        {chips.map((c) => {
          const n = brandCounts[c.slug];
          const label = BRAND_LABELS[c.slug] ?? c.slug;
          const active = brand === c.slug;
          if (!c.available) {
            return (
              <button
                key={c.slug}
                disabled
                title="Menu arriving in the next sprint"
                className="cursor-not-allowed rounded-full border border-dashed border-zinc-300 bg-zinc-50 px-4 py-1.5 text-sm font-medium text-zinc-400"
              >
                {label} <span className="ml-1 text-[10px]">· soon</span>
              </button>
            );
          }
          return (
            <button
              key={c.slug}
              onClick={() => setBrand(active ? null : c.slug)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--aura-primary)] text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"
              }`}
            >
              {label}
              {n != null && (
                <span className={`ml-1.5 text-[10px] font-bold ${active ? "text-white/80" : "text-zinc-400"}`}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search mode
// ─────────────────────────────────────────────────────────────────────────────
function SearchMode() {
  const { brand } = useBrandFilter();
  const [query, setQuery] = useState("");
  const [rawHits, setRawHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const lang = detectLang(query);

  // Re-apply the brand filter whenever the chip selection changes, without
  // re-firing the network call.
  const hits = useMemo(() => onlyBrand(rawHits, brand), [rawHits, brand]);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const r = await api.smartSearch({ query, lang, limit: 24 });
      setRawHits(onlyFood(r.hits));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder='Search across Alshaya food — try "iced latte" or "chicken combo" or "بانيني"'
          dir={lang === "ar" ? "rtl" : "ltr"}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-[var(--aura-primary)] focus:ring-1 focus:ring-[var(--aura-primary)]"
        />
        <button
          onClick={runSearch}
          disabled={loading || !query.trim()}
          className="rounded-lg bg-[var(--aura-primary)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--aura-primary-dark)] disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      )}

      {!loading && hasSearched && hits.length === 0 && (
        <p className="text-sm text-zinc-500">
          No food matches for that. Try &ldquo;latte&rdquo;, &ldquo;chicken combo&rdquo;, or a mood like &ldquo;spicy&rdquo;.
        </p>
      )}

      {!loading && hits.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {hits.map((p) => (
            <ProductCard key={p.id} product={p} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Build-a-meal mode
//
// Two-step UX:
//   1. Show 6 curated "mains" from /search/smart query="combo OR panini OR sandwich".
//   2. On main selected, fire three parallel smart-search calls — one each
//      for drink / side / dessert — using simple semantic queries. Post-filter
//      to food vertical and to a few hits each.
// ─────────────────────────────────────────────────────────────────────────────
function BuildAMealMode() {
  const { brand } = useBrandFilter();
  const [rawMains, setRawMains] = useState<SearchHit[]>([]);
  const [anchor, setAnchor] = useState<SearchHit | null>(null);
  const [drinks, setDrinks] = useState<SearchHit[]>([]);
  const [sides, setSides] = useState<SearchHit[]>([]);
  const [desserts, setDesserts] = useState<SearchHit[]>([]);
  const [loadingMains, setLoadingMains] = useState(true);
  const [loadingPairings, setLoadingPairings] = useState(false);

  // Brand-filter mains live; pairings stay cross-brand even when a brand
  // is picked for the main, because the user explicitly wants pairings
  // across the food vertical.
  const mains = useMemo(() => onlyBrand(rawMains, brand).slice(0, 6), [rawMains, brand]);

  // Reset anchor when brand changes (current anchor may no longer match)
  useEffect(() => {
    if (anchor && brand && anchor.brand_slug !== brand) {
      setAnchor(null);
      setDrinks([]); setSides([]); setDesserts([]);
    }
  }, [brand, anchor]);

  // Load curated mains once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.smartSearch({
          query: "chicken combo or sandwich or panini main",
          lang: "en",
          limit: 16,
        });
        if (!alive) return;
        const NON_MAIN = /(latte|frapp|tea|coffee|cookie|brownie|cheesecake|muffin|croissant|water|sauce|toast|lemonade)/i;
        const filtered = onlyFood(r.hits).filter((h) => !NON_MAIN.test(h.title));
        setRawMains(filtered);
      } finally {
        if (alive) setLoadingMains(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // When an anchor is picked, fire three parallel kNN searches for the
  // pairings. Cohere semantic embeddings handle "drink" / "side" / "dessert"
  // intent cleanly without any extra metadata.
  async function selectAnchor(item: SearchHit) {
    setAnchor(item);
    setLoadingPairings(true);
    try {
      const [d, s, sw] = await Promise.all([
        api.smartSearch({ query: "drink iced cold beverage", lang: "en", limit: 12 }),
        api.smartSearch({ query: "side fries coleslaw toast",   lang: "en", limit: 12 }),
        api.smartSearch({ query: "sweet dessert cookie cake",   lang: "en", limit: 12 }),
      ]);
      setDrinks(onlyFood(d.hits).slice(0, 3));
      setSides(onlyFood(s.hits).slice(0, 3));
      setDesserts(onlyFood(sw.hits).slice(0, 3));
    } finally {
      setLoadingPairings(false);
    }
  }

  function reset() {
    setAnchor(null);
    setDrinks([]); setSides([]); setDesserts([]);
  }

  if (!anchor) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">Pick a main</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Choose an entrée and Wajha will suggest a drink, a side, and something sweet — across Alshaya food brands.
          </p>
        </div>
        {loadingMains ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mains.map((p) => (
              <button
                key={p.id}
                onClick={() => selectAnchor(p)}
                className="block text-left"
              >
                <ProductCard product={p} lang="en" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Your main
          </div>
          <h3 className="mt-1 text-lg font-bold text-zinc-900">{anchor.title}</h3>
          <div className="mt-1 text-sm text-zinc-600">
            {BRAND_LABELS[anchor.brand_slug] ?? anchor.brand_slug} ·{" "}
            {anchor.price_kwd != null ? `${anchor.price_kwd.toFixed(3)} KWD` : "—"}
          </div>
        </div>
        <button
          onClick={reset}
          className="text-xs font-medium text-zinc-500 hover:text-[var(--aura-primary)]"
        >
          Change main
        </button>
      </div>

      {loadingPairings && (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="aspect-[3/4] animate-pulse rounded-lg bg-zinc-100" />
            </div>
          ))}
        </div>
      )}

      {!loadingPairings && (
        <div className="grid gap-6 lg:grid-cols-3">
          <PairingColumn title="Pair with a drink" emoji="🥤" items={drinks} />
          <PairingColumn title="Pair with a side"  emoji="🍟" items={sides} />
          <PairingColumn title="Finish on something sweet" emoji="🍰" items={desserts} />
        </div>
      )}

      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm text-zinc-700">
        <strong className="text-[var(--aura-primary-dark)]">Why this works for the pitch:</strong>{" "}
        Build-a-meal is the food equivalent of Complete-the-Look — same kNN
        primitive, food embedding space. The cart enforces one-restaurant-per-F&B
        physics; this view shows the discovery layer.
      </div>
    </div>
  );
}

function PairingColumn({
  title, emoji, items,
}: { title: string; emoji: string; items: SearchHit[] }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
        <span className="text-base">{emoji}</span>
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No matches — try another main.</p>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} compact lang="en" />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Craving mode
//
// Five mood chips. Tap one → smart-search with the mood as the semantic query.
// Cohere multilingual handles the semantic ranking; we post-filter to food
// brands so a craving like "comfort" doesn't accidentally surface H&M hoodies.
// ─────────────────────────────────────────────────────────────────────────────
function CravingMode() {
  const { brand } = useBrandFilter();
  const [active, setActive] = useState<string | null>(null);
  const [rawHits, setRawHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  const activeMood = useMemo(
    () => CRAVING_MOODS.find((m) => m.key === active),
    [active],
  );

  // Re-apply brand filter on chip change without re-fetching
  const hits = useMemo(() => onlyBrand(rawHits, brand), [rawHits, brand]);

  async function pickMood(key: string) {
    const mood = CRAVING_MOODS.find((m) => m.key === key);
    if (!mood) return;
    setActive(key);
    setLoading(true);
    try {
      const r = await api.smartSearch({ query: mood.query, lang: "en", limit: 24 });
      setRawHits(onlyFood(r.hits));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-900">What are you craving?</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Pick a mood. Wajha searches food across all Alshaya brands by what fits the feeling — not by restaurant. <strong>This is the move Talabat structurally can&apos;t make:</strong> they index by brand; we index by attribute.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CRAVING_MOODS.map((m) => (
          <button
            key={m.key}
            onClick={() => pickMood(m.key)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-all ${
              active === m.key
                ? `${m.accent} ring-2 scale-105`
                : `${m.accent} opacity-70 hover:opacity-100`
            }`}
          >
            <span className="text-base">{m.emoji}</span>
            {m.label}
          </button>
        ))}
      </div>

      {activeMood && !loading && hits.length === 0 && (
        <p className="text-sm text-zinc-500">
          Nothing matches that mood in the catalog yet. (Cheesecake Factory and PF Chang&apos;s aren&apos;t scraped — they&apos;ll fill more cravings.)
        </p>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      )}

      {!loading && hits.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {hits.map((p) => (
            <ProductCard key={p.id} product={p} lang="en" />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page shell
// ─────────────────────────────────────────────────────────────────────────────
function FoodPageInner() {
  const [mode, setMode] = useState<Mode>("search");
  const [brand, setBrand] = useState<BrandFilter>(null);
  const [brandCounts, setBrandCounts] = useState<Record<string, number>>({});

  // Load brand product counts once for the chip strip labels
  useEffect(() => {
    let alive = true;
    api.brands().then((bs) => {
      if (!alive) return;
      const counts: Record<string, number> = {};
      for (const b of bs) counts[b.slug] = b.product_count;
      setBrandCounts(counts);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <BrandFilterContext.Provider value={{ brand, setBrand, brandCounts }}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Hero */}
        <section className="mb-8">
          <div className="mb-2 inline-flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
              Food vertical
            </span>
            <span className="text-[11px] text-zinc-500">
              Raising Cane&apos;s · Starbucks · P.F. Chang&apos;s · Cheesecake Factory
            </span>
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 sm:text-4xl">
            The food story Talabat can&apos;t tell.
          </h1>
          <p className="mt-3 max-w-3xl text-base text-zinc-600">
            Talabat asks &ldquo;which restaurant?&rdquo; first. Wajha asks{" "}
            <strong>&ldquo;what do you actually want?&rdquo;</strong> first — and
            searches across every Alshaya food brand by attribute, not by brand
            tile. Aura member price, points-at-checkout, and the employee
            discount tier all apply at the moment of decision.
          </p>
        </section>

        {/* Brand chip strip — shared filter across all 3 modes */}
        <div className="mb-6">
          <BrandChipStrip />
        </div>

        {/* Mode tabs */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200">
          <ModeTab active={mode === "search"}   onClick={() => setMode("search")}   emoji="🔎" label="Search" />
          <ModeTab active={mode === "build"}    onClick={() => setMode("build")}    emoji="🍴" label="Build a meal" />
          <ModeTab active={mode === "craving"}  onClick={() => setMode("craving")}  emoji="🌶" label="Craving" />
        </div>

        {/* Active mode */}
        {mode === "search"  && <SearchMode />}
        {mode === "build"   && <BuildAMealMode />}
        {mode === "craving" && <CravingMode />}
      </div>
    </BrandFilterContext.Provider>
  );
}

function ModeTab({
  active, onClick, emoji, label,
}: {
  active: boolean; onClick: () => void; emoji: string; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
        active
          ? "border-[var(--aura-primary)] text-[var(--aura-primary)]"
          : "border-transparent text-zinc-600 hover:text-zinc-900"
      }`}
    >
      <span className="text-base">{emoji}</span>
      {label}
    </button>
  );
}

export default function FoodPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-zinc-500">Loading…</div>}>
      <FoodPageInner />
    </Suspense>
  );
}
