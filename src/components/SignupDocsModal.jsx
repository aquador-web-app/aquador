// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SignatureField from "./SignatureField";
import { sanitizeFullName } from "../lib/sanitizeFullName";




/**
 * Utilities
 */

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
 * This must exist server-side as agreed earlier.
 * Body we send: { html, formName, fullName, path }
 * Returns: { url }
 */
async function sendHTMLToPDFAndUpload({ html, formName, fullName, safeName }) {
  const endpoint = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/sign-documents`;


  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
  user_id: "anonymous",
  full_name: fullName,      // 👈 display (keeps accents)
  safe_name: safeName,      // 👈 storage-safe
  documents: [

        {
          form_name: formName,
          html_content: html,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error("PDF service error");

  const data = await res.json();
  return data.results[0].url;
}




/**
 * Main modal
 * Props:
 *  - fullName: string (auto-fills all docs)
 *  - signupType: 'me' | 'me_student' | 'children_only'
 *  - onClose(): void
 *  - onDone(results: Array<{form_name, url}>): void
 */
export default function SignupDocsModal({
  fullName = "",
  childrenNames = [], // 👈 ADD THIS
  signupType = "me",
  enabledDocs = { rules: true, accord: true, consent: true },
  initialStep,
  onClose,
  onDone,
}) {

  function getNextEnabledStep(current) {
  if (current < 2 && enabledDocs.accord) return 2;
  if (current < 3 && enabledDocs.consent) return 3;
  return null;
}

function getPrevEnabledStep(current) {
  if (current > 2 && enabledDocs.accord) return 2;
  if (current > 1 && enabledDocs.rules) return 1;
  return null;
}


  const safeName = useMemo(
  () => sanitizeFullName(fullName || "utilisateur"),
  [fullName]
);
if (!safeName || safeName.length < 2) {
  return null; // or loader
}

const FIRST_ENABLED_STEP = useMemo(() => {
  if (initialStep) return initialStep;
  if (enabledDocs.rules) return 1;
  if (enabledDocs.accord) return 2;
  if (enabledDocs.consent) return 3;
  return 1;
}, [enabledDocs, initialStep]);


  const [step, setStep] = useState(FIRST_ENABLED_STEP); 
  const [saving, setSaving] = useState(false);
  const [uiError, setUiError] = useState("");
  const contentRef = useRef(null);


  // top of component
const [logoUrl, setLogoUrl] = useState("");

useEffect(() => {
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}, []);

useEffect(() => {
  if (!contentRef.current) return;

  // Force immediate jump (mobile-safe)
  contentRef.current.scrollTop = 0;

  // Then reinforce after layout settles (critical for mobile)
  requestAnimationFrame(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  });
}, [step]);


useEffect(() => {
  if (!uiError || !contentRef.current) return;

  contentRef.current.scrollTop = 0;

  requestAnimationFrame(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  });
}, [uiError]);



useEffect(() => {
  (async () => {
    const { data } = supabase.storage.from("assets").getPublicUrl("aquador.png");
    const publicUrl = data?.publicUrl;
    if (!publicUrl) return;

    try {
      const res = await fetch(publicUrl);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result); // ✅ full base64 data URL
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn("⚠️ Failed to fetch logo as base64:", err);
    }
  })();
}, []);

  // === Shared info ===
  const [nowDate, setNowDate] = useState(formatDateFrSafe());
  useEffect(() => {
    setNowDate(formatDateFrSafe());
  }, []);

  // === Step 1: Règlements ===
  const [rulesSignature, setRulesSignature] = useState(null);
  const [rulesIdNumber, setRulesIdNumber] = useState(""); // NIF/CIN pour Règlements
  const [rulesSigningFor, setRulesSigningFor] = useState(""); // la personne pour qui je signe
  const [rulesIdFile, setRulesIdFile] = useState(null); // ID image/pdf upload

  // === Step 2: Accord du participant ===
  const [accordSignature, setAccordSignature] = useState(null);
  const [accordParentSignature, setAccordParentSignature] = useState(null);
  const [accordIdNumber, setAccordIdNumber] = useState(""); // NIF/CIN
  const [accordSigningFor, setAccordSigningFor] = useState(""); // Personne dont je suis responsable (enfants, etc.)


  // === Step 3: Consentement (photo/vidéo) ===
  const [consentSignature, setConsentSignature] = useState(null);
  const [consentParentSignature, setConsentParentSignature] = useState(null);
  const [consentNames, setConsentNames] = useState([]); // dynamic list (self + children)

  // ✅ SINGLE SOURCE OF TRUTH — DO NOT DUPLICATE
useEffect(() => {
  if (!fullName) return;

  // 1️⃣ children_only → ONLY children
  if (signupType === "children_only") {
    const joinedChildren = childrenNames.join(", ");

    setRulesSigningFor((prev) => (prev ? prev : joinedChildren));
    setAccordSigningFor((prev) => (prev ? prev : joinedChildren));

    setConsentNames((prev) =>
      prev.length ? prev : [...childrenNames]
    );
    return;
  }

  // 2️⃣ me_student → adult + children
  if (signupType === "me_student") {
    const joinedAll = [fullName, ...childrenNames].join(", ");

    setRulesSigningFor((prev) => (prev ? prev : joinedAll));
    setAccordSigningFor((prev) => (prev ? prev : joinedAll));

    setConsentNames((prev) =>
      prev.length ? prev : [fullName, ...childrenNames]
    );
    return;
  }

  // 3️⃣ me → adult only
  setRulesSigningFor((prev) => (prev ? prev : fullName));
  setAccordSigningFor((prev) => (prev ? prev : fullName));

  setConsentNames((prev) =>
    prev.length ? prev : [fullName]
  );
}, [signupType, fullName, childrenNames]);



  useEffect(() => {
  const names = [];

  if (fullName) {
    names.push(fullName); // adult always first
  }

  if (
    (signupType === "me_student" || signupType === "children_only") &&
    childrenNames.length > 0
  ) {
    names.push(...childrenNames);
  }

  // Only initialize once (do not overwrite manual edits)
  setConsentNames((prev) =>
    prev.length ? prev : names.length ? names : [""]
  );
}, [fullName, childrenNames, signupType]);

  const addConsentRow = () => setConsentNames((s) => [...s, ""]);
  const removeConsentRow = (idx) =>
    setConsentNames((s) => s.filter((_, i) => i !== idx));
  const updateConsentName = (idx, v) =>
    setConsentNames((s) => s.map((x, i) => (i === idx ? v : x)));


  // Signed results
  const [results, setResults] = useState([]); // { form_name, url }

  const needParentSection =
    signupType === "me_student" || signupType === "children_only";

  const docWrapClasses =
    "border rounded-lg p-4 max-h-[45vh] overflow-auto bg-white shadow-inner";

  /**
   * ---------- FULL TEXTS (inline) ----------
   * (1) ACCORD DU PARTICIPANT
   */
  const ACCORD_TEXT = `
<h2 style="text-align:center; margin-bottom:8px;">ACCORD DU PARTICIPANT, RENONCIATION ET ACCEPTATION DES RISQUES</h2>
<p>En considération des services du Club A’QUA D’OR, J'accepte par la présente ce qui suit :</p>
<p><strong><br/>1.</strong>
Je reconnais que mon adhésion au club de natation comporte des risques connus et imprévus pouvant entraîner, sans que ce soit une liste exhaustive, des blessures physiques ou émotionnelles, une paralysie, des dommages à moi-même, à des biens ou à des tiers, ou même la mort. Je comprends que de tels risques ne peuvent tout simplement pas être éliminés sans mettre en péril les qualités essentielles de l'activité. Les risques incluent, entre autres : foulures et entorses musculaires, complications cardiaques, noyade accidentelle, glissades et chutes en entrant et en sortant de la piscine et autour de la piscine. De plus, les employés de A’QUA D’OR ont des tâches difficiles à accomplir. Ils recherchent la sécurité, mais ils ne sont pas infaillibles. Ils peuvent donner des avertissements ou des instructions inadéquats, et l'équipement utilisé peut mal fonctionner.</p>
<p><strong><br/>2.</strong>
J'accepte et promets expressément d'accepter et d'assumer tous les risques existant dans cette activité. Ma participation à cette activité est purement volontaire, et je choisis de participer malgré les risques.</p>
<p><strong><br/>3.</strong>
Par la présente, je libère volontairement, décharge pour toujours et accepte d'indemniser et de dégager de toute responsabilité A’QUA D’OR de toute réclamation, demande ou cause d'action, qui est liée de quelque manière que ce soit à ma participation à cette activité ou à mon utilisation de l'équipement ou des installations de A’QUA D’OR.</p>
<p><strong><br/>4.</strong>
Si A'QUA D'OR ou toute personne agissant en son nom devait engager des honoraires et des frais d'avocat pour faire respecter cet accord, j'accepte de les indemniser et de les dégager de toute responsabilité pour tous ces frais et dépenses.</p>
<p><strong><br/>5.</strong>
Je certifie avoir une assurance adéquate pour couvrir toute blessure ou tout dommage que je pourrais causer ou subir lors de ma participation. Dans le cas contraire, j'accepte de supporter moi-même les coûts de ces blessures ou de ces dommages. Je certifie en outre que je suis prêt à assumer le risque de toute condition médicale ou physique que je pourrais avoir.</p>
<p><strong><br/>6.</strong>
J'ai lu et j'accepte de respecter les règles du club.</p>

<p>En signant ce document, je reconnais que si quelqu'un est blessé ou des biens sont endommagés lors de ma participation à cette activité, je peux être reconnu par un tribunal avoir renoncé à mon droit de maintenir une poursuite contre A'QUA D'OR sur la base de toute réclamation dont je les ai libérés ici.</p>

<p><strong><br/>Nom complet :</strong> {{NOM_COMPLET}}</p>
<p><strong>Responsable pour :</strong> {{RESP_POUR}}</p>

<table style="width:100%; margin-top:8px; border-collapse:collapse;">
  <tr>
    <td style="border:none; padding:4px 0;">
      <strong>Signature du participant :</strong>
      <span style="display:inline-block; vertical-align:middle; width:100px; height:75px; border:1px solid #ffffffff; margin-left:6px; text-align:center;">
        {{SIGNATURE_PARTICIPANT}}
      </span>
    </td>
    <td style="border:none; padding:4px 0; text-align:left;">
      <strong>Date :</strong> <span style="margin-left:6px;">{{DATE_DU_JOUR}}</span>
    </td>
  </tr>
</table>

{{SECTION_PARENT}}
`;

  const ACCORD_PARENT_SECTION = `
<div style="margin-top:16px; padding-top:8px; border-top:1px dashed #aaa;">
  <p style="margin:8px 0;"><em>* Pour les mineurs *</em></p>
<p><strong>Nom complet du parent/tuteur :</strong> {{NOM_PARENT}}</p>

<table style="width:100%; margin-top:8px; border-collapse:collapse;">
  <tr>
    <td style="border:none; padding:4px 0;">
      <strong>Parent/Tuteur (Signature) :</strong>
      <span style="display:inline-block; vertical-align:middle; width:100px; height:75px; border:1px solid #ffffffff; margin-left:6px; text-align:center;">
        {{SIGNATURE_PARENT}}
      </span>
    </td>
    <td style="border:none; padding:4px 0; text-align:left;">
      <strong>Date :</strong> <span style="margin-left:6px;">{{DATE_DU_JOUR}}</span>
    </td>
  </tr>
</table>

</div>

</div>
`;

  /**
   * (2) FORMULAIRE DE CONSENTEMENT (photos/vidéos)
   */
  const CONSENT_TEXT = `
<h2 style="text-align:center; margin-bottom:8px;">Formulaire de Consentement pour l'Utilisation de Photos et Vidéos à des Fins Publicitaires</h2>
<p>Je soussigné(e), <strong>{{NOM_COMPLET}}</strong>, autorise par la présente A’QUA D’OR à utiliser mes photos et vidéos ainsi que celles des personnes citées ci-dessous :</p>

<div style="margin:10px 0 16px 0;">
  <table style="width:100%; border-collapse:collapse;">
    <thead>
      <tr>
        <th style="border:1px solid #999; padding:6px; text-align:left;">Nom</th>
      </tr>
    </thead>
    <tbody>
      {{TABLE_NOMS}}
    </tbody>
  </table>
</div>

<p>Je comprends et accepte que ces photos et vidéos seront utilisées à des fins publicitaires, incluant mais sans s'y limiter, les supports suivants :</p>
<ul>
  <li>Sites Internet et réseaux sociaux de A’QUA D’OR</li>
  <li>Supports imprimés (brochures, affiches, flyers, etc.)</li>
  <li>Publicités numériques</li>
</ul>

<p>Je comprends et accepte que ces photos et vidéos peuvent être recadrées, modifiées ou adaptées selon les besoins de A’QUA D’OR pour une utilisation dans les supports mentionnés ci-dessus.</p>

<p><strong><br/>Durée du Consentement :</strong><br/>
Ce consentement est valable pour une durée indéterminée à partir de la date de signature de ce formulaire.</p>

<p><strong><br/>Droit de Révocation :</strong><br/>
Je comprends que je peux révoquer ce consentement à tout moment en envoyant une notification écrite à A’QUA D’OR. Cependant, je reconnais que cette révocation n'affectera pas les publications et utilisations antérieures à la date de réception de la notification.</p>

<p><strong><br/>Aucune Rémunération :</strong><br/>
Je comprends et accepte que je ne recevrai aucune rémunération, paiement ou autre compensation pour l'utilisation de mes photos et vidéos par A’QUA D’OR.</p>

<p><strong><br/>Déclaration :</strong><br/>
En signant ce formulaire, je certifie que j'ai plus de 18 ans.</p>

<table style="width:100%; margin-top:8px; border-collapse:collapse;">
  <tr>
    <td style="border:none; padding:4px 0;">
      <strong>Signature du participant :</strong>
      <span style="display:inline-block; vertical-align:middle; width:100px; height:75px; border:1px solid #ffffffff; margin-left:6px; text-align:center;">
        {{SIGNATURE_ADULTE}}
      </span>
    </td>
    <td style="border:none; padding:4px 0; text-align:left;">
      <strong>Date :</strong> <span style="margin-left:6px;">{{DATE_DU_JOUR}}</span>
    </td>
  </tr>
</table>

{{CONSENT_PARENT_SECTION}}
`;

  const CONSENT_PARENT_SECTION = `
<p style="margin-top:16px;">En signant ce formulaire, je certifie que je suis le parent ou le tuteur légal du(des) mineur(s) mentionné(s) ci-dessus et que j'ai l'autorité légale de signer ce document en son(leurs) nom(s).</p>

<table style="width:100%; margin-top:8px; border-collapse:collapse;">
  <tr>
    <td style="border:none; padding:4px 0;">
      <strong>Parent/Tuteur (Signature) :</strong>
      <span style="display:inline-block; vertical-align:middle; width:100px; height:75px; border:1px solid #ffffffff; margin-left:6px; text-align:center;">
        {{SIGNATURE_PARENT}}
      </span>
    </td>
    <td style="border:none; padding:4px 0; text-align:left;">
      <strong>Date :</strong> <span style="margin-left:6px;">{{DATE_DU_JOUR}}</span>
    </td>
  </tr>
</table>
`;

  /**
   * (3) RÈGLEMENTS
   * Full text provided by you, kept intact; we'll add the signing block and inputs as placeholders.
   */
  const RULES_TEXT = `
<h2 style="text-align:center; margin-bottom:8px;"><strong>Règlements</strong></h2>
<p>Le Client accepte de remplir tout formulaire soumis par l’Administration de A’QUA D’OR notamment ceux permettant, entre autres, à A’QUA D’OR de se renseigner sur l’état de santé des élèves inscrits (asthme, allergies quelconques, épilepsie, etc.) et sur la personne autorisée à récupérer l’enfant, le cas échéant, au moment du renvoi.</p><br/>
<p>Il est recommandé aux élèves de se nourrir au plus une heure de temps avant le cours de natation et de s’échauffer avant le début des cours. Après le cours, l’élève est prié de se protéger en utilisant une serviette propre (non mouillée) et des vêtements secs.</p><br/>

<p><strong>1. Fourniture de services</strong><br/>
A’QUA D’OR offre des cours de natation conçus pour tout âge et ces cours sont dispensés par des professeurs compétents engagés par A’QUA D’OR.
Les élèves inscrits sont tenus de se présenter au local de A’QUA’D’OR aux jours et heures convenus, dix (10) minutes avant le début des séances. Ils seront amenés soit par leurs parents, soit par une personne responsable préalablement mentionnée dans le formulaire d’inscription. Dans le cas contraire, le parent se doit d’envoyer une note signée mentionnant la personne autorisée à récupérer l’enfant au moment du renvoi à l’Administration de A’QUA D’OR.</p><br/>

<p><strong>2. Equipements requis au moment des cours</strong><br/>
Les élèves inscrits au cours sont priés de respecter le port vestimentaire lorsqu’ils sont dans l’eau ou dans l’aire de la piscine. Chaque élève devra apporter son costume de bain décent, son bonnet, ses lunettes, une sortie de bain, des sandales en plastique et une serviette. Les élèves placeront leurs effets personnels dans un sac qu’ils déposeront dans un espace spécifique qui leur sera indiqué afin de maintenir les lieux propres et sécurisés.
L’application d’une crème solaire est suggérée. Aucun élève ne sera admis dans l’eau sans son bonnet et ses lunettes.</p><br/>

<p><strong>3. Discipline</strong><br/>
Le personnel de la piscine veille à la discipline des élèves dans l’enceinte du bâtiment ou est logé A’QUA D’OR. Il se réserve le droit de retourner chez lui tout enfant qui ne se conforme pas aux règles établies ou qui perturbe le groupe ou le cours. <br/><br/>
Le personnel de la piscine assurera en outre une surveillance adéquate durant les heures d’ouverture. Les règles de discipline et de sécurité sont aussi en vigueur dans les vestiaires ou toilettes.<br/><br/>
L’utilisation des douches avant d’entrer dans la piscine est requise. <br/><br/>
Un élève grippé ou frappé d’une fièvre ne sera pas admis dans l’eau. <br/><br/>
Les bijoux de fantaisies ou de valeurs ne sont pas admis lors des cours de natation.<br/><br/>
Aucun excès de langage ou de violence physique de la part des parents ou des élèves envers le personnel de A’QUA’D’OR ne sera toléré. <br/><br/>
Le bruit, l’impolitesse, les jeux dangereux, les jeux de chevaux et la vulgarité ne seront pas autorisés. Cela inclut la course, la lutte, la bousculade etc.<br/><br/>
L'accès à la piscine est refusé à toute personne atteinte de maladies contagieuses, yeux irrités ou enflammés, rhume, écoulements nasaux ou auriculaires, plaies ouvertes ou bandages de toute sorte.<br/><br/>
Les enfants qui ne sont pas formés à la propreté doivent porter des couches adaptées à la piscine avec un pantalon en plastique sur les couches - sans exception! Les Huggies nécessitent également des pantalons en plastique.<br/><br/>
Le coût de tout dommage matériel sera facturé à la partie responsable. <br/><br/>
Toutes les blessures doivent être signalées immédiatement à la direction. <br/><br/>
L’utilisation ou la présence de boissons alcoolisées ou de drogues illégales dans l’enceinte de la piscine ne sera pas tolérée.<br/><br/>
Il est INTERDIT DE COURIR autour de la piscine, (sauf pour les échauffements). <br/><br/>
Il est INTERDIT DE FUMER dans les locaux de A’QUA D’OR. <br/><br/>
MANGER, MACHER UNE GOMME, BOIRE dans la piscine ne sont pas autorisé.<br/><br/>
A’QUA D’OR n’acceptera aucune responsabilité pour les effets personnels laissés dans les vestiaires ou pour la perte ou les dommages aux biens personnels.</p> <br/>

<p><strong>4. Mesure de sécurité</strong><br/>
Aucun élève ne sera admis aux cours sans présenter la carte d’accès contenant le QR code qui lui sera attribué lors de l’inscription. Cette carte servira à contrôler la présence du jour. Toute personne venant récupérer un élève devra également présenter la carte d’accès afin que l’élève soit autorisé à partir avec elle, dans le cas où cette personne ne serait pas restée sur place pendant les cours.</p><br/>
Des frais de USD 10.00 devront être payés pour le remplacement de la carte d’accès perdue ou endommagée.</p><br/>

<p><strong>5. Règles de propreté</strong><br/>
Des poubelles sont placées dans l’enceinte du bâtiment afin de maintenir l’espace propre. Aucun objet, déchet ne doit trainer dans l’air de la piscine et à tout autre endroit de A’QUA D’OR. Crachats, émouchements du nez, jets d'eau, élimination des déchets corporels et actes insalubres dans la piscine sont interdits.</p><br/>

<p><strong>6. Responsabilités</strong><br/>
A’QUA D’OR et le personnel de la piscine se dégagent de toutes responsabilités en ce qui a trait à la perte ou le vol d’objets personnels des élèves inscrits aux cours. Il est demandé à l’élève de se munir du strict minimum à son apprentissage.</p><br/>

<p><strong>7. Frais et mensualité</strong><br/>
Les frais d’inscription de USD 60.00 requis ne sont en aucun cas remboursables. <br/><br/>
Les mensualités sont payables à l’avance. Le Client a pour obligation de verser entre le 25 et le 30 de mois les frais mensuels de USD 85.00 pour le mois prochain. <strong> TOUT MOIS COMMENCÉ EST DU DANS SON INTEGRALITÉ. </strong> <br/><br/>
Les élèves régulièrement inscrits qui se sont absentés au cours ne seront pas remboursés. Il en sera de même pour les élèves qui ont dû être renvoyés chez eux pour mauvaise conduite. <br/><br/>
Un élève en retard participera uniquement au temps imparti pour sa séance. (i.e un élève est inscrit au cours de 9 :00 – 11 :00 qui arrive à 9 :30, terminera à 11 :00 comme prévu et non à 11 :30. ON NE DÉBORDE PAS SUR L’HEURE DE LA PROCHAINE SÉANCE. <br/><br/>
Un élève qui n’aura pas payé les frais mensuels avant le 7 du mois ne sera pas admis au cours.<br/><br/>
En cas de force majeure constituant une entrave à la tenue des cours de natation, A’QUA D’OR s’engage à organiser des cours de rattrapage. Notification préalable sera donnée au Client. A’QUA D’OR n’est pas responsable si l’élève est absent lors du cours de rattrapage organier pour remplacer la séance perdue. <br/><br/>
Tout élève ayant été absent pour une quelconque raison voulant rattraper sa séance devra payer des frais de USD 15.00 (pour une absence motivée) et USD 20.00 (pour une absence non motivée).<br/><br/>
Les jeunes filles et femmes ont toutes droit à UNE séance de rattrapage gratuite par mois en raison de leur cycle menstruel.<br/><br/>
Toute(s) séance(s) ratée(s) pour non-paiement des mensualités ne sera en aucun cas récupérable. <br/><br/>
Toute(s) séance(s) ratée(s) n’implique(nt) pas le non-paiement de la mensualité totale.<br/><br/>
Tout élève absent pendant plus de douze (12) séances consécutives est considéré comme ayant abandonné les cours. Des frais de réactivation de USD 30.00 seront exigés pour qu’il puisse reprendre.<br/><br/>
Des frais d’adhésion annuels de USD 30.00 devront être versés au début de chaque année, soit au mois de septembre.</p><br/><br/>

<p>Je soussigné(e) <strong>{{NOM_COMPLET}}</strong> identifié(e) au numéro <strong>{{ID_NUMBER}}</strong>, responsable pour <strong>{{RESP_POUR}}</strong>, déclare avoir pris connaissance des règlements et conditions ci-dessus et y souscrire sans réserve.</p><br/><br/>

<table style="width:100%; margin-top:8px; border-collapse:collapse;">
  <tr>
    <td style="border:none; padding:4px 0;">
      <strong>Signature :</strong>
      <span style="display:inline-block; vertical-align:middle; width:100px; height:75px; border:1px solid #ffffffff; margin-left:6px; text-align:center;">
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
   * Renderers: inject signature images & fields into HTML
   */
  function imgTag(dataUrl, alt = "signature", w = 300, h = 70) {
    if (!dataUrl) return `<span style="color:#999;">(signature manquante)</span>`;
    return `<img src="${dataUrl}" alt="${alt}" width="${w}" height="${h}" style="object-fit:contain;" />`;
    // (Browser width/height attributes are fine; PDF service will respect CSS too)
  }

  function renderAccordHTML() {
  const parentBlk = needParentSection
    ? ACCORD_PARENT_SECTION.replace("{{NOM_PARENT}}", fullName || "")
        .replace("{{SIGNATURE_PARENT}}", imgTag(accordParentSignature, "signature-parent"))
        .replaceAll("{{DATE_DU_JOUR}}", nowDate)
    : "";

  // Format “Responsable pour” — split by comma or line, clean spaces
  const respList = (accordSigningFor || "")
    .split(/[,;\n]/)
    .map((n) => n.trim())
    .filter(Boolean);
  const formattedRespPour =
    respList.length > 1
      ? `<ul style="margin:4px 0 0 16px; padding:0;">${respList
          .map((n) => `<li>${escapeHtml(n)}</li>`)
          .join("")}</ul>`
      : escapeHtml(respList[0] || "—");

  return wrapHTML(
    ACCORD_TEXT
      .replaceAll("{{NOM_COMPLET}}", escapeHtml(fullName || ""))
      .replaceAll("{{RESP_POUR}}", formattedRespPour)
      .replace("{{SIGNATURE_PARTICIPANT}}", imgTag(accordSignature, "signature"))
      .replaceAll("{{DATE_DU_JOUR}}", nowDate)
      .replace("{{SECTION_PARENT}}", parentBlk)
  );
}


  function renderConsentHTML() {
    const bodyRows = (consentNames || [])
      .filter((x) => String(x || "").trim().length > 0)
      .map(
        (n) =>
          `<tr><td style="border:1px solid #999; padding:6px;">${escapeHtml(n)}</td></tr>`
      )
      .join("");

    const parentBlk = needParentSection
      ? CONSENT_PARENT_SECTION.replace(
          "{{SIGNATURE_PARENT}}",
          imgTag(consentParentSignature, "signature-parent")
        ).replaceAll("{{DATE_DU_JOUR}}", nowDate)
      : "";

    return wrapHTML(
      CONSENT_TEXT
        .replaceAll("{{NOM_COMPLET}}", escapeHtml(fullName || ""))
        .replace("{{TABLE_NOMS}}", bodyRows || `<tr><td style="border:1px solid #999; padding:6px;">—</td></tr>`)
        .replace("{{SIGNATURE_ADULTE}}", imgTag(consentSignature, "signature"))
        .replaceAll("{{DATE_DU_JOUR}}", nowDate)
        .replace("{{CONSENT_PARENT_SECTION}}", parentBlk)
    );
  }

  function renderRulesHTML() {
  const respList = (rulesSigningFor || "")
    .split(/[,;\n]/)
    .map((n) => n.trim())
    .filter(Boolean);
  const formattedRespPour =
    respList.length > 1
      ? `<ul style="margin:4px 0 0 16px; padding:0;">${respList
          .map((n) => `<li>${escapeHtml(n)}</li>`)
          .join("")}</ul>`
      : escapeHtml(respList[0] || "—");

  return wrapHTML(
    RULES_TEXT
      .replaceAll("{{NOM_COMPLET}}", escapeHtml(fullName || ""))
      .replaceAll("{{ID_NUMBER}}", escapeHtml(rulesIdNumber || ""))
      .replaceAll("{{RESP_POUR}}", formattedRespPour)
      .replace("{{SIGNATURE_RULES}}", imgTag(rulesSignature, "signature"))
      .replaceAll("{{DATE_DU_JOUR}}", nowDate)
  );
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
    header h1 {
      font-size: 22px;
      color: #001f5c;
      margin: 0;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
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


  /**
   * Save handlers for each step
   */
  async function saveAccord() {
    setUiError("");
    if (!accordSignature) return setUiError("Veuillez signer l'accord du participant.");
    if (needParentSection && !accordParentSignature) {
      return setUiError("Signature du parent/tuteur requise pour les mineurs.");
    }
    try {
      setSaving(true);
      const html = renderAccordHTML();
      const url = await sendHTMLToPDFAndUpload({
  html,
  formName: "Accord du participant",
  fullName,
  safeName: safeName,
});
      const newResults = [
  ...results,
  { form_name: "Accord du participant", url },
];
setResults(newResults);

const next = getNextEnabledStep(2);
if (next) setStep(next);
else {
  onDone?.(newResults);
  onClose?.();
}


    } catch (err) {
      setUiError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  }


  async function uploadRulesIdIfAny(folder) {
    if (!rulesIdFile) {
  throw new Error("Veuillez ajouter une pièce d'identité.");
}
    const file = rulesIdFile;
    const ext = (file.name?.split(".").pop() || "bin").toLowerCase();
    const path = `${folder}/ID_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("signed_docs")
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) throw error;
    // Return public URL
    const { data } = supabase.storage.from("signed_docs").getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function saveRules() {
  setUiError("");
  if (!rulesSignature) return setUiError("Veuillez signer les règlements.");
  if (!rulesIdNumber) return setUiError("Veuillez saisir votre NIF/CIN.");

  try {
    setSaving(true);
    console.log("🧾 Starting Règlements signing...");



     // 1️⃣ Upload ID file (mandatory)
    let idUrl = null;
    try {
      console.log("🪪 Uploading ID file...");
      idUrl = await uploadRulesIdIfAny(safeName);
      console.log("✅ ID uploaded:", idUrl);
    } catch (idErr) {
      console.error("❌ ID upload failed:", idErr);
      setUiError("Erreur lors du téléchargement de la pièce d'identité.");
      setSaving(false);
      return;
    }

    // 2️⃣ Render and send PDF
    console.log("🧩 Generating Règlements PDF...");
    const html = renderRulesHTML();
    let pdfUrl;
try {
  pdfUrl = await sendHTMLToPDFAndUpload({
    html,
    formName: "Règlements",
    fullName,
    safeName: safeName,
  });
  console.log("✅ PDF generated:", pdfUrl);
} catch (pdfErr) {
      console.error("❌ PDF generation failed:", pdfErr);
      setUiError("Erreur lors de la création du PDF des règlements.");
      setSaving(false);
      return;
    }

    // 3️⃣ Record results
    const item = { form_name: "Règlements", url: pdfUrl };
    if (idUrl) item.id_file_url = idUrl;

    // 4️⃣ Insert both into `documents` table
    try {
      const { data: user } = await supabase.auth.getUser();
      const user_id = user?.user?.id;

      if (user_id) {
        console.log("📦 Logging documents into database...");
        const rows = [];

        // Log the règlements PDF
        rows.push({
          user_id,
          type: "Règlements",
          file_url: pdfUrl,
          signed_at: new Date().toISOString(),
        });

        // Log the ID file (if any)
        if (idUrl) {
          rows.push({
            user_id,
            type: "Pièce d'identité (Règlements)",
            file_url: idUrl,
            signed_at: new Date().toISOString(),
          });
        }

        await supabase.from("documents").insert(rows);
        console.log("✅ Documents logged in DB.");
      }
    } catch (dbErr) {
      console.warn("⚠️ DB logging failed:", dbErr);
    }

    // 5️⃣ Move to next step (ACCORD DU PARTICIPANT)
    const newResults = [...results, item];
setResults(newResults);

    setSaving(false);
const next = getNextEnabledStep(1);

if (next) setStep(next);
else {
  onDone?.(newResults);
  onClose?.();
}



    // 5️⃣ Done — close modal and continue
    console.log("🎉 Règlements signing complete!");
    
  } catch (err) {
    console.error("💥 Unexpected saveRules error:", err);
    setUiError(err.message || String(err));
    setSaving(false);
  }
}

async function handleSkipConsent() {
  try {
    // User chose NOT to sign Consentement → DO NOT create PDF, DO NOT upload anything
    // Simply finalize with the 2 saved documents (Règlements + Accord)

    onDone?.(results);  // keep only the docs already saved
    onClose?.();        // close modal → continue signup
  } catch (err) {
    console.error("❌ Skip consent error:", err);
  }
}

async function saveContent() {
  setUiError("");
  if (!consentSignature) return setUiError("Veuillez signer le consentement.");
  if (needParentSection && !consentParentSignature)
    return setUiError("Signature du parent/tuteur requise.");

  try {
    setSaving(true);

    const html = renderConsentHTML();
    const url = await sendHTMLToPDFAndUpload({
  html,
  formName: "Formulaire de consentement",
  fullName,
  safeName: safeName,
});


    const newResults = [
  ...results,
  { form_name: "Formulaire de consentement", url },
];

setResults(newResults);
onDone?.(newResults);
onClose?.();

  } catch (err) {
    setUiError(err.message || String(err));
  } finally {
    setSaving(false);
  }
}


  /**
   * Responsive modal layout:
   * - Max width, full height on small screens with internal scroll
   * - Form area fixed above document text
   */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-2">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b">
          <div className="font-semibold text-lg">
            {step === 1 && enabledDocs.rules && "Règlements"}
            {step === 2 && enabledDocs.accord && "Accord du participant"}
            {step === 3 && enabledDocs.consent && "Formulaire de consentement (optionnel)"}
          </div>
          <button
            onClick={() => onClose?.()}
            className="rounded-full px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200"
          >
            Fermer
          </button>
        </div>

        {/* Content scroll */}
        <div
          ref={contentRef}
          className="overflow-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4"
        >
          {uiError && (
          <div className="sticky top-0 z-20 mb-3 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 shadow">
            ⚠️ {uiError}
          </div>
        )}
          {/* Small form area (inputs) */}
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
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  NIF/CIN (optionnel)
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={accordIdNumber}
                  onChange={(e) => setAccordIdNumber(e.target.value)}
                  placeholder="Ex.: 000-000-000-0 ou 0000000000"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Responsable pour (si applicable)
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={accordSigningFor}
                  onChange={(e) => setAccordSigningFor(e.target.value)}
                  placeholder="Nom(s) de l'élève / des enfants"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 gap-3">
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

              {/* Dynamic consent names */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Personnes autorisées (vous + enfants)
                </label>
                <div className="space-y-2">
                  {consentNames.map((n, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        className="flex-1 border rounded-md px-3 py-2"
                        value={n}
                        onChange={(e) => updateConsentName(idx, e.target.value)}
                        placeholder={idx === 0 ? "Votre nom" : "Nom de l'enfant"}
                      />
                      <button
                        type="button"
                        className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200"
                        onClick={() => removeConsentRow(idx)}
                        disabled={consentNames.length === 1}
                        title="Supprimer la ligne"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200"
                    onClick={addConsentRow}
                  >
                    + Ajouter un nom
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  Responsable pour (si applicable)
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={rulesSigningFor}
                  onChange={(e) => setRulesSigningFor(e.target.value)}
                  placeholder="Nom(s) de l'élève / des enfants"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Pièce d'identité (image / PDF) <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf"
                  onChange={(e) => setRulesIdFile(e.target.files?.[0] || null)}
                  className="w-full border rounded-md px-3 py-2"
                />
                {rulesIdFile ? (
                  <div className="text-sm text-gray-600 mt-1">
                    Fichier sélectionné : <strong>{rulesIdFile.name}</strong>
                  </div>
                ) : null}
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
        .replaceAll("{{NOM_COMPLET}}", escapeHtml(fullName || ""))
        .replaceAll("{{ID_NUMBER}}", escapeHtml(rulesIdNumber || ""))
        .replaceAll("{{RESP_POUR}}", escapeHtml(rulesSigningFor || ""))
        .replace("{{SIGNATURE_RULES}}", previewSignatureBox(rulesSignature))
        .replaceAll("{{DATE_DU_JOUR}}", nowDate)
    )
: step === 2
  ? wrapHTMLPreview(
      ACCORD_TEXT
        .replaceAll("{{NOM_COMPLET}}", escapeHtml(fullName || ""))
        .replaceAll(
          "{{RESP_POUR}}",
          (() => {
            const respList = (accordSigningFor || "")
              .split(/[,;\n]/)
              .map((n) => n.trim())
              .filter(Boolean);
            if (!respList.length) return "—";
            if (respList.length === 1) return escapeHtml(respList[0]);
            return `<ul style='margin:4px 0 0 16px; padding:0;'>${respList
              .map((n) => `<li>${escapeHtml(n)}</li>`)
              .join("")}</ul>`;
          })()
        )
        .replace("{{SIGNATURE_PARTICIPANT}}", previewSignatureBox(accordSignature))
        .replaceAll("{{DATE_DU_JOUR}}", nowDate)
        .replace(
          "{{SECTION_PARENT}}",
          needParentSection
            ? ACCORD_PARENT_SECTION.replace(
                "{{NOM_PARENT}}",
                escapeHtml(fullName || "")
              )
                .replace(
                  "{{SIGNATURE_PARENT}}",
                  previewSignatureBox(accordParentSignature)
                )
                .replaceAll("{{DATE_DU_JOUR}}", nowDate)
            : ""
        )
    )
: wrapHTMLPreview(
      CONSENT_TEXT
        .replaceAll("{{NOM_COMPLET}}", fullName || "")
        .replace(
          "{{TABLE_NOMS}}",
          (consentNames || [])
            .filter((x) => String(x || "").trim().length > 0)
            .map(
              (n) =>
                `<tr><td style="border:1px solid #999; padding:6px;">${escapeHtml(
                  n
                )}</td></tr>`
            )
            .join("") ||
            `<tr><td style="border:1px solid #999; padding:6px;">—</td></tr>`
        )
        .replace("{{SIGNATURE_ADULTE}}", previewSignatureBox(consentSignature))
        .replaceAll("{{DATE_DU_JOUR}}", nowDate)
        .replace(
          "{{CONSENT_PARENT_SECTION}}",
          needParentSection
            ? CONSENT_PARENT_SECTION.replace(
                "{{SIGNATURE_PARENT}}",
                previewSignatureBox(consentParentSignature)
              ).replaceAll("{{DATE_DU_JOUR}}", nowDate)
            : ""
        )
    )

              }}
            />
          </div>

          {/* Signature area (Pad) */}
          <div className="grid grid-cols-1 gap-4">
            {step === 1 && (
  <SignatureField
    label="Signature"
    value={rulesSignature}
    onChange={setRulesSignature}
  />
)}

{step === 2 && (
  <>
    <SignatureField
      label="Signature du participant"
      value={accordSignature}
      onChange={setAccordSignature}
    />

    {needParentSection && (
      <SignatureField
        label="Signature du parent / tuteur"
        value={accordParentSignature}
        onChange={setAccordParentSignature}
      />
    )}
  </>
)}

{step === 3 && (
  <>
    <SignatureField
      label="Signature (adulte)"
      value={consentSignature}
      onChange={setConsentSignature}
    />

    {needParentSection && (
      <SignatureField
        label="Signature du parent / tuteur"
        value={consentParentSignature}
        onChange={setConsentParentSignature}
      />
    )}
  </>
)}
          </div>
        </div>  

        {/* Footer buttons */}
        <div className="px-4 sm:px-6 py-3 border-t flex items-center justify-between">
          <button
            type="button"
            className="rounded-md px-4 py-2 bg-gray-100 hover:bg-gray-200"
            onClick={() => {
              if (step === 1) onClose?.();
              else {
  const prev = getPrevEnabledStep(step);
  if (prev) setStep(prev);
}

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
              className="rounded-md px-4 py-2 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
              onClick={saveAccord}
              disabled={saving}
            >
              {saving ? "Enregistrement..." : "Signer & Continuer"}
            </button>
          )}
          {step === 3 && (
          <button
            type="button"
            className="rounded-md px-4 py-2 bg-red-600 text-white hover:bg-red-500 disabled:opacity-60 mr-3"
            onClick={handleSkipConsent}
            disabled={saving}
          >
            Ne pas signer
          </button>
        )}

          {step === 3 && (
            <button
              type="button"
              className="rounded-md px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={saveContent}
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

/**
 * Helpers for in-modal preview (not the PDF HTML; just to show placeholders properly)
 */
function wrapHTMLPreview(inner) {
  return `
<div style="font-size:14px; line-height:1.5;">
${inner}
</div>
`;
}

function previewSignatureBox(sig) {
  if (!sig)
    return `<span style="display:inline-block; width:70px; height:70px; color:#999; text-align:center;">(signature)</span>`;
  return `<img src="${sig}" alt="signature" style="width:300px; height:70px; object-fit:contain;" />`;
}
