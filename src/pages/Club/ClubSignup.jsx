// src/pages/Club/ClubSignup.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import MembershipSignupDocsModal from "../../components/MembershipSignupDocsModal";
import ClubMembershipPlan from "./ClubMembershipPlan";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { detectCountryISO } from "../../lib/detectCountry";


// ---------- Helpers ----------
// 🔍 Fuzzy search helper (very tolerant)
function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

async function findPossibleMatch(fullName) {
  if (!fullName.trim()) return null;

  const normalized = normalizeName(fullName);

  // Search School profiles
  const { data: schoolMatches } = await supabase
    .from("profiles")
    .select("id, full_name, birth_date, email")
    .limit(50);

  let bestMatch = null;

  if (schoolMatches) {
    for (const p of schoolMatches) {
      const n = normalizeName(p.full_name);
      if (n.includes(normalized) || normalized.includes(n)) {
        bestMatch = { ...p, source: "school" };
        break;
      }
    }
  }

  // Search Club family members
  if (!bestMatch) {
    const { data: clubMatches } = await supabase
      .from("club_profile_families")
      .select("id, full_name, birth_date, club_profile_id")
      .limit(50);

    if (clubMatches) {
      for (const p of clubMatches) {
        const n = normalizeName(p.full_name);
        if (n.includes(normalized) || normalized.includes(n)) {
          bestMatch = { ...p, source: "club" };
          break;
        }
      }
    }
  }

  return bestMatch;
}

// Compute age from YYYY-MM-DD
function computeAge(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

// Find matching rule for a given age
function findRuleForAge(rules, age) {
  if (!rules || !rules.length) return null;
  if (age == null) return null;
  return rules.find((r) => age >= r.min_age && age <= r.max_age) || null;
}

// Sanitize full name for folder path (option 2: lowercase, no accents, underscores)
function sanitizeFolderName(str) {
  return String(str || "membre")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-]/g, ""); // keep letters/numbers/_/-
}

// Upload a file into signed_docs bucket under club/{folder}/...
async function uploadIdFile(file, folder, label) {
  if (!file) return null;
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase();
  const safeLabel = label.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase();
  const path = `club/${folder}/${safeLabel}_${Date.now()}.${ext}`;
  

  const { error } = await supabase.storage
    .from("signed_docs")
    .upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });

  if (error) {
    console.error("❌ ID upload error:", error);
    throw error;
  }

  const { data } = supabase.storage.from("signed_docs").getPublicUrl(path);
  return data?.publicUrl || null;
}

