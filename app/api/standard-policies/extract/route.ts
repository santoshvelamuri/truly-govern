import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const EXTRACTION_PROMPT = `You are an architecture standards extraction engine. The document text may have fragmented words split across lines (e.g. "Infor\\nmati\\non" = "Information") due to PDF extraction. Reconstruct words and sentences before analyzing.

Extract ALL distinct standards/controls into a JSON object with a "policies" array. Each entry:
{
  "id": "POL-XXXX" (sequential: POL-0001, POL-0002, ...),
  "version": "1.0.0",
  "status": "draft",
  "tech_domain": string (a technology domain name — see list below),
  "subdomain": string (e.g. "data-classification", "access-control", "encryption"),
  "tags": string[],
  "rule": {
    "statement": string (the standard requirement text, reconstructed into proper sentences),
    "rationale": string (why this policy exists — the risk or compliance driver),
    "severity": one of ["blocking","warning","advisory"]
  },
  "clauses": [
    {
      "heading": string (clause title — a short name for this specific requirement),
      "content": string (the clause requirement text — a specific, actionable sub-requirement),
      "severity": one of ["blocking","warning","advisory"]
    }
  ],
  "scope": { "applies_to": { "environments": "all", "teams": "all", "tech_stack": "all" } },
  "remediation": { "hint": string (how to comply with this standard) },
  "provenance": { "sources": [{ "type": "document", "ref": "FILENAME", "section": "SECTION_ID" }], "confidence": 0.9 },
  "lifecycle": { "created_at": "TODAY", "created_by": "system", "approved_at": "TODAY", "approved_by": "TDA", "review_date": "REVIEW_DATE" }
}

Technology domain names to use for "tech_domain" (pick the closest match):
TECH_DOMAINS

Rules:
- The document contains a table with columns: Standard, Control, Req ID, Task Title, Task, Additional Guidance
- Each row with a unique Req ID (like IDM.1.1, IAM.3.2, BCM.2.2) is a separate policy
- Extract EVERY row as a separate policy - there should be many (30+)
- Use the Req ID as the section in provenance (e.g. "IDM.1.1")
- The "Task" column is the rule statement; "Additional Guidance" is the rationale
- Security standards should have severity "blocking"
- For each policy, generate 1-5 clauses that break down the requirement into specific, actionable sub-requirements
- Each clause should have a clear heading and detailed content
- Clause severity should match or be less severe than the parent policy severity
- Return {"policies": [...]} as JSON`;

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.orgId;
  const userId = ctx.user.id;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const previewMode = formData.get("preview") === "true";
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const fileName = file.name;
  const ext = fileName.split(".").pop()?.toLowerCase();

  // For JSON files, parse directly and import
  if (ext === "json") {
    const text = await file.text();
    let policies: unknown[];
    try {
      const parsed = JSON.parse(text);
      policies = Array.isArray(parsed) ? parsed : parsed.policies ?? [];
    } catch {
      return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = policies.map((p: any) => ({
      org_id: orgId,
      policy_id: p.id,
      version: p.version ?? "1.0.0",
      status: "draft",
      domain: p.tech_domain || p.domain || "",
      tech_domain_id: null,
      subdomain: p.subdomain,
      tags: p.tags ?? [],
      rule_statement: p.rule?.statement ?? "",
      rule_rationale: p.rule?.rationale ?? "",
      rule_severity: p.rule?.severity ?? "warning",
      rule_examples: p.rule?.examples ?? {},
      scope: p.scope ?? {},
      remediation_hint: p.remediation?.hint ?? "",
      remediation_docs_url: p.remediation?.docs_url ?? null,
      provenance: p.provenance ?? {},
      created_by: userId,
      source_document: fileName,
      source_section: p.provenance?.sources?.[0]?.section ?? null,
    }));
    const { data, error } = await supabaseAdmin
      .from("standard_policies")
      .upsert(rows, { onConflict: "org_id,policy_id" })
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ count: data?.length ?? 0 });
  }

  // Extract text content from the file
  let content: string;
  try {
    if (ext === "pdf") {
      const { extractText } = await import("unpdf");
      const arrayBuffer = await file.arrayBuffer();
      const result = await extractText(new Uint8Array(arrayBuffer));
      content = (result.text as string[]).join("\n\n");
    } else {
      content = await file.text();
    }
  } catch (e) {
    console.error("[extract] file read error:", e);
    return NextResponse.json({ error: "Could not read file content" }, { status: 400 });
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  // Load org's technology domains for the AI prompt
  const { data: techDomains } = await supabaseAdmin
    .from("technology_domains")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("archived", false)
    .order("sort_order");
  const techDomainNames = (techDomains ?? []).map((d: { name: string }) => d.name);
  const techDomainList = techDomainNames.length > 0
    ? techDomainNames.map((n: string) => `- ${n}`).join("\n")
    : "- Security\n- Networking\n- Data & Analytics\n- Cloud Platform\n- Identity & Access\n- API & Integration\n- Observability\n- Compute & Runtime";

  const today = new Date().toISOString().split("T")[0];
  const reviewDate = new Date(Date.now() + 180 * 86400000).toISOString().split("T")[0];
  const prompt = EXTRACTION_PROMPT
    .replace("FILENAME", fileName)
    .replace("TODAY", today)
    .replace("REVIEW_DATE", reviewDate)
    .replace("TECH_DOMAINS", techDomainList);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });

  // Truncate very large documents to ~80K chars (~20K tokens) to stay within limits
  const maxChars = 80000;
  if (content.length > maxChars) {
    content = content.substring(0, maxChars) + "\n\n[Document truncated]";
  }

  console.log(`[extract] Sending ${content.length} chars to ChatGPT for extraction from ${fileName}`);

  let policies: unknown[];
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Extract standards from this document:\n\n${content}` },
      ],
      temperature: 0.1,
      max_tokens: 16000,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    console.log("[extract] ChatGPT response length:", raw.length, "chars");
    console.log("[extract] ChatGPT response preview:", raw.substring(0, 500));
    const parsed = JSON.parse(raw);
    console.log("[extract] Parsed keys:", Object.keys(parsed));
    // Try multiple possible wrapper keys
    if (Array.isArray(parsed)) {
      policies = parsed;
    } else {
      const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      policies = arrayKey ? parsed[arrayKey] : [];
    }
    console.log("[extract] Extracted", policies.length, "policies");
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[extract] ChatGPT error:", errMsg);
    return NextResponse.json({ error: `AI extraction failed: ${errMsg}` }, { status: 500 });
  }

  if (!policies.length) {
    return NextResponse.json({ error: "No standards could be extracted from the document" }, { status: 400 });
  }

  // Build a lookup map for tech domain name → id (case-insensitive)
  const techDomainMap = new Map<string, string>();
  for (const td of techDomains ?? []) {
    techDomainMap.set((td as { id: string; name: string }).name.toLowerCase(), (td as { id: string; name: string }).id);
  }

  function matchTechDomain(name: string): { id: string | null; displayName: string } {
    if (!name) return { id: null, displayName: "" };
    const lower = name.toLowerCase();
    if (techDomainMap.has(lower)) return { id: techDomainMap.get(lower)!, displayName: name };
    for (const [tdName, tdId] of techDomainMap) {
      if (tdName.includes(lower) || lower.includes(tdName)) return { id: tdId, displayName: (techDomains ?? []).find((d: { id: string; name: string }) => d.id === tdId)?.name ?? name };
    }
    return { id: null, displayName: name };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapPolicy(p: any, idx: number) {
    const policyId = p.id || p.policy_id || p.policyId || p.req_id || p.reqId || `POL-${String(idx + 1).padStart(4, "0")}`;
    const rawDomain = p.tech_domain || p.domain || "";
    const matched = matchTechDomain(rawDomain);
    const subdomain = p.subdomain || p.standard || p.category || "";
    const statement = p.rule?.statement || p.statement || p.task || p.description || "";
    const rationale = p.rule?.rationale || p.rationale || p.guidance || p.additional_guidance || "";
    const severity = p.rule?.severity || p.severity || "warning";
    const hint = p.remediation?.hint || p.remediation || statement;
    const clauses = (p.clauses ?? []).map((c: { heading?: string; content?: string; severity?: string }, ci: number) => ({
      heading: c.heading ?? `Clause ${ci + 1}`,
      content: c.content ?? "",
      severity: c.severity ?? severity,
    }));

    console.log(`[extract] Policy ${idx}: id=${policyId}, domain=${matched.displayName}, statement=${statement.substring(0, 80)}`);

    return {
      policy_id: policyId,
      version: p.version ?? "1.0.0",
      domain: matched.displayName,
      tech_domain_id: matched.id,
      subdomain,
      tags: p.tags ?? [],
      rule_statement: statement,
      rule_rationale: rationale,
      rule_severity: severity,
      rule_examples: p.rule?.examples ?? p.examples ?? {},
      scope: p.scope ?? {},
      remediation_hint: hint,
      remediation_docs_url: p.remediation?.docs_url ?? null,
      provenance: p.provenance ?? {},
      source_document: fileName,
      source_section: p.provenance?.sources?.[0]?.section ?? p.req_id ?? p.source_section ?? null,
      clauses,
    };
  }

  const mapped = policies.map(mapPolicy);

  // Preview mode — return policies without inserting
  if (previewMode) {
    return NextResponse.json({ preview: true, policies: mapped });
  }

  // Insert mode — save policies and clauses to DB
  const rows = mapped.map((m) => ({
    org_id: orgId,
    policy_id: m.policy_id,
    version: m.version,
    status: "draft" as const,
    domain: m.domain,
    tech_domain_id: m.tech_domain_id,
    subdomain: m.subdomain,
    tags: m.tags,
    rule_statement: m.rule_statement,
    rule_rationale: m.rule_rationale,
    rule_severity: m.rule_severity,
    rule_examples: m.rule_examples,
    scope: m.scope,
    remediation_hint: m.remediation_hint,
    remediation_docs_url: m.remediation_docs_url,
    provenance: m.provenance,
    created_by: userId,
    source_document: m.source_document,
    source_section: m.source_section,
  }));

  const { data, error } = await supabaseAdmin
    .from("standard_policies")
    .upsert(rows, { onConflict: "org_id,policy_id" })
    .select();

  if (error) {
    console.error("[extract] DB error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Insert clauses for each policy
  if (data) {
    for (const policy of data) {
      const policyMapped = mapped.find((m) => m.policy_id === policy.policy_id);
      if (policyMapped?.clauses?.length) {
        const clauseRows = policyMapped.clauses.map((c: { heading: string; content: string; severity: string }, ci: number) => ({
          policy_id: policy.id,
          org_id: orgId,
          heading: c.heading,
          content: c.content,
          severity: c.severity,
          clause_index: ci,
        }));
        await supabaseAdmin.from("policy_clauses").insert(clauseRows);
      }
    }
  }

  return NextResponse.json({ count: data?.length ?? 0 });
});
