-- ============================================================
-- Migration 082: Reclassify clothes — no item is truly "full outfit"
-- All clothes in the Cozy People pack are shirt overlays (waist area).
-- Players always need shirt + pants + shoes for a complete look.
-- Costumes are still separate (full body coverage: clown, witch, etc.)
-- ============================================================

-- Move "full" items to "top" (they're just shirts with different styles)
UPDATE arcade_shop_items SET slot = 'top', tags = array_replace(tags, 'full', 'top')
WHERE id IN ('overalls', 'sporty', 'suit', 'dress', 'floral', 'sailor', 'sailor_bow', 'suit_tie')
  AND slot = 'full';

-- Keep costumes as costumes — these DO cover more of the body
-- (clown_blue, clown_red, spooky, witch, pumpkin stay as 'costume')
