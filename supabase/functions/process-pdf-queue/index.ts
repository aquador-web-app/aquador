// supabase/functions/process-pdf-queue/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PDF_ENDPOINT =
  "https://jrwsxeiueezuiueglfpv.functions.supabase.co/generate-invoice-pdf";

const SELF_ENDPOINT =
  "https://jrwsxeiueezuiueglfpv.functions.supabase.co/process-pdf-queue";

serve(async () => {
  const { data: jobs, error } = await supabase.rpc("fetch_pdf_jobs", { p_limit: 5 });

  if (error || !jobs || jobs.length === 0) {
    return new Response("Queue empty", { status: 200 });
  }

  for (const job of jobs) {
    try {
      // 1) Call PDF generator
      const res = await fetch(PDF_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          invoice_id: job.invoice_id,
          source: "monthly",
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `PDF endpoint failed (${res.status})`);
      }

      // 2) Verify invoice row got updated (this is the missing piece)
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("id, pdf_url")
        .eq("id", job.invoice_id)
        .single();

      if (invErr) {
        throw new Error(`Could not read invoice after PDF generation: ${invErr.message}`);
      }

      if (!inv?.pdf_url || String(inv.pdf_url).trim() === "") {
        // If the endpoint returned a URL in its response body, include it to help debugging
        // (We don't assume response format; we just surface it.)
        throw new Error(
          `PDF generated call succeeded but invoices.pdf_url is still NULL/empty for invoice_id=${job.invoice_id}. Endpoint response: ${text.slice(0, 500)}`
        );
      }

      // 3) Mark job done only after verification
      await supabase
        .from("pdf_queue")
        .update({
          status: "done",
          locked_at: null,
          last_error: null,
        })
        .eq("id", job.id);

    } catch (err: any) {
      await supabase
        .from("pdf_queue")
        .update({
          status: job.attempts >= 4 ? "failed" : "pending",
          attempts: job.attempts + 1,
          last_error: err?.message || String(err),
          locked_at: null,
        })
        .eq("id", job.id);
    }
  }

  // Re-invoke self
  await fetch(SELF_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
  });

  return new Response("Batch processed", { status: 200 });
});
