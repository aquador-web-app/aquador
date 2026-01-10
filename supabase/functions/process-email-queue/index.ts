// supabase/functions/process-email-queue/index.ts
// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEND_EMAIL_ENDPOINT =
  "https://jrwsxeiueezuiueglfpv.functions.supabase.co/send-email";

const SELF_ENDPOINT =
  "https://jrwsxeiueezuiueglfpv.functions.supabase.co/process-email-queue";

serve(async () => {
  // ⏳ Fetch emails that waited ≥ 2 minutes
  const { data: emails, error } = await supabase.rpc(
    "fetch_emails_ready_to_send",
    { p_limit: 5 }
  );

  if (error || !emails || emails.length === 0) {
    return new Response("No emails ready", { status: 200 });
  }

  for (const e of emails) {
    try {
      const res = await fetch(SEND_EMAIL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          to: e.email,
          subject: e.subject,
          body: e.body,
          variables: e.variables,
          attachment_url: e.attachment_url,
          invoice_id: e.invoice_id,
          kind: e.kind,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      // ✅ Mark as sent
      await supabase
        .from("email_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", e.id);

    } catch (err) {
      // ❗ Leave as pending (will retry next run)
      console.error("Email send failed:", err);
    }
  }

  // 🔁 Continue processing
  await fetch(SELF_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
  });

  return new Response("Email batch processed", { status: 200 });
});
