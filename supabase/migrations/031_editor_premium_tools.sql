-- Premium tools for 3D building editor
-- One-time unlocks (permanent ownership via purchases table)

insert into items (id, category, name, description, price_usd_cents, price_brl_cents, zone, metadata)
values
  (
    'editor_text_tool',
    'identity',
    'Editor Text Tool',
    'Unlock text writer in the 3D building editor (permanent).',
    200,
    990,
    'faces',
    '{"feature":"editor_text","one_time_unlock":true}'::jsonb
  ),
  (
    'editor_image_tool',
    'identity',
    'Editor Image Tool',
    'Unlock facade image upload in the 3D building editor (permanent).',
    500,
    2490,
    'faces',
    '{"feature":"editor_image","one_time_unlock":true}'::jsonb
  )
on conflict (id) do update
set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  price_usd_cents = excluded.price_usd_cents,
  price_brl_cents = excluded.price_brl_cents,
  zone = excluded.zone,
  metadata = excluded.metadata,
  is_active = true;
