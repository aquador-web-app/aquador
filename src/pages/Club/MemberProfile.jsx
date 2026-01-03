// src/pages/Club/MemberProfile.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  formatDateFrSafe,
  formatDateOnly,
  formatMonth,
  formatCurrencyUSD,
} from "../../lib/dateUtils";
import {
  FaUser,
  FaUsers,
  FaReceipt,
  FaFilePdf,
  FaHome,
  FaPhone,
  FaEnvelope,
} from "react-icons/fa";

/**
 * MemberProfile
 *
 * Props:
 *  - clubProfileId: UUID from club_profiles.id  (preferred)
 *  - authUserId   : UUID from auth.users.id    (fallback)
 */
export default function MemberProfile({ clubProfileId, authUserId }) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("infos");

  const [profile, setProfile] = useState(null); // club_profiles row
  const [family, setFamily] = useState([]); // club_profile_families[]
  const [invoices, setInvoices] = useState([]); // club_invoices[]
  

  // ===== Small helpers =====
  const Badge = ({ children, color }) => {
    const colors = {
      green: "bg-green-100 text-green-700",
      red: "bg-red-100 text-red-700",
      gray: "bg-gray-100 text-gray-700",
      blue: "bg-blue-100 text-blue-700",
      orange: "bg-orange-100 text-orange-700",
      purple: "bg-purple-100 text-purple-700",
    };
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
          colors[color] || colors.gray
        }`}
      >
        {children}
      </span>
    );
  };

  const stripMonthSuffix = (s) =>
    s?.replace(/\s+—\s+[A-Za-zÀ-ÿ]+\s+\d{4}$/, "") ?? s;

  const invoiceItems = (inv) => {
    const items = [];
    for (let i = 1; i <= 7; i++) {
      const desc = inv[`description${i}`];
      const amt = Number(inv[`amount${i}`] || 0);
      if (desc && amt > 0) {
        items.push(`${stripMonthSuffix(desc)}: ${formatCurrencyUSD(amt)}`);
      }
    }
    return items;
  };

  const resolveTotal = (inv) => {
    if (inv.total != null) return Number(inv.total);
    if (inv.final_amount_cents != null)
      return Number(inv.final_amount_cents) / 100;
    if (inv.amount_cents != null) return Number(inv.amount_cents) / 100;
    return 0;
  };

  const resolvePaid = (inv) => {
    if (inv.paid_total != null) return Number(inv.paid_total);
    // if later you track paid_cents, adapt here
    return 0;
  };

  // ===== Main loader =====
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // 1) Load club profile
        let profileQuery = supabase
          .from("club_profiles")
          .select("*")
          .limit(1);

        if (clubProfileId) {
          profileQuery = profileQuery.eq("id", clubProfileId);
        } else if (authUserId) {
          profileQuery = profileQuery.eq("auth_user_id", authUserId);
        } else {
          console.error("MemberProfile: no clubProfileId or authUserId");
          setLoading(false);
          return;
        }

        const { data: pRows, error: pErr } = await profileQuery;
        if (pErr) {
          console.error("Error loading club profile", pErr);
          setLoading(false);
          return;
        }
        const p = pRows?.[0] || null;
        setProfile(p);

        if (!p?.id) {
          setLoading(false);
          return;
        }

        // 2) Load family members
        const { data: fam, error: famErr } = await supabase
          .from("club_profile_families")
          .select("*")
          .eq("club_profile_id", p.id)
          .order("created_at", { ascending: true });

        if (famErr) {
          console.error("Error loading club family", famErr);
        }
        setFamily(fam || []);

        // 3) Load club invoices
        const { data: invs, error: invErr } = await supabase
          .from("club_invoices")
          .select("*")
          .eq("customer_id", p.id)
          .order("due_date", { ascending: false });

        if (invErr) {
          console.error("Error loading club invoices", invErr);
        }
        setInvoices(invs || []);
      } catch (err) {
        console.error("MemberProfile fatal error", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [clubProfileId, authUserId]);

  const handleSaveContact = async () => {
    if (!profile?.id) return;
    const { error } = await supabase
      .from("club_profiles")
      .update({
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
      })
      .eq("id", profile.id);

    if (error) {
      alert("Erreur lors de la mise à jour du profil");
      console.error(error);
    } else {
      alert("Profil mis à jour avec succès !");
    }
  };

  if (loading) return <div className="p-6">Chargement…</div>;
  if (!profile) return <div className="p-6 text-red-600">Membre introuvable.</div>;

  // ===== Derived info =====
  const membershipLabel = profile.membership_type || "Standard";
  const statusColor =
    profile.status === "active"
      ? "green"
      : profile.status === "pending"
      ? "orange"
      : "red";

  const totalFamilyFee =
    Number(profile.total_monthly_fee_usd || 0) +
    family.reduce(
      (sum, f) => sum + Number(f.monthly_fee_usd || 0),
      0
    );

  // ===== RENDER =====
  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-blue-600 to-orange-600 text-white rounded-xl p-6 shadow-lg">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-white text-aquaBlue flex items-center justify-center text-2xl font-bold">
            {profile.main_full_name?.[0] || "M"}
          </div>

          {/* Main info */}
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{profile.main_full_name}</h1>

            <div className="flex flex-wrap gap-2 mt-2">
              <Badge color="blue">{membershipLabel}</Badge>
              <Badge color={statusColor}>
                {profile.status === "active"
                  ? "Actif"
                  : profile.status === "pending"
                  ? "En attente"
                  : profile.status || "Inactif"}
              </Badge>
              {profile.is_couple && <Badge color="purple">Couple</Badge>}
              {profile.has_swim_school_kids && (
                <Badge color="orange">Enfants à l’école de natation</Badge>
              )}
              {profile.pay_full_year && (
                <Badge color="green">Paiement annuel</Badge>
              )}
            </div>

            <div className="mt-3 space-y-1 text-sm opacity-90">
              <p className="flex items-center gap-2">
                <FaEnvelope /> {profile.email || "—"}
              </p>
              <p className="flex items-center gap-2">
                <FaPhone /> {profile.phone || "—"}
              </p>
              <p className="flex items-center gap-2">
                <FaHome /> {profile.address || "—"}
              </p>
              <p>
                Anniversaire :{" "}
                {profile.birth_date ? formatDateOnly(profile.birth_date) : "—"}
              </p>
              <p>NIF / CIN : {profile.nif_cin || "—"}</p>
            </div>
          </div>

          {/* Summary card */}
          <div className="hidden md:flex flex-col items-end gap-2">
            <div className="bg-white text-gray-800 rounded-xl px-4 py-3 shadow-md text-right">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Mensualité totale
              </p>
              <p className="text-2xl font-bold">
                {formatCurrencyUSD(totalFamilyFee)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Membre principal :{" "}
                {formatCurrencyUSD(profile.total_monthly_fee_usd || 0)}
              </p>
            </div>
            <p className="text-xs opacity-80 mt-1">
              Inscrit le {formatDateFrSafe(profile.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-4 border-b mb-4">
        {[
          { id: "infos", label: "Infos" },
          { id: "family", label: "Famille" },
          { id: "invoices", label: "Factures" },
          { id: "documents", label: "Documents" },
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

      {/* ===== TAB: INFOS ===== */}
      {tab === "infos" && (
        <div className="bg-white p-6 rounded-2xl shadow space-y-6 max-w-xl mx-auto">
          {/* Contact editable */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
              Coordonnées
            </h2>

            <Field
              label="Nom complet"
              value={profile.main_full_name || "—"}
              readOnly
            />

            <EditableInput
              label="Email"
              type="email"
              value={profile.email || ""}
              onChange={(v) =>
                setProfile((prev) => ({ ...prev, email: v }))
              }
            />

            <EditableInput
              label="Téléphone"
              type="tel"
              value={profile.phone || ""}
              onChange={(v) =>
                setProfile((prev) => ({ ...prev, phone: v }))
              }
            />

            <EditableInput
              label="Adresse"
              type="text"
              value={profile.address || ""}
              onChange={(v) =>
                setProfile((prev) => ({ ...prev, address: v }))
              }
            />

            <div className="flex justify-end">
              <button
                onClick={handleSaveContact}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              >
                Enregistrer
              </button>
            </div>
          </div>

          {/* Membership summary */}
          <div className="space-y-3 border-t pt-4">
            <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
              Abonnement
            </h2>

            <Field
              label="Type d’abonnement"
              value={membershipLabel}
              readOnly
            />
            <Field
              label="Plan / code"
              value={profile.plan_code || "—"}
              readOnly
            />
            <Field
              label="Frais mensuels (membre principal)"
              value={formatCurrencyUSD(profile.total_monthly_fee_usd || 0)}
              readOnly
            />
            <Field
              label="Frais mensuels total (famille incluse)"
              value={formatCurrencyUSD(totalFamilyFee)}
              readOnly
            />
          </div>
        </div>
      )}

      {/* ===== TAB: FAMILY ===== */}
      {tab === "family" && (
        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <FaUsers /> Famille
          </h2>

          {!family.length && (
            <p className="text-sm text-gray-500 italic">
              Aucun membre de famille enregistré.
            </p>
          )}

          {!!family.length && (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Nom complet</Th>
                  <Th>Lien</Th>
                  <Th>Naissance</Th>
                  <Th>Téléphone</Th>
                  <Th right>Mensualité</Th>
                  <Th>Pièce d’identité</Th>
                </tr>
              </thead>
              <tbody>
                {family.map((f) => (
                  <tr key={f.id} className="border-t">
                    <Td>{f.full_name}</Td>
                    <Td>{f.relation || "—"}</Td>
                    <Td>
                      {f.birth_date ? formatDateOnly(f.birth_date) : "—"}
                    </Td>
                    <Td>{f.phone || "—"}</Td>
                    <Td right>
                      {f.monthly_fee_usd
                        ? formatCurrencyUSD(f.monthly_fee_usd)
                        : "—"}
                    </Td>
                    <Td>
                      {f.id_file_url ? (
                        <a
                          href={f.id_file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 underline"
                        >
                          <FaFilePdf /> Voir
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">Aucun fichier</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ===== TAB: INVOICES ===== */}
      {tab === "invoices" && (
        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <FaReceipt /> Factures
          </h2>

          {!invoices.length && (
            <p className="text-sm text-gray-500 italic">Aucune facture.</p>
          )}

          {!!invoices.length && (
            <table className="min-w-full text-sm">
              <thead className="bg-aquaBlue text-white">
                <tr>
                  <Th>No</Th>
                  <Th>Mois</Th>
                  <Th>Total</Th>
                  <Th>Payé</Th>
                  <Th>Échéance</Th>
                  <Th>Description</Th>
                  <Th>Statut</Th>
                  <Th>PDF</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const total = resolveTotal(inv);
                  const paid = resolvePaid(inv);
                  const statusLower = (inv.status || "").toLowerCase();

                  let statusClass =
                    "px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700";
                  if (statusLower === "paid") {
                    statusClass =
                      "px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700";
                  } else if (statusLower === "pending") {
                    statusClass =
                      "px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700";
                  }

                  return (
                    <tr
                      key={inv.id}
                      className="border-t hover:bg-gray-50 transition-colors"
                    >
                      <Td>#{inv.invoice_no || "—"}</Td>
                      <Td>{inv.month ? formatMonth(inv.month) : "—"}</Td>
                      <Td>{formatCurrencyUSD(total)}</Td>
                      <Td>{formatCurrencyUSD(paid)}</Td>
                      <Td>
                        {inv.due_date ? formatDateOnly(inv.due_date) : "—"}
                      </Td>
                      <Td>
                        <ul className="list-disc list-inside space-y-0.5">
                          {invoiceItems(inv).map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </Td>
                      <Td>
                        <span className={statusClass}>
                          {inv.status || "—"}
                        </span>
                      </Td>
                      <Td>
                        {inv.pdf_url ? (
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 underline"
                          >
                            <FaFilePdf /> Ouvrir
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ===== TAB: DOCUMENTS ===== */}
      {tab === "documents" && (
        <div className="bg-white p-6 rounded-2xl shadow space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <FaFilePdf /> Documents
          </h2>

          <DocRow label="Règlements du Club" url={profile.rules_pdf_url} />
          <DocRow label="Accord signé" url={profile.accord_pdf_url} />
          <DocRow label="Pièce d’identité (titulaire)" url={profile.id_file_url} />

          {family.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2 text-gray-700">
                Pièces d’identité — Famille
              </h3>
              <ul className="space-y-1 text-sm">
                {family.map((f) => (
                  <li key={f.id} className="flex justify-between items-center">
                    <span>
                      {f.full_name} ({f.relation || "—"})
                    </span>
                    {f.id_file_url ? (
                      <a
                        href={f.id_file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 underline"
                      >
                        <FaFilePdf /> Ouvrir
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">Aucun fichier</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ===== Small reusable components ===== */

function EditableInput({ label, value, onChange, type = "text" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="font-medium text-gray-600 w-32">{label} :</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function Field({ label, value, readOnly }) {
  return (
    <div>
      <label className="block text-sm text-gray-500 mb-1">{label}</label>
      <div
        className={`text-sm rounded px-3 py-2 border ${
          readOnly ? "bg-gray-50" : "bg-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DocRow({ label, url }) {
  return (
    <div className="flex justify-between items-center text-sm border-b py-2 last:border-b-0">
      <span className="text-gray-700">{label}</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 underline"
        >
          <FaFilePdf /> Ouvrir
        </a>
      ) : (
        <span className="text-gray-400 text-xs">Aucun document</span>
      )}
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide ${
        right ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right, className = "", ...rest }) {
  return (
    <td
      className={`px-3 py-2 align-top text-sm ${
        right ? "text-right" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
