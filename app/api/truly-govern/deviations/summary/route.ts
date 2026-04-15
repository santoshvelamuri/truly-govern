import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const ownerId = req.nextUrl.searchParams.get("owner_id");
  let query = supabaseAdmin
    .from("governance_deviations")
    .select("status, resolved_at")
    .eq("org_id", ctx.orgId);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data: all } = await query;

  const rows = all ?? [];
  const thisMonth = new Date();
  thisMonth.setDate(1);
  const monthStart = thisMonth.toISOString();

  return NextResponse.json({
    open: rows.filter((r) => r.status === "open" || r.status === "overdue" || r.status === "pending_verification").length,
    overdue: rows.filter((r) => r.status === "overdue").length,
    expiring: rows.filter((r) => r.status === "expiring").length,
    resolved_this_month: rows.filter((r) => r.status === "resolved" && r.resolved_at && r.resolved_at >= monthStart).length,
    total: rows.length,
  });
});
