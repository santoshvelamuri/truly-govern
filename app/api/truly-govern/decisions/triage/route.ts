import { NextRequest, NextResponse } from "next/server";
import { makeTGServerClient, extractToken, getOrgId } from "@/lib/truly-govern/supabase";
import { runTriage } from "@/lib/truly-govern/triage-agent";

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const orgId = await getOrgId(supabase);
  if (!orgId) return NextResponse.json({ detail: "org_id missing" }, { status: 401 });

  const { request_id } = await req.json();
  if (!request_id) return NextResponse.json({ error: "request_id required" }, { status: 400 });

  // Fire triage in background — does NOT change status
  runTriage(request_id, orgId).catch((e) =>
    console.error("[triage API] background error:", e),
  );

  return NextResponse.json({ status: "triaging", request_id });
}
