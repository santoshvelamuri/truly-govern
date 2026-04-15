import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";

function makeClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const supabase = makeClient(ctx.token);

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const { data, error } = await supabase
      .from("industry_templates")
      .select("id, industry, name, description, version, is_active, payload")
      .eq("id", id)
      .single();
    if (error) {
      console.error("[industry-templates GET single]", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data });
  }

  const { data, error } = await supabase
    .from("industry_templates")
    .select("id, industry, name, description, version, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    console.error("[industry-templates GET]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
});
