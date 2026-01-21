// src/pages/admin/AdminFicheTechnique.jsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatMonth } from "../../lib/dateUtils";

function getAcademicYearFromMonth(monthValue) {
  if (!monthValue) return "";

  const [year, month] = monthValue.split("-").map(Number);

  // September (9) → December
  if (month >= 9) {
    return `${year}-${year + 1}`;
  }

  // January → August
  return `${year - 1}-${year}`;
}


export default function AdminFicheTechnique() {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [monthValue, setMonthValue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [message, setMessage] = useState("");

  const [measure, setMeasure] = useState({
    age: "",
    long_bras_gauche: 0,
    long_bras_droit: 0,
    long_pied_gauche: 0,
    long_pied_droit: 0,
    saut_avec: 0,
    saut_elan_bras_gauche: 0,
    saut_elan_bras_droit: 0,
    saut_stable_bras_gauche: 0,
    saut_stable_bras_droit: 0,
    largeur_ventre: 0,
    taille: 0,
    poids_lbs: 0,
    saut_stable_deux_bras: 0,
  });

  // === Month label exactly like bulletin ===
  const monthLabel = useMemo(() => formatMonth(`${monthValue}-01`), [monthValue]);

  // === Load active students ===
  useEffect(() => {
    (async () => {
      try {
        const { data: activeEnrollments, error: enrErr } = await supabase
          .from("enrollments")
          .select("profile_id")
          .eq("status", "active");
        if (enrErr) throw enrErr;

        const activeIds = [
          ...new Set((activeEnrollments || []).map((e) => e.profile_id)),
        ];
        if (!activeIds.length) return setStudents([]);

        const { data: profiles, error: profErr } = await supabase
          .from("profiles_with_unpaid")
          .select("id, full_name, birth_date")
          .in("id", activeIds)
          .order("full_name", { ascending: true });
        if (profErr) throw profErr;

        setStudents(profiles || []);
      } catch (err) {
        console.error("Erreur lors du chargement des élèves actifs :", err);
        setStudents([]);
      }
    })();
  }, []);

  // === Helper: calculate age ===
  function calculateAge(dob) {
    if (!dob) return "";
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  // === Update student info ===
  useEffect(() => {
    const s = students.find((u) => u.id === studentId);
    setStudentName(s?.full_name || "");
    setMeasure((prev) => ({
      ...prev,
      age: s?.birth_date ? calculateAge(s.birth_date) : "",
    }));
  }, [studentId, students]);

  useEffect(() => {
  if (!monthValue) return;

  const ay = getAcademicYearFromMonth(monthValue);
  setAcademicYear(ay);
}, [monthValue]);


  // === Auto-load fiche (robust match with proper date) ===
useEffect(() => {
  if (!studentId || !monthValue || !students.length) return;

  const loadFiche = async () => {
    const startDate = `${monthValue}-01`;
    const monthDate = new Date(startDate);
    const nextMonth = new Date(monthDate);
    nextMonth.setMonth(monthDate.getMonth() + 1);

    console.log("📡 Querying fiche_technique where:", {
      studentId,
      monthDate: startDate,
    });

    const { data, error } = await supabase
      .from("fiche_technique")
      .select("*")
      .eq("student_id", studentId)
      .gte("month", startDate)
      .lt("month", nextMonth.toISOString().split("T")[0])
      .limit(1);

    if (error) {
      console.error("❌ Supabase error:", error);
      setMessage("Erreur de chargement de la fiche.");
      return;
    }

    const s = students.find((u) => u.id === studentId);
    const computedAge = s?.birth_date ? calculateAge(s.birth_date) : "";

    if (data && data.length > 0) {
      const fiche = data[0];
      console.log("✅ fiche found:", fiche);

      setMeasure((prev) => ({
        ...prev,
        ...fiche,
        age: computedAge,
      }));
      setAcademicYear(fiche.academic_year || "");
      setMessage(`📄 Fiche chargée pour ${formatMonth(fiche.month)}`);
    } else {
      console.log("⚠️ No fiche found for this student/month");
      setMeasure({
        age: computedAge,
        long_bras_gauche: 0,
        long_bras_droit: 0,
        long_pied_gauche: 0,
        long_pied_droit: 0,
        saut_avec: 0,
        saut_elan_bras_gauche: 0,
        saut_elan_bras_droit: 0,
        saut_stable_bras_gauche: 0,
        saut_stable_bras_droit: 0,
        largeur_ventre: 0,
        taille: 0,
        poids_lbs: 0,
        saut_stable_deux_bras: 0,
      });
    }
  };

  loadFiche();
}, [studentId, monthValue, students]);


  // === Save fiche ===
  const saveFiche = async () => {
    if (!studentId) return setMessage("⚠️ Veuillez sélectionner un élève.");
    const num = (v) => (v === "" || v === null ? 0 : Number(v));

    const record = {
      student_id: studentId,
      student_name: studentName,
      academic_year: academicYear,
      month: monthLabel, // same label format as bulletin
      age: num(measure.age),
      long_bras_gauche: num(measure.long_bras_gauche),
      long_bras_droit: num(measure.long_bras_droit),
      long_pied_gauche: num(measure.long_pied_gauche),
      long_pied_droit: num(measure.long_pied_droit),
      saut_avec: num(measure.saut_avec),
      saut_elan_bras_gauche: num(measure.saut_elan_bras_gauche),
      saut_elan_bras_droit: num(measure.saut_elan_bras_droit),
      saut_stable_bras_gauche: num(measure.saut_stable_bras_gauche),
      saut_stable_bras_droit: num(measure.saut_stable_bras_droit),
      largeur_ventre: num(measure.largeur_ventre),
      taille: num(measure.taille),
      poids_lbs: num(measure.poids_lbs),
      saut_stable_deux_bras: num(measure.saut_stable_deux_bras),
    };

    const { error } = await supabase
      .from("fiche_technique")
      .upsert(record, { onConflict: "student_id,month" });

    setMessage(
      error
        ? "❌ " + error.message
        : `💾 Fiche enregistrée avec succès pour ${monthLabel} !`
    );
    setTimeout(() => setMessage(""), 4000);
  };

  const handleChange = (field, value) =>
    setMeasure((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="p-8 space-y-8 bg-gray-50 min-h-screen">
      <h2 className="text-center text-2xl font-bold text-[#001f5c]">
        📏 Fiche Technique
      </h2>

      {/* Info Élève */}
      <div className="bg-white shadow-lg rounded-2xl p-6 border border-gray-100">
        <h3 className="text-xl font-semibold text-[#004e75] mb-4">
          Informations de l’élève
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Élève</label>
            <select
              className="border rounded-lg px-3 py-2 w-full"
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
            <div>
  <select
    className="border rounded-lg px-3 py-2 w-full"
    value={monthValue}
    onChange={(e) => setMonthValue(e.target.value)}
  >
    {Array.from({ length: 12 }).map((_, i) => {
      const year = Number(monthValue.split("-")[0]);
      const date = new Date(year, i, 1);

      const value = `${year}-${String(i + 1).padStart(2, "0")}`;

      const rawLabel = date.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      });

      const label =
        rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

      return (
        <option key={value} value={value}>
          {label}
        </option>
      );
    })}
  </select>
</div>

          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">Âge</label>
            <input
              type="number"
              readOnly
              className="border rounded-lg px-3 py-2 w-full text-center bg-gray-100 cursor-not-allowed"
              value={measure.age || ""}
              placeholder="auto"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">
              Année académique
            </label>
            <input
              type="text"
              readOnly
              className="border rounded-lg px-3 py-2 w-full text-center bg-gray-100 cursor-not-allowed"
              value={academicYear}
            />
          </div>
        </div>
      </div>

      {/* Table Mesures */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveFiche();
        }}
        className="bg-white border border-gray-300 rounded-xl px-4 py-5 shadow-sm text-sm w-full md:max-w-2xl md:mx-auto"
      >
        <h3 className="text-lg font-semibold text-[#004e75] text-center mb-4 uppercase">
          Mesures physiques (en CM)
        </h3>
{/* Desktop layout */}
<div className="hidden md:block">
        {[
          [
            ["long_bras_gauche", "Bras G."],
            ["long_bras_droit", "Bras D."],
            ["long_pied_gauche", "Pied G."],
            ["long_pied_droit", "Pied D."],
          ],
          [
            ["saut_avec", "Saut avec Élan 2 bras"],
            ["saut_stable_deux_bras", "Saut Stable 2 Bras"],
            ["saut_elan_bras_gauche", "Saut Élan Bras G."],
            ["saut_elan_bras_droit", "Saut Élan Bras D."],
            ["saut_stable_bras_gauche", "Saut St. Bras G."],
            ["saut_stable_bras_droit", "Saut St. Bras D."],
          ],
          [
            ["largeur_ventre", "Largeur Ventre"],
            ["taille", "Taille"],
            ["poids_lbs", "Poids (LBS)"],
          ],
        ].map((row, i) => (
          <table
            key={i}
            className={`mx-auto text-center border-collapse ${
              i > 0 ? "mt-3" : ""
            }`}
          >
            <thead className="bg-blue-50 text-[#004e75]">
              <tr>
                {row.map(([key, label]) => (
                  <th key={key} className="border border-gray-300 px-3 py-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {row.map(([key]) => (
                  <td key={key} className="border border-gray-200 px-2 py-2">
                    <input
                      type="number"
                      className="w-24 border border-gray-300 rounded text-center py-1 focus:ring focus:ring-blue-100"
                      value={measure[key] === 0 ? "" : measure[key]}
                      onChange={(e) => handleChange(key, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        ))}
        </div>
        {/* Mobile layout */}
<div className="md:hidden space-y-3">

  {[
    ["long_bras_gauche", "Bras gauche (cm)"],
    ["long_bras_droit", "Bras droit (cm)"],
    ["long_pied_gauche", "Pied gauche (cm)"],
    ["long_pied_droit", "Pied droit (cm)"],
    ["saut_avec", "Saut avec élan deux bras (cm)"],
    ["saut_stable_deux_bras", "Saut stable deux bras (cm)"],
    ["saut_elan_bras_gauche", "Saut élan bras gauche (cm)"],
    ["saut_elan_bras_droit", "Saut élan bras droit (cm)"],
    ["saut_stable_bras_gauche", "Saut stable bras gauche (cm)"],
    ["saut_stable_bras_droit", "Saut stable bras droit (cm)"],
    ["largeur_ventre", "Largeur ventre (cm)"],
    ["taille", "Taille (cm)"],
    ["poids_lbs", "Poids (lbs)"],
  ].map(([key, label]) => (
    <div
  key={key}
  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex flex-col text-center gap-2 w-full"
>

      <label className="text-sm font-semibold text-gray-700 text-center">
        {label}
      </label>

      <input
        type="number"
        className="w-24 mx-auto border border-gray-300 rounded text-center py-1"
        value={measure[key] === 0 ? "" : measure[key]}
        onChange={(e) => handleChange(key, e.target.value)}
      />
    </div>
  ))}

</div>


        <div className="flex justify-center mt-6">
          <button
            type="submit"
            className="bg-[#001f5c] hover:bg-[#004e75] text-white font-medium px-6 py-2 rounded-lg transition"
          >
            💾 Enregistrer la Fiche
          </button>
        </div>
      </form>

      {message && (
        <p className="text-center text-blue-700 font-medium mt-4">{message}</p>
      )}
    </div>
  );
}
