import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"
import OneSignal from "react-onesignal"


const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 🔐 Single resolver for session → profile → user
  const resolveUser = async (session) => {
  try {
    if (!session?.user) {
      setUser(null);
      return;
    }

    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    // 🔴 HARD NORMALIZATION
    const safeUser = {
      id: session.user.id,
      email: session.user.email,
      role: profile?.role ?? "user",        // ALWAYS DEFINED
      full_name: profile?.full_name ?? "",
      permissions: profile?.permissions ?? [],
    };

    setUser(safeUser);
  } catch (err) {
    console.error("❌ resolveUser crash", err);
    setUser(null);
  } finally {
    setLoading(false);
  }
};


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

  useEffect(() => {
  const timer = setTimeout(() => {
    console.error("⏱️ Auth timeout fallback");
    setUser(null);
    setLoading(false);
  }, 5000);

  return () => clearTimeout(timer);
}, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
