import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedQuery, retrieveAdrs } from "@/lib/truly-govern/advisor-agent";
import OpenAI from "openai";

const TRIAGE_SYSTEM_PROMPT = `You are an architecture governance triage assistant. The board has already been assigned by the requester. Your job is to prepare the decision request for the board by:

1. Finding precedent ADRs relevant to this decision
2. Suggesting 2-3 reviewers from the board membership based on domain expertise
3. Estimating complexity (low/medium/high) to aid the chair in scheduling
4. Flagging any active mandatory policies directly relevant to this decision type

Do NOT determine routing — routing is set by the requester via board assignment.

Output a JSON object:
{
  "recommended_reviewers": ["reviewer expertise description 1", "reviewer expertise description 2"],
  "estimated_complexity": "low" | "medium" | "high",
  "policy_flags": ["relevant policy or concern 1", ...],
  "summary": "2-3 sentence preparation summary for the board chair"
}`;

const OPTIONS_ANALYSIS_PROMPT = `You are an architecture options analyst. Given a decision option in context of a problem statement, analyse it.

Output a JSON object:
{
  "pros": ["pro 1", "pro 2", ...],
  "cons": ["con 1", "con 2", ...],
  "strategic_fit_score": 1-5 (5 = perfect fit),
  "risk_summary": "Brief risk assessment",
  "policy_violations": ["policy name: violation description", ...] (empty if none)
}

Be specific and actionable. Reference actual technologies and patterns mentioned.`;

export async function runTriage(requestId: string, orgId: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });

  try {
    // 1. Load the decision request
    const { data: request } = await supabaseAdmin
      .from("decision_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (!request) throw new Error("Decision request not found");

    // 2. Load options
    const { data: options } = await supabaseAdmin
      .from("decision_options")
      .select("*")
      .eq("request_id", requestId)
      .order("clause_index");

    // 3. Search ADR precedents + load board members in parallel
    const [precedentAdrs, boardMembers] = await Promise.all([
      (async () => {
        try {
          const embedding = await embedQuery(request.problem_statement);
          return await retrieveAdrs(embedding, orgId, 3);
        } catch (e) {
          console.warn("[triage] ADR precedent search failed:", e);
          return [] as { id: string; title: string; decision: string; similarity: number }[];
        }
      })(),
      (async () => {
        if (!request.resolved_arb_board_id) return [] as { user_id: string; role: string; expertise_tags: string[] }[];
        const { data: members } = await supabaseAdmin
          .from("arb_board_members")
          .select("user_id, role, expertise_tags")
          .eq("board_id", request.resolved_arb_board_id);
        return members ?? [];
      })(),
    ]);

    // 5. Build triage prompt
    const context = `Decision Request:
Title: ${request.title}
Type: ${request.type}
Risk Level: ${request.risk_level}
Problem: ${request.problem_statement}
${request.urgency_reason ? `Urgency: ${request.urgency_reason}` : ""}

Options (${(options ?? []).length}):
${(options ?? []).map((o: { label: string; description: string }, i: number) => `${i + 1}. ${o.label}: ${o.description}`).join("\n")}

ADR Precedents:
${precedentAdrs.length > 0 ? precedentAdrs.map((a) => `- ${a.title}: ${a.decision} (similarity: ${(a.similarity * 100).toFixed(0)}%)`).join("\n") : "No relevant precedents found."}

Board Members:
${boardMembers.length > 0 ? boardMembers.map((m) => `- ${m.role}: expertise in ${m.expertise_tags.join(", ") || "general"}`).join("\n") : "No board members loaded."}`;

    // 6. Call triage classifier
    const model = process.env.TG_ADVISOR_MODEL ?? "gpt-4o";
    const triageRes = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: TRIAGE_SYSTEM_PROMPT },
        { role: "user", content: context },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const triageRaw = triageRes.choices[0]?.message?.content ?? "{}";
    const triage = JSON.parse(triageRaw);

    console.log(`[triage] Request ${requestId}: complexity=${triage.estimated_complexity}`);

    // 7. Update decision request with triage results
    await supabaseAdmin
      .from("decision_requests")
      .update({
        triage_notes: {
          ...triage,
          precedent_adr_ids: precedentAdrs.map((a) => a.id),
        },
        precedent_adr_id: precedentAdrs[0]?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    // 8. Options analysis (if options exist)
    const fastModel = process.env.TG_FAST_MODEL ?? "gpt-4o-mini";
    for (const opt of options ?? []) {
      try {
        const optContext = `Problem: ${request.problem_statement}\n\nOption: ${(opt as { label: string }).label}\nDescription: ${(opt as { description: string }).description}`;
        const optRes = await openai.chat.completions.create({
          model: fastModel,
          messages: [
            { role: "system", content: OPTIONS_ANALYSIS_PROMPT },
            { role: "user", content: optContext },
          ],
          temperature: 0.2,
          max_tokens: 800,
          response_format: { type: "json_object" },
        });

        const analysis = JSON.parse(optRes.choices[0]?.message?.content ?? "{}");

        await supabaseAdmin
          .from("decision_options")
          .update({
            pros: analysis.pros ?? [],
            cons: analysis.cons ?? [],
            strategic_fit_score: analysis.strategic_fit_score ?? null,
            risk_summary: analysis.risk_summary ?? null,
            policy_violations: analysis.policy_violations ?? [],
          })
          .eq("id", (opt as { id: string }).id);
      } catch (e) {
        console.warn(`[triage] Options analysis failed for ${(opt as { id: string }).id}:`, e);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[triage] Failed:", message);
    // Mark triage as failed so the UI can detect it and offer retry
    await supabaseAdmin
      .from("decision_requests")
      .update({
        triage_notes: { error: message, failed: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);
  }
}
