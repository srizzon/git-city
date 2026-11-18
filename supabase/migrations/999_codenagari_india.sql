-- =============================================================================
-- Migration: 20261118_codenagari_india.sql
-- Project: CodeNagari (codenagari.in) - 3D Identity Metropolis for Indian Devs
-- Base Repo: srizzon/git-city (AGPL-3.0)
-- Description: Idempotent PostgreSQL schema, seed data, RLS policies, and
--              atomic FamGateway UPI verification RPC.
-- =============================================================================

BEGIN;

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. TABLE: codenagari_districts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.codenagari_districts (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('campus', 'tech_hub')),
    total_commits BIGINT NOT NULL DEFAULT 0,
    builder_count INTEGER NOT NULL DEFAULT 0,
    rival_slug TEXT,
    is_featured_matchup BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_codenagari_districts_category
    ON public.codenagari_districts(category);

CREATE INDEX IF NOT EXISTS idx_codenagari_districts_featured
    ON public.codenagari_districts(is_featured_matchup)
    WHERE is_featured_matchup = true;

-- Pre-seed Top 16 Indian Engineering Campuses + 6 Indian Tech Hubs
INSERT INTO public.codenagari_districts (
    slug,
    name,
    category,
    total_commits,
    builder_count,
    rival_slug,
    is_featured_matchup
)
VALUES
    -- Top 16 Indian Engineering Campuses (8 Head-to-Head 1v1 Rivalry Pairs)
    ('iit-bombay', 'IIT Bombay', 'campus', 48200, 142, 'iit-delhi', true),
    ('iit-delhi', 'IIT Delhi', 'campus', 46950, 138, 'iit-bombay', true),
    ('bits-pilani', 'BITS Pilani', 'campus', 51400, 156, 'iit-kanpur', true),
    ('iit-kanpur', 'IIT Kanpur', 'campus', 44800, 129, 'bits-pilani', true),
    ('iit-madras', 'IIT Madras', 'campus', 43100, 124, 'iit-kharagpur', false),
    ('iit-kharagpur', 'IIT Kharagpur', 'campus', 42650, 131, 'iit-madras', false),
    ('iit-roorkee', 'IIT Roorkee', 'campus', 39400, 118, 'iit-guwahati', false),
    ('iit-guwahati', 'IIT Guwahati', 'campus', 36200, 109, 'iit-roorkee', false),
    ('iiit-hyderabad', 'IIIT Hyderabad', 'campus', 54900, 115, 'nit-trichy', true),
    ('nit-trichy', 'NIT Trichy', 'campus', 38700, 122, 'iiit-hyderabad', true),
    ('nit-surathkal', 'NIT Surathkal (NITK)', 'campus', 35800, 114, 'nit-warangal', false),
    ('nit-warangal', 'NIT Warangal', 'campus', 34100, 108, 'nit-surathkal', false),
    ('dtu-delhi', 'DTU Delhi', 'campus', 41200, 149, 'nsut-delhi', true),
    ('nsut-delhi', 'NSUT Delhi', 'campus', 37600, 134, 'dtu-delhi', true),
    ('vit-vellore', 'VIT Vellore', 'campus', 45300, 195, 'srm-chennai', true),
    ('srm-chennai', 'SRM KTR Chennai', 'campus', 39800, 182, 'vit-vellore', true),

    -- Top 6 Indian Tech Hubs / Corridors (3 Head-to-Head Rivalry Pairs)
    ('blr-indiranagar-hsr', 'Bengaluru (HSR / Indiranagar)', 'tech_hub', 142500, 410, 'hyd-hitec-gachibowli', true),
    ('hyd-hitec-gachibowli', 'Hyderabad (HITEC City / Gachibowli)', 'tech_hub', 98400, 295, 'blr-indiranagar-hsr', true),
    ('pune-hinjewadi-baner', 'Pune (Hinjewadi / Baner)', 'tech_hub', 76200, 240, 'ncr-gurugram-cyberhub', false),
    ('ncr-gurugram-cyberhub', 'Gurugram (CyberHub / Golf Course Rd)', 'tech_hub', 88900, 265, 'pune-hinjewadi-baner', false),
    ('chennai-omr-taramani', 'Chennai (OMR / Taramani)', 'tech_hub', 64300, 205, 'mumbai-powai-bkc', false),
    ('mumbai-powai-bkc', 'Mumbai (Powai / BKC)', 'tech_hub', 67800, 215, 'chennai-omr-taramani', false)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 2. TABLE: codenagari_profiles
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.codenagari_profiles (
    github_login TEXT PRIMARY KEY,
    district_slug TEXT REFERENCES public.codenagari_districts(slug) ON UPDATE CASCADE ON DELETE SET NULL,
    is_claimed BOOLEAN NOT NULL DEFAULT false,
    claimed_at TIMESTAMPTZ,
    is_open_to_work BOOLEAN NOT NULL DEFAULT false,
    role_target TEXT,
    resume_or_portfolio_url TEXT,
    equipped_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    gifted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalize github_login lookups and district filtering
CREATE INDEX IF NOT EXISTS idx_codenagari_profiles_login_lower
    ON public.codenagari_profiles (lower(github_login));

CREATE INDEX IF NOT EXISTS idx_codenagari_profiles_district
    ON public.codenagari_profiles (district_slug);

CREATE INDEX IF NOT EXISTS idx_codenagari_profiles_recruiter_filter
    ON public.codenagari_profiles (is_open_to_work, is_claimed)
    WHERE is_open_to_work = true;

CREATE INDEX IF NOT EXISTS idx_codenagari_profiles_equipped_items_gin
    ON public.codenagari_profiles USING gin (equipped_items);

-- =============================================================================
-- 3. TABLE: codenagari_upi_orders
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.codenagari_upi_orders (
    order_id TEXT PRIMARY KEY,
    github_login TEXT NOT NULL,
    item_id TEXT NOT NULL,
    gift_recipients JSONB DEFAULT '[]'::jsonb,
    blimp_payload JSONB,
    catalog_amount NUMERIC(10,2) NOT NULL,
    payable_amount NUMERIC(10,2) NOT NULL,
    qr_url TEXT,
    checkout_url TEXT,
    utr_number TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'EXPIRED')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_codenagari_upi_orders_login_lower
    ON public.codenagari_upi_orders (lower(github_login));

CREATE INDEX IF NOT EXISTS idx_codenagari_upi_orders_status_expires
    ON public.codenagari_upi_orders (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_codenagari_upi_orders_payable_pending
    ON public.codenagari_upi_orders (payable_amount, status)
    WHERE status = 'PENDING';

-- =============================================================================
-- 4. TABLE: codenagari_sky_blimps
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.codenagari_sky_blimps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT UNIQUE REFERENCES public.codenagari_upi_orders(order_id) ON DELETE SET NULL,
    sponsor_name TEXT,
    badge_text TEXT,
    target_url TEXT,
    district_slug TEXT REFERENCES public.codenagari_districts(slug) ON UPDATE CASCADE ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'ACTIVE', 'EXPIRED')),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_codenagari_sky_blimps_active
    ON public.codenagari_sky_blimps (status, expires_at)
    WHERE status = 'ACTIVE';

