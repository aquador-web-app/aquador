// src/pages/admin/AdminTeacherSignedContracts.jsx
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// ---------- Helpers ----------
function makeSchoolYearOptions({ startYear = 2025, count = 6 } = {}) {
  const out = [];
  for (let y = startYear; y < startYear + count; y++) {
    out.push({
      label: `${y}–${y + 1}`,
      startISO: `${y}-09-01`,
      endISO: `${y + 1}-08-31`,
    });
  }
  return out;
}

function fmtDateTimeFr(d) {
  try {
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d || "");
  }
}

function fmtDateFrLong(d) {
  try {
    // If YYYY-MM-DD, use noon to avoid UTC shifting
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const dt = new Date(`${d}T12:00:00`);
      return dt.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "2-digit" });
    }
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "2-digit" });
  } catch {
    return String(d || "");
  }
}

function normalizeStatus(s) {
  const v = String(s || "").toLowerCase().trim();
  if (!v) return "—";
  return v;
}

async function openSignedUrlFromPath(path) {
  if (!path) return;
  const { data, error } = await supabase.storage.from("signed_docs").createSignedUrl(path, 60 * 20);
  if (error) throw error;
  const url = data?.signedUrl || "";
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

// ---------- Component ----------
export default function AdminTeacherSignedContracts() {
  const schoolYearOptions = useMemo(() => makeSchoolYearOptions({ startYear: 2025, count: 8 }), []);
  const [schoolYearStartISO, setSchoolYearStartISO] = useState(schoolYearOptions[0]?.startISO || "2025-09-01");
  const selectedYear = useMemo(
    () => schoolYearOptions.find((o) => o.startISO === schoolYearStartISO) || schoolYearOptions[0],
    [schoolYearOptions, schoolYearStartISO]
  );

  const [loading, setLoading] = useState(true);
  const [uiError, setUiError] = useState("");
  const [uiOk, setUiOk] = useState("");

  const [showUnsignedToo, setShowUnsignedToo] = useState(false);
  const [query, setQuery] = useState("");

  const [rows, setRows] = useState([]); // merged rows for table

  async function fetchRows() {
    setLoading(true);
    setUiError("");
    setUiOk("");

    try {
      const startISO = selectedYear?.startISO;
      const endISO = selectedYear?.endISO;

      // 1) Pull contracts for that school year (latest first)
      let q = supabase
        .from("teacher_contracts")
        .select(
          [
            "id",
            "teacher_id",
            "status",
            "signed_at",
            "pdf_url",
            "teacher_nif_cin",
            "teacher_id_upload_url",
            "template_id",
            "created_at",
          ].join(",")
        )
        .eq("school_year_start", startISO)
        .eq("school_year_end", endISO)
        .order("created_at", { ascending: false });

      if (!showUnsignedToo) {
        // keep only signed (status='signed' OR has pdf_url OR signed_at)
        // PostgREST OR string
        q = q.or("status.eq.signed,pdf_url.not.is.null,signed_at.not.is.null");
      }

      const { data: contracts, error: cErr } = await q;
      if (cErr) throw cErr;

      // Keep ONLY the latest contract per teacher for that year
      const seen = new Set();
      const latest = [];
      for (const c of contracts || []) {
        if (!c?.teacher_id) continue;
        if (seen.has(c.teacher_id)) continue;
        seen.add(c.teacher_id);
        latest.push(c);
      }

      const teacherIds = Array.from(new Set(latest.map((c) => c.teacher_id).filter(Boolean)));
      const templateIds = Array.from(new Set(latest.map((c) => c.template_id).filter(Boolean)));

      // 2) Profiles for names/contact
      let profilesById = {};
      if (teacherIds.length) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", teacherIds);

        if (pErr) throw pErr;
        profilesById = Object.fromEntries((profs || []).map((p) => [p.id, p]));
      }

      // 3) Templates for version/title
      let templatesById = {};
      if (templateIds.length) {
        const { data: tpls, error: tErr } = await supabase
          .from("teacher_contract_templates")
          .select("id, version, title, teacher_id, category_id, is_active, created_at")
          .in("id", templateIds);

        if (tErr) throw tErr;
        templatesById = Object.fromEntries((tpls || []).map((t) => [t.id, t]));
      }

      // 4) Build final rows
      const finalRows = (latest || []).map((c) => {
        const prof = profilesById[c.teacher_id] || {};
        const tpl = templatesById[c.template_id] || {};
        return {
          contract_id: c.id,
          teacher_id: c.teacher_id,
          teacher_full_name: prof.full_name || "—",
          teacher_email: prof.email || "—",
          teacher_phone: prof.phone || "—",
          status: normalizeStatus(c.status),
          signed_at: c.signed_at,
          created_at: c.created_at,
          pdf_url: c.pdf_url || "",
          teacher_nif_cin: c.teacher_nif_cin || "",
          teacher_id_upload_url: c.teacher_id_upload_url || "",
          template_id: c.template_id || "",
          template_version: tpl.version || "—",
          template_title: tpl.title || "—",
        };
      });

      setRows(finalRows);
      setUiOk(`✅ ${finalRows.length} contrat(s) trouvé(s) pour ${selectedYear?.label || ""}.`);
    } catch (e) {
      setUiError(e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolYearStartISO, showUnsignedToo]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const hay = [
        r.teacher_full_name,
        r.teacher_email,
        r.teacher_phone,
        r.teacher_nif_cin,
        r.template_version,
        r.template_title,
        r.status,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-aquaBlue">Signed Teacher Contracts</h2>
          <p className="text-sm text-gray-500">
            Inbox des contrats signés par année académique.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={schoolYearStartISO}
            onChange={(e) => setSchoolYearStartISO(e.target.value)}
            disabled={loading}
          >
            {schoolYearOptions.map((o) => (
              <option key={o.startISO} value={o.startISO}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="text-sm text-gray-700 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showUnsignedToo}
              onChange={(e) => setShowUnsignedToo(e.target.checked)}
            />
            Show unsigned too
          </label>

          <button
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
            onClick={fetchRows}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {(uiError || uiOk) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            uiError ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"
          }`}
        >
          {uiError ? `⚠️ ${uiError}` : uiOk}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm text-gray-600">
            Année: <b>{selectedYear?.label}</b>{" "}
            <span className="text-gray-400">
              ({fmtDateFrLong(selectedYear?.startISO)} → {fmtDateFrLong(selectedYear?.endISO)})
            </span>
          </div>

          <input
            className="border rounded-lg px-3 py-2 text-sm w-full sm:w-[380px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teacher, email, NIF/CIN, template…"
          />
        </div>

        {loading ? (
          <div className="text-gray-500 italic">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500 italic">No contracts found.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2 pr-3">Teacher</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Signed</th>
                  <th className="py-2 pr-3">Template</th>
                  <th className="py-2 pr-3">NIF/CIN</th>
                  <th className="py-2 pr-3">ID File</th>
                  <th className="py-2 pr-3">PDF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isSigned = r.status === "signed" || !!r.signed_at || !!r.pdf_url;
                  return (
                    <tr key={r.contract_id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-gray-800">{r.teacher_full_name}</div>
                        <div className="text-xs text-gray-500">
                          {r.teacher_email} {r.teacher_phone && r.teacher_phone !== "—" ? `• ${r.teacher_phone}` : ""}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          Created: {fmtDateTimeFr(r.created_at)}
                        </div>
                      </td>

                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                            isSigned
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.status || "—"}
                        </span>
                      </td>

                      <td className="py-2 pr-3">
                        {r.signed_at ? (
                          <div className="text-gray-800">{fmtDateTimeFr(r.signed_at)}</div>
                        ) : (
                          <div className="text-gray-400">—</div>
                        )}
                      </td>

                      <td className="py-2 pr-3">
                        <div className="text-gray-800">
                          <b>{r.template_version}</b>
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-[320px]">
                          {r.template_title}
                        </div>
                      </td>

                      <td className="py-2 pr-3">
                        <div className="text-gray-800">{r.teacher_nif_cin || "—"}</div>
                      </td>

                      <td className="py-2 pr-3">
                        {r.teacher_id_upload_url ? (
                          <button
                            type="button"
                            className="text-blue-600 underline"
                            onClick={async () => {
                              try {
                                setUiError("");
                                await openSignedUrlFromPath(r.teacher_id_upload_url);
                              } catch (e) {
                                setUiError(e?.message || String(e));
                              }
                            }}
                          >
                            Open ID
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="py-2 pr-3">
                        {r.pdf_url ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                              onClick={() => window.open(r.pdf_url, "_blank", "noopener,noreferrer")}
                            >
                              Open PDF
                            </button>
                            <button
                              type="button"
                              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(r.pdf_url);
                                  setUiOk("✅ PDF URL copied.");
                                  setUiError("");
                                  setTimeout(() => setUiOk(""), 1200);
                                } catch {}
                              }}
                            >
                              Copy link
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-xs text-gray-500">
          Note: This page reads from <span className="font-mono">teacher_contracts</span> filtered by{" "}
          <span className="font-mono">school_year_start/end</span>. It keeps only the latest row per teacher for the selected year.
        </div>
      </div>
    </div>
  );
}