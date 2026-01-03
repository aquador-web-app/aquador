import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatMonth, formatDateFrSafe } from "../../lib/dateUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";

export default function AdminAttendanceReports() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [mode, setMode] = useState("daily"); // 'daily' | 'monthly'
  const [viewMode, setViewMode] = useState("courses"); // 'courses' | 'users'
  const [reportData, setReportData] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleExpand = (key) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // === Fetch report ===
  const fetchReport = async () => {
    setLoading(true);
    setError("");
    try {
      if (mode === "daily") {
        const { data, error } = await supabase.rpc("daily_attendance_summary", { _date: date });
        if (error) throw error;

        // group by course_name + start_time
        let grouped = {};
        for (const c of data || []) {
          const key = `${c.course_name}_${c.start_time || "NA"}`;
          if (!grouped[key]) {
            grouped[key] = { ...c, students: [] };
          }
        }

        // fetch students for each group
        for (const key of Object.keys(grouped)) {
          const [course_name, start_time] = key.split("_");
          const { data: students } = await supabase
            .from("attendance_view")
            .select("student_name, status, course_name, start_time")
            .eq("attended_on", date)
            .eq("course_name", course_name)
            .eq("start_time", start_time === "NA" ? null : start_time)
            .order("student_name", { ascending: true });
          grouped[key].students = students || [];
          grouped[key].total = grouped[key].presents + grouped[key].lates; // ✅ only presence-related total
        }

        const sorted = Object.values(grouped).sort((a, b) =>
          (a.start_time || "").localeCompare(b.start_time || "")
        );
        setReportData(sorted);
      } else {
        // === Monthly ===
const [year, monthNum] = month.split("-");
const { data, error } = await supabase.rpc("monthly_attendance_summary", {
  _year: parseInt(year),
  _month: parseInt(monthNum),
});
if (error) throw error;

// Normalize time and group by (course_name + normalized start_time)
function normalizeTime(t) {
  if (!t) return "NA";
  const parts = t.split(":");
  if (parts.length >= 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  return t;
}

let groupedByCourse = {};
(data || []).forEach((r) => {
  const normTime = normalizeTime(r.start_time);
  const key = `${r.course_name || "Inconnu"}_${normTime}`;

  if (!groupedByCourse[key]) {
    groupedByCourse[key] = {
      course_name: r.course_name,
      start_time: normTime,
      presents: 0,
      lates: 0,
      absents: 0,
      total: 0,
      students: [],
    };
  }

  groupedByCourse[key].presents += r.presents;
  groupedByCourse[key].lates += r.lates;
  groupedByCourse[key].absents += r.absents;
  groupedByCourse[key].total =
    groupedByCourse[key].presents + groupedByCourse[key].lates;
  groupedByCourse[key].students.push(r);
});

const sorted = Object.values(groupedByCourse).sort((a, b) => {
  const toMinutes = (t) => {
    if (!t || t === "NA") return 9999;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const diff = toMinutes(a.start_time) - toMinutes(b.start_time);
  if (diff !== 0) return diff;
  return a.course_name.localeCompare(b.course_name);
});


setReportData(sorted);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // === Export CSV / PDF ===
  const exportCSV = () => {
    if (!reportData.length) return;
    const csv = Papa.unparse(reportData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      mode === "daily"
        ? `Rapport_${date}_${viewMode}.csv`
        : `Rapport_${month.replace("-", "_")}.csv`;
    link.click();
  };

  const exportPDF = () => {
    if (!reportData.length) return;
    const doc = new jsPDF();
    const title =
      mode === "daily"
        ? `Rapport journalier du ${formatDateFrSafe(date)}`
        : `Rapport mensuel de ${formatMonth(new Date(month))}`;
    doc.setFontSize(14);
    doc.text(title, 14, 15);

    if (mode === "monthly" && viewMode === "users") {
      autoTable(doc, {
        startY: 25,
        head: [["Cours", "Élève", "Présents", "Retards", "Absents", "Taux"]],
        body: reportData.flatMap((r) =>
          r.students.map((s) => [
            r.course_name,
            s.full_name,
            s.presents,
            s.lates,
            s.absents,
            `${s.taux_presence}%`,
          ])
        ),
        theme: "grid",
        styles: { fontSize: 10 },
      });
    } else {
      autoTable(doc, {
        startY: 25,
        head: [["Cours", "Heure", "Présents", "Retards", "Absents", "Total"]],
        body: reportData.map((r) => [
          r.course_name,
          r.start_time || "-",
          r.presents,
          r.lates,
          r.absents,
          r.total,
        ]),
        theme: "grid",
        styles: { fontSize: 10 },
      });
    }

    doc.save(
      mode === "daily"
        ? `Rapport_${date}_${viewMode}.pdf`
        : `Rapport_${month.replace("-", "_")}.pdf`
    );
  };

  // === UI ===
  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Rapports de présences</h2>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="border rounded-lg p-2"
        >
          <option value="daily">Journalier</option>
          <option value="monthly">Mensuel</option>
        </select>

        {mode === "daily" ? (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-lg p-2"
          />
        ) : (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded-lg p-2"
          />
        )}

        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          className="border rounded-lg p-2"
        >
          <option value="courses">Par cours</option>
          <option value="users">Par utilisateur</option>
        </select>

        <button
          onClick={fetchReport}
          className="bg-aquaBlue text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Générer le rapport
        </button>

        {reportData.length > 0 && (
          <>
            <button
              onClick={exportPDF}
              className="bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600"
            >
              Export PDF
            </button>
            <button
              onClick={exportCSV}
              className="bg-green-500 text-white px-3 py-2 rounded-lg hover:bg-green-600"
            >
              Export CSV
            </button>
          </>
        )}
      </div>

      {loading && <div className="text-aquaBlue">⏳ Chargement...</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && reportData.length > 0 && (
        <div className="bg-white rounded-2xl shadow p-6 mt-4">
          <h3 className="font-semibold text-lg mb-3">
            {mode === "daily"
              ? `Rapport journalier du ${formatDateFrSafe(date)}`
              : `Rapport mensuel de ${formatMonth(new Date(month))}`}
          </h3>

          {/* === DAILY PAR COURS === */}
{mode === "daily" && viewMode === "courses" && (
  <table className="w-full text-sm border-collapse">
    <thead className="bg-gray-100 text-gray-600">
      <tr>
        <th className="p-2 text-left">Cours</th>
        <th className="p-2 text-center">Heure</th>
        <th className="p-2 text-center">Présents</th>
        <th className="p-2 text-center">Retards</th>
        <th className="p-2 text-center">Absents</th>
        <th className="p-2 text-center">Total</th>
        <th className="p-2 text-center">% Présence</th>
      </tr>
    </thead>
    <tbody>
      {reportData.map((r, i) => {
        const key = `${r.course_name}_${r.start_time}`;
        const totalAll = r.presents + r.lates + r.absents;
        const tauxPresence =
          totalAll > 0 ? (((r.presents + r.lates) / totalAll) * 100).toFixed(1) : "0.0";
        return (
          <>
            <tr
              key={key}
              className="border-t hover:bg-gray-50 cursor-pointer"
              onClick={() => toggleExpand(key)}
            >
              <td className="p-2 font-medium text-aquaBlue">
                {r.course_name}{" "}
                <span className="text-xs text-gray-500">
                  ({r.students.length} élèves)
                </span>
              </td>
              <td className="p-2 text-center">{r.start_time || "-"}</td>
              <td className="p-2 text-center text-green-700">{r.presents}</td>
              <td className="p-2 text-center text-yellow-600">{r.lates}</td>
              <td className="p-2 text-center text-red-600">{r.absents}</td>
              <td className="p-2 text-center font-bold">{r.total}</td>
              <td className="p-2 text-center font-bold">{tauxPresence}%</td>
            </tr>

            {expanded[key] && r.students?.length > 0 && (
              <tr className="bg-gray-50">
                <td colSpan="7" className="p-2">
                  <div className="border-l-4 border-aquaBlue pl-3">
                    <h4 className="font-semibold mb-2">
                      Détails des présences :
                    </h4>
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-gray-200">
                        <tr>
                          <th className="p-1 text-left">Élève</th>
                          <th className="p-1 text-center">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.students.map((s, j) => (
                          <tr key={j} className="border-t">
                            <td className="p-1">{s.student_name}</td>
                            <td
                              className={`p-1 text-center ${
                                s.status === "present"
                                  ? "text-green-700"
                                  : s.status === "late"
                                  ? "text-yellow-600"
                                  : "text-red-600"
                              }`}
                            >
                              {s.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            )}
          </>
        );
      })}
    </tbody>
  </table>
)}

{/* === DAILY PAR UTILISATEUR === */}
{mode === "daily" && viewMode === "users" && (
  <table className="w-full text-sm border-collapse">
    <thead className="bg-gray-100 text-gray-600">
      <tr>
        <th className="p-2 text-left">Cours</th>
        <th className="p-2 text-center">Heure</th>
        <th className="p-2 text-left">Élève</th>
        <th className="p-2 text-center">Statut</th>
      </tr>
    </thead>
    <tbody>
      {reportData.flatMap((r, i) =>
        r.students.map((s, j) => (
          <tr key={`${i}-${j}`} className="border-t hover:bg-gray-50">
            <td className="p-2">{r.course_name}</td>
            <td className="p-2 text-center">{s.start_time || r.start_time || "-"}</td>
            <td className="p-2">{s.student_name}</td>
            <td
              className={`p-2 text-center font-bold ${
                s.status === "present"
                  ? "text-green-700"
                  : s.status === "late"
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}
            >
              {s.status}
            </td>
          </tr>
        ))
      )}
    </tbody>
  </table>
)}


{/* === MONTHLY PAR COURS (COMPACT) === */}
{mode === "monthly" && viewMode === "courses" && (
  <table className="w-full text-sm border-collapse">
    <thead className="bg-gray-100 text-gray-600">
      <tr>
        <th className="p-2 text-left">Cours</th>
        <th className="p-2 text-center">Heure</th>
        <th className="p-2 text-center">Présents</th>
        <th className="p-2 text-center">Retards</th>
        <th className="p-2 text-center">Absents</th>
        <th className="p-2 text-center">Total</th>
        <th className="p-2 text-center">% Présence</th>
      </tr>
    </thead>
    <tbody>
      {reportData.map((r, i) => {
        const totalAll = r.presents + r.lates + r.absents;
        const tauxPresence =
          totalAll > 0 ? (((r.presents + r.lates) / totalAll) * 100).toFixed(1) : "0.0";
        return (
          <tr key={`${r.course_name}_${r.start_time || ""}`} className="border-t hover:bg-gray-50">
            <td className="p-2 font-medium text-aquaBlue">{r.course_name}</td>
            <td className="p-2 text-center">{r.start_time || "-"}</td>
            <td className="p-2 text-center text-green-700">{r.presents}</td>
            <td className="p-2 text-center text-yellow-600">{r.lates}</td>
            <td className="p-2 text-center text-red-600">{r.absents}</td>
            <td className="p-2 text-center font-bold">{r.total}</td>
            <td className="p-2 text-center font-bold">{tauxPresence}%</td>
          </tr>
        );
      })}
    </tbody>
  </table>
)}



          {/* === MONTHLY PAR UTILISATEUR === */}
          {mode === "monthly" && viewMode === "users" && (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="p-2 text-left">Élève</th>
                  <th className="p-2 text-left">Cours</th>
                  <th className="p-2 text-center">Heure</th>
                  <th className="p-2 text-center">Présents</th>
                  <th className="p-2 text-center">Retards</th>
                  <th className="p-2 text-center">Absents</th>
                  <th className="p-2 text-center">Taux</th>
                </tr>
              </thead>
              <tbody>
                {reportData.flatMap((r, i) =>
                  r.students.map((s, j) => (
                    <tr key={`${i}-${j}`} className="border-t hover:bg-gray-50">
                      <td className="p-2">{s.full_name}</td>
                      <td className="p-2">{r.course_name}</td>
                      <td className="p-2 text-center">{r.start_time || "-"}</td>
                      <td className="p-2 text-center text-green-700">{s.presents}</td>
                      <td className="p-2 text-center text-yellow-600">{s.lates}</td>
                      <td className="p-2 text-center text-red-600">{s.absents}</td>
                      <td className="p-2 text-center font-bold">{s.taux_presence}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
