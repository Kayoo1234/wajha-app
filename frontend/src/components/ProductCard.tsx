"use client";

import { BRAND_LABELS, type Product, type SearchHit } from "@/lib/api";
import { useCart, useStage } from "@/lib/stores";
import { useEffect, useState } from "react";

const BRAND_COLORS: Record<string, string> = {
  hm: "bg-red-100 text-red-800",
  bath_body_works: "bg-pink-100 text-pink-800",
  footlocker: "bg-zinc-900 text-zinc-50",
  mothercare: "bg-sky-100 text-sky-800",
  // F&B brands — colors echo each brand's marketing palette.
  raising_canes: "bg-red-600 text-white",
  starbucks: "bg-emerald-700 text-white",
  pf_changs: "bg-amber-900 text-amber-50",
  cheesecake_factory: "bg-stone-700 text-stone-50",
};

type Hit = Product | SearchHit;

function isHit(p: Hit): p is SearchHit {
  return "similarity" in p && typeof (p as SearchHit).similarity === "number";
}

export default function ProductCard({
  product,
  compact = false,
  lang = "en",
}: {
  product: Hit;
  compact?: boolean;
  lang?: "en" | "ar";
}) {
  const showArabicTitle = lang === "ar" && !!product.title_ar;
  const displayTitle = showArabicTitle ? product.title_ar! : product.title;
  const add = useCart((s) => s.add);
  const stage = useStage((s) => s.stage);
  const [hydrated, setHydrated] = useState(false);
  const [added, setAdded] = useState(false);
  useEffect(() => setHydrated(true), []);

  const onAdd = () => {
    add(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md ${
        compact ? "min-w-[180px] max-w-[180px]" : ""
      }`}
    >
      <a
        href={product.product_url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-[3/4] overflow-hidden bg-zinc-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image_url}
          alt={displayTitle}
          loading="lazy"
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
        />
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            BRAND_COLORS[product.brand_slug] ?? "bg-zinc-100 text-zinc-800"
          }`}
        >
          {BRAND_LABELS[product.brand_slug] ?? product.brand_slug}
        </span>
        {isHit(product) && product.similarity !== undefined && (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-mono text-white">
            {product.similarity.toFixed(2)}
          </span>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <a
          href={product.product_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`line-clamp-2 ${
            compact ? "text-xs" : "text-sm"
          } font-medium text-zinc-900 hover:text-[var(--aura-primary)]`}
          title={displayTitle}
          dir={showArabicTitle ? "rtl" : undefined}
        >
          {displayTitle}
        </a>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`${
              compact ? "text-sm" : "text-base"
            } font-semibold text-zinc-900`}
          >
            {product.price_kwd != null
              ? `${product.price_kwd.toFixed(3)} KWD`
              : "—"}
          </span>
          {hydrated && stage === 2 && !compact && (
            <button
              onClick={onAdd}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                added
                  ? "bg-emerald-500 text-white"
                  : "bg-[var(--aura-primary)] text-white hover:bg-[var(--aura-primary-dark)]"
              }`}
            >
              {added ? "Added ✓" : "Add to Aura"}
            </button>
          )}
          {hydrated && stage === 1 && !compact && (
            <a
              href={product.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-[var(--aura-primary)] hover:underline"
            >
              View at {BRAND_LABELS[product.brand_slug] ?? product.brand_slug} →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
