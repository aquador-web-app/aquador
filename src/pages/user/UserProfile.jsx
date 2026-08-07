import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  FaUser,
  FaMoneyBillWave,
  FaUsers,
  FaReceipt,
  FaLink,
} from "react-icons/fa";
import {
  formatDateFrSafe,
  formatDateOnly,
  formatMonth,
  formatCurrencyUSD,
} from "../../lib/dateUtils";
import { sanitizeFullName } from "../../lib/sanitizeFullName";
import SignupDocsModal from "../../components/SignupDocsModal";
import { useGlobalAlert } from "../../components/GlobalAlert";



export default function UserProfile({ userId, onAddChild }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [children, setChildren] = useState([]);
  const [parent, setParent] = useState(null);
  const EVENT_CODE = "cloture-2026-08-29";
const EVENT_DATE = "2026-08-29";
const EVENT_NAME =
  "Cérémonie de clôture et remise de certificats";

const [presenceLoading, setPresenceLoading] = useState(false);
const [presenceSaving, setPresenceSaving] = useState(false);
const [presenceConfirmations, setPresenceConfirmations] = useState([]);
const [showAbsenceReason, setShowAbsenceReason] = useState(false);
const [absenceReason, setAbsenceReason] = useState("");
const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [tab, setTab] = useState("infos");
  const [docs, setDocs] = useState([]);
  const { showAlert, showConfirm } = useGlobalAlert();
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showResignModal, setShowResignModal] = useState(false);
  const [showResignIntro, setShowResignIntro] = useState(false);
  const [docChoice, setDocChoice] = useState({
    rules: true,
    accord: true,
    consent: true,
  });
  const initialStep =
  docChoice.rules ? 1 :
  docChoice.accord ? 2 :
  3;

async function handleConfirmEventPresence() {
  if (!profile?.id) return;

  if (!selectedParticipants.length) {
    showAlert?.(
      "Veuillez sélectionner au moins un participant."
    );
    return;
  }

  try {
    setPresenceSaving(true);

    const participantIds = eventParticipants.map((participant) =>
      String(participant.id)
    );

    const selectedIds = selectedParticipants.map(String);

    const now = new Date().toISOString();

    // ✅ Selected students = confirmed
    const rowsToConfirm = selectedIds.map((participantId) => ({
      event_code: EVENT_CODE,
      event_name: EVENT_NAME,
      event_date: EVENT_DATE,
      participant_profile_id: participantId,
      confirmed_by_profile_id: profile.id,
      status: "confirmed",
      confirmed_at: now,
      cancelled_at: null,
    }));

    const { error: confirmError } = await supabase
      .from("event_presence_confirmations")
      .upsert(rowsToConfirm, {
        onConflict: "event_code,participant_profile_id",
      });

    if (confirmError) throw confirmError;

    // Students previously confirmed but now unchecked
    // become cancelled.
    const unselectedIds = participantIds.filter(
      (participantId) => !selectedIds.includes(participantId)
    );

    if (unselectedIds.length) {
      const { error: cancelError } = await supabase
        .from("event_presence_confirmations")
        .update({
          status: "cancelled",
          cancelled_at: now,
        })
        .eq("event_code", EVENT_CODE)
        .eq("confirmed_by_profile_id", profile.id)
        .in("participant_profile_id", unselectedIds);

      if (cancelError) throw cancelError;
    }

    const { data: refreshed, error: refreshError } =
      await supabase
        .from("event_presence_confirmations")
        .select("*")
        .eq("event_code", EVENT_CODE)
        .in("participant_profile_id", participantIds);

    if (refreshError) throw refreshError;

    setPresenceConfirmations(refreshed || []);

    setSelectedParticipants(
      (refreshed || [])
        .filter((row) => row.status === "confirmed")
        .map((row) => String(row.participant_profile_id))
    );

    showAlert?.(
      "Votre présence pour le 29 août 2026 a été confirmée."
    );
  } catch (error) {
    console.error("Presence confirmation error:", error);

    showAlert?.(
      error?.message ||
        "Une erreur est survenue lors de la confirmation."
    );
  } finally {
    setPresenceSaving(false);
  }
}

