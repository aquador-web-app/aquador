// src/pages/admin/AdminBulletinForm.jsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatMonth, formatDateFrSafe } from "../../lib/dateUtils";

const SCALE = ["E", "TB", "B", "AB", "A", "P"];

const FIELDS = {
  HABILITE: ["respiration", "flottage", "battement", "posture"],
  COMPORTEMENT: ["attentif", "maitrise", "reaction"],
  ATTITUDE: [
    "esprit_equipe",
    "performance",
    "estime_de_soi",
    "perseverance",
    "discipline",
  ],
  DIVERS: ["devoirs"],
};

const makeEmptyRow = (dateStr) => ({
  date: dateStr,
  respiration: "",
  flottage: "",
  battement: "",
  posture: "",
  attentif: "",
  maitrise: "",
  reaction: "",
  esprit_equipe: "",
  performance: "",
  estime_de_soi: "",
  perseverance: "",
  discipline: "",
  devoirs: "",
});

export default function AdminBulletinForm() {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [monthValue, setMonthValue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [academicYear, setAcademicYear] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${y + 1}`;
  });
  const [sessionRows, setSessionRows] = useState([
    makeEmptyRow(""),
    makeEmptyRow(""),
    makeEmptyRow(""),
    makeEmptyRow(""),
  ]);
  const [loading, setLoading] = useState(false);
  const [globalErreur, setGlobalErreur] = useState("");
  const [globalResult, setGlobalResult] = useState("");

  // Auto-dismiss global messages after 3s
  useEffect(() => {
    if (globalErreur || globalResult) {
      const timer = setTimeout(() => {
        setGlobalErreur("");
        setGlobalResult("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [globalErreur, globalResult]);

  // Load all students
  // Load only students with active enrollments
useEffect(() => {
  (async () => {
    try {
      const { data: activeEnrollments, error: enrErr } = await supabase
        .from("enrollments")
        .select("profile_id")
        .eq("status", "active");

      if (enrErr) throw enrErr;

      const activeIds = Array.from(
        new Set((activeEnrollments || []).map((e) => e.profile_id))
      );

      if (!activeIds.length) {
        setStudents([]);
        return;
      }

      const { data: profilesData, error: profErr } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name")
        .in("id", activeIds)
        .order("full_name", { ascending: true });

      if (profErr) throw profErr;

      setStudents(profilesData || []);
    } catch (err) {
      console.error("Erreur lors du chargement des élèves actifs :", err);
      setStudents([]);
    }
  })();
}, []);


  useEffect(() => {
    const s = students.find((u) => u.id === studentId);
    setStudentName(s?.full_name || "");
  }, [studentId, students]);

  const monthRange = useMemo(() => {
    if (!monthValue) return null;
    const [y, m] = monthValue.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    return {
      startISO: start.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
      label: formatMonth(`${monthValue}-01`),
    };
  }, [monthValue]);

  // === Fetch real session dates for the selected student and month ===
  const fetchSessionDates = async () => {
  setLoading(true);
  setGlobalErreur("");
  setGlobalResult("");

  try {
    // 1️⃣ Get student’s active enrollments
    const { data: enrollments, error: enrErr } = await supabase
      .from("enrollments")
      .select("session_group")
      .eq("profile_id", studentId)
      .eq("status", "active");

    if (enrErr) throw enrErr;
    if (!enrollments?.length)
      throw new Error("Aucune inscription active trouvée pour cet élève.");

    const sessionGroups = enrollments.map((e) => e.session_group).filter(Boolean);
    if (!sessionGroups.length)
      throw new Error("Aucun groupe de séance associé à cet élève.");

    // 2️⃣ Fetch sessions for those groups within the month
    const { startISO, endISO } = monthRange;
    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select("start_date, status, session_group")
      .in("session_group", sessionGroups)
      .gte("start_date", startISO)
      .lt("start_date", endISO)
      .order("start_date", { ascending: true });
    if (sessErr) throw sessErr;

    const validSessions = (sessions || []).filter((s) => s.status === "active");
    const uniqueDates = Array.from(new Set(validSessions.map((s) => s.start_date))).slice(0, 4);
    while (uniqueDates.length < 4) uniqueDates.push("");

    // 3️⃣ Load existing bulletin entries for this student + month
    const { data: existing, error: existErr } = await supabase
      .from("bulletin_sessions")
      .select("*")
      .eq("student_id", studentId)
      .eq("month", monthRange.label)
      .eq("academic_year", academicYear)
      .order("date", { ascending: true });

    if (existErr) throw existErr;

    // 4️⃣ Merge: fill each row with saved values if date matches
    const mergedRows = uniqueDates.map((d) => {
      const found = existing?.find((e) => e.date === d);
      return found
        ? {
            date: d,
            respiration: found.respiration || "",
            flottage: found.flottage || "",
            battement: found.battement || "",
            posture: found.posture || "",
            attentif: found.attentif || "",
            maitrise: found.maitrise || "",
            reaction: found.reaction || "",
            esprit_equipe: found.esprit_equipe || "",
            performance: found.performance || "",
            estime_de_soi: found.estime_de_soi || "",
            perseverance: found.perseverance || "",
            discipline: found.discipline || "",
            devoirs: found.devoirs || "",
          }
        : makeEmptyRow(d);
    });

    setSessionRows(mergedRows);
    setGlobalResult(
      `✔️ ${mergedRows.filter((r) => r.date).length} séance(s) chargée(s) pour ${monthRange.label}`
    );
  } catch (err) {
    console.error("fetchSessionDates error:", err);
    setGlobalErreur("Erreur : " + err.message);
    setSessionRows([makeEmptyRow(""), makeEmptyRow(""), makeEmptyRow(""), makeEmptyRow("")]);
  } finally {
    setLoading(false);
  }
};


  useEffect(() => {
    if (studentId && monthRange) fetchSessionDates();
  }, [studentId, monthValue]);

  // === Update any field ===
  const updateCell = (rowIdx, key, value) => {
    setSessionRows((prev) => {
      const copy = [...prev];
      copy[rowIdx] = { ...copy[rowIdx], [key]: value };
      return copy;
    });
  };

  // === Save data to bulletin_sessions ===
  const saveAll = async () => {
    if (!studentId) return setGlobalErreur("Veuillez sélectionner un élève.");

    const records = sessionRows
      .filter((r) => r.date)
      .map((r) => ({
        student_id: studentId,
        student_name: studentName,
        month: monthRange.label,
        academic_year: academicYear,
        date: r.date,
        respiration: r.respiration || null,
        flottage: r.flottage || null,
        battement: r.battement || null,
        posture: r.posture || null,
        attentif: r.attentif || null,
        maitrise: r.maitrise || null,
        reaction: r.reaction || null,
        esprit_equipe: r.esprit_equipe || null,
        performance: r.performance || null,
        estime_de_soi: r.estime_de_soi || null,
        perseverance: r.perseverance || null,
        discipline: r.discipline || null,
        devoirs: r.devoirs || null,
      }));

    if (!records.length)
      return setGlobalErreur("Aucune ligne valide à enregistrer.");

    setLoading(true);
    try {
      const { error } = await supabase
        .from("bulletin_sessions")
        .upsert(records, { onConflict: "student_id,date" });
      if (error) throw error;
      setGlobalResult("💾 Données enregistrées avec succès !");
    } catch (e) {
      console.error(e);
      setGlobalErreur("Erreur : " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-center text-2xl font-bold text-gray-800">Bulletins</h2>

      {/* Filtres */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="text-sm text-gray-600 block mb-1">Élève</label>
          <select
            className="border rounded-lg px-3 py-2 w-64 w-full"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">— Sélectionner —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-gray-600 block mb-1">Mois</label>
          <select
  className="border rounded-lg px-3 py-2 w-full"
  value={monthValue}
  onChange={(e) => setMonthValue(e.target.value)}
>
  {Array.from({ length: 12 }).map((_, i) => {
    const date = new Date(2026, i, 1);
    const value = `${date.getFullYear()}-${String(i + 1).padStart(2, "0")}`;
    const rawLabel = date.toLocaleDateString("fr-FR", {
  month: "long",
  year: "numeric",
});
const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);


    return (
      <option key={value} value={value}>
        {label}
      </option>
    );
  })}
</select>

        </div>

        <div>
          <label className="text-sm text-gray-600 block mb-1 ">Année académique</label>
          <input
            type="text"
            className="border rounded-lg px-3 py-2 w-32 w-full"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />
        </div>

        <button
          onClick={fetchSessionDates}
          disabled={loading}
          className="bg-aquaBlue text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition w-full"
        >
          🔄 Recharger
        </button>
      </div>

      {/* Messages */}
      {globalErreur && (
        <div className="bg-red-100 text-red-800 px-4 py-2 rounded-lg text-center font-medium shadow">
          {globalErreur}
        </div>
      )}
      {globalResult && (
        <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg text-center font-medium shadow">
          {globalResult}
        </div>
      )}
{/* Desktop / Tablet */}
<div className="hidden md:block overflow-x-auto">
      {/* Table */}
      <div className="bg-white rounded-2xl shadow p-6 overflow-x-auto border border-gray-100">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-lg text-aquaBlue">
            Séances du mois (4 Séances)
          </h3>
        </div>

        {/* Barème */}
        <p className="italic text-sm text-gray-600 mb-3">
          <span className="font-semibold">Barème :</span>{" "}
          <span className="ml-2">E : Excellent</span>{" "}
          <span className="ml-4">TB : Très Bien</span>{" "}
          <span className="ml-4">B : Bien</span>{" "}
          <span className="ml-4">AB : Assez Bien</span>{" "}
          <span className="ml-4">A : À améliorer</span>{" "}
          <span className="ml-4">P : Passable</span>
        </p>

        <table className="w-full text-sm border-collapse border border-gray-300">
  <thead className="bg-gray-100 text-gray-700">
    <tr>
      <th className="border border-gray-300 p-2 text-center">Date</th>
      <th
        colSpan={FIELDS.HABILITE.length}
        className="border border-gray-300 p-2 text-center"
      >
        Habileté Technique
      </th>
      <th
        colSpan={FIELDS.COMPORTEMENT.length}
        className="border border-gray-300 p-2 text-center"
      >
        Comportement
      </th>
      <th
        colSpan={FIELDS.ATTITUDE.length}
        className="border border-gray-300 p-2 text-center"
      >
        Attitude
      </th>
      <th className="border border-gray-300 p-2 text-center">Devoirs</th>
    </tr>

    <tr className="text-xs text-gray-600">
      <th className="border border-gray-300 p-1">Jour</th>
      {Object.values(FIELDS)
        .flat()
        .map((f) => (
          <th key={f} className="border border-gray-300 p-1">
            {labelFor(f)}
          </th>
        ))}
    </tr>
  </thead>

  <tbody>
    {sessionRows.map((row, idx) => {
      const weekday = row.date
  ? (() => {
      const [y, m, d] = row.date.split("-").map(Number);
      const localDate = new Date(y, m - 1, d); // Local date, no UTC shift
      return localDate.toLocaleDateString("fr-FR", { weekday: "long" });
    })()
  : "—";

      return (
        <tr
          key={idx}
          className="odd:bg-white even:bg-gray-50 hover:bg-blue-50 transition"
        >
          <td className="border border-gray-300 p-1">
            <div className="flex flex-col items-center">
              <input
  type="text"
  readOnly
  className="border rounded px-3 py-2 w-full text-center bg-gray-100 cursor-pointer"
  value={row.date ? formatDateFrSafe(row.date) : ""}
  onClick={() => {
    const d = prompt("Entrer la date (YYYY-MM-DD)");
    if (d) updateCell(idx, "date", d);
  }}
/>

              <span className="text-xs italic text-gray-600 mt-1 capitalize">
                {weekday}
              </span>
            </div>
          </td>

          {Object.values(FIELDS)
            .flat()
            .map((f) => (
              <td key={f} className="border border-gray-300 p-1 text-center">
                <SelectScale
                  value={row[f] || ""}
                  onChange={(v) => updateCell(idx, f, v)}
                />
              </td>
            ))}
        </tr>
      );
    })}
  </tbody>
</table>
</div>
</div>
{/* Mobile layout */}
<div className="md:hidden space-y-4">
  {/* Barème */}
<div className="bg-white border rounded-xl p-4 text-sm text-gray-700">
  <p className="font-semibold mb-2">Barème :</p>
  <ul className="space-y-1">
    <li><strong>E</strong> : Excellent</li>
    <li><strong>TB</strong> : Très Bien</li>
    <li><strong>B</strong> : Bien</li>
    <li><strong>AB</strong> : Assez Bien</li>
    <li><strong>A</strong> : À améliorer</li>
    <li><strong>P</strong> : Passable</li>
  </ul>
</div>

  {sessionRows.map((row, idx) => {
      const weekday = row.date
  ? (() => {
      const [y, m, d] = row.date.split("-").map(Number);
      const localDate = new Date(y, m - 1, d); // Local date, no UTC shift
      return localDate.toLocaleDateString("fr-FR", { weekday: "long" });
    })()
  : "—";

    return (
      <div
        key={idx}
        className="bg-gray-50 border rounded-xl p-4 space-y-4 shadow-sm"
      >
        {/* Date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Date</label>
          <input
  type="text"
  readOnly
  className="border rounded px-3 py-2 w-full text-center bg-gray-100 cursor-pointer"
  value={row.date ? formatDateFrSafe(row.date) : ""}
  onClick={() => {
    const d = prompt("Entrer la date (YYYY-MM-DD)");
    if (d) updateCell(idx, "date", d);
  }}
/>

          <span className="text-xs italic text-gray-600 capitalize">
            {weekday}
          </span>
        </div>

        {/* Sections */}
        {Object.entries(FIELDS).map(([section, fields]) => (
          <div key={section}>
            <h4 className="text-sm font-semibold text-aquaBlue mb-2">
              {section}
            </h4>

            <div className="grid grid-cols-2 gap-3">
              {fields.map((f) => (
                <div key={f} className="flex flex-col gap-1">
                  <label className="text-xs text-gray-600">
                    {labelFor(f)}
                  </label>
                  <SelectScale
                    value={row[f] || ""}
                    onChange={(v) => updateCell(idx, f, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  })}
</div>


        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-5">
          <button
            onClick={saveAll}
            disabled={loading}
            className="bg-aquaBlue text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            💾 Enregistrer 
          </button>
        </div>
      </div>
    
  );
}

function SelectScale({ value, onChange }) {
  return (
    <select
      className="border rounded px-3 py-2 text-sm min-h-[42px]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {SCALE.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}


function labelFor(k) {
  const map = {
    respiration: "Respiration",
    flottage: "Flottage",
    battement: "Battement",
    posture: "Posture",
    attentif: "Attentif",
    maitrise: "Maitrise",
    reaction: "Réaction",
    esprit_equipe: "Esprit d'équipe",
    performance: "Performance",
    estime_de_soi: "Estime de soi",
    perseverance: "Persévérance",
    discipline: "Discipline",
    devoirs: "Devoirs",
  };
  return map[k] || k;
}
