/*
# Milestone 1 — Onboarding, multi-role memberships, campus helpers

## Why
1. School onboarding was a chicken-and-egg: membership INSERT required
   can_manage_school(), but a brand-new owner has no membership yet.
2. UNIQUE (school_id, user_id) blocked multiple roles on the same school.
3. can_manage_school() did not treat platform_admin as a manager.
4. Schools had no created_by, so ownership of a new tenant could not be proven.

## Changes
- schools.created_by
- Unique memberships on (school_id, user_id, role)
- complete_school_onboarding(school_id) SECURITY DEFINER RPC
- can_manage_school includes platform_admin
- insert_schools requires created_by = public.current_user_id()
*/

-- ============================================================
-- COLUMNS
-- ============================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS idx_schools_created_by ON public.schools(created_by);

-- ============================================================
-- MULTI-ROLE MEMBERSHIPS
-- ============================================================

ALTER TABLE public.school_memberships
  DROP CONSTRAINT IF EXISTS school_memberships_school_id_user_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_memberships_school_id_user_id_role_key'
  ) THEN
    ALTER TABLE public.school_memberships
      ADD CONSTRAINT school_memberships_school_id_user_id_role_key
      UNIQUE (school_id, user_id, role);
  END IF;
END $$;

-- ============================================================
-- HELPER: managers include platform admins
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_manage_school(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.school_memberships sm
    WHERE sm.user_id = public.current_user_id()
      AND sm.school_id = p_school_id
      AND sm.role IN ('platform_admin', 'school_owner', 'school_admin')
      AND sm.is_active = true
  );
$$;

-- ============================================================
-- ONBOARDING RPC
-- Creates owner membership, default campus, settings, audit row.
-- Caller must be the school's created_by (or a platform admin).
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_school_onboarding(p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := public.current_user_id();
  v_created_by uuid;
  v_campus_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT created_by INTO v_created_by
  FROM public.schools
  WHERE id = p_school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'School not found';
  END IF;

  IF v_created_by IS DISTINCT FROM v_user_id AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorised to onboard this school';
  END IF;

  INSERT INTO public.school_memberships (school_id, user_id, role, is_active)
  VALUES (p_school_id, v_user_id, 'school_owner', true)
  ON CONFLICT (school_id, user_id, role) DO UPDATE SET is_active = true;

  INSERT INTO public.campuses (school_id, name, address, is_active)
  SELECT p_school_id, 'Main Campus', s.address, true
  FROM public.schools s
  WHERE s.id = p_school_id
    AND NOT EXISTS (SELECT 1 FROM public.campuses c WHERE c.school_id = p_school_id)
  RETURNING id INTO v_campus_id;

  INSERT INTO public.school_settings (school_id, settings)
  VALUES (
    p_school_id,
    jsonb_build_object(
      'academic_structure', 'custom',
      'grading_type', 'weighted',
      'default_currency', 'NGN',
      'enable_ai_features', true,
      'notification_channels', jsonb_build_array('in_app', 'email')
    )
  )
  ON CONFLICT (school_id) DO NOTHING;

  INSERT INTO public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    p_school_id,
    v_user_id,
    'completed school onboarding',
    'schools',
    p_school_id,
    jsonb_build_object('campus_id', v_campus_id)
  );

  RETURN jsonb_build_object('ok', true, 'school_id', p_school_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_school_onboarding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_school_onboarding(uuid) TO authenticated;

-- ============================================================
-- RLS: school insert must stamp created_by
-- ============================================================

DROP POLICY IF EXISTS "insert_schools" ON public.schools;
CREATE POLICY "insert_schools" ON public.schools FOR INSERT
  TO authenticated
  WITH CHECK (created_by = public.current_user_id() OR public.is_platform_admin());
