  // src/pages/admin/AdminStudentCertificates.jsx
  // @ts-nocheck
  import { useEffect, useMemo, useState } from "react";
  import { supabase } from "../../lib/supabaseClient";

  function formatDateTimeFrSafe(d) {
    try {
      const dt = d instanceof Date ? d : new Date(d);
      return dt.toLocaleString("fr-FR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(d || "");
    }
  }

  function nowFrLong() {
    try {
      return new Date().toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function wrapPreview(inner) {
  const baseHref =
    typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}/`
      : "/";

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <base href="${baseHref}" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap" rel="stylesheet">

  <style>
    html, body{
      height:100%;
      margin:0;
      padding:0;
      background:#fff;
      overflow:hidden;
    }

    .preview-root{
      position:fixed;
      inset:0;
      background:#fff;
      overflow:hidden;
    }

    /* ✅ We transform THIS wrapper (translate in px + scale) */
    #scaleWrap{
      position:absolute;
      left:0;
      top:0;
      transform-origin: top left;
      will-change: transform;
    }

    /* ✅ Force a real measurable size (no width:100% shrink-to-fit weirdness) */
    .aq-cert{
      width:1123px !important;
      max-width:none !important;
      container-type: inline-size; /* ✅ makes cqi work based on the cert box width */
    }
          /* ✅ Student name styling + no-wrap */
    .student-name-line{
      width: 900px;              /* adjust if you want wider/narrower */
      margin: 12px auto 18px auto;
      text-align: center;
    }

    .student-name{
      font-family: "Alex Brush", cursive;
      font-weight: 400;
      font-size: 72px;           /* base size */
      line-height: 1.05;
      white-space: nowrap;       /* ✅ NEVER WRAP */
      display: inline-block;     /* needed for measurement */
      max-width: 100%;
      overflow: hidden;
      text-overflow: clip;
      letter-spacing: 0.2px;
    }
  </style>
</head>
<body>
  <div class="preview-root">
    <div id="scaleWrap">
      ${inner || `<div style="color:#666;font-family:system-ui;"><i>(No HTML)</i></div>`}
    </div>
  </div>

  <script>
    (function(){
          function fitNames(){
  const nodes = document.querySelectorAll("[data-fit-name]");

  nodes.forEach((el) => {
    const cert = el.closest(".aq-cert");
    const content = cert ? cert.querySelector(".content") : null;

    // ✅ underline: grab the one right after the name if present
    const underline =
      el.nextElementSibling?.matches("[data-fit-underline]")
        ? el.nextElementSibling
        : (cert ? cert.querySelector("[data-fit-underline]") : null);

    // parent width target
    const parent = el.parentElement;
    const maxW = parent?.clientWidth || (content?.clientWidth ? content.clientWidth * 0.86 : 900);

    // reset
    el.style.transform = "none";
    el.style.whiteSpace = "nowrap";
    el.style.display = "inline-block";

    // base font size from computed style
    const cs = getComputedStyle(el);
    let size = parseFloat(cs.fontSize) || 78;
    const min = 46;

    // shrink font-size gently until it fits
    let guard = 0;
    while (el.scrollWidth > maxW && size > min && guard < 140) {
      size -= 1;
      el.style.fontSize = size + "px";
      guard++;
    }

    // last resort: tiny horizontal squeeze
    if (el.scrollWidth > maxW) {
      const scale = Math.max(0.90, maxW / el.scrollWidth);
      el.style.transformOrigin = "center";
      el.style.transform = "scaleX(" + scale.toFixed(3) + ")";
    }

    // ✅ NOW FIT UNDERLINE TO *VISIBLE* NAME WIDTH
    // ✅ NOW FIT UNDERLINE TO *TEXT* WIDTH (not stretched box)
if (underline) {
  // content width (unsclaed)
  const contentW = content?.clientWidth || maxW;

  // ✅ measure the TRUE text width (before scale)
  const baseTextW = el.scrollWidth;

  // ✅ include scaleX if applied
  const tr = el.style.transform || "";
  const m = tr.match(/scaleX\(([\d.]+)\)/i);
  const sx = m ? parseFloat(m[1]) : 1;

  // ✅ visible name width (after scaleX)
  const visibleNameW = baseTextW * sx;

  // ✅ allow underline to go almost full content width
  const minLine = 180;
  const maxLine = contentW * 0.92;

  const w = Math.max(minLine, Math.min(maxLine, visibleNameW));
  underline.style.width = Math.round(w) + "px";
}
  });
}
      function fit(){
  const wrap = document.getElementById('scaleWrap');
  const cert = document.querySelector('.aq-cert');
  if(!wrap || !cert) return;

  // ✅ reset to measure at true size (UNSCALED)
  wrap.style.transform = 'translate(0px,0px) scale(1)';

  // ✅ IMPORTANT: fit names/underline BEFORE scaling
  fitNames();

  // ✅ now measure cert at 1:1
  const rect = cert.getBoundingClientRect();
  const w = rect.width || 1123;
  const h = rect.height || 794;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // fit BOTH width & height
  const s = Math.min(vw / w, vh / h);

  // exact centered translation in px (for the scaled size)
  const tx = (vw - (w * s)) / 2;
  const ty = (vh - (h * s)) / 2;

  // ✅ now scale/center
  wrap.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
}

      // run on resize + after assets load
      window.addEventListener('resize', fit);
      window.addEventListener('load', fit);

      // multiple passes (fonts/images)
      requestAnimationFrame(fit);
      setTimeout(fit, 50);
      setTimeout(fit, 150);
      setTimeout(fit, 400);
      setTimeout(fit, 900);

      // also observe DOM size changes (fonts swap etc.)
      try {
        const ro = new ResizeObserver(() => fit());
        ro.observe(document.documentElement);
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

  function replaceAllTokens(html, replacements) {
    let out = String(html || "");
    for (const [rawKey, val] of Object.entries(replacements || {})) {
      const raw = String(rawKey);
      const inner = raw.replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
      const innerEsc = inner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\{\\{\\s*${innerEsc}\\s*\\}\\}`, "gi");
      out = out.replace(re, String(val));
    }
    return out;
  }

  const DEFAULT_TEMPLATE = `<h2 style="text-align:center;">CERTIFICAT DE RÉUSSITE</h2>

  <p>
  <div class="student-name-line">
  <span class="student-name" data-fit-name>{{STUDENT_FULL_NAME}}</span>
</div>

<p style="text-align:center; margin: 0 0 14px 0;">
  Nous certifions que
</p>
  a complété avec succès le programme de natation
  <strong>{{LEVEL_NAME}}</strong>
  durant l'année académique
  <strong>{{SCHOOL_YEAR_START}} – {{SCHOOL_YEAR_END}}</strong>.
  </p>

  <!-- ✅ Achievement section -->
  <p><strong>{{ACHIEVEMENT_TITLE}}</strong></p>
  <p>{{ACHIEVEMENT_TEXT}}</p>

  <p style="margin-top:40px;">
  Fait à Delmas, le {{DATE_ISSUED}}.
  </p>

  <br><br>

  <table width="100%">
  <tr>
  <td>__________________________<br/>Signature Administration</td>
  <td style="text-align:right;">__________________________<br/>Signature Instructeur</td>
  </tr>
  </table>`;

  export default function AdminStudentCertificates() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);

    const [uiError, setUiError] = useState("");
    const [uiOk, setUiOk] = useState("");

    // DB readiness detection
    const [dbReady, setDbReady] = useState(true);

    // Templates
    const [templates, setTemplates] = useState([]);
    const [selectedId, setSelectedId] = useState(null);

    const selected = useMemo(
      () => templates.find((t) => t.id === selectedId) || null,
      [templates, selectedId]
    );

    // Categories (Achievements)
    const [catLoading, setCatLoading] = useState(false);
    const [categories, setCategories] = useState([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState("");

    const selectedCategory = useMemo(
      () => categories.find((c) => c.id === selectedCategoryId) || null,
      [categories, selectedCategoryId]
    );

    // Category editor (admin manage)
    const [catEditId, setCatEditId] = useState("");
    const catEditing = useMemo(
      () => categories.find((c) => c.id === catEditId) || null,
      [categories, catEditId]
    );

    const [catName, setCatName] = useState("");
    const [catTitle, setCatTitle] = useState("");
    const [catBodyText, setCatBodyText] = useState(
      "Ce certificat est délivré pour reconnaître son engagement, sa discipline et ses progrès."
    );
    const [catIsActive, setCatIsActive] = useState(true);

    // Template editor fields
    const [version, setVersion] = useState("v1");
    const [title, setTitle] = useState("Certificat — Natation");
    const [html, setHtml] = useState(DEFAULT_TEMPLATE);

    // Preview controls
    const [previewMode, setPreviewMode] = useState("iframe"); // iframe | inline
    const [showPlaceholders, setShowPlaceholders] = useState(true);
    // Students (for preview + later generation)
const [studentsLoading, setStudentsLoading] = useState(false);
const [students, setStudents] = useState([]);
const [selectedStudentId, setSelectedStudentId] = useState("");

const studentOptions = useMemo(() => {
  const rows = students || [];

  // quick lookup so we can show "(Parent Name)" for children
  const byId = new Map(rows.map((r) => [String(r.id), r]));

  return rows
    .map((s) => {
      const full =
        (s.full_name || `${s.first_name || ""} ${s.last_name || ""}`).trim() || "—";

      const parent = s.parent_id ? byId.get(String(s.parent_id)) : null;
      const parentName =
        parent?.full_name ||
        `${parent?.first_name || ""} ${parent?.last_name || ""}`.trim() ||
        "";

      const label = parentName ? `${full} ` : full;

      return { value: s.id, label, raw: s };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
}, [students]);

const selectedStudent = useMemo(() => {
  return studentOptions.find((o) => String(o.value) === String(selectedStudentId))?.raw || null;
}, [studentOptions, selectedStudentId]);

    // Preview HTML
    const previewHtml = useMemo(() => {
      let h = String(html || "");
      if (!showPlaceholders) return wrapPreview(h);

      const achTitle =
        (selectedCategory?.title || selectedCategory?.name || "").trim() ||
        "Réussite / Accomplissement";
      const achText =
        (selectedCategory?.body_text || "").trim() ||
        "Ce certificat est délivré pour reconnaître son engagement, sa discipline et ses progrès techniques.";

      const studentFullName =
  (selectedStudent?.full_name ||
    `${selectedStudent?.first_name || ""} ${selectedStudent?.last_name || ""}`.trim()) ||
  "—";

const studentDob = selectedStudent?.birth_date
  ? new Date(selectedStudent.birth_date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    })
  : "—";

      const replacements = {
        "{{STUDENT_FULL_NAME}}": studentFullName,
        "{{DATE_OF_BIRTH}}": studentDob,
        "{{LEVEL_NAME}}": "Débutant",
        "{{PROGRAM_NAME}}": "Programme Académique A’QUA D’OR",
        "{{SCHOOL_YEAR_START}}": "01 septembre 2025",
        "{{SCHOOL_YEAR_END}}": "31 août 2026",
        "{{DATE_ISSUED}}": nowFrLong(),
        "{{INSTRUCTOR_NAME}}": "Coach A’QUA D’OR",

        // ✅ Achievement placeholders
        "{{ACHIEVEMENT_TITLE}}": achTitle,
        "{{ACHIEVEMENT_TEXT}}": achText,

        "{{logo_url}}": "/logo/aquador.png",
"{{signature_admin_url}}": "/assets/signature.png",
"{{signature_instructor_url}}": "/assets/signature-instructor.png",
"{{ribbon_header_url}}": "/assets/3.png",
"{{ribbon_footer_url}}": "/assets/4.png",
"{{medal_url}}": "/assets/medal.png",
      };

      h = replaceAllTokens(h, replacements);
      return wrapPreview(h);
    }, [html, showPlaceholders, selectedCategoryId, categories, selectedStudentId, students]);

    function wrapPdf(inner) {
  const baseHref =
    typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}/`
      : "/";

  // ✅ no scaling scripts for pdf
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <base href="${baseHref}" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap" rel="stylesheet">
  <style>
    html, body{ margin:0; padding:0; background:#fff; }
    .student-name{
      font-family: "Alex Brush", cursive;
      font-weight: 400;
      white-space: nowrap;
      display: inline-block;
    }
  </style>
</head>
<body>
  ${inner || ""}
</body>
</html>`;
}

    function isDirty() {
      if (!selected) return true;
      return (
        String(version || "") !== String(selected.version || "") ||
        String(title || "") !== String(selected.title || "") ||
        String(html || "") !== String(selected.html_template || "") ||
        String(selectedCategoryId || "") !== String(selected.category_id || "")
      );
    }

    function buildCertificateHTMLForPdf() {
  // Use current editor html + current selected student + current category
  let h = String(html || "");

  const achTitle =
    (selectedCategory?.title || selectedCategory?.name || "").trim() ||
    "Réussite / Accomplissement";

  const achText =
    (selectedCategory?.body_text || "").trim() ||
    "Ce certificat est délivré pour reconnaître son engagement, sa discipline et ses progrès techniques.";

  const studentFullName =
    (selectedStudent?.full_name ||
      `${selectedStudent?.first_name || ""} ${selectedStudent?.last_name || ""}`.trim()) ||
    "—";

  const studentDob = selectedStudent?.birth_date
    ? new Date(selectedStudent.birth_date).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      })
    : "—";

  const LEVEL_NAME = "Débutant";
  const PROGRAM_NAME = "Programme Académique A’QUA D’OR";
  const SCHOOL_YEAR_START = "01 septembre 2025";
  const SCHOOL_YEAR_END = "31 août 2026";
  const DATE_ISSUED = nowFrLong();
  const INSTRUCTOR_NAME = "Coach A’QUA D’OR";

  const replacements = {
    "{{STUDENT_FULL_NAME}}": studentFullName,
    "{{DATE_OF_BIRTH}}": studentDob,
    "{{LEVEL_NAME}}": LEVEL_NAME,
    "{{PROGRAM_NAME}}": PROGRAM_NAME,
    "{{SCHOOL_YEAR_START}}": SCHOOL_YEAR_START,
    "{{SCHOOL_YEAR_END}}": SCHOOL_YEAR_END,
    "{{DATE_ISSUED}}": DATE_ISSUED,
    "{{INSTRUCTOR_NAME}}": INSTRUCTOR_NAME,

    "{{ACHIEVEMENT_TITLE}}": achTitle,
    "{{ACHIEVEMENT_TEXT}}": achText,

    "{{logo_url}}": "/logo/aquador.png",
    "{{signature_admin_url}}": "/assets/signature.png",
    "{{signature_instructor_url}}": "/assets/signature-instructor.png",
  };

  h = replaceAllTokens(h, replacements);

  // ✅ Wrap for PDF render (NO preview scaling scripts)
  return {
    pdf_html: wrapPdf(h),
    meta: {
      studentFullName,
      LEVEL_NAME,
      PROGRAM_NAME,
      SCHOOL_YEAR_START,
      SCHOOL_YEAR_END,
      DATE_ISSUED,
      INSTRUCTOR_NAME,
      achTitle,
      achText,
    },
  };
}

    async function fetchCategories() {
      setUiError("");
      setUiOk("");
      setCatLoading(true);

      try {
        const { data, error } = await supabase
          .from("student_certificate_categories")
          .select("id, name, title, body_text, is_active, created_at, updated_at")
          .order("created_at", { ascending: false });

        if (error) throw error;

        setCategories(data || []);

        // Keep selection stable if possible
        if (selectedCategoryId && (data || []).some((c) => c.id === selectedCategoryId)) {
          // ok
        } else {
          const firstActive = (data || []).find((c) => c.is_active) || (data || [])[0] || null;
          setSelectedCategoryId(firstActive?.id || "");
        }

        // If editing id is gone, reset editor
        if (catEditId && !(data || []).some((c) => c.id === catEditId)) {
          setCatEditId("");
        }
      } catch (e) {
        const msg = e?.message || String(e);
        // don’t hard-fail the whole page if categories table missing
        if (
          msg.toLowerCase().includes("does not exist") ||
          msg.toLowerCase().includes("relation") ||
          msg.toLowerCase().includes("42p01")
        ) {
          setCategories([]);
        } else {
          setUiError(msg);
        }
      } finally {
        setCatLoading(false);
      }
    }

    async function fetchStudents() {
  setStudentsLoading(true);
  setUiError("");

  try {
    // ✅ This is what your invoice-template uses for family logic
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name, birth_date, parent_id")
      .order("full_name", { ascending: true });

    if (error) throw error;

    const list = data || [];
    setStudents(list);

    // default selection
    if (selectedStudentId && list.some((s) => String(s.id) === String(selectedStudentId))) {
      // keep
    } else {
      setSelectedStudentId(list[0]?.id || "");
    }
  } catch (e) {
    console.error("fetchStudents error:", e);
    setUiError(`Students dropdown error: ${e?.message || String(e)}`);
    setStudents([]);
    setSelectedStudentId("");
  } finally {
    setStudentsLoading(false);
  }
}

    async function fetchTemplates() {
      setUiError("");
      setUiOk("");
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from("student_certificate_templates")
          .select("id, created_at, is_active, version, title, html_template, category_id")
          .order("created_at", { ascending: false });

        if (error) throw error;

        setDbReady(true);
        setTemplates(data || []);

        const active = (data || []).find((t) => t.is_active) || (data || [])[0] || null;
        setSelectedId(active?.id || null);
      } catch (e) {
        const msg = e?.message || String(e);

        if (
          msg.toLowerCase().includes("does not exist") ||
          msg.toLowerCase().includes("relation") ||
          msg.toLowerCase().includes("42p01")
        ) {
          setDbReady(false);
          setTemplates([]);
          setSelectedId(null);
          setUiError(
            "DB not ready: table 'student_certificate_templates' is missing. Create it, then click Refresh."
          );
        } else {
          setUiError(msg);
        }
      } finally {
        setLoading(false);
      }
    }

    async function handleGenerate() {
  setUiError("");
  setUiOk("");

  if (!selectedStudentId) return setUiError("Select a student first.");
  if (!selectedId) return setUiError("Select/activate a template first.");

  try {
    setGenerating(true);

    const endpoint = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/generate-certificate-pdf`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        profile_id: String(selectedStudentId),
        template_id: String(selectedId),
        category_id: selectedCategoryId || null,

        // optional overrides (match your UI defaults)
        level_name: "Débutant",
        program_name: "Programme Académique A’QUA D’OR",
        school_year_start: "01 septembre 2025",
        school_year_end: "31 août 2026",
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || json?.message || `generate-certificate-pdf failed (${res.status})`);
    }

    setUiOk("✅ Certificat généré + ajouté dans Achievements.");

    // If you have a profile achievements view somewhere and want instant refresh,
    // you can trigger a local refetch there. DB insert already happened in the function.
  } catch (e) {
    setUiError(e?.message || String(e));
  } finally {
    setGenerating(false);
  }
}

    async function handleSaveEdits() {
      setUiError("");
      setUiOk("");

      if (!dbReady) {
        setUiError("DB not ready yet. Create table 'student_certificate_templates' then refresh.");
        return;
      }
      if (!selectedId) return setUiError("No template selected.");
      if (!version?.trim()) return setUiError("Version is required.");
      if (!title?.trim()) return setUiError("Title is required.");
      if (!html?.trim()) return setUiError("HTML template is required.");

      try {
        setSaving(true);

        const { error } = await supabase
          .from("student_certificate_templates")
          .update({
            version: version.trim(),
            title: title.trim(),
            html_template: html,
            category_id: selectedCategoryId || null,
          })
          .eq("id", selectedId);

        if (error) throw error;

        setUiOk("✅ Template saved.");
        await fetchTemplates();
        setSelectedId(selectedId);
      } catch (e) {
        setUiError(e?.message || String(e));
      } finally {
        setSaving(false);
      }
    }

    async function handleCreateNewVersion() {
      setUiError("");
      setUiOk("");

      if (!dbReady) {
        setUiError("DB not ready yet. Create table 'student_certificate_templates' then refresh.");
        return;
      }
      if (!version?.trim()) return setUiError("Version is required (ex: v2).");
      if (!title?.trim()) return setUiError("Title is required.");
      if (!html?.trim()) return setUiError("HTML template is required.");

      try {
        setSaving(true);

        // Deactivate current active for the same scope (category/global)
        let deact = supabase
          .from("student_certificate_templates")
          .update({ is_active: false })
          .eq("is_active", true);

        if (selectedCategoryId) deact = deact.eq("category_id", selectedCategoryId);
        else deact = deact.is("category_id", null);

        const { error: deactErr } = await deact;
        if (deactErr) throw deactErr;

        const { data: inserted, error: insErr } = await supabase
          .from("student_certificate_templates")
          .insert([
            {
              is_active: true,
              version: version.trim(),
              title: title.trim(),
              html_template: html,
              category_id: selectedCategoryId || null,
            },
          ])
          .select("id")
          .single();

        if (insErr) throw insErr;

        setUiOk("✅ New version created and activated.");
        await fetchTemplates();
        setSelectedId(inserted?.id || null);
      } catch (e) {
        setUiError(e?.message || String(e));
      } finally {
        setSaving(false);
      }
    }

    async function handleSetActive(id) {
      setUiError("");
      setUiOk("");

      if (!dbReady) {
        setUiError("DB not ready yet. Create table 'student_certificate_templates' then refresh.");
        return;
      }

      try {
        setSaving(true);

        // Read the template we are activating (need its category scope)
        const { data: tpl, error: getErr } = await supabase
          .from("student_certificate_templates")
          .select("id, category_id")
          .eq("id", id)
          .maybeSingle();

        if (getErr) throw getErr;

        const scopeCatId = tpl?.category_id ?? null;

        // Deactivate only within the SAME scope
        let deact = supabase
          .from("student_certificate_templates")
          .update({ is_active: false })
          .eq("is_active", true);

        if (scopeCatId) deact = deact.eq("category_id", scopeCatId);
        else deact = deact.is("category_id", null);

        const { error: deactErr } = await deact;
        if (deactErr) throw deactErr;

        const { error: actErr } = await supabase
          .from("student_certificate_templates")
          .update({ is_active: true })
          .eq("id", id);

        if (actErr) throw actErr;

        setUiOk("✅ Template activated.");
        await fetchTemplates();
        setSelectedId(id);
      } catch (e) {
        setUiError(e?.message || String(e));
      } finally {
        setSaving(false);
      }
    }

    // Category: start new
    function resetCategoryForm() {
      setCatEditId("");
      setCatName("");
      setCatTitle("");
      setCatBodyText(
        "Ce certificat est délivré pour reconnaître son engagement, sa discipline et ses progrès."
      );
      setCatIsActive(true);
    }

    // Category: load editor when selecting edit
    useEffect(() => {
      if (!catEditing) return;
      setCatName(catEditing.name || "");
      setCatTitle(catEditing.title || "");
      setCatBodyText(catEditing.body_text || "");
      setCatIsActive(!!catEditing.is_active);
    }, [catEditId]); // eslint-disable-line

    async function handleSaveCategory() {
      setUiError("");
      setUiOk("");

      if (!catName.trim()) return setUiError("Category name is required.");
      if (!catBodyText.trim()) return setUiError("Category text is required.");

      try {
        setSaving(true);

        if (catEditId) {
          const { error } = await supabase
            .from("student_certificate_categories")
            .update({
              name: catName.trim(),
              title: catTitle.trim() || null,
              body_text: catBodyText,
              is_active: !!catIsActive,
            })
            .eq("id", catEditId);

          if (error) throw error;
          setUiOk("✅ Category updated.");
        } else {
          const { data, error } = await supabase
            .from("student_certificate_categories")
            .insert([
              {
                name: catName.trim(),
                title: catTitle.trim() || null,
                body_text: catBodyText,
                is_active: !!catIsActive,
              },
            ])
            .select("id")
            .single();

          if (error) throw error;
          setUiOk("✅ Category created.");
          setSelectedCategoryId(data?.id || "");
        }

        await fetchCategories();
        resetCategoryForm();
      } catch (e) {
        setUiError(e?.message || String(e));
      } finally {
        setSaving(false);
      }
    }

    // Load editor state from DB on selection change
    useEffect(() => {
      setUiError("");
      setUiOk("");
      if (!selected) return;

      setVersion(selected.version || "");
      setTitle(selected.title || "");
      setHtml(selected.html_template || DEFAULT_TEMPLATE);

      // Keep category consistent with template selection
      setSelectedCategoryId(selected.category_id || "");
    }, [selectedId]); // eslint-disable-line

    useEffect(() => {
      (async () => {
        await fetchCategories();
        await fetchTemplates();
        await fetchStudents();
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-aquaBlue">Templates — Student Certificates</h2>
            <p className="text-sm text-gray-500">
              Create templates and preview. Add “Achievement Categories” to inject custom text into PDFs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await fetchCategories();
                await fetchTemplates();
                await fetchStudents();
              }}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
              disabled={loading || saving || catLoading}
            >
              Refresh
            </button>
          </div>
        </div>

        {(uiError || uiOk) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              uiError ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"
            }`}
          >
            {uiError ? `⚠️ ${uiError}` : `✅ ${uiOk}`}
          </div>
        )}

        <div className="space-y-6">
  {/* ROW 1: Versions + Achievement Categories */}
  <div className="space-y-6">
  {/* Row 1: Versions + Achievements */}
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
    {/* LEFT: Versions */}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:col-span-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">Versions</h3>
        <span className="text-xs text-gray-500">
          {dbReady ? `${templates.length} template(s)` : "DB not ready"}
        </span>
      </div>

      {loading ? (
        <p className="text-gray-500 italic">Loading…</p>
      ) : !dbReady ? (
        <div className="text-sm text-gray-600 space-y-2">
          <p className="font-semibold">UI is ready.</p>
          <p>
            Create table <span className="font-mono">student_certificate_templates</span> then Refresh.
          </p>
          <button
            type="button"
            className="w-full mt-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
            onClick={() => {
              setSelectedId(null);
              setVersion("v1");
              setTitle("Certificat — Natation");
              setHtml(DEFAULT_TEMPLATE);
            }}
          >
            Use local draft template
          </button>
        </div>
      ) : templates.length === 0 ? (
        <p className="text-gray-500 italic">No templates yet.</p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
          {templates.map((t) => {
            const active = !!t.is_active;
            const sel = t.id === selectedId;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left rounded-xl border px-3 py-2 transition ${
                  sel ? "border-aquaBlue bg-blue-50" : "border-gray-100 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-gray-800 truncate">{t.version || "—"}</div>
                  {active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">{t.title}</div>
                <div className="text-[11px] text-gray-400 mt-1">{formatDateTimeFrSafe(t.created_at)}</div>

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSetActive(t.id);
                    }}
                    disabled={saving}
                  >
                    Activate
                  </button>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>

    {/* RIGHT: Achievement Categories */}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:col-span-9">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-gray-800">Achievement Categories</h3>
          <p className="text-xs text-gray-500">
            Create categories of accomplishment. Use placeholders:{" "}
            <span className="font-mono">{"{{ACHIEVEMENT_TITLE}} {{ACHIEVEMENT_TEXT}}"}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
            onClick={resetCategoryForm}
            disabled={saving}
          >
            New category
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className="border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm text-gray-800">List</div>
            <div className="text-xs text-gray-500">{catLoading ? "…" : `${categories.length}`}</div>
          </div>

          <div className="space-y-2 max-h-[240px] overflow-auto pr-1">
            {categories.length === 0 ? (
              <div className="text-sm text-gray-500 italic">No categories yet (or table missing).</div>
            ) : (
              categories.map((c) => (
                <button
                  key={c.id}
                  className={`w-full text-left rounded-lg border px-3 py-2 ${
                    c.id === selectedCategoryId
                      ? "border-aquaBlue bg-blue-50"
                      : "border-gray-100 hover:bg-gray-50"
                  }`}
                  onClick={() => setSelectedCategoryId(c.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    {!c.is_active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">{c.title || "—"}</div>

                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCatEditId(c.id);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-2 border rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm text-gray-800">
              {catEditId ? "Edit category" : "Create category"}
            </div>
            {catEditId && (
              <div className="text-xs text-gray-500">Updated: {formatDateTimeFrSafe(catEditing?.updated_at)}</div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name *</label>
              <input
                className="w-full border rounded-lg px-3 py-2"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="ex: Assiduité"
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Title (optional)</label>
              <input
                className="w-full border rounded-lg px-3 py-2"
                value={catTitle}
                onChange={(e) => setCatTitle(e.target.value)}
                placeholder="ex: Certificat d’assiduité"
                disabled={saving}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Text inserted into PDF *</label>
              <textarea
                className="w-full border rounded-xl px-3 py-2 text-sm min-h-[120px]"
                value={catBodyText}
                onChange={(e) => setCatBodyText(e.target.value)}
                disabled={saving}
              />
              <div className="text-[11px] text-gray-500 mt-2">
                This becomes <span className="font-mono">{"{{ACHIEVEMENT_TEXT}}"}</span> in the template.
              </div>
            </div>

            <label className="md:col-span-2 text-sm text-gray-700 flex items-center gap-2">
              <input
                type="checkbox"
                checked={catIsActive}
                onChange={(e) => setCatIsActive(e.target.checked)}
                disabled={saving}
              />
              Active
            </label>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={resetCategoryForm}
              disabled={saving}
            >
              Reset
            </button>

            <button
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={handleSaveCategory}
              disabled={saving}
            >
              {saving ? "Saving..." : catEditId ? "Update category" : "Create category"}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>

  {/* ROW 2: Template Builder (FULL WIDTH, alone) */}
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h3 className="font-semibold text-gray-800">Template Builder</h3>
        <p className="text-xs text-gray-500">
          Pick an achievement category for this template (scope). The preview uses that same category.
        </p>
      </div>

      <label className="text-xs text-gray-600">Student</label>
<select
  value={selectedStudentId}
  onChange={(e) => setSelectedStudentId(e.target.value)}
  className="border rounded-lg px-1 py-1 text-sm"
  disabled={studentsLoading}
>
  <option value="">
    {studentsLoading
      ? "Loading students..."
      : studentOptions.length === 0
      ? "No students (check error banner)"
      : "Select a student"}
  </option>

  {studentOptions.map((opt) => (
    <option key={opt.value} value={opt.value}>
      {opt.label}
    </option>
  ))}
</select>

      <div className="flex items-center gap-2 flex-wrap">
    

        <select
          className="border rounded-lg px-2 py-1 text-sm"
          value={previewMode}
          onChange={(e) => setPreviewMode(e.target.value)}
        >
          <option value="iframe">Preview iframe</option>
          <option value="inline">Preview inline</option>
        </select>

        <button
          className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
          onClick={handleSaveEdits}
          disabled={saving || loading || !isDirty()}
          title={!isDirty() ? "No changes" : ""}
        >
          {saving ? "Saving..." : "Save"}
        </button>

        <button
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 text-sm"
          onClick={handleCreateNewVersion}
          disabled={saving || loading || !html?.trim() || !version?.trim()}
        >
          {saving ? "Creating..." : "Create new version (active)"}
        </button>
        <button
  className="px-3 py-2 rounded-lg bg-aquaBlue text-white hover:opacity-90 disabled:opacity-60 text-sm"
  onClick={handleGenerate}
  disabled={generating || saving || loading || !selectedStudentId || !selectedId}
  title={!selectedStudentId ? "Select a student" : !selectedId ? "Select a template" : ""}
>
  {generating ? "Génération..." : "Générer"}
</button>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* LEFT: Editor */}
      <div className="border rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Version</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="ex: v1"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm text-gray-600 mb-1">Title</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Certificat — Natation"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm text-gray-600 mb-1">Achievement category for this template</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
            >
              <option value="">(Global / no category)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.is_active ? "" : "(inactive)"}
                </option>
              ))}
            </select>

            <div className="text-[11px] text-gray-500 mt-2">
              Template can use:{" "}
              <span className="font-mono">{"{{ACHIEVEMENT_TITLE}} {{ACHIEVEMENT_TEXT}}"}</span>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-sm text-gray-600 mb-1">HTML Template</label>
          <textarea
            className="w-full border rounded-xl px-3 py-2 font-mono text-xs min-h-[420px]"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="Paste your HTML here…"
          />

          <div className="text-xs text-gray-500 mt-2">
            Suggested placeholders:{" "}
<span className="font-mono">
  {
    "{{STUDENT_FULL_NAME}} {{LEVEL_NAME}} {{SCHOOL_YEAR_START}} {{SCHOOL_YEAR_END}} {{DATE_ISSUED}} {{INSTRUCTOR_NAME}} {{ACHIEVEMENT_TITLE}} {{ACHIEVEMENT_TEXT}} {{logo_url}} {{signature_admin_url}} {{signature_instructor_url}}"
  }
</span>
          </div>
        </div>
      </div>

      {/* RIGHT: Preview */}
      <div className="border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Preview</h3>
          <div className="text-xs text-gray-500">
            Category: <span className="font-semibold">{selectedCategory?.name || "Global"}</span>
          </div>
        </div>

        {previewMode === "iframe" ? (
          <iframe
  title="preview"
  className="w-full h-[70vh] rounded-xl border"
  sandbox="allow-same-origin allow-scripts"
  srcDoc={previewHtml}
/>
        ) : (
          <div
            className="border rounded-xl p-4 max-h-[70vh] overflow-auto"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>
    </div>
  </div>
</div>
      </div>
    );
  }