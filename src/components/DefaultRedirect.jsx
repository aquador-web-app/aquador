// src/components/DefaultRedirect.jsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient"

export default function DefaultRedirect() {
  const navigate = useNavigate()
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) navigate("/login", { replace: true })
        return
      }
      const { data: profile, error} = await supabase
        .from("profiles_with_unpaid")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle()

      if (error) {
        console.error("Error fetching profile:", error.message)
      }

      const role = (profile?.role || "").toLowerCase()
      console.log("Redirecting based on role:", role)

      const target =
        role === "admin" ? "/admin" :
        role === "assistant" ? "/assistant" :
        role === "teacher" ? "/teacher" :
        role === "influencer" ? "/influencer" :
        "/student"

      if (!cancelled) {
        navigate(target, { replace: true })
        setDone(true)
      }
    })()
    return () => { cancelled = true }
  }, [navigate])

  if (!done) return null
  return null
}
