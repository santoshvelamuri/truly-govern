import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ── Event Templates ──────────────────────────────────────────────────────────

interface NotificationTemplate {
  title: string;
  body: string;
  action_label: string;
  action_url: string;
  urgent: boolean;
  entity_type: string;
}

const TEMPLATES: Record<string, (ctx: Record<string, unknown>) => NotificationTemplate> = {
  "review.submitted": (ctx) => ({
    title: "Design review assigned to you",
    body: `${ctx.title} — ${ctx.domain ?? "No domain"} · ${ctx.risk_level ?? "unknown"} risk`,
    action_label: "Open review",
    action_url: `/govern/reviews/${ctx.entity_id}`,
    urgent: false,
    entity_type: "review",
  }),
  "review.approved": (ctx) => ({
    title: "Your review was approved",
    body: `${ctx.title} — approved`,
    action_label: "View review",
    action_url: `/govern/reviews/${ctx.entity_id}`,
    urgent: false,
    entity_type: "review",
  }),
  "review.approved_with_conditions": (ctx) => ({
    title: "Your review needs attention",
    body: `${ctx.title} — approved with conditions`,
    action_label: "View conditions",
    action_url: `/govern/reviews/${ctx.entity_id}?tab=conditions`,
    urgent: true,
    entity_type: "review",
  }),
  "review.rejected": (ctx) => ({
    title: "Your review was rejected",
    body: `${ctx.title} — rejection reason provided`,
    action_label: "View feedback",
    action_url: `/govern/reviews/${ctx.entity_id}`,
    urgent: true,
    entity_type: "review",
  }),
  "review.overdue": (ctx) => ({
    title: "Review overdue — 14+ days",
    body: `${ctx.title} — no decision yet`,
    action_label: "View review",
    action_url: `/govern/reviews/${ctx.entity_id}`,
    urgent: true,
    entity_type: "review",
  }),
  "condition.due_soon": (ctx) => ({
    title: "Condition due in 7 days",
    body: `${ctx.description ?? "Review condition"} — due ${ctx.due_date}`,
    action_label: "View condition",
    action_url: `/govern/reviews/${ctx.review_id}?tab=conditions`,
    urgent: false,
    entity_type: "condition",
  }),
  "condition.due_tomorrow": (ctx) => ({
    title: "Condition due tomorrow",
    body: `${ctx.description ?? "Review condition"} — due tomorrow`,
    action_label: "View condition",
    action_url: `/govern/reviews/${ctx.review_id}?tab=conditions`,
    urgent: true,
    entity_type: "condition",
  }),
  "condition.overdue": (ctx) => ({
    title: "Condition overdue",
    body: `${ctx.description ?? "Review condition"} — past due date`,
    action_label: "View condition",
    action_url: `/govern/reviews/${ctx.review_id}?tab=conditions`,
    urgent: true,
    entity_type: "condition",
  }),
  "condition.completed": (ctx) => ({
    title: "Condition completed",
    body: `${ctx.description ?? "Review condition"} — marked complete`,
    action_label: "View conditions",
    action_url: `/govern/reviews/${ctx.review_id}?tab=conditions`,
    urgent: false,
    entity_type: "condition",
  }),
  "decision.submitted": (ctx) => ({
    title: "New decision request submitted",
    body: `${ctx.title} — ${ctx.type ?? "decision"} · ${ctx.risk_level ?? "unknown"} risk`,
    action_label: "View request",
    action_url: `/govern/decisions/${ctx.entity_id}`,
    urgent: false,
    entity_type: "decision",
  }),
  "decision.decided": (ctx) => ({
    title: "Your decision request has been decided",
    body: `${ctx.title} — outcome recorded`,
    action_label: "View outcome",
    action_url: `/govern/decisions/${ctx.entity_id}`,
    urgent: false,
    entity_type: "decision",
  }),
  "arb.meeting_created": (ctx) => ({
    title: "ARB meeting scheduled",
    body: `${ctx.title} — ${ctx.date ?? "date TBD"}`,
    action_label: "View meeting",
    action_url: `/govern/arb/${ctx.entity_id}`,
    urgent: false,
    entity_type: "arb_meeting",
  }),
  "adr.accepted": (ctx) => ({
    title: "ADR accepted",
    body: `${ctx.title} — now searchable by the Governance Advisor`,
    action_label: "Read ADR",
    action_url: `/govern/adrs/${ctx.entity_id}`,
    urgent: false,
    entity_type: "adr",
  }),
  "adr.deprecated": (ctx) => ({
    title: "ADR deprecated",
    body: `${ctx.title} — no longer the current decision`,
    action_label: "View ADR",
    action_url: `/govern/adrs/${ctx.entity_id}`,
    urgent: false,
    entity_type: "adr",
  }),
  "policy.updated": (ctx) => ({
    title: "Policy updated",
    body: `${ctx.title} — ${ctx.active_review_count ?? 0} active reviews may be affected`,
    action_label: "View policy",
    action_url: `/govern/policies/${ctx.entity_id}`,
    urgent: false,
    entity_type: "policy",
  }),
  "policy.deprecated": (ctx) => ({
    title: "Policy deprecated",
    body: `${ctx.title} — no longer active`,
    action_label: "View policy",
    action_url: `/govern/policies/${ctx.entity_id}`,
    urgent: false,
    entity_type: "policy",
  }),
  "pattern.approved": (ctx) => ({
    title: "Pattern approved",
    body: `${ctx.title} — now available for review submissions`,
    action_label: "View pattern",
    action_url: `/govern/patterns/${ctx.entity_id}`,
    urgent: false,
    entity_type: "pattern",
  }),
  "pattern.deprecated": (ctx) => ({
    title: "Pattern deprecated",
    body: `${ctx.title} — no longer recommended`,
    action_label: "View pattern",
    action_url: `/govern/patterns/${ctx.entity_id}`,
    urgent: false,
    entity_type: "pattern",
  }),
  "condition.submitted_for_verification": (ctx) => ({
    title: "Condition ready for verification",
    body: `${ctx.description ?? "Review condition"} — owner has submitted evidence`,
    action_label: "Verify",
    action_url: `/govern/reviews/${ctx.review_id}?tab=conditions`,
    urgent: false,
    entity_type: "condition",
  }),
  "condition.verification_rejected": (ctx) => ({
    title: "Condition verification rejected",
    body: `${ctx.description ?? "Review condition"} — reviewer needs more work`,
    action_label: "View feedback",
    action_url: `/govern/reviews/${ctx.review_id}?tab=conditions`,
    urgent: true,
    entity_type: "condition",
  }),
  "exception.approved": (ctx) => ({
    title: "Policy exception approved",
    body: `${ctx.title} — exception is now active`,
    action_label: "View exception",
    action_url: `/govern/deviations`,
    urgent: false,
    entity_type: "exception",
  }),
  "exception.rejected": (ctx) => ({
    title: "Policy exception rejected",
    body: `${ctx.title} — see rejection reason`,
    action_label: "View details",
    action_url: `/govern/deviations`,
    urgent: true,
    entity_type: "exception",
  }),
  "deviation.expired": (ctx) => ({
    title: "Deviation expired",
    body: `${ctx.title} — waiver/exception has expired`,
    action_label: "View deviation",
    action_url: `/govern/deviations`,
    urgent: true,
    entity_type: "deviation",
  }),
  "deviation.escalated_t14": (ctx) => ({
    title: "Deviation escalated (T+14)",
    body: `${ctx.title} — overdue 14+ days, escalated to domain architect`,
    action_label: "View deviation",
    action_url: `/govern/deviations`,
    urgent: true,
    entity_type: "deviation",
  }),
  "deviation.escalated_t30": (ctx) => ({
    title: "Deviation escalated (T+30)",
    body: `${ctx.title} — overdue 30+ days, escalated to head of architecture`,
    action_label: "View deviation",
    action_url: `/govern/deviations`,
    urgent: true,
    entity_type: "deviation",
  }),
};

