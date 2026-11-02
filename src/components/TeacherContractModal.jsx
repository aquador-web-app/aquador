  // @ts-nocheck
  import { useEffect, useMemo, useRef, useState } from "react";
  import { supabase } from "../lib/supabaseClient";
  import SignatureField from "./SignatureField";
  import { sanitizeFullName } from "../lib/sanitizeFullName";
  import { formatCurrencyHTG } from "../lib/dateUtils";


  /**
   * Same PDF service you already use.
   * Reuse /sign-documents — NO new edge function required.
   */
  async function sendHTMLToPDFAndUpload({ html, formName, fullName, safeName }) {
  const endpoint = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/sign-documents`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      user_id: "anonymous",
      full_name: fullName, // display name (keeps accents)
      safe_name: safeName, // ✅ THIS controls the folder in signed_docs
      documents: [
        {
          form_name: formName,
          html_content: html,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error("PDF service error");
  const data = await res.json();
  return data.results?.[0]?.url;
}

async function objectExistsPublicUrl(publicUrl) {
  try {
    const res = await fetch(publicUrl, { method: "HEAD", cache: "no-store" });
    return res.ok; // 200 => exists
  } catch {
    return false;
  }
}



  function formatDateFrSafe(d = new Date()) {
    try {
      const dt = d instanceof Date ? d : new Date(d);
      return dt.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      });
    } catch {
      const dt = new Date();
      return dt.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      });
    }
  }

  function parseISODateLocal(iso) {
  if (!iso) return null;

  const [year, month, day] = String(iso).split("-").map(Number);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

  // Haiti school-year: Sep 1 → Aug 31 (based on Haiti timezone)
  function getHaitiNow() {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
    );
  }


  function makeSchoolYearOptions({ startYear = 2025, count = 6 } = {}) {
  const out = [];
  for (let y = startYear; y < startYear + count; y++) {
    out.push({
      label: `${y}–${y + 1}`,
      start: new Date(y, 8, 1),        // Sep 1
      end: new Date(y + 1, 7, 31),     // Aug 31
      startISO: `${y}-09-01`,
      endISO: `${y + 1}-08-31`,
    });
  }
  return out;
}

function replaceAllTokens(html, replacements) {
  let out = String(html || "");

  for (const [rawKey, val] of Object.entries(replacements)) {
    const raw = String(rawKey);

    // Expect rawKey like "{{FULL_NAME}}"
    // Build a regex that matches:
    // {{ FULL_NAME }}, {{full_name}}, {{ Full_Name }}, etc.
    const inner = raw
      .replace(/^\{\{/, "")
      .replace(/\}\}$/, "")
      .trim();

    const innerEsc = inner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const re = new RegExp(`\\{\\{\\s*${innerEsc}\\s*\\}\\}`, "gi");
    out = out.replace(re, String(val));
  }

  return out;
}



  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function imgTag(dataUrl, alt = "signature", w = 220, h = 70) {
  if (!dataUrl) return `<span style="color:#999;">(signature manquante)</span>`;
  return `
    <img
      src="${dataUrl}"
      alt="${alt}"
      width="${w}"
      height="${h}"
      style="display:block; object-fit:contain;"
    />
  `;
}



  function wrapHTML(inner, logoUrl) {
    return `
  <!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { margin-top: 0.1in; margin-right: 0.5in; margin-bottom: 0.5in; margin-left: 0.5in; }
      body { font-family: "Poppins","Segoe UI",Roboto,Arial,sans-serif; color:#111; margin:0; padding:0; line-height:1.55; font-size:14px; background:#fff; }
      header { display:flex; align-items:center; justify-content:center; gap:12px; border-bottom:2px solid #00bfff; padding:16px 0 8px; margin-bottom:20px; }
      header img { max-height: 65px; width:auto; }
      h2 { text-align:center; font-size:18px; margin:8px 0 10px; color:#001f5c; }
      p { margin:1px 0; text-align:justify; }
      strong { font-weight: 600; }
    </style>
  </head>
  <body>
    <header>
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo A'QUA D'OR"/>` : ""}
    </header>
    <main>
      ${inner}
    </main>
  </body>
  </html>`;
  }

  function wrapHTMLPreview(inner) {
    return `<div style="font-size:14px; line-height:1.5;">${inner}</div>`;
  }
  function previewSignatureBox(sig) {
  if (!sig)
    return `<span style="display:inline-block; width:220px; height:70px; color:#999;">(signature)</span>`;
  return `
    <div style="display:block; width:100%; text-align:left;">
      <img src="${sig}" alt="signature" style="width:220px; height:70px; object-fit:contain; display:inline-block;" />
    </div>
  `;
}


  /**
   * TeacherContractModal
   * Props:
   *  - teacherId (uuid)  (required)
   *  - teacherFullName (string) (optional; we can fetch)
   *  - onClose()
   *  - onDone({ pdf_url, contract_id })
   *
   * This modal:
   *  - fetches active contract template from DB
   *  - fetches teacher profile + salary info
   *  - captures ID + NIF/CIN + signature
   *  - generates PDF via /sign-documents
   *  - updates teacher_contracts row + inserts into documents (optional)
   */
  export default function TeacherContractModal({
    teacherId,
    teacherFullName,
    defaultSchoolYearStartISO = "2025-09-01",
    onClose,
    onDone,
  }) {
    const contentRef = useRef(null);

    const [saving, setSaving] = useState(false);
    const [uiError, setUiError] = useState("");

    const [logoUrl, setLogoUrl] = useState("");

    const [template, setTemplate] = useState(null); // {id, html_template, version}
    const [teacher, setTeacher] = useState(null);   // profile
    const [salary, setSalary] = useState(null);     // optional
    const [salarySettings, setSalarySettings] = useState({ reference_students: null });
    const [contractId, setContractId] = useState(null);
    const [employerSig, setEmployerSig] = useState("");
    const [savedTeacherSig, setSavedTeacherSig] = useState("");

    
    const [idUploadPath, setIdUploadPath] = useState("");
    const [idUploadUrl, setIdUploadUrl] = useState("");
    const [pdfExists, setPdfExists] = useState(false);

    const [idFile, setIdFile] = useState(null);
    const [nifCin, setNifCin] = useState("");
    const [signature, setSignature] = useState(null);

    const nowDate = useMemo(() => formatDateFrSafe(), []);
    const [schoolYearStartISO, setSchoolYearStartISO] = useState("");
const [schoolYearEndISO, setSchoolYearEndISO] = useState("");

const yearStart = useMemo(
  () => parseISODateLocal(schoolYearStartISO),
  [schoolYearStartISO]
);

const yearEnd = useMemo(
  () => parseISODateLocal(schoolYearEndISO),
  [schoolYearEndISO]
);

const currentSchoolYearLabel = useMemo(() => {
  if (!schoolYearStartISO) return "—";

  const startYear = Number(schoolYearStartISO.slice(0, 4));

  return `${startYear}–${startYear + 1}`;
}, [schoolYearStartISO]);


    const safeName = useMemo(() => {
      const base = teacherFullName || teacher?.full_name || "professeur";
      return sanitizeFullName(base);
    }, [teacherFullName, teacher?.full_name]);

    const schoolYearFolder = useMemo(() => {
  if (!schoolYearStartISO) return "current";

  const year = Number(schoolYearStartISO.slice(0, 4));
  const month = Number(schoolYearStartISO.slice(5, 7));

  const academicStartYear = month >= 9 ? year : year - 1;

  return `${academicStartYear}-${academicStartYear + 1}`;
}, [schoolYearStartISO]);

const teacherFolder = useMemo(() => {
  // ✅ signed_docs/PROFESSEURS/2025-2026/Teacher_Full_Name/
  return `PROFESSEURS/${schoolYearFolder}/${safeName}`;
}, [schoolYearFolder, safeName]);



    useEffect(() => {
      const onKeyDown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
  setIdFile(null);
  setIdUploadUrl("");
  setIdUploadPath(""); // ✅ important
}, [schoolYearStartISO]);


    useEffect(() => {
      if (!uiError || !contentRef.current) return;
      contentRef.current.scrollTop = 0;
      requestAnimationFrame(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
      });
    }, [uiError]);

    async function uploadTeacherIdFile(file) {
  if (!file) throw new Error("Veuillez ajouter une pièce d'identité.");

  // ✅ sanitize file name (same spirit as before)
  const cleanName = String(file.name || "piece-identite")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-]/g, "");

  // ✅ teacher folder: PROFESSEURS/<YYYY-YYYY>/<teacher_name>/
  const folder = teacherFolder; // already computed with safeName + schoolYearFolder

  // ✅ final path in signed_docs
  const path = `${folder}/ID_${Date.now()}_${cleanName}`;

  // ✅ upload + log result
  const { data: upData, error: upErr } = await supabase.storage
    .from("signed_docs")
    .upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });

  console.log("🪪 ID UPLOAD PATH:", path);
  console.log("🪪 ID UPLOAD DATA:", upData);
  console.log("🪪 ID UPLOAD ERROR:", upErr);

  if (upErr) throw upErr;

  // ✅ private bucket: signed URL for viewing
  const { data: signed, error: sErr } = await supabase.storage
    .from("signed_docs")
    .createSignedUrl(path, 60 * 60);

  if (sErr) throw sErr;

  return { path, url: signed?.signedUrl || "" };
}




    // Load logo as base64 (same as SignupDocsModal)
    useEffect(() => {
      (async () => {
        const { data } = supabase.storage.from("assets").getPublicUrl("aquador.png");
        const publicUrl = data?.publicUrl;
        if (!publicUrl) return;

        try {
          const res = await fetch(publicUrl);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => setLogoUrl(reader.result);
          reader.readAsDataURL(blob);
        } catch (err) {
          console.warn("⚠️ Failed to fetch logo as base64:", err);
        }
      })();
    }, []);

    useEffect(() => {
  (async () => {
    // ✅ Same logic as logo: fetch from Supabase Storage "assets"
    // Make sure this file exists in the bucket: assets/signature.png
    const { data } = supabase.storage.from("assets").getPublicUrl("signature.png");
    const publicUrl = data?.publicUrl;
    if (!publicUrl) return;

    try {
      const res = await fetch(publicUrl);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => setEmployerSig(String(reader.result || ""));
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn("⚠️ Failed to fetch employer signature as base64:", err);
    }
  })();
}, []);


    // Load template + teacher info (+ salary) + create/ensure contract row
    useEffect(() => {
  if (!teacherId) return;

  (async () => {
    try {
    setUiError("");

    // ✅ FORCE FRESH SIGNATURE EACH TIME MODAL LOADS
    setSignature(null);
    setSavedTeacherSig("");


        // 1) Determine teacher category_id (salary assignment)
let teacherCategoryId = null;

{
  const { data: asg, error: asgErr } = await supabase
    .from("teacher_salary_assignments")
    .select("category_id, created_at")
    .eq("profile_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!asgErr && asg?.length) {
    teacherCategoryId = asg[0]?.category_id || null;
  }
}

// 2) Active template (TEACHER-specific first, then category/global fallback)
let tplQuery = supabase
  .from("teacher_contract_templates")
  .select("id, version, title, html_template, is_active, category_id, teacher_id, created_at")
  .eq("is_active", true)
  .order("created_at", { ascending: false });

// We want:
// (teacher_id = teacherId OR teacher_id IS NULL)
// AND
// (category_id = teacherCategoryId OR category_id IS NULL)   [if category exists]
//
// IMPORTANT: Must be in ONE `.or()` using PostgREST syntax: and(or(...),or(...))
if (teacherCategoryId) {
  tplQuery = tplQuery.or(
    `and(or(teacher_id.eq.${teacherId},teacher_id.is.null),or(category_id.eq.${teacherCategoryId},category_id.is.null))`
  );
} else {
  // no category => teacher-specific OR global, but only category_id NULL
  tplQuery = tplQuery.or(
    `and(or(teacher_id.eq.${teacherId},teacher_id.is.null),category_id.is.null)`
  );
}

const { data: tpls, error: tplErr } = await tplQuery;

if (tplErr) {
  setUiError(tplErr.message || String(tplErr));
  return;
}
if (!tpls?.length) {
  setUiError("Aucun template actif trouvé (teacher/category/global).");
  return;
}

// ✅ Pick with strict priority:
// 1) teacher-specific active (teacher_id = teacherId)  [optionally match category if present]
// 2) category-specific global (teacher_id null + category match)
// 3) global (teacher_id null + category_id null)
const teacherSpecific = tpls.filter((t) => String(t.teacher_id || "") === String(teacherId));
const categoryGlobal = teacherCategoryId
  ? tpls.filter(
      (t) =>
        t.teacher_id == null &&
        String(t.category_id || "") === String(teacherCategoryId)
    )
  : [];
const globalTpl = tpls.filter((t) => t.teacher_id == null && t.category_id == null);

const chosen =
  (teacherCategoryId
    ? teacherSpecific.find(
        (t) => String(t.category_id || "") === String(teacherCategoryId)
      )
    : null) ||
  teacherSpecific[0] ||
  categoryGlobal[0] ||
  globalTpl[0] ||
  tpls[0];

setTemplate(chosen);

const tplId = chosen?.id;
if (!tplId) {
  setUiError("Template invalide (id manquant).");
  return;
}


// Load contract dates from administration settings.
const { data: settings, error: settingsError } = await supabase
  .from("teacher_contract_settings")
  .select("teacher_id, contract_start, contract_end")
  .or(`teacher_id.is.null,teacher_id.eq.${teacherId}`);

if (settingsError) throw settingsError;

const individualSetting = (settings || []).find(
  (row) => row.teacher_id === teacherId
);

const globalSetting = (settings || []).find(
  (row) => row.teacher_id === null
);

const applicableSetting = individualSetting || globalSetting;

if (!applicableSetting) {
  setUiError("Aucune période de contrat définie par l'administration.");
  return;
}

setSchoolYearStartISO(applicableSetting.contract_start);
setSchoolYearEndISO(applicableSetting.contract_end);

setContractId(null);
setNifCin("");
setIdUploadPath("");
setIdUploadUrl("");
setSavedTeacherSig("");
setSignature(null);
setPdfExists(false);


        // 2) Teacher profile
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, address, email, phone, role")
          .eq("id", teacherId)
          .single();

        if (profErr || !prof) {
          setUiError("Impossible de charger les infos du professeur.");
          return;
        }
        setTeacher(prof);

        // 3) Salary info (OPTIONAL) — uses existing tables:
// teacher_salary_assignments + teacher_salary_categories
// ✅ Salary info (OPTIONAL) — teacher_salary_assignments is a flat table/view in your DB
// ✅ Salary info (REQUIRED) — read assignment then category (2 places)
{
  // 1) latest assignment for that teacher
  const { data: asg, error: asgErr } = await supabase
    .from("teacher_salary_assignments")
    .select("profile_id, category_id, category_name, created_at")
    .eq("profile_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (asgErr) {
    console.warn("teacher_salary_assignments error:", asgErr);
    setSalary(null);
  } else if (!asg?.length) {
    setSalary(null);
  } else {
    const a = asg[0];

    // 2) category row contains the actual salary amount
    const { data: cat, error: catErr } = await supabase
      .from("teacher_salary_categories")
      .select("*")
      .eq("id", a.category_id)
      .maybeSingle();

    if (catErr) {
      console.warn("teacher_salary_categories error:", catErr);
      setSalary({
        salary_category_id: a.category_id,
        salary_category_name: a.category_name || "",
        salary_base_htg: null,
      });
    } else {
      // pick the right amount column (no crash even if column name differs)
      setSalary({
  salary_category_id: a.category_id,
  salary_category_name: cat?.name || a.category_name || "",

  salary_base_htg:
    cat?.base_salary != null ? Number(cat.base_salary) : null,

  salary_mid_htg:
    cat?.salary_mid_htg != null ? Number(cat.salary_mid_htg) : null,

  salary_min_htg:
    cat?.salary_min_htg != null ? Number(cat.salary_min_htg) : null,
});
    }
  }
}


       // Salary settings (reference_students)
{
  const { data, error } = await supabase
    .from("salary_settings")
    .select("reference_students")
    .limit(1)
    .maybeSingle();

  if (!error) {
    setSalarySettings({ reference_students: data?.reference_students ?? null });
  }
}

        } catch (err) {
    console.error("❌ TeacherContractModal load error:", err);
    setUiError(err?.message || String(err));
  }

        // If unique constraint blocks duplicates, it's OK — we’ll fetch existing row.


      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [teacherId]);

    // Build salary values for placeholders (fallback to contract text defaults)
    const salaryBaseHTG = useMemo(() => {
  const n = Number(salary?.salary_base_htg);
  return Number.isFinite(n) ? n : null;
}, [salary]);

const salaryMidHTG = useMemo(() => {
  const value = salary?.salary_mid_htg;
  if (value == null) return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}, [salary]);

const salaryMinHTG = useMemo(() => {
  const value = salary?.salary_min_htg;
  if (value == null) return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}, [salary]);


    // Render HTML by injecting placeholders into the DB template
    function renderContractHTML() {
  if (!template?.html_template) return "";
  if (!yearStart || !yearEnd) return "";

  const startStr = yearStart.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const endStr = yearEnd.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const city = "Delmas";

const replacements = {
  // ✅ Match your Admin template placeholders
  "{{TEACHER_FULL_NAME}}": escapeHtml(teacher?.full_name || teacherFullName || ""),
  "{{TEACHER_ADDRESS}}": escapeHtml(teacher?.address || ""),
  "{{TEACHER_NIF_CIN}}": escapeHtml(nifCin || ""),


  "{{SCHOOL_YEAR_START}}": escapeHtml(startStr),
  "{{SCHOOL_YEAR_END}}": escapeHtml(endStr),

  "{{SALARY_BASE_HTG}}": escapeHtml(
  salaryBaseHTG != null && salaryBaseHTG > 0
    ? formatCurrencyHTG(salaryBaseHTG)
    : "—"
),

"{{SALARY_MID_HTG}}": escapeHtml(
  salaryMidHTG != null
    ? formatCurrencyHTG(salaryMidHTG)
    : "—"
),

"{{SALARY_MIN_HTG}}": escapeHtml(
  salaryMinHTG != null
    ? formatCurrencyHTG(salaryMinHTG)
    : "—"
),

  "{{SALARY_CATEGORY_NAME}}": escapeHtml(
    salary?.category_name || salary?.salary_category_name || ""
  ),

  // If you have salary_settings later, wire it here; for now show "—"
  "{{REFERENCE_STUDENTS}}": escapeHtml(
  salarySettings?.reference_students != null ? String(salarySettings.reference_students) : "—"
),
"{{reference_students}}": escapeHtml(
  salarySettings?.reference_students != null ? String(salarySettings.reference_students) : "—"
),


  "{{DATE_SIGNATURE}}": escapeHtml(nowDate || ""),
  "{{SIGNATURE_TEACHER}}": imgTag(signature, "signature-prof"),
  "{{date_du_jour}}": escapeHtml(nowDate || ""),
"{{DATE_DU_JOUR}}": escapeHtml(nowDate || ""),
"{{signature_employer}}": imgTag(employerSig, "signature-employer"),
"{{SIGNATURE_EMPLOYER}}": imgTag(employerSig, "signature-employer"),



  // ✅ Support your optional “contract_*” placeholders too (your admin preview supports these)
  "{{contract_start_fr}}": escapeHtml(startStr),
  "{{contract_end_fr}}": escapeHtml(endStr),
  "{{contract_city}}": escapeHtml(city),
  "{{contract_signed_date_fr}}": escapeHtml(nowDate || ""),

  // ✅ OPTIONAL: keep backward compatibility if some older templates used these
  "{{FULL_NAME}}": escapeHtml(teacher?.full_name || teacherFullName || ""),
  "{{address}}": escapeHtml(teacher?.address || ""),
  "{{NIF_CIN}}": escapeHtml(nifCin || ""),
 
};


  const injected = replaceAllTokens(template.html_template, replacements);
  return wrapHTML(injected, logoUrl);
}


    // For in-modal preview (keep it light like SignupDocsModal)
    function renderPreviewHTML() {
  if (!template?.html_template) return wrapHTMLPreview("<p>—</p>");
  if (!yearStart || !yearEnd) return "";

  const startStr = yearStart.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const endStr = yearEnd.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const city = "Delmas";

const replacements = {
  "{{TEACHER_FULL_NAME}}": escapeHtml(teacher?.full_name || teacherFullName || ""),
  "{{TEACHER_ADDRESS}}": escapeHtml(teacher?.address || ""),
  "{{TEACHER_NIF_CIN}}": escapeHtml(nifCin || ""),


  "{{SCHOOL_YEAR_START}}": escapeHtml(startStr),
  "{{SCHOOL_YEAR_END}}": escapeHtml(endStr),

  "{{SALARY_BASE_HTG}}": escapeHtml(
  salaryBaseHTG != null && salaryBaseHTG > 0
    ? formatCurrencyHTG(salaryBaseHTG)
    : "—"
),

"{{SALARY_MID_HTG}}": escapeHtml(
  salaryMidHTG != null
    ? formatCurrencyHTG(salaryMidHTG)
    : "—"
),

"{{SALARY_MIN_HTG}}": escapeHtml(
  salaryMinHTG != null
    ? formatCurrencyHTG(salaryMinHTG)
    : "—"
),


  "{{SALARY_CATEGORY_NAME}}": escapeHtml(
    salary?.category_name || salary?.salary_category_name || ""
  ),

  "{{REFERENCE_STUDENTS}}": escapeHtml(
  salarySettings?.reference_students != null ? String(salarySettings.reference_students) : "—"
),
"{{reference_students}}": escapeHtml(
  salarySettings?.reference_students != null ? String(salarySettings.reference_students) : "—"
),


  "{{DATE_SIGNATURE}}": escapeHtml(nowDate || ""),
  "{{SIGNATURE_TEACHER}}": previewSignatureBox(signature),
  "{{date_du_jour}}": escapeHtml(nowDate || ""),
"{{DATE_DU_JOUR}}": escapeHtml(nowDate || ""),
"{{signature_employer}}": previewSignatureBox(employerSig),
"{{SIGNATURE_EMPLOYER}}": previewSignatureBox(employerSig),



  "{{contract_start_fr}}": escapeHtml(startStr),
  "{{contract_end_fr}}": escapeHtml(endStr),
  "{{contract_city}}": escapeHtml(city),
  "{{contract_signed_date_fr}}": escapeHtml(nowDate || ""),

  // backward compatibility
  "{{FULL_NAME}}": escapeHtml(teacher?.full_name || teacherFullName || ""),
  "{{address}}": escapeHtml(teacher?.address || ""),
  "{{NIF_CIN}}": escapeHtml(nifCin || ""),

};


  return wrapHTMLPreview(replaceAllTokens(template.html_template, replacements));
}




async function saveAndGenerate() {
  setUiError("");

  if (saving) return;

  if (!template?.id) {
    return setUiError("Template introuvable.");
  }

  if (!teacherId) {
    return setUiError("Professeur introuvable.");
  }

  if (!schoolYearStartISO || !schoolYearEndISO) {
    return setUiError("Période du contrat introuvable.");
  }

  if (schoolYearEndISO <= schoolYearStartISO) {
    return setUiError("La période du contrat est invalide.");
  }

  if (!idUploadPath && !idFile) {
    return setUiError("Veuillez téléverser votre pièce d'identité.");
  }

  if (!nifCin.trim()) {
    return setUiError("Veuillez saisir votre NIF/CIN.");
  }

  if (!signature) {
    return setUiError("Veuillez signer le contrat.");
  }

  try {
    setSaving(true);

    // 1. Confirm the configured period has not changed.
    const { data: settings, error: settingsError } = await supabase
      .from("teacher_contract_settings")
      .select("teacher_id, contract_start, contract_end")
      .or(`teacher_id.is.null,teacher_id.eq.${teacherId}`);

    if (settingsError) throw settingsError;

    const applicable =
      (settings || []).find((row) => row.teacher_id === teacherId) ||
      (settings || []).find((row) => row.teacher_id === null);

    if (
      !applicable ||
      applicable.contract_start !== schoolYearStartISO ||
      applicable.contract_end !== schoolYearEndISO
    ) {
      throw new Error(
        "Les dates du contrat ont été modifiées. Fermez et rouvrez le contrat."
      );
    }

    // 2. Check existing signed contracts before generating a PDF.
    const { data: signedContracts, error: overlapError } = await supabase
      .from("teacher_contracts")
      .select("id, school_year_start, school_year_end")
      .eq("teacher_id", teacherId)
      .eq("status", "signed")
      .lte("school_year_start", schoolYearEndISO)
      .gte("school_year_end", schoolYearStartISO);

    if (overlapError) throw overlapError;

    if (signedContracts?.length) {
      throw new Error(
        "Un contrat signé existe déjà pour cette période. Contactez l'administration."
      );
    }

    // 3. Upload identification without creating a draft contract.
    let uploadPath = idUploadPath;

    if (!uploadPath && idFile) {
      const uploaded = await uploadTeacherIdFile(idFile);
      uploadPath = uploaded.path;

      setIdUploadPath(uploadPath);
      setIdUploadUrl(uploaded.url || "");
    }

    // 4. Generate the signed PDF.
    const finalHtml = renderContractHTML();

    // Unique path for each signing attempt.
    // This prevents overwriting historical contract PDFs.
    const signingId = crypto.randomUUID();

    const pdfUrl = await sendHTMLToPDFAndUpload({
      html: finalHtml,
      formName: "Contrat Professeur",
      fullName: teacher?.full_name || teacherFullName || "Professeur",
      safeName: `${teacherFolder}/${schoolYearStartISO}_${schoolYearEndISO}_${signingId}`,
    });

    if (!pdfUrl) {
      throw new Error("La génération du PDF a échoué.");
    }

    // 5. Create the contract only after the PDF exists.
    const signedAt = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("teacher_contracts")
      .insert({
        teacher_id: teacherId,
        template_id: template.id,
        school_year_start: schoolYearStartISO,
        school_year_end: schoolYearEndISO,
        status: "signed",
        signed_at: signedAt,
        pdf_url: pdfUrl,
        teacher_nif_cin: nifCin.trim(),
        teacher_id_upload_url: uploadPath,
        teacher_signature_dataurl: signature,
      })
      .select("id, pdf_url")
      .single();

    if (insertError) {
      if (
        insertError.code === "23P01" ||
        insertError.message?.includes("teacher_contracts_no_signed_overlap")
      ) {
        throw new Error(
          "Un autre contrat signé existe déjà pour cette période. Contactez l'administration."
        );
      }

      throw insertError;
    }

    setContractId(inserted.id);

    // 6. Optional documents log.
    const { error: documentError } = await supabase
      .from("documents")
      .insert({
        user_id: teacherId,
        type: "Contrat Professeur",
        file_url: pdfUrl,
        signed_at: signedAt,
      });

    if (documentError) {
      console.warn("Contract signed; documents log failed:", documentError);
    }

    onDone?.({
      pdf_url: inserted.pdf_url,
      contract_id: inserted.id,
    });

    onClose?.();
  } catch (err) {
    console.error("Teacher contract signing failed:", err);
    setUiError(err?.message || String(err));
  } finally {
    setSaving(false);
  }
}
    

    const docWrapClasses =
      "border rounded-lg p-4 max-h-[45vh] overflow-auto bg-white shadow-inner";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-2">
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b">
            <div className="font-semibold text-lg">
              Contrat Professeur (Signature)
            </div>
            <button
              onClick={() => onClose?.()}
              className="rounded-full px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200"
            >
              Fermer
            </button>
          </div>

          {/* Content */}
          <div
            ref={contentRef}
            className="overflow-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4"
          >
            {uiError && (
              <div className="sticky top-0 z-20 mb-3 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 shadow">
                ⚠️ {uiError}
              </div>
            )}

            {/* Small form area */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div>
  <label className="block text-sm text-gray-600 mb-1">
    Année académique <span className="text-red-500">*</span>
  </label>
  <select
  className="w-full border rounded-md px-3 py-2 bg-gray-50"
  value={currentSchoolYearLabel}
  disabled
>
  <option value={currentSchoolYearLabel}>
    {currentSchoolYearLabel}
  </option>
</select>
</div>

                <label className="block text-sm text-gray-600 mb-1">
                  Professeur
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={teacher?.full_name || teacherFullName || ""}
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Adresse
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={teacher?.address || ""}
                  readOnly
                />
              </div>

              <div className="sm:col-span-2">
  <label className="block text-sm text-gray-600 mb-1">
    Télécharger pièce d'identité <span className="text-red-500">*</span>
  </label>

  <input
    type="file"
    accept="image/*,.pdf"
    className="w-full border rounded-md px-3 py-2"
    onChange={(e) => setIdFile(e.target.files?.[0] || null)}
    disabled={saving}
  />

  {idUploadPath ? (
    <div className="mt-2 text-sm flex items-center gap-2">
      ✅ Fichier téléversé
      <button
        type="button"
        className="text-blue-600 underline"
        onClick={async () => {
          const { data, error } = await supabase.storage
            .from("signed_docs")
            .createSignedUrl(idUploadPath, 60 * 15);
          if (error) return setUiError(error.message || String(error));
          const url = data?.signedUrl || "";
          setIdUploadUrl(url);
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        }}
        disabled={saving}
      >
        Ouvrir
      </button>
    </div>
  ) : (
    <div className="mt-2 text-xs text-gray-500">
      Aucun fichier téléversé pour cette année.
    </div>
  )}
</div>

<div>
  <label className="block text-sm text-gray-600 mb-1">
    NIF / CIN <span className="text-red-500">*</span>
  </label>
  <input
    className="w-full border rounded-md px-3 py-2"
    value={nifCin}
    onChange={(e) => setNifCin(e.target.value)}
    placeholder="Ex.: 004-000-000-0"
    disabled={saving}
  />
</div>

              <div className="sm:col-span-2 text-xs text-gray-600">
  Durée:{" "}
  <b>{yearStart ? yearStart.toLocaleDateString("fr-FR") : "—"}</b>
  {" → "}
  <b>{yearEnd ? yearEnd.toLocaleDateString("fr-FR") : "—"}</b>
  {" "}(définie par l'administration)
</div>
            </div>

            {/* Preview */}
            <div className={docWrapClasses}>
              <div
                className="prose max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: renderPreviewHTML() }}
              />
            </div>

            {/* Signature */}
            <SignatureField
              label="Signature du professeur"
              value={signature}
              onChange={setSignature}
            />
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-3 border-t flex items-center justify-between">
            <button
              type="button"
              className="rounded-md px-4 py-2 bg-gray-100 hover:bg-gray-200"
              onClick={() => onClose?.()}
              disabled={saving}
            >
              Annuler
            </button>

            <button
              type="button"
              className="rounded-md px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={saveAndGenerate}
              disabled={saving || !template || !teacher}
            >
              {saving ? "Finalisation..." : "Signer & Générer PDF"}
            </button>
          </div>
        </div>
      </div>
    );
  }
