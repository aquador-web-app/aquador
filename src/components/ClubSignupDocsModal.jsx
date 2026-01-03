// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SignaturePad from "./SignaturePad";

/**
 * Utilities
 */
function sanitizeFileName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w\-./]/g, "");
}

function formatDateFrSafe(d = new Date()) {
  try {
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  } catch {
    const dt = new Date();
    return dt.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  }
}

/**
 * Edge function endpoint that renders HTML -> PDF and uploads it to storage.
 * Body we send (club version):
 * {
 *   full_name,
 *   documents: [{
 *     form_name,
 *     html_content,
 *     output_path: "club/<full_name_sanitized>/xxx.pdf"
 *   }]
 * }
 * Returns: { results: [{ url }] }
 */
async function sendHTMLToPDFAndUpload({ html, formName, fullName, outputPath }) {
  const endpoint = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/sign-documents`;
  try {
    const safeForm = sanitizeFileName(formName);
const safeFull = sanitizeFileName(fullName || "Utilisateur");

const safeOutputPath =
  outputPath ??
  `club/bookings/${safeFull}/${safeForm}_signed.pdf`;


    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        user_id: "anonymous",  
        full_name: safeFull,
        documents: [
          {
            form_name: safeForm,
            html_content: html,
            output_path: safeOutputPath, // 👈 let edge function store under club/...
          },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`PDF service error (${res.status}): ${txt || "unknown"}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!data?.results?.[0]?.url) {
      throw new Error("No URL returned by PDF service");
    }
    return data.results[0].url;
  } catch (err) {
    console.error("❌ sendHTMLToPDFAndUpload error:", err);
    throw err;
  }
}

/**
 * CLUB RULES & ACCORD MODAL
 *
 * Props:
 *  - fullName: string
 *  - onClose(): void
 *  - onDone(results: Array<{form_name, url, id_file_url?}>): void
 */
