import { NextRequest, NextResponse } from "next/server";
import { makeTGServerClient, extractToken, getOrgId } from "@/lib/truly-govern/supabase";

export async function GET(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const orgId = await getOrgId(supabase);
  if (!orgId) return NextResponse.json({ detail: "org_id missing" }, { status: 401 });

  const domainId = req.nextUrl.searchParams.get("domain_id");
  const decisionType = req.nextUrl.searchParams.get("decision_type");

  // Load all active boards for this org
  const { data: boards, error } = await supabase
    .from("arb_boards")
    .select("id, name, scope, scope_type, governed_domain_ids, governed_decision_types")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const allBoards = boards ?? [];

  // Group 1: Domain-scoped boards matching the selected domain
  const domain_boards = domainId
    ? allBoards.filter((b) => b.scope_type === "domain_scoped" && b.governed_domain_ids?.includes(domainId))
    : [];

  // Group 2: Topic-scoped boards matching the selected decision type
  const topic_boards = decisionType
    ? allBoards.filter((b) => b.scope_type === "topic_scoped" && b.governed_decision_types?.includes(decisionType))
    : [];

  // Group 3: Enterprise boards (always included)
  const enterprise_boards = allBoards.filter((b) => b.scope === "enterprise_arb");

  return NextResponse.json({
    domain_boards,
    topic_boards,
    enterprise_boards,
  });
}
