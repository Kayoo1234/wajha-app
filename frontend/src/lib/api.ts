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
};

export const BRAND_FULL_NAMES: Record<string, string> = {
  hm: "H&M Kuwait",
  bath_body_works: "Bath & Body Works Kuwait",
  footlocker: "Foot Locker Kuwait",
  mothercare: "Mothercare Kuwait",
};

// Bucket labels for complete-the-look (matches backend bucket names)
export const BUCKET_LABELS: Record<string, string> = {
  apparel: "Apparel",
  beauty: "Beauty",
  footwear: "Footwear",
  family: "Family",
};
