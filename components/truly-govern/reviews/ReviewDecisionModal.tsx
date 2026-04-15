"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";

type DecisionType = "approved" | "approved_with_conditions" | "rejected" | "deferred";

interface Condition {
  description: string;
  due_date: string;
}

interface ReviewDecisionModalProps {
  type: DecisionType;
  onConfirm: (data: { notes?: string; conditions?: Condition[]; reason?: string }) => void;
  onClose: () => void;
  saving: boolean;
}

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

export default function ReviewDecisionModal({ type, onConfirm, onClose, saving }: ReviewDecisionModalProps) {
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([{ description: "", due_date: "" }]);

  function addCondition() {
    setConditions([...conditions, { description: "", due_date: "" }]);
  }

  function updateCondition(i: number, field: keyof Condition, value: string) {
    setConditions(conditions.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  function removeCondition(i: number) {
    setConditions(conditions.filter((_, idx) => idx !== i));
  }

  function handleConfirm() {
    if (type === "rejected" && !reason.trim()) return;
    if (type === "approved_with_conditions") {
      const validConditions = conditions.filter((c) => c.description.trim() && c.due_date);
      if (validConditions.length === 0) return;
      onConfirm({ conditions: validConditions });
    } else if (type === "rejected") {
      onConfirm({ reason });
    } else {
      onConfirm({ notes: notes || undefined });
    }
  }

  const titles: Record<DecisionType, string> = {
    approved: "Approve Review",
    approved_with_conditions: "Approve with Conditions",
    rejected: "Reject Review",
    deferred: "Defer Review",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{titles[type]}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {type === "approved" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Reviewer note (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} placeholder="Any comments for the submitter..." />
            </div>
          )}

          {type === "deferred" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Reason for deferral (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} placeholder="Why is this being deferred..." />
            </div>
          )}

          {type === "rejected" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Reason for rejection *</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className={inputClass} placeholder="Explain why this review is being rejected..." />
            </div>
          )}

          {type === "approved_with_conditions" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium">Conditions</label>
              {conditions.map((c, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-neutral-200 p-3">
                  <div className="flex-1 space-y-2">
                    <input value={c.description} onChange={(e) => updateCondition(i, "description", e.target.value)} className={inputClass} placeholder="Condition description" />
                    <input type="date" value={c.due_date} onChange={(e) => updateCondition(i, "due_date", e.target.value)} className={inputClass} />
                  </div>
                  {conditions.length > 1 && (
                    <button onClick={() => removeCondition(i)} className="mt-2 text-neutral-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addCondition} className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
                <Plus size={14} /> Add condition
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={saving || (type === "rejected" && !reason.trim())}
            className={`rounded-md px-4 py-2 text-sm text-white disabled:opacity-50 ${
              type === "rejected" ? "bg-red-600 hover:bg-red-700" :
              type === "deferred" ? "bg-amber-600 hover:bg-amber-700" :
              "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {saving ? "Saving..." : type === "approved_with_conditions" ? `Confirm with ${conditions.filter(c => c.description).length} conditions` : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
