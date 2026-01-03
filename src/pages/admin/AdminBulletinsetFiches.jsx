import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatMonth } from "../../lib/dateUtils";
import { FaFilePdf, FaTimesCircle } from "react-icons/fa";

export default function AdminReportsOverview() {
  const [loading, setLoading] = useState(true);
  const [uiError, setUiError] = useState("");
  const [bulletins, setBulletins] = useState([]);
  const [fiches, setFiches] = useState([]);
  const [expanded, setExpanded] = useState({});

  // === Load bulletins and fiches ===
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setUiError("");

        const { data: bData, error: bErr } = await supabase
          .from("bulletin_monthly_summary")
          .select("id, student_id, student_name, month, academic_year, pdf_url, updated_at")
          .order("month", { ascending: false });

        const { data: fData, error: fErr } = await supabase
          .from("fiche_technique")
          .select("id, student_id, student_name, month, academic_year, pdf_url, updated_at")
          .order("month", { ascending: false });

        if (bErr) throw bErr;
        if (fErr) throw fErr;

        setBulletins(bData || []);
        setFiches(fData || []);
      } catch (err) {
        console.error(err);
        setUiError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // === Group by month (UTC-safe, handles fr labels & ISO dates) ===
  const grouped = useMemo(() => {
    const map = new Map();

    const parseMonth = (val) => {
      if (!val) return null;
      const s = String(val).trim();

      // Case 1: ISO like "2025-12" or "2025-12-01"
      const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;
      const m1 = s.match(iso);
      if (m1) {
        const y = Number(m1[1]);
        const m = Number(m1[2]);
        if (!y || !m) return null;
        return new Date(y, m - 1, 1); // local month start (avoid UTC shift)
      }

      // Case 2: French label like "Novembre 2025"
      const parts = s.split(/\s+/);
      if (parts.length >= 2) {
        const mo = parts[0].toLowerCase();
        const yr = Number(parts[1]);
        const monthsFr = [
          "janvier","février","mars","avril","mai","juin",
          "juillet","août","septembre","octobre","novembre","décembre",
        ];
        const idx = monthsFr.findIndex((x) => x === mo);
        if (idx !== -1 && yr) {
          return new Date(yr, idx, 1);
        }
      }

      // Fallback: let Date try (last resort)
      const d = new Date(s);
      if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), 1);
      return null;
    };

    const keyOf = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    // Merge bulletins
    for (const b of bulletins) {
      const d = parseMonth(b.month);
      if (!d) continue;
      const key = keyOf(d);
      if (!map.has(key)) {
        map.set(key, {
          key,
          monthLabel: formatMonth(d),
          academic_year: b.academic_year,
          students: {},
        });
      }
      const grp = map.get(key);
      grp.students[b.student_id] = {
        ...(grp.students[b.student_id] || {}),
        name: b.student_name || "—",
        bulletin: (b.pdf_url || "").trim() || null,
      };
    }

    // Merge fiches
    for (const f of fiches) {
      const d = parseMonth(f.month);
      if (!d) continue;
      const key = keyOf(d);
      if (!map.has(key)) {
        map.set(key, {
          key,
          monthLabel: formatMonth(d),
          academic_year: f.academic_year,
          students: {},
        });
      }
      const grp = map.get(key);
      grp.students[f.student_id] = {
        ...(grp.students[f.student_id] || {}),
        name: f.student_name || "—",
        fiche: (f.pdf_url || "").trim() || null,
      };
    }

    // ✅ Newest month at the top
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [bulletins, fiches]);

  const toggleExpand = (key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-screen text-[#001f5c]">
        <div className="animate-spin text-4xl mb-3">⏳</div>
        <p>Chargement des rapports...</p>
      </div>
    );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-8 border border-gray-100">
        <h1 className="text-3xl font-bold text-[#001f5c] mb-6 text-center">
          📅 Rapports Mensuels — A’QUA D’OR
        </h1>

        {uiError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
            Erreur: {uiError}
          </div>
        )}

        {grouped.length === 0 ? (
          <p className="text-center text-gray-500">Aucun rapport trouvé.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map((m) => {
              const isOpen = expanded[m.key];
              const students = Object.values(m.students).sort((a, b) =>
                (a.name || "").localeCompare(b.name || "")
              );

              return (
                <div key={m.key} className="border rounded-lg shadow-sm">
                  {/* Header row (month) */}
                  <div
                    className="flex justify-between items-center p-4 bg-[#001f5c] text-white cursor-pointer"
                    onClick={() => toggleExpand(m.key)}
                  >
                    <span className="font-semibold">
                      {m.monthLabel.charAt(0).toUpperCase() + m.monthLabel.slice(1)}{" "}
                      — {m.academic_year}
                    </span>
                    <span>{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {isOpen && (
                    <div className="p-4 bg-white overflow-x-auto">
                      <table className="min-w-full border border-gray-200 text-sm rounded-lg">
                        <thead className="bg-gray-100 text-gray-700">
                          <tr>
                            <th className="px-4 py-2 text-left">Élève</th>
                            <th className="px-4 py-2 text-center">Bulletin</th>
                            <th className="px-4 py-2 text-center">Fiche Technique</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((s, idx) => (
                            <tr key={idx} className="border-t hover:bg-blue-50">
                              <td className="px-4 py-2 font-medium text-gray-800">
                                {s.name}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {s.bulletin ? (
                                  <a
                                    href={s.bulletin}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-900"
                                  >
                                    <FaFilePdf className="text-red-500" />
                                    Ouvrir
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-gray-400 italic">
                                    <FaTimesCircle /> Non dispo
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {s.fiche ? (
                                  <a
                                    href={s.fiche}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-900"
                                  >
                                    <FaFilePdf className="text-yellow-500" />
                                    Ouvrir
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-gray-400 italic">
                                    <FaTimesCircle /> Non dispo
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
