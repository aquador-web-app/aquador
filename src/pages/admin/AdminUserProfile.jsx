// src/pages/admin/AdminUserProfile.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { FaUser, FaMoneyBillWave, FaUsers, FaReceipt, FaArrowLeft, FaLink } from "react-icons/fa";
import { formatDateOnly, formatMonth, formatTimestamp, formatCurrencyUSD } from "../../lib/dateUtils";
import { FaDollarSign } from "react-icons/fa";

// ---------- helpers ----------
const fmtMoney = (n) => (n == null || isNaN(Number(n)) ? 0 : Number(n)).toFixed(2);

function formatDateFrSafe(d) {
  if (!d) return "—";
  const [y, m, day] = String(d).split("-");
  return `${day.padStart(2, "0")} ${new Date(`${y}-${m}-01`).toLocaleString("fr-FR", { month: "long" })} ${y}`;
}

function dayFromDateString(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  const js = new Date(Number(y), Number(m) - 1, Number(day)); // local date, no timezone drift
  return ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"][js.getDay()];
}

function calcAgeFromDOB(dob) {
  if (!dob) return null;

  // Expect "YYYY-MM-DD" (or anything Date can parse)
  const s = String(dob).slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;

  // Use local date (no timezone drift)
  const birth = new Date(y, m - 1, d);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());

  if (!hasHadBirthdayThisYear) age -= 1;
  return age >= 0 ? age : null;
}


