import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const status = req.nextUrl.searchParams.get("status");
  const domainId = req.nextUrl.searchParams.get("domain_id");

  let query = supabaseAdmin
    .from("architecture_patterns")
    .select("*, pattern_clauses(id, clause_type), pattern_review_links(id)")
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (domainId) query = domainId === "cross" ? query.is("domain_id", null) : query.eq("domain_id", domainId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { name, problem, solution, forces, consequences, when_to_use, when_not_to_use, domain_id, known_uses, custom_fields } = body;

  if (!name || !problem || !solution) {
    return NextResponse.json({ error: "name, problem, and solution are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("architecture_patterns")
    .insert([{
      org_id: ctx.orgId,
      name,
      problem,
      solution,
      forces: forces ?? "",
      consequences: consequences ?? "",
      when_to_use: when_to_use ?? null,
      when_not_to_use: when_not_to_use ?? null,
      domain_id: domain_id ?? null,
      known_uses: known_uses ?? [],
      status: "draft",
      created_by: ctx.user.id,
      custom_fields: custom_fields ?? {},
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("architecture_patterns")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const { id } = await req.json();
  const { data: pattern } = await supabaseAdmin.from("architecture_patterns").select("status").eq("id", id).single();
  if (pattern?.status !== "draft") {
    return NextResponse.json({ error: "Only draft patterns can be deleted" }, { status: 400 });
  }

  await supabaseAdmin.from("pattern_clauses").delete().eq("pattern_id", id);
  const { error } = await supabaseAdmin.from("architecture_patterns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
});
