-- Project Nithya — editable website text
-- Run once in: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- One row per edited text block. Text that has never been edited has no row,
-- and the page shows the default text written in the HTML.
-- `key` matches a data-edit="..." attribute in index/safety/health-guidance.html.

CREATE TABLE IF NOT EXISTS nithya_site_content (
  key        text        PRIMARY KEY,
  page       text        NOT NULL,
  html       text        NOT NULL CHECK (char_length(html) BETWEEN 1 AND 6000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS nithya_site_content_page_idx ON nithya_site_content (page);

-- True when the signed-in user's email is on the admin allow-list.
-- SECURITY DEFINER so the check works whatever RLS admin_users has.
CREATE OR REPLACE FUNCTION nithya_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

REVOKE ALL ON FUNCTION nithya_is_admin() FROM public;
GRANT EXECUTE ON FUNCTION nithya_is_admin() TO authenticated;

ALTER TABLE nithya_site_content ENABLE ROW LEVEL SECURITY;

-- Everyone can read published text (the public site needs it).
CREATE POLICY "public read" ON nithya_site_content
  FOR SELECT TO anon, authenticated USING (true);

-- Only allow-listed admins can change it.
CREATE POLICY "admin insert" ON nithya_site_content
  FOR INSERT TO authenticated WITH CHECK (nithya_is_admin());
CREATE POLICY "admin update" ON nithya_site_content
  FOR UPDATE TO authenticated USING (nithya_is_admin()) WITH CHECK (nithya_is_admin());
CREATE POLICY "admin delete" ON nithya_site_content
  FOR DELETE TO authenticated USING (nithya_is_admin());

-- ── Photos for empty image cards ────────────────────────────────────────────
-- One row per filled slot. `key` matches data-edit-img="..." in the HTML.
-- `url` must point into the public `assets` bucket under site/.
-- `pos` is the CSS object-position focal point, e.g. '50% 30%'.
CREATE TABLE IF NOT EXISTS nithya_site_images (
  key        text        PRIMARY KEY,
  page       text        NOT NULL,
  url        text        NOT NULL CHECK (url LIKE 'https://%/storage/v1/object/public/assets/site/%'),
  alt        text        NOT NULL DEFAULT '' CHECK (char_length(alt) <= 300),
  pos        text        NOT NULL DEFAULT '50% 50%' CHECK (pos ~ '^\d{1,3}% \d{1,3}%$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS nithya_site_images_page_idx ON nithya_site_images (page);

ALTER TABLE nithya_site_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON nithya_site_images
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin insert" ON nithya_site_images
  FOR INSERT TO authenticated WITH CHECK (nithya_is_admin());
CREATE POLICY "admin update" ON nithya_site_images
  FOR UPDATE TO authenticated USING (nithya_is_admin()) WITH CHECK (nithya_is_admin());
CREATE POLICY "admin delete" ON nithya_site_images
  FOR DELETE TO authenticated USING (nithya_is_admin());

-- Admins may upload new files into assets/site/ (JPG only — the admin
-- portal resizes and converts every photo before uploading). Upload only:
-- no overwrite or delete, so existing site assets can't be replaced.
CREATE POLICY "nithya admin upload site photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assets'
    AND (storage.foldername(name))[1] = 'site'
    AND lower(storage.extension(name)) = 'jpg'
    AND public.nithya_is_admin()
  );
