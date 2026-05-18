// Typed client for the Wajha FastAPI backend.
// Backend on http://127.0.0.1:8000 by default (configurable via NEXT_PUBLIC_API_BASE).

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export type Brand = {
  id: string;
  name: string;
  slug: string;
  product_count: number;
};

export type Product = {
  id: string;
  brand_slug: string;
  brand_name: string;
  external_id: string;
  title: string;
  title_ar?: string | null;
  description?: string | null;
  price_kwd?: number | null;
  currency: string;
  category?: string | null;
  subcategory?: string | null;
  color?: string | null;
  image_url: string;
  product_url: string;
  in_stock: boolean;
};

export type SearchHit = Product & {
  similarity: number;
  rank: number;
};

export type SearchResponse = {
  hits: SearchHit[];
  total: number;
};

export type CompleteTheLookResponse = {
  source: Product;
  apparel: SearchHit[];
  beauty: SearchHit[];
  footwear: SearchHit[];
  family: SearchHit[];
};

export type Intent = {
  query_cleaned: string;
  category: string | null;
  color: string | null;
  brand: string | null;
  gender: "men" | "women" | "unisex" | null;
  audience: "adult" | "kids" | "baby" | null;
  max_price_kwd: number | null;
  min_price_kwd: number | null;
  intent: "specific_search" | "browse" | "discounted" | "visual_similarity";
};

export type SmartSearchResponse = {
  intent: Intent;
  hits: SearchHit[];
  total: number;
  notes: string[];
};

// 20s client-side timeout — guards against a hung backend / network blip
// from leaving the UI in a perpetual spinner. The backend already has its
// own LLM timeouts; this is just the last line of defense for the user.
const CLIENT_TIMEOUT_MS = 20_000;

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`${path} → ${r.status} ${text}`);
    }
    return r.json() as Promise<T>;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`${path} timed out after ${CLIENT_TIMEOUT_MS / 1000}s — try again`);
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

