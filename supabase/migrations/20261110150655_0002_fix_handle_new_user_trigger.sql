/*
# Fix handle_new_user trigger to be idempotent

## Problem
The `handle_new_user()` trigger function tries to INSERT into `user_profiles`
unconditionally. When demo users were created directly in `auth.users` and their
profiles were also seeded, the trigger can fail on conflict, causing a
"Database error querying schema" 500 response from Supabase Auth.

## Fix
Make the trigger function use `ON CONFLICT DO NOTHING` so it never fails even
if a profile already exists. This is safe because the profile row is keyed by
the auth user id (1:1 relationship).
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

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
