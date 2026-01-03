import { Link, Outlet, useLocation } from "react-router-dom"

export default function TeacherLayout() {
  const role = localStorage.getItem("role")
  const location = useLocation()

  const menuItems = [
    { path: "/teacher", label: "🏠 Tableau de bord" },
    { path: "/teacher/courses", label: "📚 Mes Cours" },
    { path: "/teacher/reports", label: "📑 Bulletins & Fiches" },
    { path: "/teacher/commissions", label: "💵 Mes Commissions" },
  ]

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-gray-700">
          A'QUA D'OR Professeur
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
          Connecté en tant que : <span className="font-semibold">{role}</span>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
