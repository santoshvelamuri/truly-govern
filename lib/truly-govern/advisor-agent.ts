import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChunkResult {
  id: string;
  content: string;
  metadata: {
    policy_title?: string;
    policy_id?: string;
    clause_heading?: string;
    clause_id?: string;
    mandatory?: boolean;
    severity?: string;
    [key: string]: unknown;
  };
  similarity: number;
}

export interface Citation {
  policy_id: string;
  policy_title: string;
  clause_heading: string;
  chunk_content: string;
  similarity: number;
}

export interface AdrResult {
  id: string;
  title: string;
  decision: string;
  similarity: number;
}

export interface AdvisorResult {
  answer: string;
  confidence: "high" | "medium" | "low";
  had_conflict: boolean;
  citations: Citation[];
  policy_ids_used: string[];
  tokens_used: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ADVISOR_SYSTEM_PROMPT = `You are the Truly Govern Governance Advisor — an AI assistant that helps enterprise architects navigate their organisation's architecture standards and policies.

Rules:
- Answer the architect's question using ONLY the retrieved policy chunks and ADR precedents provided in the context below.
- Cite policies with [Policy: {title}, Clause: {heading}] format.
- Cite ADRs with [ADR: {title}] format.
- If policies conflict with each other, say so explicitly — do NOT pick a side silently. Flag the conflict clearly.
- If a relevant ADR exists, mention it as a precedent ("A previous decision was made on this topic").
- If the provided context does not cover the topic, say "I couldn't find relevant policies on this topic." — do NOT invent or hallucinate standards.
- Be concise and actionable. Lead with the direct answer, then provide supporting citations.
- When recommending an approach, explain which policy clauses support it.
- If a policy is marked as mandatory and blocking, emphasise that compliance is required.`;

const MAX_RETRIEVAL_CHUNKS = 16;

// ── Embedding ────────────────────────────────────────────────────────────────

export async function embedQuery(question: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com"}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: [question],
      dimensions: 1536,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding error: ${err}`);
  }

  const json = await res.json();
  return json.data[0].embedding;
}

// ── Retrieval ────────────────────────────────────────────────────────────────

export async function retrieveChunks(
  embedding: number[],
  orgId: string,
  maxChunks: number = MAX_RETRIEVAL_CHUNKS,
): Promise<ChunkResult[]> {
  // Get all active policy IDs for this org
  const { data: policies } = await supabaseAdmin
    .from("standard_policies")
    .select("id")
    .eq("org_id", orgId)
    .in("status", ["active", "approved"])
    .eq("ingestion_status", "complete");

  const policyIds = (policies ?? []).map((p: { id: string }) => p.id);
  if (policyIds.length === 0) return [];

  const { data, error } = await supabaseAdmin.rpc("match_policy_chunks", {
    query_embedding: `[${embedding.join(",")}]`,
    org_id_param: orgId,
    policy_ids: policyIds,
    match_count: maxChunks,
    mandatory_boost: false,
  });

  if (error) {
    console.error("[advisor] Retrieval error:", error.message);
    return [];
  }

  return (data ?? []) as ChunkResult[];
}

// ── ADR Retrieval ────────────────────────────────────────────────────────────

export async function retrieveAdrs(
  embedding: number[],
  orgId: string,
  maxResults: number = 5,
): Promise<AdrResult[]> {
  const { data, error } = await supabaseAdmin.rpc("match_adrs", {
    query_embedding: `[${embedding.join(",")}]`,
    org_id_param: orgId,
    match_count: maxResults,
    min_similarity: 0.45, // lowered to match policy threshold
  });

  if (error) {
    console.error("[advisor] ADR retrieval error:", error.message);
    return [];
  }

  return (data ?? []) as AdrResult[];
}

// ── Enrich chunks with policy/clause metadata ────────────────────────────────

export async function enrichChunks(chunks: ChunkResult[]): Promise<Citation[]> {
  if (chunks.length === 0) return [];

  // Get unique policy IDs from chunk metadata
  const policyIds = [...new Set(
    chunks
      .map((c) => c.metadata?.policy_id)
      .filter(Boolean) as string[],
  )];

  // Load policy details
  const policyMap = new Map<string, { title: string; mandatory: boolean }>();
  if (policyIds.length > 0) {
    const { data: policies } = await supabaseAdmin
      .from("standard_policies")
      .select("id, title, policy_id, mandatory")
      .in("id", policyIds);
    for (const p of policies ?? []) {
      policyMap.set(p.id, { title: p.title || p.policy_id, mandatory: p.mandatory });
    }
  }

  return chunks.map((c) => ({
    policy_id: c.metadata?.policy_id ?? "",
    policy_title: policyMap.get(c.metadata?.policy_id ?? "")?.title ?? c.metadata?.policy_title ?? "Unknown Policy",
    clause_heading: c.metadata?.clause_heading ?? "",
    chunk_content: c.content,
    similarity: c.similarity,
  }));
}

// ── Prompt building ──────────────────────────────────────────────────────────

export function buildPrompt(
  question: string,
  citations: Citation[],
  adrResults: AdrResult[] = [],
): { system: string; user: string } {
  let context = "";

  // Policy context
  if (citations.length > 0) {
    context = "## Retrieved Policy Context\n\n";
    for (let i = 0; i < citations.length; i++) {
      const c = citations[i];
      context += `### [${i + 1}] ${c.policy_title}${c.clause_heading ? ` — ${c.clause_heading}` : ""}\n`;
      context += `${c.chunk_content}\n`;
      context += `(Similarity: ${(c.similarity * 100).toFixed(0)}%)\n\n`;
    }
  } else {
    context = "## Retrieved Policy Context\n\nNo relevant policy chunks were found for this question.\n";
  }

  // ADR precedents
  if (adrResults.length > 0) {
    context += "\n## Previous Architecture Decisions (ADRs)\n\n";
    for (let i = 0; i < adrResults.length; i++) {
      const a = adrResults[i];
      context += `### [ADR-${i + 1}] ${a.title}\n`;
      context += `Decision: ${a.decision}\n`;
      context += `(Similarity: ${(a.similarity * 100).toFixed(0)}%)\n\n`;
    }
  }

  const user = `${context}\n## Architect's Question\n\n${question}`;
  return { system: ADVISOR_SYSTEM_PROMPT, user };
}

