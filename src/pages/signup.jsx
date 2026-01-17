import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import SignupDocsModal from "../components/SignupDocsModal";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { detectCountryISO } from "../lib/detectCountry";


// Build referral code (initials + YY)
function buildBaseCode({ first_name, middle_name, last_name, birth_date }) {
  const init = (s) => (s && s.trim().length ? s.trim()[0].toUpperCase() : '')
  const y2 = birth_date ? birth_date.slice(2, 4) : '00';
  return `${init(first_name)}${init(middle_name)}${init(last_name)}${y2}`;
}

export default function Signup() {
  const [sp] = useSearchParams()
  const refPrefill = sp.get('ref') || '' // referral from invite link
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [signedDocs, setSignedDocs] = useState([]); // [{form_name, url}]
  const [err, setErr] = useState('')
  const [country, setCountry] = useState("HT");

useEffect(() => {
  try {
    const c = detectCountryISO();
    setCountry(c || "HT");
  } catch {
    setCountry("HT");
  }
}, []);



  const [form, setForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    sex: 'M',
    birth_date: '',
    phone: '',
    address: '',
    email: '',
    password: '',
    signup_type: 'me',
    medical_note: '',
    first_lesson: 'yes',
    referrer_user_id: null,
    referral_code: '',
    is_active: true,
  })

  const baseCode = useMemo(() => buildBaseCode(form), [form])

  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setErr('')

    if (signedDocs.length < 2) {
      setErr("Veuillez signer les documents requis avant de continuer.");
      return;
    }

    if (form.phone && !isValidPhoneNumber(form.phone)) {
  setErr("Numéro de téléphone invalide.");
  return;
}


    try {
// 1️⃣ Create auth user
const { data: authRes, error: authErr } = await supabase.auth.signUp({
  email: form.email,
  password: form.password,
  options: {
    data: {
      first_name: form.first_name,
      middle_name: form.middle_name,
      last_name: form.last_name,
      sex: form.sex,
      phone: form.phone,
      address: form.address,
      birth_date: form.birth_date,
      medical_note: form.medical_note,
      first_lesson: form.first_lesson,
      signup_type: form.signup_type,
      referrer_code: refPrefill || null,
    },
  },
});

if (authErr) throw authErr;

const uid = authRes.user.id;

const {
  data: { session },
} = await supabase.auth.getSession();

if (!session?.access_token) {
  throw new Error("Session non disponible après création du compte.");
}

      // Step 2: Generate unique referral_code
      let uniqueCode = baseCode.toUpperCase()
      let suffix = 0
      while (true) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('referral_code')
          .eq('referral_code', uniqueCode)
          .maybeSingle()
        if (!existing) break
        suffix++
        uniqueCode = `${baseCode.toUpperCase()}${suffix}`
      }

      console.log('✅ Referral code saved to profile:', uniqueCode)

      // Step 4: Trigger the create-user Edge Function manually
      await fetch(
  `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/create-user`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      user_id: uid,
      email: form.email,
      password: form.password || "Temp1234!",
      first_name: form.first_name,
      middle_name: form.middle_name,
      last_name: form.last_name,
      birth_date: form.birth_date || "",
      sex: form.sex || "",
      phone: form.phone || "",
      address: form.address || "",
      role: "student",
      signup_type: form.signup_type || "me",
      parent_id: null,
      referral_code: uniqueCode, 
      referrer_code: refPrefill || null,
      referrer_user_id: null,
      first_lesson: form.first_lesson || "",
      medical_note: form.medical_note || "",
      is_active: true,
    }),
  }
);


      navigate('/login')
    } catch (err) {
      console.error('Signup error:', err)
      setErr(`Erreur: ${err.message}`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate('/ecole')}
            className="text-blue-600 underline"
          >
            ← Retour à la page d'accueil
          </button>
        </div>

        <div className="text-center mb-6">
          <img src="/logo/aquador.png" alt="Logo A'QUA D'OR" className="mx-auto h-20 mb-3" />
          <h1 className="text-2xl font-bold">Inscription</h1>
        </div>

        {err && <div className="mb-3 text-red-600">{err}</div>}

        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Prénom</label>
            <input
              className="input"
              value={form.first_name}
              onChange={(e) => onChange('first_name', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Deuxième prénom</label>
            <input
              className="input"
              value={form.middle_name}
              onChange={(e) => onChange('middle_name', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Nom</label>
            <input
              className="input"
              value={form.last_name}
              onChange={(e) => onChange('last_name', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Sexe</label>
            <select
              className="select"
              value={form.sex}
              onChange={(e) => onChange('sex', e.target.value)}
              required
            >
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
          <div>
            <label className="label">Date de naissance</label>
            <input
              type="date"
              className="input"
              value={form.birth_date}
              onChange={(e) => onChange('birth_date', e.target.value)}
              required
            />
            <div className="text-xs text-gray-500 mt-1">
              Code de Parrainage automatique: <strong>{baseCode}</strong>
            </div>
          </div>
          <div>
  <label className="label">Téléphone</label>
  <PhoneInput
    international
    defaultCountry={country}
    countryCallingCodeEditable={false}
    value={form.phone}
    onChange={(value) => onChange("phone", value || "")}
    placeholder="Numéro de téléphone"
  />
</div>


          <div className="md:col-span-2">
            <label className="label">Adresse</label>
            <input
              className="input"
              value={form.address}
              onChange={(e) => onChange('address', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => onChange('email', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input"
                value={form.password}
                onChange={(e) => onChange('password', e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-500"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Type d'inscription</label>
            <select
              className="select"
              value={form.signup_type}
              onChange={(e) => onChange('signup_type', e.target.value)}
            >
              <option value="me">Moi seulement</option>
              <option value="me_student">Moi + enfants</option>
              <option value="children_only">Enfants seulement</option>
            </select>
          </div>
          <div>
            <label className="label">Première leçon ?</label>
            <select
              className="select"
              value={form.first_lesson}
              onChange={(e) => onChange('first_lesson', e.target.value)}
            >
              <option value="no">NON</option>
              <option value="yes">OUI</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Maladie à signaler</label>
            <input
              className="input"
              value={form.medical_note}
              onChange={(e) => onChange('medical_note', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Code referral (si invité)</label>
            <input
              className="input"
              value={refPrefill}
              readOnly
              placeholder="Code de parrainage de la référence"
            />
          </div>

          {/* Button area */}
<div className="md:col-span-2">
  <button
    type={signedDocs.length >= 2 ? "submit" : "button"}
    className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg font-semibold shadow hover:bg-orange-600 transition w-full"
    onClick={() => {
      if (signedDocs.length < 2) {
        setErr("");

        // Optional but recommended validation before opening docs
        if (!form.first_name || !form.last_name || !form.birth_date || !form.email) {
          setErr("Veuillez remplir tous les champs requis.");
          return;
        }

        setShowDocsModal(true);
      }
    }}
  >
    {signedDocs.length >= 2
      ? "Créer mon compte"
      : signedDocs.length > 0
        ? "Continuer la signature des documents"
        : "Signer les documents requis"}
  </button>
</div>


        </form>

        {showDocsModal && (
          <SignupDocsModal
            fullName={[form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" ")}
            signupType={form.signup_type}
            onClose={() => setShowDocsModal(false)}
            onDone={(results) => {
              setSignedDocs(results);
              setShowDocsModal(false);
            }}
          />
        )}
      </div>
    </div>
  )
}
