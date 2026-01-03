// src/pages/admin/AdminLayout.jsx
import { useEffect, useState } from "react"
import { Link, Outlet, useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"

export default function AdminLayout() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null) // { role, can_view_general_reports, can_view_bulletins }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate("/ecole") // pas connecté → on sort
        return
      }
      const { data: profile } = await supabase
        .from("profiles_with_unpaid")
        .select("id, role, can_view_general_reports, can_view_bulletins")
        .eq("id", user.id)
        .single()
      setMe(profile || null)
      setLoading(false)
    }
    load()
  }, [navigate])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate("/ecole") // vers la landing Ecole
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Chargement du tableau de bord…
      </div>
    )
  }

  const isAdmin = me?.role === "admin"
  const isAssistant = me?.role === "assistant"
  const canGeneral = isAdmin || (isAssistant && me?.can_view_general_reports)
  const canBulletins = isAdmin || (isAssistant && me?.can_view_bulletins)

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-72 bg-gray-900 text-white flex flex-col">
        <div className="p-4 font-bold text-lg border-b border-gray-700">
          A’QUA D’OR — Espace Admin
        </div>
        <nav className="flex-1 p-4 space-y-2 text-sm">
          <Link to="/admin" className="block p-2 rounded hover:bg-gray-800">
            🏠 Tableau de bord
          </Link>

          <Link to="/admin/users" className="block p-2 rounded hover:bg-gray-800">
            👥 Utilisateurs
          </Link>
          <Link to="/admin/courses" className="block p-2 rounded hover:bg-gray-800">
            📚 Cours
          </Link>
          <Link to="/admin/products" className="block p-2 rounded hover:bg-gray-800">
            🛒 Produits
          </Link>
          <Link to="/admin/plans" className="block p-2 rounded hover:bg-gray-800">
            📅 Plans
          </Link>
          <Link to="/admin/invoices" className="block p-2 rounded hover:bg-gray-800">
            💳 Factures
          </Link>
          <Link to="/admin/referrals" className="block p-2 rounded hover:bg-gray-800">
            🔗 Parrainages
          </Link>
          <Link to="/src/pages/admin/Commissions" className="block p-2 rounded hover:bg-gray-800">
            💵 Commissions
          </Link>
          <Link to="/admin/commission-requests" className="block p-2 rounded hover:bg-gray-800">
            📬 Demandes de Paiement
          </Link>

          {/* Rapports généraux visibles si admin ou assistant autorisé */}
          {canGeneral && (
            <Link to="/admin/reports" className="block p-2 rounded hover:bg-gray-800">
              📊 Rapports Généraux
            </Link>
          )}

          <Link to="/admin/attendance" className="block p-2 rounded hover:bg-gray-800">
            🗓️ Présences
          </Link>

          {/* Documents (PDF d’inscription) */}
          <Link to="/admin/documents" className="block p-2 rounded hover:bg-gray-800">
            📄 Documents d’inscription
          </Link>

          {/* Apparence (fond + logo Home) */}
          {isAdmin && (
            <Link to="/admin/appearance" className="block p-2 rounded hover:bg-gray-800">
              🎨 Apparence (Accueil)
            </Link>
          )}

          {/* Calendrier (séries & réservations club) */}
          <Link to="/admin/calendar" className="block p-2 rounded hover:bg-gray-800">
            🗓️ Calendrier & Réservations
          </Link>

          {/* Rapports Bulletins & Fiches : admin OU assistant avec droit */}
          {canBulletins && (
            <Link
              to="/admin/reports-bulletins-fiches"
              className="block p-2 rounded hover:bg-gray-800"
            >
              📑 Rapports Bulletins & Fiches
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleSignOut}
            className="w-full bg-red-600 hover:bg-red-700 text-white rounded px-3 py-2"
          >
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Contenu */}
      <main className="flex-1 bg-gray-50 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
