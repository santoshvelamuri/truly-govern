import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notify } from "@/lib/truly-govern/notifications";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { pattern_id, action, notes } = body;
  // action: "approve" | "request_changes" | "reject"

  if (!pattern_id || !action) {
    return NextResponse.json({ error: "pattern_id and action required" }, { status: 400 });
  }

  if (action === "approve") {
    const { error } = await supabaseAdmin
      .from("architecture_patterns")
      .update({
        status: "approved",
        approved_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pattern_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Notify domain members
    const { data: pat } = await supabaseAdmin.from("architecture_patterns").select("name, org_id").eq("id", pattern_id).single();
    if (pat) notify("pattern.approved", pattern_id, pat.org_id, { title: pat.name }).catch(console.error);

    return NextResponse.json({ success: true, status: "approved" });
  }

  if (action === "request_changes" || action === "reject") {
    if (!notes) return NextResponse.json({ error: "Notes required for request_changes/reject" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("architecture_patterns")
      .update({
        status: "draft",
        custom_fields: { review_notes: notes, review_action: action, reviewed_by: ctx.user.id },
        updated_at: new Date().toISOString(),
      })
      .eq("id", pattern_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, status: "draft" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}, { roles: ["owner", "admin"] });
