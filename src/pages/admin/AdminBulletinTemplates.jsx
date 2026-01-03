// src/pages/admin/AdminBulletinTemplates.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatMonth, formatDateFrSafe } from "../../lib/dateUtils";

const REQUIRED_TOKENS = [
  "{{student_name}}",
  "{{month}}",
  "{{academic_year}}",
  "{{weekly_technical_rows}}",
  "{{weekly_behavior_rows}}",
  "{{weekly_attitude_rows}}",
  "{{general_appreciation_row}}",
  "{{logo_url}}",
  "{{signature_url}}",
  "{{weekday_label}}",
];

export default function AdminBulletinTemplates() {
  const [templateId, setTemplateId] = useState(null);
  const [name, setName] = useState("Default Bulletin Template");
  const [body, setBody] = useState(getStarterTemplate());
  const [status, setStatus] = useState("");
  const [summaries, setSummaries] = useState([]);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [weeklySessions, setWeeklySessions] = useState([]);

  // --- Load summaries ---
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("bulletin_monthly_summary")
        .select(`
          id, student_id, student_name, month, academic_year,
          general_appreciation
        `)
        .order("month", { ascending: false })
        .limit(30);
      if (!error) {
        setSummaries(data || []);
        if (data?.length) setSelectedSummary(data[0]);
      }
    })();
  }, []);

  // --- Load templates ---
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("bulletin_templates")
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

  // --- Load weekly sessions ---
  useEffect(() => {
    if (!selectedSummary) return setWeeklySessions([]);
    (async () => {
      const { month } = selectedSummary;
      const m = new Date(month);
      const start = new Date(m.getFullYear(), m.getMonth(), 1);
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const { data, error } = await supabase
        .from("bulletin_sessions")
        .select("*")
        .eq("student_id", selectedSummary.student_id)
        .gte("date", start.toISOString().slice(0, 10))
        .lt("date", end.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (!error) setWeeklySessions(data || []);
    })();
  }, [selectedSummary]);

  const [attendanceSummary, setAttendanceSummary] = useState({ presence: 0, absence: 0, retard: 0 });

// --- Load monthly attendance summary ---
useEffect(() => {
  if (!selectedSummary) return;

  (async () => {
    const { student_id, month } = selectedSummary;

    // Convert month string from summary into YYYY-MM-01 format
    const m = new Date(month); 
    const monthKey = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("attendance_monthly_summary")
      .select("profile_id, presents, absents, retards")
      .eq("profile_id", student_id)      // correct column
      .eq("month", monthKey);            // correct format

    if (error) {
      console.error(error);
      return;
    }

    if (data && data.length > 0) {
      const row = data[0];
      setAttendanceSummary({
        presence: row.presents ?? 0,
        absence: row.absents ?? 0,
        retard: row.retards ?? 0,
      });
    } else {
      setAttendanceSummary({ presence: 0, absence: 0, retard: 0 });
    }
  })();
}, [selectedSummary]);




  const previewData = useMemo(
    () =>
      selectedSummary && {
        student_name: selectedSummary.student_name,
        month: selectedSummary.month,
        academic_year: selectedSummary.academic_year,
        weekly: weeklySessions,
        attendance: attendanceSummary,
      },
    [selectedSummary, weeklySessions, attendanceSummary]
  );

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
      ? supabase.from("bulletin_templates").update({ name, body }).eq("id", templateId)
      : supabase.from("bulletin_templates").insert({ name, body });
    const { error } = await up;
    setStatus(error ? `Error: ${error.message}` : "Saved ✅");
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, padding: 24 }}>
      <div>
        <h1>Bulletin Template Editor</h1>
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

        <select
          className="border rounded px-2 py-1 w-full"
          value={selectedSummary?.id || ""}
          onChange={(e) =>
            setSelectedSummary(summaries.find((x) => x.id === e.target.value))
          }
        >
          {summaries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.student_name} - {formatMonth(s.month)}
            </option>
          ))}
        </select>
        <input
  type="text"
  value={name}
  onChange={(e) => setName(e.target.value)}
  placeholder="Template name"
  className="border rounded px-2 py-1 w-full mb-2"
