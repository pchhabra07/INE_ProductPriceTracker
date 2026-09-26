-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)

-- 1. tracked_products table
create table if not exists tracked_products (
  id               uuid primary key default gen_random_uuid(),
  store_product_id text        not null,
  product_name     text        not null,
  option_name      text        not null,
  option_index     int         not null,          -- 1-based; used by scraper to select the right chip
  store_url        text        not null,
  department       text,
  brand            text,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),

  unique (store_product_id, option_name)           -- idempotent track
);

-- 2. price_history table
create table if not exists price_history (
  id                  uuid primary key default gen_random_uuid(),
  tracked_product_id  uuid        not null references tracked_products(id) on delete cascade,
  price               numeric,                     -- null on failed scrape
  stock               text,                        -- null on failed scrape
  scraped_at          timestamptz not null default now(),
  outcome             text        not null,         -- 'success' | 'retried' | 'failed'
  attempt_count       int         not null,
  error_message       text                         -- null on success
);

-- Index for fast per-product history lookups
create index if not exists idx_price_history_tracked_product
  on price_history(tracked_product_id, scraped_at desc);
