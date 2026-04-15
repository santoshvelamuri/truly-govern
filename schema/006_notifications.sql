-- =============================================
-- MIGRATION 006 — Notifications Enhancement
-- =============================================
-- Extends notifications table with event taxonomy fields.
-- Creates notification_preferences and notification_email_queue tables.

-- ── §1  Alter notifications table ─────────────────────────────────────────

-- Drop old restrictive CHECK constraints
DO $$ BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_resource_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Add new columns
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_label TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT false;

-- Backfill entity_id from resource_id if exists
UPDATE notifications SET entity_id = resource_id WHERE entity_id IS NULL AND resource_id IS NOT NULL;
UPDATE notifications SET entity_type = resource_type WHERE entity_type IS NULL AND resource_type IS NOT NULL;
UPDATE notifications SET event_type = type WHERE event_type IS NULL AND type IS NOT NULL;

-- Index for unread count (fast badge query)
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- Index for entity lookup
CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications(org_id, entity_id);


-- ── §2  notification_preferences table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  in_app_enabled  BOOLEAN NOT NULL DEFAULT true,
  email_enabled   BOOLEAN NOT NULL DEFAULT false,
  digest_mode     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "np_sel" ON notification_preferences;
CREATE POLICY "np_sel" ON notification_preferences FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "np_ins" ON notification_preferences;
CREATE POLICY "np_ins" ON notification_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "np_upd" ON notification_preferences;
CREATE POLICY "np_upd" ON notification_preferences FOR UPDATE
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "np_del" ON notification_preferences;
CREATE POLICY "np_del" ON notification_preferences FOR DELETE
  USING (user_id = auth.uid());


-- ── §3  notification_email_queue table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_email_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  to_email        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count   INT NOT NULL DEFAULT 0,
  next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_pending
  ON notification_email_queue(status, next_retry_at) WHERE status = 'pending';

ALTER TABLE notification_email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "neq_sel" ON notification_email_queue;
CREATE POLICY "neq_sel" ON notification_email_queue FOR SELECT
  USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "neq_ins" ON notification_email_queue;
CREATE POLICY "neq_ins" ON notification_email_queue FOR INSERT
  WITH CHECK (org_id = auth_org_id());
