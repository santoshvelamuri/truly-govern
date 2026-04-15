import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);

  const scope = req.nextUrl.searchParams.get("scope");
  const scopeType = req.nextUrl.searchParams.get("scope_type");
  const activeOnly = req.nextUrl.searchParams.get("active") !== "false";

  let query = supabase
    .from("arb_boards")
    .select("*, arb_board_members(id, user_id, role)")
    .eq("org_id", ctx.orgId)
    .order("name");

  if (activeOnly) query = query.eq("active", true);
  if (scope) query = query.eq("scope", scope);
  if (scopeType) query = query.eq("scope_type", scopeType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { name, scope, scope_type, governed_domain_ids, governed_decision_types, parent_arb_id, quorum_count, meeting_cadence } = body;

  if (!name || !scope || !scope_type) {
    return NextResponse.json({ error: "name, scope, and scope_type are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("arb_boards")
    .insert([{
      org_id: ctx.orgId,
      name,
      scope,
      scope_type,
      governed_domain_ids: governed_domain_ids ?? [],
      governed_decision_types: governed_decision_types ?? [],
      parent_arb_id: parent_arb_id ?? null,
      chair_id: body.chair_id ?? ctx.user.id,
      quorum_count: quorum_count ?? 3,
      meeting_cadence: meeting_cadence ?? "monthly",
      active: true,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Auto-add creator as chair member
  await supabaseAdmin.from("arb_board_members").insert([{
    board_id: data.id,
    user_id: body.chair_id ?? ctx.user.id,
    org_id: ctx.orgId,
    role: "chair",
  }]);

  return NextResponse.json({ data }, { status: 201 });
}, { roles: ["owner", "admin"] });

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("arb_boards")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const { id } = await req.json();

  // Soft delete — archive
  const { data, error } = await supabase
    .from("arb_boards")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}, { roles: ["owner", "admin"] });
