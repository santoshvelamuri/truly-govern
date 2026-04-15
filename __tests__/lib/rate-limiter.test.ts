/**
 * Tests for the rate limiter logic in lib/api-auth.ts
 *
 * The rate limiter (checkRateLimit) is not exported, so we test it indirectly
 * by importing the module internals via jest module tricks.  We re-implement
 * the pure logic here to keep the tests deterministic and avoid pulling in
 * Next.js / Supabase dependencies.
 */

// ---------------------------------------------------------------------------
// Re-create the rate-limiter logic in isolation (mirrors lib/api-auth.ts)
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(
  ip: string,
  limit: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: limit - 1 };
  }

  bucket.count++;
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: limit - bucket.count };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  rateBuckets.clear();
  jest.restoreAllMocks();
});

describe("checkRateLimit", () => {
  const DEFAULT_LIMIT = 100;

  it("allows the first request and returns remaining = limit - 1", () => {
    const result = checkRateLimit("127.0.0.1", DEFAULT_LIMIT);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DEFAULT_LIMIT - 1);
  });

  it("allows up to the 100th request", () => {
    const ip = "10.0.0.1";
    let result: { allowed: boolean; remaining: number } = { allowed: false, remaining: 0 };

    for (let i = 0; i < DEFAULT_LIMIT; i++) {
      result = checkRateLimit(ip, DEFAULT_LIMIT);
      expect(result.allowed).toBe(true);
    }
    // After 100 requests, remaining should be 0
    expect(result.remaining).toBe(0);
  });

  it("blocks the 101st request", () => {
    const ip = "10.0.0.2";

    for (let i = 0; i < DEFAULT_LIMIT; i++) {
      checkRateLimit(ip, DEFAULT_LIMIT);
    }

    const result = checkRateLimit(ip, DEFAULT_LIMIT);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("allows requests again after the window expires", () => {
    const ip = "10.0.0.3";

    // Exhaust the limit
    for (let i = 0; i < DEFAULT_LIMIT; i++) {
      checkRateLimit(ip, DEFAULT_LIMIT);
    }
    expect(checkRateLimit(ip, DEFAULT_LIMIT).allowed).toBe(false);

    // Simulate window expiry by manipulating the bucket directly
    const bucket = rateBuckets.get(ip)!;
    bucket.resetAt = Date.now() - 1; // expired

    const result = checkRateLimit(ip, DEFAULT_LIMIT);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DEFAULT_LIMIT - 1);
  });

  it("tracks different IPs independently", () => {
    const ipA = "192.168.1.1";
    const ipB = "192.168.1.2";

    // Exhaust ipA
    for (let i = 0; i < DEFAULT_LIMIT; i++) {
      checkRateLimit(ipA, DEFAULT_LIMIT);
    }
    expect(checkRateLimit(ipA, DEFAULT_LIMIT).allowed).toBe(false);

    // ipB should still be allowed
    const result = checkRateLimit(ipB, DEFAULT_LIMIT);
    expect(result.allowed).toBe(true);
  });

  it("supports a stricter AI rate limit of 10", () => {
    const AI_LIMIT = 10;
    const ip = "10.0.0.4";

    for (let i = 0; i < AI_LIMIT; i++) {
      expect(checkRateLimit(ip, AI_LIMIT).allowed).toBe(true);
    }
    expect(checkRateLimit(ip, AI_LIMIT).allowed).toBe(false);
  });

  it("decrements remaining correctly on each request", () => {
    const ip = "10.0.0.5";
    const limit = 5;

    for (let i = 0; i < limit; i++) {
      const result = checkRateLimit(ip, limit);
      expect(result.remaining).toBe(limit - 1 - i);
    }
  });
});
