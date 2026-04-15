import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notify } from "@/lib/truly-govern/notifications";

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { condition_id, completion_evidence } = body;

  if (!condition_id) return NextResponse.json({ error: "condition_id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("review_conditions")
    .update({
      completion_evidence: completion_evidence ?? null,
      pending_verification_since: new Date().toISOString(),
    })
    .eq("id", condition_id)
    .select("*, review_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notify reviewer
  if (data?.org_id) {
    notify("condition.submitted_for_verification", condition_id, data.org_id, {
      description: data.description,
      review_id: data.review_id,
    }).catch(console.error);
  }

  return NextResponse.json({ success: true });
}
