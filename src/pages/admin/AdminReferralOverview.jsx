import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import { FaUsers, FaLink } from "react-icons/fa";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";

export default function AdminReferralOverview({ onSelect }) {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // ✅ Fetch only main profiles (no parent_id)
        const { data: profiles } = await supabase
          .from("profiles_with_unpaid")
          .select("id, full_name, email, referral_code, created_at, parent_id")
          .is("parent_id", null) // 🟢 exclude children
          .not("referral_code", "is", null)
          .neq("referral_code", "");

        const { data: refs } = await supabase
          .from("referrals")
          .select("referrer_user_id, referred_user_id, created_at");

        let comms = [];
        try {
          const { data: c } = await supabase
            .from("commissions")
            .select("referrer_user_id, amount");
          comms = c || [];
        } catch {}

        const joined = (profiles || []).map((p) => {
          const referred = (refs || []).filter((r) => r.referrer_user_id === p.id);
          const totalReferred = referred.length;
          const totalCommission = (comms || [])
            .filter((c) => c.referrer_user_id === p.id)
            .reduce((sum, c) => sum + Number(c.amount || 0), 0);
          const lastReferral = referred.length
            ? referred
                .map((r) => r.created_at)
                .sort((a, b) => new Date(b) - new Date(a))[0]
            : null;

          return {
            referrerId: p.id,
            code: p.referral_code,
            ownerName: p.full_name || "—",
            email: p.email || "—",
            totalReferred,
            totalCommission,
            lastReferral,
            createdAt: p.created_at,
          };
        });

        setReferrals(joined);
      } catch (err) {
        console.error("Erreur chargement referrals:", err);
      }
      setLoading(false);
    })();
  }, []);

  const filteredReferrals = useMemo(() => {
    return referrals.filter(
      (r) =>
        r.ownerName.toLowerCase().includes(search.toLowerCase()) ||
        r.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, referrals]);

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-4">
        <input
          type="text"
          placeholder="Rechercher par nom ou code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border px-4 py-2 rounded-lg w-64 shadow-sm focus:ring-2 focus:ring-teal-400"
        />
        <div className="text-gray-600 text-sm">
          Total: {filteredReferrals.length} parrains
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md overflow-x-auto">
        <table className="table-auto min-w-max border-collapse w-full">
          <thead className="bg-aquaBlue text-white">
            <tr>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Propriétaire</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Filleuls</th>
              <th className="px-4 py-3 text-left">Commissions</th>
              <th className="px-4 py-3 text-left">Dernier filleul</th>
              <th className="px-4 py-3 text-left">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-6 text-gray-500">
                  Chargement...
                </td>
              </tr>
            ) : filteredReferrals.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-6 text-gray-500">
                  Aucun parrain trouvé.
                </td>
              </tr>
            ) : (
              filteredReferrals.map((r, idx) => (
                <tr
                  key={idx}
                  className="border-b hover:bg-gray-50 transition duration-100 cursor-pointer"
                  onClick={() => onSelect?.(r.referrerId)}
                >
                  <td className="px-4 py-3 font-medium text-blue-700">
                    <div className="flex items-center gap-2">
                      <FaLink className="text-blue-400" /> {r.code}
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.ownerName}</td>
                  <td className="px-4 py-3 text-gray-700">{r.email}</td>
                  <td className="px-4 py-3 text-center text-gray-800 font-semibold">
                    <FaUsers className="inline mr-1 text-teal-500" />
                    {r.totalReferred}
                  </td>
                  <td className="px-4 py-3 font-medium text-green-600">
                    {r.totalCommission
                      ? formatCurrencyUSD(r.totalCommission)
                      : "$0.00"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.lastReferral ? formatDateFrSafe(r.lastReferral) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDateFrSafe(r.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
