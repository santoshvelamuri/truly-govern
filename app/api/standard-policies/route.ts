import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";

function makeClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeClient(ctx.token);

  const { searchParams } = new URL(req.url);
  const techDomainId = searchParams.get("tech_domain_id");
  const status = searchParams.get("status");

  let query = supabase
    .from("standard_policies")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("policy_id", { ascending: true });

  if (techDomainId) query = query.eq("tech_domain_id", techDomainId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[standard-policies GET]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { data, error } = await supabaseAdmin
    .from("standard_policies")
    .insert([{ ...body, org_id: ctx.orgId, created_by: ctx.user.id }])
    .select()
    .single();
  if (error) {
    console.error("[standard-policies POST]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { id, ...updates } = body;
  const supabase = makeClient(ctx.token);
  const { data, error } = await supabase
    .from("standard_policies")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("[standard-policies PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const supabase = makeClient(ctx.token);
  const { error } = await supabase
    .from("standard_policies")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[standard-policies DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: { deleted: id } });
}, { roles: ["owner", "admin"] });
