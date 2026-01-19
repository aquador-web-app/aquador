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
      event.preventDefault();

      if (typeof onExit === "function") {
        onExit();
      }
    };

    window.addEventListener("popstate", handler);

    return () => {
      window.removeEventListener("popstate", handler);
    };
  }, [onExit]);
}
