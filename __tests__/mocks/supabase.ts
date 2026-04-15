// Mock Supabase client for testing

/**
 * Create a Proxy-based chain mock that is thenable at every point in the chain.
 * Every method call returns the same proxy, and awaiting it resolves with `resolveWith`.
 */
export function createChainMock(resolveWith: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  const self: any = new Proxy(chain, {
    get(target, prop) {
      if (prop === "then") {
        // Make the chain thenable — resolves when awaited directly
        return (resolve: (v: unknown) => void) => resolve(resolveWith);
      }
      if (!target[prop as string]) {
        target[prop as string] = jest.fn(() => self);
      }
      return target[prop as string];
    },
  });
  return self;
}

export function createMockSupabaseClient(overrides: Record<string, unknown> = {}) {
  const mockQuery = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ilike: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null }),
  };

  return {
    from: jest.fn(() => mockQuery),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
      admin: {
        getUserById: jest.fn().mockResolvedValue({
          data: { user: { id: "test-user-id" } },
          error: null,
        }),
        inviteUserByEmail: jest.fn().mockResolvedValue({
          data: { user: { id: "invited-user-id" } },
          error: null,
        }),
      },
    },
    _mockQuery: mockQuery,
    ...overrides,
  };
}

export const mockSupabaseAdmin = createMockSupabaseClient();
export const mockSupabaseClient = createMockSupabaseClient();
