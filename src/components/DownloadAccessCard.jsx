import { jsPDF } from "jspdf"
import QRCode from "qrcode"

export default function DownloadAccessCard({ user }) {
  const handleDownload = async () => {
    if (!user) return

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [105, 74], // A6
    })

    // Charger logo depuis /public
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
      doc.addImage(img, "PNG", 5, 5, 25, 25)
    } catch (e) {
      console.warn("Logo introuvable :", e)
    }

    doc.setFontSize(14)
    doc.setTextColor(0, 100, 200)
    doc.text("A'QUA D'OR - Carte d’Accès", 35, 15)

    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0)
    doc.text(
      `Nom: ${user.first_name} ${user.middle_name || ""} ${user.last_name}`,
      10,
      40
    )
    doc.text(`Naissance: ${user.birth_date || "-"}`, 10, 50)
    doc.text(`Sexe: ${user.sex || "-"}`, 10, 60)
    doc.text(`Referral: ${user.referral_code || "-"}`, 10, 70)

    // QR Code basé sur user.id
    const qrData = await QRCode.toDataURL(user.id, { margin: 1, width: 100 })
    doc.addImage(qrData, "PNG", 65, 25, 35, 35)

    doc.save(`carte_${user.first_name}_${user.last_name}.pdf`)
  }

  return (
    <button
      onClick={handleDownload}
      className="bg-aquaBlue text-white px-3 py-1 rounded-lg hover:bg-blue-600 text-sm"
    >
      Télécharger Carte
    </button>
  )
}
