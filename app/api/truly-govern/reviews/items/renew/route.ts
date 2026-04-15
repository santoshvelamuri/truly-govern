import { NextRequest, NextResponse } from "next/server";
import { makeTGServerClient, extractToken } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const { data: { user } } = await supabase.auth.getUser();

  const body = await req.json();
  const { item_id, justification, new_expiry_date } = body;

  if (!item_id || !justification || !new_expiry_date) {
    return NextResponse.json({ error: "item_id, justification, and new_expiry_date are required" }, { status: 400 });
  }

  // Load current item
  const { data: item } = await supabaseAdmin
    .from("review_items")
    .select("waiver_renewal_count, status")
    .eq("id", item_id)
    .single();

  if (!item || item.status !== "waived") {
    return NextResponse.json({ error: "Item is not waived" }, { status: 400 });
  }

  if (item.waiver_renewal_count >= 3) {
    return NextResponse.json({ error: "Maximum 3 renewals reached. Domain architect approval required." }, { status: 400 });
  }

  // Validate expiry max 12 months from today
  const maxExpiry = new Date();
  maxExpiry.setFullYear(maxExpiry.getFullYear() + 1);
  if (new Date(new_expiry_date) > maxExpiry) {
    return NextResponse.json({ error: "Expiry date cannot exceed 12 months from today" }, { status: 400 });
  }

  // Update the review item
  const { error } = await supabaseAdmin
    .from("review_items")
    .update({
      waiver_expiry_date: new_expiry_date,
      waiver_renewal_count: item.waiver_renewal_count + 1,
      notes: `Renewal ${item.waiver_renewal_count + 1}: ${justification}`,
    })
    .eq("id", item_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // The trigger will update governance_deviations automatically
  return NextResponse.json({ success: true, renewal_count: item.waiver_renewal_count + 1 });
}
