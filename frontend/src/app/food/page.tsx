"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  api,
  type SearchHit,
  FOOD_BRAND_SLUGS,
  CRAVING_MOODS,
  BRAND_LABELS,
} from "@/lib/api";
import ProductCard from "@/components/ProductCard";

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

function detectLang(q: string): "en" | "ar" {
  return /[؀-ۿ]/.test(q) ? "ar" : "en";
}

// ─────────────────────────────────────────────────────────────────────────────
// Search mode
// ─────────────────────────────────────────────────────────────────────────────
function SearchMode() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const lang = detectLang(query);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const r = await api.smartSearch({ query, lang, limit: 24 });
      setHits(onlyFood(r.hits));
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
  const [mains, setMains] = useState<SearchHit[]>([]);
  const [anchor, setAnchor] = useState<SearchHit | null>(null);
  const [drinks, setDrinks] = useState<SearchHit[]>([]);
  const [sides, setSides] = useState<SearchHit[]>([]);
  const [desserts, setDesserts] = useState<SearchHit[]>([]);
  const [loadingMains, setLoadingMains] = useState(true);
  const [loadingPairings, setLoadingPairings] = useState(false);

  // Load curated mains once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Query the smart endpoint for entree-shaped items. Cohere semantic
        // search reliably ranks combos, sandwiches and paninis above sides
        // for this query phrasing.
        const r = await api.smartSearch({
          query: "chicken combo or sandwich or panini main",
          lang: "en",
          limit: 16,
        });
        if (!alive) return;
        // Drop drinks / desserts / side-only items from the picker. Best-effort
        // title filter: title shouldn't contain words that mark non-mains.
        const NON_MAIN = /(latte|frapp|tea|coffee|cookie|brownie|cheesecake|muffin|croissant|water|sauce|toast|lemonade)/i;
        const filtered = onlyFood(r.hits).filter((h) => !NON_MAIN.test(h.title));
        setMains(filtered.slice(0, 6));
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
  const [active, setActive] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  const activeMood = useMemo(
    () => CRAVING_MOODS.find((m) => m.key === active),
    [active],
  );

  async function pickMood(key: string) {
    const mood = CRAVING_MOODS.find((m) => m.key === key);
    if (!mood) return;
    setActive(key);
    setLoading(true);
    try {
      const r = await api.smartSearch({ query: mood.query, lang: "en", limit: 24 });
      setHits(onlyFood(r.hits));
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

  return (
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
          tile. Aura member price, points-at-checkout, and the employee discount
          tier all apply at the moment of decision.
        </p>
      </section>

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
