import { NextRequest, NextResponse } from "next/server";
import { makeTGServerClient, extractToken, getOrgId } from "@/lib/truly-govern/supabase";
import { runDeadlineCheck } from "@/lib/truly-govern/deadline-notifier";

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const orgId = await getOrgId(supabase);
  if (!orgId) return NextResponse.json({ detail: "org_id missing" }, { status: 401 });

  const result = await runDeadlineCheck(orgId);
  return NextResponse.json(result);
}
