import Link from "next/link";

const SCENARIOS = [
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

export default function Home() {
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
          AI-powered shopping discovery across <strong>H&amp;M Kuwait</strong>,{" "}
          <strong>Foot Locker</strong>, <strong>Mothercare</strong>, and{" "}
          <strong>Bath &amp; Body Works</strong> — 673 real SKUs, real Adobe
          AEM imagery, real prices.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-500">
          Toggle <strong>Stage 1 · Pilot</strong> for what we&apos;re proposing
          to ship, or <strong>Stage 2 · Preview</strong> for where the product
          goes once traction proves out (unified cart + Aura Concierge checkout).
        </p>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SCENARIOS.map((s) => (
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

      <section className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
          What this demo is — and is not
        </h3>
        <ul className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
          <li className="flex gap-2">
            <span className="text-emerald-600">✓</span> Real catalog data
            scraped from Alshaya-operated KW storefronts (Adobe AEM Edge)
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600">✓</span> Real CLIP (512-dim)
            image embeddings, real Cohere multilingual (1024-dim) text
            embeddings in Supabase pgvector
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600">✓</span> Real cross-brand kNN
            search via Postgres HNSW indexes
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
