import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (!text || text.length <= chunkSize) return [text].filter(Boolean);

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      if (lastPeriod > start + chunkSize / 2) end = lastPeriod + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
    if (start >= text.length) break;
  }
  return chunks.filter((c) => c.length > 10);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com"}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
      dimensions: 1536,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding error: ${err}`);
  }

  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

export async function triggerPolicyIngestion(policyId: string, orgId: string): Promise<void> {
  const start = Date.now();

  // Mark as processing
  await supabaseAdmin
    .from("standard_policies")
    .update({ ingestion_status: "processing" })
    .eq("id", policyId);

  try {
    // Get policy content
    const { data: policy } = await supabaseAdmin
      .from("standard_policies")
      .select("rule_statement, rule_rationale, title")
      .eq("id", policyId)
      .single();

    // Get clauses
    const { data: clauses } = await supabaseAdmin
      .from("policy_clauses")
      .select("heading, content, severity")
      .eq("policy_id", policyId)
      .order("clause_index", { ascending: true });

    // Build text to chunk
    const parts: string[] = [];
    if (policy?.title) parts.push(policy.title);
    if (policy?.rule_statement) parts.push(policy.rule_statement);
    if (policy?.rule_rationale) parts.push(policy.rule_rationale);
    if (clauses) {
      for (const c of clauses) {
        parts.push(`${c.heading}: ${c.content}`);
      }
    }

    const fullText = parts.join("\n\n");
    if (!fullText.trim()) {
      await supabaseAdmin.from("standard_policies").update({ ingestion_status: "complete" }).eq("id", policyId);
      return;
    }

    const chunks = chunkText(fullText);

    // Delete existing chunks for this policy
    await supabaseAdmin.from("policy_chunks").delete().eq("policy_id", policyId);

    // Embed in batches of 20
    const batchSize = 20;
    let totalTokens = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await embedBatch(batch);

      const rows = batch.map((content, j) => ({
        org_id: orgId,
        policy_id: policyId,
        chunk_index: i + j,
        content,
        token_count: Math.ceil(content.length / 4),
        embedding: `[${embeddings[j].join(",")}]`,
        metadata: {
          policy_title: policy?.title ?? "",
          chunk_of: chunks.length,
        },
      }));

      totalTokens += rows.reduce((sum, r) => sum + (r.token_count ?? 0), 0);

      const { error } = await supabaseAdmin.from("policy_chunks").insert(rows);
      if (error) throw new Error(`Chunk insert error: ${error.message}`);
    }

    // Log ingestion
    await supabaseAdmin.from("ingestion_logs").insert([{
      org_id: orgId,
      policy_id: policyId,
      source_type: "authored",
      chunks_created: chunks.length,
      tokens_used: totalTokens,
      duration_ms: Date.now() - start,
      status: "success",
    }]);

    // Mark complete
    await supabaseAdmin
      .from("standard_policies")
      .update({ ingestion_status: "complete" })
      .eq("id", policyId);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin.from("standard_policies").update({ ingestion_status: "failed" }).eq("id", policyId);
    await supabaseAdmin.from("ingestion_logs").insert([{
      org_id: orgId,
      policy_id: policyId,
      source_type: "authored",
      chunks_created: 0,
      tokens_used: 0,
      duration_ms: Date.now() - start,
      status: "failed",
      error_message: message,
    }]);
    console.error("[ingestion] Failed:", message);
  }
}
