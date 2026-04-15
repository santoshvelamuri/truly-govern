import { NextRequest, NextResponse } from "next/server";
import { makeTGServerClient, extractToken } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notify } from "@/lib/truly-govern/notifications";

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const { data: { user } } = await supabase.auth.getUser();

  const body = await req.json();
  const { exception_id, action, reason } = body;

  if (!exception_id || !action) return NextResponse.json({ error: "exception_id and action required" }, { status: 400 });

  if (action === "approve") {
    const { data, error } = await supabaseAdmin
      .from("policy_exceptions")
      .update({ status: "approved", approved_by: user?.id, updated_at: new Date().toISOString() })
      .eq("id", exception_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Create governance deviation for approved exception (skip if exists)
    if (data) {
      const { count } = await supabaseAdmin.from("governance_deviations").select("id", { count: "exact", head: true }).eq("source_type", "exception").eq("source_id", data.id);
      if (!count || count === 0) {
        await supabaseAdmin.from("governance_deviations").insert([{
          org_id: data.org_id, source_type: "exception", source_id: data.id, title: data.title,
          severity: "critical", owner_id: data.requested_by, expiry_date: data.expires_at, status: "open",
        }]);
      }

      notify("exception.approved", exception_id, data.org_id, { title: data.title }).catch(console.error);
    }
    return NextResponse.json({ success: true });
  }

  if (action === "reject") {
    if (!reason) return NextResponse.json({ error: "Reason required for rejection" }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from("policy_exceptions")
      .update({ status: "withdrawn", custom_fields: { rejection_reason: reason, rejected_by: user?.id }, updated_at: new Date().toISOString() })
      .eq("id", exception_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (data) notify("exception.rejected", exception_id, data.org_id, { title: data.title }).catch(console.error);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