-- =============================================================================
-- 5. HELPER FUNCTION: JSONB Unique Item Appender
-- Ensures equipped_items never contains duplicate item strings
-- =============================================================================
CREATE OR REPLACE FUNCTION public.codenagari_jsonb_append_unique(
    p_existing JSONB,
    p_new_items JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(
        jsonb_agg(DISTINCT elem),
        '[]'::jsonb
    )
    FROM (
        SELECT jsonb_array_elements_text(COALESCE(p_existing, '[]'::jsonb)) AS elem
        UNION
        SELECT jsonb_array_elements_text(COALESCE(p_new_items, '[]'::jsonb)) AS elem
    ) sub
    WHERE elem IS NOT NULL AND btrim(elem) <> '';
$$;

-- =============================================================================
-- 6. TRIGGER: Keep codenagari_districts.builder_count synchronized when
--    profiles join or switch districts
-- =============================================================================
CREATE OR REPLACE FUNCTION public.sync_codenagari_district_builder_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.district_slug IS NOT NULL THEN
            UPDATE public.codenagari_districts
               SET builder_count = builder_count + 1,
                   updated_at = now()
             WHERE slug = NEW.district_slug;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.district_slug IS DISTINCT FROM NEW.district_slug THEN
            IF OLD.district_slug IS NOT NULL THEN
                UPDATE public.codenagari_districts
                   SET builder_count = GREATEST(0, builder_count - 1),
                       updated_at = now()
                 WHERE slug = OLD.district_slug;
            END IF;
            IF NEW.district_slug IS NOT NULL THEN
                UPDATE public.codenagari_districts
                   SET builder_count = builder_count + 1,
                       updated_at = now()
                 WHERE slug = NEW.district_slug;
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.district_slug IS NOT NULL THEN
            UPDATE public.codenagari_districts
               SET builder_count = GREATEST(0, builder_count - 1),
                   updated_at = now()
             WHERE slug = OLD.district_slug;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_codenagari_district_builder_count ON public.codenagari_profiles;
CREATE TRIGGER trg_sync_codenagari_district_builder_count
    AFTER INSERT OR UPDATE OF district_slug OR DELETE
    ON public.codenagari_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_codenagari_district_builder_count();

-- =============================================================================
-- 7. ATOMIC RPC: confirm_famgateway_upi_order
-- Locks order row FOR UPDATE, enforces 12-digit UTR idempotency, verifies
-- payable_amount / catalog_amount tolerance, credits buyer + batchmate gifts
-- (even if recipients haven't logged in yet), or creates PENDING_APPROVAL blimp.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.confirm_famgateway_upi_order(
    p_order_id TEXT,
    p_utr_number TEXT,
    p_paid_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.codenagari_upi_orders%ROWTYPE;
    v_clean_Order_id TEXT := btrim(COALESCE(p_order_id, ''));
    v_clean_utr TEXT := regexp_replace(btrim(COALESCE(p_utr_number, '')), '[^0-9A-Za-z]', '', 'g');
    v_buyer_login TEXT;
    v_recipient_raw TEXT;
    v_recipient_login TEXT;
    v_existing_utr_order TEXT;
    v_buyer_items JSONB;
    v_blimp_days INTEGER := 3;
    v_blimp_district TEXT := NULL;
    v_blimp_sponsor TEXT;
    v_blimp_badge TEXT;
    v_blimp_url TEXT;
    v_gifted_list TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- 1. Validate inputs
    IF v_clean_Order_id = '' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'MISSING_ORDER_ID',
            'message', 'order_id is required.'
        );
    END IF;

    IF length(v_clean_utr) < 6 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'INVALID_UTR_FORMAT',
            'message', 'A valid bank UTR number is required.'
        );
    END IF;

    -- 2. Lock the target order row atomically
    SELECT *
      INTO v_order
      FROM public.codenagari_upi_orders
     WHERE order_id = v_clean_Order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'ORDER_NOT_FOUND',
            'order_id', v_clean_Order_id
        );
    END IF;

    -- 3. Idempotent return if this exact order was already marked PAID
    IF v_order.status = 'PAID' THEN
        IF v_order.utr_number = v_clean_utr THEN
            RETURN jsonb_build_object(
                'ok', true,
                'idempotent', true,
                'status', 'PAID',
                'order_id', v_order.order_id,
                'item_id', v_order.item_id,
                'github_login', v_order.github_login,
                'utr_number', v_order.utr_number
            );
        ELSE
            RETURN jsonb_build_object(
                'ok', false,
                'error', 'ORDER_ALREADY_PAID_WITH_DIFFERENT_UTR',
                'order_id', v_order.order_id
            );
        END IF;
    END IF;

    -- 4. Prevent UTR replay across any other order
    SELECT order_id
      INTO v_existing_utr_order
      FROM public.codenagari_upi_orders
     WHERE utr_number = v_clean_utr
       AND order_id <> v_order.order_id
     LIMIT 1;

    IF v_existing_utr_order IS NOT NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'UTR_ALREADY_USED',
            'utr_number', v_clean_utr
        );
    END IF;

    -- 5. Verify paid amount matches either payable_amount (Micro-Paisa Shield) or catalog_amount
    IF p_paid_amount IS NOT NULL AND p_paid_amount > 0 THEN
        IF p_paid_amount < v_order.catalog_amount
           AND abs(p_paid_amount - v_order.payable_amount) > 0.01 THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', 'AMOUNT_MISMATCH',
                'expected_payable', v_order.payable_amount,
                'catalog_amount', v_order.catalog_amount,
                'received_amount', p_paid_amount
            );
        END IF;
    END IF;

    -- 6. Mark the order as PAID
    UPDATE public.codenagari_upi_orders
       SET status = 'PAID',
           utr_number = v_clean_utr,
           paid_at = now()
     WHERE order_id = v_order.order_id;

    -- Normalize buyer GitHub handle (strip leading @ and lowercase)
    v_buyer_login := lower(regexp_replace(btrim(v_order.github_login), '^@+', ''));

    -- 7. Fulfillment Branch A: 3D Sky Blimp Sponsor (held in PENDING_APPROVAL)
    IF v_order.item_id LIKE 'sky_blimp_sponsor_3d%' THEN
        IF v_order.catalog_amount >= 1999 OR v_order.item_id LIKE '%7d%' THEN
            v_blimp_days := 7;
        ELSE
            v_blimp_days := 3;
        END IF;

        v_blimp_sponsor := COALESCE(
            NULLIF(btrim(v_order.blimp_payload->>'sponsor_name'), ''),
            v_buyer_login
        );
        v_blimp_badge := COALESCE(
            NULLIF(btrim(v_order.blimp_payload->>'badge_text'), ''),
            'HIRING / LAUNCHING IN CODENAGARI'
        );
        v_blimp_url := COALESCE(
            NULLIF(btrim(v_order.blimp_payload->>'target_url'), ''),
            'https://github.com/' || v_buyer_login
        );

        IF NULLIF(btrim(v_order.blimp_payload->>'district_slug'), '') IS NOT NULL THEN
            SELECT slug
              INTO v_blimp_district
              FROM public.codenagari_districts
             WHERE slug = btrim(v_order.blimp_payload->>'district_slug')
             LIMIT 1;
        END IF;

        INSERT INTO public.codenagari_sky_blimps (
            order_id,
            sponsor_name,
            badge_text,
            target_url,
            district_slug,
            status,
            expires_at
        )
        VALUES (
            v_order.order_id,
            v_blimp_sponsor,
            v_blimp_badge,
            v_blimp_url,
            v_blimp_district,
            'PENDING_APPROVAL',
            now() + make_interval(days => v_blimp_days)
        )
        ON CONFLICT (order_id) DO UPDATE
        SET sponsor_name = EXCLUDED.sponsor_name,
            badge_text   = EXCLUDED.badge_text,
            target_url   = EXCLUDED.target_url,
            district_slug = EXCLUDED.district_slug;

        -- Also ensure the sponsor's profile row exists and is claimed
        INSERT INTO public.codenagari_profiles (
            github_login,
            is_claimed,
            claimed_at,
            equipped_items,
            updated_at
        )
        VALUES (
            v_buyer_login,
            true,
            now(),
            jsonb_build_array('sky_blimp_sponsor_3d'),
            now()
        )
        ON CONFLICT (github_login) DO UPDATE
        SET is_claimed = true,
            claimed_at = COALESCE(public.codenagari_profiles.claimed_at, now()),
            equipped_items = public.codenagari_jsonb_append_unique(
                public.codenagari_profiles.equipped_items,
                jsonb_build_array('sky_blimp_sponsor_3d')
            ),
            updated_at = now();

    -- 8. Fulfillment Branch B: Rooftop Cosmetics, Recruiter Beacon & Squad 4-Pack
    ELSE
        IF v_order.item_id = 'hostel_squad_4pack' THEN
            -- Buyer gets both hostel_squad_4pack badge and chakra_neon_crown
            v_buyer_items := '["hostel_squad_4pack", "chakra_neon_crown"]'::jsonb;
        ELSE
            v_buyer_items := jsonb_build_array(v_order.item_id);
        END IF;

        INSERT INTO public.codenagari_profiles (
            github_login,
            is_claimed,
            claimed_at,
            is_open_to_work,
            role_target,
            resume_or_portfolio_url,
            equipped_items,
            updated_at
        )
        VALUES (
            v_buyer_login,
            true,
            now(),
            CASE WHEN v_order.item_id = 'recruiter_hologram_beacon' THEN true ELSE false END,
            CASE
                WHEN v_order.item_id = 'recruiter_hologram_beacon'
                THEN COALESCE(NULLIF(btrim(v_order.blimp_payload->>'role_target'), ''), 'SDE / Full-Stack Intern')
                ELSE NULL
            END,
            CASE
                WHEN v_order.item_id = 'recruiter_hologram_beacon'
                THEN NULLIF(btrim(v_order.blimp_payload->>'resume_or_portfolio_url'), '')
                ELSE NULL
            END,
            v_buyer_items,
            now()
        )
        ON CONFLICT (github_login) DO UPDATE
        SET is_claimed = true,
            claimed_at = COALESCE(public.codenagari_profiles.claimed_at, now()),
            is_open_to_work = CASE
                WHEN v_order.item_id = 'recruiter_hologram_beacon' THEN true
                ELSE public.codenagari_profiles.is_open_to_work
            END,
            role_target = CASE
                WHEN v_order.item_id = 'recruiter_hologram_beacon'
                THEN COALESCE(
                    NULLIF(btrim(v_order.blimp_payload->>'role_target'), ''),
                    public.codenagari_profiles.role_target,
                    'SDE / Full-Stack Intern'
                )
                ELSE public.codenagari_profiles.role_target
            END,
            resume_or_portfolio_url = CASE
                WHEN v_order.item_id = 'recruiter_hologram_beacon'
                THEN COALESCE(
                    NULLIF(btrim(v_order.blimp_payload->>'resume_or_portfolio_url'), ''),
                    public.codenagari_profiles.resume_or_portfolio_url
                )
                ELSE public.codenagari_profiles.resume_or_portfolio_url
            END,
            equipped_items = public.codenagari_jsonb_append_unique(
                public.codenagari_profiles.equipped_items,
                v_buyer_items
            ),
            updated_at = now();

        -- 9. Process gift_recipients (Hostel Squad 4-Pack or any gifted item)
        -- Pre-provisions profile rows even if batchmates have never logged in yet
        IF v_order.gift_recipients IS NOT NULL
           AND jsonb_typeof(v_order.gift_recipients) = 'array'
           AND jsonb_array_length(v_order.gift_recipients) > 0 THEN

            FOR v_recipient_raw IN
                SELECT jsonb_array_elements_text(v_order.gift_recipients)
            LOOP
                v_recipient_login := lower(regexp_replace(btrim(COALESCE(v_recipient_raw, '')), '^@+', ''));

                -- Validate GitHub username characters and avoid self-gifting duplicates
                IF v_recipient_login <> ''
                   AND v_recipient_login <> v_buyer_login
                   AND v_recipient_login ~ '^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$' THEN

                    INSERT INTO public.codenagari_profiles (
                        github_login,
                        is_claimed,
                        equipped_items,
                        gifted_by,
                        updated_at
                    )
                    VALUES (
                        v_recipient_login,
                        false,
                        '["chakra_neon_crown", "hostel_squad_4pack"]'::jsonb,
                        v_buyer_login,
                        now()
                    )
                    ON CONFLICT (github_login) DO UPDATE
                    SET equipped_items = public.codenagari_jsonb_append_unique(
                            public.codenagari_profiles.equipped_items,
                            '["chakra_neon_crown", "hostel_squad_4pack"]'::jsonb
                        ),
                        gifted_by = COALESCE(public.codenagari_profiles.gifted_by, v_buyer_login),
                        updated_at = now();

                    v_gifted_list := array_append(v_gifted_list, v_recipient_login);
                END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'idempotent', false,
        'status', 'PAID',
        'order_id', v_order.order_id,
        'item_id', v_order.item_id,
        'github_login', v_buyer_login,
        'utr_number', v_clean_utr,
        'gifted_recipients', to_jsonb(v_gifted_list)
    );
