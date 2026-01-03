// supabase/functions/generate-qr-codes/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import * as QRCode from "npm:qrcode";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 🧹 Helper to create safe folder names
function safeName(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-zA-Z0-9_-]/g, "_") // only keep safe chars
    .replace(/_+/g, "_")
    .trim()
    .toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    console.log("🚀 generate-qr-codes started (folder-per-user)");

    // 1️⃣ Get all active enrollments
    const { data: enrolled, error: enrollErr } = await supabaseAdmin
      .from("enrollments")
      .select("profile_id")
      .eq("status", "active");

    if (enrollErr) throw enrollErr;
    if (!enrolled?.length)
      return new Response("No enrolled users found.", {
        status: 200,
        headers: corsHeaders,
      });

    const enrolledIds = [...new Set(enrolled.map((e) => e.profile_id))];

    // 2️⃣ Get profiles without QR
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, qr_code_url")
      .in("id", enrolledIds)
      .is("qr_code_url", null);

    if (error) throw error;
    if (!profiles.length)
      return new Response("✅ All enrolled users already have QR codes.", {
        status: 200,
        headers: corsHeaders,
      });

    console.log(`📦 Found ${profiles.length} profiles to process.`);

    // 3️⃣ Loop through each user
    for (const p of profiles) {
      try {
        const userId = p.id;
        const folder = safeName(p.full_name || "user");
        const fileName = `aquador_qr_${userId}.png`;
        const path = `${folder}/${fileName}`;
        const qrData = userId; // 👈 value encoded in QR

        // Generate QR code PNG buffer
        const qrBuffer = await QRCode.toBuffer(qrData, {
          width: 400,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        });

        // Upload to bucket inside the user folder
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("QR_Code")
          .upload(path, qrBuffer, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadErr) throw uploadErr;

        // Get the public URL
        const {
          data: { publicUrl },
        } = supabaseAdmin.storage.from("QR_Code").getPublicUrl(path);

        // Save it in the profile
        const { error: updateErr } = await supabaseAdmin
          .from("profiles")
          .update({ qr_code_url: publicUrl })
          .eq("id", userId);

        if (updateErr) throw updateErr;

        console.log(`✅ QR saved for ${p.full_name} → ${path}`);
      } catch (innerErr) {
        console.error(`❌ Failed for ${p.full_name}:`, innerErr);
      }
    }

    return new Response("✅ All new enrolled users got their QR codes.", {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("❌ Error generating QR codes:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
