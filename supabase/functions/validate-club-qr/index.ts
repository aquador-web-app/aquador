// supabase/functions/validate-club-qr/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey"
};

async function logScan({
  qr_token,
  booking_id = null,
  full_name = null,
  status,
  reason,
  ip = null
}) {
  const { error } = await supabase.from("club_qr_logs").insert([
    {
      id: crypto.randomUUID(),
      qr_token,
      booking_id,
      full_name,
      ip_address: ip,
      status,
      reason,
      scanned_at: new Date().toISOString()
    }
  ]);

  if (error) {
    console.error("❌ Error logging QR scan:", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { qr_token } = await req.json();
    if (!qr_token) {
      return new Response(
        JSON.stringify({ valid: false, reason: "Token manquant." }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Try to get client IP (best effort, may be null)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // 1️⃣ Fetch QR record
    const { data: rows, error: selErr } = await supabase
      .from("club_qr_validations")
      .select("*")
      .eq("qr_token", qr_token);

    if (selErr || !rows?.length) {
      // Log invalid attempt
      await logScan({
        qr_token,
        status: "invalid",
        reason: "QR code invalide ou inconnu.",
        ip
      });

      return new Response(
        JSON.stringify({
          valid: false,
          reason: "QR code invalide ou inconnu."
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const record = rows[0];

    // 2️⃣ Already used / limit reached?
    if (record.scan_count >= record.scan_limit || record.status === "used") {
      // Optional: fetch booking to get full_name for the log
      let full_name: string | null = null;
      if (record.booking_id) {
        const { data: b } = await supabase
          .from("venue_bookings")
          .select("full_name")
          .eq("id", record.booking_id)
          .maybeSingle();
        full_name = b?.full_name ?? null;
      }

      await logScan({
        qr_token,
        booking_id: record.booking_id,
        full_name,
        status: "used",
        reason: "Ce QR code a déjà été utilisé.",
        ip
      });

      return new Response(
        JSON.stringify({
          valid: false,
          used: true,
          reason: "Ce QR code a déjà été utilisé."
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 3️⃣ Update scan count (TRIGGER will log successful scan)
    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("club_qr_validations")
      .update({
        scan_count: record.scan_count + 1,
        first_scanned_at: record.first_scanned_at ?? now,
        last_scanned_at: now,
        status:
          record.scan_count + 1 >= record.scan_limit ? "used" : "active"
      })
      .eq("id", record.id);

    if (updateErr) throw updateErr;

    // 4️⃣ Fetch booking info for UI
    const { data: booking, error: bookErr } = await supabase
      .from("venue_bookings")
      .select("full_name, title, date, start_time, end_time")
      .eq("id", record.booking_id)
      .single();

    if (bookErr) {
      // QR is valid, but booking info missing — log as special case
      await logScan({
        qr_token,
        booking_id: record.booking_id,
        full_name: null,
        status: "valid-no-booking",
        reason: "Réservation introuvable pour ce QR code.",
        ip
      });

      return new Response(
        JSON.stringify({
          valid: true,
          used: false,
          message: "QR valide, mais réservation introuvable.",
          booking: null
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 5️⃣ SUCCESS (log is handled by trigger)
    return new Response(
      JSON.stringify({
        valid: true,
        used: false,
        message: "QR code validé avec succès.",
        booking
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("❌ Validation error:", err);
    return new Response(
      JSON.stringify({
        valid: false,
        reason: "Erreur interne lors de la validation."
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