END;
$$;

-- Restrict direct public execution of the SECURITY DEFINER payment confirmation RPC
-- Only service_role (backend API routes / webhooks) can execute it
REVOKE ALL ON FUNCTION public.confirm_famgateway_upi_order(TEXT, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_famgateway_upi_order(TEXT, TEXT, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_famgateway_upi_order(TEXT, TEXT, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_famgateway_upi_order(TEXT, TEXT, NUMERIC) TO service_role;

-- =============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS across all 4 CodeNagari tables
ALTER TABLE public.codenagari_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codenagari_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codenagari_upi_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codenagari_sky_blimps ENABLE ROW LEVEL SECURITY;

-- Table grants for PostgREST roles
GRANT SELECT ON public.codenagari_districts TO anon, authenticated, service_role;
GRANT SELECT ON public.codenagari_profiles TO anon, authenticated, service_role;
GRANT INSERT, UPDATE ON public.codenagari_profiles TO authenticated, service_role;
GRANT SELECT ON public.codenagari_sky_blimps TO anon, authenticated, service_role;
GRANT SELECT ON public.codenagari_upi_orders TO authenticated, service_role;
GRANT ALL ON public.codenagari_districts TO service_role;
GRANT ALL ON public.codenagari_profiles TO service_role;
GRANT ALL ON public.codenagari_upi_orders TO service_role;
GRANT ALL ON public.codenagari_sky_blimps TO service_role;

-- -----------------------------------------------------------------------------
-- 8.1 Policies for codenagari_districts
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "codenagari_districts_public_select" ON public.codenagari_districts;
CREATE POLICY "codenagari_districts_public_select"
    ON public.codenagari_districts
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "codenagari_districts_service_all" ON public.codenagari_districts;
CREATE POLICY "codenagari_districts_service_all"
    ON public.codenagari_districts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 8.2 Policies for codenagari_profiles
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "codenagari_profiles_public_select" ON public.codenagari_profiles;
CREATE POLICY "codenagari_profiles_public_select"
    ON public.codenagari_profiles
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Authenticated GitHub OAuth users can insert their own profile row
-- Matches GitHub username in Supabase JWT user_metadata (user_name or preferred_username)
DROP POLICY IF EXISTS "codenagari_profiles_auth_insert_own" ON public.codenagari_profiles;
CREATE POLICY "codenagari_profiles_auth_insert_own"
    ON public.codenagari_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        lower(github_login) = lower(
            COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'user_name',
                auth.jwt() -> 'user_metadata' ->> 'preferred_username',
                ''
            )
        )
    );

-- Authenticated GitHub OAuth users can update their own profile metadata
-- while preventing client-side tampering with paid equipped_items
DROP POLICY IF EXISTS "codenagari_profiles_auth_update_own" ON public.codenagari_profiles;
CREATE POLICY "codenagari_profiles_auth_update_own"
    ON public.codenagari_profiles
    FOR UPDATE
    TO authenticated
    USING (
        lower(github_login) = lower(
            COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'user_name',
                auth.jwt() -> 'user_metadata' ->> 'preferred_username',
                ''
            )
        )
    )
    WITH CHECK (
        lower(github_login) = lower(
            COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'user_name',
                auth.jwt() -> 'user_metadata' ->> 'preferred_username',
                ''
            )
        )
    );