// ── Answer generation (streaming) ────────────────────────────────────────────

export async function* generateAnswer(
  system: string,
  user: string,
): AsyncGenerator<{ type: "delta"; content: string } | { type: "done"; tokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const model = process.env.TG_ADVISOR_MODEL ?? "gpt-4o";

  const stream = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: 4096,
    stream: true,
    stream_options: { include_usage: true },
  });

  let totalTokens = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield { type: "delta", content: delta };
    }
    if (chunk.usage) {
      totalTokens = chunk.usage.total_tokens;
    }
  }

  yield { type: "done", tokens: totalTokens };
}

// ── Post-processing ──────────────────────────────────────────────────────────

export function classifyConfidence(
  chunks: ChunkResult[],
  adrResults: AdrResult[] = [],
): "high" | "medium" | "low" {
  // Combine similarity scores from both policy chunks and ADR matches
  const allSimilarities = [
    ...chunks.map((c) => c.similarity),
    ...adrResults.map((a) => a.similarity),
  ];
  if (allSimilarities.length === 0) return "low";

  const totalSources = allSimilarities.length;
  const aboveThreshold = allSimilarities.filter((s) => s > 0.4).length;
  const strongMatches = allSimilarities.filter((s) => s > 0.55).length;

  // High: multiple relevant sources found (good coverage)
  if (aboveThreshold >= 3) return "high";
  // High: at least 2 strong matches
  if (strongMatches >= 2) return "high";
  // Medium: at least 2 sources above threshold, or 1 strong match
  if (aboveThreshold >= 2 || strongMatches >= 1) return "medium";
  // Medium: at least 1 source found
  if (totalSources >= 1 && aboveThreshold >= 1) return "medium";
  return "low";
}

export function detectConflict(answer: string): boolean {
  // Only flag conflict if the LLM explicitly mentions it in the answer
  const lower = answer.toLowerCase();
  return lower.includes("conflict") && (
    lower.includes("conflicting policies") ||
    lower.includes("policies conflict") ||
    lower.includes("contradictory") ||
    lower.includes("conflicting guidance") ||
    lower.includes("inconsistent")
  );
}
