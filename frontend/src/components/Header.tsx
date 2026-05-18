"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStage, useCart } from "@/lib/stores";
import { useEffect, useState } from "react";

// Two-vertical navigation. The nav has exactly TWO items — Fashion and
// Food & Beverage — matching the home page's vertical-toggle mental
// model. Each vertical's pill activates on any of its sub-routes so
// the user always sees where they are in the hierarchy.
const FASHION_PATHS = ["/", "/text-search", "/visual-search", "/complete-the-look"];
const FOOD_PATHS = ["/food"];

function isPathIn(pathname: string | null, paths: string[]): boolean {
  if (!pathname) return false;
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function NavPill({
  href,
  matchPaths,
  children,
}: {
  href: string;
  matchPaths: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isPathIn(pathname, matchPaths);
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-[var(--aura-primary)] text-white"
          : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"
      }`}
    >
      {children}
    </Link>
  );
}

function StageToggle() {
  const stage = useStage((s) => s.stage);
  const setStage = useStage((s) => s.setStage);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <div
      className="relative flex items-center rounded-full bg-zinc-100 p-1 text-xs font-semibold"
      title="Switch between the pilot UX (Stage 1) and the unified-experience preview (Stage 2)"
    >
      <button
        onClick={() => setStage(1)}
        className={`relative z-10 rounded-full px-3 py-1.5 transition-colors ${
          hydrated && stage === 1
            ? "bg-white text-zinc-900 shadow-sm"
            : "text-zinc-500"
        }`}
      >
        Stage 1 · Pilot
      </button>
      <button
        onClick={() => setStage(2)}
        className={`relative z-10 rounded-full px-3 py-1.5 transition-colors ${
          hydrated && stage === 2
            ? "bg-[var(--aura-primary)] text-white shadow-sm"
            : "text-zinc-500"
        }`}
      >
        Stage 2 · Preview
      </button>
    </div>
  );
}

function CartIcon() {
  const count = useCart((s) => s.count());
  const stage = useStage((s) => s.stage);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Cart is a Stage-2-only concept (Concierge). Don't show in Stage 1.
  if (!hydrated || stage !== 2) return null;

  return (
    <Link
      href="/cart"
      className="relative inline-flex items-center justify-center rounded-full bg-[var(--aura-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--aura-primary-dark)]"
      aria-label="Aura Concierge cart"
    >
      <span>Aura Cart</span>
      {count > 0 && (
        <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-300 px-1.5 text-[11px] font-bold text-zinc-900">
          {count}
        </span>
      )}
    </Link>
  );
}

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--aura-primary)] to-[var(--aura-primary-dark)] text-white font-bold">
            A
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold text-zinc-900">
              Aura <span className="text-zinc-400">•</span>{" "}
              <span className="text-[var(--aura-primary)]">Discover</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              powered by Wajha
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <NavPill href="/" matchPaths={FASHION_PATHS}>
            Fashion
          </NavPill>
          <NavPill href="/food" matchPaths={FOOD_PATHS}>
            <span className="inline-flex items-center gap-1.5">
              <span>Food &amp; Beverage</span>
              <span className="rounded-full bg-emerald-100 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                new
              </span>
            </span>
          </NavPill>
        </nav>

        <div className="flex items-center gap-3">
          <StageToggle />
          <CartIcon />
        </div>
      </div>
    </header>
  );
}
