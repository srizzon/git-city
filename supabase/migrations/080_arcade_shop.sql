-- ============================================================
-- Migration 080: Arcade Shop — Items, Inventory & Avatar
-- Safe to run multiple times (IF NOT EXISTS + ON CONFLICT)
-- ============================================================

-- 1. Shop items catalog
CREATE TABLE IF NOT EXISTS arcade_shop_items (
  id             text PRIMARY KEY,
  category       text NOT NULL CHECK (category IN ('hair', 'clothes', 'acc', 'eyes', 'pets')),
  name           text NOT NULL,
  file           text,            -- sprite path relative to storage base (null for 'bald')
  rarity         text NOT NULL CHECK (rarity IN ('free', 'common', 'rare', 'epic', 'legendary')),
  price_px       integer NOT NULL DEFAULT 0 CHECK (price_px >= 0),
  default_color  text,            -- hex color for tinting (null = no tint / pre-colored)
  no_tint        boolean NOT NULL DEFAULT false,
  tags           text[] NOT NULL DEFAULT '{}',
  slot           text NOT NULL CHECK (slot IN (
    'hair', 'top', 'bottom', 'full', 'shoes', 'costume',
    'hat', 'face', 'facial', 'mask', 'jewelry',
    'eyes', 'blush', 'lipstick',
    'pet'
  )),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_items_category ON arcade_shop_items(category);
CREATE INDEX IF NOT EXISTS idx_shop_items_rarity ON arcade_shop_items(rarity);
CREATE INDEX IF NOT EXISTS idx_shop_items_slot ON arcade_shop_items(slot);

ALTER TABLE arcade_shop_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone can read shop items" ON arcade_shop_items FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Player inventory (purchased items)
CREATE TABLE IF NOT EXISTS arcade_inventory (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id   bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  item_id        text NOT NULL REFERENCES arcade_shop_items(id),
  purchased_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(developer_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_developer ON arcade_inventory(developer_id);

ALTER TABLE arcade_inventory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Players can read own inventory" ON arcade_inventory
    FOR SELECT USING (developer_id = (SELECT id FROM developers WHERE claimed_by = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Player avatar loadout (new system — arcade_avatars kept for backwards compat)
-- Old arcade_avatars has 956 rows with { sprite_id: 0-5 }, keyed by user_id uuid.
-- New table keyed by developer_id with full slot system.
CREATE TABLE IF NOT EXISTS arcade_avatar_loadouts (
  developer_id      bigint PRIMARY KEY REFERENCES developers(id) ON DELETE CASCADE,
  skin_color        text NOT NULL DEFAULT '#e8c4a0',
  hair_id           text REFERENCES arcade_shop_items(id),
  hair_color        text,
  clothes_top_id    text REFERENCES arcade_shop_items(id),
  clothes_top_color text,
  clothes_bottom_id text REFERENCES arcade_shop_items(id),
  clothes_bottom_color text,
  clothes_full_id   text REFERENCES arcade_shop_items(id),
  clothes_full_color text,
  shoes_id          text REFERENCES arcade_shop_items(id),
  shoes_color       text,
  acc_hat_id        text REFERENCES arcade_shop_items(id),
  acc_hat_color     text,
  acc_face_id       text REFERENCES arcade_shop_items(id),
  acc_face_color    text,
  acc_facial_id     text REFERENCES arcade_shop_items(id),
  acc_facial_color  text,
  acc_jewelry_id    text REFERENCES arcade_shop_items(id),
  acc_jewelry_color text,
  eyes_color        text DEFAULT '#4a3728',
  blush_id          text REFERENCES arcade_shop_items(id),
  blush_color       text,
  lipstick_id       text REFERENCES arcade_shop_items(id),
  lipstick_color    text,
  pet_id            text REFERENCES arcade_shop_items(id),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE arcade_avatar_loadouts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Players can read own loadout" ON arcade_avatar_loadouts
    FOR SELECT USING (developer_id = (SELECT id FROM developers WHERE claimed_by = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Seed shop items (ON CONFLICT = safe to re-run, updates existing items)
INSERT INTO arcade_shop_items (id, category, name, file, rarity, price_px, default_color, no_tint, tags, slot) VALUES
  -- Hair
  ('bob',                'hair',    'Bob',                  'hair/bob_grey.png',              'common',    75,   '#8B4513', false, '{short}',        'hair'),
  ('braids',             'hair',    'Braids',               'hair/braids_grey.png',           'common',    75,   '#2c1810', false, '{long}',         'hair'),
  ('bald',               'hair',    'Bald',                 NULL,                             'free',      0,    NULL,      false, '{short}',        'hair'),
  ('buzzcut',            'hair',    'Buzzcut',              'hair/buzzcut_grey.png',          'free',      0,    '#1a1a1a', false, '{short}',        'hair'),
  ('curly',              'hair',    'Curly',                'hair/curly_grey.png',            'free',      0,    '#8B4513', false, '{short}',        'hair'),
  ('emo',                'hair',    'Emo',                  'hair/emo_grey.png',              'rare',      200,  '#1a1a1a', false, '{short,edgy}',   'hair'),
  ('extra_long',         'hair',    'Extra Long',           'hair/extra_long_grey.png',       'rare',      150,  '#D2691E', false, '{long}',         'hair'),
  ('extra_long_skirt',   'hair',    'Extra Long (Skirt)',   'hair/extra_long_skirt_grey.png', 'rare',      150,  '#D2691E', false, '{long}',         'hair'),
  ('french_curl',        'hair',    'French Curl',          'hair/french_curl_grey.png',      'rare',      250,  '#4a3728', false, '{short}',        'hair'),
  ('gentleman',          'hair',    'Gentleman',            'hair/gentleman_grey.png',        'free',      0,    '#2c1810', false, '{short,formal}', 'hair'),
  ('long_straight',      'hair',    'Long Straight',        'hair/long_straight_grey.png',    'common',    75,   '#D2691E', false, '{long}',         'hair'),
  ('long_straight_skirt','hair',    'Long Straight (Skirt)','hair/long_straight_skirt_grey.png','common',  75,   '#D2691E', false, '{long}',         'hair'),
  ('midiwave',           'hair',    'Midi Wave',            'hair/midiwave_grey.png',         'rare',      150,  '#8B4513', false, '{long}',         'hair'),
  ('ponytail',           'hair',    'Ponytail',             'hair/ponytail_grey.png',         'free',      0,    '#FFD700', false, '{long}',         'hair'),
  ('spacebuns',          'hair',    'Space Buns',           'hair/spacebuns_grey.png',        'epic',      400,  '#FF69B4', false, '{short,edgy}',   'hair'),
  ('wavy',               'hair',    'Wavy',                 'hair/wavy_grey.png',             'common',    75,   '#4a3728', false, '{long}',         'hair'),
  -- Clothes: Tops
  ('basic',              'clothes', 'Basic Tee',            'clothes/basic_grey.png',         'free',      0,    '#4a9eff', false, '{casual,top}',   'top'),
  ('spaghetti',          'clothes', 'Spaghetti Top',        'clothes/spaghetti_grey.png',     'common',    75,   '#f5d5b8', false, '{casual,top}',   'top'),
  ('stripe',             'clothes', 'Stripe',               'clothes/stripe_grey.png',        'rare',      150,  '#9b59b6', false, '{casual,top}',   'top'),
  ('skull',              'clothes', 'Skull Tee',            'clothes/skull_grey.png',         'epic',      400,  '#1a1a1a', false, '{edgy,top}',     'top'),
  -- Clothes: Bottoms
  ('pants',              'clothes', 'Pants',                'clothes/pants_grey.png',         'common',    50,   '#2c3e50', false, '{casual,bottom}','bottom'),
  ('skirt',              'clothes', 'Skirt',                'clothes/skirt_grey.png',         'common',    75,   '#9b59b6', false, '{casual,bottom}','bottom'),
  ('pants_suit',         'clothes', 'Suit Pants',           'clothes/pants_suit.png',         'rare',      150,  NULL,      true,  '{formal,bottom}','bottom'),
  ('shoes',              'clothes', 'Shoes',                'clothes/shoes_grey.png',         'common',    50,   '#4a3728', false, '{casual}',       'shoes'),
  -- Clothes: Full outfits
  ('overalls',           'clothes', 'Overalls',             'clothes/overalls_grey.png',      'free',      0,    '#e74c3c', false, '{casual,full}',  'full'),
  ('sporty',             'clothes', 'Sporty',               'clothes/sporty_grey.png',        'free',      0,    '#c8e64a', false, '{casual,full}',  'full'),
  ('suit',               'clothes', 'Suit',                 'clothes/suit_grey.png',          'free',      0,    '#2c3e50', false, '{formal,full}',  'full'),
  ('dress',              'clothes', 'Dress',                'clothes/dress_grey.png',         'common',    75,   '#e91e63', false, '{casual,full}',  'full'),
  ('floral',             'clothes', 'Floral',               'clothes/floral_grey.png',        'rare',      150,  '#e8a0a0', false, '{casual,full}',  'full'),
  ('sailor',             'clothes', 'Sailor',               'clothes/sailor_grey.png',        'rare',      200,  '#1a5276', false, '{formal,full}',  'full'),
  ('sailor_bow',         'clothes', 'Sailor + Bow',         'clothes/sailor_bow.png',         'epic',      400,  NULL,      true,  '{formal,full}',  'full'),
  ('suit_tie',           'clothes', 'Suit + Tie',           'clothes/suit_tie_grey.png',      'epic',      500,  '#8B0000', false, '{formal,full}',  'full'),
  -- Clothes: Costumes
  ('clown_blue',         'clothes', 'Clown (Blue)',         'clothes/clown_blue_grey.png',    'legendary', 800,  '#4a9eff', false, '{costume}',      'costume'),
  ('clown_red',          'clothes', 'Clown (Red)',          'clothes/clown_red_grey.png',     'legendary', 800,  '#e74c3c', false, '{costume}',      'costume'),
  ('spooky',             'clothes', 'Spooky',               'clothes/spooky_grey.png',        'legendary', 800,  '#ff6600', false, '{costume,seasonal}','costume'),
  ('witch',              'clothes', 'Witch',                'clothes/witch_grey.png',         'legendary', 800,  '#2c1810', false, '{costume,seasonal}','costume'),
  ('pumpkin',            'clothes', 'Pumpkin',              'clothes/pumpkin_grey.png',       'legendary', 1200, '#ff6600', false, '{costume,seasonal}','costume'),
  -- Accessories: Face
  ('glasses',            'acc',     'Glasses',              'acc/glasses_grey.png',           'common',    75,   '#333333', false, '{face}',         'face'),
  ('glasses_sun',        'acc',     'Sunglasses',           'acc/glasses_sun_grey.png',       'rare',      200,  '#1a1a1a', false, '{face}',         'face'),
  -- Accessories: Facial
  ('beard',              'acc',     'Beard',                'acc/beard_grey.png',             'rare',      150,  '#4a3728', false, '{face}',         'facial'),
  -- Accessories: Hats
  ('hat_cowboy',         'acc',     'Cowboy Hat',            'acc/hat_cowboy_grey.png',        'epic',      400,  '#8B4513', false, '{hat}',          'hat'),
  ('hat_lucky',          'acc',     'Lucky Hat',             'acc/hat_lucky_grey.png',         'legendary', 800,  '#2e7d32', false, '{hat}',          'hat'),
  ('hat_pumpkin',        'acc',     'Pumpkin Hat',           'acc/hat_pumpkin_grey.png',       'legendary', 1200, '#ff6600', false, '{hat,seasonal}', 'hat'),
  ('hat_pumpkin_purple', 'acc',     'Pumpkin (Purple)',      'acc/hat_pumpkin_purple.png',     'legendary', 1200, NULL,      true,  '{hat,seasonal}', 'hat'),
  ('hat_witch',          'acc',     'Witch Hat',             'acc/hat_witch_grey.png',         'legendary', 800,  '#2c1810', false, '{hat,seasonal}', 'hat'),
  -- Accessories: Masks
  ('mask_clown',         'acc',     'Clown Mask',            'acc/mask_clown_grey.png',       'legendary', 800,  '#e74c3c', false, '{mask}',         'mask'),
  ('mask_clown_blue',    'acc',     'Clown (Blue)',          'acc/mask_clown_blue.png',       'legendary', 800,  NULL,      true,  '{mask}',         'mask'),
  ('mask_clown_red',     'acc',     'Clown (Red)',           'acc/mask_clown_red.png',        'legendary', 800,  NULL,      true,  '{mask}',         'mask'),
  ('mask_spooky',        'acc',     'Spooky Mask',           'acc/mask_spooky_grey.png',      'legendary', 800,  '#f5f5dc', false, '{mask,seasonal}','mask'),
  -- Accessories: Jewelry
  ('earring_emerald',        'acc', 'Emerald Earring',       'acc/earring_emerald.png',       'rare',      200,  NULL,      true,  '{jewelry}',     'jewelry'),
  ('earring_emerald_silver', 'acc', 'Emerald (Silver)',      'acc/earring_emerald_silver.png','epic',      400,  NULL,      true,  '{jewelry}',     'jewelry'),
  ('earring_gold',           'acc', 'Gold Earring',          'acc/earring_gold_grey.png',     'epic',      500,  '#ffd700', false, '{jewelry}',     'jewelry'),
  ('earring_red',            'acc', 'Red Earring',           'acc/earring_red.png',           'rare',      200,  NULL,      true,  '{jewelry}',     'jewelry'),
  ('earring_red_silver',     'acc', 'Red (Silver)',          'acc/earring_red_silver.png',    'epic',      400,  NULL,      true,  '{jewelry}',     'jewelry'),
  ('earring_silver',         'acc', 'Silver Earring',        'acc/earring_silver_grey.png',   'epic',      400,  '#c0c0c0', false, '{jewelry}',     'jewelry'),
  -- Eyes / Face
  ('eyes',               'eyes',   'Eyes',                  'eyes/eyes_grey.png',            'free',      0,    '#4a3728', false, '{base}',         'eyes'),
  ('blush',              'eyes',   'Blush',                 'eyes/blush_grey.png',           'common',    50,   '#e8a0a0', false, '{makeup}',       'blush'),
  ('lipstick',           'eyes',   'Lipstick',              'eyes/lipstick_grey.png',        'common',    50,   '#cc4444', false, '{makeup}',       'lipstick'),
  -- Pets
  ('cat',                'pets',   'Cat',                   'cat_animation.png',             'epic',      300,  NULL,      false, '{follower}',     'pet'),
  ('yorkie',             'pets',   'Yorkie',                'yorkie_animation.png',          'epic',      500,  NULL,      false, '{follower}',     'pet')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  file = EXCLUDED.file,
  rarity = EXCLUDED.rarity,
  price_px = EXCLUDED.price_px,
  default_color = EXCLUDED.default_color,
  no_tint = EXCLUDED.no_tint,
  tags = EXCLUDED.tags,
  slot = EXCLUDED.slot;

-- 5. Auto-grant free items to existing players (skip if already granted)
INSERT INTO arcade_inventory (developer_id, item_id)
SELECT d.id, si.id
FROM developers d
CROSS JOIN arcade_shop_items si
WHERE si.rarity = 'free'
  AND EXISTS (SELECT 1 FROM wallets w WHERE w.developer_id = d.id)
ON CONFLICT (developer_id, item_id) DO NOTHING;

-- 6. Grant permissions (safe to re-run)
GRANT SELECT ON arcade_shop_items TO authenticated;
GRANT SELECT ON arcade_inventory TO authenticated;
GRANT SELECT ON arcade_avatar_loadouts TO authenticated;
