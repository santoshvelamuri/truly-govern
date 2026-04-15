-- =============================================
-- MIGRATION 003 — Technology Reference Model (TRM) domains
-- =============================================
-- Replaces the hardcoded domain CHECK constraint on standard_policies
-- with a proper technology_domains lookup table, pre-seeded with
-- TOGAF TRM-inspired categories.
--
-- Run AFTER governance_schema.sql (002).

-- ── §1  technology_domains table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS technology_domains (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  colour        TEXT NOT NULL DEFAULT 'blue',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- Trigger: auto-update updated_at
CREATE OR REPLACE TRIGGER trg_technology_domains_updated_at
  BEFORE UPDATE ON technology_domains
  FOR EACH ROW EXECUTE FUNCTION tg_update_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_technology_domains_org
  ON technology_domains(org_id);

-- RLS
ALTER TABLE technology_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "td_select" ON technology_domains;
CREATE POLICY "td_select" ON technology_domains FOR SELECT
  USING (org_id = auth_org_id());

DROP POLICY IF EXISTS "td_insert" ON technology_domains;
CREATE POLICY "td_insert" ON technology_domains FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS "td_update" ON technology_domains;
CREATE POLICY "td_update" ON technology_domains FOR UPDATE
  USING (org_id = auth_org_id());

DROP POLICY IF EXISTS "td_delete" ON technology_domains;
CREATE POLICY "td_delete" ON technology_domains FOR DELETE
  USING (org_id = auth_org_id());


-- ── §2  Seed function ─────────────────────────────────────────────────────
-- Call once per org to insert the default TRM taxonomy.
-- Idempotent: ON CONFLICT DO NOTHING.
CREATE OR REPLACE FUNCTION seed_technology_domains(p_org_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO technology_domains (org_id, name, description, icon, colour, sort_order)
  VALUES
    (p_org_id, 'Compute & Runtime',    'Servers, containers, serverless, VMs',               'Server',        'blue',   1),
    (p_org_id, 'Networking',           'Load balancers, DNS, CDN, VPN, firewalls',            'Network',       'indigo', 2),
    (p_org_id, 'Storage & Databases',  'Object storage, RDBMS, NoSQL, caching',              'Database',      'teal',   3),
    (p_org_id, 'Identity & Access',    'IAM, SSO, MFA, RBAC, directory services',             'Shield',        'purple', 4),
    (p_org_id, 'Security',             'Encryption, secrets management, SIEM, vulnerability', 'Lock',          'red',    5),
    (p_org_id, 'API & Integration',    'API gateways, ESB, iPaaS, webhooks',                  'Cable',         'amber',  6),
    (p_org_id, 'Data & Analytics',     'ETL, data lakes, BI, streaming pipelines',            'BarChart3',     'green',  7),
    (p_org_id, 'AI & Machine Learning','ML platforms, LLMs, vector stores, feature stores',   'Brain',         'pink',   8),
    (p_org_id, 'Observability',        'Logging, monitoring, tracing, alerting',              'Activity',      'amber',  9),
    (p_org_id, 'Messaging & Events',   'Message queues, event buses, pub/sub',               'MessageSquare', 'teal',  10),
    (p_org_id, 'DevOps & CI/CD',       'Build pipelines, IaC, GitOps, container registries', 'GitBranch',     'indigo',11),
    (p_org_id, 'Cloud Platform',       'Cloud provider services, multi-cloud management',    'Cloud',         'blue',  12)
  ON CONFLICT (org_id, name) DO NOTHING;
END;
$$;


-- ── §3  Seed for all existing organisations ───────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM organizations LOOP
    PERFORM seed_technology_domains(r.id);
  END LOOP;
END $$;


-- ── §4  Migrate standard_policies ─────────────────────────────────────────

-- 4a. Drop the old CHECK constraint on domain FIRST (before any updates)
DO $$ BEGIN
  ALTER TABLE standard_policies DROP CONSTRAINT IF EXISTS standard_policies_domain_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 4b. Add tech_domain_id column
ALTER TABLE standard_policies
  ADD COLUMN IF NOT EXISTS tech_domain_id UUID REFERENCES technology_domains(id) ON DELETE SET NULL;

-- 4c. Backfill tech_domain_id from existing domain text values
-- Map old hardcoded values to new technology_domains rows
UPDATE standard_policies sp
SET tech_domain_id = td.id
FROM technology_domains td
WHERE sp.org_id = td.org_id
  AND sp.tech_domain_id IS NULL
  AND (
    (sp.domain = 'api'           AND td.name = 'API & Integration')
    OR (sp.domain = 'cloud'      AND td.name = 'Cloud Platform')
    OR (sp.domain = 'security'   AND td.name = 'Security')
    OR (sp.domain = 'data'       AND td.name = 'Data & Analytics')
    OR (sp.domain = 'integration' AND td.name = 'API & Integration')
    OR (sp.domain = 'identity'   AND td.name = 'Identity & Access')
    OR (sp.domain = 'observability' AND td.name = 'Observability')
    OR (sp.domain = 'messaging'  AND td.name = 'Messaging & Events')
    OR (sp.domain = 'ai'         AND td.name = 'AI & Machine Learning')
    OR (sp.domain = 'network'    AND td.name = 'Networking')
  );

-- 4d. Update denormalized domain column with new TRM names
UPDATE standard_policies sp
SET domain = td.name
FROM technology_domains td
WHERE sp.tech_domain_id = td.id;

-- 4e. Drop domain_id FK to capability_domains (no longer needed for policies)
ALTER TABLE standard_policies DROP COLUMN IF EXISTS domain_id;

-- 4f. Index on tech_domain_id
CREATE INDEX IF NOT EXISTS idx_standard_policies_tech_domain
  ON standard_policies(tech_domain_id);
