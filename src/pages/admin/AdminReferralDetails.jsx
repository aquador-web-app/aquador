import { useEffect, useState, Fragment } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { FaUserFriends, FaChevronDown, FaChevronUp } from "react-icons/fa";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";

export default function AdminReferralDetails({ userId, onBack }) {
  const [referrers, setReferrers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: refs, error: refErr } = await supabase
          .from("referrals")
          .select(`
            id,
            created_at,
            referrer:referrer_user_id ( id, full_name, referral_code ),
            referred:referred_user_id ( id, full_name, referral_code )
          `)
          .order("created_at", { ascending: false });
        if (refErr) throw refErr;

        let comms = [];
        try {
          const { data: c, error: cErr } = await supabase
            .from("commissions")
            .select("referrer_user_id, referred_user_id, amount");
          if (!cErr) comms = c || [];
        } catch (e) {
          console.warn("⚠️ commissions table not found:", e.message);
        }

        const grouped = {};
        for (const r of refs || []) {
          const key = r.referrer?.id;
          if (!key) continue;

          const totalCommission = comms
            .filter(
              (c) =>
                c.referrer_user_id === r.referrer?.id &&
                c.referred_user_id === r.referred?.id
            )
            .reduce((sum, c) => sum + Number(c.amount || 0), 0);

          if (!grouped[key]) {
            grouped[key] = {
              referrerId: key,
              referrerName: r.referrer?.full_name || "—",
              referrerCode: r.referrer?.referral_code || "—",
              filleuls: [],
              totalCommissions: 0,
            };
          }

          grouped[key].filleuls.push({
            id: r.id,
            name: r.referred?.full_name || "—",
            code: r.referred?.referral_code || "—",
            commission: totalCommission,
            createdAt: r.created_at,
          });

          grouped[key].totalCommissions += totalCommission;
        }

        setReferrers(Object.values(grouped));
      } catch (err) {
        console.error("Erreur chargement des liens:", err);
      }
      setLoading(false);
    })();
  }, []);

  // Auto-expand when arriving with a userId
  useEffect(() => {
    if (!userId || referrers.length === 0) {
      setExpanded(null);
      return;
    }
    const match = referrers.find((r) => String(r.referrerId) === String(userId));
    setExpanded(match ? match.referrerId : null);
  }, [referrers, userId]);

  const toggleExpand = (id) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <h3 className="text-2xl font-bold text-aquaBlue flex items-center gap-2">
          <FaUserFriends /> Parrainages & Filleuls
        </h3>
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition"
          >
            ← Retour
          </button>
        )}
      </motion.div>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
        <table className="table-auto w-full border-collapse">
          <thead className="bg-gradient-to-r from-blue-700 to-aquaBlue text-white">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Parrain</th>
              <th className="px-4 py-3 text-left font-semibold">Code</th>
              <th className="px-4 py-3 text-center font-semibold"># Filleuls</th>
              <th className="px-4 py-3 text-left font-semibold">Total Commissions</th>
              <th className="px-4 py-3 text-center font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">
                  Chargement...
                </td>
              </tr>
            ) : referrers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">
                  Aucun parrainage trouvé.
                </td>
              </tr>
            ) : (
              referrers.map((r) => (
                <Fragment key={r.referrerId}>
                  <tr
                    className={`border-b cursor-pointer transition ${
                      expanded === r.referrerId ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                    onClick={() => toggleExpand(r.referrerId)}
                  >
                    <td className="px-4 py-3 font-medium text-blue-700">
                      {r.referrerName}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.referrerCode}</td>
                    <td className="px-4 py-3 text-center font-bold text-aquaBlue">
                      {r.filleuls.length}
                    </td>
                    <td
  className={`px-4 py-3 font-medium ${
    r.totalCommissions > 0 ? "text-red-600" : "text-green-600"
  }`}
>
  {formatCurrencyUSD(r.totalCommissions)}
</td>

                    <td className="px-4 py-3 text-center">
                      {expanded === r.referrerId ? (
                        <FaChevronUp className="inline text-gray-500" />
                      ) : (
                        <FaChevronDown className="inline text-gray-500" />
                      )}
                    </td>
                  </tr>

                  <AnimatePresence>
                    {expanded === r.referrerId && (
                      <motion.tr
                        key={`${r.referrerId}-details`}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <td colSpan={5} className="bg-gray-50 px-6 py-5">
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                          >
                            {r.filleuls.map((f) => (
                              <motion.div
                                key={f.id}
                                whileHover={{ scale: 1.02 }}
                                className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 transition-all"
                              >
                                <div className="flex justify-between items-center mb-2">
                                  <h4 className="font-semibold text-blue-700 text-lg">
                                    {f.name}
                                  </h4>
                                  <span className="text-sm text-gray-400">
                                    {formatDateFrSafe(f.createdAt)}
                                  </span>
                                </div>
                                <div className="text-sm text-gray-600 mb-1">
                                  <span className="font-medium text-gray-800">Code:</span>{" "}
                                  {f.code}
                                </div>
                                <div className="text-sm">
                                  <span className="font-medium text-gray-800">
                                    Commission:
                                  </span>{" "}
                                  <span className="text-green-600 font-semibold">
                                    {f.commission ? formatCurrencyUSD(f.commission) : "$0.00"}
                                  </span>
                                </div>
                              </motion.div>
                            ))}
                          </motion.div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
