"use client";

import { X, ExternalLink } from "lucide-react";
import { SEVERITY_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface CitationData {
  policy_id: string;
  policy_title: string;
  clause_heading: string;
  chunk_content: string;
  similarity: number;
}

interface CitationDrawerProps {
  citation: CitationData | null;
  onClose: () => void;
  onNavigate?: (view: GovernanceView) => void;
}

export default function CitationDrawer({ citation, onClose, onNavigate }: CitationDrawerProps) {
  if (!citation) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div className="relative ml-auto flex h-full w-[360px] flex-col border-l border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h3 className="text-sm font-semibold">Policy Citation</h3>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <div className="text-xs font-medium uppercase tracking-wider text-neutral-400">Policy</div>
            <div className="mt-1 text-sm font-semibold text-neutral-900">{citation.policy_title}</div>
          </div>

          {citation.clause_heading && (
            <div className="mb-4">
              <div className="text-xs font-medium uppercase tracking-wider text-neutral-400">Clause</div>
              <div className="mt-1 text-sm font-medium text-neutral-700">{citation.clause_heading}</div>
            </div>
          )}

          <div className="mb-4">
            <div className="text-xs font-medium uppercase tracking-wider text-neutral-400">Content</div>
            <div className="mt-1 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600 leading-relaxed">
              {citation.chunk_content}
            </div>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-neutral-400">Relevance</div>
              <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                citation.similarity > 0.8 ? "bg-emerald-50 text-emerald-700" :
                citation.similarity > 0.7 ? "bg-amber-50 text-amber-700" :
                "bg-neutral-100 text-neutral-600"
              }`}>
                {(citation.similarity * 100).toFixed(0)}% match
              </div>
            </div>
          </div>

          {onNavigate && citation.policy_id && (
            <button
              onClick={() => {
                onNavigate({ page: "policies-detail", id: citation.policy_id });
                onClose();
              }}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
            >
              <ExternalLink size={14} /> View full policy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
