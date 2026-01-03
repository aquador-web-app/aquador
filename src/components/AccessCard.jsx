import { QRCodeSVG } from "qrcode.react"
import { jsPDF } from "jspdf"
import QRCodeGen from "qrcode"

export default function AccessCard({ user }) {
  if (!user) return null

  const handleDownloadPDF = async () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [105, 74], // A6
    })

    // 🎨 Bordure extérieure (carte)
    doc.setLineWidth(1.5)
    doc.setDrawColor(0, 100, 200) // bleu aqua
    doc.roundedRect(2, 2, 101, 70, 5, 5) // (x, y, w, h, rx, ry)

    // 🎨 Cadre intérieur
    doc.setLineWidth(0.5)
    doc.setDrawColor(150)
    doc.roundedRect(6, 6, 93, 62, 3, 3)

    // 🔹 Charger le logo
    const logoUrl = "/A'QUA D'OR.png"
    try {
      const img = await fetch(logoUrl)
        .then((res) => res.blob())
        .then(
          (blob) =>
            new Promise((resolve) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result)
              reader.readAsDataURL(blob)
            })
        )
      doc.addImage(img, "PNG", 8, 8, 20, 20)
    } catch (e) {
      console.warn("Logo introuvable :", e)
    }

    // 🔹 En-tête
    doc.setFontSize(14)
    doc.setTextColor(0, 100, 200)
    doc.text("A'QUA D'OR - Carte d’Accès", 35, 15)

    // 🔹 Infos utilisateur
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text(
      `Nom: ${user.first_name} ${user.middle_name || ""} ${user.last_name}`,
      10,
      40
    )
    doc.text(`Naissance: ${user.birth_date || "-"}`, 10, 48)
    doc.text(`Sexe: ${user.sex || "-"}`, 10, 56)
    doc.text(`Referral: ${user.referral_code || "-"}`, 10, 64)

    // 🔹 QR Code dans le PDF
    const qrData = await QRCodeGen.toDataURL(user.id, { margin: 1, width: 100 })
    doc.addImage(qrData, "PNG", 65, 28, 30, 30)

    // ✅ Sauvegarde
    doc.save(`carte_${user.first_name}_${user.last_name}.pdf`)
  }

  return (
    <div className="card text-center space-y-3 p-4 bg-white rounded-xl shadow">
      <h2 className="font-bold text-aquaBlue">Carte d’Accès</h2>
      <p className="font-semibold">
        {user.first_name} {user.middle_name || ""} {user.last_name}
      </p>
      <p className="text-sm text-gray-600">Naissance : {user.birth_date || "—"}</p>
      <p className="text-sm text-gray-600">Sexe : {user.sex || "—"}</p>
      <p className="text-sm text-gray-600">Referral : {user.referral_code || "-"}</p>

      {/* QR visible à l’écran */}
      <div className="flex justify-center">
        <QRCodeSVG value={user.id} size={120} />
      </div>

      <p className="text-xs text-gray-500">
        Présenter cette carte à l’entrée et à la sortie
      </p>

      <button
        onClick={handleDownloadPDF}
        className="bg-aquaBlue text-white px-3 py-1 rounded-lg hover:bg-blue-600 text-sm"
      >
        Télécharger en PDF
      </button>
    </div>
  )
}
