// supabase/functions/generate-club-membership-card/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import { jsPDF } from "npm:jspdf";
import QRCode from "npm:qrcode";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

function bufferToUint8Array(buf) {
  return new Uint8Array(buf);
}

function safeName(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase()
    .trim();
}

// ------------------------------------------------------------
//  PDF GENERATOR (shared for parent + family members)
// ------------------------------------------------------------
async function generateCard(profile, qrData) {
  const width = 55;
  const height = 85;
  const centerX = width / 2;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [width, height],
  });

  // Background
  doc.setFillColor(240, 248, 255);
  doc.rect(0, 0, width, height, "F");

  // Header
  doc.setFillColor(0, 102, 204);
  doc.rect(0, 0, width, 13.5, "F");

  // Logo
  try {
    const img = await fetch(
      "https://jrwsxeiueezuiueglfpv.supabase.co/storage/v1/object/public/assets/aquador.png"
    )
      .then(res => res.blob())
      .then(blob => new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      }));

    doc.addImage(img, "PNG", (width - 12) / 2, 1.5, 12, 12);
  } catch (e) {
    console.warn("Logo load failed:", e);
  }

  // QR
  doc.addImage(qrData, "PNG", (width - 45) / 2, 14.5, 45, 45);

  // Text
  const fullName = profile.full_name || profile.main_full_name || "Membre";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 100, 200);
  doc.text("A'QUA D'OR - Club", centerX, 64, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(fullName, centerX, 70, { align: "center" });

  // Upload
  const pdfBytes = doc.output("arraybuffer");
  const uint8 = bufferToUint8Array(pdfBytes);

  const filename = safeName(fullName) + ".pdf";
  const path = filename;

  const { error: upErr } = await supabase.storage
    .from("Membership_cards")
    .upload(path, uint8, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (upErr) throw upErr;

  const { data: pub } = await supabase.storage
    .from("Membership_cards")
    .getPublicUrl(path);

  return pub.publicUrl;
}

// ------------------------------------------------------------
//  MAIN FUNCTION
// ------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { profile_id } = await req.json();
    if (!profile_id) throw new Error("Missing profile_id");

    // Load MAIN PROFILE
    const { data: profile, error: profErr } = await supabase
      .from("club_profiles")
      .select("*")
      .eq("id", profile_id)
      .single();

    if (profErr || !profile) throw new Error("Profile not found");

    // Load QR
    let qrData;
    if (profile.qr_code_url) {
      const blob = await fetch(profile.qr_code_url).then(r => r.blob());
      qrData = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } else {
      qrData = await QRCode.toDataURL(profile.id, { margin: 1, width: 100 });
    }

    // ------------------------------------------------------------
    // 1️⃣ Generate parent card
    // ------------------------------------------------------------
    const parentCardUrl = await generateCard(profile, qrData);

    await supabase
      .from("club_profiles")
      .update({ membership_card_url: parentCardUrl })
      .eq("id", profile_id);

    // ------------------------------------------------------------
    // 2️⃣ Get family members (correct column: club_profile_id)
    // ------------------------------------------------------------
    const { data: family } = await supabase
      .from("club_profile_families")
      .select("*")
      .eq("club_profile_id", profile_id);

    // ------------------------------------------------------------
    // 3️⃣ Generate cards for 18+ family members
    // ------------------------------------------------------------
    if (family && family.length > 0) {
      for (const member of family) {
        if (!member.birth_date) continue;

        const birth = new Date(member.birth_date);
        const age = new Date().getFullYear() - birth.getFullYear();

        if (age < 18) continue;

        await generateCard(member, qrData);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        membership_card_url: parentCardUrl,
        family_cards: "generated where applicable",
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    console.error("❌ Membership Card Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
