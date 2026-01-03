import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrencyHTG, formatDateFrSafe } from "../../lib/dateUtils";

export default function AdminSalary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [referenceStudents, setReferenceStudents] = useState(40);
  const [categories, setCategories] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [saving, setSaving] = useState(false);

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
   setLoading(false);
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
      </tr>
    ))}
    {!categories.length && (
      <tr>
        <td colSpan={2} className="text-center py-4 text-gray-500 italic">
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
