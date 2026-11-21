-- Local compatibility layer for running the Supabase-era schema on plain
-- PostgreSQL 16 (Docker). This stands in for the two Supabase-specific
-- building blocks the migrations rely on:
--
-- 1. auth.users  -> public.users
--    A plain table with email + password hash. Authentication itself is NOT
--    implemented yet (Step 2); this is only the anchor for foreign keys.
--
-- 2. auth.uid()  -> public.current_user_id()
--    Reads the 'app.current_user_id' session variable. Until Step 2, nothing
--    sets it, so every helper returns false / NULL -- the same behaviour as a
--    logged-out Supabase request. SECURITY DEFINER functions and RLS policies
--    therefore stay intact and simply deny everything, which is the safe
--    default.
--
-- 3. Roles 'anon' and 'authenticated'
--    Supabase provides these roles; plain Postgres does not. We create them as
--    NOLOGIN so every GRANT and every "TO authenticated" RLS policy in the
--    ported migrations applies unchanged.

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Resolves the acting user from the session variable. Returns NULL when unset
-- or malformed instead of raising, mirroring auth.uid() on anonymous requests.
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $
  SELECT CASE
    WHEN current_user = 'authenticated'::regrole
         AND NULLIF(current_setting('app.current_user_id', true), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

    THEN current_setting('app.current_user_id', true)::uuid
    ELSE NULL
  END;
$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
