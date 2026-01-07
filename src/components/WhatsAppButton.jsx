import { useEffect, useRef } from "react";

export default function WhatsAppButton() {
  const phone = "50938912429";
  const message = encodeURIComponent(
    "Bonjour, j’aimerais avoir quelques informations…"
  );
  const url = `https://wa.me/${phone}?text=${message}`;

  const btnRef = useRef(null);
  const isTouchRef = useRef(false);
  const draggingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });

  // ✅ Detect mobile / touch device
  useEffect(() => {
    isTouchRef.current =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }, []);

  const onPointerDown = (e) => {
    if (!isTouchRef.current || e.pointerType !== "touch") return;

    draggingRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (e) => {
    if (!isTouchRef.current || e.pointerType !== "touch") return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      draggingRef.current = true;
    }

    btnRef.current.style.transform = `translate(${offsetRef.current.x + dx}px, ${
      offsetRef.current.y + dy
    }px)`;
  };

  const onPointerUp = (e) => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);

    if (!draggingRef.current) return;

    offsetRef.current.x += e.clientX - startRef.current.x;
    offsetRef.current.y += e.clientY - startRef.current.y;
  };

  const onClick = (e) => {
    if (draggingRef.current) {
      e.preventDefault(); // 🚫 don’t open WhatsApp when dragging
    }
  };

  return (
    <a
      ref={btnRef}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        backgroundColor: "#25D366",
        borderRadius: "50%",
        width: "60px",
        height: "60px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        zIndex: 9999,
        touchAction: "none", // 🔑 required for dragging on mobile
        userSelect: "none",
      }}
      aria-label="WhatsApp"
    >
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
        alt="WhatsApp"
        style={{ width: "35px", height: "35px" }}
      />
    </a>
  );
}
