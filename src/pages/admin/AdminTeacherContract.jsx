// src/pages/Admin/AdminTeacherContract.jsx
// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
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

function formatDateFrLongSafe(d) {
  try {
    // If it's a DATE string (YYYY-MM-DD), force LOCAL date to avoid UTC shifting
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      // use noon to avoid DST edge cases
      const dt = new Date(`${d}T12:00:00`);
      return dt.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      });
    }

    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  } catch {
    return String(d || "");
  }
}


function formatHTG(v) {
  const n = Number(v || 0);
  // keep it simple: "HTG 15,000.00"
  return `HTG ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


export default function AdminTeacherContract() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uiError, setUiError] = useState("");
  const [uiOk, setUiOk] = useState("");

  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [contractStartOverride, setContractStartOverride] = useState("");
  const [contractEndOverride, setContractEndOverride] = useState("");

    // === Teachers dropdown ===
  const [teachers, setTeachers] = useState([]); // rows for dropdown
  const [selectedTeacherId, setSelectedTeacherId] = useState("");

  const selectedTeacher = useMemo(() => {
  return teachers.find((t) => t.teacher_id === selectedTeacherId) || null;
}, [teachers, selectedTeacherId]);


  // salary settings
  const [salarySettings, setSalarySettings] = useState({ reference_students: null });


  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) || null,
    [templates, selectedId]
  );

  // editor state
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("Contrat de travail – Professeur de natation");
  const [html, setHtml] = useState("");

  const [previewMode, setPreviewMode] = useState("iframe"); // iframe | inline
  const [showPlaceholders, setShowPlaceholders] = useState(true);

  // placeholder preview injection
  const previewHtml = useMemo(() => {
    let h = String(html || "");

    if (!showPlaceholders) return wrapPreview(h);

    // Inject example values so admin can "see" it
        const t = selectedTeacher;

    const city = "Delmas"; // or whatever you want
const startFr = contractStartOverride ? formatDateFrLongSafe(contractStartOverride) : "—";
const endFr = contractEndOverride ? formatDateFrLongSafe(contractEndOverride) : "—";
const signedFr = formatDateFrLongSafe(new Date());

    const replacements = {
      // Support BOTH uppercase and lowercase placeholders (so your template can use either)
      "{{TEACHER_FULL_NAME}}": t?.teacher_full_name || "—",
      "{{teacher_full_name}}": t?.teacher_full_name || "—",

      "{{TEACHER_ADDRESS}}": t?.teacher_address || "—",
      "{{teacher_address}}": t?.teacher_address || "—",

      "{{TEACHER_NIF_CIN}}": t?.teacher_nif_cin || "—",
      "{{teacher_nif_cin}}": t?.teacher_nif_cin || "—",

      "{{TEACHER_ID_NUMBER}}": t?.teacher_id_number || "—",
      "{{teacher_id_number}}": t?.teacher_id_number || "—",

      "{{SCHOOL_YEAR_START}}": t?.school_year_start ? formatDateFrLongSafe(t.school_year_start) : "—",
      "{{school_year_start}}": t?.school_year_start ? formatDateFrLongSafe(t.school_year_start) : "—",

      "{{SCHOOL_YEAR_END}}": t?.school_year_end ? formatDateFrLongSafe(t.school_year_end) : "—",
      "{{school_year_end}}": t?.school_year_end ? formatDateFrLongSafe(t.school_year_end) : "—",

      "{{SALARY_BASE_HTG}}": t?.salary_base_htg != null ? formatHTG(t.salary_base_htg) : "—",
      "{{salary_base_htg}}": t?.salary_base_htg != null ? formatHTG(t.salary_base_htg) : "—",

      "{{SALARY_CATEGORY_NAME}}": t?.salary_category_name || "—",
      "{{salary_category_name}}": t?.salary_category_name || "—",

      "{{REFERENCE_STUDENTS}}": salarySettings?.reference_students != null ? String(salarySettings.reference_students) : "—",
      "{{reference_students}}": salarySettings?.reference_students != null ? String(salarySettings.reference_students) : "—",

      "{{DATE_SIGNATURE}}": formatDateFrLongSafe(new Date()),
      "{{date_signature}}": formatDateFrLongSafe(new Date()),

      "{{SIGNATURE_TEACHER}}": `<div style="display:inline-block;width:300px;height:70px;border:1px dashed #999;color:#666;display:flex;align-items:center;justify-content:center;">(signature)</div>`,
      "{{signature_teacher}}": `<div style="display:inline-block;width:300px;height:70px;border:1px dashed #999;color:#666;display:flex;align-items:center;justify-content:center;">(signature)</div>`,
   
      "{{contract_start_fr}}": startFr,
  "{{contract_end_fr}}": endFr,
  "{{contract_city}}": city,
  "{{contract_signed_date_fr}}": signedFr,

  // optional: uppercase variants too (if your template changes later)
  "{{CONTRACT_START_FR}}": startFr,
  "{{CONTRACT_END_FR}}": endFr,
  "{{CONTRACT_CITY}}": city,
  "{{CONTRACT_SIGNED_DATE_FR}}": signedFr,
    };


    // Replace all placeholders
    Object.entries(replacements).forEach(([k, v]) => {
  // turn "{{contract_start_fr}}" into a regex that matches:
  // {{contract_start_fr}}  OR  {{ contract_start_fr }}  (with spaces)
  const key = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex
  const pattern = key.replace("\\{\\{", "\\{\\{\\s*").replace("\\}\\}", "\\s*\\}\\}");
  h = h.replace(new RegExp(pattern, "g"), String(v));
});


    return wrapPreview(h);
    }, [html, showPlaceholders, selectedTeacherId, teachers, salarySettings]);

  function wrapPreview(inner) {
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{font-family: Poppins, Segoe UI, Roboto, Arial, sans-serif; padding:16px; color:#111; line-height:1.55; font-size:14px;}
  h1,h2,h3{color:#001f5c;}
  table{width:100%; border-collapse:collapse;}
  td,th{border:1px solid #ddd; padding:6px;}
  .muted{color:#666;}
</style>
</head>
<body>
${inner || `<div class="muted"><i>(Aucun HTML)</i></div>`}
</body>
</html>`;
  }

  async function fetchTemplates() {
    setUiError("");
    setUiOk("");
    setLoading(true);

    const { data, error } = await supabase
      .from("teacher_contract_templates")
      .select("id, created_at, is_active, version, title, html_template")
      .order("created_at", { ascending: false });

    if (error) {
      setUiError(error.message || String(error));
      setTemplates([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }

      setTemplates(data || []);

    // Auto-select active template, else first
    const active = (data || []).find((t) => t.is_active);
    const pick = active?.id || (data?.[0]?.id ?? null);
    setSelectedId(pick);

    setLoading(false);
  }

    async function fetchTeachersForContracts() {
  setUiError("");

  // 1) Read contracts (include created_at so we can pick latest per teacher)
  const { data: contracts, error } = await supabase
    .from("teacher_contracts")
    .select("teacher_id, status, school_year_start, school_year_end, teacher_id_number, teacher_nif_cin, payload, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    setTeachers([]);
    throw error;
  }

    // ✅ Build fallback maps: latest NON-empty salary fields per teacher (scan in created_at desc order)
const lastNonEmptyCategoryByTeacher = {};
const lastNonNullBaseByTeacher = {};

for (const c of contracts || []) {
  const tid = c?.teacher_id;
  if (!tid) continue;

  const p = c.payload || {};

  if (lastNonEmptyCategoryByTeacher[tid] == null && p.salary_category_name) {
    lastNonEmptyCategoryByTeacher[tid] = p.salary_category_name;
  }

  if (lastNonNullBaseByTeacher[tid] == null && p.salary_base_htg != null) {
    lastNonNullBaseByTeacher[tid] = p.salary_base_htg;
  }
}


  const teacherIds = Array.from(
    new Set((contracts || []).map((c) => c.teacher_id).filter(Boolean))
  );

  // 2) Fetch teacher identity from profiles (source of truth for dropdown label)
  let profilesById = {};
  if (teacherIds.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, address")
      .in("id", teacherIds);

    if (!pErr && profs?.length) {
      profilesById = Object.fromEntries(profs.map((p) => [p.id, p]));
    }
  }

  // 3) Build rows, but keep ONLY the latest contract per teacher_id
  const seen = new Set();
  const rows = [];

  for (const r of contracts || []) {
    if (!r?.teacher_id) continue;
    if (seen.has(r.teacher_id)) continue; // ✅ dedupe (keep first = latest because sorted desc)
    seen.add(r.teacher_id);

    const p = r.payload || {};
    const prof = profilesById[r.teacher_id] || {};

    rows.push({
      teacher_id: r.teacher_id,
      status: r.status,
      school_year_start: r.school_year_start,
      school_year_end: r.school_year_end,

      teacher_id_number: r.teacher_id_number || p.teacher_id_number || "",
      teacher_nif_cin: r.teacher_nif_cin || p.teacher_nif_cin || "",

      // ✅ prefer profiles, fallback to payload
      teacher_full_name: prof.full_name || p.teacher_full_name || "",
      teacher_address: prof.address || p.teacher_address || "",
      teacher_email: prof.email || p.teacher_email || "",
      teacher_phone: prof.phone || p.teacher_phone || "",

salary_base_htg:
  p.salary_base_htg ?? lastNonNullBaseByTeacher[r.teacher_id] ?? null,

salary_category_name:
  p.salary_category_name || lastNonEmptyCategoryByTeacher[r.teacher_id] || "",

    });
  }

  setTeachers(rows);

  console.log(
  "Teachers missing salary_category_name:",
  rows.filter((x) => !x.salary_category_name).map((x) => ({
    teacher_id: x.teacher_id,
    teacher_full_name: x.teacher_full_name,
    status: x.status,
  }))
);


  // auto-pick first teacher if none selected yet
  if (!selectedTeacherId && rows.length) {
    setSelectedTeacherId(rows[0].teacher_id);
  }
}


  async function fetchSalarySettings() {
    setUiError("");

    const { data, error } = await supabase
      .from("salary_settings")
      .select("reference_students")
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    setSalarySettings({
      reference_students: data?.reference_students ?? null,
    });
  }


    useEffect(() => {
    (async () => {
      try {
        await fetchTemplates();
        await fetchTeachersForContracts();
        await fetchSalarySettings();
      } catch (e) {
        setUiError(e.message || String(e));
      }
    })();
  }, []); // eslint-disable-line


  // whenever selected changes, load into editor
  useEffect(() => {
    setUiError("");
    setUiOk("");
    if (!selected) return;

    setVersion(selected.version || "");
    setTitle(selected.title || "Contrat de travail – Professeur de natation");
    setHtml(selected.html_template || "");
  }, [selectedId]); // eslint-disable-line

  useEffect(() => {
  if (!selectedTeacher) return;
  setContractStartOverride(selectedTeacher.school_year_start || "");
  setContractEndOverride(selectedTeacher.school_year_end || "");
}, [selectedTeacherId]); // eslint-disable-line


  function isDirty() {
    if (!selected) return false;
    return (
      String(version || "") !== String(selected.version || "") ||
      String(title || "") !== String(selected.title || "") ||
      String(html || "") !== String(selected.html_template || "")
    );
  }

  async function handleSaveEdits() {
    setUiError("");
    setUiOk("");

    if (!selectedId) return setUiError("Aucun template sélectionné.");
    if (!version?.trim()) return setUiError("Version est requise.");
    if (!title?.trim()) return setUiError("Titre est requis.");
    if (!html?.trim()) return setUiError("HTML template est requis.");

    try {
      setSaving(true);

      const { error } = await supabase
        .from("teacher_contract_templates")
        .update({
          version: version.trim(),
          title: title.trim(),
          html_template: html,
        })
        .eq("id", selectedId);

      if (error) throw error;

      setUiOk("✅ Template sauvegardé.");
      await fetchTemplates();
      // keep selection
      setSelectedId(selectedId);
    } catch (e) {
      setUiError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateNewVersion() {
    setUiError("");
    setUiOk("");

    if (!version?.trim()) return setUiError("Veuillez saisir une version (ex: v2).");
    if (!title?.trim()) return setUiError("Titre requis.");
    if (!html?.trim()) return setUiError("HTML template requis.");

    try {
      setSaving(true);

      // 1) Deactivate all
      const { error: deactErr } = await supabase
        .from("teacher_contract_templates")
        .update({ is_active: false })
        .eq("is_active", true);

      if (deactErr) throw deactErr;

      // 2) Insert new row active=true
      const { data: inserted, error: insErr } = await supabase
        .from("teacher_contract_templates")
        .insert([
          {
            is_active: true,
            version: version.trim(),
            title: title.trim(),
            html_template: html,
          },
        ])
        .select("id")
        .single();

      if (insErr) throw insErr;

      setUiOk("✅ Nouvelle version créée et activée.");
      await fetchTemplates();
      setSelectedId(inserted?.id || null);
    } catch (e) {
      // if version unique constraint exists, surface it clearly
      const msg = e?.message || String(e);
      setUiError(msg.includes("duplicate key") ? "Cette version existe déjà. Choisissez une autre version." : msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive(id) {
    setUiError("");
    setUiOk("");

    if (!id) return;

    try {
      setSaving(true);

      // deactivate all
      const { error: deactErr } = await supabase
        .from("teacher_contract_templates")
        .update({ is_active: false })
        .eq("is_active", true);
      if (deactErr) throw deactErr;

      // activate selected
      const { error: actErr } = await supabase
        .from("teacher_contract_templates")
        .update({ is_active: true })
        .eq("id", id);
      if (actErr) throw actErr;

      setUiOk("✅ Template activé.");
      await fetchTemplates();
      setSelectedId(id);
    } catch (e) {
      setUiError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-aquaBlue">Templates — Contrats Professeurs</h2>
          <p className="text-sm text-gray-500">
            Gérer le template HTML utilisé pour générer les contrats PDF.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTemplates}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
            disabled={loading || saving}
          >
            Rafraîchir
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: templates list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">Versions</h3>
            <span className="text-xs text-gray-500">{templates.length} template(s)</span>
          </div>

          {loading ? (
            <p className="text-gray-500 italic">Chargement…</p>
          ) : templates.length === 0 ? (
            <p className="text-gray-500 italic">Aucun template.</p>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
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
                      <div className="font-semibold text-gray-800 truncate">
                        {t.version || "—"}
                      </div>
                      {active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{t.title}</div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      {formatDateTimeFrSafe(t.created_at)}
                    </div>

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
                        Activer
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* MIDDLE: editor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-semibold text-gray-800">Éditeur</h3>

              <div className="flex items-center gap-2 flex-wrap">
  {/* Teacher dropdown */}
  <select
    className="border rounded-lg px-2 py-1 text-sm"
    value={selectedTeacherId}
    onChange={(e) => setSelectedTeacherId(e.target.value)}
  >
    <option value="">— Choisir un professeur —</option>
    {teachers.map((t) => (
      <option key={t.teacher_id} value={t.teacher_id}>
        {t.teacher_full_name || t.teacher_email || "—"}
        {t.salary_category_name ? ` — ${t.salary_category_name}` : ""}
      </option>
    ))}
  </select>

  <input
  type="date"
  className="border rounded-lg px-2 py-1 text-sm"
  value={contractStartOverride}
  onChange={(e) => setContractStartOverride(e.target.value)}
/>

<input
  type="date"
  className="border rounded-lg px-2 py-1 text-sm"
  value={contractEndOverride}
  onChange={(e) => setContractEndOverride(e.target.value)}
/>


  <label className="text-xs text-gray-600 flex items-center gap-2">
    <input
      type="checkbox"
      checked={showPlaceholders}
      onChange={(e) => setShowPlaceholders(e.target.checked)}
    />
    Remplir placeholders (preview)
  </label>

  <select
    className="border rounded-lg px-2 py-1 text-sm"
    value={previewMode}
    onChange={(e) => setPreviewMode(e.target.value)}
  >
    <option value="iframe">Preview iframe</option>
    <option value="inline">Preview inline</option>
  </select>
</div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
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
                <label className="block text-sm text-gray-600 mb-1">Titre</label>
                <input
                  className="w-full border rounded-lg px-3 py-2"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm text-gray-600 mb-1">HTML Template</label>
              <textarea
                className="w-full border rounded-xl px-3 py-2 font-mono text-xs min-h-[320px]"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="Collez votre HTML ici…"
              />
              <div className="text-xs text-gray-500 mt-2">
                Placeholders suggérés:{" "}
                <span className="font-mono">
                  {"{{TEACHER_FULL_NAME}} {{TEACHER_ADDRESS}} {{TEACHER_NIF_CIN}} {{TEACHER_ID_NUMBER}} {{SCHOOL_YEAR_START}} {{SCHOOL_YEAR_END}} {{SALARY_BASE_HTG}} {{SALARY_CATEGORY_NAME}} {{REFERENCE_STUDENTS}} {{SIGNATURE_TEACHER}} {{DATE_SIGNATURE}}"}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                onClick={() => {
                  if (!selected) return;
                  setVersion(selected.version || "");
                  setTitle(selected.title || "");
                  setHtml(selected.html_template || "");
                  setUiOk("Rechargé depuis DB.");
                  setUiError("");
                }}
                disabled={saving || loading}
              >
                Annuler changements
              </button>

              <button
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                onClick={handleSaveEdits}
                disabled={saving || loading || !selectedId || !isDirty()}
                title={!isDirty() ? "Aucun changement" : ""}
              >
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>

              <button
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
                onClick={handleCreateNewVersion}
                disabled={saving || loading || !html?.trim() || !version?.trim()}
              >
                {saving ? "Création..." : "Créer nouvelle version (active)"}
              </button>
            </div>
          </div>

          {/* RIGHT: preview */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Preview</h3>

            {previewMode === "iframe" ? (
              <iframe
                title="preview"
                className="w-full h-[70vh] rounded-xl border"
                sandbox="allow-same-origin"
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
  );
}