// ── Recipient Resolution ─────────────────────────────────────────────────────

async function resolveRecipients(
  eventType: string,
  entityId: string,
  orgId: string,
  context: Record<string, unknown>,
): Promise<string[]> {
  // Returns array of user IDs who should receive this notification
  switch (eventType) {
    case "review.submitted":
    case "review.resubmitted": {
      // Notify the assigned reviewer if one exists, otherwise fall back to all org members
      const { data: rev } = await supabaseAdmin.from("reviews").select("assigned_reviewer_id").eq("id", entityId).single();
      if (rev?.assigned_reviewer_id) return [rev.assigned_reviewer_id];
      const { data } = await supabaseAdmin.from("profiles").select("id").eq("org_id", orgId).limit(10);
      return (data ?? []).map((u: { id: string }) => u.id);
    }
    case "review.approved":
    case "review.approved_with_conditions":
    case "review.rejected": {
      const { data } = await supabaseAdmin.from("reviews").select("submitted_by").eq("id", entityId).single();
      return data?.submitted_by ? [data.submitted_by] : [];
    }
    case "review.overdue": {
      const { data } = await supabaseAdmin.from("reviews").select("submitted_by").eq("id", entityId).single();
      return data?.submitted_by ? [data.submitted_by] : [];
    }
    case "condition.due_soon":
    case "condition.due_tomorrow":
    case "condition.overdue": {
      const ownerId = context.owner_id as string;
      return ownerId ? [ownerId] : [];
    }
    case "condition.completed": {
      // Notify the reviewer who set the condition
      return [];
    }
    case "decision.submitted": {
      // Notify all board members for the resolved board
      const boardId = context.resolved_arb_board_id as string;
      if (!boardId) return [];
      const { data } = await supabaseAdmin.from("arb_board_members").select("user_id").eq("board_id", boardId);
      return (data ?? []).map((m: { user_id: string }) => m.user_id);
    }
    case "decision.decided": {
      const { data } = await supabaseAdmin.from("decision_requests").select("submitted_by").eq("id", entityId).single();
      return data?.submitted_by ? [data.submitted_by] : [];
    }
    case "arb.meeting_created": {
      const { data: meeting } = await supabaseAdmin.from("arb_meetings").select("board_id").eq("id", entityId).single();
      if (!meeting?.board_id) return [];
      const { data } = await supabaseAdmin.from("arb_board_members").select("user_id").eq("board_id", meeting.board_id);
      return (data ?? []).map((m: { user_id: string }) => m.user_id);
    }
    case "adr.accepted":
    case "adr.deprecated": {
      // Notify org members (simplification — refine to domain members later)
      const { data } = await supabaseAdmin.from("profiles").select("id").eq("org_id", orgId).limit(20);
      return (data ?? []).map((u: { id: string }) => u.id);
    }
    case "policy.updated":
    case "policy.deprecated": {
      const { data } = await supabaseAdmin.from("profiles").select("id").eq("org_id", orgId).limit(20);
      return (data ?? []).map((u: { id: string }) => u.id);
    }
    case "pattern.approved":
    case "pattern.deprecated": {
      const { data } = await supabaseAdmin.from("profiles").select("id").eq("org_id", orgId).limit(20);
      return (data ?? []).map((u: { id: string }) => u.id);
    }
    default:
      return [];
  }
}

