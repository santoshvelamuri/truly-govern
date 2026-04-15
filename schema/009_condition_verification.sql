-- =============================================
-- MIGRATION 009 — Condition Verification
-- =============================================
-- Adds verification fields to review_conditions and pending_verification status.

ALTER TABLE review_conditions ADD COLUMN IF NOT EXISTS completion_evidence TEXT;
ALTER TABLE review_conditions ADD COLUMN IF NOT EXISTS pending_verification_since TIMESTAMPTZ;
ALTER TABLE review_conditions ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE review_conditions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE review_conditions ADD COLUMN IF NOT EXISTS verification_rejected_reason TEXT;

-- Update the condition trigger to handle pending_verification
CREATE OR REPLACE FUNCTION tg_sync_condition_deviation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_review_title TEXT;
  v_domain_id UUID;
BEGIN
  SELECT r.title, r.domain_id INTO v_review_title, v_domain_id
  FROM reviews r WHERE r.id = (
    SELECT review_id FROM review_conditions WHERE id = NEW.id LIMIT 1
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO governance_deviations (org_id, source_type, source_id, service_name, domain_id, title, severity, owner_id, due_date, status)
    VALUES (NEW.org_id, 'condition', NEW.id, v_review_title, v_domain_id, NEW.description, 'medium', NEW.owner_id, NEW.due_date, 'open')
    ON CONFLICT (source_type, source_id) DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Pending verification
    IF NEW.pending_verification_since IS NOT NULL AND (OLD.pending_verification_since IS NULL) THEN
      UPDATE governance_deviations SET status = 'pending_verification'
      WHERE source_type = 'condition' AND source_id = NEW.id;
    END IF;
    -- Verified/completed
    IF NEW.verified_at IS NOT NULL AND OLD.verified_at IS NULL THEN
      UPDATE governance_deviations SET status = 'resolved', resolved_at = now(), resolved_by = NEW.verified_by
      WHERE source_type = 'condition' AND source_id = NEW.id;
    END IF;
    -- Rejected (back to open)
    IF NEW.verification_rejected_reason IS NOT NULL AND OLD.verification_rejected_reason IS NULL AND NEW.pending_verification_since IS NULL THEN
      UPDATE governance_deviations SET status = 'open'
      WHERE source_type = 'condition' AND source_id = NEW.id;
    END IF;
    -- Legacy completed (no verification)
    IF NEW.completed = true AND (OLD.completed IS NULL OR OLD.completed = false) AND NEW.verified_at IS NULL THEN
      UPDATE governance_deviations SET status = 'resolved', resolved_at = now()
      WHERE source_type = 'condition' AND source_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
