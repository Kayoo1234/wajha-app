"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, BRAND_LABELS, type Product, type SearchHit } from "@/lib/api";
import { useStage } from "@/lib/stores";
import ProductCard from "@/components/ProductCard";

function VisualSearchInner() {
  const params = useSearchParams();
  const stage = useStage((s) => s.stage);
  const cheaperMode = params.get("cheaper") === "1";

  const [source, setSource] = useState<Product | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerHits, setPickerHits] = useState<SearchHit[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");

  // Default starter. Re-fires on cheaperMode change so the same component instance
  // refreshes after a same-route navigation (e.g. /visual-search → /visual-search?cheaper=1).
  useEffect(() => {
    setSource(null);
    setHits([]);
    runPicker(cheaperMode ? "premium leather jacket" : "sneaker");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cheaperMode]);

  async function runPicker(q: string) {
    setPickerQuery(q);
    try {
      const r = await api.textSearch({ query: q, limit: 6 });
      setPickerHits(r.hits);
    } catch {
      // ignore
    }
  }

  async function runVisual(p: Product | SearchHit) {
    setLoading(true);
    setError(null);
    setSource(p);
    try {
      const r = await api.visualSearchByProduct({
        product_id: p.id,
        limit: 12,
        exclude_same_brand: stage === 2,
      });
      let filtered = r.hits;
      if (cheaperMode && p.price_kwd) {
        filtered = filtered.filter(
          (h) => h.price_kwd != null && h.price_kwd < (p.price_kwd ?? Infinity),
        );
      }
      setHits(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setSource(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = (reader.result as string).split(",")[1];
        try {
          const r = await api.visualSearchByImage({
            image_base64: b64,
            limit: 12,
          });
          setHits(r.hits);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">
          {cheaperMode ? "Find discounted alternatives" : "Visual similarity"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {cheaperMode
            ? "Pick a premium item — Wajha finds visually similar at discounted price across the portfolio."
            : "Pick any product or upload a photo — Wajha finds visually similar products via CLIP image embeddings."}
        </p>
      </header>

      <div
        className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
          stage === 2
            ? "border-[var(--aura-primary)]/40 bg-violet-50 text-[var(--aura-primary-dark)]"
            : "border-zinc-200 bg-white text-zinc-600"
        }`}
      >
        {stage === 2 ? (
          <>
            <strong>Stage 2 preview.</strong> Cross-brand visual results, source brand
            excluded so matches always come from <em>other</em> Alshaya brands. Add
            to Aura Cart for the Concierge checkout.
          </>
        ) : (
          <>
            <strong>Stage 1 view.</strong> Within-brand visual matches plus a
            cross-brand rail. In pilot, this surface routes each tap out to that
            brand&apos;s own checkout.
          </>
        )}
      </div>

      {!source && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-bold text-zinc-900">
            Pick a source product
          </h2>
          <div className="mt-3 flex gap-2">
            <input
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runPicker(pickerQuery)}
              placeholder="Search for a starting product (e.g. ‘sneaker’, ‘linen dress’)"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--aura-primary)]"
            />
            <button
              onClick={() => runPicker(pickerQuery)}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Find
            </button>
          </div>
          {pickerHits.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {pickerHits.map((p) => (
                <button
                  key={p.id}
                  onClick={() => runVisual(p)}
                  className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white text-left transition hover:border-[var(--aura-primary)] hover:shadow"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url}
                    alt={p.title}
                    className="aspect-[3/4] w-full object-cover"
                    loading="lazy"
                  />
                  <div className="px-2 py-2">
                    <p className="line-clamp-2 text-xs font-medium text-zinc-900">
                      {p.title}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                      {BRAND_LABELS[p.brand_slug]} · {p.price_kwd?.toFixed(3)} KWD
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="mt-6 border-t border-zinc-200 pt-4">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              …or upload an image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="mt-2 block text-sm"
            />
          </div>
        </section>
      )}

      {source && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col items-start gap-6 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={source.image_url}
              alt={source.title}
              className="w-40 rounded-lg object-cover shadow-sm"
            />
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Source · {BRAND_LABELS[source.brand_slug]}
              </div>
              <h2 className="mt-1 text-lg font-bold text-zinc-900">
                {source.title}
              </h2>
              <p className="mt-1 text-base font-semibold text-zinc-900">
                {source.price_kwd?.toFixed(3)} KWD
              </p>
              <button
                onClick={() => {
                  setSource(null);
                  setHits([]);
                }}
                className="mt-3 text-sm font-medium text-[var(--aura-primary)] hover:underline"
              >
                ← Pick a different source
              </button>
            </div>
          </div>
        </section>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      )}

      {!loading && hits.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-zinc-900">
            {cheaperMode
              ? "Visually similar at discounted price"
              : stage === 2
              ? "Visually similar — across other Alshaya brands"
              : "Visually similar"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {hits.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function VisualSearchPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-zinc-500">Loading…</div>}>
      <VisualSearchInner />
    </Suspense>
  );
}
