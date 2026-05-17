-- Wajha shopping demo — schema for the `shop` namespace.
-- Idempotent; safe to re-run.
-- Apply via the Supabase SQL editor, or via the supabase MCP server.

create schema if not exists shop;
create extension if not exists vector;

create table if not exists shop.brand (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  slug             text not null unique,
  alshaya_operated boolean default true,
  created_at       timestamptz default now()
);

create table if not exists shop.product (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references shop.brand(id),
  external_id  text not null,
  title        text not null,
  title_ar     text,
  description  text,
  price_kwd    numeric(10,3),
  currency     text default 'KWD',
  category     text,
  subcategory  text,
  color        text,
  image_url    text not null,
  product_url  text not null,
  in_stock     boolean default true,
  scraped_at   timestamptz default now(),
  unique (brand_id, external_id)
);

create table if not exists shop.product_embedding (
  product_id      uuid primary key references shop.product(id) on delete cascade,
  image_embedding vector(512),     -- CLIP ViT-B/32
  text_embedding  vector(1024),    -- Cohere embed-multilingual-v3
  updated_at      timestamptz default now()
);

-- HNSW indexes for fast kNN
create index if not exists product_embedding_image_hnsw
  on shop.product_embedding using hnsw (image_embedding vector_cosine_ops);

create index if not exists product_embedding_text_hnsw
  on shop.product_embedding using hnsw (text_embedding vector_cosine_ops);

-- Full-text search index for hybrid keyword + vector search
create index if not exists product_fts_idx
  on shop.product using gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  );

-- Helpful supporting indexes
create index if not exists product_brand_id_idx on shop.product (brand_id);
create index if not exists product_category_idx on shop.product (category);
