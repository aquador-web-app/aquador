import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useSearchParams } from "react-router-dom";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { detectCountryISO } from "../../lib/detectCountry";


export default function AdminUsersForm({ user, onClose, onSave, parentId }) {
  const [formData, setFormData] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    birth_date: "",
    sex: "",  
    email: "",
    phone: "",
    address: "",
    role: "student",
    referral_code: "",
    referrer_user_id: "",
    signup_type: "me",
    is_active: true,
    parent_id: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
const [country, setCountry] = useState("HT");


useEffect(() => {
  try {
    const c = detectCountryISO();
    setCountry(c || "HT");
  } catch {
    setCountry("HT");
  }
}, []);



  // 🧩 Generate referral like DEA91, MD93, etc.
  const generateReferral = (first, middle, last, birthDate) => {
    if (!first || !last || !birthDate) return "";
    const initials =
      first.charAt(0).toUpperCase() +
      (middle ? middle.charAt(0).toUpperCase() : "") +
      last.charAt(0).toUpperCase();
    const year = new Date(birthDate).getFullYear().toString().slice(-2);
    return initials + year;
  };

  // 🧠 FIXED: safely merge user data without overwriting defaults
  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        first_name: user.first_name ?? prev.first_name,
        middle_name: user.middle_name ?? prev.middle_name,
        last_name: user.last_name ?? prev.last_name,
        birth_date: user.birth_date ?? prev.birth_date,
        sex: user.sex ?? prev.sex,
        email: user.email ?? prev.email,
        phone: user.phone ?? prev.phone,
        address: user.address ?? prev.address,
        role: user.role ?? prev.role,
        referral_code: user.referral_code ?? prev.referral_code,
        referrer_user_id: user.referrer_user_id ?? prev.referrer_user_id,
        signup_type: user.signup_type ?? prev.signup_type,
        is_active: user.is_active ?? prev.is_active,
        parent_id: user.parent_id ?? prev.parent_id,
      }));
    } else if (parentId) {
      setFormData((prev) => ({ ...prev, parent_id: parentId }));
    }
  }, [user, parentId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      referral_code:
        ["first_name", "middle_name", "last_name", "birth_date"].includes(name)
          ? generateReferral(
              name === "first_name" ? value : prev.first_name,
              name === "middle_name" ? value : prev.middle_name,
              name === "last_name" ? value : prev.last_name,
              name === "birth_date" ? value : prev.birth_date
            )
          : prev.referral_code,
    }));
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError(null);

  // 📞 Phone validation (optional but enforced if provided)
if (formData.phone && !isValidPhoneNumber(formData.phone)) {
  alert("Numéro de téléphone invalide.");
  setLoading(false);
  return;
}


  try {

        // ---------------------------------------------------------
    // 🟦 CASE 1 — EDIT USER (NO EDGE FUNCTION)
    // ---------------------------------------------------------
    if (user && user.id) {
      try {
        // 1️⃣ UPDATE auth email if it changed
        if (formData.email && formData.email !== user.email) {
          const { error: authErr } = await supabase.auth.admin.updateUserById(
            user.id,
            { email: formData.email }
          );
          if (authErr) throw new Error(authErr.message);
        }

        // 2️⃣ UPDATE profile data
        const { error: profErr } = await supabase
          .from("profiles")
          .update({
            first_name: formData.first_name,
            middle_name: formData.middle_name,
            last_name: formData.last_name,
            birth_date: formData.birth_date,
            sex: formData.sex,
            phone: formData.phone || null,
            address: formData.address,
            role: formData.role,
            referral_code: formData.referral_code,
            signup_type: formData.signup_type,
            is_active: formData.is_active,
          })
          .eq("id", user.id);

        if (profErr) throw new Error(profErr.message);

        onSave?.();
        onClose?.();
        setLoading(false);
        return; // 🛑 STOP HERE — do NOT call create-user
      } catch (err) {
        alert("Erreur: " + err.message);
        setLoading(false);
        return;
      }
    }

    // 🧠 Normalize form data (convert empty strings to null)
    const cleaned = {};
    for (const [key, val] of Object.entries(formData)) {
      cleaned[key] = val === "" || val === undefined ? null : val;
    }

    // 🧩 Enforce non-null defaults
    cleaned.role = cleaned.role || "student";
    cleaned.signup_type = cleaned.signup_type || "me";
    cleaned.is_active = cleaned.is_active ?? true;

    // 🧾 Ensure birth_date is valid ISO date
    if (cleaned.birth_date) {
      const d = new Date(cleaned.birth_date);
      cleaned.birth_date = !isNaN(d.getTime())
        ? d.toISOString().slice(0, 10)
        : null;
    }
    if (parentId) {
  cleaned.parent_id = parentId;
  cleaned.signup_type = "children_only";
  cleaned.role = "student";
  cleaned.email = null; // the backend auto-generates
  cleaned.phone = null;
  cleaned.address = null;
}


    // ✅ Build payload with ALL expected keys (even if missing)
    const expectedKeys = [
      "user_id",
      "email",
      "password",
      "first_name",
      "middle_name",
      "last_name",
      "birth_date",
      "sex",
      "phone",
      "address",
      "role",
      "signup_type",
      "parent_id",
      "referral_code",
      "referrer_user_id",
      "first_lesson",
      "medical_note",
      "is_active",
    ];


    const payload = {};
    for (const key of expectedKeys) {
      // preserve provided value or explicitly null
      payload[key] = cleaned[key] ?? null;
    }
    payload.password = "Temp1234!"; // always present for backend consistency

    // 🧠 Serialize with all null keys intact
    const jsonPayload = JSON.parse(
      JSON.stringify(payload, (k, v) => (v === undefined ? null : v))
    );

    console.log("📦 FINAL payload sent (complete):", jsonPayload);

    // 🛰 Send to Supabase Edge Function
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;

    const resp = await fetch(fnUrl, {
      method: "POST",
      headers: {
  "Content-Type": "application/json",
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
},
      body: JSON.stringify(jsonPayload),
    });

    const data = await resp.json();
    console.log("🌐 Raw response:", data);

    if (!resp.ok) {
      console.error("❌ Edge function error:", data.error || data);
      alert("Erreur: " + (data.error || "Unknown server error"));
    } else {
      console.log("✅ User created:", data);
    }

    onSave?.();
    onClose?.();
  } catch (err) {
    console.error("❌ Erreur:", err.message);
    alert("❌ Erreur: " + err.message);
  } finally {
    setLoading(false);
  }
};


  const referralLocked = formData.role !== "influencer";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto">
      <div className="
  bg-white rounded-lg shadow-xl
  w-full max-w-lg
  mx-auto
  my-6 sm:my-10
  p-4 sm:p-6
  max-h-[90vh]
  overflow-y-auto
