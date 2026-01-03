// src/pages/admin/AdminMembershipApproval.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useGlobalAlert } from "../../components/GlobalAlert";
import { formatDateFrSafe } from "../../lib/dateUtils";
import { FaCheck, FaTimes, FaUser, FaFilter, FaSync } from "react-icons/fa";

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

export default function AdminMembershipApproval() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending"); // default
  const { showAlert } = useGlobalAlert();
  const [role, setRole] = useState(null);


  async function loadProfiles() {
    setLoading(true);
    try {
      let query = supabase
  .from("club_profiles")
  .select(`
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
    rules_pdf_url,
    accord_pdf_url,
    id_file_url,
    club_profile_families (
      id,
      relation,
      full_name,
      birth_date,
      id_file_url
    )
  `)

        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error(error);
        showAlert("Erreur lors du chargement des membres.", "error");
        return;
      }

      setRows(data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);


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


  async function handleActivate(row) {
  if (
    !window.confirm(
      `Activer ce membre et débloquer son accès Club ?\n\n${row.main_full_name}`
    )
  ) {
    return;
  }

  try {
    setLoading(true);

    // 1️⃣ Force update status = active
    const { error: updateErr } = await supabase
      .from("club_profiles")
      .update({ status: "active" })
      .eq("id", row.id);

    if (updateErr) {
      console.error(updateErr);
      showAlert("Erreur lors de l’activation du membre (update).", "error");
      return;
    }

    // 2️⃣ Explicitly call the activation SQL function
    //    This ENSURES the trigger logic runs.
    const { error: funcErr } = await supabase.rpc(
      "activate_club_profile_rpc",
      { profile_id: row.id }
    );

    if (funcErr) {
      console.error(funcErr);
      showAlert("Activation fonctionnelle échouée.", "error");
      return;
    }

    // 3️⃣ Send the acceptance email
try {
  await fetch(
    `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/send-club-welcome-email`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: row.email,
        full_name: row.main_full_name,
        membership_type_label:
          row.membership_type === "solo"
            ? "Adhésion Solo"
            : row.membership_type === "couple"
            ? "Adhésion Couple"
            : "Adhésion Famille",

        plan_label: (row.plan_code || "").toUpperCase(),
        monthly_fee: row.total_monthly_fee_usd ?? "",
        group_names:
          row.club_profile_families
            ?.map((m) => m.full_name)
            .join(", ") || "", // Optional
        login_url: "https://www.clubaquador.com/login" 
      }),
    }
  );
} catch (emailErr) {
  console.error("Error sending acceptance email:", emailErr);
  // Do NOT return; activation must proceed even if email fails
}


    showAlert("Membre activé avec succès.", "success");

    await loadProfiles();
  } finally {
    setLoading(false);
  }
}




  async function handleReject(row) {
  if (
    !window.confirm(
      `⚠️ REJET DEFINITIF ⚠️\n\nCe membre et tous ses documents seront supprimés.\n\nConfirmer le rejet de : ${row.main_full_name} ?`
    )
  ) {
    return;
  }

  try {
    setLoading(true);

    // 🔥 Reject directly in Supabase
    const { error } = await supabase
      .from("club_profiles")
      .update({
        status: "rejected",
      })
      .eq("id", row.id);

    if (error) {
      console.error(error);
      showAlert("Erreur lors du rejet du membre.", "error");
      return;
    }

    showAlert("Membre rejeté et supprimé.", "success");
    await loadProfiles();
  } finally {
    setLoading(false);
  }
}


  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FaUser /> Approbation des membres du Club
        </h1>

        <div className="flex items-center gap-2">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="pending">En attente</option>
            <option value="active">Actifs</option>
            <option value="rejected">Rejetés</option>
            <option value="all">Tous</option>
          </select>
          <button
            onClick={loadProfiles}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            <FaSync className={loading ? "animate-spin" : ""} />
            Rafraîchir
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Nom</Th>
              <Th>Contact</Th>
              <Th>Plan</Th>
              <Th>Montant</Th>
              <Th>Statut</Th>
              <Th>Créé le</Th>
              <Th>Activé le</Th>
              <Th>Documents</Th>
              {role !== "assistant" && <Th>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center text-gray-500 py-6 text-sm"
                >
                  {loading
                    ? "Chargement..."
                    : "Aucun membre trouvé pour ce filtre."}
                </td>
              </tr>
            )}

            {rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-gray-50">
                <Td>
                  <div className="font-semibold">{row.main_full_name}</div>
                  <div className="text-xs text-gray-500">
                    Type: {row.membership_type || "—"} • Plan:{" "}
                    {(row.plan_code || "—").toUpperCase()}
                  </div>
                </Td>

                <Td>
                  <div>{row.email || "—"}</div>
                  <div className="text-xs text-gray-500">
                    {row.phone || "—"}
                  </div>
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
                    ? `USD ${Number(row.total_monthly_fee_usd).toFixed(2)}`
                    : "—"}
                </Td>

                <Td>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      STATUS_COLORS[row.status] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {STATUS_LABELS[row.status] || row.status || "—"}
                  </span>
                  {row.docs_approved && (
                    <div className="text-[10px] text-emerald-700 mt-1">
                      Docs approuvés
                    </div>
                  )}
                </Td>

                <Td>
                  {row.created_at
                    ? formatDateFrSafe(row.created_at)
                    : "—"}
                </Td>

                <Td>
                  {row.activated_at
                    ? formatDateFrSafe(row.activated_at)
                    : "—"}
                </Td>

                <Td>
  <div className="space-y-1 text-xs">

    {/* =======================
        MAIN ACCOUNT REQUIRED
       ======================= */}
    <div className="font-semibold text-gray-700">Titulaire</div>

    {/* MAIN ID */}
    {row.id_file_url ? (
      <a
        href={row.id_file_url}
        target="_blank"
        className="text-blue-600 underline block"
      >
        🪪 ID principal
      </a>
    ) : (
      <span className="text-red-600 font-semibold block">
        ❌ ID principal MANQUANT
      </span>
    )}

    {/* RULES PDF */}
    {row.rules_pdf_url ? (
      <a
        href={row.rules_pdf_url}
        target="_blank"
        className="text-blue-600 underline block"
      >
        📘 Règlements signés
      </a>
    ) : (
      <span className="text-red-600 font-semibold block">
        ❌ Règlements MANQUANTS
      </span>
    )}

    {/* ACCORD PDF */}
    {row.accord_pdf_url ? (
      <a
        href={row.accord_pdf_url}
        target="_blank"
        className="text-blue-600 underline block"
      >
        📄 Accord signé
      </a>
    ) : (
      <span className="text-red-600 font-semibold block">
        ❌ Accord signé MANQUANT
      </span>
    )}

    {/* =======================
        FAMILY REQUIRED DOCS
       ======================= */}
    {row.club_profile_families?.length > 0 && (
      <div className="mt-2">
        <div className="font-semibold text-gray-700">Famille</div>

        {row.club_profile_families.map((f) => {
          const age = f.birth_date
            ? Math.floor(
                (Date.now() - new Date(f.birth_date).getTime()) /
                  (365.25 * 24 * 60 * 60 * 1000)
              )
            : null;

          const idRequired = f.relation === "spouse" || (age != null && age >= 18);

          return (
            <div key={f.id} className="ml-1">
              {/* Label */}
              <div>
                {f.relation === "spouse" ? "Conjoint" : "Enfant"} –{" "}
                {f.full_name}
              </div>

              {/* ID REQUIRED */}
              {idRequired ? (
                f.id_file_url ? (
                  <a
                    href={f.id_file_url}
                    target="_blank"
                    className="text-blue-600 underline block"
                  >
                    🪪 ID
                  </a>
                ) : (
                  <span className="text-red-600 font-semibold block">
                    ❌ ID MANQUANT
                  </span>
                )
              ) : (
                <span className="text-gray-400 italic block">
                  ID non requis (moins de 18 ans)
                </span>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
</Td>

              {role !== "assistant" && (
                <Td>
                  <div className="flex flex-col gap-1">
                    {row.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleActivate(row)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                          disabled={loading}
                        >
                          <FaCheck /> Activer
                        </button>
                        <button
                          onClick={() => handleReject(row)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
                          disabled={loading}
                        >
                          <FaTimes /> Rejeter
                        </button>
                      </>
                    )}

                    {row.status === "active" && (
                      <span className="text-xs text-gray-500">
                        Membre déjà actif
                      </span>
                    )}

                    {row.status === "rejected" && (
                      <span className="text-xs text-red-500">
                        Dossier rejeté
                      </span>
                    )}
                  </div>
                </Td>
              )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Small table helpers */

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
