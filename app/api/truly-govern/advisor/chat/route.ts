import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  embedQuery,
  retrieveChunks,
  retrieveAdrs,
  enrichChunks,
  buildPrompt,
  generateAnswer,
  classifyConfidence,
  detectConflict,
} from "@/lib/truly-govern/advisor-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { session_id, question } = body;

  if (!session_id || !question) {
    return NextResponse.json({ error: "session_id and question are required" }, { status: 400 });
  }

  const start = Date.now();
  const orgId = ctx.orgId;
  const userId = ctx.user.id;

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // 1. Embed the question
        send({ type: "status", message: "Searching policies..." });
        const embedding = await embedQuery(question);

        // 2. Retrieve relevant policy chunks and ADR precedents
        const [chunks, adrResults] = await Promise.all([
          retrieveChunks(embedding, orgId),
          retrieveAdrs(embedding, orgId),
        ]);
        console.log(`[advisor] Retrieved ${chunks.length} chunks, ${adrResults.length} ADRs`);
        const citations = await enrichChunks(chunks);

        send({ type: "status", message: `Found ${citations.length} policy sections and ${adrResults.length} ADR precedents. Generating answer...` });

        // 3. Build prompt with policy + ADR context
        const { system, user: userPrompt } = buildPrompt(question, citations, adrResults);

        // 4. Stream the answer
        let fullAnswer = "";
        let tokensUsed = 0;

        for await (const event of generateAnswer(system, userPrompt)) {
          if (event.type === "delta") {
            fullAnswer += event.content;
            send({ type: "delta", content: event.content });
          } else if (event.type === "done") {
            tokensUsed = event.tokens;
          }
        }

        // 5. Post-process
        const confidence = classifyConfidence(chunks, adrResults);
        const hadConflict = detectConflict(fullAnswer);
        const policyIdsUsed = [...new Set(citations.map((c) => c.policy_id).filter(Boolean))];
        const citationsJson = citations.map((c) => ({
          policy_id: c.policy_id,
          policy_title: c.policy_title,
          clause_heading: c.clause_heading,
          chunk_content: c.chunk_content,
          similarity: c.similarity,
        }));

        // 6. Save to advisor_logs (citations_json stored for history reload)
        const { data: logEntry } = await supabaseAdmin
          .from("advisor_logs")
          .insert([{
            org_id: orgId,
            user_id: userId,
            session_id,
            question,
            answer: fullAnswer,
            confidence,
            policy_ids_used: policyIdsUsed,
            had_conflict: hadConflict,
            tokens_used: tokensUsed,
            duration_ms: Date.now() - start,
            citations_json: citationsJson,
          }])
          .select("id")
          .single();

        // 7. Update session title if first message
        const { count } = await supabaseAdmin
          .from("advisor_logs")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session_id);

        if (count === 1) {
          const title = question.length > 80 ? question.slice(0, 77) + "..." : question;
          await supabaseAdmin
            .from("advisor_sessions")
            .update({ title, updated_at: new Date().toISOString() })
            .eq("id", session_id);
        } else {
          await supabaseAdmin
            .from("advisor_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", session_id);
        }

        // 8. Send completion event
        send({
          type: "done",
          message_id: logEntry?.id ?? null,
          confidence,
          had_conflict: hadConflict,
          citations: citations.map((c) => ({
            policy_id: c.policy_id,
            policy_title: c.policy_title,
            clause_heading: c.clause_heading,
            chunk_content: c.chunk_content,
            similarity: c.similarity,
          })),
          policy_ids_used: policyIdsUsed,
          tokens_used: tokensUsed,
          duration_ms: Date.now() - start,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[advisor/chat] Error:", message);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
