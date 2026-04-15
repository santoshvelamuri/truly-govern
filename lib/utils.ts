import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generates a UUID, falling back to a manual implementation in environments without crypto.randomUUID. */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Retrieves the current Supabase session access token. Returns undefined if not authenticated. */
export async function getAccessToken(): Promise<string | undefined> {
  const { supabase } = await import("@/lib/supabaseClient");
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

/** Authenticated fetch helper for internal API routes. Handles token, headers, and JSON parsing. */
export async function apiFetch(
  url: string,
  options: { method: "POST" | "PUT" | "DELETE"; body?: object },
): Promise<{ data: any; error: string | null }> {
  const token = await getAccessToken();
  if (!token) return { data: null, error: "Unauthorized" };
  const res = await fetch(url, {
    method: options.method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  try {
    const json = await res.json();
    return { data: json.data ?? null, error: json.error ?? null };
  } catch {
    return { data: null, error: `HTTP ${res.status}: ${res.statusText}` };
  }
}

/**
 * Safely parses a fetch Response as JSON.
 * Returns `{ error }` with the HTTP status text if the body is not valid JSON
 * (e.g. a 504 HTML error page), preventing uncaught TypeErrors.
 */
export async function parseJsonResponse(res: Response): Promise<{ error?: string; data?: unknown }> {
  try {
    return await res.json();
  } catch {
    return { error: `HTTP ${res.status}: ${res.statusText}` };
  }
}
