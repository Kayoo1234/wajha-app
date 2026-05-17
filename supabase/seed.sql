-- Seed the 4 demo brands.
-- Idempotent; safe to re-run.
--
-- Brand-list history:
--   2026-05-16: dropped 'american_eagle' (no Kuwait e-com — brick-and-mortar only)
--               dropped 'pottery_barn'   (permanently closed in Kuwait)
--   Replacements: 'footlocker' (sneakers vertical), 'mothercare' (baby/kids vertical).

insert into shop.brand (name, slug, alshaya_operated) values
  ('H&M Kuwait',                'hm',              true),
  ('Foot Locker Kuwait',        'footlocker',      true),
  ('Mothercare Kuwait',         'mothercare',      true),
  ('Bath & Body Works Kuwait',  'bath_body_works', true)
on conflict (slug) do nothing;
