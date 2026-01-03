import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabaseClient"

export default function FillBulletin({ student, teacher, course, editingReport, onClose }) {
  const [assiduite, setAssiduite] = useState("")
  const [performance, setPerformance] = useState("")
  const [commentaire, setCommentaire] = useState("")
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM

  // Pré-remplir si on édite
  useEffect(() => {
    if (editingReport) {
      setMonth(editingReport.month)
      setAssiduite(editingReport.notes?.assiduite || "")
      setPerformance(editingReport.notes?.performance || "")
      setCommentaire(editingReport.notes?.commentaire || "")
    }
  }, [editingReport])

  const handleSave = async () => {
    if (editingReport) {
      // 🔄 UPDATE
      const { error } = await supabase
        .from("bulletins")
        .update({
          notes: { assiduite, performance, commentaire },
          month,
        })
        .eq("id", editingReport.id)

      if (error) {
        console.error("Erreur update bulletin:", error.message)
        alert("❌ Impossible de mettre à jour le bulletin")
      } else {
        alert("✅ Bulletin mis à jour")
        onClose()
      }
    } else {
      // ➕ INSERT
      const { error } = await supabase.from("bulletins").insert([
        {
          student_id: student.id,
          teacher_id: teacher.id,
          course_id: course?.id || null,
          month,
          notes: { assiduite, performance, commentaire },
        },
      ])

      if (error) {
        console.error("Erreur insert bulletin:", error.message)
        alert("❌ Impossible de sauvegarder le bulletin")
      } else {
        alert("✅ Bulletin sauvegardé")
        onClose()
      }
    }
  }

  return (
    <div className="p-4 bg-white rounded shadow space-y-4">
      <h2 className="font-bold text-lg">
        {editingReport ? "✏️ Modifier Bulletin" : "➕ Nouveau Bulletin"} — {month}
      </h2>

      <label className="block">
        Assiduité
        <input
          type="text"
          value={assiduite}
          onChange={(e) => setAssiduite(e.target.value)}
          className="input w-full"
        />
      </label>

      <label className="block">
        Performance
        <input
          type="text"
          value={performance}
          onChange={(e) => setPerformance(e.target.value)}
          className="input w-full"
        />
      </label>

      <label className="block">
        Commentaire
        <textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          className="input w-full"
        />
      </label>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
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
