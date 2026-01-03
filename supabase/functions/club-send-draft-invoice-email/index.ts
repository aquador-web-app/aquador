// supabase/functions/club-send-draft-invoice-email/index.ts
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


// --------------------------------------------
// ENV + CLIENTS
// --------------------------------------------
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendKey = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const resend = new Resend(resendKey);

// --------------------------------------------
// MAIN FUNCTION
// --------------------------------------------
serve(async (req) => {
  try {
    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return new Response("Missing invoice_id", { status: 400 });
    }

    console.log("📨 Sending draft email for invoice:", invoice_id);

    // 1) Load invoice
    const { data: invoice, error: invErr } = await supabase
      .from("club_booking_invoices")
      .select("pdf_url, final_amount_cents, booking_id, client_email")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      console.error("❌ Invoice not found:", invErr);
      return new Response("Invoice not found", { status: 404 });
    }

    // 2) Load booking
    const { data: booking, error: bookErr } = await supabase
      .from("venue_bookings")
      .select("full_name, title, date, start_time, end_time, email")
      .eq("id", invoice.booking_id)
      .single();

    if (bookErr || !booking) {
      console.error("❌ Booking not found:", bookErr);
      return new Response("Booking not found", { status: 404 });
    }

    // Build best possible email fallback
const bestEmail =
  invoice.client_email ||
  booking.email ||
  null;

const email = bestEmail;
const full_name = booking.full_name || booking.title || "client";

// If still missing → error out
if (!email) {
  console.error("❌ Missing client email even after fallback");
  return new Response("No client email available", { status: 400 });
}


    // FIXED LOCAL EVENT DATE
    const eventDateLocal = parseLocalYMD(booking.date);

    // Build email HTML
    const html = `
      <div style="font-family: Arial; line-height: 1.6; color: #222;">
        <h2 style="color:#0c7abf;">Votre demande de réservation est enregistrée</h2>
        <p>Bonjour <strong>${full_name}</strong>,</p>

        <p>Votre demande de réservation a bien été reçue et est maintenant en attente d'approbation.</p>

        <p>
          <strong>Événement :</strong> ${booking.title}<br>
          <strong>Date :</strong> ${formatDateFrSafe(parseLocalYMD(booking.date))}<br>
          <strong>Heure :</strong> ${formatTime(booking.start_time)} → ${formatTime(booking.end_time)}
        </p>

        <p>Veuillez trouver ci-dessous la facture provisoire :</p>

        <p style="margin-top: 25px;">
          <a href="${invoice.pdf_url}" target="_blank"
             style="background:#0c7abf; color:white; text-decoration:none; padding:12px 18px; border-radius:6px;">
            📄 Ouvrir la Facture PDF (provisoire)
          </a>
        </p>

        <p style="margin-top: 25px; font-size:13px; color:#777;">
          Ce document est une estimation. Le montant final sera confirmé après validation par l'administration.
        </p>
      </div>
      Cordialement,<br><br>

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

    // Send email
    const result = await resend.emails.send({
      from: "AQUA D'OR <contact@clubaquador.com>",
      to: email,
      subject: "Votre facture provisoire – Réservation reçue",
      html,
    });

    console.log("📧 Draft email sent:", result);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("🔥 Draft email error:", err);
    return new Response("Server error", { status: 500 });
  }
});
