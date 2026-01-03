import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function AdminReportsBulletinetFiche() {
  const [tab, setTab] = useState("students")
  const [students, setStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [bulletins, setBulletins] = useState([])
  const [fiches, setFiches] = useState([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [type, setType] = useState("bulletins")
  const [reports, setReports] = useState([])

  // Charger tous les élèves
  useEffect(() => {
    const loadStudents = async () => {
      const { data, error } = await supabase
        .from("profiles_with_unpaid")
        .select("id, first_name, last_name, email")
        .eq("role", "utilisateur")
      if (error) console.error(error)
      setStudents(data || [])
    }
    loadStudents()
  }, [])

  // Charger rapports pour un élève
  const loadStudentReports = async (studentId) => {
    setSelectedStudent(studentId)

    const { data: bull, error: errBull } = await supabase
      .from("bulletins")
      .select("id, month, notes, teacher:profiles(first_name,last_name)")
      .eq("student_id", studentId)
      .order("month", { ascending: true })
    if (errBull) console.error(errBull)
    setBulletins(bull || [])

    const { data: fich, error: errFich } = await supabase
      .from("fiches_techniques")
      .select("id, month, details, teacher:profiles(first_name,last_name)")
      .eq("student_id", studentId)
      .order("month", { ascending: true })
    if (errFich) console.error(errFich)
    setFiches(fich || [])
  }

  // Charger rapports globaux
  useEffect(() => {
    const loadReports = async () => {
      if (!month) return
      let table = type === "bulletins" ? "bulletins" : "fiches_techniques"
      let field = type === "bulletins" ? "notes" : "details"
      const { data, error } = await supabase
        .from(table)
        .select(`id, month, ${field}, student:profiles(first_name,last_name)`)
        .eq("month", month)
      if (error) console.error(error)
      setReports(data || [])
    }
    loadReports()
  }, [month, type])

  // Export PDF
  const exportPDF = (title, data, fieldName) => {
    const doc = new jsPDF()
    doc.text(title, 14, 15)
    const rows = data.flatMap((r) =>
      Object.entries(r[fieldName] || {}).map(([field, value]) => [
        `${r.student?.first_name || ""} ${r.student?.last_name || ""}`,
        field,
        value,
      ])
    )
    autoTable(doc, { startY: 25, head: [["Élève", "Champ", "Valeur"]], body: rows })
    doc.save(`${title.replace(" ", "_")}.pdf`)
  }

  // Export CSV
  const exportCSV = (title, data, fieldName) => {
    const headers = ["Élève", "Champ", "Valeur"]
    const rows = data.flatMap((r) =>
      Object.entries(r[fieldName] || {}).map(([field, value]) => [
        `${r.student?.first_name || ""} ${r.student?.last_name || ""}`,
        field,
        value,
      ])
    )
    const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `${title.replace(" ", "_")}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">📑 Rapports Bulletins & Fiches</h1>

      {/* Onglets */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("students")}
          className={`px-4 py-2 ${tab === "students" ? "border-b-2 border-blue-600 font-bold" : "text-gray-600"}`}
        >
          Individuel
        </button>
        <button
          onClick={() => setTab("global")}
          className={`px-4 py-2 ${tab === "global" ? "border-b-2 border-blue-600 font-bold" : "text-gray-600"}`}
        >
          Global
        </button>
      </div>

      {/* Vue INDIVIDUEL */}
      {tab === "students" && (
        <>
          <div className="bg-white p-4 rounded-xl shadow">
            <h2 className="font-semibold mb-2">Sélectionner un élève</h2>
            <select
              onChange={(e) => loadStudentReports(e.target.value)}
              className="border p-2 rounded w-full"
            >
              <option value="">-- Choisir un élève --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} ({s.email})
                </option>
              ))}
            </select>
          </div>

          {selectedStudent && (
            <>
              {/* Bulletins */}
              <div className="bg-white p-4 rounded-xl shadow">
                <h2 className="font-semibold mb-2">Bulletins</h2>
                {bulletins.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucun bulletin</p>
                ) : (
                  <ul className="divide-y">
                    {bulletins.map((b) => (
                      <li key={b.id} className="py-2 flex justify-between items-center">
                        <div>
                          <p className="font-semibold">Mois : {b.month}</p>
                          <p className="text-sm text-gray-500">
                            Professeur : {b.teacher?.first_name} {b.teacher?.last_name}
                          </p>
                        </div>
                        <button
                          onClick={() => exportPDF(`Bulletin_${b.month}`, [b], "notes")}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                        >
                          📄 Télécharger
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Fiches */}
              <div className="bg-white p-4 rounded-xl shadow">
                <h2 className="font-semibold mb-2">Fiches Techniques</h2>
                {fiches.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucune fiche</p>
                ) : (
                  <ul className="divide-y">
                    {fiches.map((f) => (
                      <li key={f.id} className="py-2 flex justify-between items-center">
                        <div>
                          <p className="font-semibold">Mois : {f.month}</p>
                          <p className="text-sm text-gray-500">
                            Professeur : {f.teacher?.first_name} {f.teacher?.last_name}
                          </p>
                        </div>
                        <button
                          onClick={() => exportPDF(`Fiche_${f.month}`, [f], "details")}
                          className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                        >
                          📄 Télécharger
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Vue GLOBALE */}
      {tab === "global" && (
        <div className="space-y-4">
          {/* Filtres */}
          <div className="flex gap-4 bg-white p-4 rounded-xl shadow">
            <div className="flex flex-col">
              <label className="text-sm font-semibold">Mois :</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="border p-2 rounded"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-semibold">Type :</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="border p-2 rounded"
              >
                <option value="bulletins">Bulletins</option>
                <option value="fiches_techniques">Fiches Techniques</option>
              </select>
            </div>
          </div>

          {/* Résultats globaux */}
          <div className="bg-white p-4 rounded-xl shadow">
            <h2 className="font-semibold mb-2">
              {type === "bulletins" ? "Bulletins" : "Fiches techniques"} — {month}
            </h2>

            {reports.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun rapport trouvé</p>
            ) : (
              <table className="w-full text-sm border">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 border">Élève</th>
                    <th className="p-2 border">Champ</th>
                    <th className="p-2 border">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) =>
                    Object.entries(type === "bulletins" ? r.notes : r.details).map(([field, value], idx) => (
                      <tr key={`${r.id}-${idx}`}>
                        <td className="p-2 border">
                          {r.student?.first_name} {r.student?.last_name}
                        </td>
                        <td className="p-2 border">{field}</td>
                        <td className="p-2 border">{value}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Export */}
          <div className="flex gap-3">
            <button
              onClick={() => exportCSV(`${type}_${month}`, reports, type === "bulletins" ? "notes" : "details")}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              📑 Export CSV
            </button>
            <button
              onClick={() => exportPDF(`${type}_${month}`, reports, type === "bulletins" ? "notes" : "details")}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              📄 Export PDF
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
