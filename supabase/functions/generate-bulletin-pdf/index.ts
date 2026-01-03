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

    // Handle ISO format like "2025-12-01"
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

  // ✅ Capitalize first letter, including accented ones
  return formatted.charAt(0).toLocaleUpperCase("fr-FR") + formatted.slice(1);
}


function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function average(values) {
  const map = { E: 6, TB: 5, B: 4, AB: 3, A: 2, P: 1 };
  const nums = values.map((v) => map[v?.toUpperCase()] || null).filter(Boolean);
  if (!nums.length) return "";
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const rev = Object.entries(map).reduce(
    (best, [k, v]) =>
      Math.abs(v - avg) < Math.abs(best.val - avg) ? { key: k, val: v } : best,
    { key: "P", val: 1 }
  );
  return rev.key;
}

function rowTR(date, cells) {
  const td = (v) => `<td>${escapeHtml(v ?? "")}</td>`;
  const dateStr = new Date(date)
  .toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
  .replace(/^\d+\s(\w)/, (m, c) => m.replace(c, c.toUpperCase()));
  return `<tr><td>${dateStr}</td>${cells.map(td).join("")}</tr>`;
}


function buildSection(rows, keys) {
  const rowsHtml = rows.map((r) => rowTR(r.date, keys.map((k) => r[k]))).join("");
  const colAvg = keys.map((k) => average(rows.map((r) => r[k])));
  const secAvg = average(colAvg);
  const avgRows =
    `<tr class="total-row"><td><strong>Moyenne par Critère</strong></td>${colAvg
      .map((a) => `<td>${a}</td>`)
      .join("")}</tr>` +
    `<tr class="total-row"><td><strong>Moyenne Section</strong></td><td colspan='${keys.length}'>${secAvg}</td></tr>`;
  return { rowsHtml, avgRows, secAvg };
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { bulletin_id } = await req.json();
    if (!bulletin_id)
      return new Response(JSON.stringify({ error: "Missing bulletin_id" }), {
        status: 400,
        headers: corsHeaders,
      });

    console.log("📘 Generating Bulletin for:", bulletin_id);

    // === Summary ===
    const { data: summary, error: sumErr } = await supabase
      .from("bulletin_monthly_summary")
      .select("*")
      .eq("id", bulletin_id)
      .maybeSingle();
    if (sumErr || !summary) throw new Error("Bulletin summary not found");

    // === Template ===
    const { data: tmpl, error: tmplErr } = await supabase
      .from("bulletin_templates")
      .select("body")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tmplErr || !tmpl) throw new Error("No bulletin template found");

    // === Assets ===
    const { data: logoData } = await supabase.storage
      .from("assets")
      .getPublicUrl("aquador.png");
    const { data: sigData } = await supabase.storage
      .from("assets")
      .getPublicUrl("signature.png");
    const LOGO_URL = logoData?.publicUrl || "";
    const SIGN_URL = sigData?.publicUrl || "";

    // === Date range ===
    const baseDate = new Date(summary.month);
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1)
      .toISOString()
      .slice(0, 10);

    // === Attendance ===
    const { data: attendanceRows } = await supabase
      .from("attendance")
      .select("status")
      .eq("student_id", summary.student_id)
      .gte("attended_on", startDate)
      .lt("attended_on", endDate);
    const counts = { presence: 0, absence: 0, retard: 0 };
    for (const r of attendanceRows || []) {
      if (r.status === "present") counts.presence++;
      else if (r.status === "absent") counts.absence++;
      else if (r.status === "late") counts.retard++;
    }

    // === Weekly Sessions ===
    const { data: weekly } = await supabase
      .from("bulletin_sessions")
      .select("*")
      .eq("student_id", summary.student_id)
      .gte("date", startDate)
      .lt("date", endDate)
      .order("date", { ascending: true });

    const att = buildSection(weekly || [], [
      "esprit_equipe",
      "performance",
      "estime_de_soi",
      "perseverance",
      "discipline",
    ]);
    const beh = buildSection(weekly || [], ["attentif", "maitrise", "reaction"]);
    const tech = buildSection(weekly || [], [
      "respiration",
      "flottage",
      "battement",
      "posture",
      "devoirs",
    ]);
    const gen = average([att.secAvg, beh.secAvg, tech.secAvg]);

    const gradeColors = {
      E: "#00b050",
      TB: "#92d050",
      B: "#ffff00",
      AB: "#ffc000",
      A: "#ff8c00",
      P: "#ff0000",
    };
    const color = gradeColors[gen] || "#ffffff";

    const weekdayLabel =
      weekly?.length > 0
        ? new Date(weekly[0].date)
            .toLocaleDateString("fr-FR", { weekday: "long" })
            .replace(/^\w/, (c) => c.toUpperCase())
        : "";

    // === Compile ===
    let html = tmpl.body
      .replaceAll("{{student_name}}", summary.student_name || "—")
      .replaceAll("{{month}}", fmtMonth(summary.month))
      .replaceAll("{{academic_year}}", summary.academic_year || "—")
      .replaceAll("{{presence_count}}", counts.presence)
      .replaceAll("{{absence_count}}", counts.absence)
      .replaceAll("{{retard_count}}", counts.retard)
      .replaceAll("{{logo_url}}", LOGO_URL)
      .replaceAll("{{signature_url}}", SIGN_URL)
      .replaceAll("{{weekday_label}}", weekdayLabel)
      .replaceAll(
        "{{weekly_attitude_rows}}",
        `<tbody>${att.rowsHtml}${att.avgRows}</tbody>`
      )
      .replaceAll(
        "{{weekly_behavior_rows}}",
        `<tbody>${beh.rowsHtml}${beh.avgRows}</tbody>`
      )
      .replaceAll(
        "{{weekly_technical_rows}}",
        `<tbody>${tech.rowsHtml}${tech.avgRows}</tbody>`
      )
      .replaceAll(
        "{{general_appreciation_row}}",
        `
        <table class="appreciation-table">
          <tr>
            <td class="label">Appréciation Générale</td>
            <td class="grade" style="background:${color};color:#000;font-weight:600;">
              ${gen}
            </td>
          </tr>
        </table>`
      );

    const safeName = sanitizeFileName(summary.student_name);
    const safeMonth = sanitizeFileName(fmtMonth(summary.month));
    const pdfPath = `${safeName}/Bulletin - ${safeMonth}.pdf`;

    const pdfResponse = await fetch(LOCAL_PDF_SERVER, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    html,  // 🔥 inline HTML
    options: {
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  }),
});

    const reader = pdfResponse.body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const pdfBytes = new Uint8Array(chunks.flatMap((x) => Array.from(x)));

    await supabase.storage.from("Bulletin").upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    

    const { data: pdfUrlData } = await supabase.storage
      .from("Bulletin")
      .getPublicUrl(pdfPath);
    const pdfUrl = pdfUrlData?.publicUrl;
    await supabase
      .from("bulletin_monthly_summary")
      .update({ pdf_url: pdfUrl })
      .eq("id", bulletin_id);

    console.log("✅ Bulletin PDF generated and HTML cleaned:", pdfUrl);
    return new Response(JSON.stringify({ success: true, pdf_url: pdfUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("🔥 Bulletin PDF generation failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
