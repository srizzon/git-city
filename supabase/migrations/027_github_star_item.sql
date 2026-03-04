-- GitHub Star exclusive item (crown zone, free, unlocked by starring the repo)
INSERT INTO items (id, category, name, description, price_usd_cents, price_brl_cents, is_exclusive, is_active, zone)
VALUES ('github_star', 'crown', 'GitHub Star', 'Star the repo to unlock this exclusive crown item.', 0, 0, true, true, 'crown')
ON CONFLICT (id) DO NOTHING;
