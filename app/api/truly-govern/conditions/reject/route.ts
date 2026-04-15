import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notify } from "@/lib/truly-govern/notifications";

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { condition_id, reason } = body;

  if (!condition_id || !reason) return NextResponse.json({ error: "condition_id and reason required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("review_conditions")
    .update({
      verification_rejected_reason: reason,
      pending_verification_since: null,
      completed: false,
    })
    .eq("id", condition_id)
    .select("*, review_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notify owner
  if (data?.org_id && data?.owner_id) {
    notify("condition.verification_rejected", condition_id, data.org_id, {
      description: data.description,
      review_id: data.review_id,
      owner_id: data.owner_id,
    }).catch(console.error);
  }

  return NextResponse.json({ success: true });
}
