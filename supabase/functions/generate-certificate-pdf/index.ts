// supabase/functions/generate-certificate-pdf/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LOCAL_PDF_SERVER = "https://puppeteer-server-bxx4.onrender.com/pdf";

const supabaseUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl!, supabaseKey!, {
  global: {
    fetch: (url, opts: any = {}) => fetch(url, { ...opts, cache: "no-store" }),
  },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function monthFolderLabelHAITI(d: any) {
  try {
    const dt = new Date(
      new Date(d).toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
    );

    // ex: "mars_2026" (in French, then sanitized)
    const label = dt.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return sanitizeFileNameLocal(label).toLowerCase(); // "mars_2026"
  } catch {
    return "unknown_month";
  }
}

async function urlToDataUri(url: string, mime = "image/png") {
  if (!url) return "";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    console.error("Asset fetch failed:", url, res.status);
    return "";
  }
  const buf = new Uint8Array(await res.arrayBuffer());

  // base64 encode in Deno
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  const b64 = btoa(binary);

  return `data:${mime};base64,${b64}`;
}

async function fetchPdfBufferWithRetry(compiledHtml: string, maxAttempts = 5) {
  const options = {
    format: "A4",
    landscape: true,            // ✅ ADD THIS
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(LOCAL_PDF_SERVER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: compiledHtml, options }),
      });

      if (res.status === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }

      if (!res.ok) throw new Error(await res.text());

      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      await sleep(attempt * 1000);
    }
  }

  throw lastError || new Error("PDF generation failed");
}

function sanitizeFileNameLocal(str: string) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w\-./]/g, "")
    .slice(0, 120);
}

