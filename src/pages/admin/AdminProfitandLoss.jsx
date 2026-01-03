// src/pages/admin/AdminProfitAndLoss.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  formatCurrencyUSD,
  formatCurrencyHTG,
  formatDateFrSafe,
  formatMonth,
} from "../../lib/dateUtils";

if (typeof window !== "undefined") {
  window.addEventListener("submit", (e) => e.preventDefault());
}

export default function AdminProfitAndLoss() {
  const [activeTab, setActiveTab] = useState("income");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingExpense, setEditingExpense] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Enter") e.preventDefault(); };
    window.addEventListener("keydown", handler);

    const stopFormSubmit = (e) => e.preventDefault();
    document.addEventListener("submit", stopFormSubmit);

    const stopNav = (e) => {
      if (e.target.tagName === "INPUT" &&
        (e.target.type === "date" || e.target.type === "month")
      ) {
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", stopNav);
    window.addEventListener("popstate", stopNav);

    return () => {
      window.removeEventListener("keydown", handler);
      document.removeEventListener("submit", stopFormSubmit);
      window.removeEventListener("beforeunload", stopNav);
      window.removeEventListener("popstate", stopNav);
    };
  }, []);

  const [incomes, setIncomes] = useState({
    natation: {
      inscription: [],
      plan: [],
      reintegration: [],
      adhesion: [],
      boutique: [],
    },
    club: { memberships: [], location: [], daypass: [] },
  });

  const [expenses, setExpenses] = useState({
    salaires: [],
    fonctionnement: [],
    commissions: [],
  });

  const [period, setPeriod] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });
  const [rate, setRate] = useState(132.0);

  const [newExpense, setNewExpense] = useState({
    description: "",
    category: "",
    amount: "",
    currency: "USD",
    date: new Date().toISOString().split("T")[0],
  });

  const [report, setReport] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 300);
    return () => clearTimeout(timer);
  }, [period.start, period.end]);

  async function fetchData() {
    setLoading(true);
    setError("");

    try {
      const selectedMonth = period.start.slice(0, 7);

      // === INVOICES (BY MONTH) ===
      const { data: invoices } = await supabase
        .from("invoices")
        .select(
          "id, status, paid_total, description1, amount1, description2, amount2, description3, amount3, description4, amount4, month"
        )
        .gte("month", period.start)
        .lte("month", period.end);

      // === BOUTIQUE (BY DATE RANGE) ===
      const { data: boutique } = await supabase
        .from("boutique_invoices")
        .select("id, total, paid_total, status, created_at")
        .gte("created_at", period.start)
        .lte("created_at", period.end);

      // === MANUAL EXPENSES ===
      const { data: manualExp } = await supabase
        .from("expenses")
        .select("id, description, category, amount, currency, date")
        .gte("date", period.start)
        .lte("date", period.end);

      // === COMMISSIONS (BY processed_at) ===
      const { data: commissions } = await supabase
        .from("commission_requests")
        .select("id, amount_paid, processed_at")
        .gte("processed_at", period.start)
        .lte("processed_at", period.end);

      // === ADMIN SALARIES (BY month_paid OR date_paid) ===
      const { data: adminSalaries } = await supabase
        .from("admin_salaries")
        .select("id, full_name, net_salary, period_month")
        .gte("period_month", period.start)
        .lte("period_month", period.end);

      // === FORMAT ADMIN SALARIES AS EXPENSES ===
      const formattedSalaries = (adminSalaries || []).map((s) => ({
        id: s.id,
        description: `Salaire - ${s.full_name}`,
        category: "Salaires",
        amount: Number(s.net_salary || 0),
        currency: "HTG",
        date: s.period_month,
        isSalary: true, // special flag
      }));



      // === REBUILD NATATION INCOME ===
      const nat = {
        inscription: [],
        plan: [],
        reintegration: [],
        adhesion: [],
        boutique: [],
      };

      const isPayable = (inv) =>
        Number(inv.amount1 || 0) > 0 ||
        Number(inv.amount2 || 0) > 0 ||
        Number(inv.amount3 || 0) > 0 ||
        Number(inv.amount4 || 0) > 0 ||
        Number(inv.paid_total || 0) > 0;

      (invoices || [])
        .filter((i) => isPayable(i))
        .forEach((i) => {
          if (i.amount1 > 0)
            nat.inscription.push({
              desc: i.description1 || "Frais d'inscription",
              amount: Number(i.amount1),
              date: i.month,
            });
          if (i.amount2 > 0)
            nat.plan.push({
              desc: i.description2 || "Plan",
              amount: Number(i.amount2),
              date: i.month,
            });
          if (i.amount3 > 0)
            nat.reintegration.push({
              desc: i.description3 || "Frais de réintégration",
              amount: Number(i.amount3),
              date: i.month,
            });
          if (i.amount4 > 0)
            nat.adhesion.push({
              desc: i.description4 || "Frais d’adhésion annuels",
              amount: Number(i.amount4),
              date: i.month,
            });
        });

      // === BOUTIQUE INCOME ===
      (boutique || [])
        .filter((b) => Number(b.paid_total || 0) > 0)
        .forEach((b) =>
          nat.boutique.push({
            desc: "Vente Boutique",
            amount: Number(b.paid_total),
            date: b.month || b.created_at,
          })
        );

      // === COMMISSIONS FORMAT ===
      const formattedCommissions = (commissions || []).map((c) => ({
        description: "Commission payée",
        amount: Number(c.amount_paid || 0),
        currency: "USD",
        date: c.processed_at,
      }));

      setIncomes({ natation: nat, club: { memberships: [], location: [], daypass: [] } });
      setExpenses({
        salaires: formattedSalaries, // optional separate category
        fonctionnement: [...formattedSalaries, ...(manualExp || [])],
        commissions: formattedCommissions,
      });

    } catch (err) {
      console.error("Error loading P&L:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const sum = (arr) => arr.reduce((t, a) => t + Number(a.amount || 0), 0);
  const expenseToHTG = (exp, rate) =>
  exp.currency === "USD" ? exp.amount * rate : exp.amount;


  const totalNat =
    sum(incomes.natation.inscription) +
    sum(incomes.natation.plan) +
    sum(incomes.natation.reintegration) +
    sum(incomes.natation.adhesion) +
    sum(incomes.natation.boutique);

  const totalClub =
    sum(incomes.club.memberships) +
    sum(incomes.club.location) +
    sum(incomes.club.daypass);

  const totalIncomes = totalNat + totalClub;

  const totalExpensesHTG =
  expenses.fonctionnement.reduce((t, e) => t + expenseToHTG(e, rate), 0) +
  expenses.commissions.reduce((t, e) => t + expenseToHTG(e, rate), 0) +
  expenses.salaires.reduce((t, e) => t + expenseToHTG(e, rate), 0);


  const net = totalIncomes - (totalExpensesHTG / rate);


function generateReport() {
  // 1. Compute summary report (same logic but fixed)
  const netHTG = totalIncomes * rate - totalExpensesHTG;

  const reportObj = {
  totalIncomes,                    // in USD
  totalIncomesHTG: totalIncomes * rate,

  totalExpensesUSD: totalExpensesHTG / rate,
  totalExpensesHTG,

  netUSD: totalIncomes - (totalExpensesHTG / rate),
  netHTG: totalIncomes * rate - totalExpensesHTG,
};


  setReport(reportObj);

  // 2. Build CSV rows
  const rows = [];
  const rateLocal = rate;

  const pushRow = (category, description, usd, htg, date) => {
    rows.push({
      catégorie: category,
      description,
      montant_usd: usd,
      montant_htg: htg,
      date,
    });
  };

  // === NATATION INCOMES ===
  const nat = incomes.natation;
  const buildIncome = (label, arr) => {
    arr.forEach((item) => {
      const usd = item.currency === "HTG" ? item.amount / rateLocal : item.amount;
      const htg = item.currency === "HTG" ? item.amount : item.amount * rateLocal;

      pushRow(`Income - ${label}`, item.desc, usd, htg, item.date);
    });
  };

  buildIncome("Inscription", nat.inscription);
  buildIncome("Plan", nat.plan);
  buildIncome("Réintégration", nat.reintegration);
  buildIncome("Adhésion Annuelle", nat.adhesion);
  buildIncome("Boutique", nat.boutique);

  // === EXPENSES (manual + salaries) ===
  expenses.fonctionnement.forEach((e) => {
    const usd = e.currency === "USD" ? e.amount : e.amount / rateLocal;
    const htg = e.currency === "USD" ? e.amount * rateLocal : e.amount;

    pushRow(
      `Expense - ${e.category || "Autres"}`,
      e.description,
      usd,
      htg,
      e.date
    );
  });

  // === COMMISSIONS ===
  expenses.commissions.forEach((c) => {
    pushRow(
      "Expense - Commissions",
      c.description,
      c.amount,
      c.amount * rateLocal,
      c.date
    );
  });

  // 3. Convert to CSV
  if (rows.length === 0) {
    alert("Aucune donnée à exporter.");
    return;
  }

  const header = Object.keys(rows[0]).join(",");
  const csv = [
    header,
    ...rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(",")),
  ].join("\n");

  // 4. Download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute(
    "download",
    `AQUADOR_PNL_${period.start}_to_${period.end}.csv`
  );

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}



  async function addExpense(e) {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) {
      alert("Veuillez remplir la description et le montant.");
      return;
    }

    const { error } = await supabase.from("expenses").insert([{
      description: newExpense.description,
      category: newExpense.category,
      amount: Number(newExpense.amount),
      currency: newExpense.currency,
      date: newExpense.date,
    }]);

    if (error) {
      alert("Erreur : " + error.message);
    } else {
      alert("✅ Dépense ajoutée !");
      setNewExpense({
        description: "",
        category: "",
        amount: "",
        currency: "USD",
        date: new Date().toISOString().split("T")[0],
      });
      fetchData();
    }
  }

  async function updateExpense(id, updates) {
    const { error } = await supabase
      .from("expenses")
      .update(updates)
      .eq("id", id);

    if (error) alert("Erreur : " + error.message);
    else {
      setEditingExpense(null);
      fetchData();
    }
  }

  async function deleteExpense(id) {
    if (!confirm("Supprimer cette dépense ?")) return;

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) alert("Erreur : " + error.message);
    else fetchData();
  }

  if (loading)
    return <div className="p-6 text-center text-gray-500">Chargement…</div>;

  if (error)
    return (
      <div className="p-6 text-center text-red-600 font-semibold">
        Erreur : {error}
      </div>
    );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-center text-aquaBlue mb-6">
        📊 Profit & Perte – A'QUA D'OR
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap justify-center gap-3 mb-6 items-center">
        <label>Début</label>
        <input
          type="date"
          value={period.start}
          onChange={(e) =>
            setPeriod((prev) => ({ ...prev, start: e.target.value }))
          }
          className="border rounded px-2 py-1"
        />
        <label>Fin</label>
        <input
          type="date"
          value={period.end}
          onChange={(e) =>
            setPeriod((prev) => ({ ...prev, end: e.target.value }))
          }
          className="border rounded px-2 py-1"
        />
        <label>Taux (HTG/USD)</label>
        <input
          type="number"
          value={rate}
          onChange={(e) => setRate(parseFloat(e.target.value || 0))}
          step="0.5"
          className="border rounded px-2 py-1 w-24"
        />
        <button
          type="button"
          onClick={generateReport}
          className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-4 py-2 rounded"
        >
          Générer Rapport
        </button>
      </div>

      {/* Summary */}
      {report && (
        <div className="text-center mb-6 bg-gray-50 border rounded p-4 shadow">
          <h3 className="text-lg font-semibold mb-2">Résumé du rapport</h3>

          <p className="text-green-600 font-semibold">
            Rentrées : {formatCurrencyUSD(report.totalIncomes)} (
            {formatCurrencyHTG(report.totalIncomesHTG)})
          </p>

          <p className="text-red-600 font-semibold">
            Dépenses : {formatCurrencyUSD(report.totalExpensesUSD)} (
            {formatCurrencyHTG(report.totalExpensesHTG)})
          </p>

          <p
            className={`text-lg font-bold ${
              report.netUSD >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            Résultat Net : {formatCurrencyUSD(report.netUSD)} (
            {formatCurrencyHTG(report.netHTG)})
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex justify-center gap-4 mb-6">
        <button
          onClick={() => setActiveTab("income")}
          className={`px-4 py-2 rounded-md font-semibold ${
            activeTab === "income"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800"
          }`}
        >
          💰 Entrées
        </button>
        <button
          onClick={() => setActiveTab("expenses")}
          className={`px-4 py-2 rounded-md font-semibold ${
            activeTab === "expenses"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800"
          }`}
        >
          💸 Dépenses
        </button>
      </div>

      {/* === INCOME === */}
      {activeTab === "income" && (
        <div className="space-y-6">
          <Section title="🏫 École de Natation">
            {renderCategory("Frais d'inscription", incomes.natation.inscription, rate)}
            {renderCategory("Plan", incomes.natation.plan, rate)}
            {renderCategory("Frais de réintégration", incomes.natation.reintegration, rate)}
            {renderCategory("Frais d'adhésion annuels", incomes.natation.adhesion, rate)}
            {renderCategory("Boutique", incomes.natation.boutique, rate)}
            <TotalRow
              label="Total École de Natation"
              amountUSD={totalNat}
              rate={rate}
            />
          </Section>

          <Section title="🏝️ Club A'QUA D'OR">
            {renderCategory("Memberships", incomes.club.memberships, rate)}
            {renderCategory("Location", incomes.club.location, rate)}
            {renderCategory("DayPass", incomes.club.daypass, rate)}
            <TotalRow
              label="Total Club A'QUA D'OR"
              amountUSD={totalClub}
              rate={rate}
            />
          </Section>
        </div>
      )}

      {/* === EXPENSES === */}
      {activeTab === "expenses" && (
        <div className="space-y-6">
          <Section title="➕ Ajouter une dépense manuelle">
            <form
              onSubmit={addExpense}
              className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4"
            >
              <input
                type="text"
                placeholder="Description"
                value={newExpense.description}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, description: e.target.value })
                }
                className="border rounded px-2 py-1"
              />

              <select
                value={newExpense.category}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, category: e.target.value })
                }
                className="border rounded px-2 py-1"
              >
                <option value="">Sélectionner une catégorie</option>
                <option value="Salaires">Salaires</option>
                <option value="Dépenses courrantes">Dépenses courrantes</option>
                <option value="Autres dépenses">Autres dépenses</option>
                <option value="Maintenance">Maintenance</option>
              </select>

              <input
                type="number"
                placeholder="Montant"
                value={newExpense.amount}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, amount: e.target.value })
                }
                className="border rounded px-2 py-1"
              />

              <select
                value={newExpense.currency}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, currency: e.target.value })
                }
                className="border rounded px-2 py-1"
              >
                <option value="USD">USD</option>
                <option value="HTG">HTG</option>
              </select>

              <input
                type="date"
                value={newExpense.date}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, date: e.target.value })
                }
                className="border rounded px-2 py-1"
              />

              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white font-semibold rounded px-4 py-2 md:col-span-6"
              >
                Ajouter Dépense
              </button>
            </form>
          </Section>

          <Section title="💸 Liste des Dépenses">
            <h3 className="font-semibold mb-2 text-gray-700">
              🧾 Dépenses de fonctionnement
            </h3>

            <table className="min-w-full text-sm border mb-6">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Catégorie</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                  <th className="px-3 py-2 text-center">Devise</th>
                  <th className="px-3 py-2 text-left">Mois</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>

              <tbody>
                {expenses.fonctionnement.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-3 py-2">
                      {editingExpense?.id === e.id ? ( 
                        <input
                          type="text"
                          value={editingExpense.description}
                          onChange={(ev) =>
                            setEditingExpense({
                              ...editingExpense,
                              description: ev.target.value,
                            })
                          }
                          className="border px-1 py-0.5 rounded w-full"
                        />
                      ) : (
                        e.description
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {editingExpense?.id === e.id ? (
                        <select
                          value={editingExpense.category || ""}
                          onChange={(ev) =>
                            setEditingExpense({
                              ...editingExpense,
                              category: ev.target.value,
                            })
                          }
                          className="border px-1 py-0.5 rounded w-full"
                        >
                          <option value="">Sélectionner une catégorie</option>
                          <option value="Salaires">Salaires</option>
                          <option value="Dépenses courrantes">Dépenses courrantes</option>
                          <option value="Autres dépenses">Autres dépenses</option>
                          <option value="Maintenance">Maintenance</option>
                        </select>
                      ) : (
                        e.category || "—"
                      )}
                    </td>

                    <td className="px-3 py-2 text-right">
                      {editingExpense?.id === e.id ? (
                        <input
                          type="number"
                          value={editingExpense.amount}
                          onChange={(ev) =>
                            setEditingExpense({
                              ...editingExpense,
                              amount: ev.target.value,
                            })
                          }
                          className="border px-1 py-0.5 rounded w-24 text-right"
                        />
                      ) : e.currency === "HTG" ? (
                        formatCurrencyHTG(Number(e.amount))
                      ) : (
                        formatCurrencyUSD(Number(e.amount))
                      )}
                    </td>

                    <td className="text-center px-3 py-2">
                      {editingExpense?.id === e.id ? (
                        <select
                          value={editingExpense.currency}
                          onChange={(ev) =>
                            setEditingExpense({
                              ...editingExpense,
                              currency: ev.target.value,
                            })
                          }
                          className="border px-1 py-0.5 rounded"
                        >
                          <option value="USD">USD</option>
                          <option value="HTG">HTG</option>
                        </select>
                      ) : (
                        e.currency
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {editingExpense?.id === e.id ? (
                        <input
                          type="date"
                          value={editingExpense.date?.split("T")[0] || ""}
                          onChange={(ev) =>
                            setEditingExpense({
                              ...editingExpense,
                              date: ev.target.value,
                            })
                          }
                          className="border px-1 py-0.5 rounded w-36"
                        />
                      ) : (
                        formatMonth(e.date)
                      )}
                    </td>

                    <td className="px-3 py-2 text-center">
                      {editingExpense?.id === e.id ? (
                        <>
                          <button
                            onClick={() => updateExpense(e.id, editingExpense)}
                            className="text-green-600 mr-2"
                          >
                            ✅
                          </button>
                          <button
                            onClick={() => setEditingExpense(null)}
                            className="text-gray-600"
                          >
                            ❌
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingExpense(e)}
                            className="text-blue-600 mr-2"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteExpense(e.id)}
                            className="text-red-600"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
  <tr>
    <td className="px-3 py-2 text-right" colSpan={2}>
      Total
    </td>

    {/* Total HTG ONLY */}
    <td className="px-3 py-2 text-right">
      {formatCurrencyHTG(
        expenses.fonctionnement
          .filter((e) => e.currency === "HTG")
          .reduce((t, e) => t + Number(e.amount), 0)
      )}
    </td>

    {/* Total USD + converted HTG */}
    <td className="px-3 py-2 text-center">
      {(() => {
        const totalUSD = expenses.fonctionnement
          .filter((e) => e.currency === "USD")
          .reduce((t, e) => t + Number(e.amount), 0);

        return `${formatCurrencyUSD(totalUSD)} (${formatCurrencyHTG(
          totalUSD * rate
        )})`;
      })()}
    </td>

    {/* TOTAL converted to HTG (HTG + USD→HTG) */}
    <td className="px-3 py-2 text-left">
      {formatCurrencyHTG(
        expenses.fonctionnement.reduce(
          (t, e) => t + (e.currency === "USD" ? e.amount * rate : e.amount),
          0
        )
      )}
    </td>

    <td></td>
  </tr>
</tfoot>



            </table>

            {/* === COMMISSIONS === */}
            <h3 className="font-semibold mb-2 text-gray-700">💼 Commissions payées</h3>

            {expenses.commissions.length > 0 ? (
              <table className="min-w-full text-sm border mb-6">
                <thead className="bg-yellow-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Montant (USD)</th>
                    <th className="px-3 py-2 text-right">Montant (HTG)</th>
                    <th className="px-3 py-2 text-left">Mois</th>
                  </tr>
                </thead>

                <tbody>
                  {expenses.commissions.map((c, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{c.description}</td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrencyUSD(c.amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrencyHTG(c.amount * rate)}
                      </td>
                      <td className="px-3 py-2">{formatMonth(c.date)}</td>
                    </tr>
                  ))}
                </tbody>

                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-3 py-2 text-right">Total commissions</td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrencyUSD(sum(expenses.commissions))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrencyHTG(sum(expenses.commissions) * rate)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="text-gray-500 text-sm italic mb-4">
                Aucune commission trouvée pour cette période.
              </p>
            )}

            <TotalRow label="Total Dépenses" amountUSD={totalExpensesHTG / rate} rate={rate} />

          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white shadow rounded-lg p-4">
      <h2 className="text-lg font-bold text-blue-800 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function renderCategory(label, data, rate, type = "income") {
  const total = data.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  if (!data.length)
    return (
      <p className="text-gray-500 text-sm italic mb-2">
        {label}: aucune donnée
      </p>
    );

  return (
    <div className="mb-4">
      <h3 className="font-semibold mb-1">{label}</h3>

      <table className="min-w-full text-sm border mb-1">
        <thead className={type === "income" ? "bg-blue-50" : "bg-red-50"}>
          <tr>
            <th className="px-3 py-2 text-left">Description</th>
            <th className="px-3 py-2 text-right">Montant (USD)</th>
            <th className="px-3 py-2 text-right">Montant (HTG)</th>
            <th className="px-3 py-2 text-left">Mois</th>
          </tr>
        </thead>

        <tbody>
          {data.map((d, i) => {
            const isHTG = d.currency === "HTG";
            const usd = isHTG ? d.amount / rate : d.amount;
            const htg = isHTG ? d.amount : d.amount * rate;

            return (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{d.desc || d.description || "—"}</td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {formatCurrencyUSD(usd)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {formatCurrencyHTG(htg)}
                </td>
                <td className="px-3 py-2">{formatMonth(d.date)}</td>
              </tr>
            );
          })}
        </tbody>

        <tfoot className="bg-gray-100 font-semibold">
          <tr>
            <td className="px-3 py-2 text-right">Total</td>
            <td className="px-3 py-2 text-right">
              {formatCurrencyUSD(total)}
            </td>
            <td className="px-3 py-2 text-right">
              {formatCurrencyHTG(total * rate)}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TotalRow({ label, amountUSD, rate }) {
  return (
    <div className="text-right font-bold mt-2 border-t pt-2">
      {label}: {formatCurrencyUSD(amountUSD)} (
      {formatCurrencyHTG(amountUSD * rate)})
    </div>
  );
}
