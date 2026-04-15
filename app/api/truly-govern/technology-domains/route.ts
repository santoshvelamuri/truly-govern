import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);

  const showArchived = req.nextUrl.searchParams.get("archived") === "true";

  let query = supabase
    .from("technology_domains")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("sort_order", { ascending: true });

  if (!showArchived) {
    query = query.eq("archived", false);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { name, description, icon, color } = body;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("technology_domains")
    .insert([{
      org_id: ctx.orgId,
      name,
      description: description ?? null,
      icon: icon ?? null,
      colour: color ?? "blue",
      archived: false,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}, { roles: ["owner", "admin"] });

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeTGServerClient(ctx.token);
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (updates.color !== undefined) {
    updates.colour = updates.color;
    delete updates.color;
  }

  const { data, error } = await supabase
    .from("technology_domains")
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

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Check if any policies reference this domain
  const { count } = await supabase
    .from("standard_policies")
    .select("id", { count: "exact", head: true })
    .eq("tech_domain_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} policies reference this domain. Archive it instead.` },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("technology_domains").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}, { roles: ["owner", "admin"] });
