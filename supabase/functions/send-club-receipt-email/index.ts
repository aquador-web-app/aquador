// supabase/functions/send-club-receipt-email/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Resend } from "npm:resend";
import { createClient } from "npm:@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      full_name,
      email,
      invoice_pdf_url,
      qr_url,
      invoice_id,
      booking_id,
    } = await req.json();

    if (!email) throw new Error("Missing email");
    if (!invoice_pdf_url) throw new Error("Missing invoice_pdf_url");
    if (!qr_url) throw new Error("Missing qr_url");

    // --------------------------------------------------
    // 1️⃣ Resolve booking_id (from invoice if needed)
    // --------------------------------------------------
    let resolvedBookingId = booking_id;

    if (!resolvedBookingId && invoice_id) {
      const { data: inv, error: invErr } = await supabase
        .from("club_booking_invoices")
        .select("booking_id")
        .eq("id", invoice_id)
        .single();

      if (invErr || !inv?.booking_id) {
        throw new Error("Unable to resolve booking_id from invoice_id");
      }

      resolvedBookingId = inv.booking_id;
    }

    if (!resolvedBookingId) {
      throw new Error("Missing booking reference");
    }

// --------------------------------------------------
// 2️⃣ Load signed documents from storage
// --------------------------------------------------
const folder = `club/bookings/${full_name
  ?.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "_")}`;

const { data: files, error: listErr } = await supabase.storage
  .from("signed_docs")
  .list(folder, { limit: 50 });

if (listErr) {
  console.warn("Signed docs list warning:", listErr);
}

const signedDocs =
  files
    ?.filter((f) => f.name.endsWith(".pdf"))
    .map((f) => {
      const { data } = supabase.storage
        .from("signed_docs")
        .getPublicUrl(`${folder}/${f.name}`);

      return {
        name: f.name,
        url: data.publicUrl,
      };
    }) || [];



    // --------------------------------------------------
    // 3️⃣ Build signed documents HTML (✅ MUST BE BEFORE html)
    // --------------------------------------------------
    const signedDocsHtml =
  signedDocs.length > 0
    ? `
      <h3 style="margin-top:30px;">📑 Documents signés</h3>
      <ul style="padding-left:18px;">
        ${signedDocs
          .map(
            (d) =>
              `<li style="margin-bottom:6px;">
                <a href="${d.url}" target="_blank" style="color:#2F80ED;">
                  ${d.name.replace(/_/g, " ").replace(".pdf", "")}
                </a>
              </li>`
          )
          .join("")}
      </ul>
    `
    : "";


    // --------------------------------------------------
    // 4️⃣ Build email HTML
    // --------------------------------------------------
    const displayName = full_name?.trim() || "cher client";

    const subject = "Merci ! Votre paiement a été reçu ✔️";

    const html = `
      <div style="font-family:Arial, sans-serif; padding:20px;">
        <h2>Bonjour ${displayName},</h2>

        <p>
          Nous confirmons que votre paiement a été reçu avec succès pour votre
          réservation au <strong>Club A'QUA D'OR</strong>.
        </p>

        <p style="margin-top:20px;">
          <a href="${invoice_pdf_url}"
             style="background:#2F80ED; color:white; padding:12px 22px; border-radius:8px; text-decoration:none;">
            📄 Voir mon reçu
          </a>
        </p>

        <h3 style="margin-top:30px;">🎟️ QR Code d'accès</h3>
        <p>Ce QR code vous sera demandé à votre arrivée :</p>

        <img src="${qr_url}"
             width="220"
             style="margin-top:10px; border:1px solid #ddd; border-radius:12px;" />

        ${signedDocsHtml}

        <p style="margin-top:40px;">
          Merci pour votre confiance,<br/>
          L’équipe A’QUA D’OR
        </p>
      </div>

      <table style="width:100%; border:none; margin-top:20px;">
        <tr>
          <td style="width:120px; vertical-align:top;">
            <img
              src="https://jrwsxeiueezuiueglfpv.supabase.co/storage/v1/object/public/assets/aquador.png"
              alt="Logo A'QUA D'OR"
              style="width:100px; height:auto;"
            />
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

    // --------------------------------------------------
    // 5️⃣ Send email
    // --------------------------------------------------
    await resend.emails.send({
      from: "AQUA D'OR <contact@clubaquador.com>",
      to: email,
      subject,
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("❌ Receipt email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
