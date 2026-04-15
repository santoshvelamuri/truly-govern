import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);

  const { data, error } = await supabase
    .from("arb_meetings")
    .select("*, meeting_agenda_items(id, request_id, outcome)")
    .eq("org_id", ctx.orgId)
    .order("scheduled_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { title, scheduled_at, reviewer_ids, request_ids, board_id } = body;

  if (!title || !scheduled_at) {
    return NextResponse.json({ error: "title and scheduled_at are required" }, { status: 400 });
  }

  // Create meeting
  const { data: meeting, error } = await supabaseAdmin
    .from("arb_meetings")
    .insert([{
      org_id: ctx.orgId,
      title,
      scheduled_at,
      chair_id: ctx.user.id,
      board_id: board_id ?? null,
      reviewer_ids: reviewer_ids ?? [],
      status: "planned",
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Create agenda items from selected decision requests
  if (request_ids?.length > 0 && meeting?.id) {
    const agendaRows = request_ids.map((reqId: string, i: number) => ({
      meeting_id: meeting.id,
      request_id: reqId,
      org_id: ctx.orgId,
      position: i + 1,
      estimated_minutes: 20,
    }));
    await supabaseAdmin.from("meeting_agenda_items").insert(agendaRows);

    // Update decision requests to in_review status
    for (const reqId of request_ids) {
      await supabaseAdmin
        .from("decision_requests")
        .update({ status: "in_review", arb_meeting_id: meeting.id, updated_at: new Date().toISOString() })
        .eq("id", reqId);
    }
  }

  return NextResponse.json({ data: meeting }, { status: 201 });
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("arb_meetings")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});
