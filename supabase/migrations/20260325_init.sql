-- Project Nithya — initial schema
-- Run once in: Supabase Dashboard → SQL Editor → New query → paste → Run

-- ── Help requests (all 3 sub-pages) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nithya_help_requests (
  id                bigserial    PRIMARY KEY,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  name              text         NOT NULL DEFAULT 'Anonymous',
  email             text,
  phone             text,
  situation         text         NOT NULL,
  urgency           text         NOT NULL DEFAULT 'normal',
  preferred_contact text,
  page              text
);

-- ── Donation intents (footer form) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nithya_donations (
  id         bigserial   PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  name       text        NOT NULL DEFAULT 'Anonymous',
  email      text,
  amount     text
);

-- ── Volunteer sign-ups ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nithya_volunteers (
  id         bigserial   PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  name       text        NOT NULL,
  email      text        NOT NULL,
  role       text        NOT NULL DEFAULT 'Other'
);

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE nithya_help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nithya_donations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nithya_volunteers     ENABLE ROW LEVEL SECURITY;

-- Allow anyone (unauthenticated) to INSERT — read is blocked by default
CREATE POLICY "public insert" ON nithya_help_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public insert" ON nithya_donations      FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public insert" ON nithya_volunteers     FOR INSERT TO anon WITH CHECK (true);
