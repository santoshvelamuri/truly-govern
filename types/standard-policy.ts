export interface StandardPolicy {
  id: string;
  org_id: string;
  policy_id: string;
  version: string;
  status: "draft" | "in_review" | "approved" | "active" | "deprecated";
  domain: string;
  tech_domain_id?: string | null;
  subdomain: string;
  tags: string[];
  rule_statement: string;
  rule_rationale: string;
  rule_severity: "blocking" | "warning" | "advisory";
  rule_examples: { compliant?: string[]; non_compliant?: string[] };
  scope: Record<string, unknown>;
  remediation_hint: string;
  remediation_docs_url?: string;
  provenance: {
    sources: { type: string; ref: string; section?: string }[];
    confidence: number;
  };
  created_at: string;
  created_by?: string;
  approved_at?: string;
  approved_by?: string;
  review_date?: string;
  updated_at: string;
  source_document?: string;
  source_section?: string;
}