async function handleDeclineEventPresence() {
  if (!profile?.id) return;

  const reason = absenceReason.trim();

  if (!reason) {
    showAlert?.(
      "Veuillez indiquer la raison de votre absence."
    );
    return;
  }

  if (!eventParticipants.length) {
    showAlert?.(
      "Aucun participant n’est disponible sur ce compte."
    );
    return;
  }

  try {
    setPresenceSaving(true);

    const now = new Date().toISOString();

    const rowsToCancel = eventParticipants.map((participant) => ({
      event_code: EVENT_CODE,
      event_name: EVENT_NAME,
      event_date: EVENT_DATE,
      participant_profile_id: String(participant.id),
      confirmed_by_profile_id: profile.id,
      status: "cancelled",
      confirmed_at: null,
      cancelled_at: now,
      cancellation_reason: reason,
    }));

    const { error: cancelError } = await supabase
      .from("event_presence_confirmations")
      .upsert(rowsToCancel, {
        onConflict: "event_code,participant_profile_id",
      });

    if (cancelError) throw cancelError;

    const participantIds = eventParticipants.map((participant) =>
      String(participant.id)
    );

    const { data: refreshed, error: refreshError } =
      await supabase
        .from("event_presence_confirmations")
        .select("*")
        .eq("event_code", EVENT_CODE)
        .in("participant_profile_id", participantIds);

    if (refreshError) throw refreshError;

    setPresenceConfirmations(refreshed || []);
    setSelectedParticipants([]);

    setShowAbsenceReason(false);
    setAbsenceReason("");

    showAlert?.(
      "Votre absence pour le 29 août 2026 a été enregistrée."
    );
  } catch (error) {
    console.error("Presence decline error:", error);

    showAlert?.(
      error?.message ||
        "Une erreur est survenue lors de l’enregistrement de votre absence."
    );
  } finally {
    setPresenceSaving(false);
  }
}
  
useEffect(() => {
  const fetchChildren = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, birth_date, is_active, parent_id")
      .eq("parent_id", profile.id);

    if (error) console.error(error);
    else setChildren(data || []);
  };

  if (profile?.id) fetchChildren();
}, [profile]);

