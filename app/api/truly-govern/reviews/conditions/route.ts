import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const reviewId = req.nextUrl.searchParams.get("review_id");
  if (!reviewId) return NextResponse.json({ error: "review_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("review_conditions")
    .select("*")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { review_id, description, due_date } = body;

  if (!review_id || !description || !due_date) {
    return NextResponse.json({ error: "review_id, description, and due_date are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("review_conditions")
    .insert([{
      review_id,
      org_id: ctx.orgId,
      description,
      owner_id: body.owner_id ?? ctx.user.id,
      due_date,
      completed: false,
    }])
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

  if (updates.completed) {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("review_conditions")
    .update(updates)
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

  const { error } = await supabase.from("review_conditions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
});
