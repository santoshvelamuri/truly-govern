import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const boardId = req.nextUrl.searchParams.get("board_id");
  if (!boardId) return NextResponse.json({ error: "board_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("arb_board_members")
    .select("*, profiles:user_id(id, full_name, email, avatar_url)")
    .eq("board_id", boardId)
    .order("role");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { board_id, user_id, role, expertise_tags } = body;

  if (!board_id || !user_id) {
    return NextResponse.json({ error: "board_id and user_id are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("arb_board_members")
    .insert([{
      board_id,
      user_id,
      org_id: ctx.orgId,
      role: role ?? "reviewer",
      expertise_tags: expertise_tags ?? [],
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}, { roles: ["owner", "admin"] });

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const { id } = await req.json();

  const { error } = await supabase.from("arb_board_members").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}, { roles: ["owner", "admin"] });
