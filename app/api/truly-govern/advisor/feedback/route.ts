import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { message_id, feedback, feedback_note } = body;

  if (!message_id || !feedback) {
    return NextResponse.json({ error: "message_id and feedback are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("advisor_logs")
    .update({
      feedback,
      feedback_note: feedback_note ?? null,
    })
    .eq("id", message_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
});
