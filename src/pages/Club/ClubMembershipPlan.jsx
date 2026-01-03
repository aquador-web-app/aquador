// src/pages/Club/ClubMembershipPlan.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function ClubMembershipPlan({ selectedPlan, setSelectedPlan }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadPlans() {
      setErr("");
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from("club_membership_plans")
          .select(`
            id,
            code,
            label,
            base_price_usd,
            couple_price_usd,
            description,
            sort_order,

            price_rules:club_price_rules (
              id,
              min_age,
              max_age,
              monthly_fee_usd,
              label,
              sort_order
            ),

            advantages:club_membership_plan_advantages (
              id,
              label,
              sort_order
            )
          `)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (error) throw error;

        const normalized =
          (data || []).map((p) => ({
            id: p.id,
            code: p.code,
            label: p.label,
            description: p.description || "",
            base_price_usd: Number(p.base_price_usd || 0),
            couple_price_usd:
              p.couple_price_usd != null ? Number(p.couple_price_usd) : null,

            price_rules: (p.price_rules || []).sort(
              (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
            ),

            advantages: (p.advantages || []).sort(
              (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
            ),
          })) || [];

        if (isMounted) {
          setPlans(normalized);
          setLoading(false);
        }
      } catch (e) {
        console.error("❌ loadPlans error:", e);
        if (isMounted) {
          setErr("Erreur lors du chargement des plans.");
          setLoading(false);
        }
      }
    }

    loadPlans();
    return () => {
      isMounted = false;
    };
  }, []);

  function handleSelect(plan) {
    setSelectedPlan(plan);
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-3">Choisissez votre plan de membership</h2>

      {loading && <p className="text-gray-600 text-sm">Chargement des plans...</p>}
      {err && <p className="text-red-600 text-sm mb-2">{err}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((plan) => {
          const isSelected = selectedPlan?.id === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => handleSelect(plan)}
              className={`text-left border rounded-2xl p-4 shadow-sm transition hover:shadow-md ${
                isSelected
                  ? "border-blue-600 ring-2 ring-blue-300 bg-blue-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-semibold">
                  {plan.label} ({plan.code})
                </h3>
                <span className="text-sm font-bold text-blue-700">
                  USD {plan.base_price_usd.toFixed(2)}/mois
                </span>
              </div>

              {plan.couple_price_usd != null && (
                <p className="text-xs text-gray-600 mb-1">
                  Couple marié :
                  <strong> USD {plan.couple_price_usd.toFixed(2)}/mois</strong>
                </p>
              )}

              {plan.description && (
                <p className="text-sm text-gray-700 mb-2">{plan.description}</p>
              )}

              {plan.advantages?.length > 0 && (
                <ul className="list-disc list-inside text-xs text-gray-700 space-y-1">
                  {plan.advantages.map((adv) => (
                    <li key={adv.id}>{adv.label}</li>
                  ))}
                </ul>
              )}

              {/* 🔶 CHILD PRICE RULES TABLE — ALWAYS VISIBLE IF PLAN HAS RULES */}
{plan.price_rules?.length > 0 && (
  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
    <p className="text-xs font-semibold text-amber-700 mb-2">
      Tarifs enfants selon l’âge
    </p>

    <table className="w-full text-xs border rounded overflow-hidden">
      <thead className="bg-amber-100 text-gray-700">
        <tr>
          <th className="px-2 py-1 border text-center">Âge</th>
          <th className="px-2 py-1 border text-center">USD / mois</th>
        </tr>
      </thead>

      <tbody>
        {plan.price_rules.map((rule) => (
          <tr key={rule.id}>
            <td className="px-2 py-1 border text-center">
              {rule.min_age} – {rule.max_age} ans
            </td>
            <td className="px-2 py-1 border text-center font-semibold">
              {Number(rule.monthly_fee_usd).toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}


              {isSelected && (
                <p className="mt-3 text-xs font-semibold text-blue-700">
                  ✅ Plan sélectionné
                </p>
              )}
            </button>
          );
        })}
      </div>

      {selectedPlan && (
        <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm">
          <p className="font-semibold mb-1">Récapitulatif de votre sélection :</p>
          <p>
            Plan <strong>{selectedPlan.label}</strong> –{" "}
            <strong>USD {selectedPlan.base_price_usd.toFixed(2)}/mois</strong>
          </p>
        </div>
      )}
    </div>
  );
}
