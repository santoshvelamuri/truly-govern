import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);

  const techDomainId = req.nextUrl.searchParams.get("tech_domain_id");
  const status = req.nextUrl.searchParams.get("status");

  let query = supabase.from("standard_policies").select("*").eq("org_id", ctx.orgId);
  if (techDomainId) query = query.eq("tech_domain_id", techDomainId);
  if (status) query = query.eq("status", status);
  query = query.order("policy_id", { ascending: true });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { title, tech_domain_id, subdomain, layer, mandatory, tags, rule_statement, rule_rationale, rule_severity, source_type } = body;

  // Look up the technology domain name for denormalized storage
  let domainName = "";
  if (tech_domain_id) {
    const { data: td } = await supabaseAdmin
      .from("technology_domains")
      .select("name")
      .eq("id", tech_domain_id)
      .single();
    domainName = td?.name ?? "";
  }

  const policyId = `POL-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await supabaseAdmin
    .from("standard_policies")
    .insert([{
      org_id: ctx.orgId,
      policy_id: policyId,
      title: title ?? null,
      domain: domainName,
      tech_domain_id: tech_domain_id ?? null,
      subdomain: subdomain ?? "",
      layer: layer ?? "domain",
      mandatory: mandatory ?? true,
      tags: tags ?? [],
      rule_statement: rule_statement ?? "",
      rule_rationale: rule_rationale ?? "",
      rule_severity: rule_severity ?? "warning",
      rule_examples: {},
      scope: {},
      remediation_hint: "",
      provenance: {},
      source_type: source_type ?? "authored",
      status: "draft",
      ingestion_status: "none",
      custom_fields: {},
      created_by: ctx.user.id,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("standard_policies")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id } = body;

  const { error } = await supabase.from("standard_policies").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
});
