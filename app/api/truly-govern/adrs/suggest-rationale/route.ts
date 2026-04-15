import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/truly-govern/supabase";
import OpenAI from "openai";

const RATIONALE_PROMPT = `You are an architecture advisor helping teams document their decision rationale.

Given the context (situation requiring a decision) and the decision itself, write a clear, concise rationale paragraph that explains:
1. Why this decision was made (forces, constraints, priorities)
2. What tradeoffs were accepted
3. Why alternatives were not chosen (if provided)

Write in third person, past tense. Be specific and actionable. Keep it to 3-5 sentences.`;

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { context, decision, alternatives } = body;

  if (!context || !decision) {
    return NextResponse.json({ error: "context and decision are required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const model = process.env.TG_FAST_MODEL ?? "gpt-4o-mini";

  let userPrompt = `Context:\n${context}\n\nDecision:\n${decision}`;
  if (alternatives) {
    userPrompt += `\n\nAlternatives considered:\n${alternatives}`;
  }

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: RATIONALE_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  const rationale = completion.choices[0]?.message?.content ?? "";
  return NextResponse.json({ rationale });
}
