// src/pages/admin/AdminFicheTechniqueTemplates.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe, formatMonth} from "../../lib/dateUtils";

const REQUIRED_TOKENS = [
  "{{student_name}}",
  "{{age}}",
  "{{month}}",
  "{{academic_year}}",
  "{{long_bras_gauche}}",
  "{{long_bras_droit}}",
  "{{long_pied_gauche}}",
  "{{long_pied_droit}}",
  "{{saut_avec}}",
  "{{saut_elan_bras_droit}}",
  "{{saut_stable_bras_gauche}}",
  "{{saut_stable_bras_droit}}",
  "{{largeur_ventre}}",
  "{{taille}}",
  "{{poids_lbs}}",
  "{{saut_stable_deux_bras}}",
  "{{logo_url}}",
  "{{signature_url}}",
];

export default function AdminFicheTechniqueTemplates() {
  const [templateId, setTemplateId] = useState(null);
  const [name, setName] = useState("Default Fiche Technique Template");
  const [body, setBody] = useState(getStarterTemplate());
  const [status, setStatus] = useState("");
  const [fiches, setFiches] = useState([]);
  const [selectedFiche, setSelectedFiche] = useState(null);
  const [templates, setTemplates] = useState([]);

  // === Load saved fiche_technique entries (for preview data) ===
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("fiche_technique")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!error) {
        setFiches(data || []);
        if (data?.length) setSelectedFiche(data[0]);
      }
    })();
  }, []);

  // === Load templates ===
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("fiche_templates")
        .select("id, name, body, updated_at")
        .order("updated_at", { ascending: false });
      if (!error && data) {
        setTemplates(data);
        if (data.length > 0) {
          setTemplateId(data[0].id);
          setName(data[0].name);
          setBody(data[0].body);
        }
      }
    })();
  }, []);

  const previewData = useMemo(() => selectedFiche || {}, [selectedFiche]);

  const compiledHtml = useMemo(
    () => (previewData ? compileTemplate(body, previewData) : body),
    [body, previewData]
  );

  const missingTokens = useMemo(
    () => REQUIRED_TOKENS.filter((t) => !body.includes(t)),
    [body]
  );

  const onSave = async () => {
    setStatus("Saving...");
    const up = templateId
      ? supabase.from("fiche_templates").update({ name, body }).eq("id", templateId)
      : supabase.from("fiche_templates").insert({ name, body });
    const { error } = await up;
    setStatus(error ? `Error: ${error.message}` : "Saved ✅");
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        padding: 24,
      }}
    >
      <div>
        <h1>Fiche Technique Template Editor</h1>

        {/* Template selector */}
        <select
          className="border rounded px-2 py-1 w-full mb-2"
          value={templateId || ""}
          onChange={(e) => {
            const selected = templates.find((t) => t.id === e.target.value);
            if (selected) {
              setTemplateId(selected.id);
              setName(selected.name);
              setBody(selected.body);
            }
          }}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {/* Fiche selector */}
        <select
          className="border rounded px-2 py-1 w-full mb-2"
          value={selectedFiche?.id || ""}
          onChange={(e) =>
            setSelectedFiche(fiches.find((x) => x.id === e.target.value))
          }
        >
          {fiches.map((f) => (
            <option key={f.id} value={f.id}>
              {f.student_name} — {formatMonth(f.month)}
            </option>
          ))}
        </select>

        {/* Template name */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="border rounded px-2 py-1 w-full mb-2"
        />

        {/* HTML Editor */}
        <textarea
          rows={24}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{
            width: "100%",
            fontFamily: "monospace",
            padding: 12,
            marginTop: 12,
          }}
        />

        {missingTokens.length > 0 && (
          <p style={{ color: "#b91c1c" }}>
            Missing: {missingTokens.join(", ")}
          </p>
        )}

        <button
          onClick={onSave}
          style={{
            marginTop: 12,
            padding: "10px 16px",
            background: "#059669",
            color: "#fff",
            border: 0,
            borderRadius: 6,
          }}
        >
          Save
        </button>
        {status && <p>{status}</p>}
      </div>

      <div>
        <h2>Live Preview</h2>
        <iframe
          title="preview"
          style={{
            width: "100%",
            height: "85vh",
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
          srcDoc={compiledHtml}
        />
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function compileTemplate(html, data) {
  const esc = (v) => escapeHtml(String(v ?? ""));
  return html
    .replaceAll("{{student_name}}", esc(data.student_name))
    .replaceAll("{{age}}", esc(data.age))
    .replaceAll("{{month}}", esc(formatMonth(data.month)))
    .replaceAll("{{academic_year}}", esc(data.academic_year))
    .replaceAll("{{long_bras_gauche}}", esc(data.long_bras_gauche))
    .replaceAll("{{long_bras_droit}}", esc(data.long_bras_droit))
    .replaceAll("{{long_pied_gauche}}", esc(data.long_pied_gauche))
    .replaceAll("{{long_pied_droit}}", esc(data.long_pied_droit))
    .replaceAll("{{saut_avec}}", esc(data.saut_avec))
    .replaceAll("{{saut_elan_bras_droit}}", esc(data.saut_elan_bras_droit))
    .replaceAll("{{saut_stable_bras_gauche}}", esc(data.saut_stable_bras_gauche))
    .replaceAll("{{saut_stable_bras_droit}}", esc(data.saut_stable_bras_droit))
    .replaceAll("{{largeur_ventre}}", esc(data.largeur_ventre))
    .replaceAll("{{taille}}", esc(data.taille))
    .replaceAll("{{poids_lbs}}", esc(data.poids_lbs))
    .replaceAll("{{saut_stable_deux_bras}}", esc(data.saut_stable_deux_bras))
    .replaceAll("{{logo_url}}", esc("/logo/aquador.png"))
    .replaceAll("{{signature_url}}", esc("/Signature/signature.png"));
}

/* ---------- Default HTML template ---------- */
function getStarterTemplate() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');
body {
  font-family: 'Poppins', sans-serif;
  background: #fff;
  color: #333;
  margin: 0;
  -webkit-print-color-adjust: exact;
}
.page {
  width: 850px;
  margin: 0 auto;
  padding: 24px 32px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 0 8px rgba(0,0,0,0.1);
}
.header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  border-bottom: 1px solid #00bfff;
  margin-bottom: 15px;
}
.header-left {
  flex: 0 0 25%;
  text-align: left;
  padding: 4px;
  border: 1px solid #001f5c;
}
.header-left img {
  height: 90px;
  width: auto;
}
.header-right {
  flex: 1;
  background: #001f5c;
  color: white;
  padding: 35px;
  text-align: center;
  border-radius: 0 4px 4px 0;
}
.header-right h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
}
.student-info-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 14px;
}
.student-info-table th, .student-info-table td {
  border: 1px solid #000;
  padding: 6px 8px;
  text-align: center;
}
.student-info-table th {
  background: #001f5c;
  color: white;
  font-weight: 600;
}
.section-title {
  background: #001f5c;
  color: white;
  font-weight: 600;
  text-transform: uppercase;
  text-align: center;
  padding: 6px;
  border-radius: 4px 4px 0 0;
  margin-top: 24px;
  letter-spacing: 0.5px;
}
.measure-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.measure-table th, .measure-table td {
  border: 1px solid #004e75;
  padding: 6px;
  text-align: center;
}
.measure-table th {
  background: #e6f7ff;
  color: #004e75;
  font-weight: 600;
}
.measure-table tbody tr:nth-child(odd) {
  background: #f9fbff;
}
.signature {
  text-align: center;
  margin-top: 35px;
}
.signature img {
  width: 180px;
  margin: 0 auto 6px;
  display: block;
}
.signature-line {
  border-top: 1px solid #000;
  width: 180px;
  margin: 1px auto;
}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <img src="{{logo_url}}" alt="Logo A'QUA D'OR" style="height:100px; width:auto;  display:block; margin:0 auto;" />
    </div>
    <div class="header-right">
      <h1>Fiche Technique</h1>
    </div>
  </div>

  <table class="student-info-table">
    <tr>
      <th>Nom de l'élève</th>
      <td>{{student_name}}</td>
      <th>Âge</th>
      <td>{{age}}</td>
    </tr>
    <tr>
      <th>Mois</th>
      <td>{{month}}</td>
      <th>Année Académique</th>
      <td>{{academic_year}}</td>
    </tr>
  </table>

  <div class="section-title">MESURES : en CM</div>
  <table class="measure-table">
    <thead>
      <tr>
        <th>Longueur Bras Gauche</th>
        <th>Longueur Bras Droit</th>
        <th>Longueur Pied Gauche</th>
        <th>Longueur Pied Droit</th>
        <th>Saut avec Élan Bras Gauche </th>
        <th>Saut avec Élan Bras Droit </th>
        <th>Saut stable Bras Gauche</th>
        <th>Saut stable Bras Droit</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>{{long_bras_gauche}}</td>
        <td>{{long_bras_droit}}</td>
        <td>{{long_pied_gauche}}</td>
        <td>{{long_pied_droit}}</td>
        <td>{{saut_avec}}</td>
        <td>{{saut_elan_bras_droit}}</td>
        <td>{{saut_stable_bras_gauche}}</td>
        <td>{{saut_stable_bras_droit}}</td>
      </tr>
      <tr>
        <th>Largeur Ventre</th>
        <td>{{largeur_ventre}}</td>
        <th>Taille</th>
        <td>{{taille}}</td>
        <th>Poids (LBS)</th>
        <td>{{poids_lbs}}</td>
        <th>Saut stable Deux Bras</th>
        <td>{{saut_stable_deux_bras}}</td>
      </tr>
    </tbody>
  </table>

  <div class="signature">
    <img src="{{signature_url}}" alt="Signature"/>
    <div class="signature-line"></div>
    <p>Directeur</p>
  </div>
</div>
</body>
</html>`;
}
