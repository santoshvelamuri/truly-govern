import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { url, content: pastedContent, title, tech_domain_id, preview } = body;

  let extractedContent = "";
  let sourceUrl = "";
  let sourceTitle = title ?? "";

  if (url) {
    // Fetch URL content
    sourceUrl = url;
    try {
      const res = await fetch(url, {
        headers: body.confluence_token
          ? { Authorization: `Bearer ${body.confluence_token}` }
          : {},
      });
      if (!res.ok) return NextResponse.json({ error: `Failed to fetch URL: ${res.status}` }, { status: 400 });
      const html = await res.text();

      // Strip HTML tags to get plain text
      extractedContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!sourceTitle) {
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        sourceTitle = match?.[1]?.trim() ?? url;
      }
    } catch (e) {
      return NextResponse.json({ error: `Failed to fetch: ${e}` }, { status: 400 });
    }
  } else if (pastedContent) {
    extractedContent = pastedContent;
    sourceTitle = title ?? "Imported document";
  } else {
    return NextResponse.json({ error: "Either url or content is required" }, { status: 400 });
  }

  // Look up tech domain name for denormalized storage
  let domainName = "";
  if (tech_domain_id) {
    const { data: td } = await supabaseAdmin
      .from("technology_domains")
      .select("name")
      .eq("id", tech_domain_id)
      .single();
    domainName = td?.name ?? "";
  }

  // Preview mode — return extracted data without inserting
  if (preview) {
    return NextResponse.json({
      preview: true,
      data: {
        title: sourceTitle,
        content_preview: extractedContent.slice(0, 500),
        full_content: extractedContent.slice(0, 10000),
        source_url: sourceUrl,
        domain: domainName,
        tech_domain_id: tech_domain_id ?? null,
        rule_severity: "warning",
      },
    });
  }

  const policyId = `IMP-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await supabaseAdmin
    .from("standard_policies")
    .insert([{
      org_id: ctx.orgId,
      policy_id: policyId,
      title: sourceTitle,
      domain: domainName,
      tech_domain_id: tech_domain_id ?? null,
      subdomain: "",
      layer: "domain",
      mandatory: true,
      tags: [],
      rule_statement: extractedContent.slice(0, 10000),
      rule_rationale: "",
      rule_severity: "warning",
      rule_examples: {},
      scope: {},
      remediation_hint: "",
      provenance: { sources: [{ type: "url", ref: sourceUrl }] },
      source_type: "document",
      source_document: sourceUrl || "pasted",
      status: "draft",
      ingestion_status: "queued",
      custom_fields: {},
      created_by: ctx.user.id,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    data: {
      id: data.id,
      title: sourceTitle,
      ingestion_status: "queued",
      source_type: "document",
    },
  }, { status: 201 });
});
