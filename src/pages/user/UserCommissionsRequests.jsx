import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion } from "framer-motion";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";
import { FaMoneyBillWave, FaHourglassHalf, FaCheckCircle } from "react-icons/fa";

export default function UserCommissionsRequests() {
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [amountRequested, setAmountRequested] = useState("");

  // 🔹 Load profile, balance, and requests
  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1️⃣ Get profile
    const { data: prof } = await supabase
      .from("profiles_with_unpaid")
      .select("*")
      .eq("id", user.id)
      .single();
    setProfile(prof);

    // 2️⃣ Get commissions for this user (as referrer)
    const { data: comms } = await supabase
  .from("commissions")
  .select("amount, remaining_amount, status")
  .eq("referrer_user_id", user.id);


    // Use remaining_amount to reflect real available commission
const active = (comms || []).filter((c) => c.remaining_amount > 0);
const totalRemaining = active.reduce(
  (sum, c) => sum + Number(c.remaining_amount || 0),
  0
);
setBalance(totalRemaining);


    // 3️⃣ Get all commission requests
    const { data: reqs } = await supabase
      .from("commission_requests")
      .select("id, requested_at, processed, amount_requested, amount_paid, status")
      .eq("referrer_user_id", user.id)
      .order("requested_at", { ascending: false });
    setRequests(reqs || []);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // 🔹 Handle new request
  const submitPaymentRequest = async () => {
    if (!profile) return;
    const amount = Number(amountRequested);

    // Validation rules
    if (!amount || amount <= 10) {
      alert("Veuillez entrer un montant valide. Le minimum requis est de USD 10.00");
      return;
    }

    if (amount % 5 !== 0) {
      alert("Le montant doit être un multiple de 5 (ex: 15, 20, 25, ...).");
      return;
    }

    if (amount > balance) {
      alert("Le montant dépasse votre solde disponible.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("commission_requests").insert([
      {
        referrer_user_id: profile.id,
        amount_requested: amount,
        status: "pending",
        requested_at: new Date().toISOString(),
      },
    ]);
    setSubmitting(false);

    if (error) {
      alert("Erreur lors de la demande : " + error.message);
      return;
    }

    // Small delay to let trigger process the request
    await new Promise((r) => setTimeout(r, 300));
    await loadData();

    alert("✅ Votre demande de paiement a été automatiquement traitée !");
    setShowForm(false);
    setAmountRequested("");
  };

  return (
    <motion.div
      className="bg-white p-6 rounded-2xl shadow-lg space-y-6"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FaMoneyBillWave className="text-green-500" />
          Mes Demandes de Paiement
        </h1>

        <button
          onClick={() => setShowForm(true)}
          disabled={balance <= 0}
          className={`px-4 py-2 rounded-lg font-semibold shadow transition ${
            balance <= 0
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-aquaBlue text-white hover:bg-blue-700"
          }`}
        >
          Demander un paiement
        </button>
      </div>

      {/* Current balance */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
        <p className="text-sm text-gray-600 font-medium">Solde disponible</p>
        <h2 className="text-3xl font-bold text-blue-700 mt-1">
          {formatCurrencyUSD(balance)}
        </h2>
      </div>

      {/* Requests table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 text-gray-800 font-semibold">
            <tr>
              <th className="p-3 border text-left">Date de demande</th>
              <th className="p-3 border text-left">Montant demandé</th>
              <th className="p-3 border text-left">Statut</th>
              <th className="p-3 border text-left">Montant payé</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="4" className="text-center py-4 text-gray-500">
                  Chargement...
                </td>
              </tr>
            )}

            {!loading && requests.length === 0 && (
              <tr>
                <td colSpan="4" className="text-center py-4 text-gray-500">
                  Aucune demande effectuée.
                </td>
              </tr>
            )}

            {!loading &&
              requests.map((r) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-50 transition-all"
                >
                  <td className="p-3 border text-gray-700 font-medium">
                    {formatDateFrSafe(r.requested_at)}
                  </td>
                  <td className="p-3 border text-gray-800 font-semibold">
                    {formatCurrencyUSD(r.amount_requested)}
                  </td>
                  <td className="p-3 border">
                    {r.processed || r.status === "paid" ? (
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-semibold shadow-sm">
                        <FaCheckCircle /> Payée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-semibold shadow-sm">
                        <FaHourglassHalf /> En attente
                      </span>
                    )}
                  </td>
                  <td className="p-3 border text-gray-700">
                    {r.amount_paid
                      ? formatCurrencyUSD(r.amount_paid)
                      : r.processed || r.status === "paid"
                      ? formatCurrencyUSD(r.amount_requested)
                      : "—"}
                  </td>
                </motion.tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Modal for custom payment request */}
      {showForm && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="bg-white rounded-2xl p-6 shadow-2xl w-96"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
          >
            <h3 className="text-lg font-bold mb-4 text-gray-800">
              Nouvelle demande de paiement
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Vous pouvez demander une partie ou la totalité de votre solde disponible.
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Montant à retirer (max {formatCurrencyUSD(balance)})
            </label>
            <input
              type="number"
              min="10"
              step="5"
              value={amountRequested}
              onChange={(e) => setAmountRequested(e.target.value.replace(/\D/g, ""))}
              className="w-full border rounded-lg p-2 mb-4 focus:ring-2 focus:ring-aquaBlue"
              placeholder="Ex: 15, 20, 25..."
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 bg-gray-200 rounded hover:bg-gray-300 text-gray-700 font-medium"
              >
                Annuler
              </button>
              <button
                onClick={submitPaymentRequest}
                disabled={submitting}
                className="px-3 py-1.5 bg-aquaBlue text-white rounded hover:bg-blue-700 font-medium"
              >
                {submitting ? "Envoi..." : "Confirmer"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
