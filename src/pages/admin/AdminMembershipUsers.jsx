// src/pages/admin/AdminMembershipUsers.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";
import AdminClubUserProfile from "./AdminClubUserProfile";
import { FaUsers, FaSearch, FaSync } from "react-icons/fa";

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

export default function AdminMembershipUsers() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [role, setRole] = useState(null);


  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [membershipFilter, setMembershipFilter] = useState("all");

  // Fetch club profiles + families
  async function loadProfiles() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("club_profiles")
        .select(
          `
          id,
          auth_user_id,
          main_full_name,
          email,
          phone,
          address,
          membership_type,
          plan_code,
          total_monthly_fee_usd,
          is_couple,
          has_swim_school_kids,
          status,
          created_at,
          activated_at,
          docs_approved,
          qr_code_url,
          membership_card_url,
          id_file_url,
          rules_pdf_url,
          accord_pdf_url,
          club_profile_families (
            id,
            full_name,
            relation,
            birth_date,
            phone,
            id_file_url,
            monthly_fee_usd
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading club_profiles:", error);
        setProfiles([]);
        return;
      }

      setProfiles(data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
  async function loadRole() {
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch the user's role from profiles table (or wherever your roles are)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    setRole(profile?.role || "user");
  }

  loadRole();
}, []);


  useEffect(() => {
    loadProfiles();
  }, []);

  async function handleDelete(profile) {
  if (
    !window.confirm(
      `⚠️ SUPPRESSION DÉFINITIVE ⚠️
      
Toutes les données seront supprimées:
- Membre principal
- Famille
- Documents signés
- Pièces d'identité
- QR Code
- Carte de membre
- Invoices (club)
- Révocation d'accès

Confirmer la suppression de : ${profile.main_full_name} ?`
    )
  ) return;

  try {
    setLoading(true);

    const profileId = profile.id;
    const authId = profile.auth_user_id;

   // 1️⃣ Fetch family IDs BEFORE deleting anything
const { data: famRows } = await supabase
  .from("club_profile_families")
  .select("id")
  .eq("club_profile_id", profileId);

// 2️⃣ Delete club invoices for the MAIN member
await supabase
  .from("club_invoices")
  .delete()
  .eq("customer_id", profileId);

// 2.5️⃣ Delete club invoices for FAMILY members
if (famRows && famRows.length > 0) {
  const familyIds = famRows.map(f => f.id);
  await supabase
    .from("club_invoices")
    .delete()
    .in("membership_id", familyIds);
}

// 3️⃣ Delete family rows AFTER deleting invoices
await supabase
  .from("club_profile_families")
  .delete()
  .eq("club_profile_id", profileId);

// 4️⃣ Delete storage files
async function deleteFile(url) {
  if (!url) return;
  try {
    const raw = url.split("/object/public/")[1];
    const bucket = raw.split("/")[0];
    const filePath = raw.replace(bucket + "/", "");
    await supabase.storage.from(bucket).remove([filePath]);
  } catch (e) {
    console.warn("Cannot delete file:", url, e);
  }
}

await deleteFile(profile.id_file_url);
await deleteFile(profile.rules_pdf_url);
await deleteFile(profile.accord_pdf_url);
await deleteFile(profile.qr_code_url);
await deleteFile(profile.membership_card_url);

// Delete family ID files
if (profile.club_profile_families?.length) {
  for (const f of profile.club_profile_families) {
    await deleteFile(f.id_file_url);
  }
}

// 5️⃣ Nullify URLs before deleting profile
await supabase
  .from("club_profiles")
  .update({
    id_file_url: null,
    rules_pdf_url: null,
    accord_pdf_url: null,
    qr_code_url: null,
    membership_card_url: null,
  })
  .eq("id", profileId);

// 6️⃣ Delete the profile
await supabase.from("club_profiles").delete().eq("id", profileId);

// 7️⃣ Revoke access
await fetch(
  `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/admin-revoke-user`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth_user_id: authId }),
  }
);


    //
    // 6️⃣ Reload list
    //
    await loadProfiles();
    alert("Membre supprimé avec succès.");
  } catch (e) {
    console.error(e);
    alert("Erreur lors de la suppression.");
  } finally {
    setLoading(false);
  }
}

  // Filtering
  const filteredProfiles = profiles
    .filter((p) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        (p.main_full_name || "").toLowerCase().includes(term) ||
        (p.email || "").toLowerCase().includes(term) ||
        (p.phone || "").toLowerCase().includes(term)
      );
    })
    .filter((p) => {
  if (role === "assistant") {
    return p.status === "active";  // assistants only see active
  }
  return statusFilter === "all" ? true : (p.status || "pending") === statusFilter;
})

    .filter((p) =>
      planFilter === "all"
        ? true
        : (p.plan_code || "").toLowerCase() === planFilter.toLowerCase()
    )
    .filter((p) =>
      membershipFilter === "all"
        ? true
        : (p.membership_type || "").toLowerCase() ===
          membershipFilter.toLowerCase()
    );

  // ========= RENDER LIST vs PROFILE =========
  if (selectedProfile) {
    return (
      <AdminClubUserProfile
        profileId={selectedProfile.id}
        onBack={() => setSelectedProfile(null)}
      />
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FaUsers /> Membres du Club A&apos;QUA D&apos;OR
        </h1>

        <div className="flex items-center gap-2">
          <div className="relative">
            <FaSearch className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-sm border rounded-lg w-48"
              placeholder="Rechercher (nom, email, téléphone)…"
            />
          </div>
{role !== "assistant" && (
  <>
          <select
            className="border rounded-lg px-2 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="active">Actifs</option>
            <option value="rejected">Rejetés</option>
          </select>

          <select
            className="border rounded-lg px-2 py-1.5 text-sm"
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
          >
            <option value="all">Tous les plans</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="platinum">Platinum</option>
          </select>

          <select
            className="border rounded-lg px-2 py-1.5 text-sm"
            value={membershipFilter}
            onChange={(e) => setMembershipFilter(e.target.value)}
          >
            <option value="all">Tous types</option>
            <option value="solo">Solo</option>
            <option value="couple">Couple</option>
            <option value="family">Famille</option>
          </select>
          </>
)}
          <button
            onClick={loadProfiles}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            <FaSync className={loading ? "animate-spin" : ""} />
            Rafraîchir
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-aquaBlue text-white">
            <tr>
              <Th>Nom</Th>
              <Th>Contact</Th>
              <Th>Plan / Type</Th>
              <Th>Montant</Th>
              <Th>Statut</Th>
              <Th>Créé le</Th>
              <Th>Activé le</Th>
              {role !== "assistant" && <Th>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {filteredProfiles.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center text-gray-500 py-6 text-sm"
                >
                  {loading
                    ? "Chargement..."
                    : "Aucun membre trouvé pour ces filtres."}
                </td>
              </tr>
            )}

            {filteredProfiles.map((row) => {
              const families = row.club_profile_families || [];
              return (
                <FragmentedRow
                  key={row.id}
                  row={row}
                  role={role} 
                  families={families}
                  onClick={() => setSelectedProfile(row)}
                  onDelete={handleDelete} 
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function Th({ children }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({ children, colSpan }) {
  return (
    <td className="px-3 py-2 align-top text-sm" colSpan={colSpan}>
      {children}
    </td>
  );
}

// Row + sub-row for families
function FragmentedRow({ row, families, onClick, onDelete, role }) {
  const statusColor =
    STATUS_COLORS[row.status] || "bg-gray-100 text-gray-800";
  const statusLabel =
    STATUS_LABELS[row.status] || row.status || "—";


  return (
    <>
      {/* Main row (clickable) */}
      <tr
  className={`border-t hover:bg-blue-50 ${role !== "assistant" ? "cursor-pointer" : "cursor-default"}`}
  onClick={() => {
    if (role !== "assistant") {
      onClick();   // open profile only for admin
    }
  }}
>
        <Td>
          <div className="font-semibold">{row.main_full_name}</div>
          <div className="text-xs text-gray-500">
            {(row.membership_type || "—").toUpperCase()} •{" "}
            {(row.plan_code || "—").toUpperCase()}
          </div>
        </Td>

        <Td>
          <div>{row.email || "—"}</div>
          <div className="text-xs text-gray-500">{row.phone || "—"}</div>
          <div className="text-xs text-gray-400 truncate max-w-xs">
            {row.address || ""}
          </div>
        </Td>

        <Td>
          <div className="text-xs">
            Plan: {(row.plan_code || "—").toUpperCase()}
          </div>
          <div className="text-xs text-gray-500">
            Couple: {row.is_couple ? "Oui" : "Non"}
          </div>
          <div className="text-xs text-gray-500">
            Enfants école natation:{" "}
            {row.has_swim_school_kids ? "Oui" : "Non"}
          </div>
        </Td>

        <Td>
          {row.total_monthly_fee_usd != null
            ? `${formatCurrencyUSD(row.total_monthly_fee_usd)}`
            : "—"}
        </Td>

        <Td>
          <span
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}
          >
            {statusLabel}
          </span>
          {row.docs_approved && (
            <div className="text-[10px] text-emerald-700 mt-1">
              Docs approuvés
            </div>
          )}
        </Td>

        <Td>
          {row.created_at ? formatDateFrSafe(row.created_at) : "—"}
        </Td>

        <Td>
          {row.activated_at ? formatDateFrSafe(row.activated_at) : "—"}
        </Td>
  {role !== "assistant" && (
        <Td>
  <div className="flex flex-col gap-1">
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(); // open profile
      }}
      className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
    >
      Modifier
    </button>

    <button
      onClick={(e) => {
        e.stopPropagation();
        onDelete(row);
      }}
      className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
    >
      Supprimer
    </button>
  </div>
</Td>
  )}

      </tr>

      {/* Families sub-row */}
      {families.length > 0 && (
        <tr className="border-t bg-gray-50">
          <Td colSpan={8}>
            <div className="text-xs text-gray-600 mb-1 font-semibold">
              Famille :
            </div>
            <div className="flex flex-wrap gap-2">
              {families.map((f) => (
                <div
                  key={f.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border text-xs"
                >
                  <span className="font-semibold">
                    {f.full_name}
                  </span>
                  <span className="text-gray-500">
                    ({f.relation || "—"})
                  </span>
                </div>
              ))}
            </div>
          </Td>
        </tr>
      )}
    </>
  );
}
