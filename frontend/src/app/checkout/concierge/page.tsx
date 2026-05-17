"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCart, type CartItem } from "@/lib/stores";
import { BRAND_FULL_NAMES } from "@/lib/api";

export default function ConciergeConfirmationPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  // Derive from items so Zustand's reference-equality check doesn't loop on
  // selectors that return fresh objects each call.
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
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!hydrated) return <div className="p-12 text-center text-zinc-500">Loading…</div>;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">Cart is empty</h1>
        <Link
          href="/text-search"
          className="mt-4 inline-block text-sm text-[var(--aura-primary)] underline"
        >
          ← Back to search
        </Link>
      </div>
    );
  }

  const brandSlugs = Object.keys(byBrand);
  const conciergeFee = 2.0;
  const grandTotal = total + conciergeFee;

  function placeOrder() {
    setSubmitting(true);
    // Mock — simulate a brief network latency, then redirect to success.
    setTimeout(() => router.push("/checkout/success"), 900);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/cart"
        className="text-sm font-medium text-zinc-500 hover:text-[var(--aura-primary)]"
      >
        ← Back to cart
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">
        Confirm Aura Concierge checkout
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Aura places each brand order on your behalf, consolidates the delivery,
        and sends one unified invoice. You pay Aura once below.
      </p>

      {/* What happens next */}
      <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm text-[var(--aura-primary-dark)]">
        <h2 className="font-bold">What happens after you tap “Place order”</h2>
        <ol className="mt-2 space-y-1.5 text-[13px]">
          <li>
            <strong>1.</strong> Aura charges your registered K-Net card{" "}
            <strong>{grandTotal.toFixed(3)} KWD</strong>. One OTP, sent to your
            Aura-registered phone.
          </li>
          <li>
            <strong>2.</strong> Aura Concierge ops places{" "}
            <strong>{brandSlugs.length}</strong> separate orders on your behalf
            using authorised purchasing accounts on each brand&apos;s site.
            Brand-side OTPs go to the ops team — not to you.
          </li>
          <li>
            <strong>3.</strong> Each brand ships to Alshaya&apos;s consolidation
            warehouse. Aura logistics packs them into{" "}
            <strong>one parcel</strong> and delivers within{" "}
            <strong>2-4 business days</strong>.
          </li>
          <li>
            <strong>4.</strong> Returns: contact Aura — we handle each brand&apos;s
            return policy on your behalf. You never juggle multiple windows.
          </li>
        </ol>
      </section>

      {/* Order summary */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-bold text-zinc-900">Order summary</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {brandSlugs.map((slug) => {
            const brandItems = byBrand[slug];
            const subtotal = brandItems.reduce(
              (s, i) => s + (i.priceKwd ?? 0) * i.qty,
              0,
            );
            return (
              <li
                key={slug}
                className="flex items-center justify-between border-b border-zinc-100 py-2 last:border-0"
              >
                <span className="text-zinc-700">
                  {BRAND_FULL_NAMES[slug] ?? slug} · {brandItems.length} item
                  {brandItems.length === 1 ? "" : "s"}
                </span>
                <span className="font-semibold text-zinc-900">
                  {subtotal.toFixed(3)} KWD
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between text-zinc-600">
            <span>Cart subtotal</span>
            <span>{total.toFixed(3)} KWD</span>
          </div>
          <div className="flex justify-between text-zinc-600">
            <span>Aura Concierge service fee</span>
            <span>{conciergeFee.toFixed(3)} KWD</span>
          </div>
          <div className="flex justify-between text-zinc-600">
            <span>Consolidated delivery</span>
            <span className="text-emerald-700">Included</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-3 text-base font-bold text-zinc-900">
            <span>Total</span>
            <span>{grandTotal.toFixed(3)} KWD</span>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <strong>DEMO MODE.</strong> No payment is captured. No real orders are
        placed on any brand site. The success screen on the next page is
        illustrative of the unified-invoice and delivery-tracking UX.
      </section>

      <button
        onClick={placeOrder}
        disabled={submitting}
        className="mt-6 w-full rounded-full bg-[var(--aura-primary)] px-8 py-4 text-base font-bold text-white shadow-md transition hover:bg-[var(--aura-primary-dark)] disabled:opacity-50"
      >
        {submitting ? "Placing order…" : `Place order · ${grandTotal.toFixed(3)} KWD`}
      </button>
    </div>
  );
}
