"use client";

import type { SearchHit } from "@/lib/api";
import ProductCard from "./ProductCard";

export default function CrossBrandRail({
  title,
  subtitle,
  items,
  lang = "en",
}: {
  title: string;
  subtitle?: string;
  items: SearchHit[];
  lang?: "en" | "ar";
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
          {subtitle && (
            <p className="text-sm text-zinc-500">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="scroll-snap-x flex gap-3 overflow-x-auto pb-2">
        {items.map((p) => (
          <div key={p.id} className="snap-start">
            <ProductCard product={p} compact lang={lang} />
          </div>
        ))}
      </div>
    </section>
  );
}
