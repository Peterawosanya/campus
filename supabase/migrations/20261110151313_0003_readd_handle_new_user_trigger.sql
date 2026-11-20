/*
# Re-add handle_new_user trigger (fixed)

## Context
The trigger was dropped while debugging a "Database error querying schema" auth issue.
The root cause was manually-inserted auth.users rows missing auth.identities entries.
Users are now created properly via the Auth Admin API (edge function), so the trigger
is safe to re-enable for the normal signup flow.

## Changes
- Recreates the on_auth_user_created trigger (AFTER INSERT on auth.users)
- The function is idempotent (ON CONFLICT DO NOTHING) so it can't fail
- SECURITY DEFINER with search_path=public for reliable schema resolution
*/

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
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
