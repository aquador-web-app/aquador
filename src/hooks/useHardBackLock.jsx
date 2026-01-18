import { useEffect } from "react"

/**
 * HARD back/forward lock
 * ✅ Allows refresh
 * ❌ Blocks single back
 * ❌ Blocks double back
 * ❌ Blocks swipe gestures
 * ❌ Blocks forward resurrection
 */
export default function useHardBackLock() {
  useEffect(() => {
    let active = true

    const lock = () => {
      if (!active) return
      window.history.pushState({ locked: true }, "", window.location.href)
    }

    // Prime the history with MULTIPLE guards
    lock()
    lock()
    lock()

    const onPopState = () => {
      if (!active) return
      lock()
      lock()
    }

    window.addEventListener("popstate", onPopState)

    return () => {
      active = false
      window.removeEventListener("popstate", onPopState)
    }
  }, [])
}
