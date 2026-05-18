"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type SearchHit, type Intent, BRAND_LABELS } from "@/lib/api";
import { useStage } from "@/lib/stores";
import BrandChips from "@/components/BrandChips";
import ProductCard from "@/components/ProductCard";
import CrossBrandRail from "@/components/CrossBrandRail";

function TextSearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const stage = useStage((s) => s.stage);

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [lang, setLang] = useState<"en" | "ar">(
    (params.get("lang") as "en" | "ar") ?? "en",
  );
  const [maxPrice, setMaxPrice] = useState<string>(params.get("max") ?? "");
  const [brand, setBrand] = useState<string | null>(
    params.get("brand") ?? null,
  );

  const [mainHits, setMainHits] = useState<SearchHit[]>([]);
  const [otherBrandHits, setOtherBrandHits] = useState<SearchHit[]>([]);
  const [parsedIntent, setParsedIntent] = useState<Intent | null>(null);
  const [llmNotes, setLlmNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fire search if URL has ?q=
  useEffect(() => {
    if (params.get("q")) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-reset transient state when the query input is emptied — without
  // this, the chip strip and stale results linger after a user clears the
  // search box, and brand-chip clicks against an empty query do nothing
  // visible.
  useEffect(() => {
    if (!query.trim()) {
      setParsedIntent(null);
      setLlmNotes([]);
      setMainHits([]);
      setOtherBrandHits([]);
      setError(null);
    }
  }, [query]);

  function clearAll() {
    setQuery("");
    setMaxPrice("");
    setBrand(null);
    setParsedIntent(null);
    setLlmNotes([]);
    setMainHits([]);
    setOtherBrandHits([]);
    setError(null);
    router.replace("/text-search");
  }

  async function runSearch(brandOverride?: string | null) {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);

    // Resolve effective brand: explicit arg from chip click > React state.
    // The arg path bypasses stale-closure when BrandChips fires a click —
    // setBrand() hasn't yet propagated when this function is invoked via
    // setTimeout(() => runSearch(b), 0).
    const effectiveBrand = brandOverride !== undefined ? brandOverride : brand;

    // Sync URL so it's shareable / re-runnable
    const sp = new URLSearchParams();
    sp.set("q", query);
    if (lang === "ar") sp.set("lang", "ar");
    if (maxPrice) sp.set("max", maxPrice);
    if (effectiveBrand) sp.set("brand", effectiveBrand);
    router.replace(`/text-search?${sp.toString()}`);

    try {
      // Stage 1: filter by single brand if one is picked; null = "All Alshaya" pill = no brand filter.
      // Stage 2: no brand filter — unified across brands.
      // Important: do NOT fall back to "hm" on null. With the "All Alshaya" pill,
      // null is a deliberate user choice ("show everything"), not an unset sentinel.
      const isStage2 = stage === 2;
      const mainBrand = isStage2 ? null : effectiveBrand;
      const max = maxPrice ? parseFloat(maxPrice) : null;

      // Smart-search path: Groq parses the query into structured filters
      // (color, category, price, brand) and the backend applies them on top
      // of Cohere kNN. We pin brand from the chip and price from the input
      // so user-set filters always win over LLM-inferred ones.
      const smart = await api.smartSearch({
        query,
        lang,
        limit: 18,
      });
      setParsedIntent(smart.intent);
      setLlmNotes(smart.notes ?? []);

      // Hard brand and price filters override LLM hits
      let mainResults = smart.hits;
      if (mainBrand) {
        mainResults = mainResults.filter((h) => h.brand_slug === mainBrand);
      }
      if (max != null) {
        mainResults = mainResults.filter(
          (h) => h.price_kwd != null && h.price_kwd <= max,
        );
      }
      setMainHits(mainResults);

      // Cross-brand rail — re-uses the same parsed query but excludes mainBrand.
      // We use plain text_search here (cheap; no LLM needed since intent is
      // already known) but feed the cleaned query for better relevance.
      if (!isStage2 && mainBrand) {
        const others = await api.textSearch({
          query: smart.intent.query_cleaned || query,
          lang,
          limit: 8,
          brand_filter: ["hm", "footlocker", "mothercare", "bath_body_works"].filter(
            (b) => b !== mainBrand,
          ),
          max_price_kwd: max ?? smart.intent.max_price_kwd ?? null,
        });
        setOtherBrandHits(others.hits);
      } else {
        setOtherBrandHits([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Search Alshaya
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder={
              lang === "ar"
                ? "اكتب ما تبحث عنه…"
                : "Try “white t-shirt”, “linen dress”, “black candle”"
            }
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-[var(--aura-primary)] focus:ring-1 focus:ring-[var(--aura-primary)]"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as "en" | "ar")}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm"
          >
            <option value="en">EN</option>
            <option value="ar">العربية</option>
          </select>
          <input
            type="number"
            step="0.001"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="max KWD"
            className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm"
          />
          <button
            onClick={() => runSearch()}
            disabled={loading}
            className="rounded-lg bg-[var(--aura-primary)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--aura-primary-dark)] disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
          <button
            onClick={clearAll}
            disabled={loading || (!query && !brand && !maxPrice && !parsedIntent)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            title={lang === "ar" ? "إعادة تعيين البحث" : "Clear / reset search"}
          >
            {lang === "ar" ? "إعادة تعيين" : "Reset"}
          </button>
        </div>
      </div>

      {/* Stage 1: brand chips */}
      {stage === 1 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Browse within
          </p>
          <BrandChips
            selected={brand}
            onChange={(b) => {
              setBrand(b);
              // Pass the new brand value to runSearch directly so it doesn't
              // read a stale `brand` from the previous closure. Without this,
              // clicking "Foot Locker" filters by the previous brand value.
              if (mainHits.length > 0) setTimeout(() => runSearch(b), 0);
            }}
          />
        </div>
      )}

      {/* Stage banner */}
      <div
        className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
          stage === 2
            ? "border-[var(--aura-primary)]/40 bg-violet-50 text-[var(--aura-primary-dark)]"
            : "border-zinc-200 bg-white text-zinc-600"
        }`}
      >
        {stage === 1 ? (
          <>
            <strong>Stage 1 view.</strong>{" "}
            {brand
              ? <>Search within {BRAND_LABELS[brand]}, with cross-brand recommendations as a separate rail below. This is what ships in pilot — recommendation cards link out to each brand&apos;s checkout.</>
              : <>Search across all Alshaya brands. Recommendation cards link out to each brand&apos;s checkout.</>}
          </>
        ) : (
          <>
            <strong>Stage 2 preview.</strong> Unified cross-brand grid. Tap{" "}
            <em>Add to Aura</em> on any product to build a multi-brand cart, then
            head to the Aura Concierge checkout. This is the experience post-pilot
            once traction proves out.
          </>
        )}
      </div>

      {/* Wajha understood — shows the parsed intent chips after a search */}
      {parsedIntent && (
        parsedIntent.category ||
        parsedIntent.color ||
        parsedIntent.brand ||
        parsedIntent.gender ||
        parsedIntent.audience ||
        parsedIntent.max_price_kwd != null ||
        parsedIntent.min_price_kwd != null
      ) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-[var(--aura-primary-dark)]">
            {lang === "ar" ? "وجهة فهمت:" : "Wajha understood:"}
          </span>
          {(parsedIntent.audience || parsedIntent.gender) && (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-zinc-700 ring-1 ring-zinc-200">
              {lang === "ar" ? "الفئة: " : "For: "}
              <strong className="text-zinc-900 capitalize">
                {[parsedIntent.audience, parsedIntent.gender].filter(Boolean).join(" · ")}
              </strong>
            </span>
          )}
          {parsedIntent.category && (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-zinc-700 ring-1 ring-zinc-200">
              {lang === "ar" ? "النوع: " : "Category: "}
              <strong className="text-zinc-900">{parsedIntent.category}</strong>
            </span>
          )}
          {parsedIntent.color && (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-zinc-700 ring-1 ring-zinc-200">
              {lang === "ar" ? "اللون: " : "Color: "}
              <strong className="text-zinc-900 capitalize">{parsedIntent.color}</strong>
            </span>
          )}
          {parsedIntent.brand && (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-zinc-700 ring-1 ring-zinc-200">
              {lang === "ar" ? "العلامة: " : "Brand: "}
              <strong className="text-zinc-900">
                {BRAND_LABELS[parsedIntent.brand] ?? parsedIntent.brand}
              </strong>
            </span>
          )}
          {parsedIntent.max_price_kwd != null && (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-zinc-700 ring-1 ring-zinc-200">
              {lang === "ar" ? "حد أعلى: " : "Max: "}
              <strong className="text-zinc-900">
                {parsedIntent.max_price_kwd.toFixed(3)} KWD
              </strong>
            </span>
          )}
          {parsedIntent.min_price_kwd != null && (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-zinc-700 ring-1 ring-zinc-200">
              {lang === "ar" ? "حد أدنى: " : "Min: "}
              <strong className="text-zinc-900">
                {parsedIntent.min_price_kwd.toFixed(3)} KWD
              </strong>
            </span>
          )}
          <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-500">
            parsed by Groq · Llama 3.3 70B
          </span>
        </div>
      )}
      {llmNotes.length > 0 && (
        <div className="mt-1 text-[11px] text-zinc-500">
          {llmNotes.join(" · ")}
        </div>
      )}

      {/* Empty-intent helper — Groq parsed nothing structured (no category,
          color, brand, price). Surface a useful nudge instead of letting
          the user wonder why results look random. */}
      {parsedIntent &&
        !parsedIntent.category &&
        !parsedIntent.color &&
        !parsedIntent.brand &&
        !parsedIntent.gender &&
        !parsedIntent.audience &&
        parsedIntent.max_price_kwd == null &&
        parsedIntent.min_price_kwd == null && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {parsedIntent.intent === "discounted" ? (
              <>
                <strong>{lang === "ar" ? "نصيحة: " : "Tip: "}</strong>
                {lang === "ar"
                  ? "اختر منتجاً أولاً ثم استخدم الميزة \"البحث عن البدائل بسعر مخفض\" — تعمل وجهة عبر مقارنة بصرية بمنتج محدد."
                  : "Pick a product first, then ask for \"discounted alternatives\" — Wajha needs an anchor product to compare prices against."}
              </>
            ) : (
              <>
                <strong>{lang === "ar" ? "ملاحظة: " : "Heads up: "}</strong>
                {lang === "ar"
                  ? `لم تتعرف وجهة على مرشّحات محددة. تعرض المنتجات الأقرب دلالياً لـ "${parsedIntent.query_cleaned}".`
                  : `Wajha didn't catch any specific filters. Showing semantic matches for "${parsedIntent.query_cleaned}".`}
              </>
            )}
          </div>
        )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Main results */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-zinc-900">
          {stage === 2 || !brand
            ? "Results across Alshaya"
            : `Results from ${BRAND_LABELS[brand]}`}
        </h2>
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-xl bg-zinc-100"
              />
            ))}
          </div>
        )}
        {!loading && mainHits.length === 0 && query && (
          <p className="text-sm text-zinc-500">
            No matches. Try a different query or change brand filter.
          </p>
        )}
        {!loading && mainHits.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mainHits.map((p) => (
              <ProductCard key={p.id} product={p} lang={lang} />
            ))}
          </div>
        )}
      </section>

      {/* Cross-brand rail (Stage 1 only) */}
      {stage === 1 && (
        <CrossBrandRail
          title={lang === "ar" ? "ربما يعجبك أيضًا من علامات الشايع" : "You might also like across Alshaya"}
          subtitle={lang === "ar" ? "منتجات مطابقة من علامات الشايع الأخرى — اضغط لعرضها لدى كل علامة" : "Matching items from other Alshaya brands — click to view at each brand"}
          items={otherBrandHits}
          lang={lang}
        />
      )}
    </div>
  );
}

export default function TextSearchPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-zinc-500">Loading…</div>}>
      <TextSearchInner />
    </Suspense>
  );
}
