-- 050_arcade_rooms_scale.sql
-- Scale-ready fields: visibility, categories, password, description

-- Visibility: controls who can see/enter the room
ALTER TABLE arcade_rooms ADD COLUMN visibility TEXT NOT NULL DEFAULT 'open'
  CHECK (visibility IN ('open', 'unlisted', 'password', 'friends_only'));

-- Category: broad genre for filtering (null = uncategorized)
ALTER TABLE arcade_rooms ADD COLUMN category TEXT
  CHECK (category IS NULL OR category IN (
    'social', 'work', 'games', 'events', 'chill', 'dev', 'art', 'music'
  ));

-- Password hash for password-protected rooms (bcrypt or similar)
ALTER TABLE arcade_rooms ADD COLUMN password_hash TEXT;

-- Short description shown in room browser
ALTER TABLE arcade_rooms ADD COLUMN description TEXT CHECK (length(description) <= 200);

-- Featured flag for staff picks
ALTER TABLE arcade_rooms ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;

-- Drop old policy first (depends on is_public column)
DROP POLICY IF EXISTS "Public rooms are readable by everyone" ON arcade_rooms;

-- Drop is_public (replaced by visibility)
ALTER TABLE arcade_rooms DROP COLUMN is_public;

-- New RLS: visibility-based access
CREATE POLICY "Visible rooms are readable by everyone"
  ON arcade_rooms FOR SELECT
  USING (visibility IN ('open', 'password') OR auth.uid() = owner_id OR auth.role() = 'service_role');

-- Index for browser queries
DROP INDEX IF EXISTS idx_arcade_rooms_public;
CREATE INDEX idx_arcade_rooms_visibility ON arcade_rooms(visibility) WHERE visibility = 'open';
CREATE INDEX idx_arcade_rooms_category ON arcade_rooms(category) WHERE category IS NOT NULL;
CREATE INDEX idx_arcade_rooms_featured ON arcade_rooms(is_featured) WHERE is_featured = true;

-- Full-text search index on name + description
ALTER TABLE arcade_rooms ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;
CREATE INDEX idx_arcade_rooms_search ON arcade_rooms USING gin(search_vector);

-- ─── Room favorites ─────────────────────────────────────────
CREATE TABLE arcade_room_favorites (
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  room_id    UUID NOT NULL REFERENCES arcade_rooms ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

ALTER TABLE arcade_room_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own favorites"
  ON arcade_room_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
  ON arcade_room_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON arcade_room_favorites FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to favorites"
  ON arcade_room_favorites FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Room visit history ─────────────────────────────────────
CREATE TABLE arcade_room_visits (
  user_id        UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  room_id        UUID NOT NULL REFERENCES arcade_rooms ON DELETE CASCADE,
  visit_count    INT NOT NULL DEFAULT 1,
  last_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

CREATE INDEX idx_arcade_visits_user_recent ON arcade_room_visits(user_id, last_visited_at DESC);

ALTER TABLE arcade_room_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own visits"
  ON arcade_room_visits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to visits"
  ON arcade_room_visits FOR ALL
  USING (auth.role() = 'service_role');

-- Upsert function: insert or increment visit count
CREATE OR REPLACE FUNCTION upsert_arcade_visit(p_user_id UUID, p_room_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO arcade_room_visits (user_id, room_id, visit_count, last_visited_at)
  VALUES (p_user_id, p_room_id, 1, now())
  ON CONFLICT (user_id, room_id) DO UPDATE SET
    visit_count = arcade_room_visits.visit_count + 1,
    last_visited_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
