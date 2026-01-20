import { useState } from "react";
import SignaturePadModal from "./SignaturePadModal";

export default function SignatureField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{label}</div>

      {value ? (
        <div className="border rounded-md p-2 bg-white">
          <img
            src={value}
            alt="signature"
            className="h-[80px] object-contain"
          />
          <button
            type="button"
            className="mt-2 text-sm text-blue-600"
            onClick={() => setOpen(true)}
          >
            Modifier la signature
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200"
        >
          ✍️ Signer
        </button>
      )}

      <SignaturePadModal
        open={open}
        onClose={() => setOpen(false)}
        onSave={onChange}
      />
    </div>
  );
}
