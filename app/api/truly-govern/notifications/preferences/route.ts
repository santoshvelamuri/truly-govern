import { NextRequest, NextResponse } from "next/server";
import { makeTGServerClient, extractToken, getOrgId } from "@/lib/truly-govern/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Platform defaults for event types
const PLATFORM_DEFAULTS: Record<string, { in_app: boolean; email: boolean }> = {
  "review.submitted": { in_app: true, email: false },
  "review.approved": { in_app: true, email: false },
  "review.approved_with_conditions": { in_app: true, email: true },
  "review.rejected": { in_app: true, email: true },
  "review.overdue": { in_app: true, email: true },
  "condition.due_soon": { in_app: true, email: false },
  "condition.due_tomorrow": { in_app: true, email: true },
  "condition.overdue": { in_app: true, email: true },
  "condition.completed": { in_app: true, email: false },
  "decision.submitted": { in_app: true, email: false },
  "decision.decided": { in_app: true, email: false },
  "arb.meeting_created": { in_app: true, email: false },
  "adr.accepted": { in_app: true, email: false },
  "adr.deprecated": { in_app: true, email: false },
  "policy.updated": { in_app: true, email: false },
  "policy.deprecated": { in_app: true, email: false },
  "pattern.approved": { in_app: true, email: false },
  "pattern.deprecated": { in_app: true, email: false },
};

export async function GET(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const orgId = await getOrgId(supabase);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load saved preferences
  const { data: saved } = await supabaseAdmin
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .eq("org_id", orgId);

  const savedMap = new Map((saved ?? []).map((p: { event_type: string; in_app_enabled: boolean; email_enabled: boolean; digest_mode: boolean }) => [p.event_type, p]));

  // Merge with platform defaults
  const preferences = Object.entries(PLATFORM_DEFAULTS).map(([eventType, defaults]) => {
    const saved = savedMap.get(eventType);
    return {
      event_type: eventType,
      in_app_enabled: saved?.in_app_enabled ?? defaults.in_app,
      email_enabled: saved?.email_enabled ?? defaults.email,
      digest_mode: saved?.digest_mode ?? false,
    };
  });

  return NextResponse.json({ data: preferences });
}

export async function PUT(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = makeTGServerClient(accessToken);
  const orgId = await getOrgId(supabase);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { preferences } = body;

  if (!Array.isArray(preferences)) return NextResponse.json({ error: "preferences array required" }, { status: 400 });

  for (const pref of preferences) {
    await supabaseAdmin
      .from("notification_preferences")
      .upsert({
        org_id: orgId,
        user_id: user.id,
        event_type: pref.event_type,
        in_app_enabled: pref.in_app_enabled,
        email_enabled: pref.email_enabled,
        digest_mode: pref.digest_mode ?? false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id,user_id,event_type" });
  }

  return NextResponse.json({ success: true });
}
