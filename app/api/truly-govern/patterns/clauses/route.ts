import { NextRequest, NextResponse } from "next/server";
import { extractToken, getOrgId, makeTGServerClient } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patternId = req.nextUrl.searchParams.get("pattern_id");
  if (!patternId) return NextResponse.json({ error: "pattern_id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("pattern_clauses")
    .select("*")
    .eq("pattern_id", patternId)
    .order("clause_number");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const orgId = await getOrgId(supabase);
  if (!orgId) return NextResponse.json({ detail: "org_id missing" }, { status: 401 });

  const body = await req.json();
  const { pattern_id, clause_type, title, description, policy_clause_id, severity, clause_number } = body;

  if (!pattern_id || !title || !description) {
    return NextResponse.json({ error: "pattern_id, title, and description are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("pattern_clauses")
    .insert([{
      pattern_id,
      org_id: orgId,
      clause_type: clause_type ?? "guidance",
      title,
      description,
      policy_clause_id: policy_clause_id ?? null,
      severity: severity ?? null,
      clause_number: clause_number ?? 0,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("pattern_clauses")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  const { error } = await supabaseAdmin.from("pattern_clauses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