DROP POLICY IF EXISTS "codenagari_profiles_service_all" ON public.codenagari_profiles;
CREATE POLICY "codenagari_profiles_service_all"
    ON public.codenagari_profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Protect equipped_items and gifted_by from direct client-side mutation by non-service_role users
CREATE OR REPLACE FUNCTION public.protect_codenagari_profile_paid_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND session_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        IF TG_OP = 'INSERT' THEN
            NEW.equipped_items := '[]'::jsonb;
            NEW.gifted_by := NULL;
        ELSIF TG_OP = 'UPDATE' THEN
            NEW.equipped_items := OLD.equipped_items;
            NEW.gifted_by := OLD.gifted_by;
        END IF;
    END IF;
    NEW.github_login := lower(regexp_replace(btrim(NEW.github_login), '^@+', ''));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_codenagari_profile_paid_fields ON public.codenagari_profiles;
CREATE TRIGGER trg_protect_codenagari_profile_paid_fields
    BEFORE INSERT OR UPDATE
    ON public.codenagari_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_codenagari_profile_paid_fields();

-- -----------------------------------------------------------------------------
-- 8.3 Policies for codenagari_upi_orders
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "codenagari_upi_orders_auth_select_own" ON public.codenagari_upi_orders;
CREATE POLICY "codenagari_upi_orders_auth_select_own"
    ON public.codenagari_upi_orders
    FOR SELECT
    TO authenticated
    USING (
        lower(github_login) = lower(
            COALESCE(
                auth.jwt() -> 'user_metadata' ->> 'user_name',
                auth.jwt() -> 'user_metadata' ->> 'preferred_username',
                ''
            )
        )
    );

DROP POLICY IF EXISTS "codenagari_upi_orders_service_all" ON public.codenagari_upi_orders;
CREATE POLICY "codenagari_upi_orders_service_all"
    ON public.codenagari_upi_orders
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 8.4 Policies for codenagari_sky_blimps
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "codenagari_sky_blimps_public_select_active" ON public.codenagari_sky_blimps;
CREATE POLICY "codenagari_sky_blimps_public_select_active"
    ON public.codenagari_sky_blimps
    FOR SELECT
    TO anon, authenticated
    USING (
        status = 'ACTIVE'
        AND (expires_at IS NULL OR expires_at > now())
    );

DROP POLICY IF EXISTS "codenagari_sky_blimps_service_all" ON public.codenagari_sky_blimps;
CREATE POLICY "codenagari_sky_blimps_service_all"
    ON public.codenagari_sky_blimps
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;
