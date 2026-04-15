import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";

const CLAUSE_SUGGESTER_PROMPT = `Given a policy clause and a pattern's problem/solution context, draft a constraint clause description that explains how this pattern satisfies the policy requirement. Keep to 2-3 sentences. Be specific to the pattern's approach.`;

/**
 * Compute completeness score for a pattern.
 * Deterministic: covered mandatory clauses / total mandatory clauses × 100
 */
export async function computeCompletenessScore(
  patternId: string,
  domainId: string | null,
  orgId: string,
): Promise<{ score: number; covered: { id: string; heading: string }[]; uncovered: { id: string; heading: string }[] }> {
  // Get mandatory policy clauses for the domain
  let policyIds: string[] = [];
  if (domainId) {
    const { data: policies } = await supabaseAdmin
      .from("standard_policies")
      .select("id")
      .eq("org_id", orgId)
      .eq("tech_domain_id", domainId)
      .in("status", ["active", "approved"])
      .eq("mandatory", true);
    policyIds = (policies ?? []).map((p: { id: string }) => p.id);
  } else {
    // Cross-domain: all mandatory policies
    const { data: policies } = await supabaseAdmin
      .from("standard_policies")
      .select("id")
      .eq("org_id", orgId)
      .in("status", ["active", "approved"])
      .eq("mandatory", true);
    policyIds = (policies ?? []).map((p: { id: string }) => p.id);
  }

  if (policyIds.length === 0) return { score: 100, covered: [], uncovered: [] };

  const { data: mandatoryClauses } = await supabaseAdmin
    .from("policy_clauses")
    .select("id, heading")
    .in("policy_id", policyIds)
    .eq("severity", "blocking");

  const total = mandatoryClauses?.length ?? 0;
  if (total === 0) return { score: 100, covered: [], uncovered: [] };

  // Get constraint clauses with policy_clause_id for this pattern
  const { data: patternConstraints } = await supabaseAdmin
    .from("pattern_clauses")
    .select("policy_clause_id")
    .eq("pattern_id", patternId)
    .eq("clause_type", "constraint")
    .not("policy_clause_id", "is", null);

  const coveredIds = new Set((patternConstraints ?? []).map((c: { policy_clause_id: string }) => c.policy_clause_id));

  const covered = (mandatoryClauses ?? []).filter((c: { id: string; heading: string }) => coveredIds.has(c.id));
  const uncovered = (mandatoryClauses ?? []).filter((c: { id: string; heading: string }) => !coveredIds.has(c.id));
  const score = Math.round((covered.length / total) * 100);

  return { score, covered, uncovered };
}

/**
 * AI-suggest a constraint clause description for an uncovered policy clause.
 */
export async function suggestPatternClause(
  policyClauseId: string,
  patternName: string,
  patternProblem: string,
  patternSolution: string,
): Promise<string> {
  const { data: clause } = await supabaseAdmin
    .from("policy_clauses")
    .select("heading, content, severity")
    .eq("id", policyClauseId)
    .single();

  if (!clause) return "";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";

  const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const model = process.env.TG_FAST_MODEL ?? "gpt-4o-mini";

  const context = `Policy clause: ${clause.heading}
Policy requirement: ${clause.content}
Severity: ${clause.severity}

Pattern: ${patternName}
Problem: ${patternProblem}
Solution: ${patternSolution}`;

  const res = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: CLAUSE_SUGGESTER_PROMPT },
      { role: "user", content: context },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });

  return res.choices[0]?.message?.content ?? "";
}
