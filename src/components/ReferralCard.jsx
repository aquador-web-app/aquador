export default function ReferralCard({ code }) {
  const copy = () => {
    navigator.clipboard.writeText(code)
    alert("Code copié: " + code)
  }

  const shareLink = `${window.location.origin}/register?ref=${code}`

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <h2 className="text-lg font-bold mb-2">Votre code referral</h2>
      <div className="flex items-center gap-3">
        <span className="font-mono bg-gray-100 px-3 py-1 rounded">{code}</span>
        <button
          className="bg-aquaBlue text-white px-3 py-1 rounded hover:bg-blue-600"
          onClick={copy}
        >
          Copier
        </button>
      </div>
      <div className="mt-2 text-sm text-gray-600">
        Lien de partage: <span className="underline">{shareLink}</span>
      </div>
    </div>
  )
}
