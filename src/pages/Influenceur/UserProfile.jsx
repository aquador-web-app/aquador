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

export default function UserProfile({ userId, onAddChild }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [children, setChildren] = useState([]);
  const [parent, setParent] = useState(null);
  const [tab, setTab] = useState("infos");
  
useEffect(() => {
  const fetchChildren = async () => {
    const { data, error } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, parent_id")
      .eq("parent_id", profile.id);

    if (error) console.error(error);
    else setChildren(data || []);
  };

  if (profile?.id) fetchChildren();
}, [profile]);


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
      setLoading(true);

      // Profile
      const { data: p } = await supabase
        .from("profiles_with_unpaid")
        .select("*")
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

      // Referrals
      const { data: refs } = await supabase
        .from("referrals")
        .select(
          "id, created_at, referred_user_id, referred:referred_user_id(full_name, is_active)"
        )
        .eq("referrer_user_id", userId)
        .order("created_at", { ascending: false });

      // Family
      const { data: kids } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name, birth_date, is_active")
        .eq("parent_id", userId);

      const { data: parentData } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name, email, is_active")
        .eq("id", p?.parent_id)
        .maybeSingle();

      setProfile(p);
      setInvoices(invs || []);
      setEnrollments(ens || []);
      setReferrals(refs || []);
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
    .from("profiles_with_unpaid")
    .update({
      email: profile.email,
      phone: profile.phone,
    })
    .eq("id", profile.id);

  if (error) alert("Erreur lors de la mise à jour du profil");
  else alert("Profil mis à jour avec succès !");
};

  const invoiceItems = (inv) => {
    const items = [];
    for (let i = 1; i <= 7; i++) {
      const desc = inv[`description${i}`];
      const amt = inv[`amount${i}`];
      if (desc && amt != null) items.push(`${desc}: ${formatCurrencyUSD(amt)}`);
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-orange-600 text-white rounded-xl p-6 shadow-lg">
        <div className="flex items-center">
    {/* Left side: avatar + profile info */}
    <div className="flex items-center gap-6">
      <div className="w-20 h-20 rounded-full bg-white text-aquaBlue flex items-center justify-center text-2xl font-bold">
        {profile.first_name?.[0]}
        {profile.last_name?.[0]}
      </div>
      <div>
        <h1 className="text-3xl font-bold">{profile.full_name}</h1>
        <div className="flex gap-2 mt-2">
          <Badge color="blue">{profile.role || "—"}</Badge>
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
  className="ml-auto bg-white text-blue-600 px-4 py-2 rounded-lg shadow hover:bg-gray-100 font-medium"
>
  + Ajouter une personne
</button>
  </div>
</div>

      {/* Tabs */}
      <div className="flex gap-4 border-b mb-4">
        {[
          { id: "infos", label: "Infos" },
          { id: "enrollments", label: "Inscriptions" },
          { id: "invoices", label: "Factures" },
          { id: "referrals", label: "Parrainages" },
          { id: "family", label: "Famille" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-2 px-3 ${
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
  <div className="bg-white p-6 rounded-2xl shadow space-y-6 max-w-lg mx-auto">
    {/* Contact Info */}
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
        Informations personnelles
      </h2>

      {/* Email */}
      <div className="flex items-center justify-between">
        <label className="font-medium text-gray-600 w-32">Email :</label>
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
      <div className="flex items-center justify-between">
        <label className="font-medium text-gray-600 w-32">Téléphone :</label>
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
      <div className="flex items-center justify-between">
        <label className="font-medium text-gray-600 w-32">Adresse :</label>
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

      <div className="flex items-center gap-2">
        <input
          value={referralLink}
          readOnly
          className="flex-1 border border-gray-300 px-3 py-2 rounded-lg text-sm bg-gray-50"
        />
        <button
          onClick={() => navigator.clipboard.writeText(referralLink)}
          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition"
        >
          Copier
        </button>
      </div>
    </div>
  </div>
)}


      {/* Inscriptions */}
{tab === "enrollments" && (
  <div className="space-y-10">
    {/* Parent */}
    <div>
      <h3 className="text-lg font-semibold text-gray-700 mb-3">
        Inscriptions — {profile.full_name}
      </h3>
      <EnrollmentTable profileId={profile.id} />
    </div>

    {/* Children */}
    {children.map((child) => (
      <div key={child.id}>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">
          Inscriptions — {child.full_name}
        </h3>
        <EnrollmentTable profileId={child.id} />
      </div>
    ))}
  </div>
)}



      {/* Invoices */}
      {/* Factures */}
{tab === "invoices" && (
  <div className="space-y-10">
    {/* Parent */}
    <div>
      <h3 className="text-lg font-semibold text-gray-700 mb-3">
        Factures — {profile.full_name}
      </h3>
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
              <td
                colSpan={6}
                className="text-center text-gray-500 py-4 italic"
              >
                Aucune facture
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    {/* Children */}
    {children.map((child) => (
      <div key={child.id}>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">
          Factures — {child.full_name}
        </h3>
        <ChildInvoices childId={child.id} />
      </div>
    ))}
  </div>
)}



      

      {/* Referrals */}
      {tab === "referrals" && (
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