export default function ClubSignupDocsModal({ fullName = "", onClose, onDone }) {
  const [step, setStep] = useState(1); // 1=Règlements, 2=Accord
  const [saving, setSaving] = useState(false);
  const [uiError, setUiError] = useState("");

  // Logo
  const [logoUrl, setLogoUrl] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const { data } = supabase.storage.from("assets").getPublicUrl("aquador.png");
        const publicUrl = data?.publicUrl;
        if (!publicUrl) return;

        const res = await fetch(publicUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          setLogoUrl(reader.result); // base64 data URL
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn("⚠️ Failed to fetch logo as base64:", err);
      }
    })();
  }, []);

  // Date
  const [nowDate, setNowDate] = useState(formatDateFrSafe());
  useEffect(() => {
    setNowDate(formatDateFrSafe());
  }, []);

  // === Step 1: Règlements du club ===
  const [rulesSignature, setRulesSignature] = useState(null);
  const [rulesIdNumber, setRulesIdNumber] = useState(""); // NIF/CIN
  const [rulesSigningFor, setRulesSigningFor] = useState(""); // Responsable pour (groupe, enfants, etc.)
  const [rulesIdFile, setRulesIdFile] = useState(null); // ID image/pdf upload

  // Checkboxes: only for rules 8+ (we enforce these)
  const RULES_CHECKBOXES = [
    {
      id: "r8",
      label: "Aucun enfant de moins de 14 n’est autorisé à se baigner sans la présence d’un parent/tuteur.",
    },
    {
      id: "r9",
      label:
        "Les enfants qui ne sont pas formés à la propreté doivent porter des couches adaptées à la piscine avec un pantalon en plastique par-dessus, sans exception.",
    },
    {
      id: "r10",
      label:
        "L’utilisation des douches avant d’entrer dans la piscine est demandée, surtout après les sports actifs.",
    },
    {
      id: "r11",
      label:
        "Le club n’acceptera aucune responsabilité pour les effets personnels laissés dans les vestiaires ou pour la perte ou les dommages aux biens personnels.",
    },
    {
      id: "r12",
      label:
        "Le bruit, l’impolitesse, les jeux dangereux, les jeux de chevaux et la vulgarité ne sont pas autorisés (course, lutte, bousculade, etc.).",
    },
    {
      id: "r13",
      label: "Il est INTERDIT DE COURIR autour de la piscine.",
    },
    {
      id: "r14",
      label:
        "Il est INTERDIT DE FUMER dans les locaux du Club. L’utilisation de drogues dans l’enceinte du Club est INTERDITE.",
    },
    {
      id: "r15",
      label: "MANGER, MACHER UNE GOMME, BOIRE dans la piscine ne sont pas autorisés.",
    },
    {
      id: "r16",
      label: "L’utilisation et la présence des boissons alcoolisées est à éviter.",
    },
    {
      id: "r17",
      label: "Toutes les blessures doivent être signalées immédiatement à la direction.",
    },
    {
      id: "r18",
      label:
        "La piscine peut être fermée s’il y a mauvais temps. L’accès à la piscine est interdit en cas de pluie.",
    },
    {
      id: "r19",
      label: "Les animaux domestiques ne sont pas autorisés dans le club.",
    },
    {
      id: "r20",
      label: "Le coût de tout dommage matériel sera facturé au client.",
    },
    {
      id: "r21",
      label:
        "Le port d’une tenue de bain correcte est obligatoire. Chaussures, jeans et tenues indiscrètes ne sont pas autorisées dans la piscine.",
    },
    {
      id: "r22",
      label:
        "Toutes les boissons ou aliments apportés dans la zone de la piscine doivent être dans des contenants en papier ou en plastique. Aucun verre n’est autorisé.",
    },
    {
      id: "r23",
      label:
        "Crachats, émouchements du nez, jets d'eau, élimination des déchets corporels et actes insalubres dans la piscine sont interdits.",
    },
    {
      id: "r24",
      label:
        "L'accès à la piscine est refusé à toute personne atteinte de maladie contagieuse, yeux irrités, rhume, écoulements nasaux ou auriculaires, plaies ouvertes ou bandages.",
    },
    {
      id: "r25",
      label: "Le parent/tuteur doit surveiller de près ses enfants en tout temps.",
    },
    {
      id: "r26",
      label: "Aucune séance de photos n’est permise sans l’autorisation du responsable.",
    },
    {
      id: "r27",
      label: "Tous les déchets doivent être jetés dans une poubelle.",
    },
    {
      id: "r28",
      label: "INTERDICTION DE SE BAIGNER NU dans la piscine.",
    },
  ];

  const [rulesChecked, setRulesChecked] = useState(
    () =>
      RULES_CHECKBOXES.reduce((acc, r) => {
        acc[r.id] = false;
        return acc;
      }, {})
  );

  const allRulesChecked = RULES_CHECKBOXES.every((r) => rulesChecked[r.id]);

  // === Step 2: Accord du participant (club DAYPASS) ===
  const [accordSignature, setAccordSignature] = useState(null);

  // Signed results
  const [results, setResults] = useState([]); // { form_name, url, id_file_url? }

  const docWrapClasses =
    "border rounded-lg p-4 max-h-[45vh] overflow-auto bg-white shadow-inner";

  /**
   * ---------- FULL TEXTS (inline) ----------
   * (1) RÈGLES DU CLUB
   */
  const RULES_TEXT = `
<h2 style="text-align:center; margin-bottom:8px;"><strong>RÈGLES DU CLUB A’QUA D’OR</strong></h2>
<p><strong>L’ESPACE EST UN ENDROIT CHRÉTIEN</strong></p>
<p>Ces règles ont été établies pour protéger votre santé et votre sécurité. Veuillez les consulter avant de venir à la piscine.</p>
<br/>
<p>Le gestionnaire peut exclure toute personne de la piscine pour un motif valable à tout moment. Les activités de la piscine et du club peuvent être dangereuses. Les membres doivent avoir signé l'Accord du participant pour participer aux activités de la piscine. Participez à vos risques et périls. Tous les visiteurs acceptent de respecter les règles suivantes :</p>
<br/>

<p>• Tous les visiteurs utiliseront l’installation à leurs propres risques. LE CLIENT SIGNE L’ACCORD DU PARTICIPANT POUR LUI ET SON GROUPE, libérant A’QUA D’OR de toute responsabilité.</p>
<p>• Pas de nuisance sonore ! NE PAS déranger les voisins avec la musique.</p>
<p>• INTERDICTION D’ALLER OUVRIR LA BARRIERE SANS L’AUTORISATION DU GARDIEN (Veuillez vous adresser au gardien s’il y a une personne à la barrière).</p>
<p>• Les musiques avec les spécificités ci-après sont INTERDITES (contenant des paroles malsaines, prônant la violence et le sexe, musique racine (vodou), rabòday et toutes les musiques du genre).</p>
<p>• Les visiteurs doivent nettoyer après eux et traiter le club avec respect.</p>
<p>• Le client est responsable de ses actions ainsi que celles de ses invités.</p>
<p>• Les jeunes enfants de moins de 14 ans doivent être accompagnés d’un adulte en tout temps.</p>

<p>• Aucun enfant de moins de 14 n’est autorisé à se baigner sans la présence d’un parent/tuteur.</p>
<p>• Les enfants qui ne sont pas formés à la propreté doivent porter des couches adaptées à la piscine avec un pantalon en plastique sur les couches - sans exception ! Les Huggies nécessitent également des pantalons en plastique.</p>
<p>• L’utilisation des douches avant d’entrer dans la piscine est demandée, surtout après les sports actifs.</p>
<p>• Le club n’acceptera aucune responsabilité pour les effets personnels laissés dans les vestiaires ou pour la perte ou les dommages aux biens personnels.</p>
<p>• Le bruit, l’impolitesse, les jeux dangereux, les jeux de chevaux et la vulgarité ne seront pas autorisés. Cela inclut la course, la lutte, la bousculade etc.</p>
<p>• Il est INTERDIT DE COURIR autour de la piscine.</p>
<p>• Il est INTERDIT DE FUMER dans les locaux du Club. L’utilisation de drogues dans l’enceinte du CLUB est INTERDITE.</p>
<p>• MANGER, MACHER UNE GOMME, BOIRE dans la piscine ne sont pas autorisés.</p>
<p>• L’utilisation et la présence des boissons alcoolisées est à éviter.</p>
<p>• Toutes les blessures doivent être signalées immédiatement à la direction.</p>
<p>• La piscine peut être fermée s’il y a mauvais temps. L’accès à la piscine est interdit en cas de pluie.</p>
<p>• Les animaux domestiques ne sont pas autorisés dans le club.</p>
<p>• Le coût de tout dommage matériel sera facturé au client.</p>
<p>• Le port d'une tenue de bain correcte est obligatoire. Chaussures, tennis, jeans, et tenues indiscrètes ne sont pas autorisées dans la piscine.</p>
<p>• Toutes les boissons ou aliments apportés dans la zone de la piscine doivent être dans des contenants en papier ou en plastique. Aucun verre d'aucun genre n’est autorisé.</p>
<p>• Crachats, émouchements du nez, jets d'eau, élimination des déchets corporels et actes insalubres dans la piscine sont interdits.</p>
<p>• L'accès à la piscine est refusé à toute personne atteinte de maladies contagieuses, yeux irrités ou enflammés, rhume, écoulements nasaux ou auriculaires, plaies ouvertes ou bandages de toute sorte.</p>
<p>• Le parent/tuteur doit surveiller de près ses enfants en tout temps.</p>
<p>• AUCUNE SÉANCE DE PHOTOS N’EST PERMISE SANS L’AUTORISATION DU RESPONSABLE.</p>
<p>• TOUS LES DÉCHETS DOIVENT ÊTRE JETEÉS DANS UNE POUBELLE.</p>
<p>• INTERDICTION DE SE BAIGNER NU DANS LA PISCINE.</p>

<br/>
<p>Tous les visiteurs sont priés de respecter les règles d'utilisation de la piscine et des locaux du Club. Ces règles ont été compilées pour bénéficier et protéger tous les utilisateurs. Des situations peuvent survenir où il n'y a pas de règles applicables. Dans ces cas, les visiteurs sont tenus de se conformer aux demandes raisonnables du Responsable.</p>
<br/>

<p>Je soussigné(e) <strong>{{NOM_COMPLET}}</strong>, identifié(e) au numéro <strong>{{ID_NUMBER}}</strong>, responsable pour <strong>{{RESP_POUR}}</strong>, déclare avoir pris connaissance des règles ci-dessus et y souscrire sans réserve.</p>
<br/><br/>

<table style="width:100%; margin-top:8px; border-collapse:collapse;">
  <tr>
    <td style="border:none; padding:4px 0;">
      <strong>Signature :</strong>
      <span style="display:inline-block; vertical-align:middle; width:100px; height:75px; border:1px solid #ffffff; margin-left:6px; text-align:center;">
        {{SIGNATURE_RULES}}
      </span>
    </td>
    <td style="border:none; padding:4px 0; text-align:left;">
      <strong>Date :</strong> <span style="margin-left:6px;">{{DATE_DU_JOUR}}</span>
    </td>
  </tr>
</table>
`;

  /**
   * (2) ACCORD DU PARTICIPANT (DAYPASS - club)
   */
  const ACCORD_TEXT = `
<h2 style="text-align:center; margin-bottom:8px;">ACCORD DU PARTICIPANT, RENONCIATION ET ACCEPTATION DES RISQUES</h2>

<p>En considération des services du Club A’QUA D’OR, j'accepte par la présente ce qui suit :</p>
<br/>

<p>1. Je reconnais que mon adhésion au club de natation comporte des risques connus et imprévus pouvant entraîner, sans que ce soit une liste exhaustive, des blessures physiques ou émotionnelles, une paralysie, des dommages à moi-même, à des biens ou à des tiers, ou même la mort. Je comprends que de tels risques ne peuvent tout simplement pas être éliminés sans mettre en péril les qualités essentielles de l'activité. Les risques incluent, entre autres : foulures et entorses musculaires, complications cardiaques, noyade accidentelle, glissades et chutes en entrant et en sortant de la piscine et autour de la piscine. De plus, les employés de A’QUA D’OR ont des tâches difficiles à accomplir. Ils recherchent la sécurité, mais ils ne sont pas infaillibles. Ils peuvent donner des avertissements ou des instructions inadéquats, et l'équipement utilisé peut mal fonctionner.</p>
<br/>

<p>2. J'accepte et promets expressément d'accepter et d'assumer tous les risques existant dans cette activité. Ma participation à cette activité est purement volontaire, et je choisis de participer malgré les risques.</p>
<br/>

<p>3. Par la présente, je libère volontairement, décharge pour toujours et accepte d'indemniser et de dégager de toute responsabilité A’QUA D’OR de toute réclamation, demande ou cause d'action, qui est liée de quelque manière que ce soit à ma participation à cette activité ou à mon utilisation de l'équipement ou des installations de A’QUA D’OR.</p>
<br/>

<p>4. Si A'QUA D'OR ou toute personne agissant en son nom devait engager des honoraires et des frais d'avocat pour faire respecter cet accord, j'accepte de les indemniser et de les dégager de toute responsabilité pour tous ces frais et dépenses.</p>
<br/>

<p>5. Je certifie avoir une assurance adéquate pour couvrir toute blessure ou tout dommage que je pourrais causer ou subir lors de ma participation. Dans le cas contraire, j'accepte de supporter moi-même les coûts de ces blessures ou de ces dommages. Je certifie en outre que je suis prêt à assumer le risque de toute condition médicale ou physique que je pourrais avoir.</p>
<br/>

<p>6. J'ai lu et j'accepte de respecter les règles du club.</p>
<br/>

<p>En signant ce document, je reconnais que si quelqu'un est blessé ou des biens sont endommagés lors de ma participation à cette activité, je peux être reconnu par un tribunal avoir renoncé à mon droit de maintenir une poursuite contre A'QUA D'OR sur la base de toute réclamation dont je les ai libérés ici.</p>
<br/><br/>

<p><strong>AU NOM ET POUR LE GROUPE QUI M’ACCOMPAGNE</strong></p>
<p><strong>Nom complet :</strong> {{NOM_COMPLET}}</p>

<table style="width:100%; margin-top:8px; border-collapse:collapse;">
  <tr>
    <td style="border:none; padding:4px 0;">
      <strong>Signature :</strong>
      <span style="display:inline-block; vertical-align:middle; width:100px; height:75px; border:1px solid #ffffff; margin-left:6px; text-align:center;">
        {{SIGNATURE_ACCORD}}
      </span>
    </td>
    <td style="border:none; padding:4px 0; text-align:left;">
      <strong>Date :</strong> <span style="margin-left:6px;">{{DATE_DU_JOUR}}</span>
    </td>
  </tr>
</table>
`;

  /**
   * Renderers: inject signature images & fields into HTML
   */
  function imgTag(dataUrl, alt = "signature", w = 300, h = 70) {
    if (!dataUrl)
      return `<span style="color:#999;">(signature manquante)</span>`;
    return `<img src="${dataUrl}" alt="${alt}" width="${w}" height="${h}" style="object-fit:contain;" />`;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function wrapHTML(inner) {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page {
      margin-top: 0.1in;
      margin-right: 0.5in;
      margin-bottom: 0.5in;
      margin-left: 0.5in;
    }
    body {
      font-family: "Poppins", "Segoe UI", Roboto, Arial, sans-serif;
      color: #111;
      margin: 0;
      padding: 0;
      line-height: 1.55;
      font-size: 14px;
      background: #fff;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      border-bottom: 2px solid #00bfff;
      padding: 16px 0 8px;
      margin-bottom: 20px;
    }
    header img {
      max-height: 65px;
      width: auto;
    }
    br {
      display: block;
      content: "";
      margin-top: var(--br-space, 1.5px);
    }
    h2 {
      text-align: center;
      font-size: 18px;
      margin: 8px 0 10px;
      color: #001f5c;
    }
    p {
      margin: 1px 0;
      text-align: justify;
    }
    ul {
      margin: 6px 0 6px 20px;
      padding: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th, td {
      border: 1px solid #999;
      padding: 6px;
      text-align: left;
    }
    strong { font-weight: 600; }
    .signature-box {
      width: 320px;
      height: 80px;
      border: 1px solid #999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
</head>
<body>
  <header>
    ${logoUrl ? `<img src="${logoUrl}" alt="Logo A'QUA D'OR"/>` : ""}
  </header>
  <main>
    ${inner}
  </main>
</body>
</html>`;
  }

  function renderRulesHTML() {
    const resp = rulesSigningFor?.trim() || "—";
    return wrapHTML(
      RULES_TEXT
        .replaceAll("{{NOM_COMPLET}}", escapeHtml(fullName || ""))
        .replaceAll("{{ID_NUMBER}}", escapeHtml(rulesIdNumber || ""))
        .replaceAll("{{RESP_POUR}}", escapeHtml(resp))
        .replace("{{SIGNATURE_RULES}}", imgTag(rulesSignature, "signature-regles"))
        .replaceAll("{{DATE_DU_JOUR}}", nowDate)
    );
  }

  function renderAccordHTML() {
    return wrapHTML(
      ACCORD_TEXT.replaceAll("{{NOM_COMPLET}}", escapeHtml(fullName || ""))
        .replace("{{SIGNATURE_ACCORD}}", imgTag(accordSignature, "signature-accord"))
        .replaceAll("{{DATE_DU_JOUR}}", nowDate)
    );
  }

  /**
   * Helpers for in-modal preview (just for on-screen preview)
   */
  function wrapHTMLPreview(inner) {
    return `
<div style="font-size:14px; line-height:1.5;">
${inner}
</div>`;
  }

  function previewSignatureBox(sig) {
    if (!sig)
      return `<span style="display:inline-block; width:70px; height:70px; color:#999; text-align:center;">(signature)</span>`;
    return `<img src="${sig}" alt="signature" style="width:300px; height:70px; object-fit:contain;" />`;
  }

  /**
   * Upload ID file into signed_docs/club/<full_name>/ID_<timestamp>.<ext>
   */
  async function uploadRulesIdIfAny(folder) {
    if (!rulesIdFile) {
      throw new Error("Veuillez ajouter une pièce d'identité.");
    }
    const file = rulesIdFile;
    const ext = (file.name?.split(".").pop() || "bin").toLowerCase();
    const path = `club/bookings/${folder}/ID_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("signed_docs")
      .upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });
    if (error) throw error;

    const { data } = supabase.storage.from("signed_docs").getPublicUrl(path);
    return data?.publicUrl || null;
  }

  /**
   * Save Step 1: Règlements
   */
  async function saveRules() {
    setUiError("");

    if (!rulesSignature) {
      return setUiError("Veuillez signer les règlements.");
    }
    if (!rulesIdNumber) {
      return setUiError("Veuillez saisir votre NIF/CIN.");
    }
    if (!rulesIdFile) {
      return setUiError("Veuillez téléverser une pièce d'identité.");
    }
    if (!allRulesChecked) {
      return setUiError(
        "Veuillez cocher toutes les cases pour confirmer que vous acceptez les règles du club."
      );
    }

    try {
      setSaving(true);
      const safeFull = sanitizeFileName(fullName || "Utilisateur");
      const folder = safeFull;
      const outputPath = `club/bookings/${safeFull}/Reglements_du_club_signed.pdf`;

      // 1️⃣ Upload ID
      let idUrl = null;
      try {
        idUrl = await uploadRulesIdIfAny(folder);
      } catch (idErr) {
        console.error("❌ ID upload failed:", idErr);
        setUiError("Erreur lors du téléchargement de la pièce d'identité.");
        setSaving(false);
        return;
      }

      // 2️⃣ Generate PDF
      const html = renderRulesHTML();
      let pdfUrl;
      try {
        pdfUrl = await sendHTMLToPDFAndUpload({
          html,
          formName: "Reglements_du_club",
          fullName,
          outputPath,
        });
      } catch (pdfErr) {
        console.error("❌ PDF generation failed:", pdfErr);
        setUiError("Erreur lors de la création du PDF des règlements.");
        setSaving(false);
        return;
      }

      // 3️⃣ Record result locally
const item = {
  form_name: "Règlements du club",
  url: pdfUrl,
};
if (idUrl) item.id_file_url = idUrl;

setResults((r) => [...r, item]);

// 👉 Move to ACCORD step
setSaving(false);
setStep(2);
// (Optional) remove if you don't want Step 2 in modal anymore
// setStep(2);

    } catch (err) {
      console.error("💥 Unexpected saveRules error:", err);
      setUiError(err.message || String(err));
      setSaving(false);
    }
  }

  /**
   * Save Step 2: Accord du participant
   */
  async function saveAccord() {
    setUiError("");
    if (!accordSignature) {
      return setUiError("Veuillez signer l'accord du participant.");
    }
    try {
      setSaving(true);
      const safeFull = sanitizeFileName(fullName || "Utilisateur");
      const outputPath = `club/bookings/${safeFull}/Accord_du_participant_signed.pdf`;
      const html = renderAccordHTML();

      const url = await sendHTMLToPDFAndUpload({
        html,
        formName: "Accord_du_participant",
        fullName,
        outputPath,
      });

      const item = {
        form_name: "Accord du participant",
        url,
      };
      const newResults = [...results, item];
      setResults(newResults);

      onDone?.(newResults);
      onClose?.();
    } catch (err) {
      console.error("❌ saveAccord error:", err);
      setUiError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  }
  

  /**
   * RENDER
   */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-2">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={() => onClose?.()} />

      <div className="relative bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b">
          <div className="font-semibold text-lg">
            {step === 1 && "Règlements du Club"}
            {step === 2 && "Accord du participant"}
          </div>
          <button
            onClick={() => onClose?.()}
            className="rounded-full px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200"
          >
            Fermer
          </button>
        </div>

        {/* Content */}
        <div className="overflow-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Small form area (inputs) */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Nom complet
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={fullName}
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  NIF/CIN <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={rulesIdNumber}
                  onChange={(e) => setRulesIdNumber(e.target.value)}
                  placeholder="Ex.: 000-000-000-0"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Responsable pour (groupe / enfants)
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={rulesSigningFor}
                  onChange={(e) => setRulesSigningFor(e.target.value)}
                  placeholder="Nom(s) du groupe, des enfants, etc."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Pièce d'identité (image / PDF){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf"
                  onChange={(e) => setRulesIdFile(e.target.files?.[0] || null)}
                  className="w-full border rounded-md px-3 py-2"
                />
                {rulesIdFile ? (
                  <div className="text-sm text-gray-600 mt-1">
                    Fichier sélectionné :{" "}
                    <strong>{rulesIdFile.name}</strong>
                  </div>
                ) : null}
              </div>

              {/* Checkboxes list for rules 8+ */}
              <div className="sm:col-span-2 mt-2 border rounded-md p-3 bg-gray-50">
                <p className="text-sm font-semibold mb-2">
                  Confirmez avoir compris et accepté les règles suivantes :
                </p>
                <div className="space-y-1 max-h-40 overflow-auto pr-1">
                  {RULES_CHECKBOXES.map((r) => (
                    <label
                      key={r.id}
                      className="flex items-start gap-2 text-sm text-gray-700"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!rulesChecked[r.id]}
                        onChange={(e) =>
                          setRulesChecked((prev) => ({
                            ...prev,
                            [r.id]: e.target.checked,
                          }))
                        }
                      />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </div>
                {!allRulesChecked && (
                  <p className="text-xs text-orange-600 mt-1">
                    Toutes les cases doivent être cochées avant de continuer.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Nom complet
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={fullName}
                  readOnly
                />
              </div>
            </div>
          )}

          {/* Document text (scrollable) */}
          <div className={docWrapClasses}>
            <div
              className="prose max-w-none text-sm"
              dangerouslySetInnerHTML={{
                __html:
                  step === 1
                    ? wrapHTMLPreview(
                        RULES_TEXT
                          .replaceAll(
                            "{{NOM_COMPLET}}",
                            escapeHtml(fullName || "")
                          )
                          .replaceAll(
                            "{{ID_NUMBER}}",
                            escapeHtml(rulesIdNumber || "")
                          )
                          .replaceAll(
                            "{{RESP_POUR}}",
                            escapeHtml(rulesSigningFor || "")
                          )
                          .replace(
                            "{{SIGNATURE_RULES}}",
                            previewSignatureBox(rulesSignature)
                          )
                          .replaceAll("{{DATE_DU_JOUR}}", nowDate)
                      )
                    : wrapHTMLPreview(
                        ACCORD_TEXT
                          .replaceAll(
                            "{{NOM_COMPLET}}",
                            escapeHtml(fullName || "")
                          )
                          .replace(
                            "{{SIGNATURE_ACCORD}}",
                            previewSignatureBox(accordSignature)
                          )
                          .replaceAll("{{DATE_DU_JOUR}}", nowDate)
                      ),
              }}
            />
          </div>

          {/* Signature area */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {step === 1 && (
              <div className="sm:col-span-2">
                <div className="text-sm font-semibold mb-2">Signature</div>
                <SignaturePad onSave={setRulesSignature} />
              </div>
            )}

            {step === 2 && (
              <div className="sm:col-span-2">
                <div className="text-sm font-semibold mb-2">
                  Signature (au nom de votre groupe)
                </div>
                <SignaturePad onSave={setAccordSignature} />
              </div>
            )}
          </div>

          {/* Error */}
          {uiError ? (
            <div className="text-red-600 text-sm border border-red-200 bg-red-50 rounded-md px-3 py-2">
              {uiError}
            </div>
          ) : null}
        </div>

        {/* Footer buttons */}
        <div className="px-4 sm:px-6 py-3 border-t flex items-center justify-between">
          <button
            type="button"
            className="rounded-md px-4 py-2 bg-gray-100 hover:bg-gray-200"
            onClick={() => {
              if (step === 1) onClose?.();
              else setStep((s) => Math.max(1, s - 1));
            }}
            disabled={saving}
          >
            {step === 1 ? "Annuler" : "Précédent"}
          </button>

          {step === 1 && (
            <button
              type="button"
              className="rounded-md px-4 py-2 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
              onClick={saveRules}
              disabled={saving}
            >
              {saving ? "Enregistrement..." : "Signer & Continuer"}
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              className="rounded-md px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={saveAccord}
              disabled={saving}
            >
              {saving ? "Finalisation..." : "Signer & Terminer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
