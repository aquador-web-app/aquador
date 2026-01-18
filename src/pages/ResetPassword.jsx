import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"
import { useNavigate } from "react-router-dom"

export default function ResetPassword() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [ready, setReady] = useState(false)

  const navigate = useNavigate()

  // 🔑 CRITICAL PART
  useEffect(() => {
    const exchangeSession = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get("code")

      if (!code) {
        setError("Lien invalide ou expiré.")
        return
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        setError("Lien invalide ou expiré.")
      } else {
        setReady(true)
      }
    }

    exchangeSession()
  }, [])

  const handleReset = async (e) => {
    e.preventDefault()
    setError("")

    if (!password || !confirmPassword) {
      setError("Veuillez remplir tous les champs.")
      return
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.")
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      alert("Mot de passe réinitialisé avec succès ✅")
      navigate("/login")
    }

    setLoading(false)
  }

  if (!ready && !error) {
    return <div className="p-6 text-center">⏳ Vérification du lien…</div>
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">🔑 Réinitialiser le mot de passe</h2>

        {error && <div className="text-red-600 mb-3">{error}</div>}

        <form onSubmit={handleReset} className="space-y-4">
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded p-2"
          />

          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border rounded p-2"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded"
          >
            {loading ? "Enregistrement..." : "Réinitialiser"}
          </button>
        </form>
      </div>
    </div>
  )
}
