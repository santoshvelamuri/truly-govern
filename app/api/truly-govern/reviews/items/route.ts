import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const reviewId = req.nextUrl.searchParams.get("review_id");
  if (!reviewId) return NextResponse.json({ error: "review_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("review_items")
    .select("*")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { review_id, description, severity, policy_title, rationale, remediation_hint, is_violation } = body;

  if (!review_id || !description) {
    return NextResponse.json({ error: "review_id and description are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("review_items")
    .insert([{
      review_id,
      org_id: ctx.orgId,
      description,
      severity: severity ?? "warning",
      status: "open",
      is_violation: is_violation ?? false,
      policy_title: policy_title ?? null,
      rationale: rationale ?? null,
      remediation_hint: remediation_hint ?? null,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // If marking as waived, notes are required
  if (updates.status === "waived" && !updates.notes) {
    return NextResponse.json({ error: "Justification notes required when waiving" }, { status: 400 });
  }

  // Set resolved_by when changing status
  if (updates.status && updates.status !== "open") {
    updates.resolved_by = ctx.user.id;
  }

  // Use supabaseAdmin for the write to avoid RLS silently blocking updates
  console.log("[review_items PATCH] Updating item:", id, "with:", JSON.stringify(updates));
  const { data, error } = await supabaseAdmin
    .from("review_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[review_items PATCH] Error:", error.message, error.code, error.details);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id } = body;

  const { error } = await supabase.from("review_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
});
