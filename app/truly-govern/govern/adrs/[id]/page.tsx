"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import AdrDetailWorkspace from "@/components/truly-govern/adrs/AdrDetailWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function AdrDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "adrs") {
      router.push("/truly-govern/govern/adrs");
    } else if (view.page === "adrs-detail") {
      router.push(`/truly-govern/govern/adrs/${view.id}`);
    } else if (view.page === "adrs-new" || view.page === "adrs-new-supersede") {
      router.push("/truly-govern/govern/adrs/new");
    } else if (view.page === "reviews-detail") {
      router.push(`/truly-govern/govern/reviews/${view.id}`);
    }
  }, [router]);

  return <AdrDetailWorkspace adrId={id} onNavigate={onNavigate} />;
}
