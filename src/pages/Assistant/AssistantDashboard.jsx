// src/pages/Assistant/AssistantDashboard.jsx
import { useEffect, useMemo, useState } from "react"
import { Link, NavLink } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useAuth } from "../../context/AuthContext"
import ThemeToggle from "../../components/ThemeToggle"

export default function AssistantDashboard() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panel, setPanel] = useState("overview")

  // Permissions
  const [permissions, setPermissions] = useState({
    can_view_general_reports: false,
    can_view_bulletins: false,
  })

  // Data (loaded only if allowed)
  const [users, setUsers] = useState([])
  const [courses, setCourses] = useState([])
  const [factures, setFactures] = useState([])

  useEffect(() => {
    const run = async () => {
      if (!user) return
      setLoading(true)
      try {
        // Load permissions
        const { data: p } = await supabase
          .from("profiles_with_unpaid")
          .select("can_view_general_reports, can_view_bulletins")
          .eq("id", user.id)
          .single()

        const perms = p || {
          can_view_general_reports: false,
          can_view_bulletins: false,
        }
        setPermissions(perms)

        // Load data conditionally
        const tasks = []

        if (perms.can_view_general_reports) {
          tasks.push(
            supabase.from("profiles_with_unpaid").select("*"),
            supabase.from("courses").select("*").order("created_at", { ascending: false }),
            supabase.from("factures").select("*").order("created_at", { ascending: false })
          )
        }

        if (tasks.length) {
          const [uRes, cRes, fRes] = await Promise.all(tasks)
          setUsers(uRes?.data || [])
          setCourses(cRes?.data || [])
          setFactures(fRes?.data || [])
        }
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [user])

  const delinquentFactures = useMemo(
    () =>
      (factures || []).filter((f) => {
        const s = (f.status || "").toLowerCase()
        return s !== "payé" && s !== "paye" && s !== "paid" && s !== "paid_partial"
      }),
    [factures]
  )

  if (!user) return <div className="p-6">Erreur : utilisateur introuvable.</div>

  const SidebarLink = ({ activeKey, icon, label, require }) => {
    // Hide item if permission required and not granted
    if (require === "general" && !permissions.can_view_general_reports) return null
    if (require === "bulletins" && !permissions.can_view_bulletins) return null

    return (
      <button
        onClick={() => setPanel(activeKey)}
        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition
          ${panel === activeKey ? "bg-aquaBlue text-white" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"}
        `}
        title={label}
      >
        <span className="text-lg">{icon}</span>
        <span className="font-medium">{label}</span>
      </button>
    )
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gray-50 dark:bg-gray-900">
      {/* Topbar */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-4 md:px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg border hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Menu"
          >
            ☰
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Tableau de bord — Assistante</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Connecté·e : {user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick links (permission-aware) */}
          {permissions.can_view_general_reports && (
            <Link
              to="/admin/reports"
              className="hidden md:inline-block px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              title="Rapports généraux"
            >
              📊 Rapports
            </Link>
          )}
          {permissions.can_view_bulletins && (
            <Link
              to="/admin/reports-bulletins"
              className="hidden md:inline-block px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              title="Rapports Bulletins & Fiches"
            >
              📑 Bulletins
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Body with sidebar */}
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside
          className={`border-r dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-4 md:py-6 transition-all
            ${sidebarOpen ? "block" : "hidden md:block"}
          `}
        >
          <nav className="space-y-2">
            <SidebarLink activeKey="overview" icon="🏠" label="Aperçu" />
            <SidebarLink activeKey="users" icon="👥" label="Utilisateurs" require="general" />
            <SidebarLink activeKey="courses" icon="📘" label="Cours" require="general" />
            <SidebarLink activeKey="billing" icon="🧾" label="Factures" require="general" />

            <div className="pt-2 mt-2 border-t dark:border-gray-700" />

            {permissions.can_view_general_reports && (
              <NavLink
                to="/admin/reports"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg ${
                    isActive ? "bg-indigo-600 text-white" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`
                }
                title="Rapports généraux"
              >
                <span className="text-lg">📊</span>
                <span className="font-medium">Rapports généraux</span>
              </NavLink>
            )}

            {permissions.can_view_bulletins && (
              <NavLink
                to="/admin/reports-bulletins"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg ${
                    isActive ? "bg-indigo-600 text-white" : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`
                }
                title="Rapports Bulletins & Fiches"
              >
                <span className="text-lg">📑</span>
                <span className="font-medium">Bulletins & Fiches</span>
              </NavLink>
            )}
          </nav>
        </aside>

        {/* Main */}
        <main className="p-4 md:p-6">
          {loading && <div className="text-sm text-gray-500 dark:text-gray-300">Chargement…</div>}

          {!loading && panel === "overview" && (
            <Overview
              hasGeneral={permissions.can_view_general_reports}
              hasBulletins={permissions.can_view_bulletins}
              users={users}
              courses={courses}
              delinquentFactures={delinquentFactures}
            />
          )}

          {!loading && panel === "users" && permissions.can_view_general_reports && (
            <UsersPanel users={users} />
          )}

          {!loading && panel === "courses" && permissions.can_view_general_reports && (
            <CoursesPanel courses={courses} />
          )}

          {!loading && panel === "billing" && permissions.can_view_general_reports && (
            <BillingPanel factures={factures} />
          )}
        </main>
      </div>
    </div>
  )
}

/* ---------------- Panels ---------------- */

function StatCard({ label, value, icon, accent = "bg-blue-50 dark:bg-blue-900/30 border-blue-200" }) {
  return (
    <div className={`p-4 rounded-xl border ${accent}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">{label}</div>
        <div className="text-xl">{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  )
}

function Overview({ hasGeneral, hasBulletins, users, courses, delinquentFactures }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Aperçu</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {hasGeneral && <StatCard label="Utilisateurs" value={users.length} icon="👥" />}
        {hasGeneral && <StatCard label="Cours" value={courses.length} icon="📘" />}
        {hasGeneral && (
          <StatCard
            label="Factures en attente"
            value={delinquentFactures.length}
            icon="🧾"
            accent="bg-amber-50 dark:bg-amber-900/30 border-amber-200"
          />
        )}
        {hasBulletins && (
          <StatCard
            label="Bulletins & Fiches"
            value="Accès"
            icon="📑"
            accent="bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200"
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {hasGeneral && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Derniers cours</h3>
              <span className="text-xs text-gray-500">{courses.length} au total</span>
            </div>
            <ul className="space-y-2 text-sm max-h-[260px] overflow-auto">
              {courses.slice(0, 8).map((c) => (
                <li key={c.id} className="p-2 border rounded">
                  📘 <span className="font-medium">{c.name}</span>
                  {c.schedule && <span className="ml-2 text-xs text-gray-500">({c.schedule})</span>}
                </li>
              ))}
              {!courses.length && <li className="text-gray-400">Aucun cours</li>}
            </ul>
          </div>
        )}

        {hasGeneral && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Impayés récents</h3>
              <Link to="/admin/reports" className="text-aquaBlue text-sm underline">Voir rapports</Link>
            </div>
            <ul className="space-y-2 text-sm max-h-[260px] overflow-auto">
              {delinquentFactures.slice(0, 8).map((f) => (
                <li key={f.id} className="p-2 border rounded flex items-center justify-between">
                  <div>⚠️ {f.student_name || f.student_id} — {Number(f.montant || 0).toFixed(2)} $</div>
                  <Link to="/admin/reports" className="text-xs text-aquaBlue underline">Détails</Link>
                </li>
              ))}
              {!delinquentFactures.length && <li className="text-gray-400">Aucun impayé</li>}
            </ul>
          </div>
        )}

        {hasBulletins && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow md:col-span-2">
            <h3 className="font-semibold mb-2">Bulletins & Fiches</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              Accès aux rapports selon les droits accordés par l’administrateur.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/reports-bulletins" className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                📑 Ouvrir les rapports Bulletins & Fiches
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function UsersPanel({ users }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Utilisateurs ({users.length})</h2>
      </div>
      <ul className="space-y-2 text-sm">
        {users.map((u) => (
          <li key={u.id} className="p-2 border rounded flex items-center justify-between">
            <div>
              {u.first_name} {u.last_name} — {u.email}{" "}
              <span className="text-xs text-gray-500">({u.role})</span>
            </div>
            {u.status === "delinquent" && (
              <span title="Impays" className="text-red-600 text-lg leading-none">$</span>
            )}
          </li>
        ))}
        {!users.length && <li className="text-gray-400">Aucun utilisateur</li>}
      </ul>
    </section>
  )
}

function CoursesPanel({ courses }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Cours ({courses.length})</h2>
      </div>
      <ul className="space-y-2 text-sm">
        {courses.map((c) => (
          <li key={c.id} className="p-2 border rounded">
            📘 <span className="font-medium">{c.name}</span>
            {c.schedule && <span className="ml-2 text-xs text-gray-500">({c.schedule})</span>}
          </li>
        ))}
        {!courses.length && <li className="text-gray-400">Aucun cours</li>}
      </ul>
    </section>
  )
}

function BillingPanel({ factures }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Factures ({factures.length})</h2>
        <Link to="/admin/reports" className="text-aquaBlue text-sm underline">Rapports & export</Link>
      </div>
      <ul className="space-y-2 text-sm">
        {factures.map((f) => (
          <li key={f.id} className={`p-2 border rounded ${((f.status || "").toLowerCase().startsWith("pay") ? "" : "bg-red-50 dark:bg-red-900/30")}`}>
            {f.student_name || f.student_id} — {Number(f.montant || 0).toFixed(2)} $
            <span className="ml-2 text-xs text-gray-500">({f.status || "—"})</span>
          </li>
        ))}
        {!factures.length && <li className="text-gray-400">Aucune facture</li>}
      </ul>
    </section>
  )
}
