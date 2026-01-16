import { useState } from "react"
import { supabase } from "../lib/supabaseClient"

export default function ForgotPassword() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage("")
    setError("")
    setLoading(true)

    if (!email) {
      setError("Veuillez entrer votre adresse email.")
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo = `${window.location.origin}/reset-password`, // ⚠️ change ça quand tu mettras en ligne
    })

    if (error) {
      setError("Erreur: " + error.message)
    } else {
      setMessage("📧 Un email de réinitialisation a été envoyé à " + email)
    }

    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">🔑 Mot de passe oublié</h2>

        {error && <div className="text-red-600 mb-3">{error}</div>}
        {message && <div className="text-green-600 mb-3">{message}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold">Adresse email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded p-2"
              placeholder="exemple@domaine.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {loading ? "Envoi en cours..." : "Envoyer l’email de réinitialisation"}
          </button>
        </form>
      </div>
    </div>
  )
}
