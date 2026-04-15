import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { chunkText } from "@/lib/truly-govern/ingestion";

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com"}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts, dimensions: 1536 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding error: ${err}`);
  }

  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

export async function triggerAdrIngestion(adrId: string, orgId: string): Promise<void> {
  // Mark as processing
  await supabaseAdmin
    .from("adrs")
    .update({ ingestion_status: "processing" })
    .eq("id", adrId);

  try {
    // Load ADR content
    const { data: adr } = await supabaseAdmin
      .from("adrs")
      .select("title, decision, rationale, alternatives, consequences, constraints")
      .eq("id", adrId)
      .single();

    if (!adr) throw new Error("ADR not found");

    // Build full text for embedding
    const parts: string[] = [];
    if (adr.title) parts.push(`ADR: ${adr.title}`);
    if (adr.decision) parts.push(`Decision: ${adr.decision}`);
    if (adr.rationale) parts.push(`Rationale: ${adr.rationale}`);
    if (adr.alternatives) parts.push(`Alternatives: ${adr.alternatives}`);
    if (adr.consequences) parts.push(`Consequences: ${adr.consequences}`);
    if (adr.constraints) parts.push(`Constraints: ${adr.constraints}`);

    const fullText = parts.join("\n\n");
    if (!fullText.trim()) {
      await supabaseAdmin.from("adrs").update({ ingestion_status: "complete" }).eq("id", adrId);
      return;
    }

    // ADRs store a single embedding on the row itself (not chunks).
    // We embed the full concatenated text. If too long, chunk and use the first chunk's embedding.
    const chunks = chunkText(fullText);
    const textToEmbed = chunks[0] ?? fullText.slice(0, 2000);
    const [embedding] = await embedBatch([textToEmbed]);

    // Store embedding directly on the ADR row
    await supabaseAdmin
      .from("adrs")
      .update({
        embedding: `[${embedding.join(",")}]`,
        ingestion_status: "complete",
      })
      .eq("id", adrId);

    console.log(`[adr-ingestion] Embedded ADR ${adrId} (${textToEmbed.length} chars)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[adr-ingestion] Failed:", message);
    await supabaseAdmin
      .from("adrs")
      .update({ ingestion_status: "failed" })
      .eq("id", adrId);
  }
}
