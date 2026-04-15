import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface ClauseInput {
  heading: string;
  content: string;
  severity: string;
}

interface PolicyInput {
  policy_id: string;
  version?: string;
  domain: string;
  tech_domain_id: string | null;
  subdomain: string;
  tags: string[];
  rule_statement: string;
  rule_rationale: string;
  rule_severity: string;
  rule_examples?: Record<string, unknown>;
  scope?: Record<string, unknown>;
  remediation_hint: string;
  remediation_docs_url?: string | null;
  provenance?: Record<string, unknown>;
  source_document: string;
  source_section?: string | null;
  clauses?: ClauseInput[];
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.orgId;
  const userId = ctx.user.id;

  const body = await req.json();
  const policies: PolicyInput[] = body.policies;

  if (!Array.isArray(policies) || !policies.length) {
    return NextResponse.json({ error: "No policies provided" }, { status: 400 });
  }

  // Insert policies
  const rows = policies.map((p) => ({
    org_id: orgId,
    policy_id: p.policy_id,
    version: p.version ?? "1.0.0",
    status: "draft" as const,
    domain: p.domain,
    tech_domain_id: p.tech_domain_id,
    subdomain: p.subdomain,
    tags: p.tags ?? [],
    rule_statement: p.rule_statement,
    rule_rationale: p.rule_rationale,
    rule_severity: p.rule_severity,
    rule_examples: p.rule_examples ?? {},
    scope: p.scope ?? {},
    remediation_hint: p.remediation_hint,
    remediation_docs_url: p.remediation_docs_url ?? null,
    provenance: p.provenance ?? {},
    created_by: userId,
    source_document: p.source_document,
    source_section: p.source_section ?? null,
  }));

  const { data, error } = await supabaseAdmin
    .from("standard_policies")
    .upsert(rows, { onConflict: "org_id,policy_id" })
    .select();

  if (error) {
    console.error("[extract/confirm] DB error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Insert clauses for each policy
  if (data) {
    for (const dbPolicy of data) {
      const inputPolicy = policies.find((p) => p.policy_id === dbPolicy.policy_id);
      if (inputPolicy?.clauses?.length) {
        const clauseRows = inputPolicy.clauses.map((c, ci) => ({
          policy_id: dbPolicy.id,
          org_id: orgId,
          heading: c.heading,
          content: c.content,
          severity: c.severity ?? "warning",
          clause_index: ci,
        }));
        await supabaseAdmin.from("policy_clauses").insert(clauseRows);
      }
    }
  }

  return NextResponse.json({ count: data?.length ?? 0 });
});
