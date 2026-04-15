import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/api-auth";

function makeClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );
}

// GET: any authenticated user can list org members
export const GET = withAuth(async (_req, ctx) => {
  const supabase = makeClient(ctx.token);
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[profiles GET]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
});

// PUT: only owner/admin can change user roles
export const PUT = withAuth(async (req, ctx) => {
  const body = await req.json();
  const { id, full_name, role } = body;
  const supabase = makeClient(ctx.token);
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name, role, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[profiles PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}, { roles: ["owner", "admin"] });