const Badge = ({ children, color }) => {
  const colors = {
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    gray: "bg-gray-100 text-gray-700",
    blue: "bg-blue-100 text-blue-700",
    yellow: "bg-yellow-100 text-yellow-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

function Card({ icon, label, value, color }) {
  return (
    <div className="p-4 bg-white rounded-2xl shadow flex items-center gap-4">
      <div className="text-2xl text-blue-600">{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className={`text-xl font-bold ${color || ""}`}>{value}</p>
      </div>
    </div>
  );
}

// Robust day-of-week labeler: supports DB values 1..7 (1=Dimanche) and JS 0..6 (0=Dimanche)
function dayLabelRobust(dow) {
  if (dow == null) return "—";
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const n = Number(dow);
  if (!Number.isFinite(n)) return "—";
  if (n >= 0 && n <= 6) return days[n];
  if (n >= 1 && n <= 7) return days[(n - 1 + 7) % 7];
  return "—";
}

function addHoursToTimeStr(timeStr, hoursToAdd) {
  if (!timeStr) return "";
  const [h, m] = String(timeStr).split(":").map((x) => parseInt(x, 10));
  const base = new Date(2000, 0, 1, h || 0, m || 0, 0);
  base.setHours(base.getHours() + (Number(hoursToAdd) || 0));
  const hh = String(base.getHours()).padStart(2, "0");
  const mm = String(base.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function timeRangeWithFallback(start_time, end_time, duration_hours) {
  const toHM = (s) => (s || "").slice(0, 5);
  if (start_time && end_time) return `${toHM(start_time)}–${toHM(end_time)}`;
  if (start_time) {
    const end = addHoursToTimeStr(start_time, duration_hours || 1);
    return `${toHM(start_time)}–${end}`;
  }
  return "—";
}

function invoiceItems(inv) {
  const items = [
    { slot: 1, d: inv.description1, a: inv.amount1 },
    { slot: 2, d: inv.description2, a: inv.amount2 },
    { slot: 3, d: inv.description3, a: inv.amount3 },
    { slot: 4, d: inv.description4, a: inv.amount4 },
    { slot: 5, d: inv.description5, a: inv.amount5 },
    { slot: 6, d: inv.description6, a: inv.amount6 },
    { slot: 7, d: inv.description7, a: inv.amount7 },
  ];

  return items.filter(({ d, a }) => (String(d || "").trim().length > 0) && Number(a) > 0);
}


function mergedInvoiceItems(inv, invoiceItemsById) {
  const slotItems = invoiceItems(inv).map((it) => ({
    source: "slot",
    slot: it.slot,          // ✅ real slot now
    description: it.d,
    amount: it.a,
    reverted: false,
    paid: false,
  }));

  const dbItems = (invoiceItemsById[inv.id] || []).map((it) => ({
    source: "db",
    id: it.id,
    description: it.description,
    amount: it.amount,
    reverted: !!it.reverted,
    paid: !!it.paid,
  }));

  return [...slotItems, ...dbItems];
}



function getPdfLink(inv) {
  if (!inv?.pdf_url) return null;
  if (inv.pdf_url.startsWith("http")) return inv.pdf_url;
  // storage path case: assume public bucket "invoices"
  try {
    return supabase.storage.from("invoices").getPublicUrl(inv.pdf_url).data.publicUrl;
  } catch {
    return inv.pdf_url; // fallback
  }
}

// ---------- component ----------
export default function AdminUserProfile({ profileId: propId, onBack, onAddChild }) {
  const { id: paramId } = useParams();
  const profileId = propId || paramId; // ✅ single definition
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [profile, setProfile] = useState(null);
  const [parent, setParent] = useState(null);
  const [children, setChildren] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceItemsById, setInvoiceItemsById] = useState({});
  const [expandingInvoice, setExpandingInvoice] = useState({});
  const [referrals, setReferrals] = useState([]);
  const [referrer, setReferrer] = useState(null);
  const [credit, setCredit] = useState(0);
  const [tab, setTab] = useState("infos");
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [addingCredit, setAddingCredit] = useState(false);
  const visibleInvoices = useMemo(() => {
  return (invoices || []).filter((inv) => {
    const total = Number(inv.total || 0);
    const paid = Number(inv.paid_total || 0);

    // keep real money invoices
    if (total > 0 || paid > 0) return true;

    // keep if at least one line item has value
    for (let i = 1; i <= 7; i++) {
      if (Number(inv[`amount${i}`] || 0) > 0) {
        return true;
      }
    }

    // ❌ dummy invoice
    return false;
  });
}, [invoices]);




  const [role, setRole] = useState(null);

useEffect(() => {
  async function fetchRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (data) setRole(data.role);
  }
  fetchRole();
}, []);

  // === Load signed documents from bucket ===
useEffect(() => {
  if (!profile?.full_name) return;
  (async () => {
    try {
      setLoadingDocs(true);
      const folder = `${profile.full_name.replace(/\s+/g, "_")}`;
      const { data, error } = await supabase.storage.from("signed_docs").list(folder, { limit: 100 });
      if (error) throw error;

      const files = (data || [])
        .filter((f) => !f.name.endsWith("/"))
        .map((f) => {
          const { data: pub } = supabase.storage.from("signed_docs").getPublicUrl(`${folder}/${f.name}`);
          return { name: f.name, url: pub?.publicUrl };
        });

      setDocs(files);
    } catch (err) {
      console.error("Erreur lors du chargement des documents :", err);
      setDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  })();
}, [profile?.full_name]);



  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");

      const { data: p, error: pe } = await supabase
        .from("profiles_with_unpaid")
        .select("*")
        .eq("id", profileId)
        .maybeSingle();

        

      if (pe || !p) {
        setErr(pe?.message || "Profil introuvable.");
        setLoading(false);
        return;
      }

      const [parentRes, childrenRes] = await Promise.all([
        p.parent_id
          ? supabase
              .from("profiles_with_unpaid")
              .select("id, full_name, role, phone, email, is_active")
              .eq("id", p.parent_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("profiles_with_unpaid")
          .select("id, full_name, role, phone, email, is_active")
          .eq("parent_id", p.id),
      ]);

      const { data: ens, error: ensErr } = await supabase
  .from("enrollments")
  .select(`
    id,
        status,
        start_date,
        enrolled_at,
        profile_id,
        session_id,
        session_group,
        course_id,
        plan_id,
        override_price,
        type,
        profiles:profile_id ( full_name ),
        courses:course_id ( name ),
        plans:plan_id ( id, name, price, duration_hours ),
        sessions:session_id ( id, day_of_week, start_time )
  `)
  .eq("profile_id", p.id)
  .order("start_date", { ascending: false });

if (ensErr) console.error("Enrollments load error", ensErr);

console.log("Profile ID", p.id);
console.log("Enrollments fetched", ens, ensErr);


      const { data: invs } = await supabase
        .from("invoices")
        .select(
          `id, invoice_no, month, issued_at, due_date, total, paid_total, status, pdf_url, full_name,
           description1, amount1,
           description2, amount2,
           description3, amount3,
           description4, amount4,
           description5, amount5,
           description6, amount6,
           description7, amount7`
        )
        .eq("user_id", p.id)
        .order("due_date", { ascending: false });

      const { data: refs } = await supabase
        .from("referrals")
        .select(
          `id, created_at, referrer_user_id, referred_user_id,
           referred:referred_user_id(full_name, id, is_active)`
        )
        .eq("referrer_user_id", p.id)
        .order("created_at", { ascending: false });

                // 🔗 Who referred THIS user?
        const { data: refRow } = await supabase
          .from("referrals")
          .select(`
            id,
            created_at,
            referrer:referrer_user_id (
              full_name,
              referral_code,
              is_active
            )
          `)
          .eq("referred_user_id", p.id)
          .maybeSingle();

      if (!alive) return;
      setProfile(p);
      setParent(parentRes?.data || null);
      setChildren(childrenRes?.data || []);
      setEnrollments(ens || []);
      setInvoices(invs || []);
      setReferrals(refs || []);
      setReferrer(refRow?.referrer || null);
      // === Load credit balance ===
      const { data: creditRow } = await supabase
        .from("credits")
        .select("amount")
        .eq("user_id", p.id)
        .maybeSingle();

      setCredit(creditRow?.amount || 0);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [profileId]);

  const reloadInvoices = async () => {
  if (!profile?.id) return;

  const { data: invs } = await supabase
    .from("invoices")
    .select(`
      id, invoice_no, month, issued_at, due_date, total, paid_total, status, pdf_url, full_name,
      description1, amount1,
      description2, amount2,
      description3, amount3,
      description4, amount4,
      description5, amount5,
      description6, amount6,
      description7, amount7
    `)
    .eq("user_id", profile.id)
    .order("due_date", { ascending: false });

  setInvoices(invs || []);
};

const toggleExpandInvoice = async (invoiceId) => {
  setExpandingInvoice((prev) => ({ ...prev, [invoiceId]: !prev[invoiceId] }));

  // already loaded
  if (invoiceItemsById[invoiceId]) return;

  const { data, error } = await supabase
    .from("invoice_items")
    .select("id, description, amount, paid, reverted, type, created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  if (!error) {
    setInvoiceItemsById((prev) => ({ ...prev, [invoiceId]: data || [] }));
  }
};


  const balance = useMemo(() => {
  const t = invoices.reduce((a, inv) => a + Number(inv.total || 0), 0);
  const p = invoices.reduce((a, inv) => a + Number(inv.paid_total || 0), 0);
  return t - p - credit; // subtract credit
}, [invoices, credit]);


  const referralLink = useMemo(() => {
    const code = profile?.referral_code;
    return code ? `${window.location.origin}/signup?ref=${code}` : "—";
  }, [profile]);

  // quick actions
  const updateRole = async (role) => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles_with_unpaid").update({ role }).eq("id", profile.id);
    setSaving(false);
    if (error) return alert("Erreur mise à jour du rôle: " + error.message);
    setProfile((p) => ({ ...p, role }));
  };

  const updateSignupType = async (signup_type) => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles_with_unpaid").update({ signup_type }).eq("id", profile.id);
    setSaving(false);
    if (error) return alert("Erreur mise à jour du type d'inscription: " + error.message);
    setProfile((p) => ({ ...p, signup_type }));
  };

  const toggleActive = async () => {
    if (!profile) return;
    const newVal = !profile.is_active;
    setSaving(true);
    const { error } = await supabase.from("profiles_with_unpaid").update({ is_active: newVal }).eq("id", profile.id);
    setSaving(false);
    if (error) return alert("Erreur mise à jour du statut: " + error.message);
    setProfile((p) => ({ ...p, is_active: newVal }));
  };

  const copyReferral = async () => {
    if (!profile?.referral_code) return;
    await navigator.clipboard.writeText(referralLink);
    alert("Lien copié !");
  };

  if (loading) return <div className="p-6">Chargement…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!profile) return null;

  const dob =
  profile.date_of_birth ||
  profile.dob ||
  profile.birth_date ||
  profile.birthday ||
  null;

const age = calcAgeFromDOB(dob);

  return (
      <div className="p-4 md:p-6 space-y-6 max-w-full overflow-x-hidden">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
        >
          <FaArrowLeft /> Retour à la liste des utilisateurs
        </button>

        {/* Header */}
<div className="bg-gradient-to-r from-blue-600 to-orange-600 text-white rounded-xl p-6 shadow-lg">
  <div className="flex flex-col sm:flex-row sm:items-center gap-4">

    {/* Left: avatar + info */}
    <div className="flex items-center gap-6">
      <div className="hidden sm:flex w-20 h-20 rounded-full bg-white text-aquaBlue items-center justify-center text-2xl font-bold">
        {profile.first_name?.[0]}
        {profile.last_name?.[0]}
      </div>

      <div>
        <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
  <span>
    {profile.full_name}
    {age != null ? `, ${age}` : ""}
  </span>
  {profile.has_unpaid && <FaDollarSign className="text-yellow-300" />}
</h1>

        <div className="flex gap-2 mt-2 flex-wrap">
          <Badge color="blue">{profile.role}</Badge>
          <Badge color={profile.is_active ? "green" : "red"}>
            {profile.is_active ? "Actif" : "Inactif"}
          </Badge>
          {profile.parent_id ? (
            <Badge color="purple">Dépendant</Badge>
          ) : (
            <Badge color="gray">Titulaire</Badge>
          )}
        </div>

        <p className="mt-2 text-sm opacity-90">
          Date de naissance : {dob ? formatDateOnly(dob) : "—"}
        </p>
        <p className="text-sm opacity-90">
          E-mail : {profile.email || "—"}
        </p>
        <p className="text-sm opacity-90">
          Téléphone : {profile.phone || "—"}
        </p>
        <p className="text-sm opacity-90">
          Adresse : {profile.address || "—"}
        </p>
      </div>
    </div>

    {/* Right: actions (EXACT SAME IDEA AS UserProfile) */}
    <div className="self-start sm:ml-auto flex flex-col gap-2 w-full sm:w-auto">
      <button
        onClick={() => setShowAddCredit(true)}
        className="bg-green-600 text-white px-4 py-2 rounded-lg shadow font-medium"
      >
        ➕ Ajouter du crédit
      </button>

      {!profile.parent_id && (
        <button
          onClick={() => onAddChild?.(profile.id)}
          className="bg-white text-blue-600 px-4 py-2 rounded-lg shadow font-medium"
        >
          + Ajouter une personne
        </button>
      )}
    </div>

  </div>
</div>        
           

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card
          icon={<FaMoneyBillWave />}
          label="Solde"
          value={`${formatCurrencyUSD(balance)}`}
          color={balance > 0 ? "text-red-600" : "text-green-600"}
        />
        <Card icon={<FaReceipt />} label="Factures" value={invoices.length} />
        <Card icon={<FaUsers />} label="Inscriptions" value={enrollments.length} />
        <Card icon={<FaUser />} label="Parrainages" value={referrals.length} />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-3 border-b mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide">
          {["infos", "enrollments", "invoices", "referrals", "family", "documents"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 px-3 ${
                tab === t
                  ? "border-b-2 border-blue-600 text-blue-600 font-semibold"
                  : "text-gray-500"
              }`}
            >
              {t === "infos"
                ? "Infos"
                : t === "enrollments"
                ? "Inscriptions"
                : t === "invoices"
                ? "Factures"
                : t === "referrals"
                ? "Parrainages"
                : t === "family"
                ? "Famille"
                : "Documents d'inscription"}
            </button>
          ))}
        </div>
<div className="max-w-md mx-auto lg:max-w-none">
        {/* Infos */}
        {tab === "infos" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow space-y-3 lg:col-span-2">
              <h3 className="font-semibold mb-2">Informations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Email" value={profile.email || "—"} />
                <Field label="Téléphone" value={profile.phone || "—"} />
                <Field label="Adresse" value={profile.address || "—"} />
                <Field label="Type d'inscription" value={profile.signup_type || "—"} />
                <Field label="Code parrainage" value={profile.referral_code || "—"} />
                <Field
  label="Referré par"
  value={
    referrer ? (
      <button
        className="text-blue-600 underline"
        onClick={() => {
          onBack?.();
          window.dispatchEvent(
            new CustomEvent("openUserProfile", {
              detail: { id: referrer.id },
            })
          );
        }}
      >
        {referrer.full_name} - {referrer.referral_code} - {referrer.is_active ? "Actif(ve)" : "Inactif(ve)"}
      </button>
    ) : "—"
  }
/>

                <div className="md:col-span-1">
                  <label className="block text-sm text-gray-500 mb-1">Lien de parrainage</label>
                  <div className="flex items-center gap-2">
                    <div className="text-sm break-all bg-gray-50 rounded px-2 py-2 border flex-1">
                      {referralLink}
                    </div>
                    {profile.referral_code && (
                      <button
                        onClick={copyReferral}
                        className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
                        title="Copier le lien"
                      >
                        <FaLink />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick actions – hidden for assistants */}
{role !== "assistant" && (
  <div className="bg-white p-4 rounded-2xl shadow space-y-3">
    <h3 className="font-semibold mb-2">Actions</h3>
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-600">Rôle</span>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={profile.role || "student"}
          onChange={(e) => updateRole(e.target.value)}
          disabled={saving}
        >
          <option value="student">Élève</option>
          <option value="teacher">Professeur</option>
          <option value="assistant">Assistante</option>
          <option value="influencer">Influenceur</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-600">Type d'inscription</span>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={profile.signup_type || "me"}
          onChange={(e) => updateSignupType(e.target.value)}
          disabled={saving}
        >
          <option value="me">Moi seulement</option>
          <option value="me_student">Moi + enfants</option>
          <option value="children_only">Enfants seulement</option>
          <option value="child">Enfant</option>
        </select>
      </div>

      <button
        onClick={toggleActive}
        className={`w-full px-3 py-2 rounded text-white ${
          profile.is_active ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
        }`}
        disabled={saving}
      >
        {profile.is_active ? "Désactiver" : "Activer"}
      </button>
    </div>
  </div>
)}

          </div>
        )}

        {/* Inscriptions */}
        {tab === "enrollments" && (
          <div className="bg-white rounded-2xl shadow -mx-4 sm:mx-0">
            <div className="p-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-gray-600">
                  <Th>Cour(s)</Th>
                  <Th>Jour</Th>
                  <Th>Heure</Th>
                  <Th>Durée</Th>
                  <Th>Plan</Th>
                  <Th>Début</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => {
                  const dur = e.plans?.duration_hours || 1;
                  const range = timeRangeWithFallback(
                    e.sessions?.start_time,
                    e.sessions?.end_time,
                    dur
                  );
                  return (
                    <tr key={e.id} className="border-b hover:bg-gray-50">
                      <Td>{e.courses?.name ?? "—"}</Td>
                      <Td>{dayFromDateString(e.start_date)}</Td>
                      <Td>{range}</Td>
                      <Td>{dur}h</Td>
                      <Td>{e.plans?.name || "—"}</Td>
                      <Td>{formatDateFrSafe(e.start_date)}</Td>
                      <Td>
                        <Badge color={e.status === "active" ? "green" : "gray"}>{e.status}</Badge>
                      </Td>
                    </tr>
                  );
                })}

                {!enrollments.length && (
                  <tr>
                    <Td colSpan={7} className="text-gray-600">
                      Aucune inscription
                    </Td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Factures */}
        {tab === "invoices" && (
          <div className="bg-white p-4 rounded-2xl shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-gray-600">
                  <Th>No</Th>
                  <Th>Mois</Th>
                  <Th>Description</Th>
                  <Th right>Total</Th>
                  <Th right>Payé</Th>
                  <Th right>Solde</Th>
                  <Th>Statut</Th>
                  <Th>Échéance</Th>
                  <Th>PDF</Th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((inv) => {
                  const items = invoiceItems(inv);
                  const bal = Number(inv.total || 0) - Number(inv.paid_total || 0);
                  const pdf = getPdfLink(inv);
                  return (
                    <tr key={inv.id} className="border-b hover:bg-gray-50 align-top">
                      <Td>#{inv.invoice_no || "—"}</Td>
                      <Td>
                        {formatMonth(inv.month)}
                      </Td>
                      <Td className="min-w-[260px]">
  {mergedInvoiceItems(inv, invoiceItemsById).filter((it) => !it.reverted).length ? (
    <ul className="space-y-2">
      {mergedInvoiceItems(inv, invoiceItemsById)
        .filter((it) => !it.reverted)
        .map((it, i) => (
          <li
            key={it.id || `${it.source}-${it.slot}-${i}`}
            className="flex justify-between gap-2 items-start"
          >
            <div className="flex-1">
              <div className="text-gray-700">
                {it.description} {it.paid ? "✅" : ""}
              </div>

              {/* ACTIONS — ADMIN ONLY */}
              {role !== "assistant" && it.source === "slot" && (
                <div className="flex gap-3 text-xs mt-1">
                  <button
                    onClick={async () => {
                      if (inv.status === "paid") {
                        alert("Cannot edit/revert a paid invoice");
                        return;
                      }
                      if (!confirm(`Revert "${it.description}" ?`)) return;

                      const { error } = await supabase.rpc("revert_invoice_slot", {
                        p_invoice_id: inv.id,
                        p_slot: it.slot,
                        p_description: it.description,
                        p_amount: it.amount,
                      });

                      if (error) return alert(error.message);

                      // refresh invoice list + close cache for this invoice items
                      await reloadInvoices();
                    }}
                    className="text-red-600 underline"
                  >
                    Revert
                  </button>

                  <button
                    onClick={async () => {
                      if (inv.status === "paid") {
                        alert("Cannot edit a paid invoice");
                        return;
                      }

                      const v = prompt(`New amount for "${it.description}"`, String(it.amount));
                      if (v === null) return;

                      const newAmount = Number(v);
                      if (Number.isNaN(newAmount) || newAmount < 0) {
                        alert("Invalid amount");
                        return;
                      }

                      const { error } = await supabase.rpc("edit_invoice_slot", {
                        p_invoice_id: inv.id,
                        p_slot: it.slot,
                        p_new_amount: newAmount,
                      });

                      if (error) return alert(error.message);

                      await reloadInvoices();
                    }}
                    className="text-blue-600 underline"
                  >
                    Edit
                  </button>
                </div>
              )}

              {role !== "assistant" && it.source === "db" && (
                <div className="flex gap-3 text-xs mt-1">
                  <button
                    onClick={async () => {
                      if (inv.status === "paid") {
                        alert("Cannot edit/revert a paid invoice");
                        return;
                      }
                      if (!confirm("Revert this invoice item?")) return;

                      const { error } = await supabase.rpc("revert_invoice_item", {
                        p_item_id: it.id,
                      });

                      if (error) return alert(error.message);

                      // refresh invoice_items for this invoice + invoice totals
                      const { data } = await supabase
                        .from("invoice_items")
                        .select("id, description, amount, paid, reverted, type, created_at")
                        .eq("invoice_id", inv.id)
                        .order("created_at", { ascending: true });

                      setInvoiceItemsById((prev) => ({ ...prev, [inv.id]: data || [] }));
                      await reloadInvoices();
                    }}
                    className="text-red-600 underline"
                  >
                    Revert
                  </button>
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="font-medium">{formatCurrencyUSD(it.amount)}</div>
            </div>
          </li>
        ))}
    </ul>
  ) : (
    <span className="text-gray-400">—</span>
  )}

  {/* Show/Hide items button */}
  <div className="mt-2">
    <button
      onClick={() => toggleExpandInvoice(inv.id)}
      className="text-blue-600 underline text-xs"
    >
      {expandingInvoice[inv.id] ? "Hide items" : "Show items"}
    </button>
  </div>
</Td>

                      <Td right>{formatCurrencyUSD(inv.total)}</Td>
                      <Td right className={`${inv.paid_total > 0 ? "text-green-600" : ""}`}>
                        {inv.paid_total > 0 ? `${formatCurrencyUSD(inv.paid_total)}` : "—"}
                      </Td>
                      <Td right className={`${bal > 0 ? "text-red-600" : "text-green-600"}`}>
                        {bal > 0 ? `${formatCurrencyUSD(bal)}` : "Payée"}
                      </Td>
                      <Td>
                        <Badge
                          color={
                            inv.status === "paid"
                              ? "green"
                              : inv.status === "partial"
                              ? "yellow"
                              : "gray"
                          }
                        >
                          {inv.status}
                        </Badge>
                      </Td>
                      <Td>{formatDateOnly(inv.due_date)}</Td>
                      <Td>
                        {pdf ? (
                          <a
                            href={`${pdf}?v=${Date.now()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline"
                          >
                            PDF
                          </a>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  );
                })}
                {!visibleInvoices.length && (
                  <tr>
                    <Td colSpan={9} className="text-gray-600">
                      Aucune facture
                    </Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Parrainages */}
        {tab === "referrals" && (
          <div className="bg-white p-4 rounded-2xl shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-gray-600">
                  <Th>Date</Th>
                  <Th>Référé</Th>
                  <Th>Statut</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <Td>{formatDateOnly(r.created_at)}</Td>
                    <Td>{r.referred?.full_name || "—"}</Td>
                    <Td>
                      <Badge color={r.referred?.is_active ? "green" : "gray"}>
                        {r.referred?.is_active ? "Actif" : "Inactif"}
                      </Badge>
                    </Td>
                    <Td>
                      {r.referred?.id ? (
                        <button
                          className="text-blue-600 underline"
                          onClick={() => navigate(`/admin/user-profile/${r.referred.id}`)}
                        >
                          Ouvrir
                        </button>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                ))}
                {!referrals.length && (
                  <tr>
                    <Td colSpan={4} className="text-gray-600">
                      Aucun parrainage
                    </Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Famille */}
        {tab === "family" && (
  <>
    {/* If profile has a parent_id → show only Parent */}
    {profile.parent_id ? (
      <div className="bg-white p-4 rounded-2xl shadow">
        <h3 className="font-semibold mb-2">Parent</h3>
        {parent ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{parent.full_name}</div>
              <div className="text-sm text-gray-600">{parent.email}</div>
              <div className="text-sm text-gray-600">{parent.phone}</div>
            </div>
            <button
  className="text-blue-600 underline"
  onClick={() => {
    onBack?.();
    window.dispatchEvent(
      new CustomEvent("openUserProfile", { detail: { id: parent.id } })
    );
  }}
>
  Ouvrir
</button>

          </div>
        ) : (
          <div className="text-gray-600 text-sm">—</div>
        )}
      </div>
    ) : (
      /* Otherwise (main profile) show only Enfants */
      <div className="bg-white p-4 rounded-2xl shadow">
        <h3 className="font-semibold mb-2">Enfants</h3>
        {children.length ? (
          <ul className="space-y-1">
            {children.map((c) => (
              <li key={c.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.full_name}</div>
                </div>
                <button
  className="text-blue-600 underline"
  onClick={() => {
    onBack?.();
    window.dispatchEvent(
      new CustomEvent("openUserProfile", { detail: { id: c.id } })
    );
  }}
>
  Ouvrir
</button>

              </li>
            ))}
          </ul>
        ) : (
          <div className="text-gray-600 text-sm">—</div>
        )}
      </div>
    )}
  </>
)}
{/* Documents d'inscription */}
{tab === "documents" && (
  <div className="bg-white p-4 rounded-2xl shadow">
    <h3 className="font-semibold mb-3">Documents signés</h3>

    {loadingDocs ? (
      <p className="text-gray-600 text-sm">Chargement des documents…</p>
    ) : docs.length ? (
      <ul className="divide-y">
        {docs.map((doc, idx) => (
          <li key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-2">
            <span className="text-gray-800">{doc.name}</span>
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline"
            >
              Ouvrir
            </a>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-gray-500 text-sm">Aucun document signé trouvé.</p>
    )}
  </div>
)}
{showAddCredit && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-sm mx-4">
      <h2 className="text-lg font-semibold mb-4">Ajouter du crédit</h2>

      <label className="block text-sm text-gray-600 mb-1">
        Montant en USD
      </label>
      <input
        type="number"
        min="1"
        className="w-full border px-3 py-2 rounded mb-4"
        placeholder="Ex: 25"
        value={creditAmount}
        onChange={(e) => setCreditAmount(e.target.value)}
      />

      <div className="flex gap-2 mt-4">
        <button
          onClick={async () => {
            if (!creditAmount || Number(creditAmount) <= 0) {
              alert("Montant invalide");
              return;
            }

            setAddingCredit(true);

            const { error } = await supabase.rpc("add_credit_with_name", {
              p_user_id: profile.id,
              p_amount: Number(creditAmount),
            });

            setAddingCredit(false);

            if (error) {
              alert("Erreur : " + error.message);
              return;
            }

            alert("Crédit ajouté !");
            setShowAddCredit(false);
            setCreditAmount("");
          }}
          className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700"
          disabled={addingCredit}
        >
          {addingCredit ? "Ajout..." : "Ajouter"}
        </button>

        <button
          onClick={() => setShowAddCredit(false)}
          className="flex-1 bg-gray-200 py-2 rounded hover:bg-gray-300"
        >
          Annuler
        </button>
      </div>
    </div>
  </div>
)}

      </div>
    </div>
    </div>
  );
  
}

function Th({ children, right }) {
  return (
    <th className={`px-3 py-2 text-left border-b ${right ? "text-right" : ""}`}>{children}</th>
  );
}
function Td({ children, right, className = "", ...rest }) {
  return (
    <td className={`px-3 py-2 align-top border-b ${right ? "text-right" : ""} ${className}`} {...rest}>
      {children}
    </td>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <label className="block text-sm text-gray-500 mb-1">{label}</label>
      <div className="text-sm bg-gray-50 rounded px-2 py-2 border">{value}</div>
    </div>
  );
}
