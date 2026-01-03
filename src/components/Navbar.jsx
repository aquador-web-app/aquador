// src/components/Navbar.jsx
import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient"
import ThemeToggle from "./ThemeToggle"

export default function Navbar() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: authListener } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    )
    return () => authListener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user) {
      supabase
        .from("profiles_with_unpaid")
        .select("*")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => setProfile(data))
    }
  }, [session])

  const logout = async () => {
    await supabase.auth.signOut()
    navigate("/login")
  }

  return (
    <header className="w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto flex items-center justify-between py-3 px-4">
        <Link to="/" className="font-bold text-xl text-aquaBlue">
          A'QUA D'OR
        </Link>

        {session ? (
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="link">Mon espace</Link>

            {profile?.role === "admin" && (
              <>
                <Link to="/admin/calendar" className="btn btn-xs bg-aquaBlue text-white">Calendrier</Link>
                <Link to="/admin/documents" className="btn btn-xs bg-aquaBlue text-white">Documents</Link>
                <Link to="/admin/reports" className="btn btn-xs bg-indigo-600 text-white">Rapports</Link>
                <Link to="/admin/reports-bulletins" className="btn btn-xs bg-indigo-600 text-white">Bulletins</Link>
              </>
            )}

            {profile?.role === "assistant" && (
              <>
                {profile?.can_view_general_reports && (
                  <Link to="/admin/reports" className="btn btn-xs bg-indigo-600 text-white">Rapports</Link>
                )}
                {profile?.can_view_bulletins && (
                  <Link to="/admin/reports-bulletins" className="btn btn-xs bg-indigo-600 text-white">Bulletins</Link>
                )}
              </>
            )}

            <ThemeToggle />
            <button onClick={logout} className="btn btn-primary">Déconnexion</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link to="/login" className="link">Connexion</Link>
            <Link to="/register" className="btn btn-primary">Inscription</Link>
            <ThemeToggle />
          </div>
        )}
      </div>
    </header>
  )
}
