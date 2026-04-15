import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/api-auth";

function makeClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

// GET: any authenticated user can view their org
export const GET = withAuth(async (_req, ctx) => {
  const supabase = makeClient(ctx.token);
  const { data, error } = await supabase.from("organizations").select("*").eq("id", ctx.orgId).single();
  if (error) {
    console.error("[organizations GET]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
});

// PUT: only owner/admin can update org settings
export const PUT = withAuth(async (req, ctx) => {
  const body = await req.json();
  const { id, ...updates } = body;
  const supabase = makeClient(ctx.token);
  const { data, error } = await supabase
    .from("organizations")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id ?? ctx.orgId);
  if (error) {
    console.error("[organizations PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}, { roles: ["owner", "admin"] });
