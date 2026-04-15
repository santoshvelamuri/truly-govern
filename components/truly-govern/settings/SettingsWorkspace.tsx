"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import DomainManager from "@/components/truly-govern/shared/DomainManager";
import TechDomainManager from "@/components/truly-govern/shared/TechDomainManager";
import BoardManager from "@/components/truly-govern/settings/BoardManager";
import NotificationPreferences from "@/components/truly-govern/settings/NotificationPreferences";

type SettingsTab = "general" | "technology-domains" | "arb-boards" | "notifications";

export default function SettingsWorkspace() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      setOrgId(profile?.org_id ?? null);
    }
    load();
  }, []);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "technology-domains", label: "Technology Domains" },
    { id: "arb-boards", label: "ARB Boards" },
    { id: "notifications", label: "Notifications" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Organisation Settings</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">Manage domains, technology reference model, and ARB board configuration.</p>

      {/* Tab strip */}
      <div className="mb-6 flex gap-1 border-b border-neutral-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {!orgId ? (
        <p className="text-sm text-neutral-400">Loading...</p>
      ) : (
        <div className="max-w-3xl">
          {activeTab === "general" && (
            <DomainManager orgId={orgId} />
          )}
          {activeTab === "technology-domains" && (
            <TechDomainManager orgId={orgId} />
          )}
          {activeTab === "arb-boards" && (
            <BoardManager orgId={orgId} />
          )}
          {activeTab === "notifications" && (
            <NotificationPreferences />
          )}
        </div>
      )}
    </div>
  );
}
