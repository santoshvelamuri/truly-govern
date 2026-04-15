import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const status = req.nextUrl.searchParams.get("status");
  const sourceType = req.nextUrl.searchParams.get("source_type");
  const severity = req.nextUrl.searchParams.get("severity");
  const ownerId = req.nextUrl.searchParams.get("owner_id");
  const serviceName = req.nextUrl.searchParams.get("service_name");
  const domainId = req.nextUrl.searchParams.get("domain_id");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);

  let query = supabaseAdmin
    .from("governance_deviations")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("status", { ascending: true }) // overdue first
    .order("debt_score", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (sourceType) query = query.eq("source_type", sourceType);
  if (severity) query = query.eq("severity", severity);
  if (ownerId) query = query.eq("owner_id", ownerId);
  if (serviceName) query = query.ilike("service_name", `%${serviceName}%`);
  if (domainId) query = query.eq("domain_id", domainId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { id, action, reason } = body;

  if (action === "override-resolve") {
    const { error } = await supabaseAdmin
      .from("governance_deviations")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: ctx.user.id, resolution_evidence: reason ?? "Domain architect override" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
});
