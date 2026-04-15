import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";

const CHECKLIST_SYSTEM_PROMPT = `You are an architecture governance reviewer generating a compliance checklist for a solution design submission.

You will be given:
1. A solution design submission with title, description, tech stack, hosting, data classification, regulatory scope, and NFRs.
2. The organisation's active governance policies with their clauses.

Your task: Generate a structured checklist of items that the reviewer should verify for compliance.

Rules:
- Each item must cite a specific policy and clause.
- Assign severity: "blocking" (must comply), "warning" (should comply), "advisory" (nice to have).
- Group items by category: Security, Data, API & Integration, Infrastructure, Operational, Compliance.
- Flag items where the submission explicitly violates a policy (set is_violation=true).
- Be specific — don't generate generic items. Each item should reference the actual tech stack or design described.
- Generate 8-20 items depending on complexity. Simple submissions get fewer items.
- Include a brief rationale explaining WHY this check matters for this specific submission.
- Include a remediation_hint for items that fail.

Output format: JSON object with a "items" array. Each item:
{
  "description": "What to verify",
  "severity": "blocking" | "warning" | "advisory",
  "category": "Security" | "Data" | "API & Integration" | "Infrastructure" | "Operational" | "Compliance",
  "policy_title": "Name of the referenced policy",
  "clause_heading": "Specific clause heading",
  "rationale": "Why this matters for this submission",
  "remediation_hint": "How to comply if this fails",
  "is_violation": false
}`;

interface ReviewData {
  id: string;
  title: string;
  description: string | null;
  tech_stack: string[];
  integrations: string[];
  regulatory_scope: string[];
  risk_level: string | null;
  custom_fields: Record<string, unknown>;
}

export async function generateChecklist(reviewId: string, orgId: string): Promise<void> {
  const start = Date.now();

  try {
    // 1. Load the review
    const { data: review, error: revErr } = await supabaseAdmin
      .from("reviews")
      .select("*")
      .eq("id", reviewId)
      .single();

    if (revErr || !review) {
      console.error("[checklist] Review not found:", revErr?.message);
      return;
    }

    // 2. Load all active policies with clauses for this org
    const { data: policies } = await supabaseAdmin
      .from("standard_policies")
      .select("title, policy_id, domain, rule_statement, rule_severity, mandatory, tags")
      .eq("org_id", orgId)
      .in("status", ["active", "approved"]);

    const { data: clauses } = await supabaseAdmin
      .from("policy_clauses")
      .select("policy_id, heading, content, severity")
      .in("policy_id", (policies ?? []).map((p: { title: string }) => p).length > 0
        ? await supabaseAdmin
            .from("standard_policies")
            .select("id")
            .eq("org_id", orgId)
            .in("status", ["active", "approved"])
            .then(r => (r.data ?? []).map((p: { id: string }) => p.id))
        : []
      );

    // Build policy context string
    let policyContext = "## Organisation Policies\n\n";
    for (const p of policies ?? []) {
      policyContext += `### ${(p as Record<string, unknown>).title ?? (p as Record<string, unknown>).policy_id}\n`;
      policyContext += `Domain: ${(p as Record<string, unknown>).domain} | Severity: ${(p as Record<string, unknown>).rule_severity} | Mandatory: ${(p as Record<string, unknown>).mandatory}\n`;
      policyContext += `${(p as Record<string, unknown>).rule_statement}\n`;

      const policyClauses = (clauses ?? []).filter((c: Record<string, unknown>) => c.policy_id === (p as Record<string, unknown>).id);
      for (const c of policyClauses) {
        policyContext += `  - Clause: ${(c as Record<string, unknown>).heading} [${(c as Record<string, unknown>).severity}]: ${(c as Record<string, unknown>).content}\n`;
      }
      policyContext += "\n";
    }

    // Build submission context
    const cf = review.custom_fields as Record<string, unknown>;
    const submissionContext = `## Solution Design Submission

Title: ${review.title}
Description: ${review.description ?? "Not provided"}
Tech Stack: ${review.tech_stack?.join(", ") || "Not specified"}
Integrations: ${review.integrations?.join(", ") || "None"}
Hosting: ${cf.hosting ?? "Not specified"}${cf.cloud_provider ? ` (${cf.cloud_provider})` : ""}
Data Classification: ${Array.isArray(cf.data_classification) ? (cf.data_classification as string[]).join(", ") : "Not specified"}
Regulatory Scope: ${review.regulatory_scope?.join(", ") || "None"}
Risk Level: ${review.risk_level ?? "Not specified"}
Expected RPS: ${cf.expected_rps ?? "Not specified"}
Availability Target: ${cf.availability_target ?? "Not specified"}
RTO: ${cf.rto_hours ? `${cf.rto_hours} hours` : "Not specified"}
RPO: ${cf.rpo_hours ? `${cf.rpo_hours} hours` : "Not specified"}
Data Retention: ${cf.data_retention_years ? `${cf.data_retention_years} years` : "Not specified"}
Additional NFRs: ${cf.additional_nfrs ?? "None"}`;

    // 3. Call OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");

    const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
    const model = process.env.TG_ADVISOR_MODEL ?? "gpt-4o";

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: CHECKLIST_SYSTEM_PROMPT },
        { role: "user", content: `${submissionContext}\n\n${policyContext}` },
      ],
      temperature: 0.2,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.checklist ?? []);

    console.log(`[checklist] Generated ${items.length} items for review ${reviewId} in ${Date.now() - start}ms`);

    // 4. Insert review items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = items.map((item: any) => ({
      review_id: reviewId,
      org_id: orgId,
      description: item.description ?? "",
      severity: item.severity ?? "warning",
      status: "open",
      is_violation: item.is_violation ?? false,
      policy_title: item.policy_title ?? null,
      rationale: item.rationale ?? null,
      remediation_hint: item.remediation_hint ?? null,
      notes: item.category ? `Category: ${item.category}` : null,
    }));

    if (rows.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from("review_items")
        .insert(rows);

      if (insertErr) {
        console.error("[checklist] Insert error:", insertErr.message);
        throw insertErr;
      }
    }

    // 5. Update review status to self_assessment (owner reviews checklist first)
    await supabaseAdmin
      .from("reviews")
      .update({ status: "self_assessment", updated_at: new Date().toISOString() })
      .eq("id", reviewId);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[checklist] Generation failed:", message);
    // Don't change status on error — leave as submitted so user can retry
  }
}
