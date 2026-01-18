import { useEffect, useRef } from "react";

export default function useConfirmLogoutOnBack(onConfirm) {
  const blockedRef = useRef(false);

  useEffect(() => {
    // Insert a locked history entry
    window.history.pushState({ __lock: true }, "", window.location.href);

    const onPopState = (event) => {
      // Only react to our own lock entry
      if (!event.state?.__lock) return;

      if (blockedRef.current) return;
      blockedRef.current = true;

      // Restore locked state immediately
      window.history.pushState({ __lock: true }, "", window.location.href);

      // Ask app to confirm logout
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
