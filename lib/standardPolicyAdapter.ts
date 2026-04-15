import type { StandardPolicy } from "@/types/standard-policy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbRowToStandardPolicy(row: any): StandardPolicy {
  return {
    id: row.id,
    org_id: row.org_id,
    policy_id: row.policy_id ?? "",
    version: row.version ?? "1.0.0",
    status: row.status ?? "draft",
    domain: row.domain ?? "",
    tech_domain_id: row.tech_domain_id ?? null,
    subdomain: row.subdomain ?? "",
    tags: row.tags ?? [],
    rule_statement: row.rule_statement ?? "",
    rule_rationale: row.rule_rationale ?? "",
    rule_severity: row.rule_severity ?? "warning",
    rule_examples: row.rule_examples ?? {},
    scope: row.scope ?? {},
    remediation_hint: row.remediation_hint ?? "",
    remediation_docs_url: row.remediation_docs_url ?? undefined,
    provenance: row.provenance ?? { sources: [], confidence: 0 },
    created_at: row.created_at ?? "",
    created_by: row.created_by ?? undefined,
    approved_at: row.approved_at ?? undefined,
    approved_by: row.approved_by ?? undefined,
    review_date: row.review_date ?? undefined,
    updated_at: row.updated_at ?? "",
    source_document: row.source_document ?? undefined,
    source_section: row.source_section ?? undefined,
  };
}

export function mapStandardPolicyToDbPayload(
  policy: Partial<StandardPolicy> & { id?: string },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (policy.id !== undefined) payload.id = policy.id;
  if (policy.policy_id !== undefined) payload.policy_id = policy.policy_id;
  if (policy.version !== undefined) payload.version = policy.version;
  if (policy.status !== undefined) payload.status = policy.status;
  if (policy.domain !== undefined) payload.domain = policy.domain;
  if (policy.tech_domain_id !== undefined) payload.tech_domain_id = policy.tech_domain_id;
  if (policy.subdomain !== undefined) payload.subdomain = policy.subdomain;
  if (policy.tags !== undefined) payload.tags = policy.tags;
  if (policy.rule_statement !== undefined) payload.rule_statement = policy.rule_statement;
  if (policy.rule_rationale !== undefined) payload.rule_rationale = policy.rule_rationale;
  if (policy.rule_severity !== undefined) payload.rule_severity = policy.rule_severity;
  if (policy.rule_examples !== undefined) payload.rule_examples = policy.rule_examples;
  if (policy.scope !== undefined) payload.scope = policy.scope;
  if (policy.remediation_hint !== undefined) payload.remediation_hint = policy.remediation_hint;
  if (policy.remediation_docs_url !== undefined) payload.remediation_docs_url = policy.remediation_docs_url || null;
  if (policy.provenance !== undefined) payload.provenance = policy.provenance;
  if (policy.approved_at !== undefined) payload.approved_at = policy.approved_at || null;
  if (policy.approved_by !== undefined) payload.approved_by = policy.approved_by || null;
  if (policy.review_date !== undefined) payload.review_date = policy.review_date || null;
  if (policy.source_document !== undefined) payload.source_document = policy.source_document || null;
  if (policy.source_section !== undefined) payload.source_section = policy.source_section || null;
  return payload;
}
