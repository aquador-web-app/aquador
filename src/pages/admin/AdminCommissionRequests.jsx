import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion } from "framer-motion";
import {
  FaMoneyBillWave,
  FaCheckCircle,
  FaHourglassHalf,
  FaTimesCircle,
} from "react-icons/fa";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";


export default function AdminCommissionRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const { showAlert, showConfirm } = useGlobalAlert();

  // 🔹 Load all commission requests
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("commission_requests")
      .select(`
        id,
        referrer_user_id,
        amount_requested,
        requested_at,
        processed,
        status,
        boutique_invoice_id,
        profiles:referrer_user_id (email, full_name)
      `)
      .order("requested_at", { ascending: false });

    if (!error) setRequests(data || []);
    else console.error("❌ Error loading requests:", error);

    setLoading(false);
  };

  useEffect(() => {
    load(); 
  }, []);

  // 🔹 Process (approve) a request
const processRequest = async (reqId, userId) => {
  const confirmed = await showConfirm(
    "Voulez-vous vraiment marquer cette demande comme payée ?"
  );

  if (!confirmed) return;

  const { error } = await supabase.rpc("process_commission_request", {
    req_id: reqId,
  });

  if (error) {
    await showAlert("Erreur lors du traitement : " + error.message);
    return;
  }

  await showAlert("✅ Commission payée et demande marquée comme traitée !");
  await load();
};

  // 🔹 Cancel a request
const cancelRequest = async (reqId) => {
  const confirmed = await showConfirm(
    "Êtes-vous sûr de vouloir annuler cette demande ?"
  );
  if (!confirmed) return;

  const { error } = await supabase
    .from("commission_requests")
    .update({
      status: "cancelled",
      processed: false,
      amount_paid: 0,
      processed_at: null,
    })
    .eq("id", reqId);

  if (error) {
    await showAlert("❌ Erreur lors de l'annulation : " + error.message);
    console.error(error);
    return;
  }

  await showAlert("🛑 Demande annulée avec succès.");
  await load();
};


  return (
    <motion.div
      className="bg-white p-6 rounded-2xl shadow-lg space-y-6"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FaMoneyBillWave className="text-green-600" /> Demandes de Paiement
        </h1>
      </div>

      {/* Loader */}
      {loading && <div className="text-center text-gray-500 py-6">Chargement...</div>}

      {/* Empty state */}
      {!loading && requests.length === 0 && (
        <div className="bg-gray-50 text-center p-8 rounded-xl border text-gray-500 font-medium">
          Aucune demande de paiement.
        </div>
      )}

      {/* Table */}
      {!loading && requests.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-blue-50 text-gray-800 font-semibold">
              <tr>
                <th className="p-3 border text-left">#</th>
                <th className="p-3 border text-left">Utilisateur</th>
                <th className="p-3 border text-left">Email</th>
                <th className="p-3 border text-left">Montant demandé</th>
                <th className="p-3 border text-left">Demandé le</th>
                <th className="p-3 border text-left">Statut</th>
                <th className="p-3 border text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`hover:bg-gray-50 transition-all ${
                    r.status === "cancelled" ? "opacity-50 bg-red-50" : ""
                  }`}
                >
                  <td className="p-3 border text-gray-700 font-medium">{i + 1}</td>
                  <td className="p-3 border text-gray-800 font-semibold">
                    {r.profiles?.full_name}
                  </td>
                  <td className="p-3 border text-gray-600">
                    {r.profiles?.email || "—"}
                  </td>
                  <td className="p-3 border text-blue-700 font-semibold">
                    {formatCurrencyUSD(r.amount_requested)}
                  </td>
                  <td className="p-3 border text-gray-500">
                    {formatDateFrSafe(r.requested_at)}
                  </td>

                  {/* Status */}
                  <td className="p-3 border text-center">
                    {r.status === "cancelled" ? (
                      <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-semibold shadow-sm">
                        <FaTimesCircle /> Annulée
                      </span>
                    ) : r.processed ? (
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-semibold shadow-sm">
                        <FaCheckCircle /> Payée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-semibold shadow-sm">
                        <FaHourglassHalf /> En attente
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="p-3 border text-center space-y-2">
                    {r.boutique_invoice_id ? (
                      <span className="text-green-600 text-xs font-semibold">
                        🔗 Payé via Boutique
                      </span>
                    ) : !r.processed && r.status !== "cancelled" ? (
                      <>
                        <button
                          onClick={() => processRequest(r.id, r.referrer_user_id)}
                          className="bg-aquaBlue hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition block w-full"
                        >
                          Marquer comme payé
                        </button>
                        <button
                          onClick={() => cancelRequest(r.id)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition block w-full"
                        >
                          Annuler la demande
                        </button>
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs italic">Déjà traité</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
