-- =============================================
-- Truly Govern — Standalone Core Schema
-- =============================================
-- Minimal tables required for TG to operate independently.
-- When integrated with Archigent, these tables already exist.

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Organizations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  slug            text        NOT NULL UNIQUE,
  industry        text,
  logo_url        text,
  currency        text        NOT NULL DEFAULT 'EUR',
  portfolio_name  text,
  plan            text        DEFAULT 'essentials'
                  CHECK (plan IN ('essentials', 'professional', 'enterprise')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       text,
  avatar_url      text,
  role            text        NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Org Members (multi-org RLS junction) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text        NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner', 'admin', 'member')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- ── auth_org_id() — RLS helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_org_id() RETURNS uuid
  LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_org uuid;
BEGIN
  -- Check JWT claim first (for multi-org users)
  v_org := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'org_id',
    null
  )::uuid;
  IF v_org IS NOT NULL THEN RETURN v_org; END IF;

  -- Fall back to oldest org_members row
  SELECT org_id INTO v_org
  FROM org_members
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN v_org;
END;
$$;

-- ── Updated-at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tg_update_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION tg_update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION tg_update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Organizations: members see their own org
CREATE POLICY "org_select" ON organizations FOR SELECT USING (id = auth_org_id());
CREATE POLICY "org_update" ON organizations FOR UPDATE USING (id = auth_org_id());

-- Profiles: members see org profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (org_id = auth_org_id());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (org_id = auth_org_id());

-- Org Members: members see own org
CREATE POLICY "org_members_select" ON org_members FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "org_members_insert" ON org_members FOR INSERT WITH CHECK (org_id = auth_org_id());
CREATE POLICY "org_members_delete" ON org_members FOR DELETE USING (org_id = auth_org_id());

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_org_idx ON profiles(org_id);
CREATE INDEX IF NOT EXISTS org_members_user_idx ON org_members(user_id);
CREATE INDEX IF NOT EXISTS auth_org_id_lookup ON org_members(user_id, org_id);

-- ── Handle new user trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF new.raw_user_meta_data->>'org_id' IS NOT NULL THEN
    INSERT INTO public.profiles (id, org_id, full_name, role)
    VALUES (
      new.id,
      (new.raw_user_meta_data->>'org_id')::uuid,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      coalesce(new.raw_user_meta_data->>'role', 'member')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
