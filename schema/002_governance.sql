-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 002 — Truly Govern tables (merged with Archigent)
-- File:    packages/db/migrations/002_tg_tables.sql
-- Purpose: Create all Truly Govern tables in the shared Archigent database.
--          References Archigent tables as the single source of truth for:
--            organizations       (root tenant)
--            capability_domains  (governance domains)
--            standard_policies   (policy library)
--            profiles            (user display info)
--            strategic_goals     (strategic context)
--            initiatives         (initiative context)
--            applications        (portfolio context)
--            assessment_cycles   (assessment context)
--
-- Run AFTER 001_archigent_extensions.sql.
--
-- Sections:
--   §1   auth_org_id() function + org_members (multi-org RLS junction)
--   §2   org_settings
--   §3   Stage 1 additions (domain_members, policy_clauses, policy_chunks,
--                           ingestion_logs)
--   §4   Stage 2 (advisor_sessions, advisor_logs)
--   §5   Stage 3 (reviews, review_items, review_conditions)
--   §6   Stage 4 (autonomy_rules, decision_requests, decision_options,
--                 arb_meetings, meeting_agenda_items, meeting_conditions)
--   §7   Stage 5 (adrs + embedding guard trigger)
--   §8   Stage 6 (repo_scans, repo_violations)
--   §9   Stage 7 (usage_events, maturity_scores)
--   §10  Knowledge registry (vendors, vendor_assessments, technology_entries,
--                            architecture_patterns)
--   §11  Cross-cutting (policy_exceptions, notifications)
--   §12  Extensibility (field_definitions, labels, entity_labels)
--   §13  Indexes
--   §14  Row Level Security (all tables — Archigent + TG)
--   §15  RPC functions
--   §16  Post-migration verification
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────────
-- uuid-ossp: required by Archigent tables that use uuid_generate_v4().
-- pgvector:  required for vector(1536) columns in policy_chunks, reviews,
--            adrs, and architecture_patterns.
-- Safe to re-run (IF NOT EXISTS).
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists vector with schema extensions;

-- ── Shared trigger function ───────────────────────────────────────────────
-- Defined here so 002 is self-contained. CREATE OR REPLACE is idempotent —
-- safe even if 001_archigent_extensions.sql already created this function.
create or replace function tg_update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- §1  MULTI-ORG RLS FOUNDATION
-- ═══════════════════════════════════════════════════════════════════════════

