/**
 * Tests for lib/rbac.ts — hasRole helper
 */

// Mock the supabase client to avoid import side-effects
jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { hasRole, type UserProfile } from "@/lib/rbac";

describe("hasRole", () => {
  const adminProfile: UserProfile = { id: "u-1", email: "admin@test.com", role: "admin" };
  const memberProfile: UserProfile = { id: "u-2", email: "member@test.com", role: "member" };
  const ownerProfile: UserProfile = { id: "u-3", email: "owner@test.com", role: "owner" };

  // ── Null profile ───────────────────────────────────────────────────────

  it("returns false when profile is null", () => {
    expect(hasRole(null, "admin")).toBe(false);
  });

  it("returns false when profile is null and role is an array", () => {
    expect(hasRole(null, ["admin", "owner"])).toBe(false);
  });

  // ── Single role string ─────────────────────────────────────────────────

  it("returns true when profile role matches the required role", () => {
    expect(hasRole(adminProfile, "admin")).toBe(true);
  });

  it("returns false when profile role does not match", () => {
    expect(hasRole(memberProfile, "admin")).toBe(false);
  });

  it("matches exact role string (case-sensitive)", () => {
    expect(hasRole(adminProfile, "Admin")).toBe(false);
  });

  // ── Array of roles ────────────────────────────────────────────────────

  it("returns true when profile role is included in the array", () => {
    expect(hasRole(adminProfile, ["admin", "owner"])).toBe(true);
  });

  it("returns true for owner in [admin, owner]", () => {
    expect(hasRole(ownerProfile, ["admin", "owner"])).toBe(true);
  });

  it("returns false when profile role is not in the array", () => {
    expect(hasRole(memberProfile, ["admin", "owner"])).toBe(false);
  });

  it("returns false for an empty roles array", () => {
    expect(hasRole(adminProfile, [])).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it("handles member role check correctly", () => {
    expect(hasRole(memberProfile, "member")).toBe(true);
  });

  it("works with single-element array", () => {
    expect(hasRole(memberProfile, ["member"])).toBe(true);
  });
});
