import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const requestId = req.nextUrl.searchParams.get("request_id");
  if (!requestId) return NextResponse.json({ error: "request_id required" }, { status: 400 });

  // Use admin client to bypass RLS — auth is verified by withAuth
  const { data, error } = await supabaseAdmin
    .from("decision_options")
    .select("*")
    .eq("request_id", requestId)
    .order("clause_index");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { request_id, label, description, clause_index } = body;

  const { data, error } = await supabaseAdmin
    .from("decision_options")
    .insert([{ request_id, org_id: ctx.orgId, label, description, clause_index: clause_index ?? 0 }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("decision_options")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const { id } = await req.json();

  const { error } = await supabase.from("decision_options").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
});
