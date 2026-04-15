import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { triggerPolicyIngestion } from "@/lib/truly-govern/ingestion";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { policy_id } = await req.json();
  if (!policy_id) return NextResponse.json({ error: "policy_id required" }, { status: 400 });

  // Fire and forget — ingestion runs in the background
  triggerPolicyIngestion(policy_id, ctx.orgId).catch((e) =>
    console.error("[ingestion API] background error:", e),
  );

  return NextResponse.json({ status: "queued", policy_id });
});
