import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const unreadOnly = req.nextUrl.searchParams.get("unread_only") === "true";
  const category = req.nextUrl.searchParams.get("category");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);

  let query = supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) query = query.is("read_at", null);
  if (category) query = query.eq("entity_type", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});
