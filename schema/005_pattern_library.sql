-- =============================================
-- MIGRATION 005 — Pattern Library
-- =============================================
-- Extends architecture_patterns table and creates pattern_clauses,
-- pattern_review_links, and pattern_suggestions tables.

-- ── §1  Alter architecture_patterns ───────────────────────────────────────

-- Add missing columns
ALTER TABLE architecture_patterns ADD COLUMN IF NOT EXISTS when_to_use TEXT;
ALTER TABLE architecture_patterns ADD COLUMN IF NOT EXISTS when_not_to_use TEXT;
ALTER TABLE architecture_patterns ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE architecture_patterns ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES architecture_patterns(id) ON DELETE SET NULL;
ALTER TABLE architecture_patterns ADD COLUMN IF NOT EXISTS completeness_score INT CHECK (completeness_score IS NULL OR (completeness_score >= 0 AND completeness_score <= 100));
ALTER TABLE architecture_patterns ADD COLUMN IF NOT EXISTS known_uses TEXT[] NOT NULL DEFAULT '{}';

-- Update status CHECK to include 'in_review' and 'approved'
DO $$ BEGIN
  ALTER TABLE architecture_patterns DROP CONSTRAINT IF EXISTS architecture_patterns_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE architecture_patterns ADD CONSTRAINT architecture_patterns_status_check
  CHECK (status IN ('draft', 'in_review', 'approved', 'active', 'deprecated'));

-- Migrate 'active' to 'approved' for existing data
UPDATE architecture_patterns SET status = 'approved' WHERE status = 'active';


-- ── §2  pattern_clauses table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pattern_clauses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id       UUID NOT NULL REFERENCES architecture_patterns(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  clause_type      TEXT NOT NULL CHECK (clause_type IN ('constraint', 'guidance', 'variant')),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  policy_clause_id UUID REFERENCES policy_clauses(id) ON DELETE SET NULL,
  severity         TEXT CHECK (severity IN ('blocking', 'warning', 'advisory')),
  clause_number    INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pattern_clauses_pattern ON pattern_clauses(pattern_id, clause_number);
CREATE INDEX IF NOT EXISTS idx_pattern_clauses_policy ON pattern_clauses(policy_clause_id);

ALTER TABLE pattern_clauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_sel" ON pattern_clauses;
CREATE POLICY "pc_sel" ON pattern_clauses FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "pc_ins" ON pattern_clauses;
CREATE POLICY "pc_ins" ON pattern_clauses FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "pc_upd" ON pattern_clauses;
CREATE POLICY "pc_upd" ON pattern_clauses FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "pc_del" ON pattern_clauses;
CREATE POLICY "pc_del" ON pattern_clauses FOR DELETE USING (org_id = auth_org_id());


-- ── §3  pattern_review_links table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pattern_review_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id       UUID REFERENCES architecture_patterns(id) ON DELETE SET NULL,
  review_id        UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  match_type       TEXT NOT NULL CHECK (match_type IN ('declared', 'detected')),
  similarity_score FLOAT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prl_review ON pattern_review_links(review_id);
CREATE INDEX IF NOT EXISTS idx_prl_pattern ON pattern_review_links(pattern_id);

ALTER TABLE pattern_review_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prl_sel" ON pattern_review_links;
CREATE POLICY "prl_sel" ON pattern_review_links FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "prl_ins" ON pattern_review_links;
CREATE POLICY "prl_ins" ON pattern_review_links FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "prl_del" ON pattern_review_links;
CREATE POLICY "prl_del" ON pattern_review_links FOR DELETE USING (org_id = auth_org_id());


-- ── §4  pattern_suggestions table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pattern_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  problem           TEXT NOT NULL,
  solution_overview TEXT NOT NULL,
  source_review_ids UUID[] NOT NULL DEFAULT '{}',
  confidence        TEXT CHECK (confidence IN ('low', 'medium', 'high')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'created')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pattern_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ps_sel" ON pattern_suggestions;
CREATE POLICY "ps_sel" ON pattern_suggestions FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ps_ins" ON pattern_suggestions;
CREATE POLICY "ps_ins" ON pattern_suggestions FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "ps_upd" ON pattern_suggestions;
CREATE POLICY "ps_upd" ON pattern_suggestions FOR UPDATE USING (org_id = auth_org_id());
