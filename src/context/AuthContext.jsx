import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import OneSignal from "react-onesignal";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const resolvingRef = useRef(false);

  // 🔐 SAFE resolver: session is truth; profile is optional
  const resolveUser = async (session) => {
    // prevent overlapping resolves
    if (resolvingRef.current) return;
    resolvingRef.current = true;

    try {
      if (!session?.user) {
        setUser(null);
        return;
      }

      setLoading(true);

      let profile = null;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error) console.warn("⚠️ Profile fetch error:", error);
        profile = data;
      } catch (e) {
        console.warn("⚠️ Profile fetch threw:", e);
      }

      const safeUser = {
        id: session.user.id,
        email: session.user.email,
        role: profile?.role ?? "user",
        full_name: profile?.full_name ?? "",
        permissions: Array.isArray(profile?.permissions) ? profile.permissions : [],
      };

      setUser(safeUser);

      // 🔔 OneSignal must NEVER block auth
      try {
        OneSignal.login(session.user.id).catch(() => {});
        if (safeUser.role) OneSignal.sendTag("role", safeUser.role).catch(() => {});
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
      resolvingRef.current = false;
    }
  };

  // 1️⃣ initial session + auth changes
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) resolveUser(session);
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (mounted) resolveUser(session);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 2️⃣ ⏱️ loader failsafe (NEVER logs out)
  useEffect(() => {
    if (!loading) return;

    const timer = setTimeout(() => {
      // If we're still loading after 12s, stop the loader but DON'T clear user.
      console.error("⏱️ Auth loader timeout — stopping loader (no logout)");
      setLoading(false);
    }, 12000);

    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
