import { NextRequest, NextResponse } from "next/server";
import { makeTGServerClient, extractToken, getOrgId } from "@/lib/truly-govern/supabase";
import { notify } from "@/lib/truly-govern/notifications";

export async function GET(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const meetingId = req.nextUrl.searchParams.get("meeting_id");
  if (!meetingId) return NextResponse.json({ error: "meeting_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("meeting_agenda_items")
    .select("*, decision_requests(id, title, type, problem_statement, risk_level, status, triage_notes, custom_fields), decision_options:decision_requests(decision_options(*))")
    .eq("meeting_id", meetingId)
    .order("position");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("meeting_agenda_items")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // If outcome is set, update the decision request status to 'decided' and notify
  if (updates.outcome) {
    const { data: item } = await supabase.from("meeting_agenda_items").select("request_id").eq("id", id).single();
    if (item?.request_id) {
      await supabase
        .from("decision_requests")
        .update({ status: "decided", updated_at: new Date().toISOString() })
        .eq("id", item.request_id);

      // Notify the requester that their decision has been decided
      const orgId = await getOrgId(supabase);
      if (orgId) {
        const { data: dr } = await supabase.from("decision_requests").select("title, submitted_by").eq("id", item.request_id).single();
        if (dr) {
          notify("decision.decided", item.request_id, orgId, { title: dr.title }).catch(console.error);
        }
      }
    }
  }

  return NextResponse.json({ data });
}
