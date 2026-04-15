import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";

const REVIEWER_PROMPT = `You are reviewing an architecture pattern for approval. Generate a checklist of 4-6 specific questions the reviewer must answer before approving.

Consider:
1. Is the problem statement specific enough to prevent misapplication?
2. Does every constraint clause correctly and specifically satisfy the linked policy clause?
3. Is when_not_to_use complete enough to prevent the most likely misuse?
4. Are there mandatory policy clauses in this domain that should be addressed but are not?
5. Is the solution overview accurate and at the right level of abstraction?

Output: JSON object with "items" array. Each item: { "question": "...", "severity": "info" | "warning" | "critical" }`;

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pattern_id } = await req.json();
  if (!pattern_id) return NextResponse.json({ error: "pattern_id required" }, { status: 400 });

  const { data: pattern } = await supabaseAdmin
    .from("architecture_patterns")
    .select("name, problem, solution, when_to_use, when_not_to_use, completeness_score")
    .eq("id", pattern_id)
    .single();

  const { data: clauses } = await supabaseAdmin
    .from("pattern_clauses")
    .select("clause_type, title, description, policy_clause_id, severity")
    .eq("pattern_id", pattern_id)
    .order("clause_number");

  if (!pattern) return NextResponse.json({ error: "Pattern not found" }, { status: 404 });

  const context = `Pattern: ${pattern.name}
Problem: ${pattern.problem}
Solution: ${pattern.solution}
When to use: ${pattern.when_to_use ?? "Not specified"}
When NOT to use: ${pattern.when_not_to_use ?? "Not specified"}
Completeness: ${pattern.completeness_score ?? 0}%
Clauses (${(clauses ?? []).length}):
${(clauses ?? []).map((c: { clause_type: string; title: string; description: string; policy_clause_id: string | null }) => `- [${c.clause_type}] ${c.title}: ${c.description}${c.policy_clause_id ? " (linked to policy)" : ""}`).join("\n")}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const res = await openai.chat.completions.create({
    model: process.env.TG_FAST_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: REVIEWER_PROMPT },
      { role: "user", content: context },
    ],
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
  return NextResponse.json({ items: parsed.items ?? [] });
}
