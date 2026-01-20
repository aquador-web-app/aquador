import { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

export default function SignaturePadModal({ open, onClose, onSave }) {
  const ref = useRef(null);

  if (!open) return null;

  const clear = () => ref.current?.clear();

  const save = () => {
    if (!ref.current || ref.current.isEmpty()) return;
    const data = ref.current.toDataURL("image/png");
    onSave(data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center">
      <div className="bg-white w-full h-full sm:max-w-3xl sm:h-[90vh] rounded-none sm:rounded-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold">Signer</h2>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded bg-gray-100">
            Fermer
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-gray-100 p-2">
          <SignatureCanvas
            ref={ref}
            penColor="black"
            backgroundColor="white"
            canvasProps={{
              className: "w-full h-full rounded-md",
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