export default function ClubSignup() {
  const navigate = useNavigate();
  const [mainIdFile, setMainIdFile] = useState(null);
  const [adultMembers, setAdultMembers] = useState([]);
  const [minorMembers, setMinorMembers] = useState([]);
  const [emailExists, setEmailExists] = useState(false);
  const [matchCandidate, setMatchCandidate] = useState(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchTarget, setMatchTarget] = useState(null); // "main", "spouse", or child index
  const [country, setCountry] = useState("HT");

useEffect(() => {
  try {
    const c = detectCountryISO();
    setCountry(c || "HT");
  } catch {
    setCountry("HT");
  }
}, []);

  


  // -----------------------
  // Personal info
  // -----------------------
  const [form, setForm] = useState({
    full_name: "",
    birth_date: "",
    email: "",
    phone: "",
    address: "",
    nif_cin: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");

  // -----------------------
  // Membership plans (comes from ClubMembershipPlan)
  // -----------------------
  const [selectedPlan, setSelectedPlan] = useState(null);

  // -----------------------
  // Family type dropdown
  // -----------------------
  const [familyType, setFamilyType] = useState("single"); // "single", "couple", "family"

  // -----------------------
  // Spouse info + ID file
  // -----------------------
  const [spouse, setSpouse] = useState({
    full_name: "",
    birth_date: "",
    phone: "",
    id_number: "",
  });
  const [spouseIdFile, setSpouseIdFile] = useState(null);

  // -----------------------
  // Children list (+ optional ID file)
  // -----------------------
  const [children, setChildren] = useState([]);
  // each child: { full_name, birth_date, id_file?: File | null }

  function addChild() {
    setChildren((prev) => [
      ...prev,
      { full_name: "", birth_date: "", id_file: null },
    ]);
  }

  function updateChild(idx, key, val) {
    setChildren((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [key]: val } : c))
    );
  }

  function removeChild(idx) {
    setChildren((prev) => prev.filter((_, i) => i !== idx));
  }

  // -----------------------
  // Documents modal (rules + accord)
  // -----------------------
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [docsSigned, setDocsSigned] = useState(false);
  const [signedDocs, setSignedDocs] = useState([]);

  // -----------------------
  // Auto compute total fee
  // -----------------------
  const [totalFee, setTotalFee] = useState(0);

  useEffect(() => {
  if (!selectedPlan) return;

  const rules = selectedPlan.price_rules || [];

  let base = selectedPlan.base_price_usd ?? 0;

  if (familyType === "couple" || familyType === "family") {
    base = selectedPlan.couple_price_usd ?? base;
  }

  if (familyType === "family") {
    for (const child of children) {
      const age = computeAge(child.birth_date);
      if (age == null) continue;

      const rule = findRuleForAge(rules, age);
      if (rule) base += Number(rule.monthly_fee_usd || 0);
    }
  }

  setTotalFee(base);
}, [selectedPlan, familyType, children]);

const [feeBreakdown, setFeeBreakdown] = useState([]);

useEffect(() => {
  if (!selectedPlan) {
    setFeeBreakdown([]);
    return;
  }

  const rules = selectedPlan.price_rules || [];
  const breakdown = [];

  // 🔵 Couple / Single base price
  if (familyType === "single") {
    breakdown.push({
      label: "Adulte principal",
      amount: selectedPlan.base_price_usd,
    });
  } else {
    breakdown.push({
      label: "Couple (2 adultes)",
      amount: selectedPlan.couple_price_usd ?? selectedPlan.base_price_usd,
    });
  }

  // 🔵 Children
  if (familyType === "family") {
    children.forEach((child, idx) => {
      const age = computeAge(child.birth_date);
      const rule = findRuleForAge(rules, age);
      const fee = rule ? Number(rule.monthly_fee_usd || 0) : 0;

      breakdown.push({
        label: `Enfant ${idx + 1} (${age || "—"} ans)`,
        amount: fee,
      });
    });
  }

  setFeeBreakdown(breakdown);
}, [selectedPlan, familyType, children]);


  // -----------------------
  // Form helpers
  // -----------------------
  function onChange(key, val) {
    setForm((s) => ({ ...s, [key]: val }));
  }

  async function checkExistingEmail(email) {
  if (!email) {
    setEmailExists(false);
    return;
  }

  const endpoint = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/check-email`;

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const json = await r.json();
    setEmailExists(json.exists === true);
  } catch (e) {
    console.error("Email check failed:", e);
    setEmailExists(false);
  }
}




  // ============================================================
// 1️⃣ Create or reuse auth user → then open documents modal
// ============================================================
async function startSignup() {
  setErr("");

  let userId = null; // ✅ REQUIRED


  // ---------------------------------------------
  // FULL VALIDATION — ALL FIELDS MANDATORY
  // ---------------------------------------------
  if (!selectedPlan) return setErr("Veuillez sélectionner un plan.");

  if (!form.phone || !isValidPhoneNumber(form.phone)) {
  return setErr("Numéro de téléphone invalide.");
}

if (familyType !== "single" && !isValidPhoneNumber(spouse.phone)) {
  return setErr("Numéro de téléphone du conjoint invalide.");
}


  // Main member mandatory fields
  if (!form.full_name.trim()) return setErr("Nom complet requis.");
  if (!form.birth_date) return setErr("Date de naissance requise.");
  if (!mainIdFile) return setErr("Pièce d'identité requise.");
  if (!form.email.trim()) return setErr("Email requis.");
  if (!form.phone.trim()) return setErr("Téléphone requis.");
  if (!form.address.trim()) return setErr("Adresse requise.");
  if (!form.nif_cin.trim()) return setErr("NIF / CIN requis.");
  if (!form.password.trim() && !emailExists)
  return setErr("Mot de passe requis.");


  // Spouse validation
  if (familyType !== "single") {
    if (!spouse.full_name.trim())
      return setErr("Nom complet du conjoint requis.");

    if (!spouse.birth_date)
      return setErr("Date de naissance du conjoint requise.");

    if (!spouse.phone.trim())
      return setErr("Téléphone du conjoint requis.");

    if (!spouse.id_number.trim())
      return setErr("NIF/CIN du conjoint requis.");

    if (!spouseIdFile)
      return setErr("Pièce d'identité du conjoint requise.");
  }

  // Children validation
if (familyType === "family") {
  if (!children.length)
    return setErr("Vous devez ajouter au moins un enfant.");

  for (const [idx, child] of children.entries()) {
    if (!child.full_name.trim())
      return setErr(`Nom complet requis pour l’enfant #${idx + 1}.`);

    if (!child.birth_date)
      return setErr(`Date de naissance requise pour l’enfant #${idx + 1}.`);

    const age = computeAge(child.birth_date);

    // 🚫 NEW RULE: Children older than 25 cannot be added
    if (age > 25) {
      return setErr(
        `L’enfant #${idx + 1} a ${age} ans — il doit s’inscrire individuellement.`
      );
    }

    // ID required ONLY if 18+
    if (age >= 18 && !child.id_file) {
      return setErr(
        `L’enfant #${idx + 1} a ${age} ans : la pièce d'identité est obligatoire.`
      );
    }
  }
}



  try {
   // STEP 1 — Existing email? → login required
if (emailExists) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: form.email,
    password: form.password,
  });

  if (error) {
    return setErr("Mot de passe incorrect pour ce compte existant.");
  }



  // Continue to the docs modal
} else {
  // STEP 2 — New user → create account
  const { data: signUpData, error: signUpErr } =
    await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.full_name,
          phone: form.phone,
          address: form.address,
          nif_cin: form.nif_cin,
          type: "club_user",
        },
      },
    });

  if (signUpErr) {
    return setErr("Erreur lors de la création du compte.");
  }

 
}


    // ✅ ALWAYS get the REAL authenticated user from Supabase session
