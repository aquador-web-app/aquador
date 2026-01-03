import { Link, Outlet, useLocation } from "react-router-dom"

export default function UserLayout() {
  const role = localStorage.getItem("role")
  const location = useLocation()

  const menuItems = [
    { path: "/user", label: "🏠 Mon Tableau de bord" },
    { path: "/user/courses", label: "📚 Mes Cours" },
    { path: "/user/invoices", label: "💳 Mes Factures" },
    { path: "/user/reports", label: "📑 Mes Rapports" },
    { path: "/user/commissions", label: "💵 Mes Commissions (si influenceur)" },
  ]

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-gray-700">
          A'QUA D'OR Utilisateur
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => (
            <>
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
              <Link
                to="/user/change-password"
                className={`block px-3 py-2 rounded-lg transition ${
                  location.pathname === "/user/change-password"
                    ? "bg-blue-600 text-white font-semibold"
                    : "hover:bg-gray-800"
                }`}
              >
                🔒 Changer mot de passe
              </Link>
            </>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700 text-sm text-gray-400">
          Connecté en tant que : <span className="font-semibold">{role}</span>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
