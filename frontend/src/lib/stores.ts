"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "./api";

// ---------------------------------------------------------------------------
// Stage toggle — Stage 1 (default, recommendation cards) vs Stage 2 (preview,
// unified cross-brand grid + Aura cart). Persists in localStorage so a demo
// reload keeps the user in the same view.
// ---------------------------------------------------------------------------
export type Stage = 1 | 2;

type StageState = {
  stage: Stage;
  setStage: (s: Stage) => void;
  toggle: () => void;
};

export const useStage = create<StageState>()(
  persist(
    (set) => ({
      stage: 1,
      setStage: (s) => set({ stage: s }),
      toggle: () =>
        set((state) => ({ stage: (state.stage === 1 ? 2 : 1) as Stage })),
    }),
    { name: "wajha.stage" },
  ),
);

// ---------------------------------------------------------------------------
// Aura Concierge cart — Stage 2 only. Items grouped by brand at /cart.
// Persists so a refresh during demo doesn't lose the cart.
// ---------------------------------------------------------------------------
export type CartItem = {
  productId: string;
  brandSlug: string;
  brandName: string;
  title: string;
  priceKwd: number | null;
  imageUrl: string;
  productUrl: string;
  qty: number;
};

type CartState = {
  items: CartItem[];
  add: (p: Product) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: () => number;
  total: () => number;
  byBrand: () => Record<string, CartItem[]>;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (p) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === p.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === p.id ? { ...i, qty: i.qty + 1 } : i,
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                productId: p.id,
                brandSlug: p.brand_slug,
                brandName: p.brand_name,
                title: p.title,
                priceKwd: p.price_kwd ?? null,
                imageUrl: p.image_url,
                productUrl: p.product_url,
                qty: 1,
              },
            ],
          };
        }),
      remove: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        })),
      clear: () => set({ items: [] }),
      count: () => get().items.reduce((n, i) => n + i.qty, 0),
      total: () =>
        get().items.reduce(
          (sum, i) => sum + (i.priceKwd ?? 0) * i.qty,
          0,
        ),
      byBrand: () =>
        get().items.reduce<Record<string, CartItem[]>>((acc, i) => {
          (acc[i.brandSlug] ||= []).push(i);
          return acc;
        }, {}),
    }),
    { name: "wajha.cart" },
  ),
);
