import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion } from "framer-motion";
import { FaChevronDown, FaChevronRight, FaFileCsv } from "react-icons/fa";
import { formatCurrencyUSD } from "../../lib/dateUtils";
import { exportCommissionsCSV } from "../../components/ExportCommissionsCSV";

export default function AdminCommissions() {
  const [commissions, setCommissions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [expanded, setExpanded] = useState({});
  const [filterUser, setFilterUser] = useState("");
  const [filterPaid, setFilterPaid] = useState("");
  const [loading, setLoading] = useState(false);

  // 🔹 Load commissions and payment requests
  const load = async () => {
    setLoading(true);

    // 1️⃣ Load all commissions
    let commQuery = supabase
      .from("commissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (filterPaid) commQuery = commQuery.eq("paid", filterPaid === "true");
    const { data: comms, error: commErr } = await commQuery;
    if (commErr) {
      console.error("❌ Commissions error:", commErr);
      setLoading(false);
      return;
    }

    // 2️⃣ Load payment requests (for matching balances)
    const { data: reqs, error: reqErr } = await supabase
      .from("commission_requests")
      .select("id, referrer_user_id, amount_requested, amount_paid, status");
    if (reqErr) console.error("❌ Requests error:", reqErr);

    setCommissions(comms || []);
    setRequests(reqs || []);

    // 🧩 DEBUG LOGS — check what Supabase returned
    console.group("🔍 ADMIN COMMISSIONS DEBUG");
    console.table(comms);
    console.table(reqs);
    console.groupEnd();

    // 3️⃣ Load related profiles
    const ids = [
      ...new Set([
        ...comms.map((c) => c.referrer_user_id),
        ...comms.map((c) => c.referred_user_id),
      ]),
    ].filter(Boolean);

    const { data: profs, error: profErr } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name")
      .in("id", ids);

    if (profErr) console.error("❌ Profiles error:", profErr);
    const map = (profs || []).reduce((acc, p) => {
      acc[p.id] = p.full_name;
      return acc;
    }, {});
    setProfiles(map);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [filterUser, filterPaid]);

  // 🔹 Group commissions by referrer
  const grouped = commissions.reduce((acc, c) => {
    const referrer = c.referrer_user_id;
    if (!referrer) return acc;
    if (!acc[referrer]) acc[referrer] = [];
    acc[referrer].push(c);
    return acc;
  }, {});

  // 🔹 Compute payment totals (requests)
  const requestTotals = requests.reduce((acc, r) => {
    const ref = r.referrer_user_id;
    if (!acc[ref]) acc[ref] = { paid: 0 };
    if (r.status === "paid" || r.status === "completed") {
      acc[ref].paid += Number(r.amount_paid || 0);
    }
    return acc;
  }, {});

  // 🔹 Filter by name
  const filteredReferrers = Object.keys(grouped).filter((rid) => {
    const name = profiles[rid]?.toLowerCase() || "";
    return name.includes(filterUser.toLowerCase());
  });

  const toggleExpand = (referrerId) => {
    setExpanded((prev) => ({
      ...prev,
      [referrerId]: !prev[referrerId],
    }));
  };

  return (
    <motion.div
      className="bg-white p-6 rounded-2xl shadow-lg space-y-6"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-800 tracking-wide">
          Gestion des Commissions
        </h1>
        <button
          onClick={() => exportCommissionsCSV(commissions)}
          className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 px-4 py-2 rounded-lg font-semibold shadow transition"
        >
          <FaFileCsv /> Exporter CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 text-sm">
        <input
          type="text"
          placeholder="Filtrer par parrain"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="border-gray-300 border p-2 rounded-lg focus:ring-2 focus:ring-blue-300 focus:outline-none"
        />
        <select
          value={filterPaid}
          onChange={(e) => setFilterPaid(e.target.value)}
          className="border-gray-300 border p-2 rounded-lg focus:ring-2 focus:ring-blue-300 focus:outline-none"
        >
          <option value="">Toutes</option>
          <option value="true">Payées</option>
          <option value="false">En attente</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-blue-50 text-gray-800">
            <tr>
              <th className="p-3 border text-left">Parrain</th>
              <th className="p-3 border text-left">Total Référés</th>
              <th className="p-3 border text-left">Total Commissions</th>
              <th className="p-3 border text-left">Total Payés</th>
              <th className="p-3 border text-left">Balance Restante</th>
            </tr>
          </thead>
          <tbody>
            {filteredReferrers.length > 0 ? (
              filteredReferrers.map((rid) => {
                const userName = profiles[rid] || "Utilisateur inconnu";
                const items = grouped[rid] || [];

                // 🧩 Keep only active / usable commission rows
                const activeItems = items.filter(
                  (c) =>
                    !["reversed", "cancelled"].includes(
                      (c.status || "").toLowerCase()
                    ) && Number(c.amount) > 0
                );

                const totalCom = activeItems.reduce(
                  (s, c) => s + Number(c.amount || 0),
                  0
                );

                // ✅ Remaining in DB already excludes boutique usage
                const totalRemaining = activeItems.reduce(
                  (s, c) => s + Number(c.remaining_amount || 0),
                  0
                );

                // ✅ Cash-out requests (for reference)
                const totalPaid = (requests || [])
                  .filter(
                    (r) =>
                      r.referrer_user_id === rid &&
                      ["paid", "completed"].includes(
                        (r.status || "").toLowerCase()
                      )
                  )
                  .reduce((sum, r) => sum + Number(r.amount_paid || 0), 0);

                // ✅ final balance = what DB says remains (no extra subtraction)
                const balance = Math.max(0, totalRemaining);

                const expandedState = expanded[rid];

                console.log("➡️ Computing totals for:", userName, {
                  totalCom,
                  totalRemaining,
                  totalPaid,
                  balance,
                  items: activeItems.map((i) => ({
                    id: i.id,
                    amount: i.amount,
                    remaining_amount: i.remaining_amount,
                    status: i.status,
                  })),
                });

                return (
                  <React.Fragment key={rid}>
                    <motion.tr
                      onClick={() => toggleExpand(rid)}
                      className="hover:bg-gray-50 cursor-pointer border-t"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <td className="p-3 border flex items-center gap-2">
                        {expandedState ? (
                          <FaChevronDown className="text-gray-500" />
                        ) : (
                          <FaChevronRight className="text-gray-500" />
                        )}
                        <span className="font-semibold text-gray-800">
                          {userName}
                        </span>
                      </td>
                      <td className="p-3 border">{activeItems.length}</td>
                      <td className="p-3 border">
                        {formatCurrencyUSD(totalCom)}
                      </td>
                      <td className="p-3 border text-green-600">
                        {formatCurrencyUSD(totalPaid)}
                      </td>
                      <td
                        className={`p-3 border font-medium ${
                          balance > 0 ? "text-yellow-600" : "text-gray-600"
                        }`}
                      >
                        {formatCurrencyUSD(balance)}
                      </td>
                    </motion.tr>

                    {expandedState && (
                      <tr>
                        <td colSpan="5" className="bg-gray-50">
                          <div className="p-3 space-y-2">
                            <p className="font-semibold text-gray-600 mb-1">
                              Référés par {userName} :
                            </p>
                            <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {activeItems.map((r) => (
                                <li
                                  key={r.id}
                                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1 shadow-sm"
                                >
                                  <span className="text-gray-800 font-medium">
                                    {profiles[r.referred_user_id] || "Inconnu"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              !loading && (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-gray-500">
                    Aucune commission trouvée.
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
