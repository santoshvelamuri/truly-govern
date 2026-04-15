import { NextRequest, NextResponse } from "next/server";
import { extractToken, getOrgId, makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const orgId = await getOrgId(supabase);
  if (!orgId) return NextResponse.json({ detail: "org_id missing" }, { status: 401 });

  const { pattern_id, domain_id } = await req.json();

  // Fetch all mandatory policy clauses for the domain (or all domains if cross-domain)
  let mandatoryQuery = supabaseAdmin
    .from("policy_clauses")
    .select("id, heading, policy_id")
    .eq("org_id", orgId)
    .eq("severity", "blocking");

  if (domain_id) {
    // Get policy IDs for this domain's policies
    const { data: domainPolicies } = await supabaseAdmin
      .from("standard_policies")
      .select("id")
      .eq("org_id", orgId)
      .eq("tech_domain_id", domain_id)
      .in("status", ["active", "approved"])
      .eq("mandatory", true);

    const policyIds = (domainPolicies ?? []).map((p: { id: string }) => p.id);
    if (policyIds.length > 0) {
      mandatoryQuery = mandatoryQuery.in("policy_id", policyIds);
    } else {
      return NextResponse.json({ score: 100, covered: [], uncovered: [], total: 0 });
    }
  }

  const { data: mandatoryClauses } = await mandatoryQuery;
  const totalMandatory = mandatoryClauses?.length ?? 0;

  if (totalMandatory === 0) {
    return NextResponse.json({ score: 100, covered: [], uncovered: [], total: 0 });
  }

  // Fetch constraint clauses for this pattern that have a policy_clause_id
  let coveredPolicyClauseIds: string[] = [];
  if (pattern_id) {
    const { data: patternClauses } = await supabaseAdmin
      .from("pattern_clauses")
      .select("policy_clause_id")
      .eq("pattern_id", pattern_id)
      .eq("clause_type", "constraint")
      .not("policy_clause_id", "is", null);

    coveredPolicyClauseIds = (patternClauses ?? []).map((c: { policy_clause_id: string }) => c.policy_clause_id);
  }

  const coveredSet = new Set(coveredPolicyClauseIds);
  const covered = (mandatoryClauses ?? []).filter((c: { id: string }) => coveredSet.has(c.id));
  const uncovered = (mandatoryClauses ?? []).filter((c: { id: string }) => !coveredSet.has(c.id));

  const score = totalMandatory > 0 ? Math.round((covered.length / totalMandatory) * 100) : 100;

  return NextResponse.json({
    score,
    covered: covered.map((c: { id: string; heading: string }) => ({ id: c.id, heading: c.heading })),
    uncovered: uncovered.map((c: { id: string; heading: string }) => ({ id: c.id, heading: c.heading })),
    total: totalMandatory,
  });
}
