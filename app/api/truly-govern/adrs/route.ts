import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { triggerAdrIngestion } from "@/lib/truly-govern/adr-ingestion";
import { notify } from "@/lib/truly-govern/notifications";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);

  const status = req.nextUrl.searchParams.get("status");
  const domainId = req.nextUrl.searchParams.get("domain_id");

  let query = supabase
    .from("adrs")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (domainId) query = query.eq("domain_id", domainId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const {
    title, decision, rationale, alternatives, constraints, consequences,
    domain_id, tags, status: adrStatus, custom_fields, superseded_by,
  } = body;

  if (!title || !decision || !rationale) {
    return NextResponse.json({ error: "title, decision, and rationale are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("adrs")
    .insert([{
      org_id: ctx.orgId,
      title,
      decision,
      rationale,
      alternatives: alternatives ?? null,
      constraints: constraints ?? null,
      consequences: consequences ?? null,
      domain_id: domain_id ?? null,
      tags: tags ?? [],
      status: adrStatus ?? "proposed",
      ingestion_status: "none",
      superseded_by: superseded_by ?? null,
      custom_fields: custom_fields ?? {},
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // If created as accepted, trigger ingestion
  if (adrStatus === "accepted" && data?.id) {
    triggerAdrIngestion(data.id, ctx.orgId).catch((e) =>
      console.error("[adrs] ingestion error:", e),
    );
  }

  return NextResponse.json({ data }, { status: 201 });
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("adrs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // If status changed to accepted, trigger ingestion + notify
  if (updates.status === "accepted" && data?.id) {
    triggerAdrIngestion(data.id, ctx.orgId).catch((e) =>
      console.error("[adrs] ingestion error:", e),
    );
    notify("adr.accepted", data.id, ctx.orgId, { title: data.title }).catch(console.error);
  }
  if (updates.status === "deprecated" && data?.id) {
    notify("adr.deprecated", data.id, ctx.orgId, { title: data.title }).catch(console.error);
  }

  return NextResponse.json({ data });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: adr } = await supabase.from("adrs").select("status").eq("id", id).single();
  if (adr?.status !== "proposed") {
    return NextResponse.json({ error: "Only proposed ADRs can be deleted" }, { status: 400 });
  }

  const { error } = await supabase.from("adrs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
});
