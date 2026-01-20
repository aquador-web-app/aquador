import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"
import OneSignal from "react-onesignal"


const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 🔐 Single resolver for session → profile → user
  const resolveUser = async (session) => {
    if (!session?.user) {
      setUser(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()

    if (error) {
      console.error("❌ Profile fetch error:", error)
      setUser(null)
    } else {
  const mergedUser = { ...session.user, ...profile }
  setUser(mergedUser)

  // 🔔 OneSignal must NEVER block auth
try {
  OneSignal.login(session.user.id)
    .then(() => {
      if (profile?.role) {
        OneSignal.sendTag("role", profile.role)
      }
      console.log("🔔 OneSignal linked to user", session.user.id)
    })
    .catch((err) => {
      console.error("❌ OneSignal login failed", err)
    })
} catch (err) {
  console.error("❌ OneSignal setup error", err)
}

}


    setLoading(false)
  }

  useEffect(() => {
    let mounted = true

    // 1️⃣ Initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) resolveUser(session)
    })

    // 2️⃣ Auth changes (login / logout / refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) resolveUser(session)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
