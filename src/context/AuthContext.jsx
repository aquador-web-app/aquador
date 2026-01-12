import { createContext, useContext, useState, useEffect } from "react"
import { supabase } from "../lib/supabaseClient"

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        // Récupérer profil dans la table "profiles"
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()

        setUser({ ...session.user, ...profile })
      } else {
        setUser(null)
      }
      setLoading(false)
    }

    loadUser()

    // Écoute des changements (connexion/déconnexion)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            setUser({ ...session.user, ...data })
          })
      } else {
        setUser(null)
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, setUser, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
