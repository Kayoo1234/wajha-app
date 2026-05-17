"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCart, type CartItem } from "@/lib/stores";
import { BRAND_FULL_NAMES } from "@/lib/api";

type Step = {
  label: string;
  detail: string;
  done: boolean;
  active: boolean;
};

export default function SuccessPage() {
  const items = useCart((s) => s.items);
  // Derive from items so Zustand selectors don't loop on fresh-object returns.
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
  const [orderId] = useState(() => `A${Math.floor(Math.random() * 90000) + 10000}`);
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => setHydrated(true), []);

  // Auto-advance mock timeline once on mount
  useEffect(() => {
    if (!hydrated) return;
    const timers: NodeJS.Timeout[] = [];
    for (let i = 1; i <= 4; i++) {
      timers.push(setTimeout(() => setStepIndex(i), i * 1200));
    }
    return () => timers.forEach(clearTimeout);
  }, [hydrated]);

  if (!hydrated) return <div className="p-12 text-center text-zinc-500">Loading…</div>;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">No active order</h1>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-[var(--aura-primary)] underline"
        >
          ← Back to home
        </Link>
      </div>
    );
  }

  const brandSlugs = Object.keys(byBrand);
  const grandTotal = total + 2.0;

  const baseSteps: Omit<Step, "done" | "active">[] = [
    {
      label: "Order received",
      detail: `Aura received your order for ${items.length} items across ${brandSlugs.length} brands. Payment captured (demo).`,
    },
    {
      label: "Concierge accepted",
      detail: `Aura Concierge ops have queued ${brandSlugs.length} separate brand orders for fulfilment.`,
    },
    {
      label: "Procuring from brands",
      detail: brandSlugs.map((s) => BRAND_FULL_NAMES[s] ?? s).join(" · "),
    },
    {
      label: "Consolidating at Alshaya warehouse",
      detail: "All items received in Kuwait warehouse, packing into one parcel.",
    },
    {
      label: "Out for delivery",
      detail: "Your unified parcel ships today. Tracking link will follow.",
    },
  ];

  const steps: Step[] = baseSteps.map((s, i) => ({
    ...s,
    done: i < stepIndex,
    active: i === stepIndex,
  }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-center">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          ✓
        </div>
        <h1 className="mt-4 text-3xl font-bold text-zinc-900">
          Your Aura Concierge is on it
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Order <strong className="text-zinc-900">#{orderId}</strong> · placed
          across <strong className="text-zinc-900">{brandSlugs.length}</strong>{" "}
          Alshaya brands · estimated delivery in{" "}
          <strong className="text-zinc-900">2–4 business days</strong>.
        </p>
      </div>

      {/* Timeline */}
      <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
          Concierge status
        </h2>
        <ol className="mt-4 space-y-4">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-4">
              <div
                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  s.done
                    ? "bg-emerald-500 text-white"
                    : s.active
                    ? "bg-[var(--aura-primary)] text-white"
                    : "bg-zinc-200 text-zinc-500"
                }`}
              >
                {s.done ? "✓" : i + 1}
                {i < steps.length - 1 && (
                  <span
                    className={`absolute left-1/2 top-full h-4 w-0.5 -translate-x-1/2 ${
                      s.done ? "bg-emerald-500" : "bg-zinc-200"
                    }`}
                  />
                )}
              </div>
              <div className="flex-1">
                <div
                  className={`text-sm font-semibold ${
                    s.done || s.active ? "text-zinc-900" : "text-zinc-400"
                  }`}
                >
                  {s.label}
                  {s.active && (
                    <span className="ml-2 inline-block text-xs font-medium text-[var(--aura-primary)]">
                      in progress…
                    </span>
                  )}
                </div>
                <div
                  className={`mt-0.5 text-xs ${
                    s.done || s.active ? "text-zinc-600" : "text-zinc-400"
                  }`}
                >
                  {s.detail}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Mock unified invoice */}
      <section className="mt-6 rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Aura unified invoice</h2>
            <p className="text-xs text-zinc-500">
              One invoice across {brandSlugs.length} brands · {items.length} items
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-zinc-400">
              Invoice
            </div>
            <div className="font-mono text-sm text-zinc-900">#{orderId}</div>
          </div>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="py-2">Brand</th>
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((i) => (
              <tr key={i.productId}>
                <td className="py-2 text-xs text-zinc-500">
                  {BRAND_FULL_NAMES[i.brandSlug] ?? i.brandSlug}
                </td>
                <td className="py-2 text-zinc-900">{i.title}</td>
                <td className="py-2 text-right text-zinc-700">{i.qty}</td>
                <td className="py-2 text-right font-medium text-zinc-900">
                  {((i.priceKwd ?? 0) * i.qty).toFixed(3)} KWD
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr>
              <td colSpan={3} className="pt-3 text-right text-zinc-600">
                Subtotal
              </td>
              <td className="pt-3 text-right text-zinc-900">{total.toFixed(3)} KWD</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-zinc-600">
                Aura Concierge fee
              </td>
              <td className="text-right text-zinc-900">2.000 KWD</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-zinc-600">
                Consolidated delivery
              </td>
              <td className="text-right text-emerald-700">Included</td>
            </tr>
            <tr className="text-base font-bold">
              <td colSpan={3} className="pt-3 text-right text-zinc-900">
                Total
              </td>
              <td className="pt-3 text-right text-zinc-900">
                {grandTotal.toFixed(3)} KWD
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-4 text-[11px] text-zinc-400">
          This unified invoice replaces {brandSlugs.length} separate
          brand-checkout receipts the member would have received pre-Aura. One
          payment, one tax line, one return contact.
        </p>
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 hover:text-[var(--aura-primary)]"
        >
          ← Back to home
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-full border border-zinc-300 bg-white px-6 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          Print / save invoice as PDF
        </button>
      </div>
    </div>
  );
}
