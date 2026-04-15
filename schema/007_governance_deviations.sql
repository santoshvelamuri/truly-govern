-- =============================================
-- MIGRATION 007 — Governance Deviation Register
-- =============================================
-- Creates governance_deviations (unified register), governance_risk_register,
-- and triggers to auto-populate from review_conditions and review_items.

-- ── §1  governance_deviations table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS governance_deviations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_type          TEXT NOT NULL CHECK (source_type IN ('condition', 'waiver', 'exception')),
  source_id            UUID NOT NULL,
  service_name         TEXT,
  domain_id            UUID REFERENCES capability_domains(id) ON DELETE SET NULL,
  policy_clause_id     UUID REFERENCES policy_clauses(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  severity             TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  owner_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date             DATE,
  expiry_date          DATE,
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending_verification', 'overdue', 'expiring', 'expired', 'resolved', 'renewed')),
  debt_score           INT NOT NULL DEFAULT 0,
  escalation_level     INT NOT NULL DEFAULT 0,
  resolution_evidence  TEXT,
  resolved_at          TIMESTAMPTZ,
  resolved_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_gd_org_status ON governance_deviations(org_id, status);
CREATE INDEX IF NOT EXISTS idx_gd_org_domain ON governance_deviations(org_id, domain_id, status);
CREATE INDEX IF NOT EXISTS idx_gd_org_service ON governance_deviations(org_id, service_name, status);
CREATE INDEX IF NOT EXISTS idx_gd_owner ON governance_deviations(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_gd_source ON governance_deviations(source_type, source_id);

ALTER TABLE governance_deviations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gd_sel" ON governance_deviations;
CREATE POLICY "gd_sel" ON governance_deviations FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "gd_ins" ON governance_deviations;
CREATE POLICY "gd_ins" ON governance_deviations FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "gd_upd" ON governance_deviations;
CREATE POLICY "gd_upd" ON governance_deviations FOR UPDATE USING (org_id = auth_org_id());


-- ── §2  governance_risk_register table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS governance_risk_register (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deviation_id    UUID NOT NULL REFERENCES governance_deviations(id) ON DELETE CASCADE,
  escalated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE governance_risk_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grr_sel" ON governance_risk_register;
CREATE POLICY "grr_sel" ON governance_risk_register FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "grr_ins" ON governance_risk_register;
CREATE POLICY "grr_ins" ON governance_risk_register FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "grr_upd" ON governance_risk_register;
CREATE POLICY "grr_upd" ON governance_risk_register FOR UPDATE USING (org_id = auth_org_id());


-- ── §3  Trigger: review_conditions → governance_deviations ────────────────

CREATE OR REPLACE FUNCTION tg_sync_condition_deviation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_review_title TEXT;
  v_domain_id UUID;
BEGIN
  -- Get review context
  SELECT r.title, r.domain_id INTO v_review_title, v_domain_id
  FROM reviews r WHERE r.id = (
    SELECT review_id FROM review_conditions WHERE id = NEW.id LIMIT 1
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO governance_deviations (org_id, source_type, source_id, service_name, domain_id, title, severity, owner_id, due_date, status)
    VALUES (NEW.org_id, 'condition', NEW.id, v_review_title, v_domain_id, NEW.description, 'medium', NEW.owner_id, NEW.due_date, 'open')
    ON CONFLICT (source_type, source_id) DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.completed = true AND (OLD.completed IS NULL OR OLD.completed = false) THEN
      UPDATE governance_deviations SET status = 'resolved', resolved_at = now()
      WHERE source_type = 'condition' AND source_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_condition_deviation ON review_conditions;
CREATE TRIGGER trg_condition_deviation
  AFTER INSERT OR UPDATE ON review_conditions
  FOR EACH ROW EXECUTE FUNCTION tg_sync_condition_deviation();


-- ── §4  Trigger: review_items waived → governance_deviations ──────────────

CREATE OR REPLACE FUNCTION tg_sync_waiver_deviation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_review_title TEXT;
  v_domain_id UUID;
  v_review_id UUID;
BEGIN
  -- Get review context
  SELECT r.title, r.domain_id, ri.review_id INTO v_review_title, v_domain_id, v_review_id
  FROM review_items ri JOIN reviews r ON r.id = ri.review_id
  WHERE ri.id = NEW.id;

  IF NEW.status = 'waived' AND (OLD.status IS NULL OR OLD.status != 'waived') THEN
    INSERT INTO governance_deviations (org_id, source_type, source_id, service_name, domain_id, policy_clause_id, title, severity, status)
    VALUES (NEW.org_id, 'waiver', NEW.id, v_review_title, v_domain_id, NEW.policy_chunk_id, NEW.description, NEW.severity, 'open')
    ON CONFLICT (source_type, source_id) DO NOTHING;
  ELSIF NEW.status != 'waived' AND OLD.status = 'waived' THEN
    UPDATE governance_deviations SET status = 'resolved', resolved_at = now()
    WHERE source_type = 'waiver' AND source_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waiver_deviation ON review_items;
CREATE TRIGGER trg_waiver_deviation
  AFTER UPDATE ON review_items
  FOR EACH ROW EXECUTE FUNCTION tg_sync_waiver_deviation();


-- ── §5  Backfill existing data ────────────────────────────────────────────

-- Backfill conditions
INSERT INTO governance_deviations (org_id, source_type, source_id, title, severity, owner_id, due_date, status)
SELECT rc.org_id, 'condition', rc.id, rc.description, 'medium', rc.owner_id, rc.due_date,
  CASE WHEN rc.completed THEN 'resolved' ELSE 'open' END
FROM review_conditions rc
ON CONFLICT (source_type, source_id) DO NOTHING;

-- Backfill waived items
INSERT INTO governance_deviations (org_id, source_type, source_id, title, severity, status)
SELECT ri.org_id, 'waiver', ri.id, ri.description, ri.severity, 'open'
FROM review_items ri WHERE ri.status = 'waived'
ON CONFLICT (source_type, source_id) DO NOTHING;
