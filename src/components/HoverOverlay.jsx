// src/components/HoverOverlay.jsx
import { useEffect, useState } from "react";

export default function HoverOverlay({
  anchorRef,
  visible,
  onMouseEnter,
  onMouseLeave,
  children,
  width,
}) {
  const [style, setStyle] = useState({});

  useEffect(() => {
    if (!visible || !anchorRef?.current) return;

    const rect = anchorRef.current.getBoundingClientRect();

    const WIDTH = width || 360;
    const GAP = 8;
    const PADDING = 12;

    // 🔹 CENTER of the card vertically
    let top = rect.top + rect.height / 2;

    // 🔹 CENTER horizontally
    let left = rect.left + rect.width / 2 - WIDTH / 2;

    // Clamp horizontally
    left = Math.max(
      PADDING,
      Math.min(left, window.innerWidth - WIDTH - PADDING)
    );

    setStyle({
      position: "fixed",
      top,
      left,
      width: WIDTH,
      zIndex: 9999,
    });
  }, [visible, anchorRef]);

  if (!visible) return null;

  return (
    <div
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="
        bg-white/95 backdrop-blur
        border border-gray-200
        rounded-xl
        shadow-2xl
        pointer-events-auto
      "
    >
      <div className="max-h-80 overflow-auto px-4 py-3 text-sm">
        {children}
      </div>
    </div>
  );
}
