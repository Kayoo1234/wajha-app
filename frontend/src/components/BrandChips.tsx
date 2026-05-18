"use client";

import { BRAND_LABELS } from "@/lib/api";

// Order matters — left-to-right is the visual story we want users to see.
// Fashion brands first (the original 4), then food brands as they get
// catalog data. The two-tab Fashion/Food home (task #18) will split these
// more cleanly; until then this is the unified chip strip.
const BRAND_ORDER = [
  "hm",
  "footlocker",
  "mothercare",
  "bath_body_works",
  "raising_canes",
];

export default function BrandChips({
  selected,
  onChange,
}: {
  selected: string | null;
  onChange: (slug: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onChange(null)}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          selected === null
            ? "bg-zinc-900 text-white"
            : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"
        }`}
      >
        All Alshaya
      </button>
      {BRAND_ORDER.map((slug) => (
        <button
          key={slug}
          onClick={() => onChange(slug)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            selected === slug
              ? "bg-[var(--aura-primary)] text-white"
              : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"
          }`}
        >
          {BRAND_LABELS[slug]}
        </button>
      ))}
    </div>
  );
}
