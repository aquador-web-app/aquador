import { jsPDF } from "jspdf"
import QRCode from "qrcode"

export async function generateAccessCardPDF(user, logoUrl) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [105, 74] // A6 format
  })

  // Add Logo
  if (logoUrl) {
    const img = await fetch(logoUrl).then(res => res.blob()).then(blob => {
      return new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    })
    doc.addImage(img, "PNG", 5, 5, 20, 20)
  }

  doc.setFontSize(14)
  doc.setTextColor(0, 100, 200) // Bleu A'QUA D’OR
  doc.text("A'QUA D'OR", 30, 15)

  doc.setFontSize(12)
  doc.setTextColor(0, 0, 0)
  doc.text(`Nom: ${user.first_name} ${user.middle_name || ""} ${user.last_name}`, 10, 35)
  doc.text(`Date de Naissance: ${user.birth_date || "—"}`, 10, 45)
  doc.text(`Sexe: ${user.sex || "—"}`, 10, 55)
  doc.text(`Referral: ${user.referral_code || "-"}`, 10, 65)

  // Generate QR code from user.id
  const qrData = await QRCode.toDataURL(user.id, { margin: 1, width: 100 })
  doc.addImage(qrData, "PNG", 65, 25, 35, 35)

  // Save file
  doc.save(`carte_${user.first_name}_${user.last_name}.pdf`)
}
