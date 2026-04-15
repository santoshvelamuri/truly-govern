export type UUID = string;

export type Severity = "blocking" | "warning" | "advisory";
export type GovernanceLayer = "org" | "domain";
export type IngestionStatus = "none" | "queued" | "processing" | "complete" | "failed";
export type PolicyStatus = "draft" | "in_review" | "approved" | "active" | "deprecated";
export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected" | "deferred";
export type AdrStatus = "proposed" | "accepted" | "deprecated" | "superseded";
export type DecisionType =
  | "buy_build"
  | "technology_adoption"
  | "vendor_selection"
  | "architecture_pattern"
  | "security_exception"
  | "cross_domain"
  | "strategic_principle";
export type DecisionRouting = "auto_approve" | "delegate" | "arb" | "fast_track";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Confidence = "high" | "medium" | "low";

export interface Domain {
  id: UUID;
  org_id: UUID;
  name: string;
  description: string | null;
  parent_domain_id: UUID | null;
  layer: GovernanceLayer;
  color: string | null;
  archived: boolean;
  created_at: string;
}

export interface TechnologyDomain {
  id: UUID;
  org_id: UUID;
  name: string;
  description: string | null;
  icon: string | null;
  colour: string;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Policy {
  id: UUID;
  org_id: UUID;
  policy_id: string;
  tech_domain_id: UUID | null;
  title: string | null;
  version: string;
  status: PolicyStatus;
  domain: string;
  subdomain: string;
  tags: string[];
  rule_statement: string;
  rule_rationale: string;
  rule_severity: Severity;
  rule_examples: Record<string, unknown>;
  scope: Record<string, unknown>;
  remediation_hint: string;
  remediation_docs_url: string | null;
  provenance: Record<string, unknown>;
  source_type: "authored" | "document";
  source_document: string | null;
  source_section: string | null;
  layer: GovernanceLayer;
  mandatory: boolean;
  ingestion_status: IngestionStatus;
  effective_date: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  review_date: string | null;
}

export interface PolicyClause {
  id: UUID;
  policy_id: UUID;
  org_id: UUID;
  heading: string;
  content: string;
  severity: Severity;
  clause_index: number;
  created_at: string;
  updated_at: string;
}

export interface AdvisorSession {
  id: UUID;
  org_id: UUID;
  user_id: UUID | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdvisorMessage {
  id: UUID;
  org_id: UUID;
  user_id: UUID | null;
  session_id: UUID | null;
  question: string;
  answer: string;
  confidence: Confidence | null;
  policy_ids_used: string[];
  had_conflict: boolean;
  feedback: "helpful" | "not_helpful" | null;
  feedback_note: string | null;
  tokens_used: number | null;
  duration_ms: number | null;
  created_at: string;
}

export interface PolicyCitation {
  policy_id: UUID;
  chunk_content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface Review {
  id: UUID;
  org_id: UUID;
  domain_id: UUID | null;
  application_id: UUID | null;
  initiative_id: UUID | null;
  title: string;
  description: string | null;
  tech_stack: string[];
  integrations: string[];
  regulatory_scope: string[];
  risk_level: RiskLevel | null;
  status: ReviewStatus;
  submitted_by: UUID;
  completeness_score: number | null;
  completeness_warnings: string[];
  previous_review_id: UUID | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ReviewItem {
  id: UUID;
  review_id: UUID;
  org_id: UUID;
  policy_chunk_id: UUID | null;
  description: string;
  severity: Severity;
  status: "open" | "passed" | "failed" | "waived";
  is_violation: boolean;
  notes: string | null;
  policy_title: string | null;
  rationale: string | null;
  remediation_hint: string | null;
  resolved_by: UUID | null;
  created_at: string;
}

export interface ReviewCondition {
  id: UUID;
  review_id: UUID;
  org_id: UUID;
  description: string;
  owner_id: UUID;
  due_date: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface Adr {
  id: UUID;
  org_id: UUID;
  domain_id: UUID | null;
  initiative_id: UUID | null;
  title: string;
  status: AdrStatus;
  ingestion_status: IngestionStatus;
  decision: string;
  rationale: string;
  alternatives: string | null;
  constraints: string | null;
  consequences: string | null;
  tags: string[];
  reviewed_by: UUID | null;
  review_date: string | null;
  superseded_by: UUID | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DecisionRequest {
  id: UUID;
  org_id: UUID;
  domain_id: UUID | null;
  goal_id: UUID | null;
  initiative_id: UUID | null;
  application_id: UUID | null;
  type: DecisionType;
  title: string;
  problem_statement: string;
  urgency_reason: string | null;
  risk_level: RiskLevel;
  status: string;
  routing_path: DecisionRouting | null;
  precedent_adr_id: UUID | null;
  assigned_reviewer_id: UUID | null;
  arb_meeting_id: UUID | null;
  triage_notes: Record<string, unknown> | null;
  custom_fields: Record<string, unknown>;
  submitted_by: UUID;
  created_at: string;
  updated_at: string;
}

export interface DecisionOption {
  id: UUID;
  request_id: UUID;
  org_id: UUID;
  label: string;
  recommendation: "recommended" | "alternative" | "rejected";
  description: string;
  pros: string[];
  cons: string[];
  estimated_cost: string | null;
  risk_summary: string | null;
  strategic_fit_score: number | null;
  policy_violations: string[];
  clause_index: number;
}

export interface ArbBoard {
  id: UUID;
  org_id: UUID;
  name: string;
  scope: "domain_arb" | "department_arb" | "enterprise_arb";
  scope_type: "domain_scoped" | "topic_scoped";
  governed_domain_ids: UUID[];
  governed_decision_types: string[];
  parent_arb_id: UUID | null;
  chair_id: UUID;
  quorum_count: number;
  meeting_cadence: "weekly" | "biweekly" | "monthly" | "ad_hoc";
  active: boolean;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ArbBoardMember {
  id: UUID;
  board_id: UUID;
  user_id: UUID;
  org_id: UUID;
  role: "chair" | "reviewer" | "observer";
  expertise_tags: string[];
  created_at: string;
}

export interface ArbMeeting {
  id: UUID;
  org_id: UUID;
  title: string;
  scheduled_at: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  chair_id: UUID;
  reviewer_ids: UUID[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Pattern Library ──────────────────────────────────────────────────────────

export type PatternStatus = "draft" | "in_review" | "approved" | "deprecated";
export type PatternClauseType = "constraint" | "guidance" | "variant";

export interface ArchitecturePattern {
  id: UUID;
  org_id: UUID;
  domain_id: UUID | null;
  name: string;
  problem: string;
  forces: string;
  solution: string;
  consequences: string;
  examples: string | null;
  anti_patterns: string | null;
  when_to_use: string | null;
  when_not_to_use: string | null;
  related_policy_ids: UUID[];
  usage_count: number;
  status: PatternStatus;
  completeness_score: number | null;
  known_uses: string[];
  superseded_by: UUID | null;
  created_by: UUID;
  approved_by: UUID | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PatternClause {
  id: UUID;
  pattern_id: UUID;
  org_id: UUID;
  clause_type: PatternClauseType;
  title: string;
  description: string;
  policy_clause_id: UUID | null;
  severity: Severity | null;
  clause_number: number;
  created_at: string;
  updated_at: string;
}

export interface PatternReviewLink {
  id: UUID;
  pattern_id: UUID | null;
  review_id: UUID;
  org_id: UUID;
  match_type: "declared" | "detected";
  similarity_score: number | null;
  created_at: string;
}

export interface PatternSuggestion {
  id: UUID;
  org_id: UUID;
  title: string;
  problem: string;
  solution_overview: string;
  source_review_ids: UUID[];
  confidence: "low" | "medium" | "high" | null;
  status: "pending" | "dismissed" | "created";
  created_at: string;
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface TGNotification {
  id: UUID;
  org_id: UUID;
  user_id: UUID;
  event_type: string;
  entity_type: string | null;
  entity_id: UUID | null;
  title: string;
  body: string | null;
  action_label: string | null;
  action_url: string | null;
  urgent: boolean;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreference {
  id: UUID;
  org_id: UUID;
  user_id: UUID;
  event_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  digest_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeetingAgendaItem {
  id: UUID;
  meeting_id: UUID;
  request_id: UUID;
  org_id: UUID;
  position: number;
  estimated_minutes: number;
  outcome: "approved" | "approved_conditionally" | "rejected" | "deferred" | null;
  outcome_notes: string | null;
  dissent: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingCondition {
  id: UUID;
  agenda_item_id: UUID;
  org_id: UUID;
  description: string;
  owner_id: UUID;
  due_date: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

// ── Governance Deviations ────────────────────────────────────────────────────

export type DeviationSourceType = "condition" | "waiver" | "exception";
export type DeviationStatus = "open" | "pending_verification" | "overdue" | "expiring" | "expired" | "resolved" | "renewed";

export interface GovernanceDeviation {
  id: UUID;
  org_id: UUID;
  source_type: DeviationSourceType;
  source_id: UUID;
  service_name: string | null;
  domain_id: UUID | null;
  policy_clause_id: UUID | null;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  owner_id: UUID | null;
  due_date: string | null;
  expiry_date: string | null;
  status: DeviationStatus;
  debt_score: number;
  escalation_level: number;
  resolution_evidence: string | null;
  resolved_at: string | null;
  resolved_by: UUID | null;
  created_at: string;
}

export interface GovernanceRiskEntry {
  id: UUID;
  org_id: UUID;
  deviation_id: UUID;
  escalated_at: string;
  acknowledged_by: UUID | null;
  acknowledged_at: string | null;
  notes: string | null;
  created_at: string;
}
