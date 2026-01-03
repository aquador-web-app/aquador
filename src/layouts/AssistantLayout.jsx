import { Link, Outlet, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"

export default function AssistantLayout() {
  const [profile, setProfile] = useState(null)
  const location = useLocation()

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from("profiles_with_unpaid")
          .select("role, can_view_general_reports, can_view_bulletins")
          .eq("id", user.id)
          .single()
        setProfile(data)
      }
    }
    loadProfile()
  }, [])

  if (!profile) return <div>Chargement...</div>

  const menuItems = [
    { path: "/assistant", label: "🏠 Tableau de bord" },
    { path: "/admin/users", label: "👥 Utilisateurs" },
    { path: "/admin/courses", label: "📚 Cours" },
    { path: "/admin/invoices", label: "💳 Factures" },
  ]

  if (profile.can_view_general_reports) {
    menuItems.push({ path: "/admin/reports", label: "📊 Rapports Généraux" })
  }
  if (profile.can_view_bulletins) {
    menuItems.push({ path: "/admin/reports-bulletins-fiches", label: "📑 Rapports Bulletins & Fiches" })
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-gray-700">
          A'QUA D'OR Assistante
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-3 py-2 rounded-lg transition ${
                location.pathname === item.path
                  ? "bg-blue-600 text-white font-semibold"
                  : "hover:bg-gray-800"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700 text-sm text-gray-400">
          Connectée en tant que : <span className="font-semibold">{profile.role}</span>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
