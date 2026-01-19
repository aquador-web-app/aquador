import { useEffect } from "react";
import { isPWA } from "../lib/isPWA";

/**
 * SAFE PWA hardware back handler
 * - NEVER breaks history
 * - NEVER throws
 * - Android-safe
 */
export default function usePWAHardwareBack({ onExit }) {
  useEffect(() => {
    if (!isPWA()) return;

    const handler = (event) => {
      try {
        // Push a dummy state to keep app alive
        window.history.pushState(null, "", window.location.href);

        if (typeof onExit === "function") {
          onExit();
        }
      } catch (err) {
        console.error("PWA back handler error", err);
      }
    };

    // Push initial state
    window.history.pushState(null, "", window.location.href);

    window.addEventListener("popstate", handler);

    return () => {
      window.removeEventListener("popstate", handler);
    };
  }, [onExit]);
}
