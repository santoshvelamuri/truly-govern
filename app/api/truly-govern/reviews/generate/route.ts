import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { generateChecklist } from "@/lib/truly-govern/checklist-agent";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { review_id } = await req.json();
  if (!review_id) return NextResponse.json({ error: "review_id required" }, { status: 400 });

  // Fire and forget — generation runs in the background
  generateChecklist(review_id, ctx.orgId).catch((e) =>
    console.error("[generate] background error:", e),
  );

  return NextResponse.json({ status: "generating", review_id });
});
