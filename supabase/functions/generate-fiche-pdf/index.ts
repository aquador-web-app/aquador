// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeFileName } from "../shared/sanitize.ts";

const supabaseUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const LOCAL_PDF_SERVER = "https://puppeteer-server-bxx4.onrender.com/pdf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// === Helpers ===
function sanitizeFileName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w\-./]/g, "");
}

function fmtMonth(val) {
  if (!val) return "";

  const parseMonth = (v) => {
    const s = String(v).trim();
    // Handles ISO formats like "2025-12-01"
    const isoMatch = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const monthIndex = parseInt(isoMatch[2], 10) - 1;
      return new Date(year, monthIndex, 1);
    }
    // Handle text like "Décembre 2025"
    const parts = s.split(/\s+/);
    if (parts.length >= 1) {
      const mo = parts[0];
      const yr = parts[1] ? parseInt(parts[1], 10) : new Date().getFullYear();
      const monthsFr = [
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre"
      ];
      const idx = monthsFr.findIndex((m) => m.toLowerCase() === mo.toLowerCase());
      if (idx !== -1) return new Date(yr, idx, 1);
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };

  const d = parseMonth(val);
  if (!d) return String(val);

  const formatted = d.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  // ✅ Capitalize first letter safely, including accented ones
  return formatted.charAt(0).toLocaleUpperCase("fr-FR") + formatted.slice(1);
}


function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fiche_id } = await req.json();
    if (!fiche_id)
      return new Response(JSON.stringify({ error: "Missing fiche_id" }), {
        status: 400,
        headers: corsHeaders,
      });

    console.log("📘 Generating Fiche Technique for:", fiche_id);

    // === Fetch fiche_technique record ===
    const { data: fiche, error: ficheErr } = await supabase
      .from("fiche_technique")
      .select("*")
      .eq("id", fiche_id)
      .maybeSingle();
    if (ficheErr || !fiche) throw new Error("Fiche technique introuvable");

    // === Fetch student profile ===
    const { data: profile, error: profErr } = await supabase
      .from("profiles_with_unpaid")
      .select("full_name, birth_date")
      .eq("id", fiche.student_id)
      .maybeSingle();
    if (profErr || !profile) throw new Error("Profil élève introuvable");

    // === Compute age ===
    const age =
      fiche.age ||
      (() => {
        const birth = new Date(profile.birth_date);
        const today = new Date();
        let a = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
        return a;
      })();

    // === Fetch latest template ===
    const { data: tmpl, error: tmplErr } = await supabase
      .from("fiche_templates")
      .select("body")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tmplErr || !tmpl) throw new Error("Aucun modèle de fiche trouvé");

    // === Get public URLs for logo & signature ===
    const { data: logoData } = await supabase.storage
      .from("assets")
      .getPublicUrl("aquador.png");
    const { data: sigData } = await supabase.storage
      .from("assets")
      .getPublicUrl("signature.png");
    const LOGO_URL = logoData?.publicUrl || "";
    const SIGN_URL = sigData?.publicUrl || "";

    // === Prepare replacements ===
    const esc = (v) => escapeHtml(String(v ?? ""));
    let html = tmpl.body;

    const replacements = {
      student_name: profile.full_name,
      age,
      month: fmtMonth(fiche.month || new Date()),
      academic_year: fiche.academic_year,
      logo_url: LOGO_URL,
      signature_url: SIGN_URL,
      long_bras_gauche: fiche.long_bras_gauche,
      long_bras_droit: fiche.long_bras_droit,
      long_pied_gauche: fiche.long_pied_gauche,
      long_pied_droit: fiche.long_pied_droit,
      saut_avec: fiche.saut_avec,
      saut_elan_bras_droit: fiche.saut_elan_bras_droit,
      saut_stable_bras_gauche: fiche.saut_stable_bras_gauche,
      saut_stable_bras_droit: fiche.saut_stable_bras_droit,
      largeur_ventre: fiche.largeur_ventre,
      taille: fiche.taille,
      poids_lbs: fiche.poids_lbs,
      saut_stable_deux_bras: fiche.saut_stable_deux_bras,
    };

    for (const [key, value] of Object.entries(replacements)) {
      html = html.replaceAll(`{{${key}}}`, esc(value));
    }

    // Warn if any placeholder left unreplaced
    if (html.includes("{{")) {
      console.warn("⚠️ Unreplaced placeholders:", html.match(/{{.*?}}/g));
    }

    // === Upload HTML ===
    const safeName = sanitizeFileName(profile.full_name);
    const safeMonth = sanitizeFileName(fmtMonth(fiche.month || new Date()));
    const pdfPath = `${safeName}/Fiche_Technique_${safeMonth}.pdf`;


    // === Generate PDF via local server ===
    const pdfResponse = await fetch(LOCAL_PDF_SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        options: {
          format: "A4",
          printBackground: true,
          margin: { top: "1in", right: 0, bottom: 0, left: 0 }
        }
      }),
    });

    if (!pdfResponse.ok) throw new Error(await pdfResponse.text());
    const reader = pdfResponse.body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const pdfBytes = new Uint8Array(chunks.flatMap((x) => Array.from(x)));

    await supabase.storage.from("Fiche").upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

     const { data: pdfUrlData } = await supabase.storage
      .from("Fiche")
      .getPublicUrl(pdfPath);
    const pdfUrl = pdfUrlData?.publicUrl;

    // === Save PDF URL in database ===
    await supabase
      .from("fiche_technique")
      .update({ pdf_url: pdfUrl })
      .eq("id", fiche_id);

    console.log("✅ Fiche Technique PDF generated:", pdfUrl);
    return new Response(JSON.stringify({ success: true, pdf_url: pdfUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("🔥 Fiche Technique PDF generation failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
