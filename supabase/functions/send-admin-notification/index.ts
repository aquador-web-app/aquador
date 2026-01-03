// supabase/functions/send-admin-notification/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

const ADMIN_EMAILS = [
  "deadrien@clubaquador.com",
  "contact@clubaquador.com",
];

serve(async (req) => {
  try {
    const payload = await req.json();

    // ==================================================
    // 💳 PAYMENT SUBMITTED (UNCHANGED BEHAVIOR)
    // ==================================================
    if (payload.payment_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: payment, error } = await supabase
        .from("club_payments")
        .select("id, amount, method, invoice_id")
        .eq("id", payload.payment_id)
        .single();

      if (error) throw error;

      const actionUrl =
        `https://clubaquador.com/admin/club/invoices/${payment.invoice_id}`;

      await resend.emails.send({
        from: "A’QUA D’OR <contact@clubaquador.com>",
        to: ADMIN_EMAILS,
        subject: "💳 Paiement soumis – validation requise",
        html: `
<div style="font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;padding:24px">
  <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:10px;overflow:hidden">

    <div style="background:#0c7abf;padding:20px">
      <h1 style="margin:0;color:#ffffff;font-size:20px">
        Paiement soumis
      </h1>
    </div>

    <div style="padding:24px;color:#222">
      <p style="font-size:15px">
        Un nouveau paiement a été soumis et nécessite une validation.
      </p>

      <table style="width:100%;font-size:14px;margin:20px 0">
        <tr>
          <td style="padding:6px 0;color:#555">Montant</td>
          <td style="padding:6px 0"><strong>USD ${payment.amount}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#555">Méthode</td>
          <td style="padding:6px 0">${payment.method}</td>
        </tr>
      </table>

      <div style="text-align:center;margin:28px 0">
        <a href="${actionUrl}"
           style="background:#0c7abf;color:#ffffff;
                  padding:14px 24px;
                  border-radius:6px;
                  text-decoration:none;
                  font-weight:bold">
          Ouvrir la facture
        </a>
      </div>
    </div>

    <div style="background:#f1f5f9;padding:14px;text-align:center;
                font-size:12px;color:#777">
      A’QUA D’OR — Notification automatique
    </div>

  </div>
</div>
        `,
      });

      console.log("✅ Admin notified for payment", payload.payment_id);
      return new Response(JSON.stringify({ ok: true }));
    }

    // ==================================================
    // 📅 BOOKING REQUEST (UNCHANGED CONTRACT)
    // ==================================================
    if (payload.type === "booking") {
      await resend.emails.send({
        from: "A’QUA D’OR <contact@clubaquador.com>",
        to: ADMIN_EMAILS,
        subject: "🆕 Nouvelle demande de réservation",
        html: `
<div style="font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;padding:24px">
  <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:10px;overflow:hidden">

    <div style="background:linear-gradient(90deg,#0c7abf,#f59e0b);padding:20px">
    </div>

    <div style="padding:24px;color:#222">
      <h2 style="margin-top:0;font-size:18px">
        ${payload.title}
      </h2>

      <p style="font-size:15px">
        ${payload.message}
      </p>

      <div style="text-align:center;margin:28px 0">
        <a href="${payload.action_url}"
           style="background:#0c7abf;color:#ffffff;
                  padding:14px 24px;
                  border-radius:6px;
                  text-decoration:none;
                  font-weight:bold">
          ${payload.action_label || "Voir la réservation"}
        </a>
      </div>

      <p style="font-size:13px;color:#666">
        Cette demande est en attente de validation administrative.
      </p>
    </div>

    <div style="background:#f1f5f9;padding:14px;text-align:center;
                font-size:12px;color:#777">
      A’QUA D’OR — Notification automatique
    </div>

  </div>
</div>
        `,
      });

      console.log("✅ Admin notified for booking request");
      return new Response(JSON.stringify({ ok: true }));
    }

    // ==================================================
    // ❌ INVALID PAYLOAD
    // ==================================================
    console.error("❌ Invalid notification payload", payload);
    return new Response("Invalid payload", { status: 400 });

  } catch (err) {
    console.error("❌ send-admin-notification error:", err);
    return new Response("Server error", { status: 500 });
  }
});
