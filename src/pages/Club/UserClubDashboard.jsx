// src/pages/club/UserClubDashboard.jsx
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { motion } from "framer-motion";
import { FaBell, FaFileInvoiceDollar, FaShoppingCart, FaUsers, FaLink } from "react-icons/fa";
import { formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";

export default function UserClubDashboard({ setActiveClubTab }) {
  const { user } = useAuth();
  const { showAlert } = useGlobalAlert();

  const [profile, setProfile] = useState(null);
  const [family, setFamily] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [pendingBalance, setPendingBalance] = useState(0);

  const [referralLink, setReferralLink] = useState("");

  // ====================================================
  // LOAD CLUB PROFILE
  // ====================================================
  useEffect(() => {
    if (!user?.id) return;

    const loadProfile = async () => {
      const { data } = await supabase
        .from("club_profiles")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      setProfile(data);
    };

    loadProfile();
  }, [user?.id]);

  // ====================================================
  // LOAD FAMILY MEMBERS
  // ====================================================
  useEffect(() => {
    if (!profile?.id) return;

    const loadFamily = async () => {
      const { data } = await supabase
        .from("club_profile_families")
        .select("*")
        .eq("club_profile_id", profile.id);

      setFamily(data || []);
    };

    loadFamily();
  }, [profile?.id]);

  // ====================================================
  // LOAD CLUB INVOICES
  // ====================================================
  useEffect(() => {
    if (!profile?.id) return;

    const loadInvoices = async () => {
      const { data } = await supabase
        .from("club_invoices")
        .select("*")
        .eq("customer_id", profile.id)
        .order("issued_at", { ascending: false });

      setInvoices(data || []);

      // compute recent + balance
      setRecentInvoices((data || []).slice(0, 5));

      const bal = (data || []).reduce((sum, inv) => {
        const total = Number(inv.final_amount_cents || inv.total || 0);
        const paid = Number(inv.paid_total || 0);
        return sum + (total - paid);
      }, 0);

      setPendingBalance(bal);
    };

    loadInvoices();
  }, [profile?.id]);

  // ====================================================
  // LOAD REFERRALS
  // ====================================================
  useEffect(() => {
    if (!profile?.id) return;

    const loadRefs = async () => {
      const { data, error } = await supabase
        .rpc("get_club_referrals", { p_user_id: user.id });

      if (!error) setReferrals(data || []);
    };

    loadRefs();
  }, [profile?.id]);

  // ====================================================
  // REFERRAL LINK
  // ====================================================
  useEffect(() => {
    if (!user?.referral_code) return;
    setReferralLink(`${window.location.origin}/club/signup?ref=${user.referral_code}`);
  }, [user]);

  // ====================================================
  // LOAD NOTIFICATIONS
  // ====================================================
  useEffect(() => {
    if (!user?.id || !recentInvoices) return;

    const buildNotifications = async () => {
      const notes = [];

      // recent paid invoices
      recentInvoices.forEach((inv) => {
        if (inv.status === "paid" || inv.status === "partial") {
          notes.push({
            id: `inv-${inv.id}`,
            text: `Paiement reçu: USD ${(inv.paid_total / 100).toFixed(2)}`,
            date: inv.issued_at || inv.created_at,
          });
        }
      });

      // referrals
      referrals.slice(0, 5).forEach((r) => {
        notes.push({
          id: `ref-${r.id}`,
          text: `Nouveau membre parrainé: ${r.referred_full_name}`,
          date: r.created_at,
        });
      });

      // DB notifications
      const { data: dbNotes } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(5);

      const merged = [...(dbNotes || []), ...notes]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

      setNotifications(merged);
    };

    buildNotifications();
  }, [user?.id, recentInvoices, referrals]);

  // ===============================================================================
  // RENDER OVERVIEW
  // ===============================================================================
  if (!profile)
    return <div className="p-6 text-gray-700">Chargement...</div>;

  return (
    <div className="space-y-8">

      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold text-gray-800">
          Bienvenue au Club, {profile.main_full_name}
        </h1>
        <p className="text-gray-600">
          Voici un aperçu de ton abonnement et de ton activité.
        </p>
      </div>

      {/* MEMBERSHIP SUMMARY */}
      <motion.div
        className="p-5 bg-white rounded-2xl shadow border border-gray-100"
        whileHover={{ scale: 1.02 }}
      >
        <h2 className="text-xl font-semibold text-gray-700">Mon abonnement</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div>
            <p className="text-gray-600">Plan</p>
            <p className="font-bold">{profile.plan_code?.toUpperCase()}</p>
          </div>

          <div>
            <p className="text-gray-600">Frais mensuel</p>
            <p className="font-bold">USD {profile.total_monthly_fee_usd}</p>
          </div>

          <div>
            <p className="text-gray-600">Statut</p>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                profile.status === "active"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {profile.status === "active" ? "Actif" : "En attente"}
            </span>
          </div>
        </div>
      </motion.div>

      {/* FAMILY MEMBERS */}
      <motion.div
        className="p-5 bg-white rounded-2xl shadow border border-gray-100"
        whileHover={{ scale: 1.02 }}
      >
        <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
          <FaUsers /> Famille associée
        </h2>

        {family.length === 0 ? (
          <p className="text-gray-600 mt-3">Aucun membre ajouté.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {family.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>{m.full_name}</span>
                <span className="text-gray-500">{formatDateFrSafe(m.birth_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* BALANCE */}
      <motion.div
        className="p-5 bg-white rounded-2xl shadow border border-gray-100"
        whileHover={{ scale: 1.02 }}
      >
        <h2 className="text-xl font-semibold text-gray-700">Solde impayé</h2>

        <p
          className={`text-3xl font-bold mt-3 ${
            pendingBalance > 0 ? "text-red-600" : "text-green-600"
          }`}
        >
          {formatCurrencyUSD(pendingBalance / 100)}
        </p>

        <button
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
          onClick={() => setActiveClubTab("invoices")}
        >
          Voir les factures
        </button>
      </motion.div>

      {/* RECENT INVOICES */}
      <motion.div className="p-5 bg-white rounded-2xl shadow border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
          <FaFileInvoiceDollar /> Dernières factures
        </h2>

        {recentInvoices.length === 0 ? (
          <p className="text-gray-600 mt-3">Aucune facture récemment générée.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {recentInvoices.map((inv) => (
              <li
                key={inv.id}
                className="py-3 flex justify-between items-center hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setActiveClubTab("invoices");
                  setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent("openClubInvoice", { detail: { invoiceId: inv.id } })
                    );
                  }, 100);
                }}
              >
                <span className="font-semibold">#{inv.invoice_no}</span>
                <span className="text-gray-600">
                  {formatDateFrSafe(inv.issued_at || inv.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* REFERRALS */}
      <motion.div className="p-5 bg-white rounded-2xl shadow border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
          <FaLink /> Parrainage
        </h2>

        <div className="mt-2">
          <p className="text-gray-600 mb-2">Ton lien de parrainage :</p>

          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              className="flex-1 border rounded p-2"
              value={referralLink}
            />
            <button
              className="px-3 py-2 bg-blue-600 text-white rounded"
              onClick={() => {
                navigator.clipboard.writeText(referralLink);
                showAlert("Lien copié !");
              }}
            >
              Copier
            </button>
          </div>

          <div className="mt-4 text-sm">
            <p>Total parrainages : {referrals.length}</p>
            <p>
              Membres actifs :{" "}
              {referrals.filter((r) => r.referred_is_active).length}
            </p>
            <p>
              Membres inactifs :{" "}
              {referrals.filter((r) => !r.referred_is_active).length}
            </p>
          </div>

          <button
            className="mt-4 px-5 py-2 bg-orange-500 text-white rounded shadow"
            onClick={() => setActiveClubTab("referrals")}
          >
            Voir plus
          </button>
        </div>
      </motion.div>

      {/* NOTIFICATIONS */}
      <motion.div className="p-5 bg-white rounded-2xl shadow border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
          <FaBell /> Notifications
        </h2>

        {notifications.length === 0 ? (
          <p className="text-gray-600 mt-2">Aucune notification.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {notifications.map((n) => (
              <li key={n.id} className="flex justify-between">
                <span>{n.text}</span>
                <span className="text-gray-500">
                  {formatDateFrSafe(n.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* BOUTIQUE */}
      <motion.div
        className="p-5 bg-white rounded-2xl shadow border border-gray-100"
        whileHover={{ scale: 1.02 }}
      >
        <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
          <FaShoppingCart /> Boutique du Club
        </h2>

        <button
          className="mt-4 px-5 py-2 bg-green-600 text-white rounded shadow"
          onClick={() => setActiveClubTab("boutique")}
        >
          Accéder à la boutique
        </button>
      </motion.div>
    </div>
  );
}
