import { createClient } from "@supabase/supabase-js";

// Server-side only — uses service role key, never exposed to the browser.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
