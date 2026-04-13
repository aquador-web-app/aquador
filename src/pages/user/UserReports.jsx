// src/pages/user/UserReports.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { FaFilePdf, FaSpinner, FaTimesCircle } from "react-icons/fa";
import { formatMonth, formatDateFrSafe } from "../../lib/dateUtils";

export default function UserReports() {
  const [loading, setLoading] = useState(true);
  const [uiError, setUiError] = useState("");
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);

  const [ficheList, setFicheList] = useState([]);
  const [bulletinList, setBulletinList] = useState([]);
  const [sessionNotes, setSessionNotes] = useState([]);
  const [openMobileMonth, setOpenMobileMonth] = useState(null);

  // 1️⃣ Get auth user
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) setUiError(error.message);
      setUser(data?.user || null);
    })();
  }, []);

  // 2️⃣ Fetch parent + children and default selection
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setLoading(true);
        setUiError("");

        const { data: parent } = await supabase
          .from("profiles_with_unpaid")
          .select("id, full_name, parent_id, signup_type")
          .eq("id", user.id)
          .maybeSingle();

        const { data: kids } = await supabase
          .from("profiles_with_unpaid")
          .select("id, full_name, parent_id")
          .eq("parent_id", user.id);

        setProfile(parent || null);
        setChildren(kids || []);

        if (parent?.signup_type === "children_only" && kids?.length > 0) {
          setSelectedProfile(kids[0]);
        } else {
          setSelectedProfile(parent || kids[0] || null);
        }
      } catch (err) {
        console.error(err);
        setUiError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // 3️⃣ Fetch fiche + bulletin reports for selected profile
  useEffect(() => {
    if (!selectedProfile) return;
    (async () => {
      setLoading(true);
      setUiError("");
      setOpenMobileMonth(null);

      try {
        // Fiche Technique
        const { data: fiches, error: fErr } = await supabase
          .from("fiche_technique")
          .select("id, month, academic_year, pdf_url, updated_at, student_id")
          .eq("student_id", selectedProfile.id);

        if (fErr) throw fErr;

        // Bulletins
        const { data: bulletins, error: bErr } = await supabase
          .from("bulletin_monthly_summary")
          .select("id, month, academic_year, pdf_url, updated_at, student_id")
          .eq("student_id", selectedProfile.id);

        if (bErr) throw bErr;

        const { data: notesRows, error: nErr } = await supabase
          .from("bulletin_sessions")
          .select("id, month, academic_year, date, notes, student_id")
          .eq("student_id", selectedProfile.id)
          .not("notes", "is", null)
          .neq("notes", "")
          .order("date", { ascending: true });

        if (nErr) {
          console.error("Erreur chargement notes :", nErr);
        }

        setFicheList(fiches || []);
        setBulletinList(bulletins || []);
        setSessionNotes(nErr ? [] : (notesRows || []));
      } catch (err) {
        console.error(err);
        setUiError(err.message);
        setFicheList([]);
        setBulletinList([]);
        setSessionNotes([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedProfile]);

  // 4️⃣ Merge and sort by newest date
  const combined = useMemo(() => {
  const groupByMonth = new Map();

  // ✅ Robust month parser (no TZ drift)
  const parseMonth = (val) => {
    if (!val) return null;

    // If it's already a Date
    if (val instanceof Date) {
      return new Date(val.getFullYear(), val.getMonth(), 1);
    }

    const s = String(val).trim();

    // ISO-like: 2025-12 or 2025-12-01 → parse by tokens (no UTC)
    const isoMatch = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const monthIndex = parseInt(isoMatch[2], 10) - 1; // 0..11
      return new Date(year, monthIndex, 1);
    }

    // Text like "Décembre 2025"
    const parts = s.split(/\s+/);
    if (parts.length >= 1) {
      const mo = parts[0];
      const yr = parts[1] ? parseInt(parts[1], 10) : new Date().getFullYear();
      const monthsFr = [
        "janvier","février","mars","avril","mai","juin",
        "juillet","août","septembre","octobre","novembre","décembre",
      ];
      const idx = monthsFr.findIndex(m => m.toLowerCase() === mo.toLowerCase());
      if (idx !== -1) return new Date(yr, idx, 1);
    }

    // Fallback: try native, but normalize to first of month
    const d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), 1);
  };

    const addToGroup = (record, type) => {
    const d = parseMonth(record?.month);
    if (!d) return;

    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const existing = groupByMonth.get(key) || {};

    if (type === "note") {
      const existingNotes = existing.notes || [];
      groupByMonth.set(key, {
        ...existing,
        notes: [...existingNotes, record],
        monthDate: existing.monthDate || d,
        academic_year: record.academic_year || existing.academic_year || "—",
      });
      return;
    }

    groupByMonth.set(key, {
      ...existing,
      [type]: record,
      monthDate: d,
      academic_year: record.academic_year || existing.academic_year || "—",
    });
  };

  ficheList.forEach((x) => addToGroup(x, "fiche"));
  bulletinList.forEach((x) => addToGroup(x, "bulletin"));
  sessionNotes.forEach((x) => addToGroup(x, "note"));

  const rows = Array.from(groupByMonth.values())
    .map(({ fiche, bulletin, notes, monthDate, academic_year }) => {
      const ficheUrl = fiche?.pdf_url?.trim() || null;
      const bulletinUrl = bulletin?.pdf_url?.trim() || null;

      const compiledNotes = (notes || [])
        .filter((n) => n?.notes?.trim())
        .map((n) => {
          const dateLabel = n.date
            ? formatDateFrSafe(n.date)
            : "Date inconnue";
          return `${dateLabel} : ${n.notes.trim()}`;
        })
        .join("\n\n");

      if (!ficheUrl && !bulletinUrl && !compiledNotes) return null;

      const updated_at = new Date(
        Math.max(
          fiche?.updated_at ? new Date(fiche.updated_at).getTime() : 0,
          bulletin?.updated_at ? new Date(bulletin.updated_at).getTime() : 0
        )
      ).toISOString();

      // Uses your dateUtils helper, which should already capitalize
      let monthLabel = formatMonth(monthDate);
      // extra guard in case formatMonth returns lowercase
      monthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

      return {
        month: monthLabel,
        monthValue: monthDate,
        academic_year,
        fiche_url: ficheUrl,
        bulletin_url: bulletinUrl,
        notes: compiledNotes,
        updated_at,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.monthValue < b.monthValue ? 1 : -1);

  return rows;
}, [ficheList, bulletinList, sessionNotes]);


  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-screen text-[#001f5c]">
        <FaSpinner className="animate-spin text-4xl mb-3" />
        <p className="text-lg font-semibold">Chargement de vos rapports...</p>
      </div>
    );

  const selectable = [
    ...(profile?.signup_type === "children_only" ? [] : [profile]),
    ...(children || []),
  ].filter(Boolean);

  return (
        <div className="min-h-screen bg-gray-50 py-6 px-4 md:py-12 md:px-12">
          <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-4 md:p-8 border border-gray-100">
        <h1 className="text-2xl md:text-3xl font-bold text-[#001f5c] mb-6 text-center">
          📚 Mes Rapports — A’QUA D’OR
        </h1>

        {/* ✅ Profile selector */}
        {selectable.length > 1 ? (
          <div className="flex justify-center mb-6 md:mb-8">
            <select
              value={selectedProfile?.id || ""}
              onChange={(e) => {
                const p = selectable.find((x) => x.id === e.target.value);
                setSelectedProfile(p || null);
              }}
               className="w-full max-w-md bg-white text-gray-700 border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium shadow focus:ring-4 focus:ring-blue-200 transition text-center"
            >
              {selectable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-center text-lg font-semibold mb-8">
            {selectable[0]?.full_name ?? "—"}
          </p>
        )}

        {/* Errors */}
        {uiError && (
          <div className="mb-4 bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2">
            Erreur: {uiError}
          </div>
        )}

        {/* Table */}
        {combined.length === 0 ? (
          <p className="text-center text-gray-500">
            Aucun rapport disponible pour le moment.
          </p>
        ) : (
          <>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-[#001f5c] text-white">
                <tr>
                  <th className="px-4 py-3 text-left">Mois</th>
                  <th className="px-4 py-3 text-center">Bulletin</th>
                  <th className="px-4 py-3 text-center">Fiche Technique</th>
                  <th className="px-4 py-3 text-center">Notes</th>
                  <th className="px-4 py-3 text-center">Année Académique</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                               {combined.map((item, idx) => (
                  <tr key={idx} className="hover:bg-blue-50 transition">
                    <td className="px-4 py-3 font-semibold text-[#001f5c] capitalize">
                      {item.month}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.bulletin_url ? (
                        <a
                          href={item.bulletin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 bg-[#001f5c] hover:bg-[#004e75] text-white px-4 py-2 rounded-lg transition"
                        >
                          <FaFilePdf className="text-red-400" />
                          Voir Bulletin
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-gray-400 italic">
                          <FaTimesCircle /> Non disponible
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.fiche_url ? (
                        <a
                          href={item.fiche_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 bg-[#004e75] hover:bg-[#006ca7] text-white px-4 py-2 rounded-lg transition"
                        >
                          <FaFilePdf className="text-yellow-300" />
                          Voir Fiche
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-gray-400 italic">
                          <FaTimesCircle /> Non disponible
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-left text-gray-700 whitespace-pre-line">
                      {item.notes ? item.notes : (
                        <span className="text-gray-400 italic">Aucune note</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {item.academic_year}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
                      <div className="md:hidden space-y-4">
                            {combined.map((item, idx) => {
                const mobileKey = `${item.month}-${item.academic_year}-${idx}`;
                const isOpen = openMobileMonth === mobileKey;

                return (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-sm space-y-4"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMobileMonth(isOpen ? null : mobileKey)
                      }
                      className="w-full flex items-center justify-between border-b border-gray-200 pb-3 text-left"
                    >
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Mois</p>
                        <p className="font-semibold text-[#001f5c] text-lg">
                          {item.month}
                        </p>
                      </div>

                      <span className="text-[#001f5c] text-xl leading-none">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Bulletin</p>
                          {item.bulletin_url ? (
                            <a
                              href={item.bulletin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-full justify-center items-center gap-2 bg-[#001f5c] hover:bg-[#004e75] text-white px-4 py-2 rounded-lg transition"
                            >
                              <FaFilePdf className="text-red-400" />
                              Voir Bulletin
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-gray-400 italic">
                              <FaTimesCircle /> Non disponible
                            </span>
                          )}
                        </div>

                        <div>
                          <p className="text-xs text-gray-500 mb-2">Fiche Technique</p>
                          {item.fiche_url ? (
                            <a
                              href={item.fiche_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-full justify-center items-center gap-2 bg-[#004e75] hover:bg-[#006ca7] text-white px-4 py-2 rounded-lg transition"
                            >
                              <FaFilePdf className="text-yellow-300" />
                              Voir Fiche
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-gray-400 italic">
                              <FaTimesCircle /> Non disponible
                            </span>
                          )}
                        </div>

                        <div>
                          <p className="text-xs text-gray-500 mb-2">Notes</p>
                          <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-line break-words">
                            {item.notes ? item.notes : (
                              <span className="text-gray-400 italic">Aucune note</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-gray-500 mb-1">Année Académique</p>
                          <p className="text-sm font-medium text-gray-700">
                            {item.academic_year}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
