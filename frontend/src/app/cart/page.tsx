"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCart, type CartItem } from "@/lib/stores";
import { BRAND_FULL_NAMES, FOOD_BRAND_SLUGS } from "@/lib/api";

const BRAND_COLORS: Record<string, string> = {
  hm: "border-red-200 bg-red-50",
  bath_body_works: "border-pink-200 bg-pink-50",
  footlocker: "border-zinc-300 bg-zinc-50",
  mothercare: "border-sky-200 bg-sky-50",
  // Food brand swatches — each picks up its brand palette so the cart
  // reads as the same identity as the food-page placeholder swatches.
  raising_canes: "border-red-300 bg-red-50",
  starbucks: "border-emerald-300 bg-emerald-50",
  pf_changs: "border-amber-300 bg-amber-50",
  cheesecake_factory: "border-stone-300 bg-stone-50",
};

const FOOD_SET = new Set(FOOD_BRAND_SLUGS);

// Aura economics — illustrative-only numbers for the demo. Real rates
// are configured per-channel/per-brand by Alshaya in pilot. The point
// of showing these lines is so Nida sees member price + points-at-checkout
// + employee tier rendered at the actual transaction moment, not as a
// slide claim.
const MEMBER_DISCOUNT_PCT = 0.10;            // 10% Aura member price
const POINTS_AVAILABLE = 1250;               // example balance
const POINTS_TO_KWD = 1 / 500;               // 500 pts = 1 KWD
const POINTS_APPLY = 1000;                   // how many we apply for demo

