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
  // 🔒 Fetch up to 5 unlocked jobs
  const { data: jobs, error } = await supabase.rpc(
    "fetch_pdf_jobs",
    { p_limit: 5 }
  );

  // 🛑 Stop condition
  if (error || !jobs || jobs.length === 0) {
    return new Response("Queue empty", { status: 200 });
  }

  for (const job of jobs) {
    try {
      const res = await fetch(PDF_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          invoice_id: job.invoice_id,
          source: "monthly", // 🔥 REQUIRED
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      // ✅ Mark job done ONLY after invoice is updated
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
          last_error: err.message,
          locked_at: null,
        })
        .eq("id", job.id);
    }
  }

  // 🔁 RE-INVOKE SELF TO PROCESS NEXT BATCH
  await fetch(SELF_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
  });

  return new Response("Batch processed", { status: 200 });
});
