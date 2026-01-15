import { useEffect, useState, Fragment } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { FaUserFriends, FaChevronDown, FaChevronUp, FaLink } from "react-icons/fa";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";

export default function UserReferrals({ user }) {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [referralLink, setReferralLink] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    setReferralLink(`${window.location.origin}/signup?ref=${user.referral_code}`);

    (async () => {
  setLoading(true);
  try {
    // ✅ Use the RPC that already works in your overview tab
    const { data: refs, error: refErr } = await supabase
      .rpc("get_referrals_with_profiles", { p_user_id: user.id });

    if (refErr) throw refErr;

    // ✅ Fetch commissions belonging to this user as referrer
    let comms = [];
    try {
      const { data: c, error: cErr } = await supabase
        .from("commissions")
        .select("referrer_user_id, referred_user_id, amount")
        .eq("referrer_user_id", user.id);
      if (!cErr) comms = c || [];
    } catch (e) {
      console.warn("⚠️ commissions table not found:", e.message);
    }

    // ✅ Build filleuls list from RPC data
    const filleuls = (refs || []).map((r) => {
      const totalCommission = comms
        .filter((c) => c.referred_user_id === r.referred_user_id)
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      return {
        id: r.id,
        name: r.referred_full_name || "—",
        code: r.referred_referral_code || "—",
        commission: totalCommission,
        createdAt: r.created_at,
      };
    });

    const totalCommissions = filleuls.reduce(
      (sum, f) => sum + (f.commission || 0),
      0
    );

    setReferrals([
      {
        referrerId: user.id,
        referrerName: user.full_name || "Moi",
        referrerCode: user.referral_code || "—",
        filleuls,
        totalCommissions,
      },
    ]);
  } catch (err) {
    console.error("Erreur chargement des filleuls:", err);
  }
  setLoading(false);
})();
  }, [user]);

  const toggleExpand = (id) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <div className="w-full">
      {/* === Header === */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <h3 className="text-2xl font-bold text-aquaBlue flex items-center gap-2">
          <FaUserFriends /> Mon Parrainage
        </h3>
      </motion.div>

      {/* === Referral Link Section === */}
      <div className="bg-white rounded-2xl shadow mb-6 border border-gray-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-gray-700 font-medium mb-1">
              Ton code parrainage :{" "}
              <span className="text-blue-700 font-semibold">
                {user?.referral_code || "—"}
              </span>
            </p>
            <p className="text-sm text-gray-500">
              Partage ton lien ci-dessous pour inviter de nouveaux membres.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <input
              type="text"
              value={referralLink}
              readOnly
              className="border border-gray-300 rounded-lg p-2 text-sm w-full sm:w-80"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(referralLink);
                alert("Lien copié !");
              }}
              className="bg-gradient-to-r from-blue-900 to-blue-900 text-white px-3 py-2 rounded-lg shadow hover:opacity-90 transition flex items-center gap-1"
            >
              <FaLink /> Copier
            </button>
          </div>
        </div>
      </div>

      {/* === Table (Desktop only) === */}
      <div className="hidden md:block bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
        <table className="table-auto w-full border-collapse">
          <thead className="bg-gradient-to-r from-blue-700 to-orange-400 text-white">
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
            ) : referrals.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">
                  Aucun parrainage trouvé.
                </td>
              </tr>
            ) : (
              referrals.map((r) => (
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
                                    {f.commission
                                      ? formatCurrencyUSD(f.commission)
                                      : "$0.00"}
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
      {/* 📱 Mobile referral cards — styled like desktop */}
<div className="md:hidden space-y-5 mt-4">
  {loading ? (
    <p className="text-center text-gray-500 italic">Chargement…</p>
  ) : referrals.length === 0 ? (
    <p className="text-center text-gray-500 italic">
      Aucun parrainage trouvé.
    </p>
  ) : (
    referrals.map((r) => (
      <div
        key={r.referrerId}
        className="rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-white"
      >
        {/* Header — desktop-like gradient */}
        <button
          onClick={() => toggleExpand(r.referrerId)}
          className="w-full flex justify-between items-center px-4 py-4 bg-gradient-to-r from-blue-700 to-orange-400 text-white"
        >
          <div>
            <p className="text-lg font-bold">
              {r.referrerName}
            </p>
            <p className="text-xs opacity-90">
              Code : {r.referrerCode}
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold">
              {r.filleuls.length} filleul{r.filleuls.length > 1 ? "s" : ""}
            </p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-base font-bold">
                {formatCurrencyUSD(r.totalCommissions)}
              </span>
              {expanded === r.referrerId ? (
                <FaChevronUp />
              ) : (
                <FaChevronDown />
              )}
            </div>
          </div>
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded === r.referrerId && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-gray-50 px-4 py-4 space-y-4"
            >
              {r.filleuls.map((f) => (
                <div
                  key={f.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                >
                  {/* Row 1 */}
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-blue-700 text-base">
                        {f.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateFrSafe(f.createdAt)}
                      </p>
                    </div>

                    <span className="text-sm font-bold text-green-600">
                      {f.commission
                        ? formatCurrencyUSD(f.commission)
                        : "$0.00"}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-gray-100 my-2"></div>

                  {/* Row 2 */}
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Code :</span>{" "}
                    <span className="text-gray-900">{f.code}</span>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ))
  )}
</div>

    </div>
  );
}
