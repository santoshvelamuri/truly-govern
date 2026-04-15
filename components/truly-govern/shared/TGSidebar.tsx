"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Shield,
  ClipboardCheck,
  GitBranch,
  Calendar,
  FileText,
  Settings,
} from "lucide-react";
import { TG_NAV_ITEMS } from "@/lib/truly-govern/constants";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  MessageSquare,
  Shield,
  ClipboardCheck,
  GitBranch,
  Calendar,
  FileText,
  Settings,
};

export default function TGSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-4 py-4">
        <span className="text-sm font-semibold text-neutral-900">Truly Govern</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {TG_NAV_ITEMS.map((section) => (
          <div key={section.section} className="mb-3">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              {section.section}
            </div>
            {section.items.map((item) => {
              const Icon = ICON_MAP[item.icon];
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors ${
                    isActive
                      ? "border-l-2 border-neutral-900 bg-neutral-100 font-medium text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                  }`}
                >
                  {Icon && <Icon size={16} />}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
