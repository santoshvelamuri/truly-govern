import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const policyId = req.nextUrl.searchParams.get("policy_id");
  if (!policyId) return NextResponse.json({ error: "policy_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("policy_clauses")
    .select("*")
    .eq("policy_id", policyId)
    .order("clause_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { policy_id, heading, content, severity, clause_index } = body;

  if (!policy_id || !heading || !content) {
    return NextResponse.json({ error: "policy_id, heading, and content are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("policy_clauses")
    .insert([{
      policy_id,
      org_id: ctx.orgId,
      heading,
      content,
      severity: severity ?? "warning",
      clause_index: clause_index ?? 0,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Mark policy for re-ingestion
  await supabaseAdmin
    .from("standard_policies")
    .update({ ingestion_status: "queued", updated_at: new Date().toISOString() })
    .eq("id", policy_id);

  return NextResponse.json({ data }, { status: 201 });
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("policy_clauses")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id } = body;

  const { error } = await supabase.from("policy_clauses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
});
