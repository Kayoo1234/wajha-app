"use client";

import Link from "next/link";
import { useState } from "react";

type Vertical = "fashion" | "food";

const FASHION_SCENARIOS = [
  {
    n: 1,
    href: "/text-search?q=white%20t-shirt&max=8",
    title: "English text search",
    blurb:
      "“white t-shirt under 8 KWD” — cross-brand AI search across the Alshaya catalogue, in English",
    accent: "bg-violet-100 text-violet-800",
  },
  {
    n: 2,
    href: "/text-search?q=%D9%81%D8%B3%D8%AA%D8%A7%D9%86&lang=ar",
    title: "Arabic text search",
    blurb:
      "“فستان” (dress) — multilingual embeddings, no translation layer, Arabic queries handled natively",
    accent: "bg-emerald-100 text-emerald-800",
  },
  {
    n: 3,
    href: "/visual-search",
    title: "Visual similarity",
    blurb:
      "Tap a product → find visually similar across H&M / Foot Locker / Mothercare / BBW",
    accent: "bg-sky-100 text-sky-800",
  },
  {
    n: 4,
    href: "/complete-the-look",
    title: "Complete the look",
    blurb:
      "Pick an outfit → AI bundles matching items across all the OTHER Alshaya brands",
    accent: "bg-pink-100 text-pink-800",
  },
  {
    n: 5,
    href: "/visual-search?cheaper=1",
    title: "Price ladder",
    blurb:
      "“love this but it’s outside my budget” — find visually similar at discounted price",
    accent: "bg-amber-100 text-amber-800",
  },
];

const FOOD_SCENARIOS = [
  {
    n: 1,
    href: "/food",
    title: "Search food",
    blurb:
      "“chicken combo”, “iced latte”, or “بانيني” — Cohere multilingual ranks across every Alshaya food brand",
    accent: "bg-violet-100 text-violet-800",
  },
  {
    n: 2,
    href: "/food",
    title: "Build a meal",
    blurb:
      "Pick a Cane’s main → Wajha suggests a drink, a side, and something sweet across brands. Food-grammar equivalent of Complete-the-Look.",
    accent: "bg-rose-100 text-rose-800",
  },
  {
    n: 3,
    href: "/food",
    title: "Craving",
    blurb:
      "Tap a mood: 🌶 Spicy · 🍔 Comfort · 🥗 Light · 🍰 Sweet · 🥤 Cold. The Talabat-killer beat — attribute-first, not brand-first.",
    accent: "bg-emerald-100 text-emerald-800",
  },
];

export default function Home() {
  const [vertical, setVertical] = useState<Vertical>("fashion");
  const scenarios = vertical === "fashion" ? FASHION_SCENARIOS : FOOD_SCENARIOS;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <section className="text-center">
        <div className="mb-3 inline-block rounded-full bg-white border border-zinc-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Demo for Nida Unas · Director of Loyalty, Digital &amp; Marketing
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
          Aura tracks the spend.
          <br />
          <span className="text-[var(--aura-primary)]">Wajha causes the spend.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-600">
          AI-powered shopping discovery across Alshaya&apos;s Kuwait portfolio —
          fashion + retail + <strong>food</strong>. Real catalog data, real
          embeddings, real cross-brand search.
        </p>
      </section>

      {/* Vertical tab toggle */}
      <div className="mt-10 flex justify-center">
        <div className="inline-flex rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm">
          <VerticalTab
            active={vertical === "fashion"}
            onClick={() => setVertical("fashion")}
            label="Fashion & Retail"
            count="673 SKUs · 4 brands"
          />
          <VerticalTab
            active={vertical === "food"}
            onClick={() => setVertical("food")}
            label="Food & Beverage"
            count="45 items · 2 brands"
            isNew
          />
        </div>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((s) => (
          <Link
            key={s.n}
            href={s.href}
            className="group block rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${s.accent}`}
              >
                {s.n}
              </span>
              <span className="text-sm text-zinc-400 group-hover:text-[var(--aura-primary)]">
                →
              </span>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-zinc-900">{s.title}</h2>
            <p className="mt-2 text-sm text-zinc-600">{s.blurb}</p>
          </Link>
        ))}
      </section>

      {/* Vertical-specific context strip */}
      <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
        {vertical === "fashion" ? (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
              Fashion vertical — what&apos;s in the demo
            </h3>
            <p className="mt-2 text-sm text-zinc-700">
              673 real SKUs scraped from Alshaya-operated KW storefronts on the
              Adobe AEM Edge platform. Real CLIP (512-dim) image embeddings,
              real Cohere multilingual (1024-dim) text embeddings in Supabase
              pgvector. Cross-brand kNN via Postgres HNSW.
            </p>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
              Food vertical — what&apos;s in the demo
            </h3>
            <p className="mt-2 text-sm text-zinc-700">
              Raising Cane&apos;s Kuwait menu (15 items) and Starbucks Kuwait
              menu (30 items) — real menu names, real Kuwait prices in KWD,
              same Cohere semantic ranking. P.F. Chang&apos;s and The
              Cheesecake Factory schemas are seeded; menus arrive in the next
              build sprint.
            </p>
            <ul className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
              <li className="flex gap-2">
                <span className="text-emerald-600">✓</span> Aura member price
                applied at checkout (configurable per channel)
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600">✓</span> Points redeemable
                at the food order — not just the Exclusives catalogue
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600">✓</span> Employee-discount
                tier extends to Wajha delivery (Alshaya sets the rate)
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600">!</span> One-restaurant-per-cart
                for F&amp;B — industry norm, food physics
              </li>
            </ul>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
          What this demo is — and is not
        </h3>
        <ul className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
          <li className="flex gap-2">
            <span className="text-emerald-600">✓</span> Real catalog data,
            real embeddings, real cross-brand kNN
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600">✓</span> Stage 2 cart + Concierge
            checkout walkthrough (mocked — no payment, no real orders)
          </li>
          <li className="flex gap-2">
            <span className="text-amber-600">!</span> Checkout writes nothing to
            brand sites; success page is illustrative
          </li>
          <li className="flex gap-2">
            <span className="text-amber-600">!</span> Stage 1 is the pilot ask;
            Stages 2 and 3 are visible here for context only
          </li>
        </ul>
      </section>
    </div>
  );
}

function VerticalTab({
  active, onClick, label, count, isNew,
}: {
  active: boolean; onClick: () => void; label: string; count: string; isNew?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center rounded-xl px-6 py-3 transition-colors ${
        active
          ? "bg-[var(--aura-primary)] text-white shadow-sm"
          : "text-zinc-600 hover:bg-zinc-50"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-bold">
        {label}
        {isNew && (
          <span
            className={`rounded-full px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider ${
              active ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            new
          </span>
        )}
      </span>
      <span className={`text-[10px] ${active ? "text-white/80" : "text-zinc-500"}`}>
        {count}
      </span>
    </button>
  );
}
