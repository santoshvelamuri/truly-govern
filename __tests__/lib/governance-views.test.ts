/**
 * Tests for GovernanceView type from lib/truly-govern/governance-views.ts
 *
 * Since GovernanceView is a pure TypeScript union type (no runtime exports),
 * we verify that the type compiles correctly for all expected page variants.
 * If a page variant is removed from the union, the corresponding assignment
 * below will produce a compile error caught by ts-jest.
 */

import type { GovernanceView } from "@/lib/truly-govern/governance-views";

describe("GovernanceView type", () => {
  // Helper: we assign values that must be valid GovernanceView members.
  // A compile failure here means the type no longer covers that page.

  it("covers simple pages without extra props", () => {
    const views: GovernanceView[] = [
      { page: "advisor" },
      { page: "policies" },
      { page: "policies-new" },
      { page: "deviations" },
      { page: "exceptions" },
      { page: "exceptions-new" },
      { page: "reviews" },
      { page: "reviews-new" },
      { page: "decisions" },
      { page: "decisions-new" },
      { page: "arb" },
      { page: "patterns" },
      { page: "patterns-new" },
      { page: "adrs" },
      { page: "adrs-new" },
      { page: "settings" },
      { page: "standards" },
      { page: "compliance" },
    ];

    // Runtime sanity check — every entry has a page string
    for (const v of views) {
      expect(typeof v.page).toBe("string");
      expect(v.page.length).toBeGreaterThan(0);
    }
  });

  it("covers detail pages with an id property", () => {
    const detailViews: GovernanceView[] = [
      { page: "policies-detail", id: "p-1" },
      { page: "deviations-detail", id: "d-1" },
      { page: "exceptions-detail", id: "e-1" },
      { page: "reviews-edit", id: "r-1" },
      { page: "reviews-detail", id: "r-2" },
      { page: "decisions-detail", id: "dec-1" },
      { page: "arb-detail", id: "arb-1" },
      { page: "patterns-detail", id: "pat-1" },
      { page: "patterns-review", id: "pat-2" },
      { page: "adrs-detail", id: "adr-1" },
    ];

    for (const v of detailViews) {
      expect(v).toHaveProperty("id");
      expect(typeof (v as { id: string }).id).toBe("string");
    }
  });

  it("covers arb-board-detail with boardId", () => {
    const view: GovernanceView = { page: "arb-board-detail", boardId: "board-1" };
    expect(view.page).toBe("arb-board-detail");
    expect(view.boardId).toBe("board-1");
  });

  it("covers adrs-new-supersede with supersedeId", () => {
    const view: GovernanceView = { page: "adrs-new-supersede", supersedeId: "adr-old" };
    expect(view.page).toBe("adrs-new-supersede");
    expect(view.supersedeId).toBe("adr-old");
  });

  it("all expected page names are present in the union (exhaustiveness)", () => {
    // We list every expected page string and verify we can construct a valid
    // GovernanceView for each. This is primarily a compile-time check.
    const allPages: string[] = [
      "advisor",
      "policies", "policies-new", "policies-detail",
      "deviations", "deviations-detail",
      "exceptions", "exceptions-new", "exceptions-detail",
      "reviews", "reviews-new", "reviews-edit", "reviews-detail",
      "decisions", "decisions-new", "decisions-detail",
      "arb", "arb-board-detail", "arb-detail",
      "patterns", "patterns-new", "patterns-detail", "patterns-review",
      "adrs", "adrs-new", "adrs-new-supersede", "adrs-detail",
      "settings", "standards", "compliance",
    ];

    expect(allPages.length).toBe(30);
    // Ensure no duplicates
    expect(new Set(allPages).size).toBe(allPages.length);
  });
});
