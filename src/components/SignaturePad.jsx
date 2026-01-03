import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'

export default function SignaturePad({ onSave }) {
  const ref = useRef()
  const [saved, setSaved] = useState(false)

  const clear = () => {
    ref.current.clear()
    setSaved(false)
    onSave(null)
  }

  const save = () => {
    const data = ref.current.toDataURL()
    setSaved(true)
    onSave(data)
  }

  return (
    <div className="border rounded-xl p-2 bg-gray-50">
      <SignatureCanvas
        ref={ref}
        canvasProps={{ width: 750, height: 300, className: 'bg-white rounded' }}
      />
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={clear} className="btn btn-sm">Effacer</button>
        <button type="button" onClick={save} className="btn btn-sm btn-primary">Sauver</button>
      </div>
      {saved && <p className="text-green-600 text-xs mt-1">Signature sauvegardée ✅</p>}
    </div>
  )
}