async function getJSON<T>(path: string): Promise<T> {
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const r = await fetch(`${API_BASE}${path}`, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${path} → ${r.status}`);
    return r.json() as Promise<T>;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`${path} timed out after ${CLIENT_TIMEOUT_MS / 1000}s — try again`);
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

export const api = {
  brands: () => getJSON<Brand[]>("/brands"),
  product: (id: string) => getJSON<Product>(`/products/${id}`),

  textSearch: (params: {
    query: string;
    lang?: "en" | "ar";
    limit?: number;
    brand_filter?: string[] | null;
    max_price_kwd?: number | null;
    category_filter?: string | null;
  }) => postJSON<SearchResponse>("/search/text", params),

  smartSearch: (params: {
    query: string;
    lang?: "en" | "ar";
    limit?: number;
    anchor_product_id?: string | null;
  }) => postJSON<SmartSearchResponse>("/search/smart", params),

  visualSearchByProduct: (params: {
    product_id: string;
    limit?: number;
    exclude_same_brand?: boolean;
  }) => postJSON<SearchResponse>("/search/visual", params),

  visualSearchByImage: (params: { image_base64: string; limit?: number }) =>
    postJSON<SearchResponse>("/search/visual", params),

  completeTheLook: (params: { product_id: string; limit_per_category?: number }) =>
    postJSON<CompleteTheLookResponse>("/search/complete_the_look", params),
};

// Brand display helpers
export const BRAND_LABELS: Record<string, string> = {
  hm: "H&M",
  bath_body_works: "BBW",
  footlocker: "Foot Locker",
  mothercare: "Mothercare",
  raising_canes: "Raising Cane's",
  starbucks: "Starbucks",
  pf_changs: "P.F. Chang's",
  cheesecake_factory: "Cheesecake Factory",
};

export const BRAND_FULL_NAMES: Record<string, string> = {
  hm: "H&M Kuwait",
  bath_body_works: "Bath & Body Works Kuwait",
  footlocker: "Foot Locker Kuwait",
  mothercare: "Mothercare Kuwait",
  raising_canes: "Raising Cane's Kuwait",
  starbucks: "Starbucks Kuwait",
  pf_changs: "P.F. Chang's Kuwait",
  cheesecake_factory: "The Cheesecake Factory Kuwait",
};

// Vertical → brand slugs. Used by the food page to client-side post-filter
// /search/smart results to the food vertical without a backend change.
export const FOOD_BRAND_SLUGS = [
  "raising_canes",
  "starbucks",
  "pf_changs",
  "cheesecake_factory",
];
export const FASHION_BRAND_SLUGS = [
  "hm",
  "footlocker",
  "mothercare",
  "bath_body_works",
];

// Curated craving moods for the Food tab. Each maps to a search query, a
// UI accent, and a TITLE-EXCLUDE list. The excludes are critical — Cohere
// embeddings put "hot chocolate" near "spicy hot chili" because they share
// the "hot" token, and without explicit exclude rules, Spicy results
// surface sweet drinks.
//
// Queries re-tuned 2026-05-18 for the 104-item food catalog (Cane's +
// Starbucks + PF Chang's + Cheesecake Factory). Each query now leans into
// 2-3 items we KNOW match the mood semantically — gives Cohere stronger
// anchor points than generic mood words.
export const CRAVING_MOODS = [
  {
    key: "spicy",
    label: "Spicy",
    emoji: "🌶",
    // Anchor items: Kung Pao Chicken, Buffalo Wings, Cajun Jambalaya,
    // Spicy Chicken, Hot & Sour Soup, Dynamite Shrimp.
    query: "spicy chili pepper kung pao buffalo cajun jambalaya sichuan",
    excludes: ["chocolate", "caramel", "sweet", "vanilla", "cream", "cookie", "muffin", "cheesecake", "frappuccino", "lemonade", "macchiato", "latte", "iced tea", "iced green"],
    accent: "bg-red-100 text-red-700 ring-red-200",
  },
  {
    key: "comfort",
    label: "Comfort",
    emoji: "🍔",
    // Anchor items: Burgers, Mac & Cheese, Pasta Carbonara, Alfredo,
    // Mashed Potatoes, Chicken Marsala.
    query: "comfort burger mac cheese pasta alfredo mashed potato hearty",
    excludes: ["water", "lemonade", "iced tea", "refresher", "salad", "cheesecake", "cookie"],
    accent: "bg-amber-100 text-amber-700 ring-amber-200",
  },
  {
    key: "light",
    label: "Light",
    emoji: "🥗",
    // Anchor items: Salads, Asparagus, Green Beans, Iced Green Tea,
    // Refreshers.
    query: "light fresh salad asparagus green beans iced tea refresher",
    excludes: ["frappuccino", "brownie", "cheesecake", "fries", "tailgate", "100", "50", "25", "hot chocolate", "burger", "pasta", "pizza", "combo"],
    accent: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  },
  {
    key: "sweet",
    label: "Sweet",
    emoji: "🍰",
    // Anchor items: Cheesecakes, Banana Spring Rolls, Frappuccinos,
    // Hot Chocolate, Strawberry Lemonade.
    query: "sweet dessert cheesecake chocolate frappuccino strawberry banana",
    excludes: ["chicken", "sandwich", "panini", "fries", "coleslaw", "americano", "espresso", "salad", "burger", "pasta", "pizza", "shrimp", "beef", "wings"],
    accent: "bg-pink-100 text-pink-700 ring-pink-200",
  },
  {
    key: "cold",
    label: "Cold drink",
    emoji: "🥤",
    // Anchor items: Iced Latte, Cold Brew, Frappuccinos, Refreshers,
    // Lemonade, Iced Tea.
    query: "iced cold brew frappuccino refresher lemonade chilled drink",
    excludes: ["hot", "warm", "croissant", "sandwich", "panini", "fries", "coleslaw", "cookie", "muffin", "cheesecake", "combo", "tailgate", "finger", "toast", "burger", "pasta", "pizza", "salad", "wings"],
    accent: "bg-sky-100 text-sky-700 ring-sky-200",
  },
] as const;

// Bucket labels for complete-the-look (matches backend bucket names)
export const BUCKET_LABELS: Record<string, string> = {
  apparel: "Apparel",
  beauty: "Beauty",
  footwear: "Footwear",
  family: "Family",
};