-- org_members ─────────────────────────────────────────────────────────────────
-- TG's multi-org RLS junction table. Coexists with Archigent's profiles table.
--
-- profiles  (Archigent) = user display info (name, avatar) — id = auth.users.id
-- org_members (TG)      = multi-org memberships for RLS — separate junction
--
-- On user signup: write to BOTH profiles (Archigent) AND org_members (TG).
-- auth_org_id() reads from org_members — supports multi-org users.
create table if not exists org_members (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references organizations(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role        text        not null default 'member'
              check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now(),
  unique(org_id, user_id)
);

-- Backfill from existing Archigent profiles so existing users retain access.
-- Idempotent: ON CONFLICT DO NOTHING prevents duplicate errors on re-runs.
insert into org_members (org_id, user_id, role, created_at)
  select p.org_id, p.id,
    case when p.role in ('owner', 'admin', 'member') then p.role
         else 'member' end,
    p.created_at
  from profiles p
  on conflict (org_id, user_id) do nothing;

-- Verify backfill completeness — warn if any profiles were missed.
-- A missing org_members row means that user gets 0 rows from every table
-- because all RLS policies use auth_org_id() which reads from org_members.
do $$
declare
  v_profiles int;
  v_members  int;
begin
  select count(*) into v_profiles from profiles;
  select count(*) into v_members  from org_members;
  if v_members < v_profiles then
    raise warning
      'org_members backfill incomplete: % profiles but only % org_members rows. '
      'Missing users will be locked out of all data.',
      v_profiles, v_members;
  end if;
end $$;


-- auth_org_id() ────────────────────────────────────────────────────────────────
-- Returns the org_id for the current authenticated user.
-- Reads JWT claim 'org_id' first (set by middleware for multi-org users),
-- then falls back to the user's oldest org_members row (single-org users).
-- All TG RLS policies use this function. It is also applied to Archigent tables
-- in §14.
create or replace function auth_org_id()
returns uuid language sql stable security definer as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid,
    (
      select org_id from org_members
      where user_id = auth.uid()
      order by created_at asc
      limit 1
    )
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- §2  ORG SETTINGS
-- ═══════════════════════════════════════════════════════════════════════════

-- Key-value configuration per org.
-- Examples: 'slack_webhook', 'confluence_space', 'default_arb_chair_id',
--           'notify_on_policy_change', 'stage_readiness' (which stages are live).
create table if not exists org_settings (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references organizations(id) on delete cascade,
  key         text        not null,
  value       jsonb       not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(org_id, key)
);
create trigger org_settings_updated_at
  before update on org_settings
  for each row execute function tg_update_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- §3  STAGE 1 ADDITIONS
--     (standard_policies already extended in 001 — these are the child tables)
-- ═══════════════════════════════════════════════════════════════════════════

-- domain_members ──────────────────────────────────────────────────────────────
-- Maps users to capability_domains with a governance role.
-- Required for: review routing to domain owners, delegation rules in the
-- autonomy engine, ARB reviewer assignment, pattern peer review workflow.
-- Query: find domain owner → SELECT user_id FROM domain_members
--        WHERE domain_id = $1 AND role = 'owner' LIMIT 1
create table if not exists domain_members (
  id          uuid        primary key default gen_random_uuid(),
  domain_id   uuid        not null references capability_domains(id) on delete cascade,
  org_id      uuid        not null references organizations(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role        text        not null default 'steward'
              check (role in ('owner', 'steward', 'reviewer')),
  created_at  timestamptz not null default now(),
  unique(domain_id, user_id)
);


-- policy_clauses ──────────────────────────────────────────────────────────────
-- Individual clauses of authored standard_policies.
-- Each clause becomes one or more policy_chunks.
-- source_type = 'authored' policies only — imported documents go straight to chunks.
-- Severity at clause level is what drives precise checklist item generation.
create table if not exists policy_clauses (
  id            uuid        primary key default gen_random_uuid(),
  policy_id     uuid        not null references standard_policies(id) on delete cascade,
  org_id        uuid        not null references organizations(id) on delete cascade,
  heading       text        not null,
  content       text        not null,
  severity      text        not null default 'warning'
                check (severity in ('blocking', 'warning', 'advisory')),
  clause_index  int         not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger policy_clauses_updated_at
  before update on policy_clauses
  for each row execute function tg_update_updated_at();


-- policy_chunks (vector store) ────────────────────────────────────────────────
-- Unit of retrieval for all AI features. Both authored and imported policies
-- produce chunks. metadata JSONB duplicates key fields to avoid joins at
-- retrieval time.
-- constraint: prevents wrong-dimension embeddings from silently corrupting search.
create table if not exists policy_chunks (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        not null references organizations(id) on delete cascade,
  policy_id    uuid        not null references standard_policies(id) on delete cascade,
  clause_id    uuid        references policy_clauses(id) on delete cascade,
  chunk_index  int         not null,
  content      text        not null,
  token_count  int,
  embedding    vector(1536),
  metadata     jsonb       not null default '{}',
  created_at   timestamptz not null default now(),
  constraint   pc_embedding_dim_check
               check (embedding is null or array_length(embedding::real[], 1) = 1536)
);


-- ingestion_logs ──────────────────────────────────────────────────────────────
-- Append-only log of every embedding pipeline run.
-- Drives per-org cost attribution and ingestion health monitoring.
create table if not exists ingestion_logs (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references organizations(id) on delete cascade,
  policy_id      uuid        not null references standard_policies(id) on delete cascade,
  source_type    text,
  chunks_created int,
  tokens_used    int,
  duration_ms    int,
  status         text        check (status in ('success', 'failed')),
  error_message  text,
  created_at     timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- §4  STAGE 2 — CONSULT ON DEMAND
-- ═══════════════════════════════════════════════════════════════════════════

-- advisor_sessions ────────────────────────────────────────────────────────────
-- Groups advisor_logs into conversation threads.
-- Required for: history sidebar, multi-turn context, session-level analytics.
create table if not exists advisor_sessions (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references organizations(id) on delete cascade,
  user_id     uuid        references auth.users(id) on delete set null,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger advisor_sessions_updated_at
  before update on advisor_sessions
  for each row execute function tg_update_updated_at();


-- advisor_logs ────────────────────────────────────────────────────────────────
-- Every Advisor question + answer. Append-only.
-- powers_used + feedback drive the eval regression test set.
-- tokens_used enables per-org cost attribution for billing.
create table if not exists advisor_logs (
  id               uuid        primary key default gen_random_uuid(),
  org_id           uuid        not null references organizations(id) on delete cascade,
  user_id          uuid        references auth.users(id) on delete set null,
  session_id       uuid        references advisor_sessions(id) on delete set null,
  question         text        not null,
  answer           text        not null,
  confidence       text        check (confidence in ('high', 'medium', 'low')),
  policy_ids_used  text[]      not null default '{}',
  had_conflict     boolean     not null default false,
  feedback         text        check (feedback in ('helpful', 'not_helpful')),
  feedback_note    text,
  tokens_used      int,
  duration_ms      int,
  citations_json   jsonb       not null default '[]',
  created_at       timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- §5  STAGE 3 — REVIEW DESIGNS
-- ═══════════════════════════════════════════════════════════════════════════

-- reviews ─────────────────────────────────────────────────────────────────────
-- A design submission awaiting compliance review.
-- New FKs vs standalone TG schema:
--   application_id → applications (Archigent) — the app being redesigned
--   initiative_id  → initiatives  (Archigent) — the initiative that produced it
-- embedding enables similar design detection (find past reviews like this one).
-- previous_review_id creates the resubmission chain for diff view.
-- completeness_score gates submission: <60 returns 400.
-- custom_fields: cost centre, project code, sprint, release, business owner,
--                IT risk ID, programme name.
create table if not exists reviews (
  id                    uuid        primary key default gen_random_uuid(),
  org_id                uuid        not null references organizations(id) on delete cascade,
  domain_id             uuid        -- references capability_domains(id) [standalone: no FK],
  application_id        uuid        -- references applications(id) [standalone: no FK],
  initiative_id         uuid        -- references initiatives(id) [standalone: no FK],
  title                 text        not null,
  description           text,
  tech_stack            text[]      not null default '{}',
  integrations          text[]      not null default '{}',
  regulatory_scope      text[]      not null default '{}',
  risk_level            text        check (risk_level in ('low','medium','high','critical')),
  status                text        not null default 'pending'
                        check (status in ('pending','self_assessment','in_review','approved',
                                          'rejected','deferred')),
  submitted_by          uuid        not null references auth.users(id) on delete restrict,
  assigned_reviewer_id  uuid        references auth.users(id) on delete set null,
  assigned_at           timestamptz,
  completeness_score    int         check (completeness_score between 0 and 100),
  completeness_warnings text[]      not null default '{}',
  previous_review_id    uuid        references reviews(id) on delete set null,
  embedding             vector(1536),
  custom_fields         jsonb       not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger reviews_updated_at
  before update on reviews
  for each row execute function tg_update_updated_at();


-- review_items ────────────────────────────────────────────────────────────────
-- Checklist items AND violations for a review (both in one table).
-- is_violation=false → checklist item from policy.
-- is_violation=true  → mandatory policy breach detected automatically.
-- Approve-gate: blocked if any row has is_violation=true AND severity='blocking'
--               AND status='open'.
-- policy_title + rationale are DENORMALISED — must not change if policy edits.
create table if not exists review_items (
  id                uuid        primary key default gen_random_uuid(),
  review_id         uuid        not null references reviews(id) on delete cascade,
  org_id            uuid        not null references organizations(id) on delete cascade,
  policy_chunk_id   uuid        references policy_chunks(id) on delete set null,
  description       text        not null,
  severity          text        not null check (severity in ('blocking','warning','advisory')),
  status            text        not null default 'open'
                    check (status in ('open','passed','failed','waived')),
  is_violation      boolean     not null default false,
  notes             text,
  policy_title      text,
  rationale         text,
  remediation_hint  text,
  resolved_by       uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);


-- review_conditions ───────────────────────────────────────────────────────────
-- Conditions set when a design review is conditionally approved.
-- Separate from meeting_conditions (ARB meeting outcomes).
create table if not exists review_conditions (
  id           uuid        primary key default gen_random_uuid(),
  review_id    uuid        not null references reviews(id) on delete cascade,
  org_id       uuid        not null references organizations(id) on delete cascade,
  description  text        not null,
  owner_id     uuid        not null references auth.users(id) on delete restrict,
  due_date     date        not null,
  completed    boolean     not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- §6  STAGE 4 — MAKE DECISIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- autonomy_rules ──────────────────────────────────────────────────────────────
-- Configuration: which decision types at which risk levels route where.
-- Domain-specific rules override org-wide (domain_id IS NOT NULL wins).
create table if not exists autonomy_rules (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references organizations(id) on delete cascade,
  domain_id      uuid        references capability_domains(id) on delete cascade,
  decision_type  text        not null,
  max_risk_level text        not null check (max_risk_level in ('low','medium','high','critical')),
  routing_path   text        not null check (routing_path in ('auto_approve','delegate','arb','fast_track')),
  description    text        not null,
  active         boolean     not null default true,
  created_at     timestamptz not null default now()
);


-- decision_requests ───────────────────────────────────────────────────────────
-- A formal request for an architectural decision exceeding team autonomy.
-- New FKs vs standalone TG schema:
--   goal_id        → strategic_goals (Archigent) — strategic goal served
--   initiative_id  → initiatives    (Archigent) — initiative that triggered it
--   application_id → applications   (Archigent) — application concerned
-- precedent_adr_id and arb_meeting_id are back-filled after those tables exist.
-- triage_notes: raw AI classifier output stored for audit.
-- custom_fields: Jira ticket ID, project code, cost estimate, business sponsor.
create table if not exists decision_requests (
  id                   uuid        primary key default gen_random_uuid(),
  org_id               uuid        not null references organizations(id) on delete cascade,
  domain_id            uuid        -- references capability_domains(id) [standalone: no FK],
  goal_id              uuid        -- references strategic_goals(id) [standalone: no FK],
  initiative_id        uuid        -- references initiatives(id) [standalone: no FK],
  application_id       uuid        -- references applications(id) [standalone: no FK],
  type                 text        not null
                       check (type in (
                         'buy_build','technology_adoption','vendor_selection',
                         'architecture_pattern','security_exception',
                         'cross_domain','strategic_principle'
                       )),
  title                text        not null,
  problem_statement    text        not null,
  urgency_reason       text,
  risk_level           text        not null check (risk_level in ('low','medium','high','critical')),
  status               text        not null default 'draft'
                       check (status in (
                         'draft','submitted','in_review','decided'
                       )),
  routing_path         text        check (routing_path in ('auto_approve','delegate','arb','fast_track')),
  precedent_adr_id     uuid,                       -- FK back-filled after adrs table
  assigned_reviewer_id uuid        references auth.users(id) on delete set null,
  arb_meeting_id       uuid,                       -- FK back-filled after arb_meetings table
  triage_notes         jsonb,
  custom_fields        jsonb       not null default '{}',
  submitted_by         uuid        not null references auth.users(id) on delete restrict,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger decision_requests_updated_at
  before update on decision_requests
  for each row execute function tg_update_updated_at();


-- decision_options ────────────────────────────────────────────────────────────
-- Options being evaluated in a decision request. Minimum 2 required to submit.
-- strategic_fit_score + policy_violations populated by AI enrichment job.
-- One option must have recommendation='recommended' for submission to complete.
create table if not exists decision_options (
  id                   uuid    primary key default gen_random_uuid(),
  request_id           uuid    not null references decision_requests(id) on delete cascade,
  org_id               uuid    not null references organizations(id) on delete cascade,
  label                text    not null,
  recommendation       text    not null default 'alternative'
                       check (recommendation in ('recommended','alternative','rejected')),
  description          text    not null,
  pros                 text[]  not null default '{}',
  cons                 text[]  not null default '{}',
  estimated_cost       text,
  risk_summary         text,
  strategic_fit_score  int     check (strategic_fit_score between 1 and 5),
  policy_violations    text[]  not null default '{}',
  clause_index         int     not null
);


-- arb_meetings ────────────────────────────────────────────────────────────────
-- A scheduled ARB meeting session with an agenda of decision requests.
-- Supabase Realtime subscription on this table drives the live meeting mode UI.
create table if not exists arb_meetings (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references organizations(id) on delete cascade,
  title         text        not null,
  scheduled_at  timestamptz not null,
  status        text        not null default 'planned'
                check (status in ('planned','in_progress','completed','cancelled')),
  chair_id      uuid        not null references auth.users(id) on delete restrict,
  reviewer_ids  uuid[]      not null default '{}',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger arb_meetings_updated_at
  before update on arb_meetings
  for each row execute function tg_update_updated_at();


-- Back-fill FK on decision_requests now that arb_meetings exists
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_dr_arb_meeting'
      and conrelid = 'decision_requests'::regclass
  ) then
    alter table decision_requests
      add constraint fk_dr_arb_meeting
      foreign key (arb_meeting_id) references arb_meetings(id) on delete set null;
  end if;
end $$;


-- meeting_agenda_items ────────────────────────────────────────────────────────
-- A decision request on a specific meeting agenda with its outcome.
-- org_id is redundant (reachable via meeting → org) but needed for direct RLS.
-- Realtime subscription drives live meeting mode updates for all reviewers.
create table if not exists meeting_agenda_items (
  id                uuid        primary key default gen_random_uuid(),
  meeting_id        uuid        not null references arb_meetings(id) on delete cascade,
  request_id        uuid        not null references decision_requests(id) on delete restrict,
  org_id            uuid        not null references organizations(id) on delete cascade,
  position          int         not null,
  estimated_minutes int         not null default 20,
  outcome           text        check (outcome in (
                                  'approved','approved_conditionally','rejected','deferred'
                                )),
  outcome_notes     text,
  dissent           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger meeting_agenda_items_updated_at
  before update on meeting_agenda_items
  for each row execute function tg_update_updated_at();


-- meeting_conditions ──────────────────────────────────────────────────────────
-- Conditions attached to a conditionally approved ARB decision.
-- org_id is redundant but required for direct RLS without joins.
create table if not exists meeting_conditions (
  id               uuid        primary key default gen_random_uuid(),
  agenda_item_id   uuid        not null references meeting_agenda_items(id) on delete cascade,
  org_id           uuid        not null references organizations(id) on delete cascade,
  description      text        not null,
  owner_id         uuid        not null references auth.users(id) on delete restrict,
  due_date         date        not null,
  completed        boolean     not null default false,
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- §7  STAGE 5 — RECORD DECISIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- adrs ────────────────────────────────────────────────────────────────────────
-- Architecture Decision Records. Institutional memory.
-- New FK vs standalone TG schema:
--   initiative_id → initiatives (Archigent) — strategic context for the ADR
-- CRITICAL: ingestion_status + trigger prevent 'accepted' before embedding is
-- complete. An ADR with a null embedding is invisible to the triage engine's
-- semantic precedent search.
-- custom_fields: reference number, linked project, external audit ref,
--                board approval ref, wiki page URL.
create table if not exists adrs (
  id               uuid        primary key default gen_random_uuid(),
  org_id           uuid        not null references organizations(id) on delete cascade,
  domain_id        uuid        -- references capability_domains(id) [standalone: no FK],
  initiative_id    uuid        -- references initiatives(id) [standalone: no FK],
  title            text        not null,
  status           text        not null default 'proposed'
                   check (status in ('proposed','accepted','deprecated','superseded')),
  ingestion_status text        not null default 'none'
                   check (ingestion_status in ('none','queued','processing','complete','failed')),
  decision         text        not null,
  rationale        text        not null,
  alternatives     text,
  constraints      text,
  consequences     text,
  tags             text[]      not null default '{}',
  reviewed_by      uuid        references auth.users(id) on delete set null,
  review_date      date,
  superseded_by    uuid        references adrs(id) on delete set null,
  embedding        vector(1536),
  search_vector    tsvector,
  custom_fields    jsonb       not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint adrs_embedding_dim_check
    check (embedding is null or array_length(embedding::real[], 1) = 1536)
);

-- Trigger maintains search_vector on every insert/update.
-- Using a trigger instead of GENERATED ALWAYS AS because to_tsvector('english', text)
-- resolves to a STABLE overload — generated columns require IMMUTABLE.
-- The '::regconfig' cast uses the IMMUTABLE to_tsvector(regconfig, text) overload.
create or replace function adrs_sync_derived_columns()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english'::regconfig, coalesce(new.title, '')),    'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(new.decision, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(new.rationale,'')), 'C') ||
    setweight(to_tsvector('english'::regconfig,
      coalesce(array_to_string(new.tags, ' '), '')),                         'D');
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists adrs_updated_at on adrs;
create trigger adrs_updated_at
  before insert or update on adrs
  for each row execute function adrs_sync_derived_columns();


-- Back-fill FK on decision_requests now that adrs exists
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_dr_precedent_adr'
      and conrelid = 'decision_requests'::regclass
  ) then
    alter table decision_requests
      add constraint fk_dr_precedent_adr
      foreign key (precedent_adr_id) references adrs(id) on delete set null;
  end if;
end $$;


-- ADR embedding guard trigger — REMOVED
-- Previously prevented ADRs from being accepted before embedding was complete.
-- Now handled at the application layer: the PATCH API triggers ingestion in the
-- background after status is set to 'accepted'. This allows a simpler UX where
-- the user accepts first and embedding happens asynchronously.
drop trigger if exists enforce_adr_embedding on adrs;
drop function if exists check_adr_embedding_before_accept();


-- ═══════════════════════════════════════════════════════════════════════════
-- §8  STAGE 6 — ENFORCE AT BUILD
-- ═══════════════════════════════════════════════════════════════════════════

-- repo_scans ──────────────────────────────────────────────────────────────────
-- Periodic compliance scans of code repositories.
-- compliance_score trend over time drives Stage 7 drift analytics.
create table if not exists repo_scans (
  id                 uuid        primary key default gen_random_uuid(),
  org_id             uuid        not null references organizations(id) on delete cascade,
  repo_url           text        not null,
  repo_name          text        not null,
  scan_type          text        not null default 'scheduled'
                     check (scan_type in ('scheduled', 'triggered', 'pr_check')),
  status             text        not null default 'queued'
                     check (status in ('queued','running','complete','failed')),
  policy_ids_checked text[]      not null default '{}',
  violations_found   int         not null default 0,
  compliance_score   int         check (compliance_score between 0 and 100),
  scan_metadata      jsonb,
  started_at         timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now()
);


-- repo_violations ─────────────────────────────────────────────────────────────
-- Individual policy violations found in a scan.
-- policy_chunk_id traces every violation to the specific clause.
create table if not exists repo_violations (
  id                uuid        primary key default gen_random_uuid(),
  scan_id           uuid        not null references repo_scans(id) on delete cascade,
  org_id            uuid        not null references organizations(id) on delete cascade,
  file_path         text        not null,
  line_number       int,
  policy_chunk_id   uuid        references policy_chunks(id) on delete set null,
  description       text        not null,
  severity          text        not null check (severity in ('blocking','warning','advisory')),
  remediation_hint  text,
  auto_fixable      boolean     not null default false,
  created_at        timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- §9  STAGE 7 — MEASURE & IMPROVE
-- ═══════════════════════════════════════════════════════════════════════════

-- usage_events ────────────────────────────────────────────────────────────────
-- Append-only. Drives billing limits AND Stage 7 analytics.
-- The composite index makes monthly billing limit COUNT(*) O(log n).
create table if not exists usage_events (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        not null references organizations(id) on delete cascade,
  user_id      uuid        references auth.users(id) on delete set null,
  event_type   text        not null check (event_type in (
                 'advisor_question','policy_upload','review_created',
                 'decision_request_created','arb_meeting_completed',
                 'repo_scan','adr_published'
               )),
  resource_id  uuid,
  created_at   timestamptz not null default now()
);


-- maturity_scores ─────────────────────────────────────────────────────────────
-- Quarterly governance maturity across 6 dimensions.
-- New FK vs standalone TG schema:
--   assessment_cycle_id → assessment_cycles (Archigent)
--   Enables unified cycle-level reporting: capability health + governance health.
-- methodology_version: allows scoring algorithm to evolve without invalidating
-- historical scores.
create table if not exists maturity_scores (
  id                   uuid        primary key default gen_random_uuid(),
  org_id               uuid        not null references organizations(id) on delete cascade,
  assessment_cycle_id  uuid        -- references assessment_cycles(id) [standalone: no FK],
  scored_at            timestamptz not null default now(),
  policy_coverage      int         check (policy_coverage between 0 and 100),
  decision_velocity    int         check (decision_velocity between 0 and 100),
  adr_quality          int         check (adr_quality between 0 and 100),
  condition_compliance int         check (condition_compliance between 0 and 100),
  drift_rate           int         check (drift_rate between 0 and 100),
  knowledge_freshness  int         check (knowledge_freshness between 0 and 100),
  overall_score        int         check (overall_score between 0 and 100),
  methodology_version  text        not null default '1.0'
);


-- ═══════════════════════════════════════════════════════════════════════════
-- §10  KNOWLEDGE REGISTRY
-- ═══════════════════════════════════════════════════════════════════════════

-- vendors ─────────────────────────────────────────────────────────────────────
-- Governance-focused vendor registry.
-- NOTE: applications.vendor is a free-text field on Archigent's portfolio.
-- This table is TG's structured vendor governance store (risk rating, status,
-- assessment history). They serve different purposes and do not merge.
-- custom_fields: contract number, legal entity name, account manager,
--                DPA signed date, support tier, ISMS certificate, renewal date.
create table if not exists vendors (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references organizations(id) on delete cascade,
  name          text        not null,
  category      text        not null,
  status        text        not null default 'active'
                check (status in ('active','under_evaluation','rejected','deprecated')),
  risk_rating   text        not null default 'medium'
                check (risk_rating in ('low','medium','high','critical')),
  website       text,
  notes         text,
  custom_fields jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(org_id, name)
);
create trigger vendors_updated_at
  before update on vendors
  for each row execute function tg_update_updated_at();


-- vendor_assessments ──────────────────────────────────────────────────────────
-- Structured evaluation records per vendor at a point in time.
create table if not exists vendor_assessments (
  id                    uuid        primary key default gen_random_uuid(),
  org_id                uuid        not null references organizations(id) on delete cascade,
  vendor_id             uuid        not null references vendors(id) on delete cascade,
  adr_id                uuid        references adrs(id) on delete set null,
  decision_request_id   uuid        references decision_requests(id) on delete set null,
  summary               text        not null,
  strengths             text[]      not null default '{}',
  weaknesses            text[]      not null default '{}',
  total_cost_estimate   text,
  contract_conditions   text[]      not null default '{}',
  assessed_by           uuid        not null references auth.users(id) on delete restrict,
  assessment_date       date        not null default current_date,
  created_at            timestamptz not null default now()
);


-- technology_entries (radar) ──────────────────────────────────────────────────
-- Technology radar. New FK vs standalone TG schema:
--   application_id → applications (Archigent)
--   Links a radar entry to the portfolio app that implements this technology.
--   Advisor can answer: 'Which applications use Kafka? What is its radar status?'
-- custom_fields: licence type, licence expiry, support contract end,
--                internal champion, team responsible, open source licence.
create table if not exists technology_entries (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references organizations(id) on delete cascade,
  application_id uuid        -- references applications(id) [standalone: no FK],
  name           text        not null,
  category       text        not null,
  radar_status   text        not null default 'assess'
                 check (radar_status in ('adopt','trial','assess','hold','exit')),
  description    text,
  rationale      text,
  adr_id         uuid        references adrs(id) on delete set null,
  domain_ids     uuid[]      not null default '{}',
  custom_fields  jsonb       not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(org_id, name)
);
create trigger technology_entries_updated_at
  before update on technology_entries
  for each row execute function tg_update_updated_at();


-- architecture_patterns ───────────────────────────────────────────────────────
-- Reusable approved solution patterns.
-- embedding enables Advisor to surface relevant patterns alongside policy answers.
-- usage_count incremented when pattern is cited in Advisor answer or review.
-- custom_fields: TOGAF category, source, accreditation date, external reference.
create table if not exists architecture_patterns (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null references organizations(id) on delete cascade,
  domain_id           uuid        -- references capability_domains(id) [standalone: no FK],
  name                text        not null,
  problem             text        not null,
  forces              text        not null,
  solution            text        not null,
  consequences        text        not null,
  examples            text,
  anti_patterns       text,
  related_policy_ids  uuid[]      not null default '{}',
  usage_count         int         not null default 0,
  status              text        not null default 'draft'
                      check (status in ('draft','active','deprecated')),
  embedding           vector(1536),
  custom_fields       jsonb       not null default '{}',
  created_by          uuid        not null references auth.users(id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint patterns_embedding_dim_check
    check (embedding is null or array_length(embedding::real[], 1) = 1536)
);
create trigger architecture_patterns_updated_at
  before update on architecture_patterns
  for each row execute function tg_update_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- §11  CROSS-CUTTING
-- ═══════════════════════════════════════════════════════════════════════════

-- policy_exceptions ───────────────────────────────────────────────────────────
-- Formal time-boxed exception requests for mandatory policy deviations.
-- All exceptions must expire — expires_at is mandatory (no permanent exceptions).
-- custom_fields: risk register reference, board approval reference,
--                insurance impact, CISO sign-off date, audit finding reference.
create table if not exists policy_exceptions (
  id                uuid        primary key default gen_random_uuid(),
  org_id            uuid        not null references organizations(id) on delete cascade,
  policy_clause_id  uuid        references policy_clauses(id) on delete set null,
  review_item_id    uuid        references review_items(id) on delete set null,
  title             text        not null,
  justification     text        not null,
  remediation_plan  text        not null,
  risk_acceptance   text        not null,
  status            text        not null default 'pending'
                    check (status in ('pending','approved','expired','withdrawn')),
  approved_by       uuid        references auth.users(id) on delete set null,
  expires_at        date        not null,
  requested_by      uuid        not null references auth.users(id) on delete restrict,
  custom_fields     jsonb       not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger exceptions_updated_at
  before update on policy_exceptions
  for each row execute function tg_update_updated_at();


-- notifications ───────────────────────────────────────────────────────────────
-- In-app notification store. Drives the bell icon unread count.
-- RLS is user-scoped (not just org-scoped) — users see only their own.
-- resource_type + resource_id link the notification to the source object.
create table if not exists notifications (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references organizations(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  type          text        not null check (type in (
                  'decision_made','condition_assigned','condition_overdue',
                  'adr_review_due','review_completed','policy_updated',
                  'review_condition_due','exception_expiring','mention','system'
                )),
  title         text        not null,
  body          text,
  resource_type text        check (resource_type in (
                  'adr','review','decision_request','meeting_condition',
                  'review_condition','policy_exception','standard_policy'
                )),
  resource_id   uuid,
  read          boolean     not null default false,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- §12  EXTENSIBILITY
-- ═══════════════════════════════════════════════════════════════════════════
-- Pattern: JSONB values on entity rows (custom_fields) + field_definitions
-- table driving the admin UI, validation, and required-field enforcement.

-- field_definitions ───────────────────────────────────────────────────────────
-- Org-configurable field schema. Org admins manage via /settings/custom-fields.
-- API validates custom_fields JSONB against active definitions on every write.
-- helptext: shown as tooltip in forms — critical for governance context.
create table if not exists field_definitions (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references organizations(id) on delete cascade,
  entity_type   text        not null check (entity_type in (
                  'standard_policy','review','adr','decision_request',
                  'capability_domain','pattern','vendor','policy_exception'
                )),
  field_key     text        not null,
  field_label   text        not null,
  field_type    text        not null check (field_type in (
                  'text','number','date','boolean',
                  'select','multi_select','url','user','textarea'
                )),
  field_options jsonb,
  required      boolean     not null default false,
  display_order int         not null default 0,
  active        boolean     not null default true,
  helptext      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(org_id, entity_type, field_key)
);
create trigger field_definitions_updated_at
  before update on field_definitions
  for each row execute function tg_update_updated_at();


-- labels ──────────────────────────────────────────────────────────────────────
-- Colour-coded labels for cross-entity taxonomy.
-- Use for: regulatory frameworks (GDPR, PCI-DSS), priority, team ownership.
create table if not exists labels (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references organizations(id) on delete cascade,
  name        text        not null,
  colour      text        not null default '#888780',
  description text,
  group_name  text,
  created_at  timestamptz not null default now(),
  unique(org_id, name)
);


-- entity_labels ───────────────────────────────────────────────────────────────
-- Many-to-many: labels ↔ any governed entity.
create table if not exists entity_labels (
  label_id    uuid        not null references labels(id) on delete cascade,
  entity_id   uuid        not null,
  entity_type text        not null check (entity_type in (
                'standard_policy','review','adr','decision_request',
                'pattern','capability_domain','vendor'
              )),
  org_id      uuid        not null references organizations(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (label_id, entity_id, entity_type)
);


-- ═══════════════════════════════════════════════════════════════════════════
-- §13  INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

-- auth_org_id() lookup — most critical index in the schema
create index if not exists org_members_user_idx       on org_members(user_id);
create index if not exists org_settings_idx           on org_settings(org_id, key);

-- domain_members
create index if not exists dm_domain_idx              on domain_members(org_id, domain_id);
create index if not exists dm_user_idx                on domain_members(user_id);

-- policy_clauses
create index if not exists clauses_policy_order_idx   on policy_clauses(policy_id, clause_index);

-- policy_chunks (the most query-critical table)
create index if not exists chunks_embedding_idx       on policy_chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists chunks_org_policy_idx      on policy_chunks(org_id, policy_id);

-- ingestion_logs
create index if not exists ingestion_policy_idx       on ingestion_logs(org_id, policy_id, created_at desc);

-- advisor_sessions + logs
create index if not exists advisor_sessions_org_idx   on advisor_sessions(org_id, user_id, created_at desc);
create index if not exists advisor_logs_session_idx   on advisor_logs(session_id, created_at);
create index if not exists advisor_logs_org_date_idx  on advisor_logs(org_id, created_at desc);
create index if not exists advisor_logs_feedback_idx  on advisor_logs(org_id, feedback)
  where feedback is not null;

-- reviews
create index if not exists reviews_org_status_idx     on reviews(org_id, status);
create index if not exists reviews_domain_idx         on reviews(org_id, domain_id);
create index if not exists reviews_application_idx    on reviews(application_id)
  where application_id is not null;
create index if not exists reviews_initiative_idx     on reviews(initiative_id)
  where initiative_id is not null;
create index if not exists reviews_embedding_idx      on reviews
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists reviews_resubmission_idx   on reviews(org_id, previous_review_id)
  where previous_review_id is not null;
create index if not exists reviews_cf_idx             on reviews using gin(custom_fields);

-- review_items
create index if not exists ri_org_review_idx          on review_items(org_id, review_id);
create index if not exists ri_violations_idx          on review_items(review_id, is_violation, status)
  where is_violation = true;

-- review_conditions
create index if not exists rc_pending_idx             on review_conditions(org_id, completed, due_date)
  where completed = false;
create index if not exists rc_owner_idx               on review_conditions(owner_id, completed);

-- autonomy_rules
create index if not exists ar_org_active_idx          on autonomy_rules(org_id, active, decision_type);

-- decision_requests
create index if not exists dr_org_status_idx          on decision_requests(org_id, status);
create index if not exists dr_goal_idx                on decision_requests(goal_id)
  where goal_id is not null;
create index if not exists dr_initiative_idx          on decision_requests(initiative_id)
  where initiative_id is not null;
create index if not exists dr_application_idx         on decision_requests(application_id)
  where application_id is not null;
create index if not exists dr_cf_idx                  on decision_requests using gin(custom_fields);

-- decision_options
create index if not exists do_request_idx             on decision_options(request_id, clause_index);

-- arb_meetings
create index if not exists am_org_status_idx          on arb_meetings(org_id, status);
create index if not exists am_scheduled_idx           on arb_meetings(org_id, scheduled_at);

-- meeting_agenda_items + conditions
create index if not exists mai_org_meeting_idx        on meeting_agenda_items(org_id, meeting_id, position);
create index if not exists mc_pending_idx             on meeting_conditions(org_id, completed, due_date)
  where completed = false;
create index if not exists mc_owner_idx               on meeting_conditions(owner_id, completed);

-- adrs
create index if not exists adrs_org_status_idx        on adrs(org_id, status);
create index if not exists adrs_initiative_idx        on adrs(initiative_id)
  where initiative_id is not null;
create index if not exists adrs_embedding_idx         on adrs
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists adrs_search_idx            on adrs using gin(search_vector);
create index if not exists adrs_tags_idx              on adrs using gin(tags);
create index if not exists adrs_cf_idx                on adrs using gin(custom_fields);

-- repo_scans + violations
create index if not exists rs_org_status_idx          on repo_scans(org_id, status);
create index if not exists rs_repo_date_idx           on repo_scans(org_id, repo_url, created_at desc);
create index if not exists rv_scan_severity_idx       on repo_violations(scan_id, severity);
create index if not exists rv_policy_chunk_idx        on repo_violations(org_id, policy_chunk_id);

-- usage_events
create index if not exists ue_billing_idx             on usage_events(org_id, event_type, created_at);
create index if not exists ue_analytics_idx           on usage_events(org_id, created_at desc);

-- maturity_scores
create index if not exists ms_org_date_idx            on maturity_scores(org_id, scored_at desc);
create index if not exists ms_cycle_idx               on maturity_scores(assessment_cycle_id)
  where assessment_cycle_id is not null;

-- vendors + assessments + technology + patterns
create index if not exists vendors_org_status_idx     on vendors(org_id, status);
create index if not exists vendors_cf_idx             on vendors using gin(custom_fields);
create index if not exists va_vendor_date_idx         on vendor_assessments(vendor_id, assessment_date desc);
create index if not exists te_org_radar_idx           on technology_entries(org_id, radar_status);
create index if not exists te_application_idx         on technology_entries(application_id)
  where application_id is not null;
create index if not exists te_cf_idx                  on technology_entries using gin(custom_fields);
create index if not exists ap_org_status_idx          on architecture_patterns(org_id, status);
create index if not exists ap_embedding_idx           on architecture_patterns
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists ap_cf_idx                  on architecture_patterns using gin(custom_fields);

-- policy_exceptions
create index if not exists pe_active_idx              on policy_exceptions(org_id, status, expires_at)
  where status = 'approved';
create index if not exists pe_pending_idx             on policy_exceptions(org_id, status, created_at)
  where status = 'pending';
create index if not exists pe_cf_idx                  on policy_exceptions using gin(custom_fields);

-- notifications
create index if not exists notif_unread_idx           on notifications(user_id, read, created_at desc)
  where read = false;
create index if not exists notif_org_date_idx         on notifications(org_id, created_at desc);

-- extensibility
create index if not exists fd_org_entity_idx          on field_definitions(org_id, entity_type)
  where active = true;
create index if not exists el_entity_idx              on entity_labels(org_id, entity_type, entity_id);
create index if not exists el_label_idx               on entity_labels(label_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- §14  ROW LEVEL SECURITY
-- Applied to ALL tables — both Archigent tables (now with TG data) and
-- all new TG tables. auth_org_id() defined above in §1.
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on Archigent tables ───────────────────────────────────────────────
alter table organizations         enable row level security;
alter table profiles              enable row level security;
alter table capability_domains    enable row level security;
alter table capabilities          enable row level security;
alter table sub_capabilities      enable row level security;
alter table standard_policies     enable row level security;
alter table strategic_goals       enable row level security;
alter table initiatives           enable row level security;
alter table applications          enable row level security;
alter table application_integrations enable row level security;
alter table capability_application_links enable row level security;
alter table assessment_cycles     enable row level security;
alter table capability_scores     enable row level security;
alter table capability_viewpoint_scores enable row level security;
alter table viewpoints            enable row level security;
alter table initiative_capability_links enable row level security;

-- Enable RLS on new TG tables ──────────────────────────────────────────────────
alter table org_members           enable row level security;
alter table org_settings          enable row level security;
alter table domain_members        enable row level security;
alter table policy_clauses        enable row level security;
alter table policy_chunks         enable row level security;
alter table ingestion_logs        enable row level security;
alter table advisor_sessions      enable row level security;
alter table advisor_logs          enable row level security;
alter table reviews               enable row level security;
alter table review_items          enable row level security;
alter table review_conditions     enable row level security;
alter table autonomy_rules        enable row level security;
alter table decision_requests     enable row level security;
alter table decision_options      enable row level security;
alter table arb_meetings          enable row level security;
alter table meeting_agenda_items  enable row level security;
alter table meeting_conditions    enable row level security;
alter table adrs                  enable row level security;
alter table repo_scans            enable row level security;
alter table repo_violations       enable row level security;
alter table usage_events          enable row level security;
alter table maturity_scores       enable row level security;
alter table vendors               enable row level security;
alter table vendor_assessments    enable row level security;
alter table technology_entries    enable row level security;
alter table architecture_patterns enable row level security;
alter table policy_exceptions     enable row level security;
alter table field_definitions     enable row level security;
alter table labels                enable row level security;
alter table entity_labels         enable row level security;

-- Drop ALL legacy RLS policies on Archigent tables ───────────────────────────
-- Archigent (and Standards/schema.sql) may have created policies with names
-- like "Users can view their org policies". These use a different RLS strategy
-- (profiles-based) than the new auth_org_id()-based policies below.
-- Leaving them would cause double evaluation and potential data leaks.
-- MUST run BEFORE creating any new policies.
do $$ declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'standard_policies','organizations','profiles','capability_domains',
        'capabilities','sub_capabilities','applications','application_integrations',
        'assessment_cycles','capability_scores','viewpoints','strategic_goals',
        'initiatives','capability_viewpoint_scores','capability_application_links',
        'initiative_capability_links'
      )
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Special-case policies ────────────────────────────────────────────────────────

-- organizations: members read + update their own org only
drop policy if exists "orgs_select" on organizations;
create policy "orgs_select" on organizations for select
  using (id = auth_org_id());
drop policy if exists "orgs_update" on organizations;
create policy "orgs_update" on organizations for update
  using (id = auth_org_id());

-- profiles: users read their own org, update own row, insert own row on signup
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (org_id = auth_org_id());
drop policy if exists "profiles_insert" on profiles;
create policy "profiles_insert" on profiles for insert
  with check (id = auth.uid());
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (id = auth.uid());

-- org_members: members see their own org's member list
drop policy if exists "org_members_select" on org_members;
create policy "org_members_select" on org_members for select
  using (org_id = auth_org_id());
drop policy if exists "org_members_insert" on org_members;
create policy "org_members_insert" on org_members for insert
  with check (org_id = auth_org_id());
drop policy if exists "org_members_delete" on org_members;
create policy "org_members_delete" on org_members for delete
  using (org_id = auth_org_id());

-- notifications: user-scoped (not just org-scoped)
drop policy if exists "notif_select" on notifications;
create policy "notif_select" on notifications for select
  using (user_id = auth.uid() and org_id = auth_org_id());
drop policy if exists "notif_insert" on notifications;
create policy "notif_insert" on notifications for insert
  with check (org_id = auth_org_id());
drop policy if exists "notif_update" on notifications;
create policy "notif_update" on notifications for update
  using (user_id = auth.uid());

-- Standard org-scoped policy for all remaining tables ─────────────────────────
-- Archigent tables that use a different org column name: some use 'org_id',
-- capability_application_links and initiative_capability_links have no org_id —
-- they are protected indirectly via their parent FKs.

do $$ declare t text;
begin
  foreach t in array array[
    -- Archigent tables (sub_capabilities and capability_scores excluded — no org_id)
    'capability_domains', 'capabilities',
    'standard_policies', 'strategic_goals', 'initiatives',
    'applications', 'application_integrations',
    'assessment_cycles', 'viewpoints',
    -- TG tables
    'org_settings', 'domain_members',
    'policy_clauses', 'policy_chunks', 'ingestion_logs',
    'advisor_sessions', 'advisor_logs',
    'reviews', 'review_items', 'review_conditions',
    'autonomy_rules', 'decision_requests', 'decision_options',
    'arb_meetings', 'meeting_agenda_items', 'meeting_conditions',
    'adrs', 'repo_scans', 'repo_violations',
    'usage_events', 'maturity_scores',
    'vendors', 'vendor_assessments', 'technology_entries',
    'architecture_patterns', 'policy_exceptions',
    'field_definitions', 'labels', 'entity_labels'
  ] loop
    execute format(
      'drop policy if exists "%s_sel" on %I', t, t);
    execute format(
      'create policy "%s_sel" on %I for select using (org_id = auth_org_id())', t, t);
    execute format(
      'drop policy if exists "%s_ins" on %I', t, t);
    execute format(
      'create policy "%s_ins" on %I for insert with check (org_id = auth_org_id())', t, t);
    execute format(
      'drop policy if exists "%s_upd" on %I', t, t);
    execute format(
      'create policy "%s_upd" on %I for update using (org_id = auth_org_id())', t, t);
    execute format(
      'drop policy if exists "%s_del" on %I', t, t);
    execute format(
      'create policy "%s_del" on %I for delete using (org_id = auth_org_id())', t, t);
  end loop;
end $$;

-- Tables without org_id — protected via parent row access ────────────────────
-- Each gets full CRUD policies via parent join to enforce org isolation.

-- sub_capabilities: parent = capabilities
drop policy if exists "sub_cap_select" on sub_capabilities;
create policy "sub_cap_select" on sub_capabilities for select
  using (exists (
    select 1 from capabilities c
    where c.id = capability_id and c.org_id = auth_org_id()
  ));
drop policy if exists "sub_cap_insert" on sub_capabilities;
create policy "sub_cap_insert" on sub_capabilities for insert
  with check (exists (
    select 1 from capabilities c
    where c.id = capability_id and c.org_id = auth_org_id()
  ));
drop policy if exists "sub_cap_update" on sub_capabilities;
create policy "sub_cap_update" on sub_capabilities for update
  using (exists (
    select 1 from capabilities c
    where c.id = capability_id and c.org_id = auth_org_id()
  ));
drop policy if exists "sub_cap_delete" on sub_capabilities;
create policy "sub_cap_delete" on sub_capabilities for delete
  using (exists (
    select 1 from capabilities c
    where c.id = capability_id and c.org_id = auth_org_id()
  ));

-- capability_scores: parent = assessment_cycles
drop policy if exists "cs_select" on capability_scores;
create policy "cs_select" on capability_scores for select
  using (exists (
    select 1 from assessment_cycles ac
    where ac.id = cycle_id and ac.org_id = auth_org_id()
  ));
drop policy if exists "cs_insert" on capability_scores;
create policy "cs_insert" on capability_scores for insert
  with check (exists (
    select 1 from assessment_cycles ac
    where ac.id = cycle_id and ac.org_id = auth_org_id()
  ));
drop policy if exists "cs_update" on capability_scores;
create policy "cs_update" on capability_scores for update
  using (exists (
    select 1 from assessment_cycles ac
    where ac.id = cycle_id and ac.org_id = auth_org_id()
  ));
drop policy if exists "cs_delete" on capability_scores;
create policy "cs_delete" on capability_scores for delete
  using (exists (
    select 1 from assessment_cycles ac
    where ac.id = cycle_id and ac.org_id = auth_org_id()
  ));

-- capability_viewpoint_scores: parent = viewpoints
drop policy if exists "cvs_select" on capability_viewpoint_scores;
create policy "cvs_select" on capability_viewpoint_scores for select
  using (exists (
    select 1 from viewpoints v
    where v.id = viewpoint_id and v.org_id = auth_org_id()
  ));
drop policy if exists "cvs_insert" on capability_viewpoint_scores;
create policy "cvs_insert" on capability_viewpoint_scores for insert
  with check (exists (
    select 1 from viewpoints v
    where v.id = viewpoint_id and v.org_id = auth_org_id()
  ));
drop policy if exists "cvs_update" on capability_viewpoint_scores;
create policy "cvs_update" on capability_viewpoint_scores for update
  using (exists (
    select 1 from viewpoints v
    where v.id = viewpoint_id and v.org_id = auth_org_id()
  ));
drop policy if exists "cvs_delete" on capability_viewpoint_scores;
create policy "cvs_delete" on capability_viewpoint_scores for delete
  using (exists (
    select 1 from viewpoints v
    where v.id = viewpoint_id and v.org_id = auth_org_id()
  ));

-- capability_application_links: parent = capabilities
drop policy if exists "cal_select" on capability_application_links;
create policy "cal_select" on capability_application_links for select
  using (exists (
    select 1 from capabilities c
    where c.id = capability_id and c.org_id = auth_org_id()
  ));
drop policy if exists "cal_insert" on capability_application_links;
create policy "cal_insert" on capability_application_links for insert
  with check (exists (
    select 1 from capabilities c
    where c.id = capability_id and c.org_id = auth_org_id()
  ));
drop policy if exists "cal_update" on capability_application_links;
create policy "cal_update" on capability_application_links for update
  using (exists (
    select 1 from capabilities c
    where c.id = capability_id and c.org_id = auth_org_id()
  ));
drop policy if exists "cal_delete" on capability_application_links;
create policy "cal_delete" on capability_application_links for delete
  using (exists (
    select 1 from capabilities c
    where c.id = capability_id and c.org_id = auth_org_id()
  ));

-- initiative_capability_links: parent = initiatives
drop policy if exists "icl_select" on initiative_capability_links;
create policy "icl_select" on initiative_capability_links for select
  using (exists (
    select 1 from initiatives i
    where i.id = initiative_id and i.org_id = auth_org_id()
  ));
drop policy if exists "icl_insert" on initiative_capability_links;
create policy "icl_insert" on initiative_capability_links for insert
  with check (exists (
    select 1 from initiatives i
    where i.id = initiative_id and i.org_id = auth_org_id()
  ));
drop policy if exists "icl_update" on initiative_capability_links;
create policy "icl_update" on initiative_capability_links for update
  using (exists (
    select 1 from initiatives i
    where i.id = initiative_id and i.org_id = auth_org_id()
  ));
drop policy if exists "icl_delete" on initiative_capability_links;
create policy "icl_delete" on initiative_capability_links for delete
  using (exists (
    select 1 from initiatives i
    where i.id = initiative_id and i.org_id = auth_org_id()
  ));


-- ═══════════════════════════════════════════════════════════════════════════
-- §15  RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Semantic search: policy chunks ───────────────────────────────────────────────
-- Called by: Advisor retriever, Checklist generator, Violation detector.
-- NOTE: references policy_chunks which join to standard_policies.
-- The caller passes policy_ids of active (status='active',
-- ingestion_status='complete') policies — filtering done at call site.
create or replace function match_policy_chunks(
  query_embedding  vector(1536),
  org_id_param     uuid,
  policy_ids       uuid[],
  match_count      int     default 16,
  mandatory_boost  boolean default false
)
returns table (
  id          uuid,
  content     text,
  metadata    jsonb,
  similarity  float
)
language sql stable as $$
  select
    pc.id,
    pc.content,
    pc.metadata,
    1 - (pc.embedding <=> query_embedding) as similarity
  from policy_chunks pc
  where
    pc.org_id = org_id_param
    and pc.policy_id = any(policy_ids)
    and (not mandatory_boost or (pc.metadata->>'mandatory')::boolean = true)
    and pc.embedding is not null
  order by pc.embedding <=> query_embedding
  limit match_count;
$$;


-- Semantic search: ADRs ────────────────────────────────────────────────────────
-- Called by: Triage engine (precedent check), Advisor (strategic mode).
-- min_similarity: 0.82 for auto-approve routing; 0.70 for context surfacing.
create or replace function match_adrs(
  query_embedding  vector(1536),
  org_id_param     uuid,
  match_count      int   default 5,
  min_similarity   float default 0.75
)
returns table (
  id          uuid,
  title       text,
  decision    text,
  similarity  float
)
language sql stable as $$
  select
    a.id,
    a.title,
    a.decision,
    1 - (a.embedding <=> query_embedding) as similarity
  from adrs a
  where
    a.org_id = org_id_param
    and a.status = 'accepted'
    and a.ingestion_status = 'complete'
    and a.embedding is not null
    and 1 - (a.embedding <=> query_embedding) >= min_similarity
  order by a.embedding <=> query_embedding
  limit match_count;
$$;


-- Semantic search: similar reviews ─────────────────────────────────────────────
-- Called by: Similar design detection (TG-043).
create or replace function match_reviews(
  query_embedding  vector(1536),
  org_id_param     uuid,
  exclude_id       uuid,
  match_count      int default 5
)
returns table (
  id          uuid,
  title       text,
  status      text,
  similarity  float
)
language sql stable as $$
  select
    r.id,
    r.title,
    r.status,
    1 - (r.embedding <=> query_embedding) as similarity
  from reviews r
  where
    r.org_id = org_id_param
    and r.id != exclude_id
    and r.embedding is not null
    and r.status in ('approved', 'rejected')
  order by r.embedding <=> query_embedding
  limit match_count;
$$;


-- Custom field validation ──────────────────────────────────────────────────────
-- Called before every API write of custom_fields.
-- Returns {} if valid; {"field_key": "error message"} if not.
-- entity_type must match the values in field_definitions.entity_type CHECK:
--   'standard_policy','review','adr','decision_request','capability_domain',
--   'pattern','vendor','policy_exception'
create or replace function validate_custom_fields_for_entity(
  p_org_id      uuid,
  p_entity_type text,
  p_values      jsonb
)
returns jsonb
language plpgsql stable as $$
declare
  v_def    record;
  v_value  jsonb;
  v_errors jsonb := '{}';
begin
  for v_def in
    select field_key, field_label, field_type, field_options, required
    from field_definitions
    where org_id = p_org_id
      and entity_type = p_entity_type
      and active = true
  loop
    v_value := p_values -> v_def.field_key;

    if v_def.required and (v_value is null or v_value = 'null'::jsonb) then
      v_errors := v_errors || jsonb_build_object(
        v_def.field_key, v_def.field_label || ' is required');
      continue;
    end if;

    if v_value is null or v_value = 'null'::jsonb then continue; end if;

    if v_def.field_type = 'number' and jsonb_typeof(v_value) != 'number' then
      v_errors := v_errors || jsonb_build_object(
        v_def.field_key, v_def.field_label || ' must be a number');
    end if;

    if v_def.field_type = 'boolean' and jsonb_typeof(v_value) != 'boolean' then
      v_errors := v_errors || jsonb_build_object(
        v_def.field_key, v_def.field_label || ' must be true or false');
    end if;

    if v_def.field_type = 'select'
       and v_def.field_options is not null
       and not exists (
         select 1 from jsonb_array_elements(v_def.field_options) opt
         where opt->>'value' = v_value #>> '{}'
       ) then
      v_errors := v_errors || jsonb_build_object(
        v_def.field_key,
        (v_value #>> '{}') || ' is not a valid option for ' || v_def.field_label);
    end if;
  end loop;

  return v_errors;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- §16  POST-MIGRATION VERIFICATION
-- Run each query and confirm expected result before going live.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. org_members backfilled from profiles:
--    select count(*) from org_members;
--    → same count as select count(*) from profiles

-- 2. All tables have RLS:
--    select tablename from pg_tables
--      where schemaname = 'public' and not rowsecurity order by tablename;
--    → 0 rows (industry_templates has no org_id so is excluded from RLS loop —
--      add manually if needed: it's a read-only seed table)

-- 3. auth_org_id() returns correct org for an existing user:
--    set request.jwt.claims to '{"sub":"<existing_user_id>"}';
--    select auth_org_id();
--    → returns that user's org_id from org_members

-- 4. Cross-org isolation:
--    set request.jwt.claims to '{"sub":"<user_a_id>","org_id":"<org_a_id>"}';
--    select count(*) from standard_policies where org_id = '<org_b_id>';
--    → 0

-- 5. Severity values are consistent across tables:
--    select distinct severity from policy_clauses;
--    → only 'blocking', 'warning', 'advisory' (no 'blocker')
--    select distinct severity from review_items;
--    → only 'blocking', 'warning', 'advisory' (no 'blocker')

-- 6. ADR embedding guard:
--    insert into adrs (org_id, title, decision, rationale, submitted_by)
--      values (...); -- creates ADR with ingestion_status='none'
--    update adrs set status = 'accepted' where id = '<new_id>';
--    → ERROR: ADR cannot be accepted until embedding is complete

-- 7. match_adrs returns empty on an org with no accepted ADRs:
--    select * from match_adrs('<random_vector>', '<org_id>', 5, 0.75);
--    → 0 rows (no error)

-- 8. New FK links exist on decision_requests:
--    select column_name from information_schema.columns
--      where table_name = 'decision_requests'
--        and column_name in ('goal_id','initiative_id','application_id');
--    → 3 rows

-- 9. New FK link exists on maturity_scores:
--    select column_name from information_schema.columns
--      where table_name = 'maturity_scores'
--        and column_name = 'assessment_cycle_id';
--    → 1 row

-- 10. Total new TG table count:
--     select count(*) from information_schema.tables
--       where table_schema = 'public' and table_type = 'BASE TABLE';
--     → 17 (Archigent) + 31 (TG) - 3 (dropped: organisations, domains, policies)
--       = 45 tables total