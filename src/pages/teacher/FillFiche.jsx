import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabaseClient"

export default function FillFiche({ student, teacher, course, editingReport, onClose }) {
  const [time50m, setTime50m] = useState("")
  const [respiration, setRespiration] = useState("")
  const [pointsForts, setPointsForts] = useState("")
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM

  // Pré-remplir si on édite
  useEffect(() => {
    if (editingReport) {
      setMonth(editingReport.month)
      setTime50m(editingReport.details?.["50m_freestyle"] || "")
      setRespiration(editingReport.details?.respiration || "")
      setPointsForts(editingReport.details?.points_forts || "")
    }
  }, [editingReport])

  const handleSave = async () => {
    if (editingReport) {
      // 🔄 UPDATE
      const { error } = await supabase
        .from("fiches_techniques")
        .update({
          details: {
            "50m_freestyle": time50m,
            respiration,
            points_forts: pointsForts,
          },
          month,
        })
        .eq("id", editingReport.id)

      if (error) {
        console.error("Erreur update fiche:", error.message)
        alert("❌ Impossible de mettre à jour la fiche")
      } else {
        alert("✅ Fiche technique mise à jour")
        onClose()
      }
    } else {
      // ➕ INSERT
      const { error } = await supabase.from("fiches_techniques").insert([
        {
          student_id: student.id,
          teacher_id: teacher.id,
          course_id: course?.id || null,
          month,
          details: {
            "50m_freestyle": time50m,
            respiration,
            points_forts: pointsForts,
          },
        },
      ])

      if (error) {
        console.error("Erreur insert fiche:", error.message)
        alert("❌ Impossible de sauvegarder la fiche")
      } else {
        alert("✅ Fiche technique sauvegardée")
        onClose()
      }
    }
  }

  return (
    <div className="p-4 bg-white rounded shadow space-y-4">
      <h2 className="font-bold text-lg">
        {editingReport ? "✏️ Modifier Fiche Technique" : "➕ Nouvelle Fiche Technique"} — {month}
      </h2>

      <label className="block">
        Temps 50m (freestyle)
        <input
          type="text"
          value={time50m}
          onChange={(e) => setTime50m(e.target.value)}
          className="input w-full"
        />
      </label>

      <label className="block">
        Respiration
        <input
          type="text"
          value={respiration}
          onChange={(e) => setRespiration(e.target.value)}
          className="input w-full"
        />
      </label>

      <label className="block">
        Points forts
        <textarea
          value={pointsForts}
          onChange={(e) => setPointsForts(e.target.value)}
          className="input w-full"
        />
      </label>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          {editingReport ? "Mettre à jour" : "Sauvegarder"}
        </button>
        <button
          onClick={onClose}
          className="bg-gray-300 text-black px-4 py-2 rounded hover:bg-gray-400"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
