"use client";

import { useState } from "react";
import { OrgInfoTab } from "./org-info-tab";
import { UsersTab } from "./users-tab";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type ConfigTab = "org" | "users";

const TABS: { id: ConfigTab; label: string }[] = [
  { id: "org",   label: "Organisation" },
  { id: "users", label: "Users & Roles" },
];

export function ConfigurationWorkspace() {
  const [activeTab, setActiveTab] = useState<ConfigTab>("org");
  const { role } = useCurrentUser();

  const visibleTabs = role === "viewer" ? TABS.filter((t) => t.id !== "users") : TABS;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-subtle">
      {/* Internal tab strip */}
      <div className="shrink-0 border-b border-border/50 bg-surface-elevated px-6">
        <div className="flex">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 px-5 py-3 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-brand-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === "org" ? <OrgInfoTab /> : activeTab === "users" && role !== "viewer" ? <UsersTab /> : <OrgInfoTab />}
      </div>
    </div>
  );
}