const {
  data: { user: currentUser },
} = await supabase.auth.getUser();

if (!currentUser) {
  return setErr("Impossible de récupérer votre compte.");
}

userId = currentUser.id; // 🔥 the ONLY correct ID


    // Save userID to state (optional if needed later)
    // setUserId(userId);
// ============================================================
// Build adultMembers and minorMembers for modal
// ============================================================
const adults = [];
const minors = [];


// Main member
const mainAge = computeAge(form.birth_date);
if (mainAge >= 18) {
  adults.push({
    full_name: form.full_name,
    birth_date: form.birth_date,
  });
} else {
  minors.push({
    full_name: form.full_name,
    birth_date: form.birth_date,
    age: mainAge,
  });
}

// Spouse
if (familyType !== "single") {
  const spouseAge = computeAge(spouse.birth_date);

  if (spouseAge >= 18) {
    adults.push({
      full_name: spouse.full_name,
      birth_date: spouse.birth_date,
    });
  } else {
    minors.push({
      full_name: spouse.full_name,
      birth_date: spouse.birth_date,
      age: spouseAge,
    });
  }
}

// Children
if (familyType === "family") {
  for (const child of children) {
    const age = computeAge(child.birth_date);
    if (age >= 18) {
      adults.push({
        full_name: child.full_name,
        birth_date: child.birth_date,
      });
    } else {
      minors.push({
        full_name: child.full_name,
        birth_date: child.birth_date,
        age,
      });
    }
  }
}

