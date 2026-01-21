import { useRef, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";

export default function SignaturePadModal({ open, onClose, onSave }) {
  const sigRef = useRef(null);
  const wrapperRef = useRef(null);

  // ✅ Hooks are ALWAYS called
  useEffect(() => {
    if (!open) return;

    // Wait until SignatureCanvas is mounted
    requestAnimationFrame(() => {
      if (!sigRef.current || !wrapperRef.current) return;

      const canvas = sigRef.current.getCanvas?.();
      if (!canvas) return;

      const rect = wrapperRef.current.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;

      // 🔥 Critical: real canvas resolution
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;

      const ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
  }, [open]);

  const clear = () => sigRef.current?.clear();

  const save = () => {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    const data = sigRef.current.toDataURL("image/png");
    onSave(data);
    onClose();
  };

  // ✅ Conditional rendering AFTER hooks
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center">
      <div className="bg-white w-full h-full sm:max-w-3xl sm:h-[90vh] rounded-none sm:rounded-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold">Signer</h2>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1 rounded bg-gray-100"
          >
            Fermer
          </button>
        </div>

        {/* Canvas */}
        <div ref={wrapperRef} className="flex-1 bg-gray-100 p-2">
          <SignatureCanvas
  ref={sigRef}
  penColor="#000000"
  backgroundColor="white"
  minWidth={2.5}
  maxWidth={5}
  throttle={8}
  velocityFilterWeight={0.3}
  canvasProps={{
    style: {
      width: "100%",
      height: "100%",
      borderRadius: "8px",
    },
  }}
/>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t flex gap-3 justify-end">
          <button onClick={clear} className="px-4 py-2 rounded bg-gray-100">
            Effacer
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded bg-blue-600 text-white"
          >
            Sauver la signature
          </button>
        </div>
      </div>
    </div>
  );
}
