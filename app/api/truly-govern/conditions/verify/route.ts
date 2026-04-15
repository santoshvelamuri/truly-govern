import { NextRequest, NextResponse } from "next/server";
import { makeTGServerClient, extractToken } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { condition_id, notes } = body;

  if (!condition_id) return NextResponse.json({ error: "condition_id required" }, { status: 400 });

  // Prevent self-verification
  const { data: cond } = await supabaseAdmin
    .from("review_conditions")
    .select("owner_id")
    .eq("id", condition_id)
    .single();

  if (cond?.owner_id === user.id) {
    return NextResponse.json({ error: "Cannot verify your own condition" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("review_conditions")
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      pending_verification_since: null,
    })
    .eq("id", condition_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