/>


        <textarea
          rows={24}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: "100%", fontFamily: "monospace", padding: 12, marginTop: 12 }}
        />

        {missingTokens.length > 0 && (
          <p style={{ color: "#b91c1c" }}>Missing: {missingTokens.join(", ")}</p>
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
          style={{ width: "100%", height: "85vh", border: "1px solid #ddd", borderRadius: 8 }}
          srcDoc={compiledHtml}
        />
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  return `<tr><td>${escapeHtml(formatDateFrSafe(date))}</td>${cells.map(td).join("")}</tr>`;
}

function buildSection(rows, keys) {
  const rowsHtml = rows.map((r) => rowTR(r.date, keys.map((k) => r[k]))).join("");
  const colAvg = keys.map((k) => average(rows.map((r) => r[k])));
  const secAvg = average(colAvg);
  const avgRows =
    `<tr class='total-row'><td><strong>Moyenne par Critère</strong></td>${colAvg
      .map((a) => `<td>${a}</td>`)
      .join("")}</tr>` +
    `<tr class='total-row'><td><strong>Moyenne Section</strong></td><td colspan='${keys.length}'>${secAvg}</td></tr>`;
  return { rowsHtml, avgRows, secAvg };
}

function compileTemplate(html, data) {
  const esc = (s) => escapeHtml(String(s ?? ""));
  const weekly = data.weekly || [];
  const weekdayLabel =
    weekly.length > 0 && weekly[0].date
      ? new Date(weekly[0].date)
          .toLocaleDateString("fr-FR", { weekday: "long" })
          .replace(/^\w/, (c) => c.toUpperCase())
      : "";

  // === SECTION ORDER ===
  const att = buildSection(weekly, [
    "esprit_equipe",
    "performance",
    "estime_de_soi",
    "perseverance",
    "discipline",
  ]);
  const beh = buildSection(weekly, ["attentif", "maitrise", "reaction"]);
  const tech = buildSection(weekly, [
    "respiration",
    "flottage",
    "battement",
    "posture",
    "devoirs",
  ]);

  const gen = average([att.secAvg, beh.secAvg, tech.secAvg]);

  // === COLOR MAPPING ===
  const gradeColors = {
    E: "#00b050",
    TB: "#92d050",
    B: "#ffff00",
    AB: "#ffc000",
    A: "#ff8c00",
    P: "#ff0000",
  };
  const color = gradeColors[gen] || "#ffffff";
  const pres = data.attendance?.presence ?? 0;
  const abs = data.attendance?.absence ?? 0;
  const ret = data.attendance?.retard ?? 0;


  return html
    .replaceAll("{{weekday_label}}", esc(weekdayLabel))
    .replaceAll("{{student_name}}", esc(data.student_name))
    .replaceAll("{{month}}", esc(formatMonth(data.month)))
    .replaceAll("{{academic_year}}", esc(data.academic_year))
    .replaceAll("{{weekly_attitude_rows}}", att.rowsHtml + att.avgRows)
    .replaceAll("{{weekly_behavior_rows}}", beh.rowsHtml + beh.avgRows)
    .replaceAll("{{weekly_technical_rows}}", tech.rowsHtml + tech.avgRows)
    .replaceAll(
      "{{general_appreciation_row}}",
      `<table class="appreciation-table">
        <tr>
          <td class="label">Appréciation Générale</td>
          <td class="grade" style="background:${color};color:#000;font-weight:600;">
            ${esc(gen)}
          </td>
        </tr>
      </table>`
    )
    .replaceAll("{{signature_url}}", esc("/Signature/signature.png"))
    .replaceAll("{{logo_url}}", esc("/logo/aquador.png"))
    .replaceAll("{{presence_count}}", pres)
    .replaceAll("{{absence_count}}", abs)
    .replaceAll("{{retard_count}}", ret)

}

function getStarterTemplate() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');
body{font-family:'Poppins',sans-serif;background:#fff;color:#333;margin:0;-webkit-print-color-adjust:exact;}
.page{width:850px;margin:0 auto;padding:24px 32px;background:#fff;border-radius:8px;box-shadow:0 0 8px rgba(0,0,0,0.1);}
.header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  border-bottom: px solid #00bfff;
  margin-bottom: 15px;
}

.header-left {
  flex: 0 0 25%;
  text-align: left;
  padding:4px;
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

.logo{position:absolute;left:0;top:0;width:100px;}
.header h1{margin:0;font-size:28px;color:#fffffff;}
.header h2{font-weight:0;font-size:16px;color:#001f5c;margin:5px 0 0; }
.student-info-table {
  width: 100%;1
  border-collapse: collapse;
  margin-bottom: 1px;
  font-size: 14px;
}

.student-info-table th,
.student-info-table td {
  border: 1px solid #000;
  padding: 6px 8px;
  text-align: center;
}

.student-info-table th {
  background: #001f5c; /* deep navy blue */
  color: white;
  font-weight: 600;
  text-align: center;
}

.student-info-table td {
  background: #fff;
  color: #000;
  font-weight: 500;
}

.legend {
  display: inline-block;           /* shrink to fit text width */
  background: #e6f7ff;
  border: 1px solid #00bfff;
  padding: 6px 16px;
  font-size: 13px;
  color: #005a80;
  margin: 0 auto 1px auto;        /* center horizontally */
  border-radius: 6px;
  text-align: center;
  position: relative;
  left: 50%;
  transform: translateX(-50%);     /* ensure perfect centering */
}

.section{margin-top:25px;}
.section-title1{background:#001f5c;color:white;font-weight:600;text-transform:uppercase;text-align:center;padding:6px;letter-spacing:0.5px;border-radius:4px 4px 0 0;}
.section-title2{width: 97.8%;background:#fa9849ff;color:white;font-weight:600;text-transform:uppercase;text-align:center;padding:6px;letter-spacing:0.5px;border-radius:4px 4px 0 0;}
.section-title3{background:#4cbdf1ff;color:white;font-weight:600;text-transform:uppercase;text-align:center;padding:6px;letter-spacing:0.5px;border-radius:4px 4px 0 0;}
.section-title4{background:#001f5c;color:white;font-weight:600;text-transform:uppercase;text-align:center;padding:6px;letter-spacing:0.5px;border-radius:4px 4px 0 0;}
.scores-table1{width:100%;border-collapse:collapse;}
.scores-table1 th,.scores-table1 td{border:1px solid #bbb;padding:3px 8px;font-size:13px;text-align:center;}
.scores-table1 th{background:#fffffff;color:#004e75;}
.scores-table1 tbody tr:nth-child(odd){background:#3391b6ff; color:#fafafa;}
.scores-table2{width:100%;border-collapse:collapse;}
.scores-table2 th,.scores-table2 td{border:1px solid #bbb;padding:3px 8px;font-size:13px;text-align:center;}
.scores-table2 th{background:#fffffff;color:#004e75;}
.scores-table2 tbody tr:nth-child(odd){background:#fcdbabff; color:#3391b6ff;}
.scores-table3{width:100%;border-collapse:collapse;}
.scores-table3 th,.scores-table3 td{border:1px solid #bbb;padding:3px 8px;font-size:13px;text-align:center;}
.scores-table3 th{background:#fffffff;color:#004e75;}
.scores-table3 tbody tr:nth-child(odd){background:#d1f1ffff; color:#3391b6ff;}
.scores-table4{width:100%;border-collapse:collapse;}
.scores-table4 th,.scores-table4 td{border:1px solid #bbb;padding:3px 8px;font-size:13px;text-align:center;}
.scores-table4 th{background:#fffffff;color:#004e75;}
.scores-table4 tbody tr:nth-child(odd){background:#d1f1ffff; color:#3391b6ff;}
.presence-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-top: 0;
}

.presence-table th,
.presence-table td {
  border: 1px solid #bbb;
  padding: 4px 8px;
  text-align: center;
}

.presence-table th {
  background: #fa9849ff;
  color: #fff;
  font-weight: 600;
}

.presence-table td {
  background: #fff;
  font-weight: 500;
  color: #333;
  width: 50%;
}

.total-row td{background:#e6f7ff;font-weight:600;color:#004e75;}
.appreciation-table{width:100%;border-collapse:collapse;margin-top:32px;}
.appreciation-table td{border:1px solid #bbb;padding:10px;font-size:14px;}
.appreciation-table .label{width:70%;font-weight:600;background:#e6f7ff;text-align:center;}
.appreciation-table .grade{text-align:center;width:30%;}
.signature{text-align:center;margin-top:35px;}
.signature img{width:180px;margin:0 auto 6px;display:block;}
.signature-line{border-top:1px solid #000;width:180px;margin:1px auto;}
/* === COMPORTEMENT + PRESENCE SECTION LAYOUT === */
.section.comportement-section {
  display: flex;
  justify-content: space-between;
  align-items: center; /* centers Présence vertically */
  gap: 40px; /* nice breathing space */
}

/* Optional: replace your inline flex with this cleaner class */
.section.comportement-section > div:first-child {
  flex: 2;
}

.section.comportement-section > div:last-child {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;   /* centers horizontally in white space */
  justify-content: center; /* centers vertically with Comportement table */
  margin-right: -20px; /* pushes away from right edge slightly */
}

.section-title4 {
  background: #001f5c;
  color: white;
  font-weight: 600;
  text-transform: uppercase;
  text-align: center;
  padding: 6px;
  border-radius: 4px 4px 0 0;
  width: 76%; /* matches table width */
  margin-bottom: 0;
}

.scores-table4 {
  width: 80%; /* keeps both centered and proportional */
  border-collapse: collapse;
  font-size: 13px;
}

.scores-table4 th,
.scores-table4 td {
  border: 1px solid #bbb;
  padding: 4px 8px;
  text-align: center;
}

.scores-table4 th {
  background: #e6f7ff;
  color: #004e75;
  font-weight: 600;
}

.scores-table4 td {
  background: #fff;
  color: #333;
  font-weight: 500;
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
    <h1>Bulletin</h1>
  </div>
</div>

  <table class="student-info-table">
  <colgroup>
    <col style="width: 30%">
    <col style="width: 30%">
    <col style="width: 20%">
    <col style="width: 20%">
  </colgroup>
  <tr>
    <th colspan="2">Nom de l'élève</th>
    <th colspan="1">Mois</th>
    <td>{{month}}</td>
  </tr>
  <tr>
    <td colspan="2">{{student_name}}</td>
    <th>Année Académique</th>
    <td>{{academic_year}}</td>
  </tr>
</table>



  <!-- 1. Attitude -->
  <div class="section">
    <div class="section-title1">Attitude</div>
    <table class="scores-table1">
      <thead>
        <tr>
          <th>Date ({{weekday_label}})</th>
          <th>Esprit d'Équipe</th>
          <th>Performance</th>
          <th>Estime de soi</th>
          <th>Persévérance</th>
          <th>Discipline</th>
        </tr>
      </thead>
      <tbody>{{weekly_attitude_rows}}</tbody>
    </table>
  </div>

  <!-- 2. Comportement + Présence -->
<div class="section comportement-section">

  <div style="flex:2;">
    <div class="section-title2">Comportement</div>
    <table class="scores-table2">
      <thead>
        <tr>
          <th>Date ({{weekday_label}})</th>
          <th>Attentif</th>
          <th>Maîtrise</th>
          <th>Réaction</th>
        </tr>
      </thead>
      <tbody>{{weekly_behavior_rows}}</tbody>
    </table>
  </div>

  <div style="flex:1;">
    <div class="section-title4">Présence (4 jours)</div>
    <table class="scores-table4">
      <tr><th>Présence</th><td>{{presence_count}}</td></tr>
      <tr><th>Absence</th><td>{{absence_count}}</td></tr>
      <tr><th>Retard</th><td>{{retard_count}}</td></tr>
    </table>
  </div>
</div>

  <!-- 3. Habileté Technique -->
  <div class="section">
    <div class="section-title3">Habileté Technique</div>
    <table class="scores-table3">
      <thead>
        <tr>
          <th>Date ({{weekday_label}})</th>
          <th>Respiration</th>
          <th>Flottage</th>
          <th>Battement</th>
          <th>Posture</th>
          <th>Devoirs</th>
        </tr>
      </thead>
      <tbody>{{weekly_technical_rows}}</tbody>
    </table>
  </div>

  {{general_appreciation_row}}
<br>
<div class="legend">
    <strong>Barème :</strong>
    E : Excellent | TB : Très Bien | B : Bien | AB : Assez Bien | A : À améliorer | P : Passable
  </div>

  <div class="signature">
    <img src="{{signature_url}}" alt="Signature"/>
    <div class="signature-line"></div>
    <p>Directeur</p>
  </div>
</div>
</body>
</html>`;
}
