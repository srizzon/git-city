-- ============================================================
-- Migration 083: Make pants and shoes free (every player needs them)
-- Also grant these to all existing players
-- ============================================================

UPDATE arcade_shop_items SET rarity = 'free', price_px = 0 WHERE id = 'pants';
UPDATE arcade_shop_items SET rarity = 'free', price_px = 0 WHERE id = 'shoes';

-- Grant to all players who have a wallet but don't own these yet
INSERT INTO arcade_inventory (developer_id, item_id)
SELECT d.id, si.id
FROM developers d
CROSS JOIN arcade_shop_items si
WHERE si.id IN ('pants', 'shoes')
  AND EXISTS (SELECT 1 FROM wallets w WHERE w.developer_id = d.id)
ON CONFLICT (developer_id, item_id) DO NOTHING;
