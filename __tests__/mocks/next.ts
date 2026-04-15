// Mock NextRequest for API route testing
export function createMockRequest(
  method: string,
  url: string = "http://localhost:3000/api/test",
  options: {
    headers?: Record<string, string>;
    body?: unknown;
    searchParams?: Record<string, string>;
  } = {},
) {
  const urlObj = new URL(url);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      urlObj.searchParams.set(key, value);
    }
  }

  return {
    method,
    url: urlObj.toString(),
    headers: new Headers({
      "content-type": "application/json",
      authorization: "Bearer test-token",
      ...options.headers,
    }),
    nextUrl: urlObj,
    json: jest.fn().mockResolvedValue(options.body ?? {}),
    formData: jest.fn(),
  } as unknown;
}
