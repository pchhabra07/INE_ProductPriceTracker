-- Run this migration in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Adds the notifications table for price-drop and back-in-stock in-app alerts

create table if not exists notifications (
  id                  uuid primary key default gen_random_uuid(),
  tracked_product_id  uuid        not null references tracked_products(id) on delete cascade,
  type                text        not null,   -- 'price_drop' | 'back_in_stock' | 'structure_changed'
  message             text        not null,
  old_value           text,                   -- previous price or stock value
  new_value           text,                   -- new price or stock value
  is_read             boolean     not null default false,
  created_at          timestamptz not null default now()
);

-- Fast lookup: unread notifications ordered newest first
create index if not exists idx_notifications_unread
  on notifications(is_read, created_at desc);

-- Fast lookup: all notifications for a specific product
create index if not exists idx_notifications_product
  on notifications(tracked_product_id, created_at desc);
