import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import OpenAI from "openai";

function makeClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });

  const body = await req.json();
  const { content, type } = body as { content: string; type: "document" | "repo" };

  if (!content?.trim()) {
    return NextResponse.json({ error: "No content provided" }, { status: 400 });
  }

  const supabase = makeClient(ctx.token);

  // Fetch approved + active standards for the org (context injection)
  const { data: standards, error: stdError } = await supabase
    .from("standard_policies")
    .select("policy_id, rule_statement, rule_rationale, rule_severity, domain, subdomain, remediation_hint")
    .eq("org_id", ctx.orgId)
    .in("status", ["approved", "active"])
    .order("policy_id");

  if (stdError) {
    return NextResponse.json({ error: stdError.message }, { status: 400 });
  }

  if (!standards || standards.length === 0) {
    return NextResponse.json({ error: "No approved or active standards found. Please approve standards first." }, { status: 400 });
  }

  // Build standards context for the system prompt
  const standardsList = standards.map((s) =>
    `[${s.policy_id}] (${s.domain}/${s.subdomain}) [${s.rule_severity}]\nRule: ${s.rule_statement}\nRationale: ${s.rule_rationale}\nRemediation: ${s.remediation_hint}`
  ).join("\n\n");

  const systemPrompt = `You are an architecture compliance verification agent. You have been given a set of approved architecture standards. Your job is to analyze the provided ${type === "repo" ? "code repository description" : "solution document"} and determine compliance with each standard.

## APPROVED STANDARDS (${standards.length} total)

${standardsList}

## INSTRUCTIONS

For each standard above, evaluate the provided content and determine:
- "compliant" — the content meets the standard
- "non_compliant" — the content violates the standard
- "not_applicable" — the standard does not apply to this content
- "needs_review" — insufficient information to determine compliance

Return a JSON object with this exact structure:
{
  "summary": { "total": number, "compliant": number, "nonCompliant": number, "notApplicable": number, "needsReview": number },
  "results": [
    {
      "policy_id": "POL-XXXX",
      "policy_statement": "the rule statement",
      "severity": "blocking|warning|advisory",
      "status": "compliant|non_compliant|not_applicable|needs_review",
      "findings": "specific explanation of what was found",
      "evidence": "specific reference to the content that supports the finding",
      "remediation": "if non_compliant, specific steps to fix"
    }
  ]
}

Return ONLY valid JSON, no markdown, no explanation.`;

  const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze the following ${type === "repo" ? "repository/code" : "document"} for compliance:\n\n${content}` },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const report = JSON.parse(raw);

    return NextResponse.json({
      ...report,
      timestamp: new Date().toISOString(),
      standardsCount: standards.length,
    });
  } catch (e) {
    console.error("[compliance-check] error:", e);
    return NextResponse.json({ error: "Compliance check failed. Please try again." }, { status: 500 });
  }
});
