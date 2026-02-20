import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrencyHTG, formatDateFrSafe, formatMonth } from "../../lib/dateUtils";

function ymLabel(period) {
  const s = String(period || "").trim();

  // accept: "YYYY-MM-01" or "YYYY-MM-01T..."
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;

  return "—";
}


function num(v) {
  return Number(v || 0);
}

function asMonthDate(period) {
  const s = String(period || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}


export default function TeacherSalary() {
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);

  // expanded monthKey => details
  const [open, setOpen] = useState({}); // { "YYYY-MM": true }
  const [detailsByMonth, setDetailsByMonth] = useState({}); // { "YYYY-MM": {salary, late_events, missing_docs} }
  const [loadingMonth, setLoadingMonth] = useState({}); // { "YYYY-MM": true }

  const loadMonths = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("teacher_salary_months");
    if (error) {
      console.error("teacher_salary_months error:", error);
      setMonths([]);
    } else {
      setMonths(data || []);
    }
    setLoading(false);
  };

  const loadMonthDetails = async (period) => {
    const monthDate = asMonthDate(period);
    const key = ymLabel(period);
    if (!monthDate || !key) return;

    // already loaded
    if (detailsByMonth[key]) return;

    setLoadingMonth((p) => ({ ...p, [key]: true }));

    const { data, error } = await supabase.rpc("teacher_salary_month_details", {
      p_month: monthDate,
    });

    if (error) {
      console.error("teacher_salary_month_details error:", error);
      setDetailsByMonth((p) => ({ ...p, [key]: { salary: null, late_events: [], missing_docs: [] } }));
    } else {
      setDetailsByMonth((p) => ({ ...p, [key]: data }));
    }

    setLoadingMonth((p) => ({ ...p, [key]: false }));
  };

  useEffect(() => {
    loadMonths();
  }, []);

  const totals = useMemo(() => {
    let gross = 0;
    let deductions = 0;
    let net = 0;
    for (const r of months || []) {
      const g = num(r.base_salary) + num(r.commission_bonus) + num(r.attendance_bonus);
      gross += g;
      deductions += num(r.deductions);
      net += num(r.net_salary);
    }
    return { gross, deductions, net };
  }, [months]);

  const toggleMonth = async (r) => {
    const key = ymLabel(r.period);
    const next = !open[key];

    setOpen((p) => ({ ...p, [key]: next }));

    if (next) {
      await loadMonthDetails(r.period);
    }
  };

  if (loading) return <div className="p-6">Chargement...</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mes salaires</h1>
        <p className="text-sm text-gray-600">
          Cliquez sur un mois pour voir le détail des pertes (retards + dossiers manquants).
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500">Total brut</div>
          <div className="text-lg font-bold">{formatCurrencyHTG(totals.gross)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500">Total déductions</div>
          <div className="text-lg font-bold">{formatCurrencyHTG(totals.deductions)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500">Total net</div>
          <div className="text-lg font-bold">{formatCurrencyHTG(totals.net)}</div>
        </div>
      </div>

      <div className="border rounded overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 text-sm font-semibold">
          Historique mensuel
        </div>

        {(months || []).map((r) => {
          const key = ymLabel(r.period);
          const isOpen = !!open[key];
          const gross = num(r.base_salary) + num(r.commission_bonus) + num(r.attendance_bonus);
          const ded = num(r.deductions);
          const net = num(r.net_salary);

          const details = detailsByMonth[key];
          const isMonthLoading = !!loadingMonth[key];

          return (
            <div key={r.id} className="border-t">
              {/* Row header */}
              <button
                onClick={() => toggleMonth(r)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="font-semibold">
  {formatMonth(`${key}-15`)}
</div>

                <div className="text-sm flex flex-wrap gap-4">
                  <span><span className="text-gray-500">Brut:</span> <b>{formatCurrencyHTG(gross)}</b></span>
                  <span><span className="text-gray-500">Déductions:</span> <b>{formatCurrencyHTG(ded)}</b></span>
                  <span><span className="text-gray-500">Net:</span> <b>{formatCurrencyHTG(net)}</b></span>
                </div>
              </button>

              {/* Expanded details */}
              {isOpen && (
                <div className="px-4 pb-4">
                  {isMonthLoading ? (
                    <div className="py-3 text-gray-500 text-sm">Chargement du détail…</div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* LATE */}
                      <div className="border rounded p-3">
                        <div className="font-semibold mb-2">Retards (liste)</div>

                        <div className="text-sm text-gray-700 mb-2">
                          Déduction retards:{" "}
                          <b>
                            {formatCurrencyHTG(
                              // If you later store the split in admin_salaries.deductions as JSON, you can show exact late amount.
                              // For now: teacher sees the list; amount can be computed by your salary generator and stored in admin_salaries.
                              0
                            )}
                          </b>
                        </div>

                        {(details?.late_events || []).length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="p-2 border text-left">Date</th>
                                  <th className="p-2 border text-left">Heure prévue</th>
                                  <th className="p-2 border text-left">Arrivé à</th>
                                  <th className="p-2 border text-right">Minutes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {details.late_events.map((e, idx) => (
                                  <tr key={idx} className="border-t">
                                    <td className="p-2 border">{e.event_date || "—"}</td>
                                    <td className="p-2 border">{e.scheduled_time || "—"}</td>
                                    <td className="p-2 border">{e.arrived_time || "—"}</td>
                                    <td className="p-2 border text-right">{e.minutes_late ?? 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">Aucun retard enregistré.</div>
                        )}
                      </div>

                      {/* MISSING DOCS */}
                      <div className="border rounded p-3">
                        <div className="font-semibold mb-2">Dossiers manquants (liste)</div>

                        <div className="text-sm text-gray-700 mb-2">
                          Déduction dossiers: <b>{formatCurrencyHTG(0)}</b>
                        </div>

                        {(details?.missing_docs || []).length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="p-2 border text-left">Élève</th>
                                  <th className="p-2 border text-left">Document manquant</th>
                                </tr>
                              </thead>
                              <tbody>
                                {details.missing_docs.map((d, idx) => (
                                  <tr key={idx} className="border-t">
                                    <td className="p-2 border">{d.student_name || "—"}</td>
                                    <td className="p-2 border">{d.doc_label || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">Aucun dossier manquant enregistré.</div>
                        )}
                      </div>

                      {/* Totals */}
                      <div className="md:col-span-2 border rounded p-3">
                        <div className="font-semibold mb-2">Résumé</div>
                        <div className="text-sm text-gray-700 flex flex-wrap gap-6">
                          <div>Brut: <b>{formatCurrencyHTG(gross)}</b></div>
                          <div>Déductions totales: <b>{formatCurrencyHTG(ded)}</b></div>
                          <div>Net: <b>{formatCurrencyHTG(net)}</b></div>
                          <div className="text-gray-500">
                            Généré le: {formatDateFrSafe(r.created_at)}
                          </div>
                        </div>
                        {r.notes ? (
                          <div className="mt-2 text-sm text-gray-700">
                            Note: {r.notes}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!months?.length && (
          <div className="p-6 text-center text-gray-500 italic">Aucun salaire trouvé.</div>
        )}
      </div>
    </div>
  );
}
