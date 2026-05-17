"use client";

import { useEffect, useState } from "react";
import { api, BRAND_LABELS, BUCKET_LABELS, type CompleteTheLookResponse, type SearchHit } from "@/lib/api";
import { useCart, useStage } from "@/lib/stores";
import ProductCard from "@/components/ProductCard";
import Link from "next/link";

export default function CompleteTheLookPage() {
  const stage = useStage((s) => s.stage);
  const add = useCart((s) => s.add);
  const [pickerHits, setPickerHits] = useState<SearchHit[]>([]);
  const [pickerQuery, setPickerQuery] = useState("linen dress");
  const [result, setResult] = useState<CompleteTheLookResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runPicker("linen dress");
  }, []);

  async function runPicker(q: string) {
    try {
      const r = await api.textSearch({ query: q, limit: 6 });
      setPickerHits(r.hits);
    } catch {
      // ignore
    }
  }

  async function runCTL(productId: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await api.completeTheLook({
        product_id: productId,
        limit_per_category: 4,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Subtitles describe the bucket's CATEGORY, not a specific brand — the
  // contents now span multiple brands after the CTL post-filter demotes
  // non-shoe Foot Locker items into Apparel.
  const buckets: { key: keyof Omit<CompleteTheLookResponse, "source">; subtitle: string }[] = [
    { key: "apparel", subtitle: "Matching apparel across Alshaya brands" },
    { key: "beauty", subtitle: "Matching scents and body care from Bath & Body Works" },
    { key: "footwear", subtitle: "Matching footwear from Foot Locker" },
    { key: "family", subtitle: "Matching kids items from Mothercare" },
  ];

  const totalBundleKwd =
    result && stage === 2
      ? (result.source.price_kwd ?? 0) +
        (
          [result.apparel[0], result.beauty[0], result.footwear[0], result.family[0]]
            .filter(Boolean) as SearchHit[]
        ).reduce((sum, p) => sum + (p.price_kwd ?? 0), 0)
      : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Complete the look</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick a source product → Wajha finds aesthetic matches across the{" "}
          <em>other</em> Alshaya brands. Source brand is always excluded.
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
            <strong>Stage 2 preview.</strong> Aura Concierge bundles the source +
            top match per category. One cart, one payment, one delivery. Click{" "}
            <em>Add bundle to Aura Cart</em> after picking a source.
          </>
        ) : (
          <>
            <strong>Stage 1 view.</strong> Each bucket is a separate
            recommendation card linking out to each brand&apos;s own checkout. No
            unified cart in pilot.
          </>
        )}
      </div>

      {!result && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-bold text-zinc-900">Pick a source product</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Try an H&amp;M dress to see BBW + Foot Locker + Mothercare matches.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runPicker(pickerQuery)}
              placeholder="‘linen dress’, ‘sneaker’, ‘candle’, …"
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
                  onClick={() => runCTL(p.id)}
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
        </section>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      )}

      {result && (
        <section className="space-y-6">
          {/* Source */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col items-start gap-6 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.source.image_url}
                alt={result.source.title}
                className="w-40 rounded-lg object-cover shadow-sm"
              />
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wider text-zinc-500">
                  Source · {BRAND_LABELS[result.source.brand_slug]}
                </div>
                <h2 className="mt-1 text-xl font-bold text-zinc-900">
                  {result.source.title}
                </h2>
                <p className="mt-1 text-base font-semibold text-zinc-900">
                  {result.source.price_kwd?.toFixed(3)} KWD
                </p>
                {stage === 2 && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        add(result.source);
                        const top: SearchHit[] = [
                          result.apparel[0],
                          result.beauty[0],
                          result.footwear[0],
                          result.family[0],
                        ].filter(Boolean) as SearchHit[];
                        top.forEach((p) => add(p));
                      }}
                      className="rounded-full bg-[var(--aura-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--aura-primary-dark)]"
                    >
                      Add full bundle to Aura Cart
                    </button>
                    <span className="text-sm text-zinc-600">
                      Estimated bundle:{" "}
                      <strong className="text-zinc-900">
                        {totalBundleKwd.toFixed(3)} KWD
                      </strong>{" "}
                      · one delivery via Alshaya · Aura Concierge places each order
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setResult(null)}
                  className="mt-3 block text-sm font-medium text-[var(--aura-primary)] hover:underline"
                >
                  ← Pick a different source
                </button>
              </div>
            </div>
          </div>

          {/* Buckets */}
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
            {buckets.map(({ key, subtitle }) => {
              const items = result[key];
              if (items.length === 0) return null;
              return (
                <div
                  key={key}
                  className="rounded-2xl border border-zinc-200 bg-white p-4"
                >
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                    {BUCKET_LABELS[key as string]}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
                  <div className="mt-3 grid gap-3">
                    {items.slice(0, 3).map((p) => (
                      <ProductCard key={p.id} product={p} compact />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {stage === 2 && (
            <div className="rounded-2xl border border-violet-300 bg-violet-50 p-5 text-sm text-[var(--aura-primary-dark)]">
              <strong>This is the Stage 2 unified bundle.</strong> In pilot the
              same matches surface as separate recommendation cards (Stage 1) linking
              out to each brand. Toggle the header to compare.{" "}
              <Link href="/cart" className="font-semibold underline">
                Go to Aura Cart →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