useEffect(() => {
  if (!profile?.full_name) return;

  (async () => {
    try {
      setLoadingDocs(true);
      // match where you actually store them
      const folder = sanitizeFullName(profile.full_name);
      const { data, error } = await supabase.storage.from("signed_docs").list(folder, { limit: 100 });

      if (error) throw error;

      const files = (data || [])
        .filter((f) => !f.name.endsWith("/"))
        .map((f) => {
          const { data: pub } = supabase.storage
            .from("signed_docs")
            .getPublicUrl(`${folder}/${f.name}`);
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
  if (!profile?.id) return;

  const fetchPresenceConfirmations = async () => {
    setPresenceLoading(true);

    try {
      const participantIds = [
        profile.id,
        ...children.map((child) => child.id),
      ].filter(Boolean);

      if (!participantIds.length) {
        setPresenceConfirmations([]);
        setSelectedParticipants([]);
        return;
      }

      const { data, error } = await supabase
        .from("event_presence_confirmations")
        .select(
          `
            id,
            event_code,
            event_name,
            event_date,
            participant_profile_id,
            confirmed_by_profile_id,
            status,
            confirmed_at,
            cancelled_at
          `
        )
        .eq("event_code", EVENT_CODE)
        .in("participant_profile_id", participantIds);

      if (error) throw error;

      const rows = data || [];

      setPresenceConfirmations(rows);

      setSelectedParticipants(
        rows
          .filter((row) => row.status === "confirmed")
          .map((row) => String(row.participant_profile_id))
      );
    } catch (error) {
      console.error(
        "Presence confirmations loading error:",
        error
      );

      showAlert?.(
  error?.message ||
    "Impossible de charger les confirmations de présence."
);
    } finally {
      setPresenceLoading(false);
    }
  };

  fetchPresenceConfirmations();
}, [profile?.id, children]);



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

  useEffect(() => {
    (async () => {
      console.log("🌀 UserProfile useEffect started for userId:", userId);

      setLoading(true);

      // Profile
      const { data: p } = await supabase
        .from("profiles_with_unpaid")
        .select("*, signup_type")
        .eq("id", userId)
        .maybeSingle();

      // Invoices
      const { data: invs } = await supabase
        .from("invoices")
        .select(
          "id, invoice_no, month, issued_at, due_date, total, paid_total, status, pdf_url, description1, amount1, description2, amount2, description3, amount3, description4, amount4, description5, amount5, description6, amount6, description7, amount7"
        )
        .eq("user_id", p.id)
        .order("due_date", { ascending: false });

      // Enrollments
      const { data: ens, error } = await supabase
  .from("enrollments")
  .select(`
    id,
        status,
        start_date,
        enrolled_at,
        profile_id,
        session_id,
        course_id,
        plan_id,
        override_price,
        type,
        profiles:profile_id ( full_name ),
        courses:course_id ( name ),
        plans:plan_id ( id, name, price, duration_hours ),
        sessions:session_id ( id, day_of_week, start_time )
  `)
  .eq("profile_id", p.id)   // or "user_id", depending on your table schema
  .order("start_date", { ascending: false });

if (error) {
  console.error("Error loading enrollments", error);
}
setEnrollments(ens || []);

// 🔍 Referrals — Two-step fetch (accurate is_active)
try {
  console.log("🔍 Fetching referrals for userId:", userId);
  if (!userId) {
    console.warn("⚠️ No userId provided, skipping referral fetch.");
  } else {
    const { data: refs, error: refErr } = await supabase
      .from("referrals")
      .select("id, created_at, referrer_user_id, referred_user_id")
      .eq("referrer_user_id", userId)
      .order("created_at", { ascending: false });

    if (refErr) throw refErr;

    if (refs && refs.length > 0) {
      const referredIds = refs.map(r => r.referred_user_id).filter(Boolean);
      console.log("👥 Referred IDs:", referredIds);

      const { data: referredProfiles, error: profErr } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name, is_active")
        .in("id", referredIds);

      if (profErr) throw profErr;

      const joined = refs.map(r => ({
        id: r.id,
        created_at: r.created_at,
        referred_user_id: r.referred_user_id,
        referred:
          referredProfiles?.find(p => p.id === r.referred_user_id) || null,
      }));

      setReferrals(joined);

      console.table(
        joined.map(r => ({
          referred: r.referred?.full_name,
          active: r.referred?.is_active,
        }))
      );
      console.log("✅ Referrals fetched:", joined.length, "rows");
    } else {
      console.log("ℹ️ No referrals found for this user");
    }
  }
} catch (err) {
  console.error("❌ Unexpected error in referral fetch:", err);
}


      // Family
      const { data: kids } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name, birth_date, is_active")
        .eq("parent_id", userId);

      let parentData = null;

      if (p?.parent_id) {
        console.log("ℹ️ No parent_id — user is a primary profile");
        const { data } = await supabase
          .from("profiles_with_unpaid")
          .select("id, full_name, email, is_active")
          .eq("id", p.parent_id)
          .maybeSingle();

        parentData = data;
      }

      setProfile(p);
      setInvoices(
        (invs || []).filter(
          inv => Number(inv.total) > 0 || Number(inv.paid_total) > 0
        )
      );
      setEnrollments(ens || []);
      setChildren(kids || []);
      setParent(parentData);
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <div className="p-6">Chargement…</div>;
  if (!profile) return <div className="p-6 text-red-600">Profil introuvable.</div>;

  const referralLink = profile?.referral_code
    ? `${window.location.origin}/signup?ref=${profile.referral_code}`
    : "—";

    const handleSaveProfile = async () => {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      email: profile.email,
      phone: profile.phone,
    })
    .eq("id", profile.id);

  if (error) alert("Erreur lors de la mise à jour du profil");
  else alert("Profil mis à jour avec succès !");
};

  // Hide negative/zero items and strip trailing " — Month YYYY" if it was injected
const stripMonthSuffix = (s) =>
  s?.replace(/\s+—\s+[A-Za-zÀ-ÿ]+\s+\d{4}$/, "") ?? s;

const invoiceItems = (inv) => {
  const items = [];
  for (let i = 1; i <= 7; i++) {
    const desc = inv[`description${i}`];
    const amt = Number(inv[`amount${i}`]);
    if (desc && amt > 0) {
      items.push(`${stripMonthSuffix(desc)}: ${formatCurrencyUSD(amt)}`);
    }
  }
  return items;
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

  function addHoursToTimeStr(timeStr, hoursToAdd) {
  if (!timeStr) return "";
  const [h, m] = String(timeStr).split(":").map((x) => parseInt(x, 10));
  const base = new Date(2000, 0, 1, h || 0, m || 0, 0);
  base.setHours(base.getHours() + (Number(hoursToAdd) || 0));
  const hh = String(base.getHours()).padStart(2, "0");
  const mm = String(base.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function togglePresenceParticipant(participantId) {
  const id = String(participantId);

  setSelectedParticipants((current) =>
    current.includes(id)
      ? current.filter((currentId) => currentId !== id)
      : [...current, id]
  );
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

  const dayLabel = (d) => {
    if (d == null) return "—";
    const days = [
      "Dimanche",
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      
    ];
    const index = (d - 1 + 7) % 7;
  return days[index];
  };

  const signingParticipants = [
  {
    id: profile.id,
    full_name: profile.full_name,
    birth_date: profile.birth_date,
    role: "responsable",
  },
  ...children.map((c) => ({
    id: c.id,
    full_name: c.full_name,
    birth_date: c.birth_date,
    role: "dependant",
  })),
];

const childrenNames = children.map((c) => c.full_name);

const eventParticipants = [
  ...(profile?.signup_type !== "children_only"
    ? [
        {
          id: profile.id,
          full_name: profile.full_name,
          is_active: profile.is_active,
        },
      ]
    : []),

  ...children.map((child) => ({
    id: child.id,
    full_name: child.full_name,
    is_active: child.is_active,
  })),
].filter((participant) => participant.id && participant.is_active);


  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-orange-600 text-white rounded-xl p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
    {/* Left side: avatar + profile info */}
    <div className="flex items-center gap-6">
      <div className="hidden sm:flex w-20 h-20 rounded-full bg-white text-aquaBlue items-center justify-center text-2xl font-bold">
        {profile.first_name?.[0]}
        {profile.last_name?.[0]}
      </div>
      <div>
        <h1 className="text-3xl font-bold">{profile.full_name}</h1>
        <div className="flex gap-2 mt-2">
  {/* Role Badge */}
  {profile.signup_type === "children_only" && !profile.parent_id ? (
    <>
      <Badge color="blue">Parent</Badge>
    </>
  ) : (
    <>
      {profile.role && (
        <Badge color="blue">{profile.role}</Badge>
      )}
    </>
  )}

  {/* Status */}
  <Badge color={profile.is_active ? "green" : "red"}>
    {profile.is_active ? "Actif" : "Inactif"}
  </Badge>

  {/* Relationship */}
  {profile.parent_id ? (
    <Badge color="purple">Dépendant</Badge>
  ) : (
    <Badge color="gray">Titulaire</Badge>
  )}
</div>

        <p className="mt-2 text-sm opacity-90">
              E-mail  :  {profile.email || "—"} 
            </p>
            <p className="mt-2 text-sm opacity-90">
              Téléphone : {profile.phone || "—"} 
            </p>
            <p className="mt-2 text-sm opacity-90">
              Adresse : {profile.address || "—"}
            </p><p className="mt-2 text-sm opacity-90">
              Anniversaire : {formatDateOnly(profile.birth_date)}
            </p>
         </div> 
      </div>
         
          
      {/* Right side: Add Person button */}
    <button
  onClick={() => onAddChild && onAddChild()}
  className="self-start sm:ml-auto bg-white text-blue-600 px-4 py-2 rounded-lg shadow hover:bg-gray-100 font-medium"
>
  + Ajouter une personne
</button>
  </div>
</div>

{/* Confirmation de présence — Clôture du 29 août */}
<div className="bg-white rounded-2xl shadow border border-orange-100 overflow-hidden">
  <div className="bg-gradient-to-r from-orange-500 to-blue-700 px-5 py-4 text-white">
    <h2 className="text-lg font-bold">
      Cérémonie de clôture — 29 août 2026
    </h2>

    <p className="text-sm text-white/90 mt-1">
      Remise de certificats et mini-compétition à partir
      de 9 h 00.
    </p>
  </div>

  <div className="p-5 space-y-4">
    <p className="text-sm text-gray-700">
      Tous les élèves ayant participé aux activités
      d’A’QUA D’OR entre septembre 2025 et août 2026 sont
      invités à confirmer leur présence.
    </p>

    {presenceLoading ? (
      <p className="text-sm text-gray-500">
        Chargement des confirmations…
      </p>
    ) : eventParticipants.length === 0 ? (
      <p className="text-sm text-gray-500 italic">
        Aucun participant actif trouvé sur ce compte.
      </p>
    ) : (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">
          Sélectionnez les personnes qui seront présentes :
        </p>

        {eventParticipants.map((participant) => {
          const participantId = String(participant.id);

          return (
            <label
              key={participant.id}
              className="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selectedParticipants.includes(
                  participantId
                )}
                onChange={() =>
                  togglePresenceParticipant(participantId)
                }
                className="w-5 h-5 rounded text-blue-600"
              />

              <span className="font-medium text-gray-800">
                {participant.full_name}
              </span>
            </label>
          );
        })}
      </div>
    )}

    <div className="flex flex-col sm:flex-row gap-3">
  <button
    type="button"
    onClick={handleConfirmEventPresence}
    disabled={
      presenceLoading ||
      presenceSaving ||
      eventParticipants.length === 0 ||
      selectedParticipants.length === 0
    }
    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed"
  >
    {presenceSaving
      ? "Enregistrement…"
      : "Je confirme ma présence"}
  </button>

  <button
  type="button"
  onClick={() => setShowAbsenceReason(true)}
  disabled={
    presenceLoading ||
    presenceSaving ||
    eventParticipants.length === 0
  }
  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed"
>
  Je ne serai pas présent
</button>
{showAbsenceReason && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
      <h3 className="text-lg font-bold text-gray-800">
        Motif de votre absence
      </h3>

      <p className="text-sm text-gray-600 mt-2">
        Veuillez nous indiquer brièvement pourquoi vous ne pourrez
        pas être présent le 29 août 2026.
      </p>

      <textarea
        value={absenceReason}
        onChange={(e) => setAbsenceReason(e.target.value)}
        rows={4}
        placeholder="Expliquez brièvement la raison de votre absence…"
        className="w-full mt-4 border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
      />

      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={() => {
            setShowAbsenceReason(false);
            setAbsenceReason("");
          }}
          disabled={presenceSaving}
          className="flex-1 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          Retour
        </button>

        <button
          type="button"
          onClick={handleDeclineEventPresence}
          disabled={
            presenceSaving ||
            !absenceReason.trim()
          }
          className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-60"
        >
          {presenceSaving
            ? "Enregistrement…"
            : "Confirmer mon absence"}
        </button>
      </div>
    </div>
  </div>
)}
</div>

    {presenceConfirmations.some(
  (row) => row.status === "confirmed"
) ? (
  <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
    ✓ Votre confirmation a bien été enregistrée. Vous pouvez
    modifier votre réponse si nécessaire.
  </div>
) : presenceConfirmations.length > 0 &&
  presenceConfirmations.every(
    (row) => row.status === "cancelled"
  ) ? (
  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
    Votre absence pour le 29 août 2026 a bien été enregistrée.
    Vous pouvez toujours modifier votre réponse avant l’événement.
  </div>
) : null}
  </div>
</div>

      {/* Tabs */}
      <div className="flex gap-2 sm:gap-4 border-b mb-4 overflow-x-auto whitespace-nowrap">
        {[
          { id: "infos", label: "Infos" },
          { id: "enrollments", label: "Inscriptions" },
          { id: "invoices", label: "Factures" },
          { id: "referrals", label: "Parrainages" },
          { id: "family", label: "Famille" },
          { id: "documents", label: "Documents" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-2 px-3 shrink-0 ${
              tab === t.id
                ? "border-b-2 border-blue-600 text-blue-600 font-semibold"
                : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Infos */}
{tab === "infos" && (
  <div className="bg-white p-4 sm:p-6 rounded-2xl shadow space-y-6 w-full sm:max-w-lg mx-auto">
    {/* Contact Info */}
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
        Informations personnelles
      </h2>

      {/* Email */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <label className="font-medium text-gray-600 w-full sm:w-32">Email :</label>
        <input
          type="email"
          value={profile.email || ""}
          onChange={(e) =>
            setProfile((prev) => ({ ...prev, email: e.target.value }))
          }
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Téléphone */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <label className="font-medium text-gray-600 w-full sm:w-32">Téléphone :</label>
        <input
          type="tel"
          value={profile.phone || ""}
          onChange={(e) =>
            setProfile((prev) => ({ ...prev, phone: e.target.value }))
          }
          placeholder="—"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {/* Adresse */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <label className="font-medium text-gray-600 w-full sm:w-32">Adresse :</label>
        <input
          type="address"
          value={profile.address || ""}
          onChange={(e) =>
            setProfile((prev) => ({ ...prev, address: e.target.value }))
          }
          placeholder="—"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveProfile} // <— create this function to update Supabase
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
        >
          Enregistrer
        </button>
      </div>
    </div>

    {/* Referral Section */}
    <div className="space-y-3 border-t pt-4">
      <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
        Parrainage
      </h2>

      <div className="flex justify-between items-center">
        <p className="font-medium text-gray-600 w-32">Code :</p>
        <span className="text-gray-800 font-semibold">
          {profile.referral_code || "—"}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={referralLink}
          readOnly
          className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm bg-gray-50 break-all"
        />

        <button
          onClick={() => navigator.clipboard.writeText(referralLink)}
          className="self-center sm:self-auto px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition"
        >
          Copier
        </button>
      </div>
    </div>
  </div>
)}


      {tab === "enrollments" && (
  <div className="space-y-10">
    {/* Parent (only if not children_only) */}
    {profile.signup_type !== "children_only" && (
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">
          Inscriptions — {profile.full_name}
        </h3>
        <EnrollmentTable profileId={profile.id} />
      </div>
    )}

    {/* Children */}
    {children.map((child) => (
      <div key={child.id}>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">
          Inscriptions — {child.full_name}
        </h3>
        <EnrollmentTable profileId={child.id} />
      </div>
    ))}

    {/* No data */}
    {profile.signup_type === "children_only" && children.length === 0 && (
      <p className="text-center text-gray-500 italic">Aucune inscription</p>
    )}
  </div>
)}

     
      {/* Factures */}
{tab === "invoices" && (
  <div className="space-y-10">
    {/* Parent (only if not children_only) */}
    {profile.signup_type !== "children_only" && (
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">
          Factures — {profile.full_name}
        </h3>
       <div className="overflow-x-auto">
        <table className="min-w-full text-sm bg-white shadow rounded">
          <colgroup>
            <col className="w-[140px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[160px]" />
            <col className="w-[300px]" />
          </colgroup>

          <thead className="bg-aquaBlue text-white">
            <tr>
              <th className="px-4 py-2 text-left whitespace-nowrap">No</th>
              <th className="px-4 py-2 text-left whitespace-nowrap">Mois</th>
              <th className="px-4 py-2 text-left whitespace-nowrap">Total</th>
              <th className="px-4 py-2 text-left whitespace-nowrap">Payé</th>
              <th className="px-4 py-2 text-left whitespace-nowrap">Échéance</th>
              <th className="px-4 py-2 text-left whitespace-nowrap">Description</th>
            </tr>
          </thead>

          <tbody>
            {invoices.map((inv, index) => (
              <tr
                key={inv.id || index}
                className="border-t hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-2 font-medium text-gray-700">
                  #{inv.invoice_no || "—"}
                </td>
                <td className="px-4 py-2">{formatMonth(inv.month)}</td>
                <td className="px-4 py-2">{formatCurrencyUSD(inv.total)}</td>
                <td className="px-4 py-2">{formatCurrencyUSD(inv.paid_total)}</td>
                <td className="px-4 py-2">{formatDateOnly(inv.due_date)}</td>
                <td className="px-4 py-2 text-gray-600">
                  <ul className="list-disc list-inside space-y-0.5">
                    {invoiceItems(inv).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}

            {!invoices.length && (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-4 italic">
                  Aucune facture
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    )}

    {/* Children */}
    {children.map((child) => (
      <div key={child.id}>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">
          Factures — {child.full_name}
        </h3>
        <ChildInvoices childId={child.id} />
      </div>
    ))}

    {/* No data */}
    {profile.signup_type === "children_only" && children.length === 0 && (
      <p className="text-center text-gray-500 italic">Aucune facture</p>
    )}
  </div>
)}

      

      {/* Referrals */}
      {tab === "referrals" && (
       <div className="overflow-x-auto">
        <table className="min-w-full text-sm bg-white shadow rounded">
          <thead className="bg-gray-50">
            <tr>
              <th>Date</th>
              <th>Référé</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={r.id} className="border-t">
                <td>{formatDateFrSafe(r.created_at)}</td>
                <td>{r.referred?.full_name || "—"}</td>
                <td>{r.referred?.is_active ? "Actif" : "Inactif"}</td>
              </tr>
            ))}
            {!referrals.length && (
              <tr>
                <td colSpan={3} className="text-center text-gray-500">
                  Aucun parrainage
                </td>
              </tr>
            )}
          </tbody>
        </table>
       </div>
      )}

        {/* Family */}
        {tab === "family" && (
          <div className="bg-white p-4 rounded shadow space-y-3">
            {parent && (
              <p>
                <strong>Parent:</strong> {parent.full_name} ({parent.email})
              </p>
            )}
            {children.map((c) => (
              <p key={c.id}>
                <strong>Enfant:</strong> {c.full_name}
{" - "}
{c.birth_date
  ? formatDateFrSafe(c.birth_date)  // or "en-US"
  : "Date inconnue"}
{" - "}
{c.is_active ? "Actif" : "Inactif"}
              </p>
            ))}
            {!parent && !children.length && (
              <p className="text-gray-500">Aucune relation familiale</p>
            )}
          </div>
        )}
        {tab === "documents" && (
  <div className="bg-white p-4 sm:p-6 rounded-2xl shadow w-full sm:max-w-lg mx-auto space-y-6">
    
    {/* Signed docs */}
    <div>
      <h3 className="font-semibold mb-3">Documents signés</h3>

      {loadingDocs ? (
        <p className="text-gray-600 text-sm">Chargement des documents…</p>
      ) : docs.length ? (
        <ul className="divide-y">
          {docs.map((doc, idx) => (
            <li
              key={idx}
              className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-3"
            >
              <span className="text-gray-800 text-sm break-all">
                {doc.name}
              </span>
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline text-sm w-fit"
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

    {/* Re-sign section */}
    <div className="border-t pt-4">
      <h4 className="font-semibold text-gray-700 mb-2">
        Signer de nouveau les documents
      </h4>

      <p className="text-sm text-gray-600 mb-3">
        Utilisez cette option si vous souhaitez modifier ou refaire la signature
        des documents (ex. ajout d’un enfant, changement de consentement).
      </p>

      <button
  onClick={() => setShowResignIntro(true)}
  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
>
  Signer les documents requis
</button>
      {showResignIntro && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
      
      <div className="flex items-start gap-3">
        <div className="text-yellow-500 text-xl">⚠️</div>
        <div>
          <h3 className="font-semibold text-gray-800">
            Nouvelle signature de documents
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            En signant de nouveau :
            <br /><b>• Vous devez rajouter toutes les personnes déjà inscrites en ajoutant la/les nouvelle(s).</b>
            <br /><b>• Toutes les signatures et documents précédents seront remplacés.</b>
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">
          Quels documents souhaitez-vous signer ?
        </p>

        {[
          { key: "rules", label: "Règlements" },
          { key: "accord", label: "Accord du participant" },
          { key: "consent", label: "Formulaire de consentement" },
        ].map((d) => (
          <label
            key={d.key}
            className="flex items-center gap-3 text-sm text-gray-700"
          >
            <input
              type="checkbox"
              checked={docChoice[d.key]}
              onChange={(e) =>
                setDocChoice((prev) => ({
                  ...prev,
                  [d.key]: e.target.checked,
                }))
              }
              className="w-4 h-4 text-blue-600 rounded"
            />
            {d.label}
          </label>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setShowResignIntro(false)}
          className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          Annuler
        </button>

        <button
          onClick={() => {
            if (!Object.values(docChoice).some(Boolean)) {
              alert("Veuillez sélectionner au moins un document.");
              return;
            }
            setShowResignIntro(false);
            setShowResignModal(true);
          }}
          className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
        >
          Continuer
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  </div>
)}
  {showResignModal && (
  <SignupDocsModal
    fullName={profile.full_name}
    childrenNames={childrenNames} 
    signupType={profile.signup_type || "me"}
    enabledDocs={docChoice}
    initialStep={initialStep}
    onClose={() => setShowResignModal(false)}
    onDone={() => {
      setShowResignModal(false);
      setTimeout(() => setProfile({ ...profile }), 300);
    }}
  />
)}
  
    </div>
  );
}

function ChildInvoices({ childId }) {
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    const fetchChildInvoices = async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", childId)
        .order("due_date", { ascending: false });
      if (error) console.error("Child invoices load error", error);
      else setInvoices(data || []);
    };
    fetchChildInvoices();
  }, [childId]);

  const invoiceItems = (inv) => {
  const items = [];
  for (let i = 1; i <= 7; i++) {
    const desc = inv[`description${i}`];
    const amt = Number(inv[`amount${i}`] || 0);
    // ✅ Only keep items with amount > 0
    if (desc && amt > 0) {
      items.push(`${desc}: ${formatCurrencyUSD(amt)}`);
    }
  }
  return items;
};


  if (!invoices.length)
    return <p className="text-sm text-gray-500 italic">Aucune facture</p>;

  return (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm bg-white shadow rounded">
      <thead className="bg-aquaBlue text-white">
        <tr>
          <th className="px-4 py-2 text-left whitespace-nowrap">No</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Mois</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Total</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Payé</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Échéance</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Description</th>
        </tr>
      </thead>

      <tbody>
        {invoices.map((inv, index) => (
          <tr key={inv.id || index} className="border-t hover:bg-gray-50 transition-colors">
            <td className="px-4 py-2 font-medium text-gray-700">#{inv.invoice_no || "—"}</td>
            <td className="px-4 py-2">{formatMonth(inv.month)}</td>
            <td className="px-4 py-2">{formatCurrencyUSD(inv.total)}</td>
            <td className="px-4 py-2">{formatCurrencyUSD(inv.paid_total)}</td>
            <td className="px-4 py-2">{formatDateOnly(inv.due_date)}</td>
            <td className="px-4 py-2 text-gray-600">
              <ul className="list-disc list-inside space-y-0.5">
                {invoiceItems(inv).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  );
}



function EnrollmentTable({ profileId }) {
  const [enrollments, setEnrollments] = useState([]);

  useEffect(() => {
    const fetchEnrollments = async () => {
      const { data, error } = await supabase
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
        .eq("profile_id", profileId)
        .order("start_date", { ascending: false });

      if (error) console.error("Enrollments load error", error);
      else setEnrollments(data || []);
    };
    fetchEnrollments();
  }, [profileId]);

  const addHoursToTimeStr = (timeStr, hoursToAdd) => {
    if (!timeStr) return "";
    const [h, m] = String(timeStr).split(":").map((x) => parseInt(x, 10));
    const base = new Date(2000, 0, 1, h || 0, m || 0, 0);
    base.setHours(base.getHours() + (Number(hoursToAdd) || 0));
    const hh = String(base.getHours()).padStart(2, "0");
    const mm = String(base.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const timeRangeWithFallback = (start_time, end_time, duration_hours) => {
    const toHM = (s) => (s || "").slice(0, 5);
    if (start_time && end_time) return `${toHM(start_time)}–${toHM(end_time)}`;
    if (start_time) {
      const end = addHoursToTimeStr(start_time, duration_hours || 1);
      return `${toHM(start_time)}–${end}`;
    }
    return "—";
  };

  const dayLabel = (d) => {
    if (d == null) return "—";
    const days = [
      "Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"
    ];
    const index = (d - 1 + 7) % 7;
    return days[index];
  };

  if (!enrollments.length)
    return <p className="text-sm text-gray-500 italic">Aucune inscription</p>;

  return (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm bg-white shadow rounded">
      <thead className="bg-aquaBlue text-white">
        <tr>
          <th className="px-4 py-2 text-left whitespace-nowrap">Cour(s)</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Jour</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Heure</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Durée</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Plan</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Début</th>
          <th className="px-4 py-2 text-left whitespace-nowrap">Statut</th>
        </tr>
      </thead>

      <tbody>
        {enrollments.map((e, index) => {
          const dur = e.plans?.duration_hours || 1;
          const range = timeRangeWithFallback(
            e.sessions?.start_time,
            e.sessions?.end_time,
            dur
          );

          return (
            <tr key={e.id || index} className="border-t hover:bg-gray-50 transition-colors">
              <td className="px-4 py-2 font-medium text-gray-700">{e.courses?.name ?? "—"}</td>
              <td className="px-4 py-2">{e.sessions?.day_of_week ? dayLabel(e.sessions.day_of_week) : "—"}</td>
              <td className="px-4 py-2">{range}</td>
              <td className="px-4 py-2">{dur}h</td>
              <td className="px-4 py-2 text-gray-700">{e.plans?.name || "—"}</td>
              <td className="px-4 py-2">{formatDateFrSafe(e.start_date)}</td>
              <td className="px-4 py-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  e.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                }`}>
                  {e.status}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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