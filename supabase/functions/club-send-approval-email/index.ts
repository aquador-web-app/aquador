// supabase/functions/club-send-approval-email/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import { Resend } from "npm:resend";

// --------------------------------------------
// SAFE LOCAL DATE PARSER (fixes the -1 day bug)
// --------------------------------------------
function parseLocalYMD(ymd) {
  const [y, m, d] = String(ymd).split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)); // LOCAL date, no UTC shift
}

  function formatTime(t) {
  if (!t) return "—";
  return t.replace(/:00$/, ""); // removes last :00
}

// --------------------------------------------
// French date formatter (supports Date object)
// --------------------------------------------
function formatDateFrSafe(input, showTime = false) {
  if (!input) return "—";

  let date;

  if (input instanceof Date) {
    date = input;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-");
    date = new Date(Number(y), Number(m) - 1, Number(d));
  } else {
    date = new Date(input);
  }

 
  const base = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  if (!showTime) {
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  const time = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${base.charAt(0).toUpperCase() + base.slice(1)} à ${time}`;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendKey = Deno.env.get("RESEND_API_KEY")!;

// 🔗 Frontend URL for portal
// 🔗 Detect frontend base URL dynamically
function getFrontendBaseUrl(req: Request) {
  // 1️⃣ Prefer Origin header (best & safest)
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");

  // 2️⃣ Fallback: derive from request URL
  try {
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const resend = new Resend(resendKey);

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { booking_id, invoice_id, email, full_name } = body;

    if (!booking_id || !invoice_id) {
      console.error("Missing parameters in club-send-approval-email:", body);
      return new Response("Missing parameters", { status: 400 });
    }

    // 1) Load invoice
    const { data: invoice, error: invErr } = await supabase
      .from("club_booking_invoices")
      .select("id, pdf_url, final_amount_cents, discount_cents, amount_cents")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      console.error("Invoice not found:", invErr);
      return new Response("Invoice not found", { status: 404 });
    }

    const pdfUrl = invoice.pdf_url || null;
    const finalAmount =
      (invoice.final_amount_cents ?? invoice.amount_cents ?? 0) / 100;

    // 2) Load booking + email info
    const { data: booking, error: bookErr } = await supabase
      .from("venue_bookings")
      .select("full_name, email, title, date, start_time, end_time")
      .eq("id", booking_id)
      .single();

    if (bookErr || !booking) {
      console.error("Booking not found:", bookErr);
      return new Response("Booking not found", { status: 404 });
    }

    const recipientEmail = email || booking.email;
    const displayName = full_name || booking.full_name || "client";

    if (!recipientEmail) {
      console.error("No recipient email for booking:", booking_id);
      return new Response("No recipient email", { status: 400 });
    }

    // 3) Build payment portal URL
    const base = getFrontendBaseUrl(req);
const payUrl = `${base}/club/guest-dashboard?invoice_id=${encodeURIComponent(invoice_id)}`;



    // 4) Build HTML
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
        <h2 style="color:#0c7abf;">Votre réservation au Club A’QUA D’OR est approuvée 🎉</h2>
        <p>Bonjour <strong>${displayName}</strong>,</p>

        <p>Nous avons le plaisir de vous informer que votre réservation a été <strong>approuvée</strong>.</p>

        <p>
          <strong>Événement :</strong> ${booking.title || "—"}<br>
          <strong>Date :</strong> ${formatDateFrSafe(parseLocalYMD(booking.date))}<br>
          <strong>Heure :</strong> ${booking.start_time || "—"} → ${
      booking.end_time || "—"
    }<br>
          <strong>Montant final :</strong> USD ${finalAmount.toFixed(2)}
        </p>

        <p style="margin-top: 20px;">
          Pour régler votre facture de manière sécurisée, cliquez sur le bouton ci-dessous :
        </p>

        <p style="margin: 20px 0;">
          <a href="${payUrl}"
             style="background:#0c7abf; color:white; text-decoration:none; padding:12px 20px; border-radius:6px; font-weight:bold;">
            💳 Payer ma réservation en ligne
          </a>
        </p>

        ${
          pdfUrl
            ? `<p style="margin-top: 10px;">
                 Vous pouvez également consulter votre facture au format PDF en cliquant ici :
                 <a href="${pdfUrl}" target="_blank">📄 Ouvrir la facture PDF</a>
               </p>`
            : ""
        }

        <p style="margin-top: 25px; font-size:13px; color:#777;">
          Merci pour votre confiance. Nous avons hâte de vous accueillir au Club A’QUA D’OR.
        </p>
      </div>
      <table style="width:100%; border:none; margin-top:20px;">
  <tr>
    <td style="width:120px; vertical-align:top;">
      <img src="https://jrwsxeiueezuiueglfpv.supabase.co/storage/v1/object/public/assets/aquador.png" 
           alt="Logo A'QUA D'OR" style="width:100px; height:auto;" />
    </td>
    <td style="padding-left:20px; vertical-align:top; font-size:14px; line-height:2.1;">      
      <b>David E. ADRIEN</b><br>
      Directeur<br>
      Imp Hall, Rue Beauvais, Faustin 1er, Delmas 75<br>
      Cell: +509 38 91 2429
    </td>
  </tr>
</table>
    `;

    // 5) Send email via Resend
    const sendResult = await resend.emails.send({
      from: "AQUA D'OR <contact@clubaquador.com>",
      to: recipientEmail,
      subject: "Votre réservation est approuvée – Paiement en ligne",
      html,
    });

    console.log("club-send-approval-email result:", sendResult);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("club-send-approval-email error:", err);
    return new Response("Server error", { status: 500 });
  }
});
