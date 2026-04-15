"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import ArbMeetingDetail from "@/components/truly-govern/decisions/ArbMeetingDetail";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function ArbMeetingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "arb") router.push("/truly-govern/govern/arb");
    else if (view.page === "decisions-detail") router.push(`/truly-govern/govern/decisions/${view.id}`);
  }, [router]);
  return <ArbMeetingDetail meetingId={id} onNavigate={onNavigate} />;
}