export default function CartPage() {
  const items = useCart((s) => s.items);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  // Derive aggregates from items, not via selectors that return new objects each call
  // (Zustand's referential-equality check would otherwise loop).
  const total = useMemo(
    () => items.reduce((sum, i) => sum + (i.priceKwd ?? 0) * i.qty, 0),
    [items],
  );
  const byBrand = useMemo(
    () =>
      items.reduce<Record<string, CartItem[]>>((acc, i) => {
        (acc[i.brandSlug] ||= []).push(i);
        return acc;
      }, {}),
    [items],
  );
  const [hydrated, setHydrated] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!hydrated) return <div className="p-12 text-center text-zinc-500">Loading…</div>;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">Your Aura Cart is empty</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Switch on <strong>Stage 2 · Preview</strong> in the header, then add items
          from <Link href="/text-search" className="text-[var(--aura-primary)] underline">Search</Link>,{" "}
          <Link href="/visual-search" className="text-[var(--aura-primary)] underline">Visual</Link>, or{" "}
          <Link href="/complete-the-look" className="text-[var(--aura-primary)] underline">Complete the Look</Link>.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          (Cart and Concierge checkout are Stage 2 features — they preview the
          unified-cart UX coming after Stage 1 pilot.)
        </p>
      </div>
    );
  }

  const brandSlugs = Object.keys(byBrand);

  // Vertical split for delivery-mode messaging. F&B physics requires
  // per-restaurant pickup; retail consolidates to one warehouse delivery.
  // Mixed cart → two delivery slots on one invoice.
  const foodBrandsInCart = brandSlugs.filter((s) => FOOD_SET.has(s));
  const retailBrandsInCart = brandSlugs.filter((s) => !FOOD_SET.has(s));
  const hasFood = foodBrandsInCart.length > 0;
  const hasRetail = retailBrandsInCart.length > 0;

  // Aura economics — applied to demo totals so Nida sees what the Stage 2
  // transaction screen looks like end-to-end.
  const memberSavings = total * MEMBER_DISCOUNT_PCT;
  const pointsCredit = POINTS_APPLY * POINTS_TO_KWD;
  const afterAura = total - memberSavings - pointsCredit;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Aura Cart</h1>
          <p className="mt-1 text-sm text-zinc-500">
            <strong>{items.length}</strong> item{items.length === 1 ? "" : "s"}{" "}
            across <strong>{brandSlugs.length}</strong> Alshaya brand
            {brandSlugs.length === 1 ? "" : "s"}
            {hasFood && hasRetail && " · food + retail"}.
          </p>
        </div>
        <button
          onClick={() => setShowHowItWorks(true)}
          className="text-sm font-medium text-[var(--aura-primary)] hover:underline"
        >
          How Aura Concierge works →
        </button>
      </div>

      {/* Items grouped by brand */}
      <div className="mt-6 space-y-4">
        {brandSlugs.map((slug) => {
          const brandItems = byBrand[slug];
          const subtotal = brandItems.reduce(
            (sum, i) => sum + (i.priceKwd ?? 0) * i.qty,
            0,
          );
          return (
            <section
              key={slug}
              className={`rounded-2xl border px-5 py-4 ${BRAND_COLORS[slug] ?? "border-zinc-200 bg-white"}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">
                  {BRAND_FULL_NAMES[slug] ?? slug} ({brandItems.length} item
                  {brandItems.length === 1 ? "" : "s"})
                </h2>
                <span className="text-sm font-semibold text-zinc-900">
                  {subtotal.toFixed(3)} KWD
                </span>
              </div>
              <ul className="divide-y divide-zinc-200/60">
                {brandItems.map((i) => (
                  <li key={i.productId} className="flex items-center gap-4 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={i.imageUrl}
                      alt={i.title}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                    <div className="flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-zinc-900">
                        {i.title}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Qty {i.qty} · {((i.priceKwd ?? 0) * i.qty).toFixed(3)} KWD
                      </p>
                    </div>
                    <button
                      onClick={() => remove(i.productId)}
                      className="text-xs font-medium text-zinc-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Totals + Aura economics layer + CTA */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">
            Subtotal across {brandSlugs.length} brand
            {brandSlugs.length === 1 ? "" : "s"}
          </div>
          <div className="text-2xl font-bold text-zinc-900">
            {total.toFixed(3)} KWD
          </div>
        </div>

        {/* Aura economics — what makes Wajha-checkout different from Talabat */}
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--aura-primary-dark)]">
            Aura economics applied at checkout
          </div>
          <ul className="space-y-1 text-zinc-700">
            <li className="flex items-center justify-between">
              <span>Member price (10% Aura discount)</span>
              <span className="font-semibold text-emerald-700">
                −{memberSavings.toFixed(3)} KWD
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>
                Points applied{" "}
                <span className="text-xs text-zinc-500">
                  ({POINTS_APPLY.toLocaleString()} of {POINTS_AVAILABLE.toLocaleString()} available)
                </span>
              </span>
              <span className="font-semibold text-emerald-700">
                −{pointsCredit.toFixed(3)} KWD
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>Employee tier</span>
              <span className="text-xs text-zinc-500 italic">
                If applicable · Alshaya sets the rate
              </span>
            </li>
            <li className="mt-2 flex items-center justify-between border-t border-violet-200 pt-2 text-base font-bold text-zinc-900">
              <span>You pay</span>
              <span>{Math.max(0, afterAura).toFixed(3)} KWD</span>
            </li>
          </ul>
        </div>

        {/* Delivery mode — varies by vertical mix */}
        <div className="mt-3 text-xs text-zinc-600">
          {hasFood && hasRetail && (
            <>
              <strong>Two delivery slots, one invoice:</strong> retail items
              consolidate to one Alshaya warehouse parcel · F&amp;B items deliver
              per-restaurant (food physics) · single Aura invoice covers both.
            </>
          )}
          {hasFood && !hasRetail && (
            <>
              <strong>F&amp;B-only cart:</strong> one delivery slot per
              restaurant (food physics — industry norm). Aura Concierge places
              each restaurant order on your behalf.
            </>
          )}
          {!hasFood && hasRetail && (
            <>
              One delivery from Alshaya&apos;s consolidation warehouse · One
              invoice · Returns handled by Aura
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={clear}
            className="text-sm font-medium text-zinc-500 hover:text-red-600"
          >
            Clear cart
          </button>
          <Link
            href="/checkout/concierge"
            className="rounded-full bg-[var(--aura-primary)] px-8 py-3 text-center text-sm font-bold text-white hover:bg-[var(--aura-primary-dark)]"
          >
            Checkout with Aura Concierge →
          </Link>
        </div>
      </section>

      {showHowItWorks && (
        <ConciergeHowItWorks onClose={() => setShowHowItWorks(false)} />
      )}
    </div>
  );
}

function ConciergeHowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-2xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-zinc-900">
            How Aura Concierge works
          </h2>
          <button
            onClick={onClose}
            className="text-2xl text-zinc-400 hover:text-zinc-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <ol className="mt-5 space-y-3 text-sm text-zinc-700">
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
              1
            </span>
            <span>
              You build a multi-brand cart in Wajha — fashion (H&amp;M, Foot
              Locker, Mothercare, BBW) and/or food (Cane&apos;s, Starbucks,
              PF Chang&apos;s, Cheesecake Factory) — and tap{" "}
              <strong>Checkout with Aura Concierge</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
              2
            </span>
            <span>
              Aura charges you <strong>once</strong>. Aura member price, points
              redemption, and the employee discount tier (if applicable) all
              apply at this moment. K-Net OTP arrives on your Aura-registered
              phone — one OTP total.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
              3
            </span>
            <span>
              Aura&apos;s Concierge ops team places each brand order using
              authorised Aura purchasing accounts — same model as a Bergdorf
              or Net-a-Porter personal shopper. Brand-site OTPs go to ops,
              not you.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
              4
            </span>
            <span>
              <strong>Retail items</strong> ship to Alshaya&apos;s consolidation
              warehouse → packed as one parcel → delivered.{" "}
              <strong>F&amp;B items</strong> deliver per-restaurant (food
              physics — hot food stays hot). Both modes ride one Aura invoice.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
              5
            </span>
            <span>
              Returns: contact Aura — ops handles the return on the relevant
              brand site. You never juggle multiple return windows.
            </span>
          </li>
        </ol>
        <div className="mt-6 rounded-lg bg-zinc-100 px-4 py-3 text-xs text-zinc-600">
          <strong>No new brand-side agreements are needed for this model.</strong>{" "}
          Personal-shopper services operate this way in every retail group on
          earth. Aura Concierge is contractually identical to Selfridges Personal
          Shopping, Net-a-Porter Concierge, or any luxury group&apos;s buying-on-behalf service.
        </div>
      </div>
    </div>
  );
}
