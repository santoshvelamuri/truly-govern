import { NextResponse } from "next/server";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notify } from "@/lib/truly-govern/notifications";
import { withAuth } from "@/lib/api-auth";

// GET: any authenticated user can list reviews in their org
export const GET = withAuth(async (req, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const status = req.nextUrl.searchParams.get("status");
  const domainId = req.nextUrl.searchParams.get("domain_id");
  const riskLevel = req.nextUrl.searchParams.get("risk_level");

  let query = supabase
    .from("reviews")
    .select("*, review_items(id, severity, status, is_violation)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (domainId) query = query.eq("domain_id", domainId);
  if (riskLevel) query = query.eq("risk_level", riskLevel);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

// POST: any authenticated user can create a review
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json();
  const {
    title, description, domain_id, risk_level, tech_stack, integrations,
    regulatory_scope, custom_fields, status: reviewStatus,
    completeness_score, completeness_warnings,
  } = body;

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("reviews")
    .insert([{
      org_id: ctx.orgId,
      title,
      description: description ?? null,
      domain_id: domain_id ?? null,
      risk_level: risk_level ?? null,
      tech_stack: tech_stack ?? [],
      integrations: integrations ?? [],
      regulatory_scope: regulatory_scope ?? [],
      custom_fields: custom_fields ?? {},
      status: reviewStatus ?? "pending",
      submitted_by: ctx.user.id,
      completeness_score: completeness_score ?? null,
      completeness_warnings: completeness_warnings ?? [],
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
});

// PATCH: any authenticated user can update, but decision validation enforced
export const PATCH = withAuth(async (req, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Validate: only the assigned reviewer can approve/reject/defer
  const decisionStatuses = ["approved", "rejected", "deferred"];
  if (updates.status && decisionStatuses.includes(updates.status)) {
    const { data: review } = await supabase.from("reviews").select("assigned_reviewer_id").eq("id", id).single();
    if (review?.assigned_reviewer_id && review.assigned_reviewer_id !== ctx.user.id) {
      return NextResponse.json({ error: "Only the assigned reviewer can make this decision" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("reviews")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Fire notifications for status changes (background)
  if (updates.status && data?.id) {
    const orgId = data.org_id;
    const notifyCtx = { title: data.title, domain: data.domain_id, risk_level: data.risk_level };
    if (updates.status === "approved") {
      notify("review.approved", data.id, orgId, notifyCtx).catch(console.error);
    } else if (updates.status === "rejected") {
      notify("review.rejected", data.id, orgId, notifyCtx).catch(console.error);
    } else if (updates.status === "in_review" && updates.assigned_reviewer_id) {
      notify("review.submitted", data.id, orgId, notifyCtx).catch(console.error);
    }
  }

  return NextResponse.json({ data });
});

// DELETE: only owner/admin can delete reviews (and only drafts)
export const DELETE = withAuth(async (req, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: review } = await supabase.from("reviews").select("status").eq("id", id).single();
  if (review?.status !== "pending") {
    return NextResponse.json({ error: "Only draft reviews can be deleted" }, { status: 400 });
  }

  const { error } = await supabase.from("reviews").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}, { roles: ["owner", "admin"] });
