"use client";

import { Upload, X, FileText, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

interface UploadStandardsModalProps {
  onClose: () => void;
  onImported: (count: number) => void;
}

const ACCEPTED_TYPES = ".pdf,.txt,.md,.json";

export function UploadStandardsModal({ onClose, onImported }: UploadStandardsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }

  async function handleExtract() {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = (await (await import("@/lib/supabaseClient")).supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/standard-policies/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const result = await res.json();
      if (result.error) {
        setError(result.error);
      } else {
        onImported(result.count ?? 0);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border/60 bg-surface-elevated p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Upload Standards Document</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver
              ? "border-brand-primary bg-brand-primary/5"
              : file
              ? "border-green-400 bg-green-50/50 dark:border-green-600 dark:bg-green-950/20"
              : "border-border/70 hover:border-brand-primary/50 hover:bg-muted/20"
          }`}
        >
          {file ? (
            <>
              <FileText className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Choose a different file
              </button>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground">Supports PDF, TXT, MD, JSON</p>
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          The document will be analyzed using AI to extract architecture standards conforming to the policy schema. Extracted policies are saved as <strong>draft</strong>.
        </p>

        {error && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border/70 bg-background px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!file || uploading}
            onClick={handleExtract}
            className="inline-flex items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Extracting...
              </>
            ) : (
              "Extract & Import"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
