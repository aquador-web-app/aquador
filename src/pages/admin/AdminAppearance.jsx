// src/pages/admin/AdminAppearance.jsx
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"

export default function AdminAppearance() {
  const [loading, setLoading] = useState(true)
  const [homeBgUrl, setHomeBgUrl] = useState("")
  const [homeLogoUrl, setHomeLogoUrl] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: bg } = await supabase.from("settings").select("value").eq("key", "home_bg_url").single()
      const { data: logo } = await supabase.from("settings").select("value").eq("key", "home_logo_url").single()
      setHomeBgUrl(bg?.value || "")
      setHomeLogoUrl(logo?.value || "")
      setLoading(false)
    }
    load()
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const ops = [
        supabase.from("settings").upsert({ key: "home_bg_url", value: homeBgUrl }),
        supabase.from("settings").upsert({ key: "home_logo_url", value: homeLogoUrl }),
      ]
      const [r1, r2] = await Promise.all(ops)
      if (r1.error) throw r1.error
      if (r2.error) throw r2.error
      alert("Apparence enregistrée ✅")
    } catch (err) {
      alert("Erreur: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Optional: upload helper to Supabase Storage (public bucket required)
  const uploadToStorage = async (file, folder) => {
    if (!file) return
    const path = `${folder}/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from("public").upload(path, file, { upsert: true })
    if (error) {
      alert("Upload error: " + error.message)
      return null
    }
    // Get public URL
    const { data: pub } = supabase.storage.from("public").getPublicUrl(path)
    return pub?.publicUrl || null
  }

  const handleBgUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadToStorage(file, "home")
    if (url) setHomeBgUrl(url)
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadToStorage(file, "logo")
    if (url) setHomeLogoUrl(url)
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Apparence — Page d’accueil</h1>
      {loading ? (
        <div className="text-sm text-gray-500">Chargement…</div>
      ) : (
        <form onSubmit={save} className="space-y-6 max-w-2xl">
          {/* Background */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow space-y-3">
            <h2 className="font-semibold">Image d’arrière-plan</h2>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                className="w-full border rounded p-2 dark:bg-gray-700"
                placeholder="https://... ou /img/home-bg.jpg"
                value={homeBgUrl}
                onChange={(e) => setHomeBgUrl(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <label className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 cursor-pointer">
                  Choisir un fichier
                  <input type="file" accept="image/*" onChange={handleBgUpload} className="hidden" />
                </label>
                {homeBgUrl && <a className="text-aquaBlue underline text-sm" href={homeBgUrl} target="_blank" rel="noreferrer">Aperçu</a>}
              </div>
            </div>
          </div>

          {/* Logo */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow space-y-3">
            <h2 className="font-semibold">Logo</h2>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                className="w-full border rounded p-2 dark:bg-gray-700"
                placeholder="https://... ou /logo/aqua-dor.png"
                value={homeLogoUrl}
                onChange={(e) => setHomeLogoUrl(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <label className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 cursor-pointer">
                  Choisir un fichier
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {homeLogoUrl && <a className="text-aquaBlue underline text-sm" href={homeLogoUrl} target="_blank" rel="noreferrer">Aperçu</a>}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-aquaBlue text-white hover:bg-blue-600 disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
