-- Project Nithya — manage the admin team from the admin portal
-- Run once in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Requires 20261114_site_content.sql (for nithya_is_admin()) to have run first.
--
-- The portal never touches admin_users directly. These functions do, and
-- each one first checks that the caller is already an admin.
-- Safety rails: you can't remove yourself, and the last admin can't be removed.

-- ── List the team ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nithya_list_admins()
RETURNS TABLE (email text, is_you boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT nithya_is_admin() THEN
    RAISE EXCEPTION 'nithya:not_admin' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT a.email::text, lower(a.email) = lower(auth.jwt() ->> 'email')
    FROM public.admin_users a
    ORDER BY lower(a.email);
END;
$$;

-- ── Add someone ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nithya_add_admin(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF NOT nithya_is_admin() THEN
    RAISE EXCEPTION 'nithya:not_admin' USING ERRCODE = '42501';
  END IF;
  IF e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR char_length(e) > 254 THEN
    RAISE EXCEPTION 'nithya:invalid_email';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_users WHERE lower(email) = e) THEN
    RAISE EXCEPTION 'nithya:already_member';
  END IF;
  INSERT INTO public.admin_users (email) VALUES (e);
END;
$$;

-- ── Remove someone ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nithya_remove_admin(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF NOT nithya_is_admin() THEN
    RAISE EXCEPTION 'nithya:not_admin' USING ERRCODE = '42501';
  END IF;
  IF e = lower(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'nithya:remove_self';
  END IF;
  IF (SELECT count(*) FROM public.admin_users) <= 1 THEN
    RAISE EXCEPTION 'nithya:last_admin';
  END IF;
  DELETE FROM public.admin_users WHERE lower(email) = e;
END;
$$;

-- Supabase grants new functions to anon by default; signed-out visitors get nothing.
REVOKE ALL ON FUNCTION nithya_list_admins()       FROM public, anon;
REVOKE ALL ON FUNCTION nithya_add_admin(text)     FROM public, anon;
REVOKE ALL ON FUNCTION nithya_remove_admin(text)  FROM public, anon;
GRANT EXECUTE ON FUNCTION nithya_list_admins()      TO authenticated;
GRANT EXECUTE ON FUNCTION nithya_add_admin(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION nithya_remove_admin(text) TO authenticated;
