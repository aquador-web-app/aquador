import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import ThemeToggle from "../../components/ThemeToggle"

export default function AdminDocuments() {
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState({
    reglements: null,
    accord: null,
    consentement: null,
    consentement_enabled: true,
  })
  const [files, setFiles] = useState({
    reglements: null,
    accord: null,
    consentement: null,
  })

  // Charger les URLs actuelles depuis app_settings
  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "doc_urls")
        .single()

      if (!error && data?.value) {
        setSettings({
          reglements: data.value.reglements ?? null,
          accord: data.value.accord ?? null,
          consentement: data.value.consentement ?? null,
          consentement_enabled:
            typeof data.value.consentement_enabled === "boolean"
              ? data.value.consentement_enabled
              : true,
        })
      }
    }
    fetchSettings()
  }, [])

  const handleFileChange = (e, key) => {
    const file = e.target.files?.[0] || null
    setFiles((prev) => ({ ...prev, [key]: file }))
  }

  // Upload un fichier vers le bucket "docs" et retourne l'URL publique
  const uploadOne = async (key, file) => {
    const ext = file.name.split(".").pop() || "pdf"
    const filename = `${key}_${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from("docs")
      .upload(filename, file, { upsert: false })
    if (upErr) throw upErr

    const { data: pub } = await supabase.storage
      .from("docs")
      .getPublicUrl(filename)

    return pub.publicUrl
  }

  const saveAll = async () => {
    setLoading(true)
    try {
      const next = { ...settings }

      if (files.reglements) {
        next.reglements = await uploadOne("reglements", files.reglements)
      }
      if (files.accord) {
        next.accord = await uploadOne("accord", files.accord)
      }
      if (files.consentement) {
        next.consentement = await uploadOne("consentement", files.consentement)
      }

      const { error: upErr } = await supabase.from("app_settings").upsert({
        key: "doc_urls",
        value: {
          reglements: next.reglements,
          accord: next.accord,
          consentement: next.consentement,
          consentement_enabled: next.consentement_enabled,
        },
        updated_at: new Date().toISOString(),
      })
      if (upErr) throw upErr

      setSettings(next)
      setFiles({ reglements: null, accord: null, consentement: null })
      alert("Documents mis à jour ✅")
    } catch (e) {
      console.error(e)
      alert("Erreur lors de la mise à jour des documents.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      {/* En-tête */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-6 py-3 mb-6 rounded-lg">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
          Centre de documents (PDF) — Admin
        </h1>
        <ThemeToggle />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Règlements */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">
            Règlements A'QUA D'OR Cours de natation
          </h2>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => handleFileChange(e, "reglements")}
            className="mb-3"
          />
          {settings.reglements ? (
            <div className="space-y-2">
              <a
                href={settings.reglements}
                target="_blank"
                rel="noreferrer"
                className="text-aquaBlue underline"
              >
                Voir le PDF actuel
              </a>
              <iframe
                title="reglements"
                src={settings.reglements}
                className="w-full h-64 border"
              />
            </div>
          ) : (
            <p className="text-gray-500">Aucun PDF enregistré.</p>
          )}
        </div>

        {/* Accord du participant */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">ACCORD DU PARTICIPANT</h2>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => handleFileChange(e, "accord")}
            className="mb-3"
          />
          {settings.accord ? (
            <div className="space-y-2">
              <a
                href={settings.accord}
                target="_blank"
                rel="noreferrer"
                className="text-aquaBlue underline"
              >
                Voir le PDF actuel
              </a>
              <iframe
                title="accord"
                src={settings.accord}
                className="w-full h-64 border"
              />
            </div>
          ) : (
            <p className="text-gray-500">Aucun PDF enregistré.</p>
          )}
        </div>

        {/* Consentement optionnel */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold mb-2">
              Formulaire de consentement — (Optionnel)
            </h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.consentement_enabled}
                onChange={() =>
                  setSettings((prev) => ({
                    ...prev,
                    consentement_enabled: !prev.consentement_enabled,
                  }))
                }
              />
              Activer le document optionnel
            </label>
          </div>

          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => handleFileChange(e, "consentement")}
            className="mb-3"
          />
          {settings.consentement ? (
            <div className="space-y-2">
              <a
                href={settings.consentement}
                target="_blank"
                rel="noreferrer"
                className="text-aquaBlue underline"
              >
                Voir le PDF actuel
              </a>
              <iframe
                title="consentement"
                src={settings.consentement}
                className="w-full h-64 border"
              />
            </div>
          ) : (
            <p className="text-gray-500">Aucun PDF enregistré.</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={saveAll}
          disabled={loading}
          className="bg-aquaBlue text-white px-5 py-2 rounded-lg hover:bg-blue-600"
        >
          {loading ? "Sauvegarde..." : "Enregistrer les changements"}
        </button>
      </div>
    </div>
  )
}
