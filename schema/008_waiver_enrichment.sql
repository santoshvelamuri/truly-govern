-- =============================================
-- MIGRATION 008 — Waiver Enrichment
-- =============================================
-- Adds waiver_owner_id, waiver_expiry_date, waiver_renewal_count to review_items.
-- Updates the waiver trigger to copy these fields to governance_deviations.

ALTER TABLE review_items ADD COLUMN IF NOT EXISTS waiver_owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE review_items ADD COLUMN IF NOT EXISTS waiver_expiry_date DATE;
ALTER TABLE review_items ADD COLUMN IF NOT EXISTS waiver_renewal_count INT NOT NULL DEFAULT 0;

-- Update the waiver trigger to copy owner + expiry
CREATE OR REPLACE FUNCTION tg_sync_waiver_deviation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_review_title TEXT;
  v_domain_id UUID;
BEGIN
  SELECT r.title, r.domain_id INTO v_review_title, v_domain_id
  FROM review_items ri JOIN reviews r ON r.id = ri.review_id
  WHERE ri.id = NEW.id;

  IF NEW.status = 'waived' AND (OLD.status IS NULL OR OLD.status != 'waived') THEN
    INSERT INTO governance_deviations (org_id, source_type, source_id, service_name, domain_id, policy_clause_id, title, severity, owner_id, expiry_date, status)
    VALUES (NEW.org_id, 'waiver', NEW.id, v_review_title, v_domain_id, NEW.policy_chunk_id, NEW.description, NEW.severity, NEW.waiver_owner_id, NEW.waiver_expiry_date, 'open')
    ON CONFLICT (source_type, source_id) DO UPDATE SET
      owner_id = EXCLUDED.owner_id,
      expiry_date = EXCLUDED.expiry_date;
  ELSIF NEW.status != 'waived' AND OLD.status = 'waived' THEN
    UPDATE governance_deviations SET status = 'resolved', resolved_at = now()
    WHERE source_type = 'waiver' AND source_id = NEW.id;
  ELSIF NEW.status = 'waived' AND OLD.status = 'waived' THEN
    -- Waiver fields updated (e.g. renewal)
    UPDATE governance_deviations SET
      owner_id = COALESCE(NEW.waiver_owner_id, owner_id),
      expiry_date = COALESCE(NEW.waiver_expiry_date, expiry_date),
      status = CASE WHEN NEW.waiver_expiry_date IS NOT NULL AND NEW.waiver_expiry_date > current_date THEN 'open' ELSE status END
    WHERE source_type = 'waiver' AND source_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