// ── Main notify() function ───────────────────────────────────────────────────

export async function notify(
  eventType: string,
  entityId: string,
  orgId: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    const templateFn = TEMPLATES[eventType];
    if (!templateFn) {
      console.warn(`[notify] Unknown event type: ${eventType}`);
      return;
    }

    const fullContext = { ...context, entity_id: entityId };
    const template = templateFn(fullContext);

    // Resolve recipients
    const recipientIds = await resolveRecipients(eventType, entityId, orgId, context);
    if (recipientIds.length === 0) return;

    // Check preferences and filter out users who disabled in-app
    const { data: prefs } = await supabaseAdmin
      .from("notification_preferences")
      .select("user_id, in_app_enabled")
      .eq("event_type", eventType)
      .in("user_id", recipientIds);

    const disabledUsers = new Set(
      (prefs ?? [])
        .filter((p: { in_app_enabled: boolean }) => !p.in_app_enabled)
        .map((p: { user_id: string }) => p.user_id),
    );

    const enabledRecipients = recipientIds.filter((id) => !disabledUsers.has(id));
    if (enabledRecipients.length === 0) return;

    // Bulk-insert notifications
    const rows = enabledRecipients.map((userId) => ({
      org_id: orgId,
      user_id: userId,
      event_type: eventType,
      entity_type: template.entity_type,
      entity_id: entityId,
      title: template.title,
      body: template.body,
      action_label: template.action_label,
      action_url: template.action_url,
      urgent: template.urgent,
      read: false,
      type: eventType, // legacy column
      resource_type: template.entity_type, // legacy column
      resource_id: entityId, // legacy column
    }));

    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    if (error) {
      console.error("[notify] Insert error:", error.message);
    } else {
      console.log(`[notify] ${eventType} → ${enabledRecipients.length} recipients`);
    }
  } catch (err) {
    console.error("[notify] Error:", err instanceof Error ? err.message : String(err));
  }
}
