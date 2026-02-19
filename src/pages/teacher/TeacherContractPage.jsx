  // src/pages/teacher/TeacherContractPage.jsx
  // @ts-nocheck
  import { useEffect, useMemo, useState } from "react";
  import { supabase } from "../../lib/supabaseClient";
  import { useAuth } from "../../context/AuthContext";
  import TeacherContractModal from "../../components/TeacherContractModal";

  function formatDateFrSafe(d) {
    try {
      const dt = d instanceof Date ? d : new Date(d);
      return dt.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      });
    } catch {
      return String(d || "");
    }
  }

  function parseISODateLocal(iso) {
  // "2025-09-01" -> local date at midnight (no timezone shift)
  if (!iso) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatISOFrLocal(iso) {
  try {
    const dt = parseISODateLocal(iso);
    if (!dt) return "—";
    return dt.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "2-digit" });
  } catch {
    return String(iso || "—");
  }
}

function academicYearLabelLocal(startISO, endISO) {
  try {
    const s = parseISODateLocal(startISO);
    const e = parseISODateLocal(endISO);
    if (!s || !e) return "Année académique —";
    return `Année académique ${s.getFullYear()}–${e.getFullYear()}`;
  } catch {
    return "Année académique —";
  }
}


  function academicYearLabel(startISO, endISO) {
    // "Année académique 2025–2026"
    try {
      const s = new Date(startISO);
      const e = new Date(endISO);
      const ys = s.getFullYear();
      const ye = e.getFullYear();
      return `Année académique ${ys}–${ye}`;
    } catch {
      return "Année académique —";
    }
  }

  function groupByAcademicYear(rows) {
  const map = new Map();

  (rows || []).forEach((r) => {
    const key = `${r.school_year_start || "—"}__${r.school_year_end || "—"}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });

  const groups = Array.from(map.entries()).map(([key, items]) => ({ key, items }));

  // Sort groups so "2025-09-01__2026-08-31" is first, then the rest by start desc
  const PRIORITY_START = "2025-09-01";
  return groups.sort((a, b) => {
    const aStart = a.key.split("__")[0] || "";
const bStart = b.key.split("__")[0] || "";


    const aIsPriority = aStart === PRIORITY_START;
    const bIsPriority = bStart === PRIORITY_START;

    if (aIsPriority && !bIsPriority) return -1;
    if (!aIsPriority && bIsPriority) return 1;

    // fallback: most recent first
    return String(bStart).localeCompare(String(aStart));
  });
}


  export default function TeacherContractPage() {
    const { user } = useAuth();
    const teacherId = useMemo(() => user?.id || null, [user]);

    const [open, setOpen] = useState(false);
    const [done, setDone] = useState(null);

    const [loading, setLoading] = useState(true);
    const [uiError, setUiError] = useState("");

    const [contracts, setContracts] = useState([]); // ALL contracts for teacher
    const [expandedYearKey, setExpandedYearKey] = useState(null);
    const [activeYearStartISO, setActiveYearStartISO] = useState("2025-09-01");

    async function fetchTeacherContracts() {
      if (!teacherId) return;

      setUiError("");
      setLoading(true);

      const { data, error } = await supabase
        .from("teacher_contracts")
        .select(
          "id, status, school_year_start, school_year_end, pdf_url, signed_at, created_at"
        )
        .eq("teacher_id", teacherId)
        .order("school_year_start", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        setUiError(error.message || String(error));
        setContracts([]);
        setLoading(false);
        return;
      }

      const rows = data || [];

// ✅ For now, only show up to 2025–2026 (hide 2026–2027 and future years)
const MAX_START = "2025-09-01";
const filtered = rows.filter((r) => (r.school_year_start || "") <= MAX_START);

setContracts(filtered);


      // Auto-expand the most recent academic year group
      // Auto-expand 2025–2026 if present, else fallback to most recent
if (filtered.length) {
  const priority = filtered.find((r) => r.school_year_start === "2025-09-01");
  const pick = priority || filtered[0];

  const pickKey = `${pick.school_year_start || "—"}__${pick.school_year_end || "—"}`;
  setExpandedYearKey((prev) => prev || pickKey);
  setActiveYearStartISO(pick.school_year_start || "2025-09-01");
}

      setLoading(false);
    }

    useEffect(() => {
      fetchTeacherContracts();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teacherId]);

    if (!teacherId) {
      return (
        <div className="p-4 text-gray-600">
          Impossible de charger votre profil (non connecté).
        </div>
      );
    }

    const groups = useMemo(() => groupByAcademicYear(contracts), [contracts]);

    return (
      <div className="p-4 space-y-4">
        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-aquaBlue">Contrat</h2>
              <p className="text-sm text-gray-600 mt-1">
                Signez votre contrat et retrouvez tous vos contrats des années précédentes.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchTeacherContracts}
                className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
                disabled={loading}
              >
                Rafraîchir
              </button>

              <button
                onClick={() => setOpen(true)}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm"
              >
                Ouvrir & Signer
              </button>
            </div>
          </div>

          {uiError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              ⚠️ {uiError}
            </div>
          )}

          {/* Success banner (just signed) */}
          {done?.pdf_url && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              ✅ Contrat signé.{" "}
              <a
                href={done.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
              >
                Ouvrir le PDF
              </a>
            </div>
          )}
        </div>

        {/* Documents-style list, grouped by academic year */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <h3 className="font-semibold">Contrats signés (classés par année académique)</h3>

          {loading ? (
            <p className="text-gray-600 text-sm">Chargement des contrats…</p>
          ) : !contracts.length ? (
            <p className="text-gray-500 text-sm italic">
              Aucun contrat trouvé pour le moment.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map(({ key, items }) => {
                const first = items?.[0];
                const label = academicYearLabelLocal(first?.school_year_start, first?.school_year_end);

                const expanded = expandedYearKey === key;

                return (
                  <div key={key} className="rounded-2xl border border-gray-100 overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100"
                      onClick={() => {
                        setExpandedYearKey(expanded ? null : key);
                        const start = key.split("__")[0];
                        if (start && start !== "—") setActiveYearStartISO(start);
                      }}                      
                    >
                      <div className="text-left">
                        <div className="font-semibold text-gray-800">{label}</div>
                        <div className="text-xs text-gray-500">
                          {formatISOFrLocal(first?.school_year_start)} → {formatISOFrLocal(first?.school_year_end)}
                        </div>
                      </div>
                      <div className="text-sm text-gray-600">{expanded ? "▲" : "▼"}</div>
                    </button>

                    {expanded && (
                      <div className="p-4">
                        <ul className="divide-y">
                          {items.map((c) => {
                            const hasPdf = !!c.pdf_url;
                            const statusLabel = c.status === "signed" ? "Signé" : (c.status || "—");
                            return (
                              <li
                                key={c.id}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3"
                              >
                                <div className="space-y-1">
                                  <div className="text-sm text-gray-800 font-medium">
                                    Statut :{" "}
                                    <span
                                      className={`text-xs px-2 py-1 rounded-full ${
                                        c.status === "signed"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-amber-100 text-amber-700"
                                      }`}
                                    >
                                      {statusLabel}
                                    </span>
                                  </div>

                                  <div className="text-xs text-gray-500">
                                    {c.signed_at
                                      ? `Signé le ${formatDateFrSafe(c.signed_at)}`
                                      : c.created_at
                                      ? `Créé le ${formatDateFrSafe(c.created_at)}`
                                      : ""}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <a
                                    href={hasPdf ? c.pdf_url : "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`text-sm underline font-semibold ${
                                      hasPdf ? "text-blue-600" : "text-gray-400 cursor-not-allowed"
                                    }`}
                                    onClick={(e) => {
                                      if (!hasPdf) e.preventDefault();
                                    }}
                                  >
                                    Ouvrir
                                  </a>

                                  <button
                                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm"
                                    onClick={() => setOpen(true)}
                                  >
                                    {c.status === "signed" ? "Re-signer" : "Signer"}
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal */}
        {open && (
          <TeacherContractModal
            teacherId={teacherId}
            defaultSchoolYearStartISO={activeYearStartISO}
            onClose={() => setOpen(false)}
            onDone={(res) => {
              setDone(res);
              setOpen(false);
              fetchTeacherContracts(); // ✅ refresh list after signing
            }}
          />
        )}
      </div>
    );
  }
