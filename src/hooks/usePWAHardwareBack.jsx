import { useEffect } from "react";
import { isPWA } from "../lib/isPWA";

export default function usePWAHardwareBack({ onExit }) {
  useEffect(() => {
    if (!isPWA()) return;

    const handler = (e) => {
      e.preventDefault();

      if (onExit) {
        onExit();
      }
    };

    window.addEventListener("popstate", handler);

    // push a fake state so back button doesn't close app
    window.history.pushState(null, "", window.location.href);

    return () => {
      window.removeEventListener("popstate", handler);
    };
  }, [onExit]);
}
