-- =============================================
-- MIGRATION 004 — ARB Boards (Multi-board model)
-- =============================================
-- Introduces arb_boards and arb_board_members tables for multi-board ARB.
-- Adds resolved_arb_board_id to decision_requests and board_id to arb_meetings.

-- ── §1  arb_boards table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arb_boards (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  scope                   TEXT NOT NULL CHECK (scope IN ('domain_arb','department_arb','enterprise_arb')),
  scope_type              TEXT NOT NULL CHECK (scope_type IN ('domain_scoped','topic_scoped')),
  governed_domain_ids     UUID[] NOT NULL DEFAULT '{}',
  governed_decision_types TEXT[] NOT NULL DEFAULT '{}',
  parent_arb_id           UUID REFERENCES arb_boards(id) ON DELETE SET NULL,
  chair_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  quorum_count            INT NOT NULL DEFAULT 3,
  meeting_cadence         TEXT NOT NULL DEFAULT 'monthly' CHECK (meeting_cadence IN ('weekly','biweekly','monthly','ad_hoc')),
  active                  BOOLEAN NOT NULL DEFAULT true,
  custom_fields           JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_arb_boards_org ON arb_boards(org_id);

ALTER TABLE arb_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arb_boards_sel" ON arb_boards;
CREATE POLICY "arb_boards_sel" ON arb_boards FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "arb_boards_ins" ON arb_boards;
CREATE POLICY "arb_boards_ins" ON arb_boards FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "arb_boards_upd" ON arb_boards;
CREATE POLICY "arb_boards_upd" ON arb_boards FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "arb_boards_del" ON arb_boards;
CREATE POLICY "arb_boards_del" ON arb_boards FOR DELETE USING (org_id = auth_org_id());


-- ── §2  arb_board_members table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arb_board_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        UUID NOT NULL REFERENCES arb_boards(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'reviewer' CHECK (role IN ('chair','reviewer','observer')),
  expertise_tags  TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_arb_board_members_board ON arb_board_members(board_id);
CREATE INDEX IF NOT EXISTS idx_arb_board_members_user ON arb_board_members(user_id);

ALTER TABLE arb_board_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abm_sel" ON arb_board_members;
CREATE POLICY "abm_sel" ON arb_board_members FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "abm_ins" ON arb_board_members;
CREATE POLICY "abm_ins" ON arb_board_members FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "abm_upd" ON arb_board_members;
CREATE POLICY "abm_upd" ON arb_board_members FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "abm_del" ON arb_board_members;
CREATE POLICY "abm_del" ON arb_board_members FOR DELETE USING (org_id = auth_org_id());


-- ── §3  Alter decision_requests ───────────────────────────────────────────
ALTER TABLE decision_requests
  ADD COLUMN IF NOT EXISTS resolved_arb_board_id UUID REFERENCES arb_boards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_decision_requests_board ON decision_requests(resolved_arb_board_id);


-- ── §4  Alter arb_meetings ───────────────────────────────────────────────
ALTER TABLE arb_meetings
  ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES arb_boards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_arb_meetings_board ON arb_meetings(board_id);
