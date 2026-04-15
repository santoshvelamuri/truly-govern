import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notify } from "@/lib/truly-govern/notifications";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);

  const status = req.nextUrl.searchParams.get("status");
  const type = req.nextUrl.searchParams.get("type");
  const riskLevel = req.nextUrl.searchParams.get("risk_level");
  const boardId = req.nextUrl.searchParams.get("board_id");
  const submittedBy = req.nextUrl.searchParams.get("submitted_by");

  let query = supabase
    .from("decision_requests")
    .select("*, decision_options(id, label, recommendation), arb_boards:resolved_arb_board_id(id, name)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (type) query = query.eq("type", type);
  if (riskLevel) query = query.eq("risk_level", riskLevel);
  if (boardId) query = query.eq("resolved_arb_board_id", boardId);
  if (submittedBy) query = query.eq("submitted_by", submittedBy);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { title, type, problem_statement, urgency_reason, risk_level, domain_id, resolved_arb_board_id, custom_fields, options, status: reqStatus } = body;

  if (!title || !type || !problem_statement || !risk_level) {
    return NextResponse.json({ error: "title, type, problem_statement, and risk_level are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("decision_requests")
    .insert([{
      org_id: ctx.orgId,
      title,
      type,
      problem_statement,
      urgency_reason: urgency_reason ?? null,
      risk_level,
      domain_id: domain_id ?? null,
      resolved_arb_board_id: resolved_arb_board_id ?? null,
      status: reqStatus ?? "draft",
      custom_fields: custom_fields ?? {},
      submitted_by: ctx.user.id,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Insert options if provided
  if (options?.length > 0 && data?.id) {
    const optionRows = options.map((opt: { label: string; description: string }, i: number) => ({
      request_id: data.id,
      org_id: ctx.orgId,
      label: opt.label,
      description: opt.description,
      clause_index: i,
    }));
    await supabaseAdmin.from("decision_options").insert(optionRows);
  }

  // Notify board members if submitted with a board
  if (data?.id && reqStatus === "submitted" && resolved_arb_board_id) {
    notify("decision.submitted", data.id, ctx.orgId, {
      title,
      type,
      risk_level,
      resolved_arb_board_id,
    }).catch(console.error);
  }

  return NextResponse.json({ data }, { status: 201 });
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("decision_requests")
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

  const { data: dr } = await supabase.from("decision_requests").select("status").eq("id", id).single();
  if (dr?.status !== "draft") {
    return NextResponse.json({ error: "Only draft requests can be deleted" }, { status: 400 });
  }

  await supabase.from("decision_options").delete().eq("request_id", id);
  const { error } = await supabase.from("decision_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
});
