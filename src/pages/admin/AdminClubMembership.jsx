// src/pages/admin/AdminClubMembership.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

function numberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export default function AdminClubMembership() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setErr("");
    setSuccess("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("club_membership_plans")
        .select(`
          id,
          code,
          name,
          label,
          base_price_usd,
          couple_price_usd,
          description,
          is_active,
          sort_order,
          advantages:club_membership_plan_advantages (
            id,
            label,
            sort_order
          ),
          price_rules:club_price_rules (
            id,
            min_age,
            max_age,
            monthly_fee_usd,
            label,
            sort_order
          )
        `)
        .order("sort_order", { ascending: true });

      if (error) {
        console.error(error);
        setErr("Erreur lors du chargement des plans.");
        setLoading(false);
        return;
      }

      const normalized =
        (data || []).map((p) => ({
          ...p,
          base_price_usd: numberOrNull(p.base_price_usd),
          couple_price_usd: numberOrNull(p.couple_price_usd),
          advantages: (p.advantages || []).sort(
            (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
          ),
          price_rules: (p.price_rules || []).sort(
            (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
          ),
          _open: false,
        })) || [];

      setPlans(normalized);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setErr("Erreur inattendue.");
      setLoading(false);
    }
  }

  function updateLocalPlan(id, patch) {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  }

  async function savePlan(plan) {
    setErr("");
    setSuccess("");
    setSaving(true);
    try {
      const payload = {
        code: plan.code,
        name: plan.name,
        label: plan.label || plan.name,
        base_price_usd: numberOrNull(plan.base_price_usd),
        couple_price_usd: numberOrNull(plan.couple_price_usd),
        description: plan.description || null,
        is_active: !!plan.is_active,
        sort_order: plan.sort_order ?? 100,
      };

      const { error } = await supabase
        .from("club_membership_plans")
        .update(payload)
        .eq("id", plan.id);

      if (error) {
        console.error(error);
        setErr("Erreur lors de l’enregistrement du plan.");
      } else {
        setSuccess("Plan enregistré.");
        await loadAll();
      }
    } catch (e) {
      console.error(e);
      setErr("Erreur inattendue lors de l’enregistrement du plan.");
    } finally {
      setSaving(false);
    }
  }

  async function addAdvantage(planId) {
    setErr("");
    setSuccess("");
    try {
      const { data, error } = await supabase
        .from("club_membership_plan_advantages")
        .insert({
          plan_id: planId,
          label: "Nouvel avantage",
          sort_order: 100,
        })
        .select("*")
        .single();

      if (error) {
        console.error(error);
        setErr("Erreur lors de l’ajout de l’avantage.");
        return;
      }

      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId
            ? {
                ...p,
                advantages: [...(p.advantages || []), data].sort(
                  (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
                ),
              }
            : p
        )
      );
      setSuccess("Avantage ajouté.");
    } catch (e) {
      console.error(e);
      setErr("Erreur inattendue lors de l’ajout de l’avantage.");
    }
  }

  async function updateAdvantage(adv) {
    setErr("");
    setSuccess("");
    try {
      const { error } = await supabase
        .from("club_membership_plan_advantages")
        .update({
          label: adv.label,
          sort_order: adv.sort_order ?? 100,
        })
        .eq("id", adv.id);

      if (error) {
        console.error(error);
        setErr("Erreur lors de la mise à jour de l’avantage.");
        return;
      }
      setSuccess("Avantage enregistré.");
    } catch (e) {
      console.error(e);
      setErr("Erreur inattendue lors de la mise à jour de l’avantage.");
    }
  }

  async function deleteAdvantage(planId, advId) {
    if (!window.confirm("Supprimer cet avantage ?")) return;
    setErr("");
    setSuccess("");
    try {
      const { error } = await supabase
        .from("club_membership_plan_advantages")
        .delete()
        .eq("id", advId);

      if (error) {
        console.error(error);
        setErr("Erreur lors de la suppression de l’avantage.");
        return;
      }

      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId
            ? {
                ...p,
                advantages: (p.advantages || []).filter((a) => a.id !== advId),
              }
            : p
        )
      );
      setSuccess("Avantage supprimé.");
    } catch (e) {
      console.error(e);
      setErr("Erreur inattendue lors de la suppression de l’avantage.");
    }
  }

  async function addRule(planId) {
    setErr("");
    setSuccess("");
    try {
      const { data, error } = await supabase
        .from("club_price_rules")
        .insert({
          plan_id: planId,
          min_age: 0,
          max_age: 0,
          monthly_fee_usd: 0,
          label: "Nouvelle règle",
          sort_order: 100,
        })
        .select("*")
        .single();

      if (error) {
        console.error(error);
        setErr("Erreur lors de l’ajout de la règle.");
        return;
      }

      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId
            ? {
                ...p,
                price_rules: [...(p.price_rules || []), data].sort(
                  (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
                ),
              }
            : p
        )
      );
      setSuccess("Règle ajoutée.");
    } catch (e) {
      console.error(e);
      setErr("Erreur inattendue lors de l’ajout de la règle.");
    }
  }

  async function updateRule(rule) {
    setErr("");
    setSuccess("");
    try {
      const payload = {
        label: rule.label,
        min_age: Number(rule.min_age ?? 0),
        max_age: Number(rule.max_age ?? 0),
        monthly_fee_usd: numberOrNull(rule.monthly_fee_usd) ?? 0,
        sort_order: rule.sort_order ?? 100,
      };

      const { error } = await supabase
        .from("club_price_rules")
        .update(payload)
        .eq("id", rule.id);

      if (error) {
        console.error(error);
        setErr("Erreur lors de la mise à jour de la règle.");
        return;
      }
      setSuccess("Règle enregistrée.");
    } catch (e) {
      console.error(e);
      setErr("Erreur inattendue lors de la mise à jour de la règle.");
    }
  }

  async function deleteRule(planId, ruleId) {
    if (!window.confirm("Supprimer cette règle ?")) return;
    setErr("");
    setSuccess("");
    try {
      const { error } = await supabase
        .from("club_price_rules")
        .delete()
        .eq("id", ruleId);

      if (error) {
        console.error(error);
        setErr("Erreur lors de la suppression de la règle.");
        return;
      }

      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId
            ? {
                ...p,
                price_rules: (p.price_rules || []).filter(
                  (r) => r.id !== ruleId
                ),
              }
            : p
        )
      );
      setSuccess("Règle supprimée.");
    } catch (e) {
      console.error(e);
      setErr("Erreur inattendue lors de la suppression de la règle.");
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        Club – Plans, avantages & règles d’âge (modifiables)
      </h1>

      {loading && <p>Chargement...</p>}

      {err && (
        <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {err}
        </div>
      )}
      {success && (
        <div className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {success}
        </div>
      )}

      {!loading &&
        plans.map((plan) => (
          <div
            key={plan.id}
            className="mb-6 border rounded-2xl bg-white shadow-sm"
          >
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() =>
                updateLocalPlan(plan.id, { _open: !plan._open })
              }
            >
              <div>
                <div className="font-semibold text-lg">
                  {plan.name} ({plan.code})
                </div>
                <div className="text-xs text-gray-500">
                  ID: {plan.id.slice(0, 8)} – ordre: {plan.sort_order}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    plan.is_active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {plan.is_active ? "Actif" : "Inactif"}
                </span>
                <span>{plan._open ? "▲" : "▼"}</span>
              </div>
            </button>

            {plan._open && (
              <div className="border-t px-4 py-4 space-y-6">
                {/* ------------------------------ */}
                {/* 🔵 BASE PRICES */}
                {/* ------------------------------ */}
                <div>
                  <h2 className="font-semibold mb-2 text-blue-700">
                    Prix mensuels (Plan principal)
                  </h2>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Prix single (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={plan.base_price_usd ?? ""}
                        onChange={(e) =>
                          updateLocalPlan(plan.id, {
                            base_price_usd: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="label">Prix couple (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={plan.couple_price_usd ?? ""}
                        onChange={(e) =>
                          updateLocalPlan(plan.id, {
                            couple_price_usd: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="label">Description</label>
                    <textarea
                      className="input min-h-[70px]"
                      value={plan.description || ""}
                      onChange={(e) =>
                        updateLocalPlan(plan.id, {
                          description: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <input
                      id={`active-${plan.id}`}
                      type="checkbox"
                      checked={!!plan.is_active}
                      onChange={(e) =>
                        updateLocalPlan(plan.id, {
                          is_active: e.target.checked,
                        })
                      }
                    />
                    <label
                      htmlFor={`active-${plan.id}`}
                      className="text-sm text-gray-700"
                    >
                      Plan actif
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => savePlan(plan)}
                  disabled={saving}
                  className="mt-2 inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:opacity-60"
                >
                  {saving ? "Enregistrement..." : "Enregistrer le plan"}
                </button>

                {/* ------------------------------ */}
                {/* 🟣 ADVANTAGES */}
                {/* ------------------------------ */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm text-purple-700">
                      Avantages ( {plan.advantages?.length || 0} )
                    </h3>
                    <button
                      type="button"
                      onClick={() => addAdvantage(plan.id)}
                      className="text-xs px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      + Ajouter un avantage
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(plan.advantages || []).map((adv) => (
                      <div
                        key={adv.id}
                        className="flex flex-col md:flex-row gap-2 items-start md:items-center border rounded-md px-3 py-2"
                      >
                        <input
                          type="number"
                          className="w-20 border rounded-md px-2 py-1 text-xs"
                          value={adv.sort_order ?? ""}
                          onChange={(e) => {
                            const newVal =
                              e.target.value === ""
                                ? null
                                : Number(e.target.value);
                            setPlans((prev) =>
                              prev.map((p) =>
                                p.id === plan.id
                                  ? {
                                      ...p,
                                      advantages: p.advantages.map((a) =>
                                        a.id === adv.id
                                          ? { ...a, sort_order: newVal }
                                          : a
                                      ),
                                    }
                                  : p
                              )
                            );
                          }}
                          onBlur={() => updateAdvantage(adv)}
                        />

                        <input
                          className="flex-1 border rounded-md px-2 py-1 text-sm"
                          value={adv.label || ""}
                          onChange={(e) => {
                            const txt = e.target.value;
                            setPlans((prev) =>
                              prev.map((p) =>
                                p.id === plan.id
                                  ? {
                                      ...p,
                                      advantages: p.advantages.map((a) =>
                                        a.id === adv.id
                                          ? { ...a, label: txt }
                                          : a
                                      ),
                                    }
                                  : p
                              )
                            );
                          }}
                          onBlur={() => updateAdvantage(adv)}
                        />

                        <button
                          type="button"
                          onClick={() => deleteAdvantage(plan.id, adv.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Supprimer
                        </button>
                      </div>
                    ))}

                    {!plan.advantages?.length && (
                      <p className="text-xs text-gray-500">
                        Aucun avantage défini.
                      </p>
                    )}
                  </div>
                </div>

                {/* ------------------------------ */}
                {/* 🟠 AGE RULES / ADD-ON PRICES */}
                {/* ------------------------------ */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-orange-700">
                      Tarifs d'ajout (par âge)
                    </h3>
                    <button
                      type="button"
                      onClick={() => addRule(plan.id)}
                      className="text-xs px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-500"
                    >
                      + Ajouter une règle
                    </button>
                  </div>

                  <p className="text-xs text-gray-600 mb-2">
                    Modifiez ici les frais pour ajouter un membre selon sa
                    tranche d’âge. Ces valeurs déterminent automatiquement les
                    prix sur le formulaire d'inscription.
                  </p>

                  {/* Group UI */}
                  <div className="space-y-3">
                    {(plan.price_rules || []).map((rule) => (
                      <div
                        key={rule.id}
                        className="grid grid-cols-1 md:grid-cols-5 gap-2 border rounded-md px-3 py-2 items-center bg-orange-50"
                      >
                        <input
                          type="number"
                          className="border rounded-md px-2 py-1 text-xs"
                          value={rule.min_age ?? ""}
                          onChange={(e) => {
                            const val =
                              e.target.value === ""
                                ? null
                                : Number(e.target.value);
                            setPlans((prev) =>
                              prev.map((p) =>
                                p.id === plan.id
                                  ? {
                                      ...p,
                                      price_rules: p.price_rules.map((r) =>
                                        r.id === rule.id
                                          ? { ...r, min_age: val }
                                          : r
                                      ),
                                    }
                                  : p
                              )
                            );
                          }}
                          onBlur={() => updateRule(rule)}
                          placeholder="Âge min"
                        />

                        <input
                          type="number"
                          className="border rounded-md px-2 py-1 text-xs"
                          value={rule.max_age ?? ""}
                          onChange={(e) => {
                            const val =
                              e.target.value === ""
                                ? null
                                : Number(e.target.value);
                            setPlans((prev) =>
                              prev.map((p) =>
                                p.id === plan.id
                                  ? {
                                      ...p,
                                      price_rules: p.price_rules.map((r) =>
                                        r.id === rule.id
                                          ? { ...r, max_age: val }
                                          : r
                                      ),
                                    }
                                  : p
                              )
                            );
                          }}
                          onBlur={() => updateRule(rule)}
                          placeholder="Âge max"
                        />

                        <input
                          type="number"
                          step="0.01"
                          className="border rounded-md px-2 py-1 text-xs"
                          value={rule.monthly_fee_usd ?? ""}
                          onChange={(e) => {
                            const val =
                              e.target.value === ""
                                ? null
                                : Number(e.target.value);
                            setPlans((prev) =>
                              prev.map((p) =>
                                p.id === plan.id
                                  ? {
                                      ...p,
                                      price_rules: p.price_rules.map((r) =>
                                        r.id === rule.id
                                          ? { ...r, monthly_fee_usd: val }
                                          : r
                                      ),
                                    }
                                  : p
                              )
                            );
                          }}
                          onBlur={() => updateRule(rule)}
                          placeholder="USD/mois"
                        />

                        <input
                          className="border rounded-md px-2 py-1 text-xs"
                          value={rule.label || ""}
                          onChange={(e) => {
                            const txt = e.target.value;
                            setPlans((prev) =>
                              prev.map((p) =>
                                p.id === plan.id
                                  ? {
                                      ...p,
                                      price_rules: p.price_rules.map((r) =>
                                        r.id === rule.id
                                          ? { ...r, label: txt }
                                          : r
                                      ),
                                    }
                                  : p
                              )
                            );
                          }}
                          onBlur={() => updateRule(rule)}
                          placeholder="Label"
                        />

                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="number"
                            className="border rounded-md px-2 py-1 text-xs w-20"
                            value={rule.sort_order ?? ""}
                            onChange={(e) => {
                              const val =
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value);
                              setPlans((prev) =>
                                prev.map((p) =>
                                  p.id === plan.id
                                    ? {
                                        ...p,
                                        price_rules: p.price_rules.map(
                                          (r) =>
                                            r.id === rule.id
                                              ? { ...r, sort_order: val }
                                              : r
                                        ),
                                      }
                                    : p
                                )
                              );
                            }}
                            onBlur={() => updateRule(rule)}
                          />

                          <button
                            type="button"
                            onClick={() => deleteRule(plan.id, rule.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))}

                    {!plan.price_rules?.length && (
                      <p className="text-xs text-gray-500">
                        Aucune règle d’âge définie pour ce plan.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
