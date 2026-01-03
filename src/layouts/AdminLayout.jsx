import { Link, Outlet, useLocation } from "react-router-dom"

export default function AssistantLayout() {
  const role = localStorage.getItem("role")
  const location = useLocation()

  const menuItems = [
    { path: "/admin", label: "🏠 Tableau de bord" },
    { path: "/admin/users", label: "👥 Utilisateurs" },
    { path: "/admin/courses", label: "📚 Cours" },
    { path: "/admin/products", label: "🛒 Produits" },
    { path: "/admin/plans", label: "📅 Plans" },
    { path: "/admin/invoices", label: "💳 Factures" },
    { path: "/admin/referrals", label: "🔗 Parrainages" },
    { path: "/admin/commissions", label: "💵 Commissions" },
    { path: "/admin/commission-requests", label: "📬 Demandes de Paiement" },
    { path: "/admin/reports", label: "📊 Rapports Généraux" },
    { path: "/admin/attendance", label: "🗓️ Présences" },
    // ✅ Assistante a accès aussi aux bulletins & fiches
    { path: "/admin/reports-bulletins-fiches", label: "📑 Rapports Bulletins & Fiches" },
  ]

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-gray-700">
          A'QUA D'OR - ADMIN
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
        </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
