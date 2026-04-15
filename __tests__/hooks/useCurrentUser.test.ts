/**
 * @jest-environment jsdom
 */

import { renderHook, waitFor } from "@testing-library/react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// ── Mock supabase client ────────────────────────────────────────────────────

const mockGetUser = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();

jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => ({
      select: (...args: unknown[]) => {
        mockSelect(...args);
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs);
            return { single: () => mockSingle() };
          },
        };
      },
    }),
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function setupMocks(user: { id: string } | null, role: string | null) {
  mockGetUser.mockResolvedValue({ data: { user } });
  if (user && role !== null) {
    mockSingle.mockResolvedValue({ data: { role } });
  } else {
    mockSingle.mockResolvedValue({ data: null });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("useCurrentUser", () => {
  it("returns loading=true initially", () => {
    // Never resolve so the hook stays in loading state
    mockGetUser.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCurrentUser());

    expect(result.current.loading).toBe(true);
    expect(result.current.userId).toBeNull();
    expect(result.current.role).toBeNull();
    expect(result.current.isAdmin).toBe(false);
  });

  it("returns userId and role after fetch", async () => {
    setupMocks({ id: "user-1" }, "member");

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userId).toBe("user-1");
    expect(result.current.role).toBe("member");
  });

  it("isAdmin=true for owner role", async () => {
    setupMocks({ id: "user-2" }, "owner");

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
  });

  it("isAdmin=true for admin role", async () => {
    setupMocks({ id: "user-3" }, "admin");

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
  });

  it("isAdmin=false for member role", async () => {
    setupMocks({ id: "user-4" }, "member");

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });

  it("isAdmin=false for viewer role", async () => {
    setupMocks({ id: "user-5" }, "viewer");

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });

  it("handles no user (unauthenticated) gracefully", async () => {
    setupMocks(null, null);

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userId).toBeNull();
    expect(result.current.role).toBeNull();
    expect(result.current.isAdmin).toBe(false);
  });
});