function replaceAllTokens(html: string, replacements: Record<string, any>) {
  let out = String(html || "");
  for (const [rawKey, val] of Object.entries(replacements || {})) {
    const raw = String(rawKey);
    const inner = raw.replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
    const innerEsc = inner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\{\\{\\s*${innerEsc}\\s*\\}\\}`, "gi");
    out = out.replace(re, String(val ?? ""));
  }
  return out;
}

function wrapPdf(inner: string) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">

  <style>
    @page { size: A4 landscape; margin: 0; }
    html, body { margin:0; padding:0; background:#fff; }

    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    .aq-cert{
      width:1123px !important;
      height:794px !important;
      max-width:none !important;
      margin:0 !important;
      overflow:hidden !important;
    }

    /* ✅ PDF: make sure underline is a block element */
    .aq-cert .underline{ display:block !important; }
    /* ✅ PDF: bleed ribbon images slightly to avoid 1px seams */
.aq-cert .ribbon-header,
.aq-cert .ribbon-footer{
  inset: -3px !important;
}

.aq-cert .ribbon-img{
  width: calc(100% + 6px) !important;
  height: calc(100% + 6px) !important;
  transform: translate(-3px, -3px) !important;
  object-fit: cover !important;
  display:block !important;
}
  </style>
</head>
<body>
  ${inner}

  <script>
    (function(){
      function fitUnderline(){
        const cert = document.querySelector('.aq-cert');
        if(!cert) return;

        const name = cert.querySelector('[data-fit-name]');
        const underline = cert.querySelector('[data-fit-underline]');
        const content = cert.querySelector('.content');

        if(!name || !underline) return;

        // measure visible name width
        const nameW = name.getBoundingClientRect().width || name.scrollWidth || 260;

        // clamp within content width
        const contentW = (content ? content.getBoundingClientRect().width : 900) || 900;
        const minLine = 180;
        const maxLine = contentW * 0.92;

        const w = Math.max(minLine, Math.min(maxLine, nameW));
        underline.style.width = Math.round(w) + 'px';
      }

      // run multiple passes (fonts)
      window.addEventListener('load', function(){
        fitUnderline();
        setTimeout(fitUnderline, 50);
        setTimeout(fitUnderline, 200);
        setTimeout(fitUnderline, 600);
      });

      fitUnderline();
      setTimeout(fitUnderline, 50);
      setTimeout(fitUnderline, 200);
      setTimeout(fitUnderline, 600);
    })();
  </script>
</body>
</html>`;
}

function formatDateFrLongHAITI(d: any) {
  try {
    if (!d) return "—";
    const dt = new Date(
      new Date(d).toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
    );
    return dt.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "2-digit" });
  } catch {
    return "—";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: any = {};
    try {
      const raw = await req.text();
      if (raw && raw.trim().length > 0) body = JSON.parse(raw);
    } catch (_) {}

    const profile_id = body?.profile_id || null;
    const template_id = body?.template_id || null;
    const hasCategoryKey = Object.prototype.hasOwnProperty.call(body || {}, "category_id");

// normalize: "", "null", undefined => null
const category_id_raw = body?.category_id;
const category_id =
  category_id_raw && String(category_id_raw).trim() && String(category_id_raw).toLowerCase() !== "null"
    ? String(category_id_raw)
    : null;

    // Optional overrides (you can later make these come from DB)
    const level_name = body?.level_name || "Débutant";
    const program_name = body?.program_name || "Programme Académique A’QUA D’OR";
    const school_year_start = body?.school_year_start || "01 septembre 2025";
    const school_year_end = body?.school_year_end || "31 août 2026";

    if (!profile_id) {
      return new Response(JSON.stringify({ error: "Missing profile_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (!template_id) {
      return new Response(JSON.stringify({ error: "Missing template_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 1) Load template
    const { data: tpl, error: tplErr } = await supabase
      .from("student_certificate_templates")
      .select("id, html_template, title, version, category_id")
      .eq("id", template_id)
      .maybeSingle();
    if (tplErr || !tpl) throw new Error("Template not found");

    // 2) Load student
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name, birth_date")
      .eq("id", profile_id)
      .maybeSingle();
    if (profErr || !prof) throw new Error("Profile not found");

    const studentFullName =
      (prof.full_name || `${prof.first_name || ""} ${prof.last_name || ""}`.trim() || "—").trim();

    const studentDob = prof.birth_date ? formatDateFrLongHAITI(prof.birth_date) : "—";

    // 3) Load category (use request category_id else template scope)
    const effective_category_id = hasCategoryKey ? category_id : (tpl.category_id || null);

    let achTitle = "Réussite / Accomplissement";
    let achText =
      "Ce certificat est délivré pour reconnaître son engagement, sa discipline et ses progrès techniques.";

    if (effective_category_id) {
      const { data: cat } = await supabase
        .from("student_certificate_categories")
        .select("id, name, title, body_text")
        .eq("id", effective_category_id)
        .maybeSingle();

      if (cat) {
        achTitle = (cat.title || cat.name || achTitle).trim();
        achText = (cat.body_text || achText).trim();
      }
    }

    const issued_on = formatDateFrLongHAITI(new Date());

    const { data: headerData } = await supabase.storage
  .from("assets")
  .getPublicUrl("3.png");

const { data: footerData } = await supabase.storage
  .from("assets")
  .getPublicUrl("4.png");

const { data: medalData } = await supabase.storage
  .from("assets")
  .getPublicUrl("medal.png");

  const headerUrl = headerData?.publicUrl || "";
const footerUrl = footerData?.publicUrl || "";
const medalUrl  = medalData?.publicUrl  || "";

// ✅ Inline them so Puppeteer doesn't need network access
const headerInline = await urlToDataUri(headerUrl);
const footerInline = await urlToDataUri(footerUrl);
const medalInline  = await urlToDataUri(medalUrl);

    // 4) Compile HTML
    const replacements: Record<string, any> = {
      "{{STUDENT_FULL_NAME}}": studentFullName,
      "{{DATE_OF_BIRTH}}": studentDob,

      "{{LEVEL_NAME}}": level_name,
      "{{PROGRAM_NAME}}": program_name,
      "{{SCHOOL_YEAR_START}}": school_year_start,
      "{{SCHOOL_YEAR_END}}": school_year_end,
      "{{DATE_ISSUED}}": issued_on,
      "{{INSTRUCTOR_NAME}}": body?.instructor_name || "Coach A’QUA D’OR",

      "{{ACHIEVEMENT_TITLE}}": achTitle,
      "{{ACHIEVEMENT_TEXT}}": achText,
    };

    // Assets from Storage (public bucket "assets" assumed)
    const { data: logoData } = await supabase.storage.from("assets").getPublicUrl("aquador.png");
    const { data: sigAdminData } = await supabase.storage
      .from("assets")
      .getPublicUrl("signature.png");
    const { data: sigInstrData } = await supabase.storage
      .from("assets")
      .getPublicUrl("signature-instructor.png");

    replacements["{{logo_url}}"] = logoData?.publicUrl || "";
    replacements["{{signature_admin_url}}"] = sigAdminData?.publicUrl || "";
    replacements["{{signature_instructor_url}}"] = sigInstrData?.publicUrl || "";
    replacements["{{ribbon_header_url}}"] = headerInline || headerUrl || "";
    replacements["{{ribbon_footer_url}}"] = footerInline || footerUrl || "";
    replacements["{{medal_url}}"]         = medalInline  || medalUrl  || "";


    let compiled = replaceAllTokens(String(tpl.html_template || ""), replacements);
    compiled = wrapPdf(compiled);

    if (!compiled || compiled.trim().length < 50) throw new Error("Empty certificate HTML");



    // 5) Render PDF
    await sleep(900); // small throttle like invoice
    const pdfBuffer = await fetchPdfBufferWithRetry(compiled);

    // 6) Upload PDF
    const safeStudent = sanitizeFileNameLocal(studentFullName || "student");
const safeMonth = monthFolderLabelHAITI(new Date()); // ex: "mars_2026"

const folder = `${safeStudent}-${safeMonth}`;         // ex: "Andy_Charles_Olivier_Joseph-mars_2026"
const fileName = `certificat_${safeStudent}_${safeMonth}_${Date.now()}.pdf`;
const object_path = `${folder}/${fileName}`;

    const { error: upErr } = await supabase.storage
      .from("certificates")
      .upload(object_path, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: urlData } = await supabase.storage.from("certificates").getPublicUrl(object_path);
    const publicUrl = urlData?.publicUrl || null;

    // 7) Write DB: issued + achievements
    const { data: issued, error: issuedErr } = await supabase
      .from("student_certificates_issued")
      .insert([
        {
          profile_id,
          template_id,
          category_id: effective_category_id,

          bucket: "certificates",
          object_path,
          file_name: fileName,

          level_name,
          program_name,
          school_year_start,
          school_year_end,
          issued_on,

          payload: {
            student_full_name: studentFullName,
            date_of_birth: studentDob,
            achievement_title: achTitle,
            achievement_text: achText,
            public_url: publicUrl,
          },
        },
      ])
      .select("id")
      .single();
    if (issuedErr) throw issuedErr;

    const { error: achErr } = await supabase.from("profile_achievements").insert([
      {
        profile_id,
        kind: "certificate",
        title: achTitle || "Certificat",
        description: achText || null,
        ref_table: "student_certificates_issued",
        ref_id: issued.id,
        bucket: "certificates",
        object_path,
        file_name: fileName,
      },
    ]);
    if (achErr) throw achErr;

    return new Response(
      JSON.stringify({
        success: true,
        issued_id: issued.id,
        bucket: "certificates",
        object_path,
        file_name: fileName,
        public_url: publicUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: any) {
    console.error("🔥 Certificate PDF generation failed:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});