import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const agendaItemId = req.nextUrl.searchParams.get("agenda_item_id");
  if (!agendaItemId) return NextResponse.json({ error: "agenda_item_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("meeting_conditions")
    .select("*")
    .eq("agenda_item_id", agendaItemId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { agenda_item_id, description, due_date } = body;

  if (!agenda_item_id || !description || !due_date) {
    return NextResponse.json({ error: "agenda_item_id, description, and due_date are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("meeting_conditions")
    .insert([{
      agenda_item_id,
      org_id: ctx.orgId,
      description,
      owner_id: body.owner_id ?? ctx.user.id,
      due_date,
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

  if (updates.completed) updates.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("meeting_conditions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});
