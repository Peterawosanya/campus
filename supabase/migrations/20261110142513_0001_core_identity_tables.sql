/*
# CampusOS Core Identity & Foundation Schema

## Overview
This migration establishes the foundational database schema for CampusOS, a multi-school
management platform. It creates the core identity tables needed for Milestone 1:
school management, authentication, role-based access control, and audit logging.

## Design Principles
- Multi-tenant: every school-owned record has a `school_id` for strict data isolation.
- UUID primary keys with `gen_random_uuid()` defaults.
- Row Level Security (RLS) on every table to enforce school membership.
- Role-based access control through a `user_roles` table (not JWT claims) so roles
  can be multi-valued and managed server-side.
- Audit logging for important actions.

## New Tables

### schools
- Top-level tenant entity. Each school is an independent organization.
- Fields: name, short_name, type, country, currency, timezone, phone_country_code,
  address, logo_url, is_active, created_at, updated_at.

### campuses
- Physical campuses belonging to a school. Supports multi-campus school groups.

### user_profiles
- Application-level user profile linked 1:1 to `auth.users`.
- Fields: first_name, last_name, email, phone, avatar_url, is_active.

### school_memberships
- Links a user to a school with a role. The core of access control.
- Unique constraint on (school_id, user_id) prevents duplicate memberships.
- Roles: platform_admin, school_owner, school_admin, academic_admin, bursar, teacher, parent, student.

### staff_profiles
- Staff-specific profile data (employment info). Linked to a school + user.

### school_settings
- Per-school configurable settings stored as jsonb.

### audit_logs
- Immutable record of important actions. Appended-only by design.

## Security (RLS)
- schools: SELECT for school members; INSERT open (onboarding); UPDATE for managers.
- campuses: CRUD for school members / managers.
- user_profiles: read own + profiles of co-members; modify own only.
- school_memberships: SELECT for school members; INSERT/UPDATE/DELETE for managers/owners.
- staff_profiles: SELECT for members; INSERT/UPDATE for managers or self.
- school_settings: SELECT for members; UPDATE for managers.
- audit_logs: SELECT for members; INSERT for any authenticated user.

## Helper Functions
- is_platform_admin(): checks for platform_admin role.
- is_school_member(school_id): checks active membership OR platform admin.
- has_school_role(school_id, role): checks specific role OR platform admin.
- can_manage_school(school_id): checks platform_admin, school_owner, or school_admin.

## Notes
1. user_profiles.id references auth.users(id) — 1:1 mapping.
2. school_memberships.role is an enum ensuring only valid roles.
3. Auto-trigger creates a user_profile row on auth signup.
4. All timestamps use timestamptz with now() defaults.
5. Grants scoped to authenticated only — app requires sign-in.
*/

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE school_role AS ENUM (
    'platform_admin',
    'school_owner',
    'school_admin',
    'academic_admin',
    'bursar',
    'teacher',
    'parent',
    'student'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE school_type AS ENUM ('primary', 'secondary', 'both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLES (created before functions that reference them)
-- ============================================================

-- Schools (tenant root)
CREATE TABLE IF NOT EXISTS public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  type school_type NOT NULL DEFAULT 'both',
  country text NOT NULL DEFAULT 'Nigeria',
  currency text NOT NULL DEFAULT 'NGN',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  phone_country_code text NOT NULL DEFAULT '+234',
  address text,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Campuses
CREATE TABLE IF NOT EXISTS public.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User profiles (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- School memberships (role assignments)
CREATE TABLE IF NOT EXISTS public.school_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role school_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  invited_by uuid REFERENCES auth.users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id)
);

-- Staff profiles
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id text,
  designation text,
  department text,
  employment_type text,
  joined_on date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- School settings
CREATE TABLE IF NOT EXISTS public.school_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Audit logs (append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships sm
    WHERE sm.user_id = auth.uid()
      AND sm.role = 'platform_admin'
      AND sm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships sm
    WHERE sm.user_id = auth.uid()
      AND sm.school_id = p_school_id
      AND sm.is_active = true
  ) OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.has_school_role(p_school_id uuid, p_role school_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships sm
    WHERE sm.user_id = auth.uid()
      AND sm.school_id = p_school_id
      AND sm.role = p_role
      AND sm.is_active = true
  ) OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.can_manage_school(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships sm
    WHERE sm.user_id = auth.uid()
      AND sm.school_id = p_school_id
      AND sm.role IN ('platform_admin', 'school_owner', 'school_admin')
      AND sm.is_active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_school_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_school_role(uuid, school_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_school(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_school_role(uuid, school_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_school(uuid) TO authenticated;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_campuses_school_id ON public.campuses(school_id);
CREATE INDEX IF NOT EXISTS idx_memberships_school_id ON public.school_memberships(school_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON public.school_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON public.school_memberships(role);
CREATE INDEX IF NOT EXISTS idx_staff_school_id ON public.staff_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON public.staff_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_school_id ON public.audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity_type, entity_id);

-- ============================================================
-- ENABLE RLS
-- ============================================================

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.schools TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campuses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_profiles TO authenticated;
GRANT SELECT, UPDATE ON public.school_settings TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ---- schools ----
DROP POLICY IF EXISTS "select_schools" ON public.schools;
CREATE POLICY "select_schools" ON public.schools FOR SELECT
  TO authenticated USING (public.is_school_member(id));

DROP POLICY IF EXISTS "insert_schools" ON public.schools;
CREATE POLICY "insert_schools" ON public.schools FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_schools" ON public.schools;
CREATE POLICY "update_schools" ON public.schools FOR UPDATE
  TO authenticated USING (public.can_manage_school(id))
  WITH CHECK (public.can_manage_school(id));

-- ---- campuses ----
DROP POLICY IF EXISTS "select_campuses" ON public.campuses;
CREATE POLICY "select_campuses" ON public.campuses FOR SELECT
  TO authenticated USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "insert_campuses" ON public.campuses;
CREATE POLICY "insert_campuses" ON public.campuses FOR INSERT
  TO authenticated WITH CHECK (public.can_manage_school(school_id));

DROP POLICY IF EXISTS "update_campuses" ON public.campuses;
CREATE POLICY "update_campuses" ON public.campuses FOR UPDATE
  TO authenticated USING (public.can_manage_school(school_id))
  WITH CHECK (public.can_manage_school(school_id));

DROP POLICY IF EXISTS "delete_campuses" ON public.campuses;
CREATE POLICY "delete_campuses" ON public.campuses FOR DELETE
  TO authenticated USING (public.can_manage_school(school_id));

-- ---- user_profiles ----
DROP POLICY IF EXISTS "select_own_profile" ON public.user_profiles;
CREATE POLICY "select_own_profile" ON public.user_profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.school_memberships sm1
      JOIN public.school_memberships sm2 ON sm1.school_id = sm2.school_id
      WHERE sm1.user_id = auth.uid()
        AND sm2.user_id = user_profiles.id
        AND sm1.is_active = true
        AND sm2.is_active = true
    )
  );

DROP POLICY IF EXISTS "insert_own_profile" ON public.user_profiles;
CREATE POLICY "insert_own_profile" ON public.user_profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "update_own_profile" ON public.user_profiles;
CREATE POLICY "update_own_profile" ON public.user_profiles FOR UPDATE
  TO authenticated USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ---- school_memberships ----
DROP POLICY IF EXISTS "select_memberships" ON public.school_memberships;
CREATE POLICY "select_memberships" ON public.school_memberships FOR SELECT
  TO authenticated USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "insert_memberships" ON public.school_memberships;
CREATE POLICY "insert_memberships" ON public.school_memberships FOR INSERT
  TO authenticated WITH CHECK (public.can_manage_school(school_id));

DROP POLICY IF EXISTS "update_memberships" ON public.school_memberships;
CREATE POLICY "update_memberships" ON public.school_memberships FOR UPDATE
  TO authenticated USING (
    public.has_school_role(school_id, 'platform_admin')
    OR public.has_school_role(school_id, 'school_owner')
  ) WITH CHECK (
    public.has_school_role(school_id, 'platform_admin')
    OR public.has_school_role(school_id, 'school_owner')
  );

DROP POLICY IF EXISTS "delete_memberships" ON public.school_memberships;
CREATE POLICY "delete_memberships" ON public.school_memberships FOR DELETE
  TO authenticated USING (
    public.has_school_role(school_id, 'platform_admin')
    OR public.has_school_role(school_id, 'school_owner')
  );

-- ---- staff_profiles ----
DROP POLICY IF EXISTS "select_staff_profiles" ON public.staff_profiles;
CREATE POLICY "select_staff_profiles" ON public.staff_profiles FOR SELECT
  TO authenticated USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "insert_staff_profiles" ON public.staff_profiles;
CREATE POLICY "insert_staff_profiles" ON public.staff_profiles FOR INSERT
  TO authenticated WITH CHECK (public.can_manage_school(school_id));

DROP POLICY IF EXISTS "update_staff_profiles" ON public.staff_profiles;
CREATE POLICY "update_staff_profiles" ON public.staff_profiles FOR UPDATE
  TO authenticated USING (
    public.can_manage_school(school_id) OR user_id = auth.uid()
  ) WITH CHECK (
    public.can_manage_school(school_id) OR user_id = auth.uid()
  );

-- ---- school_settings ----
DROP POLICY IF EXISTS "select_school_settings" ON public.school_settings;
CREATE POLICY "select_school_settings" ON public.school_settings FOR SELECT
  TO authenticated USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "update_school_settings" ON public.school_settings;
CREATE POLICY "update_school_settings" ON public.school_settings FOR UPDATE
  TO authenticated USING (public.can_manage_school(school_id))
  WITH CHECK (public.can_manage_school(school_id));

-- ---- audit_logs ----
DROP POLICY IF EXISTS "select_audit_logs" ON public.audit_logs;
CREATE POLICY "select_audit_logs" ON public.audit_logs FOR SELECT
  TO authenticated USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "insert_audit_logs" ON public.audit_logs;
CREATE POLICY "insert_audit_logs" ON public.audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============================================================
-- TRIGGERS: updated_at + auto-create profile
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schools_updated_at ON public.schools;
CREATE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_school_settings_updated_at ON public.school_settings;
CREATE TRIGGER trg_school_settings_updated_at
  BEFORE UPDATE ON public.school_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create user profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, first_name, last_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
