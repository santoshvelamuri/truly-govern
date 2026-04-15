export const SEVERITY_LABELS = {
  blocking: "Blocking",
  warning: "Warning",
  advisory: "Advisory",
} as const;

export const SEVERITY_COLORS = {
  blocking: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-700",
  advisory: "bg-blue-50 text-blue-700",
} as const;

export const RISK_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
} as const;

export const RISK_COLORS = {
  low: "bg-blue-50 text-blue-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-50 text-orange-700",
  critical: "bg-red-50 text-red-700",
} as const;

export const REVIEW_STATUS_LABELS = {
  pending: "Pending",
  self_assessment: "Self-Assessment",
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  deferred: "Deferred",
} as const;

export const DECISION_STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  decided: "Decided",
} as const;

export const ADR_STATUS_LABELS = {
  proposed: "Proposed",
  accepted: "Accepted",
  deprecated: "Deprecated",
  superseded: "Superseded",
} as const;

export const POLICY_STATUS_LABELS = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  active: "Active",
  deprecated: "Deprecated",
} as const;

export const CONFIDENCE_COLORS = {
  high: "text-emerald-700 bg-emerald-50",
  medium: "text-amber-700 bg-amber-50",
  low: "text-red-700 bg-red-50",
} as const;

export const INGESTION_STATUS_LABELS = {
  none: "Not ingested",
  queued: "Queued",
  processing: "Processing",
  complete: "Complete",
  failed: "Failed",
} as const;

export const PATTERN_STATUS_LABELS = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  deprecated: "Deprecated",
} as const;

export const PATTERN_CLAUSE_TYPE_LABELS = {
  constraint: "Constraint",
  guidance: "Guidance",
  variant: "Variant",
} as const;

export const DEVIATION_STATUS_LABELS = {
  open: "Open",
  pending_verification: "Pending Verification",
  overdue: "Overdue",
  expiring: "Expiring",
  expired: "Expired",
  resolved: "Resolved",
  renewed: "Renewed",
} as const;

export const DEVIATION_SOURCE_LABELS = {
  condition: "Condition",
  waiver: "Waiver",
  exception: "Exception",
} as const;

export const TG_NAV_ITEMS = [
  { section: "Govern", items: [
    { label: "Advisor", href: "/govern/advisor", icon: "MessageSquare" },
    { label: "Policy library", href: "/govern/policies", icon: "Shield" },
    { label: "Pattern library", href: "/govern/patterns", icon: "Layers" },
    { label: "Deviations", href: "/govern/deviations", icon: "AlertTriangle" },
  ]},
  { section: "Review", items: [
    { label: "Design reviews", href: "/govern/reviews", icon: "ClipboardCheck" },
  ]},
  { section: "Decide", items: [
    { label: "Decision requests", href: "/govern/decisions", icon: "GitBranch" },
    { label: "ARB backlog", href: "/govern/arb", icon: "Calendar" },
  ]},
  { section: "Record", items: [
    { label: "ADR library", href: "/govern/adrs", icon: "FileText" },
  ]},
  { section: "Settings", items: [
    { label: "Organisation", href: "/govern/settings", icon: "Settings" },
  ]},
] as const;