// Store in state
setAdultMembers(adults);
setMinorMembers(minors);


    // ============================================================
    // 🔵 STEP 3 — Continue to documents modal
    // ============================================================
    setShowDocsModal(true);
  } catch (e) {
    console.error(e);
    setErr("Erreur lors de l’inscription.");
  }
}


  // ============================================================
  // 2️⃣ After documents signed → Upload IDs + Insert profile & family
  // ============================================================
  async function finishSignup() {
    setErr("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return setErr("Impossible de récupérer le compte.");

      const safeFolder = sanitizeFolderName(form.full_name || "membre");

      // Extract signed PDFs
      const rulesDoc = signedDocs.find((d) =>
        (d.form_name || "").toLowerCase().includes("règlements") ||
        (d.form_name || "").toLowerCase().includes("reglements")
      );
      const accordDoc = signedDocs.find((d) =>
        (d.form_name || "").toLowerCase().includes("accord")
      );

      const rulesPdfUrl = rulesDoc?.url || null;
      const accordPdfUrl = accordDoc?.url || null;

      // ---------- Upload main user ID ----------
      let mainIdUrl = null;
      try {
        mainIdUrl = await uploadIdFile(
          mainIdFile,
          safeFolder,
          "main_id"
        );
      } catch (uploadErr) {
        console.error(uploadErr);
        return setErr("Erreur lors du téléchargement de votre pièce d'identité.");
      }


      // ---------- Upload spouse ID (if applicable) ----------
      let spouseIdUrl = null;
      if (familyType !== "single") {
        if (!spouseIdFile) {
          return setErr(
            "Veuillez téléverser la pièce d'identité du conjoint avant de finaliser."
          );
        }
        try {
          spouseIdUrl = await uploadIdFile(
            spouseIdFile,
            safeFolder,
            "spouse_id"
          );
        } catch (uploadErr) {
          console.error(uploadErr);
          return setErr(
            "Erreur lors du téléchargement de la pièce d'identité du conjoint."
          );
        }
      }

      // ---------- Upload children IDs (only if age >= 18) ----------
      const childIdUrls = [];
      if (familyType === "family") {
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const age = computeAge(child.birth_date);
          let idUrl = null;

          if (age != null && age >= 18) {
            if (!child.id_file) {
              return setErr(
                `L’enfant #${i + 1} a ${age} ans : la pièce d'identité est obligatoire.`
              );
            }
            try {
              idUrl = await uploadIdFile(
                child.id_file,
                safeFolder,
                `child_${i + 1}_id`
              );
            } catch (uploadErr) {
              console.error(uploadErr);
              return setErr(
                `Erreur lors du téléchargement de la pièce d'identité pour l’enfant #${
                  i + 1
                }.`
              );
            }
          }

          childIdUrls.push(idUrl); // can be null for < 18
        }
      }

      // ---------- Insert main profile ----------
      const { error: profErr, data: profData } = await supabase
        .from("club_profiles")
        .insert({
          auth_user_id: uid,
          main_full_name: form.full_name,
          birth_date: form.birth_date,
          id_file_url: mainIdUrl,
          email: form.email,
          phone: form.phone || null,
          address: form.address || null,
          nif_cin: form.nif_cin || null,
          

          plan_code: selectedPlan.code?.toLowerCase(),
          membership_type:
            familyType === "single"
              ? "solo"
              : familyType === "couple"
              ? "couple"
              : "family",

          is_couple: familyType !== "single",
          has_swim_school_kids: false,

          base_monthly_fee_usd:
            familyType === "single"
              ? selectedPlan.base_price_usd
              : selectedPlan.couple_price_usd,

          total_monthly_fee_usd: totalFee,

          rules_pdf_url: rulesPdfUrl,
          accord_pdf_url: accordPdfUrl,
          status: "pending",
          docs_approved: false,
        })
        .select("*")
        .single();

      if (profErr) {
        console.error(profErr);
        return setErr("Erreur lors de la création du profil.");
      }

      const profileId = profData.id;

      // ---------- Insert spouse + children into club_profile_families ----------
      const familyRows = [];

      if (familyType !== "single") {
        familyRows.push({
          club_profile_id: profileId,
          relation: "spouse",
          full_name: spouse.full_name,
          birth_date: spouse.birth_date || null,
          phone: spouse.phone || null,
          id_file_url: spouseIdUrl || null,
          created_at: new Date().toISOString(),
        });
      }

      if (familyType === "family") {
        children.forEach((c, idx) => {
          const idUrl = childIdUrls[idx] || null;
          familyRows.push({
            club_profile_id: profileId,
            relation: "child",
            full_name: c.full_name,
            birth_date: c.birth_date,
            id_file_url: idUrl,
            created_at: new Date().toISOString(),
          });
        });
      }

      if (familyRows.length > 0) {
        const { error: famErr } = await supabase
          .from("club_profile_families")
          .insert(familyRows);

        if (famErr) {
          console.error(famErr);
          return setErr("Erreur lors de l’ajout de la famille.");
        }
      }

      // 🔵 SEND CLUB WELCOME EMAIL
try {
  await fetch(
    `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/send-club-welcome-email`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email,
        full_name: form.full_name,
      }),
    }
  );
} catch (emailErr) {
  console.error("❌ Failed to send welcome email:", emailErr);
}


      navigate("/login");
    } catch (e) {
      console.error(e);
      setErr("Erreur lors de la finalisation.");
    }
  }

  const computedGroupNames =
  familyType === "single"
    ? ""
    : familyType === "couple"
    ? spouse.full_name
    : [spouse.full_name, ...children.map(c => c.full_name)]
        .filter(Boolean)
        .join(", ");

  // ---------- PART 4: Accept match ----------
