import { NextRequest, NextResponse } from "next/server";
import { makeTGServerClient, extractToken } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { ids, all } = body;

  const now = new Date().toISOString();

  if (all) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ read: true, read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (ids?.length > 0) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ read: true, read_at: now })
      .eq("user_id", user.id)
      .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
