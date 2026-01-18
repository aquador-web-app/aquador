import { useEffect, useRef } from "react";

export default function useConfirmLogoutOnBack(onConfirm) {
  const blockedRef = useRef(false);

  useEffect(() => {
    // Prime history so back doesn't leave immediately
    window.history.pushState(null, "", window.location.href);

    const onPopState = () => {
      if (blockedRef.current) return;

      blockedRef.current = true;

      // Immediately push back to prevent navigation
      window.history.pushState(null, "", window.location.href);

      // Ask app to show confirmation UI
      onConfirm(() => {
        blockedRef.current = false;
      });
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [onConfirm]);
}
