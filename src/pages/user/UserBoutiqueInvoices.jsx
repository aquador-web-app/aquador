import { useEffect, useState, Fragment } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion } from "framer-motion";
import {
  FaFileInvoiceDollar,
  FaDownload,
  FaMoneyBillWave,
  FaCalendarAlt,
  FaChevronDown,
} from "react-icons/fa";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";

export default function UserBoutiqueInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [authUser, setAuthUser] = useState(null);

  // ---------------- Get authenticated user ----------------
  useEffect(() => {
    (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error) console.error("❌ Auth fetch error:", error);
      else if (!user) console.warn("⚠️ No authenticated user found");
      else setAuthUser(user);

      setLoading(false);
    })();
  }, []);

  // ---------------- Fetch invoices ----------------
  useEffect(() => {
    if (!authUser) return;
    loadInvoices();

    const interval = setInterval(loadInvoices, 10000);
    return () => clearInterval(interval);
  }, [authUser]);

  const loadInvoices = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("boutique_invoices")
      .select(`
        id, invoice_no, full_name, total, paid_total, status, pdf_url,
        created_at, payment_method,
        boutique_invoice_items (
          id, name, qty, unit_price
        )
      `)
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Fetch error:", error);
      setInvoices([]);
    } else {
      setInvoices(data || []);
    }

    setLoading(false);
  };

  // ---------------- UI ----------------
  if (loading)
    return (
      <div className="text-center text-gray-600 py-10">Chargement…</div>
    );

  if (!authUser)
    return (
      <div className="text-center text-gray-600 py-10">
        Veuillez vous connecter pour voir vos factures.
      </div>
    );

  return (
    <motion.div
      className="bg-white p-6 rounded-2xl shadow-lg"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <FaFileInvoiceDollar className="text-aquaBlue text-2xl" />
        <h1 className="text-2xl font-bold text-gray-800">
          Mes factures & reçus (Boutique)
        </h1>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center text-gray-500 py-10">
          Aucune facture trouvée.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 rounded-xl text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Méthode</th>
                <th className="px-4 py-2 text-left">Montant</th>
                <th className="px-4 py-2 text-left">Statut</th>
                <th className="px-4 py-2 text-center">Reçu</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const items = inv.boutique_invoice_items || [];
                const statusColor =
                  inv.status === "paid"
                    ? "text-green-700 bg-green-50"
                    : inv.status === "pending"
                    ? "text-yellow-700 bg-yellow-50"
                    : "text-red-700 bg-red-50";

                const isExpanded = expanded === inv.id;

                return (
                  <Fragment key={inv.id}>
                    <tr className="border-t hover:bg-gray-50 transition">
                      <td className="px-4 py-2 font-semibold text-gray-800 align-top">
                        {inv.invoice_no?.toUpperCase() || "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-600 align-top">
                        <div className="flex items-center gap-1">
                          <FaCalendarAlt className="text-gray-400" />
                          {formatDateFrSafe(inv.created_at)}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-700 align-top capitalize">
                        {inv.payment_method === "commission" ? (
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <FaMoneyBillWave /> Commissions
                          </span>
                        ) : (
                          inv.payment_method || "—"
                        )}
                      </td>
                      <td className="px-4 py-2 font-medium text-blue-700 align-top">
                        {formatCurrencyUSD(inv.total || 0)}
                        {inv.paid_total && inv.paid_total !== inv.total && (
                          <span className="text-xs text-gray-500 ml-1">
                            (payé {formatCurrencyUSD(inv.paid_total)})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}
                        >
                          {inv.status === "paid"
                            ? inv.payment_method === "commission"
                              ? "Utilisé en boutique"
                              : "Payée"
                            : inv.status === "pending"
                            ? "En attente"
                            : "Annulée"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center align-top">
                        {inv.pdf_url ? (
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-aquaBlue font-medium hover:text-blue-800"
                          >
                            <FaDownload /> Ouvrir
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs italic">
                            PDF en cours…
                          </span>
                        )}
                      </td>
                      <td className="px-2 text-right align-top">
                        {items.length > 0 && (
                          <button
                            onClick={() =>
                              setExpanded(isExpanded ? null : inv.id)
                            }
                            className="text-gray-500 hover:text-gray-800"
                          >
                            <FaChevronDown
                              className={`transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-gray-50 border-t">
                        <td colSpan="7" className="px-6 py-3">
                          <ul className="space-y-1 text-sm text-gray-700">
                            {items.map((it) => (
                              <li
                                key={it.id}
                                className="flex justify-between border-b pb-1"
                              >
                                <span>
                                  {it.name} × {it.qty}
                                </span>
                                <span className="font-medium text-blue-700">
                                  {formatCurrencyUSD(it.unit_price * it.qty)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
