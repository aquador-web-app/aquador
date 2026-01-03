import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"

export default function AdminTemplates() {
  const [bulletinFields, setBulletinFields] = useState([])
  const [ficheFields, setFicheFields] = useState([])

  const [fieldLabel, setFieldLabel] = useState("")
  const [fieldType, setFieldType] = useState("text")

  // Ajouter un champ
  const addField = (type) => {
    if (fieldLabel.trim() === "") return
    if (type === "bulletin") {
      setBulletinFields([...bulletinFields, { label: fieldLabel, type: fieldType }])
    } else {
      setFicheFields([...ficheFields, { label: fieldLabel, type: fieldType }])
    }
    setFieldLabel("")
    setFieldType("text")
  }

  const saveTemplate = async (type) => {
    const fields = type === "bulletin" ? bulletinFields : ficheFields
    await supabase.from(type === "bulletin" ? "bulletin_templates" : "fiche_templates").insert([
      { name: `${type} standard`, fields },
    ])
    alert(`Modèle ${type} enregistré ✅`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">🛠️ Gestion des Modèles</h1>

      {/* Création modèle Bulletin */}
      <section className="bg-white p-4 rounded-xl shadow">
        <h2 className="font-semibold mb-2">Créer un Modèle de Bulletin</h2>
        <div className="flex gap-2">
          <input
            value={fieldLabel}
            onChange={(e) => setFieldLabel(e.target.value)}
            placeholder="Nom du champ"
            className="border p-2 rounded flex-1"
          />
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value)}
            className="border p-2 rounded"
          >
            <option value="text">Texte</option>
            <option value="number">Nombre</option>
            <option value="textarea">Paragraphe</option>
          </select>
          <button
            onClick={() => addField("bulletin")}
            className="bg-blue-500 text-white px-3 py-1 rounded"
          >
            ➕ Ajouter
          </button>
        </div>

        <ul className="mt-3 list-disc pl-6 text-sm">
          {bulletinFields.map((f, i) => (
            <li key={i}>{f.label} ({f.type})</li>
          ))}
        </ul>

        <button
          onClick={() => saveTemplate("bulletin")}
          className="mt-3 bg-green-600 text-white px-4 py-2 rounded"
        >
          💾 Enregistrer le modèle Bulletin
        </button>
      </section>

      {/* Création modèle Fiche */}
      <section className="bg-white p-4 rounded-xl shadow">
        <h2 className="font-semibold mb-2">Créer un Modèle de Fiche Technique</h2>
        <div className="flex gap-2">
          <input
            value={fieldLabel}
            onChange={(e) => setFieldLabel(e.target.value)}
            placeholder="Nom du champ"
            className="border p-2 rounded flex-1"
          />
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value)}
            className="border p-2 rounded"
          >
            <option value="text">Texte</option>
            <option value="number">Nombre</option>
            <option value="textarea">Paragraphe</option>
          </select>
          <button
            onClick={() => addField("fiche")}
            className="bg-green-500 text-white px-3 py-1 rounded"
          >
            ➕ Ajouter
          </button>
        </div>

        <ul className="mt-3 list-disc pl-6 text-sm">
          {ficheFields.map((f, i) => (
            <li key={i}>{f.label} ({f.type})</li>
          ))}
        </ul>

        <button
          onClick={() => saveTemplate("fiche")}
          className="mt-3 bg-green-600 text-white px-4 py-2 rounded"
        >
          💾 Enregistrer le modèle Fiche
        </button>
      </section>
    </div>
  )
}