">
        <h2 className="text-xl font-bold mb-4">
          {user ? "Modifier l’utilisateur" : "Créer un utilisateur"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First Name */}
          <input
            type="text"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            placeholder="Prénom"
            className="input"
            required
          />
          {/* Middle Name */}
          <input
            type="text"
            name="middle_name"
            value={formData.middle_name}
            onChange={handleChange}
            placeholder="Deuxième prénom"
            className="input"
          />
          {/* Last Name */}
          <input
            type="text"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            placeholder="Nom"
            className="input"
            required
          />
          {/* Birth Date */}
          <input
            type="date"
            name="birth_date"
            value={formData.birth_date}
            onChange={handleChange}
            className="input"
            required
          />
          {/* Sex */}
          <select
            name="sex"
            value={formData.sex}
            onChange={handleChange}
            className="input"
            required
          >
            <option value="">Sexe</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
          {!parentId && (
          <>
          {/* Email */}
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Email"
            className="input"
            required
            disabled={!!parentId}
          />
          {/* Phone */}
          <label className="label">Téléphone</label>

<div className="w-full">
  <PhoneInput
    international
    defaultCountry={country}
    countryCallingCodeEditable={false}
    value={formData.phone}
    onChange={(value) =>
      setFormData((prev) => ({ ...prev, phone: value || "" }))
    }
    placeholder="Numéro de téléphone"
    disabled={!!parentId}
    className="w-full"
  />
</div>

          {/* Adresse */}
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            placeholder="Adresse"
            className="input"
            required
            disabled={!!parentId}
          />
          </>
          )}
          {/* Signup Type */}
{!parentId && (
  <select
    name="signup_type"
    value={formData.signup_type}
    onChange={handleChange}
    className="input"
  >
        <option value="me">Moi seulement</option>
    <option value="me_student">Moi + élève(s)</option>
    <option value="children_only">Élève(s) seulement</option>
    <option value="teacher_only">Professeur (interne)</option>
    <option value="assistant_only">Assistante (interne)</option>
    <option value="admin_only">Admin (interne)</option>

  </select>
)}

          {/* Role */}
          {!parentId && (
  <select
    name="role"
    value={formData.role}
    onChange={handleChange}
    className="input"
    required
  >
    <option value="student">Élève</option>
    <option value="parent">Parent</option>
    <option value="teacher">Professeur</option>
    <option value="assistant">Assistante</option>
    <option value="admin">Admin</option>
    <option value="influencer">Influenceur</option>
  </select>
)}
          {/* Referral Code */}
          {!parentId && (
          <input
            type="text"
            name="referral_code"
            value={formData.referral_code}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                referral_code: e.target.value,
              }))
            }
            placeholder="Code de parrainage"
            className="input"
            disabled={referralLocked}
          />
          )}
          {/* Status */}
          {!parentId && (
  <select
    name="is_active"            
    className="input"            
    value={formData.is_active ? "true" : "false"}
    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.value === "true"}))}
  >
    <option value="true">Actif</option>
    <option value="false">Inactif</option>
  </select>
)}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 rounded-lg"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-aquaBlue text-white rounded-lg"
            >
              {loading ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
