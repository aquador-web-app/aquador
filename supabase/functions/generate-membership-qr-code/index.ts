// supabase/functions/generate-membership-qr-code/index.ts
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
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

function safeName(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase()
    .trim();
}

// 🔥 PLAN → WEEKLY SCAN LIMIT
function planScanLimit(plan_code = "") {
  const p = (plan_code || "").toLowerCase();
  if (p === "bronze") return 2;
  if (p === "silver") return 3;
  if (p === "gold") return 4;
  if (p === "platinum") return 6;
  return 2;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { profile_id } = await req.json();
    if (!profile_id) throw new Error("Missing profile_id");

    // 1️⃣ Get profile data
    const { data: profile, error: profileErr } = await supabase
      .from("club_profiles")
      .select("id, main_full_name, plan_code")
      .eq("id", profile_id)
      .single();

    if (profileErr || !profile) throw new Error("Club profile not found");

    // 2️⃣ Get existing token (if any)
    const { data: tokenRow } = await supabase
      .from("club_membership_qr_tokens")
      .select("qr_token")
      .eq("profile_id", profile.id)
      .single();

    const existingToken = tokenRow?.qr_token || null;

    // 3️⃣ Determine token
    const token = existingToken || crypto.randomUUID();

    // 4️⃣ Determine scan limit
    const scanLimit = planScanLimit(profile.plan_code);

    // 5️⃣ Build QR payload
    const payload = {
      qr_token: token,
      family_id: profile.id,
      full_name: profile.main_full_name,
      plan: profile.plan_code,
      scan_limit: scanLimit,
    };

    const encoded = JSON.stringify(payload);

    // 6️⃣ Generate QR code image
    const qrBuffer = await QRCode.toBuffer(encoded, {
      width: 450,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    // 7️⃣ Upload to storage
    const folder = safeName(profile.main_full_name);
    const filename = `member_${profile.id}_qr.png`;
    const path = `club_members/${folder}/${filename}`;

    const { error: uploadErr } = await supabase.storage
      .from("QR_Code")
      .upload(path, qrBuffer, { contentType: "image/png", upsert: true });

    if (uploadErr) throw uploadErr;

    const { data: pub } = await supabase.storage
      .from("QR_Code")
      .getPublicUrl(path);

    // 8️⃣ Update token table
    await supabase
      .from("club_membership_qr_tokens")
      .upsert({
        profile_id: profile.id,
        qr_token: token,
        weekly_scan_limit: scanLimit,
        weekly_scan_count: 0,
        status: "active",
      });

    // 9️⃣ Save QR URL to club_profiles
    await supabase
      .from("club_profiles")
      .update({ qr_url: pub.publicUrl })
      .eq("id", profile.id);

    return new Response(
      JSON.stringify({
        success: true,
        qr_url: pub.publicUrl,
        qr_token: token,
        scan_limit: scanLimit,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("QR generation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
