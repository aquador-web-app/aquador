import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from "../context/AuthContext";
import usePWAHardwareBack from "../hooks/usePWAHardwareBack";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

function InstallButton() {
  const { canInstall, install } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <button
      onClick={install}
      className="mt-4 w-full bg-green-600 text-white py-2 rounded-lg font-semibold"
    >
      📲 Installer l’application
    </button>
  );
}




export default function Login() {
//  usePWAHardwareBack({
//  onExit: () => {
//    // Do nothing or just prevent exit
//    console.log("Back pressed on login");
//  },
//});


  const navigate = useNavigate()   // ✅ REQUIRED
  const { user, loading } = useAuth();   // ✅ REQUIRED
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

usePWAHardwareBack({
  onExit: () => {
    setShowExitModal(true);
  },
});

  

useEffect(() => {
  if (!loading && user) {
    navigate("/dashboard", { replace: true });
  }
}, [user, loading, navigate]);



  useEffect(() => {
    const accs = JSON.parse(localStorage.getItem("savedAccounts") || "[]");
    setSavedAccounts(accs);
  }, []);


// ⬅️ ADD THIS AT THE VERY TOP OF THE COMPONENT BODY

if (loading) {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Chargement…
    </div>
  );
}
  

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
// CASE 1 — SCHOOL REAL user
if (schoolProf && schoolProf.role && schoolProf.role !== "student_placeholder") {
  const role = (schoolProf.role || "").toLowerCase();

  switch (role) {
  case "admin":
  case "assistant":
    navigate("/admin", { replace: true });
    return;

  case "teacher":
    navigate("/teacher", { replace: true });
    return;

  case "influencer":
  case "student":
  default:
    navigate("/user", { replace: true });
    return;
}
}

// CASE 2 — CLUB ONLY user
if (!schoolProf && clubProf) {
  navigate("/user", { replace: true })
  return;
}


// CASE 3 — NO PROFILE ANYWHERE
setErr("Profil introuvable.");

}

  return (
  <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 sm:px-8 bg-gray-50">
    
    {/* Top navigation (responsive) */}
    <div className="w-full max-w-5xl flex justify-between items-center mb-6">
      <Link
        to="/ecole"
        className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm sm:text-base font-semibold shadow hover:bg-orange-600 transition"
      >
        ← Portail École
      </Link>

      <Link
        to="/club"
        className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm sm:text-base font-semibold shadow hover:bg-orange-600 transition"
      >
        Portail Club →
      </Link>
    </div>

    {/* Logo + subtitle */}
    <div className="flex flex-col items-center mb-6">
      <img
        src="/logo/aquador.png"
        alt="A'QUA D'OR Logo"
        className="h-16 w-16 sm:h-20 sm:w-20 mb-2"
      />
      <p className="text-gray-500 text-sm text-center">
        Accéder à votre Dashboard
      </p>
    </div>

    {/* Login card */}
    <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 w-full max-w-md">
      <h1 className="text-xl sm:text-2xl font-bold mb-4 text-center">
        Connexion
      </h1>

      {err && (
        <div className="mb-3 text-red-600 text-sm text-center">
          {err}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        
        {/* Email with dropdown */}
        <div className="relative">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            className="input w-full mt-1"
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
                  className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-sm"
                >
                  {acc.email}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="text-sm font-medium">Mot de passe</label>
          <div className="relative mt-1">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"
              onClick={() => setShow((s) => !s)}
            >
              {show ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button className="btn btn-primary w-full py-2 text-base">
          Se connecter
        </button>
      </form>
<InstallButton />
      {/* Links */}
      <div className="text-center mt-4 text-sm">
        Pas de compte ?{" "}
        <Link to="/signup" className="text-aquaBlue hover:underline">
          Créer un compte
        </Link>
      </div>

      <div className="text-center mt-3">
        <Link
          to="/forgot-password"
          className="text-blue-600 hover:underline text-sm"
        >
          Mot de passe oublié ?
        </Link>
      </div>
    </div>
  </div>
);
}
