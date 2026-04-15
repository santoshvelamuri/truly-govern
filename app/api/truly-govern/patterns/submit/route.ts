import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { pattern_id } = await req.json();
  if (!pattern_id) return NextResponse.json({ error: "pattern_id required" }, { status: 400 });

  // Check completeness score
  const { data: pattern } = await supabaseAdmin
    .from("architecture_patterns")
    .select("completeness_score, status")
    .eq("id", pattern_id)
    .single();

  if (!pattern) return NextResponse.json({ error: "Pattern not found" }, { status: 404 });
  if (pattern.status !== "draft") return NextResponse.json({ error: "Only draft patterns can be submitted" }, { status: 400 });

  const score = pattern.completeness_score ?? 0;
  if (score < 60) {
    return NextResponse.json({ error: `Completeness score (${score}%) is below the 60% threshold` }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("architecture_patterns")
    .update({ status: "in_review", updated_at: new Date().toISOString() })
    .eq("id", pattern_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, status: "in_review" });
});
