// supabase/functions/generate-club-qr-code/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import * as QRCode from "npm:qrcode";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey"
};

function safeName(s = "") {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase()
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) throw new Error("Missing invoice_id");

    // === 1️⃣ Fetch invoice + booking ===
    const { data: invoice, error: invErr } = await supabase
      .from("club_booking_invoices")
      .select(`
        id,
        booking_id,
        invoice_no,
        final_amount_cents,
        pdf_url,
        client_email,
        venue_bookings:booking_id (
          full_name,
          title,
          date,
          start_time,
          end_time
        )
      `)
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) throw new Error("Invoice not found");

    const booking = invoice.venue_bookings;

    // === 2️⃣ Prepare QR payload ===

// 2.1 Generate one-time token
const qr_token = crypto.randomUUID();

// 2.2 Save token in DB
await supabase
  .from("club_qr_validations")
  .insert({
    booking_id: invoice.booking_id,  // REQUIRED
    qr_token,
    scan_limit: 1,
    scan_count: 0,
    status: "active"
  });


// 2.3 Build QR payload (still included inside the QR JSON)
const qrPayload = {
  qr_token,                    // 👈 NEW!
  invoice_id: invoice.id,
  invoice_no: invoice.invoice_no,
  full_name: booking.full_name,
  event: booking.title,
  date: booking.date,
  start_time: booking.start_time,
  end_time: booking.end_time
};


    const encoded = JSON.stringify(qrPayload);

    // === 3️⃣ Generate QR image ===
    const qrBuffer = await QRCode.toBuffer(encoded, {
      width: 450,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" }
    });

    // === 4️⃣ Upload to storage ===
    const folder = safeName(booking.full_name || "client_club");
    const pdfName = safeName(invoice.invoice_no || invoice.id);
    const path = `club/${folder}/${pdfName}_qr.png`;

    const { error: uploadErr } = await supabase.storage
      .from("QR_Code")
      .upload(path, qrBuffer, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadErr) throw uploadErr;
    

    // === 5️⃣ Get public URL ===
    const { data: pub } = await supabase.storage
      .from("QR_Code")
      .getPublicUrl(path);

    return new Response(
      JSON.stringify({ success: true, qr_url: pub.publicUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ QR error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
