import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const status = req.nextUrl.searchParams.get("status");
  let query = supabaseAdmin.from("policy_exceptions").select("*").eq("org_id", ctx.orgId).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { policy_clause_id, title, justification, risk_acceptance, remediation_plan, expires_at, review_item_id, custom_fields } = body;

  if (!title || !justification || !remediation_plan || !risk_acceptance || !expires_at) {
    return NextResponse.json({ error: "title, justification, remediation_plan, risk_acceptance, and expires_at are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("policy_exceptions")
    .insert([{
      org_id: ctx.orgId,
      policy_clause_id: policy_clause_id ?? null,
      review_item_id: review_item_id ?? null,
      title,
      justification,
      risk_acceptance,
      remediation_plan,
      expires_at,
      status: "pending",
      requested_by: ctx.user.id,
      custom_fields: custom_fields ?? {},
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
});
