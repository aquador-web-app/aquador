import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrencyHTG, formatDateFrSafe } from "../../lib/dateUtils";

function salaryMultiplier(countedStudents, refStudents) {
  const ref = Math.max(1, Number(refStudents || 1));
  const n = Number(countedStudents || 0);

  if (n >= ref && n < ref + 20) return 1.0;
  if (n >= ref + 20 && n < ref + 40) return 1.25;
  if (n >= ref + 40 && n < ref + 60) return 1.5;
  if (n >= ref + 60 && n < ref + 80) return 1.75;

  if (n < ref && n >= ref - 10) return 0.8;
  if (n < ref - 10 && n >= ref - 20) return 0.6;
  if (n < ref - 20 && n >= ref - 30) return 0.4;
  if (n < ref - 30) return 0.2;

  return 1.0;
}


export default function AdminSalary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [referenceStudents, setReferenceStudents] = useState(40);
  const [categories, setCategories] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [liveCounts, setLiveCounts] = useState({
  monthKey: "",
  expectedCount: 0,
  currentCount: 0,
});


  /** ---------------------------
   * LOAD DATA
   * -------------------------- */
  const load = async () => {
    setLoading(true);

    // 1️⃣ Load salaries
    const { data: salaries } = await supabase
      .from("admin_salaries")
      .select(`
        id,
        profile_id,
        period,
        base_salary,
        commission_bonus,
        attendance_bonus,
        deductions,
        net_salary,
        notes,
        created_at,
        profiles (full_name)
      `)
      .order("created_at", { ascending: false });
    setRows(salaries || []);

    // 2️⃣ Load global reference students
    const { data: ref } = await supabase
      .from("salary_settings")
      .select("reference_students")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (ref) setReferenceStudents(ref.reference_students);

    // 3️⃣ Load categories
    const { data: cats } = await supabase
      .from("teacher_salary_categories")
      .select("*")
      .order("name", { ascending: true });
    setCategories(cats || []);

    // 4️⃣ Load only teachers (no assistants)
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("role", "teacher")
      .order("full_name");
    setTeachers(profs || []);

    // 5️⃣ Load assignments
    const { data: assign } = await supabase
  .from("teacher_salary_assignments")
  .select(`
    profile_id,
    category_id,
    profiles!inner(full_name),
    teacher_salary_categories!inner(name)
  `);
setAssignments(
  (assign || []).map(a => ({
    profile_id: a.profile_id,
    category_id: a.category_id,
    full_name: a.profiles?.full_name || "",
    category_name: a.teacher_salary_categories?.name || ""
  }))
);
   await fetchGlobalLiveCounts();
   setLoading(false);
  };



    const monthKeyNow = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`; // matches invoices.month
  };

  const todayISODate = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`; // YYYY-MM-DD (local)
  };

  const isRegLine = (desc) => {
    const d = String(desc || "").toLowerCase();
    return (
      d.includes("frais d'inscription") ||
      d.includes("frais d’inscription") ||
      d.includes("inscription") ||
      d.includes("registration")
    );
  };

  async function fetchGlobalLiveCounts() {
  const today = todayISODate();
  const monthKey = monthKeyNow();

  // ✅ expectedCount = active enrollments today (same filter as AdminInvoicePayment)
  const { data: enr, error: enrErr } = await supabase
    .from("enrollments")
    .select("id, status, start_date, end_date")
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`);

  if (enrErr) {
    console.error("fetchGlobalLiveCounts enrollments error:", enrErr);
    return;
  }

  const active = (enr || []).filter((e) => {
    const st = String(e.status || "").toLowerCase();
    return !["cancelled", "canceled", "stopped", "inactive", "abandoned"].includes(st);
  });

  const expectedCount = active.length;

  // ✅ currentCount = count of invoices where coursePaid > 0 (same as AdminInvoicePayment rows.length)
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id, month, paid_total, description1, amount1, description2, amount2")
    .eq("month", monthKey);

  if (invErr) {
    console.error("fetchGlobalLiveCounts invoices error:", invErr);
    return;
  }

  let currentCount = 0;

  for (const row of inv || []) {
    const a1 = Number(row.amount1 || 0);
    const a2 = Number(row.amount2 || 0);

    const d1Reg = isRegLine(row.description1);
    const d2Reg = isRegLine(row.description2);

    const regFee = (d1Reg ? a1 : 0) + (d2Reg ? a2 : 0);
    const courseTotal = (!d1Reg ? a1 : 0) + (!d2Reg ? a2 : 0);

    const paidTotal = Number(row.paid_total || 0);
    const paidTowardCourse = Math.max(0, paidTotal - regFee);
    const coursePaid = Math.min(courseTotal, paidTowardCourse);

    // same filters as your AdminInvoicePayment:
    // .filter(courseTotal > 0).filter(amount > 0)
    if (courseTotal > 0 && coursePaid > 0) currentCount += 1;
  }

  setLiveCounts({
    monthKey,
    expectedCount,
    currentCount,
  });
}


    const categoryTotals = (categoryId) => {
    const cat = categories.find((c) => String(c.id) === String(categoryId));
    const base = Number(cat?.base_salary || 0);
    const ref = Math.max(1, Number(referenceStudents || 1));

    // teachers assigned to this category
    const teacherIds = assignments
      .filter((a) => String(a.category_id) === String(categoryId))
      .map((a) => a.profile_id);

    let expectedSum = 0;
    let paidSum = 0;

    for (const teacherId of teacherIds) {
      const expectedCount = liveByTeacher[teacherId]?.expectedCount || 0;
      const paidCount = liveByTeacher[teacherId]?.paidCount || 0;

      expectedSum += base * (expectedCount / ref);
      paidSum += base * (paidCount / ref);
    }

    return {
      base,
      teachersCount: teacherIds.length,
      expectedSum,
      paidSum,
    };
  };



  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="p-6">Chargement...</div>;

  /** ---------------------------
   * HANDLERS
   * -------------------------- */

  const saveReferenceStudents = async () => {
  setSaving(true);
  try {
    // read the current value as a number
    const refValue = Number(referenceStudents);

    // find existing row (if any)
    const { data: existing, error: selectError } = await supabase
      .from("salary_settings")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectError) {
      console.error("Select error:", selectError);
      alert("Erreur lors du chargement des paramètres.");
      return;
    }

    let error;
    if (existing?.id) {
      ({ error } = await supabase
        .from("salary_settings")
        .update({ reference_students: refValue })
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase
        .from("salary_settings")
        .insert([{ reference_students: refValue }]));
    }

    if (error) {
      console.error("Save error:", error);
      alert("Erreur: " + error.message);
    } else {
      alert("Référence étudiants mise à jour !");
      await load();
    }
  } catch (err) {
    console.error(err);
    alert("Erreur inattendue: " + err.message);
  } finally {
    setSaving(false);
  }

  if (error) alert("Erreur: " + error.message);
  else alert("Référence étudiants mise à jour !");
};



  const updateCategorySalary = async (id, newSalary) => {
    const { error } = await supabase
  .from("teacher_salary_categories")
  .update({ base_salary: newSalary })
  .eq("id", id);

if (error) console.error(error);
else {
  const { data: cats } = await supabase
    .from("teacher_salary_categories")
    .select("*")
    .order("name", { ascending: true });
  setCategories(cats || []);
}


  };

  const assignCategory = async (profileId, categoryId) => {
  if (!profileId) return;

  // update or insert
  const existing = assignments.find(a => a.profile_id === profileId);
  if (existing) {
    await supabase
      .from("teacher_salary_assignments")
      .update({ category_id: categoryId })
      .eq("profile_id", profileId);
  } else {
    await supabase
      .from("teacher_salary_assignments")
      .insert({ profile_id: profileId, category_id: categoryId });
  }

  // reload assignments to reflect changes
  const { data: updated } = await supabase
    .from("teacher_salary_assignments")
    .select(`
      profile_id,
      category_id,
      profiles!inner(full_name),
      teacher_salary_categories!inner(name)
    `);

  setAssignments(
    (updated || []).map(a => ({
      profile_id: a.profile_id,
      category_id: a.category_id,
      full_name: a.profiles?.full_name || "",
      category_name: a.teacher_salary_categories?.name || ""
    }))
  );
};



  const generateSalary = async () => {
    const { error } = await supabase.rpc("generate_salary");
    if (error) alert("Erreur: " + error.message);
    else alert("Salaires enseignants générés avec succès !");
    load();
  };

  /** ---------------------------
   * RENDER
   * -------------------------- */

  const total = rows.reduce((s, r) => s + Number(r.net_salary || 0), 0);
    // ✅ LIVE TOTALS (all teachers) based on assignments + category base salary
  const liveTotalsAllTeachers = (() => {
    const ref = Number(referenceStudents || 1);

    const expectedMult = salaryMultiplier(liveCounts.expectedCount, ref);
    const paidMult = salaryMultiplier(liveCounts.currentCount, ref);

    // Map: categoryId -> number of teachers assigned
    const countByCategory = new Map();
    for (const a of assignments || []) {
      if (!a.category_id) continue;
      const key = String(a.category_id);
      countByCategory.set(key, (countByCategory.get(key) || 0) + 1);
    }

    let expectedTotal = 0;
    let paidTotal = 0;

    for (const c of categories || []) {
      const teachersInCat = countByCategory.get(String(c.id)) || 0;
      const base = Number(c.base_salary || 0);

      expectedTotal += teachersInCat * base * expectedMult;
      paidTotal += teachersInCat * base * paidMult;
    }

    // round to 2 decimals
    expectedTotal = Math.round(expectedTotal * 100) / 100;
    paidTotal = Math.round(paidTotal * 100) / 100;

    return { expectedTotal, paidTotal, expectedMult, paidMult };
  })();


  return (
    <div className="p-6 space-y-10">
      {/* 1️⃣ SETTINGS SECTION */}
      <section>
        <h2 className="text-xl font-bold mb-2">Réglages globaux</h2>
        <div className="flex items-center gap-3">
          <label className="font-medium">Référence étudiants :</label>
          <input
            type="number"
            value={referenceStudents}
            onChange={(e) => setReferenceStudents(Number(e.target.value))}
            className="border p-1 rounded w-24"
          />
          <button
            onClick={saveReferenceStudents}
            disabled={saving}
            className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
          >
            Enregistrer
          </button>
        </div>
      </section>

      {/* 2️⃣ CATEGORY SECTION */}
<section>
  <h2 className="text-xl font-bold mb-2">Catégories de salaire</h2>

  {/* Add category form */}
  <div className="flex flex-wrap items-center gap-3 mb-4">
    <input
      type="text"
      placeholder="Nom de la catégorie (ex: Teacher 1)"
      id="newCatName"
      className="border p-1 rounded w-56"
    />
    <input
      type="number"
      placeholder="Salaire de base (HTG)"
      id="newCatSalary"
      className="border p-1 rounded w-40 text-right"
    />
    <button
      onClick={async () => {
        const name = document.getElementById("newCatName").value.trim();
        const baseSalary = Number(
          document.getElementById("newCatSalary").value
        );
        if (!name || !baseSalary) {
          alert("Veuillez entrer un nom et un salaire valide.");
          return;
        }
        const { error } = await supabase
          .from("teacher_salary_categories")
          .insert({ name, base_salary: baseSalary });
        if (error) alert("Erreur: " + error.message);
        else {
          alert("Catégorie ajoutée !");
          document.getElementById("newCatName").value = "";
          document.getElementById("newCatSalary").value = "";
          load();
        }
      }}
      className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
    >
      Ajouter
    </button>
  </div>

  <table className="w-full text-sm border">
  <thead className="bg-gray-100">
    <tr>
      <th className="p-2 border">Nom</th>
      <th className="p-2 border">Salaire de base (HTG)</th>
      <th className="p-2 border">Expectation / Paid (live)</th>
    </tr>
  </thead>
  <tbody>
    {categories.map((c) => (
      <tr key={c.id} className="hover:bg-gray-50">
        <td className="p-2 border">{c.name}</td>
        <td className="p-2 border text-center">
          <input
            type="number"
            defaultValue={c.base_salary}
            onBlur={async (e) => {
              const newSalary = Number(e.target.value);
              if (newSalary !== c.base_salary) {
                const { error } = await supabase
                  .from("teacher_salary_categories")
                  .update({ base_salary: newSalary })
                  .eq("id", c.id);
                if (error) alert("Erreur: " + error.message);
                else {
                  setCategories((prev) =>
                    prev.map((cat) =>
                      cat.id === c.id ? { ...cat, base_salary: newSalary } : cat
                    )
                  );
                }
              }
            }}
            className="border p-1 rounded w-32 text-right"
          />
        </td>
        <td className="p-2 border text-center">
  {(() => {
    const ref = Number(referenceStudents || 1);
    const base = Number(c.base_salary || 0);

    // ✅ PUT THIS RIGHT HERE (inside the 3rd column calc)
    const expectedMult = salaryMultiplier(liveCounts.expectedCount, ref);
    const paidMult = salaryMultiplier(liveCounts.currentCount, ref);

    const expectedSalary = Math.round(base * expectedMult * 100) / 100;
    const paidSalary = Math.round(base * paidMult * 100) / 100;

    return (
      <div className="text-xs leading-5">
        <div className="text-gray-500">
          Counts: <b>{liveCounts.expectedCount || 0}</b> expected /{" "}
          <b>{liveCounts.currentCount || 0}</b> paid
        </div>
        <div className="text-gray-500">
          Mult: <b>{expectedMult}</b> / <b>{paidMult}</b>
        </div>
        <div>
          <b>Expected:</b> {formatCurrencyHTG(expectedSalary)}
        </div>
        <div>
          <b>Paid:</b> {formatCurrencyHTG(paidSalary)}
        </div>
      </div>
    );
  })()}
</td>


      </tr>
    ))}
        {/* ✅ TOTAL (all teachers) */}
    {categories.length > 0 && (
      <tr className="bg-gray-50 font-semibold">
        <td className="p-2 border text-right" colSpan={2}>
          TOTAL (tous les enseignants)
        </td>
        <td className="p-2 border text-center">
          <div className="text-xs leading-5">
            <div className="text-gray-500">
              Counts: <b>{liveCounts.expectedCount || 0}</b> expected /{" "}
              <b>{liveCounts.currentCount || 0}</b> paid
            </div>
            <div className="text-gray-500">
              Mult: <b>{liveTotalsAllTeachers.expectedMult}</b> /{" "}
              <b>{liveTotalsAllTeachers.paidMult}</b>
            </div>
            <div>
              <b>Expected Total:</b>{" "}
              {formatCurrencyHTG(liveTotalsAllTeachers.expectedTotal)}
            </div>
            <div>
              <b>Paid Total:</b>{" "}
              {formatCurrencyHTG(liveTotalsAllTeachers.paidTotal)}
            </div>
          </div>
        </td>
      </tr>
    )}

    {!categories.length && (
      <tr>
        <td colSpan={3} className="text-center py-4 text-gray-500 italic">
          Aucune catégorie ajoutée
        </td>
      </tr>
    )}
  </tbody>
</table>

</section>

      {/* 3️⃣ ASSIGNMENTS SECTION */}
      <section>
        <h2 className="text-xl font-bold mb-2">Affectation des enseignants</h2>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Nom</th>
              <th className="p-2 border">Catégorie assignée</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="p-2 border">{t.full_name}</td>
                <td className="p-2 border text-center">
                  <select
  value={
    assignments.find((a) => a.profile_id === t.id)?.category_id || ""
  }
  onChange={(e) => assignCategory(t.id, e.target.value)}
  className="border p-1 rounded"
>
  <option value="">—</option>
  {categories.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
    </option>
  ))}
</select>

                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 4️⃣ GENERATE BUTTON */}
<section className="flex flex-col items-center space-y-3">
  <div className="flex items-center gap-3">
    <label className="font-medium">Mois :</label>
    <input
      type="month"
      id="salaryMonth"
      className="border p-1 rounded"
      defaultValue={new Date().toISOString().slice(0, 7)}
    />
  </div>

  <button
    onClick={async () => {
      const monthValue = document.getElementById("salaryMonth").value;
      if (!monthValue) {
        alert("Veuillez sélectionner un mois.");
        return;
      }
      // 'YYYY-MM' -> 'YYYY-MM-01'
      const selectedDate = `${monthValue}-01`;

      const { data, error } = await supabase.rpc("generate_salary", {
        selected_month: selectedDate,
      });

      if (error) {
        alert("Erreur: " + error.message);
      } else {
        alert(`Salaires générés: ${data || 0} ligne(s).`);
        await load();
      }
    }}
    className="bg-green-600 text-white px-6 py-2 rounded-lg shadow hover:bg-green-700 transition"
  >
    Générer les salaires enseignants
  </button>
</section>



      {/* 5️⃣ SALARY HISTORY TABLE */}
      <section>
        <h2 className="text-xl font-bold mb-3">Historique des salaires</h2>
        <p className="text-gray-700 mb-3">
          Total net enregistré :{" "}
          <strong className="text-purple-600">
            {formatCurrencyHTG(total)}
          </strong>
        </p>

        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2 text-center">Nom</th>
              <th className="border p-2 text-center">Période</th>
              <th className="border p-2 text-center">Salaire</th>
              <th className="border p-2 text-center">Remarques</th>
              <th className="border p-2 text-center">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="border p-2 text-center">
                  {r.profiles?.full_name || "—"}
                </td>
                <td className="border p-2 text-center">{r.period}</td>
                <td className="border p-2 text-center font-semibold text-gray-800">
                  {formatCurrencyHTG(r.base_salary)}
                </td>
                <td className="border p-2 text-center">{r.notes || "—"}</td>
                <td className="border p-2 text-center">
                  {formatDateFrSafe(r.created_at)}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center text-gray-500 py-4 italic"
                >
                  Aucun salaire trouvé
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
