import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { formatDateFrSafe } from "../lib/dateUtils";

export async function exportAllCardsPDF(input) {
  const users = Array.isArray(input) ? input : [input];
  if (!users || users.length === 0) {
    alert("Aucun utilisateur à exporter");
    return;
  }

  const width = 55;
  const height = 85;
  const centerX = width / 2;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [width, height] });

  const logoUrl = "https://jrwsxeiueezuiueglfpv.supabase.co/storage/v1/object/public/assets/aquador.png";

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    doc.setFillColor(240, 248, 255);
    doc.rect(0, 0, width, height, "F");
    doc.setFillColor(0, 102, 204);
    doc.rect(0, 0, width, 13.5, "F");

    try {
      const img = await fetch(logoUrl)
        .then((res) => res.blob())
        .then((blob) => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        }));
      const logoWidth = 12;
      const logoX = (width - logoWidth) / 2;
      doc.addImage(img, "PNG", logoX, 1.5, logoWidth, 12);
    } catch (e) {
      console.warn("Logo introuvable :", e);
    }

    const qrData = await QRCode.toDataURL(user.id || "", { margin: 1, width: 100 });
    const qrWidth = 45;
    const qrX = (width - qrWidth) / 2;
    doc.addImage(qrData, "PNG", qrX, 14.5, qrWidth, qrWidth);

    const fullName = `${user.first_name || ""} ${user.middle_name || ""} ${user.last_name || ""}`.trim();
    const birth = user.birth_date ? formatDateFrSafe(user.birth_date) : "-";
    const sex = user.sex || "-";
    const ref = user.referral_code || "-";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 100, 200);
    doc.text("A'QUA D'OR - Carte d’Accès", centerX, 64, { align: "center" });

    // Responsive name size
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    let fontSize = 10;
    doc.setFontSize(fontSize);
    const nameLabel = `Nom: ${fullName}`;
    while (doc.getTextWidth(nameLabel) > width - 10 && fontSize > 6) {
      fontSize -= 0.3;
      doc.setFontSize(fontSize);
    }

    let y = 69;
    doc.text(nameLabel, centerX, y, { align: "center" });
    y += 5;
    doc.setFontSize(10);
    doc.text(`Naissance: ${birth}`, centerX, y, { align: "center" });
    y += 5;
    const leftX = centerX - 20;
    const rightX = centerX + 20;
    doc.text(`Sexe: ${sex}`, leftX, y);
    doc.text(`Referral: ${ref}`, rightX, y, { align: "right" });
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("© A'QUA D'OR", centerX, height - 2, { align: "center" });

    if (i < users.length - 1) doc.addPage([width, height], "portrait");
  }

  const filename = users.length === 1
    ? `carte_${users[0].first_name || "utilisateur"}.pdf`
    : "cartes_utilisateurs.pdf";

  doc.save(filename);
}
