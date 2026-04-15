import {
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  RISK_LABELS,
  RISK_COLORS,
  REVIEW_STATUS_LABELS,
  DECISION_STATUS_LABELS,
  ADR_STATUS_LABELS,
  POLICY_STATUS_LABELS,
  CONFIDENCE_COLORS,
  INGESTION_STATUS_LABELS,
  PATTERN_STATUS_LABELS,
  PATTERN_CLAUSE_TYPE_LABELS,
  DEVIATION_STATUS_LABELS,
  DEVIATION_SOURCE_LABELS,
  TG_NAV_ITEMS,
} from "@/lib/truly-govern/constants";

// ---------------------------------------------------------------------------
// SEVERITY
// ---------------------------------------------------------------------------

describe("SEVERITY_LABELS", () => {
  it("has all expected severity keys", () => {
    expect(Object.keys(SEVERITY_LABELS)).toEqual(
      expect.arrayContaining(["blocking", "warning", "advisory"]),
    );
  });

  it("maps to human-readable strings", () => {
    expect(SEVERITY_LABELS.blocking).toBe("Blocking");
    expect(SEVERITY_LABELS.warning).toBe("Warning");
    expect(SEVERITY_LABELS.advisory).toBe("Advisory");
  });
});

describe("SEVERITY_COLORS", () => {
  it("has a color string for each severity key", () => {
    for (const key of Object.keys(SEVERITY_LABELS)) {
      expect(SEVERITY_COLORS).toHaveProperty(key);
      expect(typeof (SEVERITY_COLORS as Record<string, string>)[key]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// RISK
// ---------------------------------------------------------------------------

describe("RISK_LABELS", () => {
  it("has low, medium, high, critical", () => {
    expect(Object.keys(RISK_LABELS)).toEqual(
      expect.arrayContaining(["low", "medium", "high", "critical"]),
    );
  });

  it("maps to correct display strings", () => {
    expect(RISK_LABELS.low).toBe("Low");
    expect(RISK_LABELS.medium).toBe("Medium");
    expect(RISK_LABELS.high).toBe("High");
    expect(RISK_LABELS.critical).toBe("Critical");
  });
});

describe("RISK_COLORS", () => {
  it("has a color string for each risk level", () => {
    for (const key of Object.keys(RISK_LABELS)) {
      expect(RISK_COLORS).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// REVIEW STATUS
// ---------------------------------------------------------------------------

describe("REVIEW_STATUS_LABELS", () => {
  it("includes self_assessment status", () => {
    expect(REVIEW_STATUS_LABELS).toHaveProperty("self_assessment");
    expect(REVIEW_STATUS_LABELS.self_assessment).toBe("Self-Assessment");
  });

  it("has all expected statuses", () => {
    const expected = ["pending", "self_assessment", "in_review", "approved", "rejected", "deferred"];
    expect(Object.keys(REVIEW_STATUS_LABELS)).toEqual(expect.arrayContaining(expected));
  });
});

// ---------------------------------------------------------------------------
// DECISION STATUS
// ---------------------------------------------------------------------------

describe("DECISION_STATUS_LABELS", () => {
  it("includes draft, submitted, in_review, decided", () => {
    expect(Object.keys(DECISION_STATUS_LABELS)).toEqual(
      expect.arrayContaining(["draft", "submitted", "in_review", "decided"]),
    );
  });
});

// ---------------------------------------------------------------------------
// ADR STATUS
// ---------------------------------------------------------------------------

describe("ADR_STATUS_LABELS", () => {
  it("includes proposed, accepted, deprecated, superseded", () => {
    expect(Object.keys(ADR_STATUS_LABELS)).toEqual(
      expect.arrayContaining(["proposed", "accepted", "deprecated", "superseded"]),
    );
  });
});

// ---------------------------------------------------------------------------
// POLICY STATUS
// ---------------------------------------------------------------------------

describe("POLICY_STATUS_LABELS", () => {
  it("covers full policy lifecycle", () => {
    expect(Object.keys(POLICY_STATUS_LABELS)).toEqual(
      expect.arrayContaining(["draft", "in_review", "approved", "active", "deprecated"]),
    );
  });
});

// ---------------------------------------------------------------------------
// CONFIDENCE COLORS
// ---------------------------------------------------------------------------

describe("CONFIDENCE_COLORS", () => {
  it("has high, medium, low keys", () => {
    expect(Object.keys(CONFIDENCE_COLORS)).toEqual(
      expect.arrayContaining(["high", "medium", "low"]),
    );
  });

  it("each value is a non-empty string", () => {
    for (const val of Object.values(CONFIDENCE_COLORS)) {
      expect(typeof val).toBe("string");
      expect(val.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// INGESTION STATUS
// ---------------------------------------------------------------------------

describe("INGESTION_STATUS_LABELS", () => {
  it("covers none through failed", () => {
    expect(Object.keys(INGESTION_STATUS_LABELS)).toEqual(
      expect.arrayContaining(["none", "queued", "processing", "complete", "failed"]),
    );
  });
});

// ---------------------------------------------------------------------------
// PATTERN STATUS & CLAUSE TYPES
// ---------------------------------------------------------------------------

describe("PATTERN_STATUS_LABELS", () => {
  it("has draft, in_review, approved, deprecated", () => {
    expect(Object.keys(PATTERN_STATUS_LABELS)).toEqual(
      expect.arrayContaining(["draft", "in_review", "approved", "deprecated"]),
    );
  });
});

describe("PATTERN_CLAUSE_TYPE_LABELS", () => {
  it("has constraint, guidance, variant", () => {
    expect(Object.keys(PATTERN_CLAUSE_TYPE_LABELS)).toEqual(
      expect.arrayContaining(["constraint", "guidance", "variant"]),
    );
  });
});

// ---------------------------------------------------------------------------
// DEVIATION
// ---------------------------------------------------------------------------

describe("DEVIATION_STATUS_LABELS", () => {
  it("has all deviation lifecycle statuses", () => {
    const expected = [
      "open", "pending_verification", "overdue",
      "expiring", "expired", "resolved", "renewed",
    ];
    expect(Object.keys(DEVIATION_STATUS_LABELS)).toEqual(
      expect.arrayContaining(expected),
    );
  });
});

describe("DEVIATION_SOURCE_LABELS", () => {
  it("has condition, waiver, exception", () => {
    expect(Object.keys(DEVIATION_SOURCE_LABELS)).toEqual(
      expect.arrayContaining(["condition", "waiver", "exception"]),
    );
  });
});

// ---------------------------------------------------------------------------
// TG_NAV_ITEMS
// ---------------------------------------------------------------------------

describe("TG_NAV_ITEMS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(TG_NAV_ITEMS)).toBe(true);
    expect(TG_NAV_ITEMS.length).toBeGreaterThan(0);
  });

  it("each section has a section name and items array", () => {
    for (const section of TG_NAV_ITEMS) {
      expect(typeof section.section).toBe("string");
      expect(Array.isArray(section.items)).toBe(true);
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("each nav item has label, href, and icon", () => {
    for (const section of TG_NAV_ITEMS) {
      for (const item of section.items) {
        expect(typeof item.label).toBe("string");
        expect(typeof item.href).toBe("string");
        expect(item.href.startsWith("/")).toBe(true);
        expect(typeof item.icon).toBe("string");
      }
    }
  });

  it("contains expected sections", () => {
    const sectionNames = TG_NAV_ITEMS.map((s) => s.section);
    expect(sectionNames).toEqual(
      expect.arrayContaining(["Govern", "Review", "Decide", "Record", "Settings"]),
    );
  });

  it("Govern section includes Advisor, Policy library, Pattern library, Deviations", () => {
    const govern = TG_NAV_ITEMS.find((s) => s.section === "Govern");
    expect(govern).toBeDefined();
    const labels = govern!.items.map((i) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Advisor", "Policy library", "Pattern library", "Deviations"]),
    );
  });
});
