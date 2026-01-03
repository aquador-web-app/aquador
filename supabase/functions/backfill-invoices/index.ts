// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL");
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("FUNCTION_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { limit = 100, offset = 0, only_missing = false } = await req.json()
      .catch(() => ({}));

    console.log("🧾 Backfill started:", { limit, offset, only_missing });

    // 1️⃣ Fetch all invoices (or only those missing pdf_url)
    let query = supabase.from("invoices").select("id, pdf_url").order("issued_at");
    if (only_missing) query = query.is("pdf_url", null);
    if (limit) query = query.range(offset, offset + limit - 1);

    const { data: invoices, error } = await query;
    if (error) throw error;

    if (!invoices?.length) {
      return new Response(
        JSON.stringify({ message: "No invoices found to backfill." }),
        { headers: corsHeaders }
      );
    }

    // 2️⃣ Regenerate PDFs one by one
    const results = [];
    for (const inv of invoices) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-invoice-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ invoice_id: inv.id, force_regen: true }),
      });

      const result = await res.json().catch(() => ({}));
      results.push({ id: inv.id, status: res.status, result });
      console.log(`✅ Backfilled ${inv.id} (${res.status})`);
      // small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 300));
    }

    return new Response(
      JSON.stringify({ count: results.length, results }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("🔥 Backfill failed:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
