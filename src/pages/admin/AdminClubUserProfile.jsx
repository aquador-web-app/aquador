// src/pages/admin/AdminClubUserProfile.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";
import {
  FaArrowLeft,
  FaUser,
  FaUsers,
  FaFilePdf,
  FaQrcode,
  FaIdCard,
} from "react-icons/fa";

function computeAge(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}


function computeChildFee(age, plan) {
  const rules = Array.isArray(plan.club_price_rules)
  ? plan.club_price_rules
  : [];

const rule = rules.find(r => age >= r.min_age && age <= r.max_age);
  return rule ? Number(rule.monthly_fee_usd) : 0;
}


async function loadPlanPricing(planCode) {
  if (!planCode) return null;

  const { data, error } = await supabase
    .from("club_membership_plans")
    .select(`
      *,
      club_price_rules:club_price_rules!club_price_rules_plan_id_fkey(*)
    `)
    .eq("code", planCode.toUpperCase())   // <-- FIX RIGHT HERE
    .maybeSingle();

  if (error) console.error("❌ loadPlanPricing error:", error);
  if (!data) console.error("❌ loadPlanPricing returned NO DATA for planCode:", planCode);

  return data;
}




const STATUS_LABELS = {
  pending: "En attente",
  active: "Actif",
  rejected: "Rejeté",
};

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function EditableInfoRow({ label, field, value, onLocalChange }) {
  const isDate = field === "birth_date";
  const isBoolean = typeof value === "boolean";

  const formattedValue =
    isDate && value ? value.slice(0, 10) : value ?? "";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 text-sm py-1">
      <div className="sm:w-48 text-gray-500">{label}</div>

      {isDate ? (
        <input
          type="date"
          value={formattedValue}
          onChange={(e) => onLocalChange(field, e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
      ) : isBoolean ? (
        <select
          value={value ? "true" : "false"}
          onChange={(e) => onLocalChange(field, e.target.value === "true")}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        >
          <option value="true">Oui</option>
          <option value="false">Non</option>
        </select>
      ) : (
        <input
          type="text"
          value={formattedValue}
          onChange={(e) => onLocalChange(field, e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}


export default function AdminClubUserProfile({ profileId: propId, onBack }) {
  const { id: routeId } = useParams();
  const profileId = propId || routeId;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [profile, setProfile] = useState(null);
  const [families, setFamilies] = useState([]);
  const [tab, setTab] = useState("summary"); // summary | family | documents
  const [editData, setEditData] = useState(null);
  const [showAddFamily, setShowAddFamily] = useState(false);
const [newFamily, setNewFamily] = useState({
  full_name: "",
  relation: "",
  birth_date: "",
  phone: "",
  monthly_fee_usd: "",
  id_document_url: ""
});
const [autoChildFee, setAutoChildFee] = useState(0);
const [familyEdits, setFamilyEdits] = useState({});


useEffect(() => {
  async function updateFee() {
    if (newFamily.relation !== "child" || !newFamily.birth_date) {
      setAutoChildFee(0);
      return;
    }

    const age = computeAge(newFamily.birth_date);
    const plan = await loadPlanPricing(profile.plan_code);
    setAutoChildFee(computeChildFee(age, plan));
  }

  updateFee();
}, [newFamily.relation, newFamily.birth_date, profile?.plan_code]);

// 🔄 Auto-recompute all fees when plan changes
useEffect(() => {
  if (!editData?.plan_code || families.length === 0) return;

  async function recomputeFees() {
    const plan = await loadPlanPricing(editData.plan_code);
    if (!plan) return;

    let newTotal = 0;

    const isCouple =
      editData.membership_type === "couple" ||
      profile?.is_couple === true;

    newTotal = isCouple
      ? Number(plan.couple_price_usd)
      : Number(plan.base_price_usd);

    const updatedEdits = {};

    families.forEach((fam) => {
      const edit = familyEdits[fam.id] || fam;

      let monthlyFee = 0;

      if (edit.relation === "child" && edit.birth_date) {
        const age = computeAge(edit.birth_date);
        monthlyFee = computeChildFee(age, plan);
      }

      if (edit.relation === "spouse") {
        monthlyFee = 0;
      }

      updatedEdits[fam.id] = {
        ...edit,
        monthly_fee_usd: monthlyFee,
      };

      newTotal += monthlyFee;
    });

    setFamilyEdits(updatedEdits);
    setProfile(prev =>
      prev ? { ...prev, total_monthly_fee_usd: newTotal } : prev
    );
  }

  recomputeFees();
}, [editData?.plan_code]);



  useEffect(() => {
    if (!profileId) {
      setErr("Profil introuvable.");
      setLoading(false);
      return;
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function loadProfile() {
  setLoading(true);
  setErr("");

  try {
    const { data, error } = await supabase
      .from("club_profiles")
      .select(`
        *,
        club_profile_families (
          id, full_name, relation, birth_date, phone, id_file_url, monthly_fee_usd
        )
      `)
      .or(`id.eq.${profileId},auth_user_id.eq.${profileId}`)
      .single();

    if (error) {
      console.error("Error loading club profile:", error);
      setErr("Erreur lors du chargement du profil.");
      setProfile(null);
      setFamilies([]);
      setEditData(null);
    } else {
      setProfile(data);
      setFamilies(data.club_profile_families || []);
      const edits = {};
(data.club_profile_families || []).forEach(f => {
  edits[f.id] = { ...f }; // clone editable family data
});
setFamilyEdits(edits);


      // 🧹 CLEAN EDITABLE DATA (no nested relations)
      const {
        club_profile_families,
        created_at,
        updated_at,
        activated_at,
        qr_code_url,
        membership_card_url,
        ...clean
      } = data;

      setEditData({
  ...clean,
  plan_code: clean.plan_code ? clean.plan_code.toUpperCase() : null
});


    }
  } catch (e) {
    console.error(e);
    setErr("Erreur lors du chargement du profil.");
    setEditData(null);
    setProfile(null);
    setFamilies([]);
  }

  setLoading(false);
}


useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    console.log("🔐 FULL SESSION OBJECT:", data);
    if (data?.session?.access_token) {
      const token = data.session.access_token;
      const payload = JSON.parse(atob(token.split(".")[1]));
      console.log("🧩 JWT PAYLOAD:", payload);
    }
  });
}, []);



  const goBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  if (loading) {
    return (
      <div className="p-6">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 text-sm text-blue-600 mb-4"
        >
          <FaArrowLeft /> Retour
        </button>
        <p className="text-gray-600 text-sm">Chargement du profil…</p>
      </div>
    );
  }

  if (err || !profile) {
    return (
      <div className="p-6">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 text-sm text-blue-600 mb-4"
        >
          <FaArrowLeft /> Retour
        </button>
        <p className="text-red-600 text-sm">{err || "Profil introuvable."}</p>
      </div>
    );
  }

    async function saveFamilyMember(familyId) {
  const row = familyEdits[familyId];

  if (!row) {
    alert("Erreur: données invalides.");
    return;
  }

  try {
    // 1️⃣ Load plan
    const plan = await loadPlanPricing(editData?.plan_code || profile.plan_code);
    if (!plan) {
  console.error("❌ ERROR: loadPlanPricing returned NULL. planCode =", editData?.plan_code || profile.plan_code);
  alert("Impossible de charger le plan.");
  return;
}


    // 2️⃣ Compute monthly fee from rules
    let monthlyFee = 0;

    if (row.relation === "child" && row.birth_date) {
      const age = computeAge(row.birth_date);
      monthlyFee = computeChildFee(age, plan);
    } else if (row.relation === "spouse") {
      monthlyFee = 0; // couple fees are in main profile
    }

    if (row.relation === "spouse") {
  monthlyFee = 0;
}


    const payload = {
      full_name: row.full_name,
      relation: row.relation,
      birth_date: row.birth_date ? row.birth_date.slice(0, 10) : null,
      phone: row.phone,
      monthly_fee_usd: monthlyFee,
      id_file_url: row.id_file_url,
    };

    // 3️⃣ Update family row
    const { error: famErr } = await supabase
      .from("club_profile_families")
      .update(payload)
      .eq("id", familyId);

    if (famErr) {
      console.error(famErr);
      alert("Erreur: " + famErr.message);
      return;
    }

    // 4️⃣ Recompute total monthly fee
    const updatedFamilies = families.map((f) =>
      f.id === familyId ? { ...f, ...payload } : f
    );

    let newTotal = 0;
    const isCouple =
      profile.membership_type === "couple" || profile.is_couple === true;

    newTotal = isCouple
      ? Number(plan.couple_price_usd)
      : Number(plan.base_price_usd);

    const updatedEdits = {};


    families.forEach((fam) => {
  const edit = familyEdits[fam.id]; // ALWAYS use edited version

  let monthlyFee = 0;

  if (edit.relation === "child" && edit.birth_date) {
    const age = computeAge(edit.birth_date);
    monthlyFee = computeChildFee(age, plan);
  }
   
  if (edit.relation === "spouse") {
    monthlyFee = 0;
  }

  updatedEdits[fam.id] = {
    ...edit,
    monthly_fee_usd: monthlyFee,
  };

  newTotal += monthlyFee;
});



    await supabase
      .from("club_profiles")
      .update({ total_monthly_fee_usd: newTotal })
      .eq("id", profileId);

    alert("✔️ Modifications enregistrées !");
    loadProfile();
  } catch (e) {
    console.error("saveFamilyMember error:", e);
    alert("Erreur inattendue.");
  }
}



  async function addFamilyMember() {
  if (!newFamily.full_name || !newFamily.relation) {
    alert("Veuillez remplir le nom et la relation.");
    return;
  }

  // 🚫 CHILDREN OLDER THAN 25 CANNOT BE ADDED
  if (newFamily.relation === "child" && newFamily.birth_date) {
    const age = computeAge(newFamily.birth_date);
    if (age > 25) {
      alert(`Cet enfant a ${age} ans — il doit créer sa propre adhésion.`);
      return;
    }
  }

  // 🔵 If adding spouse, convert membership to couple
  let isNowCouple =
    newFamily.relation === "spouse" || profile.membership_type === "couple";

  if (newFamily.relation === "spouse") {
    await supabase
      .from("club_profiles")
      .update({
        membership_type: "couple",
        is_couple: true,
      })
      .eq("id", profileId);

    setProfile(prev => ({
      ...prev,
      membership_type: "couple",
      is_couple: true,
    }));
  }

  // 🔶 REQUIRE ID FOR CHILD 18+
  if (newFamily.relation === "child" && newFamily.birth_date) {
    const age = computeAge(newFamily.birth_date);
    if (age >= 18 && !newFamily.id_file_url) {
      alert(`Cet enfant a ${age} ans — la pièce d’identité est obligatoire.`);
      return;
    }
  }

  // Load plan + pricing rules
  const plan = await loadPlanPricing(profile.plan_code);

  // 🔹 Compute child's fee (if child)
  let childFee = 0;
  if (newFamily.relation === "child" && newFamily.birth_date) {
    const age = computeAge(newFamily.birth_date);
    childFee = computeChildFee(age, plan);
  }

  // 🔹 Build payload BEFORE calculating totals
  const payload = {
    club_profile_id: profileId,
    full_name: newFamily.full_name,
    relation: newFamily.relation,
    birth_date: newFamily.birth_date || null,
    phone: newFamily.phone || null,
    monthly_fee_usd: childFee, // AUTO-SET
    id_file_url: newFamily.id_file_url || null,
  };

  // 🔹 Compute base membership price
  let newTotal = isNowCouple
    ? Number(plan.couple_price_usd)
    : Number(plan.base_price_usd);

  // 🔹 Add children fees (existing + new one)
  for (const fam of [...families, payload]) {
    if (fam.relation === "child" && fam.birth_date) {
      const age = computeAge(fam.birth_date);
      newTotal += computeChildFee(age, plan);
    }
  }

  // 🔹 Insert new family row
  const { data, error } = await supabase
    .from("club_profile_families")
    .insert(payload)
    .select();

  if (error) {
    console.error("❌ Error adding family member:", error);
    alert("Erreur: " + error.message);
    return;
  }

  // 🔹 Update new total in DB
  await supabase
    .from("club_profiles")
    .update({ total_monthly_fee_usd: newTotal })
    .eq("id", profileId);

  // 🔹 Update UI
  setProfile(prev => ({ ...prev, total_monthly_fee_usd: newTotal }));
  setFamilies(prev => [...prev, data[0]]);

  // Reset form
  setNewFamily({
    full_name: "",
    relation: "",
    birth_date: "",
    phone: "",
    monthly_fee_usd: "",
    id_file_url: "",
  });

  setShowAddFamily(false);
  alert("✔️ Membre ajouté !");
}




    async function saveAll() {
    if (!editData) {
      alert("Erreur: données manquantes.");
      return;
    }

    // FORCE PLAN CODE TO UPPERCASE BEFORE SAVING
if (editData.plan_code) {
  editData.plan_code = editData.plan_code.trim().toUpperCase();
}


    console.log("🔍 RAW EDIT DATA:", editData);
    console.log("🆔 PROFILE ID USED FOR UPDATE:", profileId);

    // ✅ Always use a valid, UPPERCASE plan_code, falling back to the profile value
    const safePlanCode =
  (editData.plan_code || profile.plan_code || "").trim().toLowerCase();


    if (!safePlanCode) {
      alert("Plan manquant : aucun plan_code valide pour ce membre.");
      return;
    }

    // ✅ Same for membership_type: fallback to profile if empty
    const safeMembershipType = editData.membership_type || profile.membership_type;

    const finalPayload = {
      main_full_name: editData.main_full_name,
      address: editData.address,
      phone: editData.phone,
      email: editData.email,
      nif_cin: editData.nif_cin,
      birth_date: editData.birth_date,
      is_couple: editData.is_couple,
      has_swim_school_kids: editData.has_swim_school_kids,
      pay_full_year: editData.pay_full_year,
      plan_code: safePlanCode,
      membership_type: safeMembershipType,
    };

    // ✅ FIX DATE FORMAT FOR SUPABASE
    if (finalPayload.birth_date) {
      finalPayload.birth_date = finalPayload.birth_date.slice(0, 10);
    }

    console.log("📦 FINAL CLEAN PAYLOAD:", finalPayload);

    // 🔄 Auto-update total monthly fee in DB
    const plan = await loadPlanPricing(safePlanCode);
    if (!plan) {
      console.error("❌ Impossible de charger le plan pour", safePlanCode);
      alert("Impossible de charger le plan pour ce membre.");
      return;
    }

    let newTotal = 0;

    const isCouple =
      safeMembershipType === "couple" ||
      finalPayload.is_couple === true ||
      profile.is_couple === true;

    newTotal = isCouple
      ? Number(plan.couple_price_usd)
      : Number(plan.base_price_usd);

    families.forEach((fam) => {
      if (fam.relation === "child" && fam.birth_date) {
        const age = computeAge(fam.birth_date);
        newTotal += computeChildFee(age, plan);
      }
    });

    // ✅ UPDATE EVERYTHING IN ONE CALL
    const { data, error } = await supabase
      .from("club_profiles")
      .update({
        ...finalPayload,
        total_monthly_fee_usd: newTotal,
      })
      .eq("id", profileId)
      .select();

    if (error) {
      console.error("❌ UPDATE ERROR:", error);
      alert("Erreur lors de la mise à jour: " + error.message);
      return;
    }

    alert("✔️ Enregistré !");
    setProfile((prev) =>
      prev ? { ...prev, ...finalPayload, total_monthly_fee_usd: newTotal } : prev
    );
  }


  const statusColor =
    STATUS_COLORS[profile.status] || "bg-gray-100 text-gray-800";
  const statusLabel =
    STATUS_LABELS[profile.status] || profile.status || "—";

  return (
    <div className="p-6 space-y-4">
      {/* Back */}
      <button
        onClick={goBack}
        className="inline-flex items-center gap-2 text-sm text-blue-600 mb-4"
      >
        <FaArrowLeft /> Retour à la liste des membres
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FaUser />
            {profile.main_full_name}
          </h1>
          <div className="text-sm text-gray-600">
            {(profile.membership_type || "—").toUpperCase()} •{" "}
            {(profile.plan_code || "—").toUpperCase()}
          </div>
          <div className="mt-1 text-sm text-gray-500">
            Email: {profile.email || "—"} | Tél: {profile.phone || "—"}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}
          >
            {statusLabel}
          </span>
          {profile.docs_approved && (
            <span className="text-[11px] text-emerald-700">
              Documents approuvés
            </span>
          )}
          {profile.total_monthly_fee_usd != null && (
            <span className="text-sm text-gray-700">
              Total mensuel:{" "}
              <strong>
                 {formatCurrencyUSD(profile.total_monthly_fee_usd)}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Créé le"
          value={
            profile.created_at ? formatDateFrSafe(profile.created_at) : "—"
          }
        />
        <SummaryCard
          label="Activé le"
          value={
            profile.activated_at ? formatDateFrSafe(profile.activated_at) : "—"
          }
        />
        <SummaryCard
          label="Couple ?"
          value={profile.is_couple ? "Oui" : "Non"}
        />
        <SummaryCard
          label="Enfants école natation"
          value={profile.has_swim_school_kids ? "Oui" : "Non"}
        />
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-4 text-sm mt-4">
        <TabButton
          label="Résumé"
          active={tab === "summary"}
          onClick={() => setTab("summary")}
        />
        <TabButton
          label="Famille"
          icon={<FaUsers className="text-xs" />}
          active={tab === "family"}
          onClick={() => setTab("family")}
        />
        <TabButton
          label="Documents"
          icon={<FaFilePdf className="text-xs" />}
          active={tab === "documents"}
          onClick={() => setTab("documents")}
        />
      </div>

      {/* Tab content */}
      {tab === "summary" && (
        <div className="bg-white p-4 rounded-2xl shadow space-y-3">
          <h2 className="text-lg font-semibold mb-2">Informations générales</h2>
          <EditableInfoRow
  label="Nom complet"
  field="main_full_name"
  value={editData?.main_full_name}
  onLocalChange={(field, val) =>
  setEditData(prev => ({ ...prev, [field]: val }))
}

/>

<EditableInfoRow
  label="Email"
  field="email"
  value={editData?.email}
  onLocalChange={(field, val) =>
  setEditData(prev => ({ ...prev, [field]: val }))
}

/>

<EditableInfoRow
  label="Téléphone"
  field="phone"
  value={editData?.phone}
  onLocalChange={(field, val) =>
  setEditData(prev => ({ ...prev, [field]: val }))
}

/>

<EditableInfoRow
  label="Adresse"
  field="address"
  value={editData?.address}
  onLocalChange={(field, val) =>
  setEditData(prev => ({ ...prev, [field]: val }))
}

/>

<EditableInfoRow
  label="NIF / CIN"
  field="nif_cin"
  value={editData?.nif_cin}
  onLocalChange={(field, val) =>
  setEditData(prev => ({ ...prev, [field]: val }))
}

/>

<EditableInfoRow
  label="Date de naissance"
  field="birth_date"
  value={editData?.birth_date}
  onLocalChange={(field, val) =>
  setEditData(prev => ({ ...prev, [field]: val }))
}

/>

<EditableInfoRow
  label="Type d’adhésion"
  field="membership_type"
  value={editData?.membership_type}
  onLocalChange={(field, val) =>
  setEditData(prev => ({ ...prev, [field]: val }))
}

/>

<div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 text-sm py-1">
  <div className="sm:w-48 text-gray-500">Plan</div>

  <select
    value={editData?.plan_code || ""}
    onChange={(e) =>
      setEditData(prev => ({
        ...prev,
        plan_code: e.target.value.toUpperCase(),
      }))
    }
    className="flex-1 border rounded-lg px-3 py-2 text-sm"
  >
    <option value="">— Sélectionner —</option>
    <option value="BRONZE">BRONZE</option>
    <option value="SILVER">SILVER</option>
    <option value="GOLD">GOLD</option>
    <option value="PLATINUM">PLATINUM</option>
  </select>
</div>


<EditableInfoRow
  label="Paiement annuel ? (true/false)"
  field="pay_full_year"
  value={editData?.pay_full_year}
  onLocalChange={(field, val) =>
  setEditData(prev => ({ ...prev, [field]: val }))
}

/>
<button
  onClick={saveAll}
  className="mt-4 bg-aquaBlue text-white px-4 py-2 rounded-lg shadow hover:bg-aquaBlue/80"
>
  💾 Enregistrer les modifications
</button>

        </div>
      )}

      {tab === "family" && (
        <div className="bg-white p-4 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FaUsers /> Famille
          </h2>
          <button
  onClick={() => setShowAddFamily(true)}
  className="mb-4 bg-aquaBlue text-white px-3 py-2 rounded-lg shadow hover:bg-aquaBlue/80 text-sm"
>
  ➕ Ajouter une personne
</button>


          {families.length === 0 ? (
            <p className="text-sm text-gray-600">
              Aucun membre de famille enregistré pour ce profil club.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-gray-600">
                  <Th>Nom</Th>
                  <Th>Relation</Th>
                  <Th>Date de naissance</Th>
                  <Th>Téléphone</Th>
                  <Th>Frais mensuels</Th>
                  <Th>Pièce d’identité</Th>
                </tr>
              </thead>
              <tbody>
  {families.map(f => (
    <tr key={f.id} className="border-b hover:bg-gray-50">

      {/* Name */}
      <Td>
        <input
          type="text"
          className="w-full border px-2 py-1 rounded"
          value={familyEdits[f.id]?.full_name || ""}
          onChange={(e) =>
            setFamilyEdits(prev => ({
              ...prev,
              [f.id]: { ...prev[f.id], full_name: e.target.value }
            }))
          }
        />
      </Td>

      {/* Relation */}
      <Td>
        <select
          className="w-full border px-2 py-1 rounded"
          value={familyEdits[f.id]?.relation || ""}
          onChange={(e) =>
            setFamilyEdits(prev => ({
              ...prev,
              [f.id]: { ...prev[f.id], relation: e.target.value }
            }))
          }
        >
          <option value="">—</option>
          <option value="spouse">Époux(se)</option>
          <option value="child">Enfant</option>
        </select>
      </Td>

      {/* Birth Date */}
      <Td>
        <input
          type="date"
          className="w-full border px-2 py-1 rounded"
          value={
            familyEdits[f.id]?.birth_date
              ? familyEdits[f.id].birth_date.slice(0,10)
              : ""
          }
          onChange={(e) =>
            setFamilyEdits(prev => ({
              ...prev,
              [f.id]: { ...prev[f.id], birth_date: e.target.value }
            }))
          }
        />
      </Td>

      {/* Phone */}
      <Td>
        <input
          type="text"
          className="w-full border px-2 py-1 rounded"
          value={familyEdits[f.id]?.phone || ""}
          onChange={(e) =>
            setFamilyEdits(prev => ({
              ...prev,
              [f.id]: { ...prev[f.id], phone: e.target.value }
            }))
          }
        />
      </Td>

      {/* Monthly Fee */}
      <Td>
        <input
  type="text"
  className="w-full border px-2 py-1 rounded bg-gray-100"
  value={familyEdits[f.id]?.monthly_fee_usd ?? 0}
  readOnly
/>
      </Td>

      {/* ID file URL */}
      <Td>
        <input
          type="text"
          className="w-full border px-2 py-1 rounded"
          value={familyEdits[f.id]?.id_file_url || ""}
          readOnly
        />
      </Td>

      {/* Save Button */}
      <Td>
        <button
          className="text-xs bg-aquaBlue text-white px-3 py-1 rounded shadow hover:bg-aquaBlue/80"
          onClick={() => saveFamilyMember(f.id)}
        >
          💾 Sauvegarder
        </button>
      </Td>

    </tr>
  ))}
</tbody>

            </table>
          )}
        </div>
      )}

      {tab === "documents" && (
        <div className="bg-white p-4 rounded-2xl shadow space-y-3">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FaFilePdf /> Documents d’adhésion et cartes
          </h2>

          <DocsRow
            label="Pièce d’identité (membre principal)"
            url={profile.id_file_url}
            icon={<FaIdCard />}
          />
          <DocsRow
            label="Règlements signés"
            url={profile.rules_pdf_url}
            icon={<FaFilePdf />}
          />
          <DocsRow
            label="Accord signé"
            url={profile.accord_pdf_url}
            icon={<FaFilePdf />}
          />
          <DocsRow
            label="Carte de membre"
            url={profile.membership_card_url}
            icon={<FaIdCard />}
          />

          {families.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2 text-sm">
                Pièces d’identité de la famille
              </h3>
              <ul className="space-y-1 text-sm">
                {families.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <span className="font-medium">
                      {f.full_name} ({f.relation || "—"})
                    </span>
                    {f.id_file_url ? (
                      <a
                        href={f.id_file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 underline"
                      >
                        <FaIdCard /> Voir ID
                      </a>
                    ) : (
                      <span className="text-gray-500 text-xs">
                        Aucune pièce d’identité enregistrée
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {showAddFamily && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-xl shadow-xl w-96 space-y-3">

      <h2 className="text-lg font-semibold mb-2">
        Ajouter un membre à l’adhésion
      </h2>

      <input
        type="text"
        placeholder="Nom complet"
        className="w-full border px-3 py-2 rounded"
        value={newFamily.full_name}
        onChange={(e) => setNewFamily({ ...newFamily, full_name: e.target.value })}
      />

      <select
  className="w-full border px-3 py-2 rounded"
  value={newFamily.relation}
  onChange={(e) => setNewFamily({ ...newFamily, relation: e.target.value })}
>
  <option value="">-- Sélectionner --</option>
  <option value="spouse">Époux(se)</option>
  <option value="child">Enfant(s)</option>
</select>


      <input
        type="date"
        className="w-full border px-3 py-2 rounded"
        value={newFamily.birth_date}
        onChange={(e) => setNewFamily({ ...newFamily, birth_date: e.target.value })}
      />

      <input
        type="text"
        placeholder="Téléphone"
        className="w-full border px-3 py-2 rounded"
        value={newFamily.phone}
        onChange={(e) => setNewFamily({ ...newFamily, phone: e.target.value })}
      />

      {/* 🔵 Show this only when child is 18+ */}
{newFamily.relation === "child" &&
 newFamily.birth_date &&
 computeAge(newFamily.birth_date) >= 18 && (
  <div className="space-y-1">
    <label className="text-sm text-gray-700 font-medium">
      Pièce d’identité (obligatoire 18+)
    </label>
    <input
      type="text"
      placeholder="URL de la pièce d’identité"
      className="w-full border px-3 py-2 rounded"
      value={newFamily.id_file_url}
      onChange={(e) =>
        setNewFamily({ ...newFamily, id_file_url: e.target.value })
      }
    />
  </div>
)}

{/* fee preview */}
{newFamily.relation === "child" && newFamily.birth_date && (
  <div className="text-sm text-gray-700">
    Frais mensuels estimés: <strong>{autoChildFee}</strong>
  </div>
)}


      <button
        onClick={addFamilyMember}
        className="w-full bg-aquaBlue text-white py-2 rounded-lg shadow hover:bg-aquaBlue/80"
      >
        Ajouter
      </button>

      <button
        onClick={() => setShowAddFamily(false)}
        className="w-full bg-gray-200 py-2 rounded hover:bg-gray-300"
      >
        Annuler
      </button>

    </div>
  </div>
)}

    </div>
  );
}

// ---------- Small components ----------

function SummaryCard({ label, value }) {
  return (
    <div className="p-4 bg-white rounded-2xl shadow">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-base font-semibold mt-1">{value}</div>
    </div>
  );
}

function TabButton({ label, icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 border-b-2 -mb-[1px] text-sm flex items-center gap-2 ${
        active
          ? "border-aquaBlue text-aquaBlue font-semibold"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 text-sm">
      <div className="sm:w-48 text-gray-500">{label}</div>
      <div className="flex-1 text-gray-800">{value || "—"}</div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
      {children}
    </th>
  );
}

function Td({ children }) {
  return <td className="px-3 py-2 align-top text-sm">{children}</td>;
}

function DocsRow({ label, url, icon }) {
  return (
    <div className="flex items-center justify-between text-sm border-b last:border-b-0 py-2">
      <div className="text-gray-700">{label}</div>
      <div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 underline"
          >
            {icon}
            <span>Ouvrir</span>
          </a>
        ) : (
          <span className="text-gray-400 text-xs">Non disponible</span>
        )}
      </div>
    </div>
  );
}
