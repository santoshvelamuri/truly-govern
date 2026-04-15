import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notify } from "@/lib/truly-govern/notifications";

const SEVERITY_WEIGHT: Record<string, number> = { critical: 10, high: 6, medium: 3, low: 1 };
const ESCALATION_MULTIPLIER: Record<number, number> = { 0: 1.0, 1: 1.5, 2: 2.0, 3: 3.0 };

/**
 * Nightly job: recompute debt scores, update statuses, escalate overdue deviations.
 * Call via POST /api/truly-govern/notifications/check-deadlines
 */
export async function runDeadlineCheck(orgId: string): Promise<{ processed: number }> {
  let processed = 0;

  // 1. Recompute debt scores for all non-resolved deviations
  const { data: deviations } = await supabaseAdmin
    .from("governance_deviations")
    .select("id, severity, escalation_level, created_at, status, expiry_date, due_date")
    .eq("org_id", orgId)
    .not("status", "in", '("resolved","expired")');

  for (const d of deviations ?? []) {
    const ageDays = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000);
    const weight = SEVERITY_WEIGHT[d.severity] ?? 3;
    const ageFactor = 1 + ageDays / 30;
    const escMult = ESCALATION_MULTIPLIER[d.escalation_level] ?? 1;
    const debtScore = Math.round(weight * ageFactor * escMult);

    const updates: Record<string, unknown> = { debt_score: debtScore };

    // 2. Update expiring/expired status for waivers and exceptions
    if (d.expiry_date) {
      const expiryDate = new Date(d.expiry_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / 86400000);

      if (daysUntilExpiry < 0 && d.status !== "expired") {
        updates.status = "expired";
        // Notify
        notify("deviation.expired", d.id, orgId, { title: "Deviation expired" }).catch(console.error);
      } else if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30 && d.status === "open") {
        updates.status = "expiring";
      }
    }

    // 3. Update overdue conditions (past due_date)
    if (d.due_date && d.status === "open") {
      const dueDate = new Date(d.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dueDate < today) {
        updates.status = "overdue";
      }
    }

    // 4. Escalation levels for overdue deviations
    if (d.status === "overdue" || updates.status === "overdue") {
      if (ageDays >= 90 && d.escalation_level < 3) {
        updates.escalation_level = 3;
        notify("deviation.escalated_t30", d.id, orgId, { title: "Critical escalation T+90" }).catch(console.error);
        // Create risk register entry
        await supabaseAdmin.from("governance_risk_register").insert([{
          org_id: orgId, deviation_id: d.id,
        }]);
      } else if (ageDays >= 30 && d.escalation_level < 2) {
        updates.escalation_level = 2;
        notify("deviation.escalated_t30", d.id, orgId, { title: "Escalation T+30" }).catch(console.error);
      } else if (ageDays >= 14 && d.escalation_level < 1) {
        updates.escalation_level = 1;
        notify("deviation.escalated_t14", d.id, orgId, { title: "Escalation T+14" }).catch(console.error);
      }
    }

    await supabaseAdmin.from("governance_deviations").update(updates).eq("id", d.id);
    processed++;
  }

  return { processed };
}
