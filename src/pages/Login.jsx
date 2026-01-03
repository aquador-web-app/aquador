import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const accs = JSON.parse(localStorage.getItem("savedAccounts") || "[]");
    setSavedAccounts(accs);
  }, []);
  

  const submit = async (e) => {
    e.preventDefault()
    setErr('')

    const { data: {user}, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErr(error.message)
      return
    }

    const accs = JSON.parse(localStorage.getItem("savedAccounts") || "[]");

// Update or insert
const idx = accs.findIndex((a) => a.email === email);
if (idx >= 0) {
  accs[idx].password = password;
} else {
  accs.push({ email, password });
}

localStorage.setItem("savedAccounts", JSON.stringify(accs));
setSavedAccounts(accs);


    const { data: { session } } = await supabase.auth.getSession()
    console.log("Session:", session)

    // Fetch profile from SCHOOL profile table
const { data: schoolProf, error: schoolErr } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .maybeSingle();

if (schoolErr) {
  setErr("Erreur de récupération du profil: " + schoolErr.message);
  return;
}

// Fetch profile from CLUB profile table
const { data: clubProf, error: clubErr } = await supabase
  .from("club_profiles")
  .select("id")
  .eq("auth_user_id", user.id)
  .maybeSingle();

if (clubErr) {
  setErr("Erreur de récupération du profil Club: " + clubErr.message);
  return;
}

// CASE 1 — SCHOOL REAL user (not auto-created club placeholder)
// CASE 1 — SCHOOL REAL user (not auto-created club placeholder)
if (schoolProf && schoolProf.role && schoolProf.role !== "student_placeholder") {
  const role = (schoolProf.role || "").toLowerCase();

  switch (role) {
    case "admin":
    case "assistant":
      navigate("/admin");
      return;

    case "teacher":
      navigate("/teacher");
      return;

    case "influencer":
    case "student":
      navigate("/user");
      return;

    // ⭐ FIX: fallback ALWAYS sends to /user instead of "/"
    default:
      navigate("/user");
      return;
  }
}


// CASE 2 — CLUB ONLY user
if (!schoolProf && clubProf) {
  console.log("Club-only user → Redirecting to Club Dashboard");
  navigate("/user");
  return;
}

// CASE 3 — NO PROFILE ANYWHERE
setErr("Profil introuvable.");

}

  return (
    <div className="min-h-screen grid place-items-center p-20">
      <Link
            to="/ecole"
            className="absolute left-4 top-11 -translate-y-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold shadow hover:bg-orange-600 transition"
          >
            Retour au portail de l'Ecole
          </Link>
          <Link
            to="/club"
            className="absolute right-4 top-11 -translate-y-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold shadow hover:bg-orange-600 transition"
          >
            Retour au portail du Club
          </Link>
      <div className="flex flex-col items-center py-1">
          {/* Logo */}
          <div className="p-4 border-gray-100 border-b flex flex-col items-center"></div>
          <img
            src="/logo/aquador.png"
            alt="A'QUA D'OR Logo" className="h-20 w-20"></img>            
            <p className="text-gray-500 text-sm">Accéder à votre Dashboard</p>
                    
          </div>
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md w-full">
        <h1 className="text-xl font-bold mb-4">Connexion</h1>
        {err && <div className="mb-3 text-red-600">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
  <label>Email</label>
  <input
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    onFocus={() => setShowDropdown(true)}
    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
    className="input w-full"
  />

  {showDropdown && savedAccounts.length > 0 && (
    <ul className="absolute left-0 right-0 bg-white border rounded shadow z-10 max-h-40 overflow-y-auto">
      {savedAccounts.map((acc) => (
        <li
          key={acc.email}
          onClick={() => {
            setEmail(acc.email);
            setPassword(acc.password);
            setShowDropdown(false);
          }}
          className="px-3 py-2 hover:bg-blue-100 cursor-pointer"
        >
          {acc.email}
        </li>
      ))}
    </ul>
  )}
</div>

<div>
  <label>Password</label>
  <div className="relative">
  <input
    type={show ? 'text' : 'password'}
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    className="input w-full"
  />
  <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-500"
                onClick={() => setShow((s) => !s)}
              >
                {show ? '🙈' : '👁️'}
              </button>
              </div>  
</div>
          <button className="btn btn-primary w-full">Se connecter</button>
        </form>
        <div className="text-center mt-3 text-sm">
          Pas de compte ?{' '}
          <Link to="/signup" className="text-aquaBlue hover:underline">
            Créer un compte
          </Link>
        </div>
        <div className="text-center mt-4">
          <a href="/forgot-password" className="text-blue-600 hover:underline">
            Mot de passe oublié ?
          </a>
        </div>
      </div>
    </div>
  )
}
