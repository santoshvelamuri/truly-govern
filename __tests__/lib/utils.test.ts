/**
 * Tests for lib/truly-govern/utils.ts
 */

import {
  severityColor,
  riskColor,
  confidenceColor,
  truncate,
  formatDate,
  formatRelative,
} from "@/lib/truly-govern/utils";

// ---------------------------------------------------------------------------
// severityColor
// ---------------------------------------------------------------------------

describe("severityColor", () => {
  it("returns a CSS class string for blocking", () => {
    const result = severityColor("blocking");
    expect(result).toContain("red");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a CSS class string for warning", () => {
    const result = severityColor("warning");
    expect(result).toContain("amber");
  });

  it("returns a CSS class string for advisory", () => {
    const result = severityColor("advisory");
    expect(result).toContain("blue");
  });

  it("returns empty string for unknown severity", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(severityColor("unknown" as any)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// riskColor
// ---------------------------------------------------------------------------

describe("riskColor", () => {
  it("returns a color string for each risk level", () => {
    expect(riskColor("low")).toContain("blue");
    expect(riskColor("medium")).toContain("amber");
    expect(riskColor("high")).toContain("orange");
    expect(riskColor("critical")).toContain("red");
  });

  it("returns empty string for unknown risk level", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(riskColor("none" as any)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// confidenceColor
// ---------------------------------------------------------------------------

describe("confidenceColor", () => {
  it("returns a color string for each confidence level", () => {
    expect(confidenceColor("high")).toContain("emerald");
    expect(confidenceColor("medium")).toContain("amber");
    expect(confidenceColor("low")).toContain("red");
  });

  it("returns empty string for unknown confidence", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(confidenceColor("none" as any)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns the original string when shorter than maxLen", () => {
    expect(truncate("hello", 120)).toBe("hello");
  });

  it("returns the original string when exactly maxLen", () => {
    const str = "a".repeat(120);
    expect(truncate(str)).toBe(str);
  });

  it("truncates and appends ellipsis when longer than maxLen", () => {
    const str = "a".repeat(200);
    const result = truncate(str, 120);
    expect(result.length).toBeLessThanOrEqual(121); // 120 chars + ellipsis char
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("respects custom maxLen", () => {
    const str = "hello world this is a long string";
    const result = truncate(str, 10);
    expect(result.length).toBeLessThanOrEqual(11);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("uses default maxLen of 120", () => {
    const str = "x".repeat(121);
    const result = truncate(str);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("handles empty string", () => {
    expect(truncate("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  it("formats an ISO date string to en-GB day month year", () => {
    // Note: exact output depends on locale availability in the test env
    const result = formatDate("2024-03-15T10:30:00Z");
    expect(result).toMatch(/15/);
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/2024/);
  });

  it("handles dates at year boundaries", () => {
    const result = formatDate("2024-01-01T00:00:00Z");
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/Jan/);
  });
});

// ---------------------------------------------------------------------------
// formatRelative
// ---------------------------------------------------------------------------

describe("formatRelative", () => {
  it("returns 'just now' for a time less than 1 minute ago", () => {
    const now = new Date().toISOString();
    expect(formatRelative(now)).toBe("just now");
  });

  it("returns minutes ago for times within the last hour", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelative(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago for times within the last day", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatRelative(threeHoursAgo)).toBe("3h ago");
  });

  it("returns days ago for times within the last month", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
    expect(formatRelative(fiveDaysAgo)).toBe("5d ago");
  });

  it("falls back to formatted date for times older than 30 days", () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString();
    const result = formatRelative(oldDate);
    // Should be a formatted date, not "Xd ago"
    expect(result).not.toMatch(/d ago$/);
    expect(result).toMatch(/\d{4}/); // contains a year
  });
});
