import { SEVERITY_COLORS, RISK_COLORS, CONFIDENCE_COLORS } from "./constants";
import type { Severity, RiskLevel, Confidence } from "./types";

export function severityColor(s: Severity): string {
  return SEVERITY_COLORS[s] ?? "";
}

export function riskColor(r: RiskLevel): string {
  return RISK_COLORS[r] ?? "";
}

export function confidenceColor(c: Confidence): string {
  return CONFIDENCE_COLORS[c] ?? "";
}

export function truncate(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
