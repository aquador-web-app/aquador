import { useEffect } from "react"

/**
 * HARD back/forward lock (PRODUCTION SAFE)
 * ✅ Allows refresh
 * ❌ Blocks back
 * ❌ Blocks forward
 * ❌ Blocks BFCache resurrection (desktop Chrome/Edge)
 */
export default function useHardBackLock() {
  useEffect(() => {
    let active = true

    const lock = () => {
      if (!active) return
      window.history.pushState({ locked: true }, "", window.location.href)
    }

    // Prime history stack
    lock()
    lock()
    lock()

    const onPopState = () => {
      if (!active) return
      lock()
      lock()
    }

    const onPageShow = (e) => {
      // 🔥 THIS is the missing fix
      if (e.persisted) {
        lock()
        lock()
        lock()
      }
    }

    window.addEventListener("popstate", onPopState)
    window.addEventListener("pageshow", onPageShow)

    return () => {
      active = false
      window.removeEventListener("popstate", onPopState)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [])
}
