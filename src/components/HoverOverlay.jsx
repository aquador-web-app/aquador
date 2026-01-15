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

    const BASE_WIDTH = width || 360;

    // Viewport-aware width
    const viewportPadding = 16;
    const maxAllowedWidth = window.innerWidth - viewportPadding * 2;

    const isMobile = window.innerWidth < 640;

    const finalWidth = isMobile
      ? maxAllowedWidth
      : Math.min(BASE_WIDTH, maxAllowedWidth);

    const PADDING = 12;

    // 🔹 CENTER of the card vertically
    let top = rect.top + rect.height / 2;

    // 🔹 CENTER horizontally (USE finalWidth)
    let left = rect.left + rect.width / 2 - finalWidth / 2;

    // Clamp horizontally (USE finalWidth)
    left = Math.max(
      PADDING,
      Math.min(left, window.innerWidth - finalWidth - PADDING)
    );

    setStyle({
      position: "fixed",
      top,
      left,
      width: finalWidth,
      maxWidth: `calc(100vw - ${viewportPadding * 2}px)`,
      zIndex: 9999,
    });
  }, [visible, anchorRef, width]);

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