function applyMatch() {
  if (!matchCandidate) return;

  if (matchTarget === "main") {
    onChange("full_name", matchCandidate.full_name || "");
    onChange("birth_date", matchCandidate.birth_date || "");
    onChange("email", matchCandidate.email || "");
  }

  if (matchTarget === "spouse") {
    setSpouse((s) => ({
      ...s,
      full_name: matchCandidate.full_name || "",
      birth_date: matchCandidate.birth_date || "",
    }));
  }

  if (typeof matchTarget === "number") {
    // child index
    const idx = matchTarget;
    setChildren((prev) =>
      prev.map((c, i) =>
        i === idx
          ? {
              ...c,
              full_name: matchCandidate.full_name || "",
              birth_date: matchCandidate.birth_date || "",
            }
          : c
      )
    );
  }

  setShowMatchModal(false);
  setMatchCandidate(null);
  setMatchTarget(null);
}



  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <button
          type="button"
          onClick={() => navigate("/club")}
          className="text-blue-600 underline mb-4"
        >
          ← Retour au Club A'QUA D'OR
        </button>

        <div className="text-center mb-6">
          <img src="/logo/aquador.png" className="mx-auto h-20 mb-3" />
          <h1 className="text-2xl font-bold">Inscription au Club</h1>
        </div>

        {err && <div className="text-red-600 mb-3">{err}</div>}

        {/* =====================
            Personal Info
           ===================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">Nom complet *</label>
            <input
  value={form.full_name}
  onChange={async (e) => {
    const v = e.target.value;
    onChange("full_name", v);

    // ---------- PART 3: Fuzzy search trigger ----------
    const match = await findPossibleMatch(v);
    if (match) {
      setMatchCandidate(match);
      setMatchTarget("main");
      setShowMatchModal(true);
    }
  }}
  className="input"
/>

            <label className="label">Date de naissance *</label>
              <input
                type="date"
                className="input"
                value={form.birth_date}
                onChange={(e) => onChange("birth_date", e.target.value)}
              />
              <label className="label mt-3">Pièce d'identité (image / PDF) *</label>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf"
                  className="input"
                  onChange={(e) => setMainIdFile(e.target.files?.[0] || null)}
                />
                {mainIdFile && (
                  <p className="text-xs text-gray-600 mt-1">
                    Fichier sélectionné : <strong>{mainIdFile.name}</strong>
                  </p>
                )}
          </div>

          

          <div>
            <label className="label">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={async (e) => {
                const v = e.target.value;
                onChange("email", v);
                await checkExistingEmail(v.trim().toLowerCase());
              }}
              className="input"
            />

            {emailExists && (
              <p className="text-red-600 text-xs mt-1">
                Cet email est déjà lié à un compte A’QUA D’OR.<br />
                <b>Le même mot de passe sera utilisé pour vous connecter.</b>
              </p>
            )}
          </div>


          <div>
            <label className="label">Téléphone *</label>
            <PhoneInput
  international
  defaultCountry={country}
  countryCallingCodeEditable={false}
  value={form.phone}
  onChange={(v) => onChange("phone", v || "")}
  placeholder="Numéro de téléphone"
  className="w-full"
/>

          </div>

          <div className="md:col-span-2">
            <label className="label">Adresse *</label>
            <input
              value={form.address}
              onChange={(e) => onChange("address", e.target.value)}
              className="input"
            />
          </div>

          <div className="md:col-span-2">
            <label className="label">NIF / CIN *</label>
            <input
              value={form.nif_cin}
              onChange={(e) => onChange("nif_cin", e.target.value)}
              className="input"
            />
          </div>

          <div className="md:col-span-2">
            <label className="label">Mot de passe *</label>

            {/* Notice */}
            {emailExists && (
              <p className="text-yellow-800 bg-yellow-100 p-2 rounded text-xs mb-2">
                🔐 Cet email possède déjà un compte A’QUA D’OR.<br />
                Veuillez saisir <b>votre mot de passe existant</b> pour continuer.
              </p>
            )}

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="input"
                value={form.password}
                onChange={(e) => onChange("password", e.target.value)}
                placeholder={
                  emailExists
                    ? "Entrez votre mot de passe existant"
                    : "Créer un nouveau mot de passe"
                }
              />

              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

        </div>

        {/* =====================
            Membership Plan
           ===================== */}
        <ClubMembershipPlan
          selectedPlan={selectedPlan}
          setSelectedPlan={setSelectedPlan}
        />

        {/* =====================
    CHILD PRICE RULES TABLE
   ===================== */}
{selectedPlan?.price_rules?.length > 0 && familyType === "family" && (
  <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
    <h3 className="font-semibold text-lg text-gray-800 mb-3">
      Tarifs pour les enfants selon l’âge
    </h3>

    <table className="w-full text-sm border rounded-lg overflow-hidden">
      <thead className="bg-amber-100 text-gray-700">
        <tr>
          <th className="px-3 py-2 border">Tranche d’âge</th>
          <th className="px-3 py-2 border">Prix mensuel (USD)</th>
        </tr>
      </thead>
      <tbody>
        {selectedPlan.price_rules.map((rule, idx) => (
          <tr key={idx} className="text-gray-700">
            <td className="px-3 py-2 border text-center">
              {rule.min_age} – {rule.max_age} ans
            </td>
            <td className="px-3 py-2 border text-center font-semibold">
              {Number(rule.monthly_fee_usd).toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>

    <p className="text-xs text-gray-600 mt-2">
      Les frais pour chaque enfant seront automatiquement calculés selon son âge.
    </p>
  </div>
)}


        {/* =====================
            Family Type
           ===================== */}
        <div className="mt-6">
          <label className="label">Type d’adhésion</label>
          <select
            className="input"
            value={familyType}
            onChange={(e) => setFamilyType(e.target.value)}
          >
            <option value="single">Moi uniquement</option>
            <option value="couple">Moi + Époux(se)</option>
            <option value="family">Famille (époux(se) + enfants)</option>
          </select>
        </div>

        {/* =====================
            SPOUSE
           ===================== */}
        {(familyType === "couple" || familyType === "family") && (
          <div className="mt-4 border rounded-xl p-4 bg-gray-50">
            <h3 className="font-semibold text-lg mb-3">
              Informations du conjoint
            </h3>
            <label className="label">Nom complet *</label>
<input
  className="input"
  value={spouse.full_name}
  onChange={async (e) => {
    const v = e.target.value;
    setSpouse((s) => ({ ...s, full_name: v }));

    // ---------- Fuzzy match for spouse ----------
    const match = await findPossibleMatch(v);
    if (match) {
      setMatchCandidate(match);
      setMatchTarget("spouse");
      setShowMatchModal(true);
    }
  }}
/>


            <label className="label mt-3">Date de naissance *</label>
            <input
              type="date"
              className="input"
              value={spouse.birth_date}
              onChange={(e) =>
                setSpouse((s) => ({ ...s, birth_date: e.target.value }))
              }
            />

            <label className="label mt-3">Téléphone *</label>
            <PhoneInput
  international
  defaultCountry={country}
  countryCallingCodeEditable={false}
  value={spouse.phone}
  onChange={(v) =>
    setSpouse((s) => ({ ...s, phone: v || "" }))
  }
  placeholder="Numéro de téléphone"
  className="w-full"
/>


            <label className="label mt-3">NIF/CIN *</label>
            <input
              className="input"
              value={spouse.id_number}
              onChange={(e) =>
                setSpouse((s) => ({ ...s, id_number: e.target.value }))
              }
            />

            <label className="label mt-3">
              Pièce d'identité du conjoint (image / PDF) *
            </label>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf"
              className="input"
              onChange={(e) => setSpouseIdFile(e.target.files?.[0] || null)}
            />
            {spouseIdFile && (
              <p className="text-xs text-gray-600 mt-1">
                Fichier sélectionné : <strong>{spouseIdFile.name}</strong>
              </p>
            )}
          </div>
        )}

        {/* =====================
            CHILDREN
           ===================== */}
        {familyType === "family" && (
          <div className="mt-4 border rounded-xl p-4 bg-gray-50">
            <h3 className="font-semibold text-lg">Enfants</h3>

            {children.map((child, idx) => {
              const age = computeAge(child.birth_date);
              const needsId = age != null && age >= 18;

              // 🚫 NEW WARNING IF AGE > 25
if (age > 25) {
  return (
    <div key={idx} className="mt-3 border rounded-lg p-3 bg-red-50 shadow-sm">
      <div className="font-semibold text-sm text-red-700">
        Enfant #{idx + 1}
      </div>
      <p className="text-red-600 text-xs mt-2">
        Cet enfant a <strong>{age} ans</strong> — il doit créer sa propre adhésion au Club.
      </p>
      <button
        type="button"
        className="mt-2 text-red-600 underline text-xs"
        onClick={() => removeChild(idx)}
      >
        Retirer cet enfant
      </button>
    </div>
  );
}


              return (
                <div
                  key={idx}
                  className="mt-3 border rounded-lg p-3 bg-white shadow-sm"
                >
                  <div className="flex justify-between items-center">
                    <div className="font-semibold text-sm">
                      Enfant #{idx + 1}
                    </div>
                    <button
                      type="button"
                      className="text-red-600 text-xs underline"
                      onClick={() => removeChild(idx)}
                    >
                      Retirer
                    </button>
                  </div>

                  <label className="label mt-2">Nom complet *</label>
                  <input
  className="input"
  value={child.full_name}
  onChange={async (e) => {
    const v = e.target.value;
    updateChild(idx, "full_name", v);

    // ---------- Fuzzy match for child ----------
    const match = await findPossibleMatch(v);
    if (match) {
      setMatchCandidate(match);
      setMatchTarget(idx); // child index
      setShowMatchModal(true);
    }
  }}
/>


                  <label className="label mt-2">Date de naissance *</label>
                  <input
                    type="date"
                    className="input"
                    value={child.birth_date}
                    onChange={(e) =>
                      updateChild(idx, "birth_date", e.target.value)
                    }
                  />

                  {age != null && (
                    <p className="text-xs text-gray-600 mt-1">
                      Âge estimé : <strong>{age}</strong> ans
                      {needsId && " – Pièce d'identité obligatoire."}
                    </p>
                  )}

                  {/* ID file only required for 18+ (but user can still upload if they want) */}
                  <label className="label mt-3">
                    Pièce d'identité (image / PDF)
                    {needsId ? " *" : " (obligatoire à partir de 18 ans)"}
                  </label>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.pdf"
                    className="input"
                    onChange={(e) =>
                      updateChild(idx, "id_file", e.target.files?.[0] || null)
                    }
                  />
                  {child.id_file && (
                    <p className="text-xs text-gray-600 mt-1">
                      Fichier sélectionné :{" "}
                      <strong>{child.id_file.name}</strong>
                    </p>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className="mt-3 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"
              onClick={addChild}
            >
              + Ajouter un enfant
            </button>
          </div>
        )}

        {/* =====================
            Price summary
           ===================== */}
        {selectedPlan && (
  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
    <p className="font-semibold text-gray-700 mb-2">
      Total Mensuel :
      <span className="text-blue-700 font-bold ml-2">
        USD {totalFee.toFixed(2)}
      </span>
    </p>

    <div className="bg-white border rounded-lg p-3 text-sm shadow">
      <p className="font-semibold mb-2 text-gray-700">Détail :</p>

      <ul className="space-y-1">
        {feeBreakdown.map((row, idx) => (
          <li key={idx} className="flex justify-between">
            <span>{row.label}</span>
            <span className="font-semibold">USD {row.amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
)}


        {/* =====================
            Buttons
           ===================== */}
        <div className="mt-6">
          {!docsSigned ? (
            <button
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold shadow hover:bg-orange-600 transition"
              onClick={startSignup}
            >
              Commencer l’inscription
            </button>
          ) : (
            <button
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold shadow hover:bg-orange-600 transition"
              onClick={finishSignup}
            >
              Finaliser et créer mon compte
            </button>
          )}
        </div>

        {showDocsModal && (
          <MembershipSignupDocsModal
          fullName={form.full_name}
  birthDate={form.birth_date}
  email={form.email}
  phone={form.phone}
  address={form.address}
  nifCIN={form.nif_cin}
  spouse={spouse}
  children={children}
  familyType={familyType}
    adultMembers={adultMembers}
    minorMembers={minorMembers}
    childrenAges={children.map(c => computeAge(c.birth_date))}
    parentName={form.full_name}

    selectedPlan={selectedPlan}
    totalFee={totalFee}

    groupNames={computedGroupNames}   // FIXED

    onClose={() => setShowDocsModal(false)}
    onDone={(results) => {
      setSignedDocs(results || []);
      setDocsSigned(true);
      setShowDocsModal(false);
    }}
/>

        )}
      </div>
      {/* ---------- PART 5: Match confirmation modal ---------- */}
{showMatchModal && matchCandidate && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-xl shadow-xl w-96">
      <h2 className="text-lg font-semibold mb-3">
        Voulez-vous sélectionner ce membre ?
      </h2>

      <p className="mb-2">
        <strong>Nom :</strong> {matchCandidate.full_name}
      </p>
      <p className="mb-4">
        <strong>Date de naissance :</strong>{" "}
        {matchCandidate.birth_date || "N/A"}
      </p>

      <div className="flex justify-end gap-3">
        <button
          className="px-4 py-2 bg-gray-200 rounded-lg"
          onClick={() => {
            setShowMatchModal(false);
            setMatchCandidate(null);
          }}
        >
          Non
        </button>

        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          onClick={applyMatch}
        >
          Oui
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  );
}
