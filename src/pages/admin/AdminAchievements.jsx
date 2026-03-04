// src/pages/admin/AdminAchievements.jsx
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";

function safeStr(v) {
  return (v ?? "").toString();
}
function normalize(s) {
  return safeStr(s).trim().toLowerCase();
}

export default function AdminAchievements() {
  const [tab, setTab] = useState("certificates"); // certificates | achievements | notes

  const [uiError, setUiError] = useState("");
  const [uiOk, setUiOk] = useState("");

  // Shared students list (for assignment + filtering)
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  // =========================
  // TAB 1: Certificates
  // =========================
  const [certLoading, setCertLoading] = useState(false);
  const [certRows, setCertRows] = useState([]);
  const [certQuery, setCertQuery] = useState("");

  // =========================
  // TAB 2: Achievement definitions + Assign
  // =========================
  const [defsLoading, setDefsLoading] = useState(false);
  const [defs, setDefs] = useState([]);

  const [defEditId, setDefEditId] = useState("");
  const defEditing = useMemo(
    () => defs.find((d) => String(d.id) === String(defEditId)) || null,
    [defs, defEditId]
  );

  const [defName, setDefName] = useState("");
  const [defTitle, setDefTitle] = useState("");
  const [defDesc, setDefDesc] = useState("");
  const [defKind, setDefKind] = useState("achievement");
  const [defIconUrl, setDefIconUrl] = useState("");
  const [defActive, setDefActive] = useState(true);

  const [assignDefId, setAssignDefId] = useState("");
  const [assignDescOverride, setAssignDescOverride] = useState("");

  // =========================
  // TAB 3: Teacher notes
  // =========================
  const [notesLoading, setNotesLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesQuery, setNotesQuery] = useState("");

  const studentOptions = useMemo(() => {
    const rows = students || [];
    return rows
      .map((s) => {
        const full =
          (s.full_name || `${s.first_name || ""} ${s.last_name || ""}`.trim()) || "—";
        return { value: s.id, label: full };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  }, [students]);

  const selectedStudent = useMemo(() => {
    return (students || []).find((s) => String(s.id) === String(selectedStudentId)) || null;
  }, [students, selectedStudentId]);

  // -------------------------
  // Loaders
  // -------------------------
  async function fetchStudents() {
    setStudentsLoading(true);
    setUiError("");
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name")
        .order("full_name", { ascending: true });
      if (error) throw error;

      const list = data || [];
      setStudents(list);
      if (!selectedStudentId && list[0]?.id) setSelectedStudentId(list[0].id);
    } catch (e) {
      setUiError(e?.message || String(e));
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }

  async function fetchCertificates() {
    setCertLoading(true);
    setUiError("");
    setUiOk("");
    try {
      // Adjust join fields if your FK names differ
      const { data, error } = await supabase
        .from("student_certificates_issued")
        .select(
          `
          id,
          created_at,
          issued_on,
          profile_id,
          template_id,
          category_id,
          level_name,
          program_name,
          school_year_start,
          school_year_end,
          bucket,
          object_path,
          file_name,
          payload,
          profiles:profiles!student_certificates_issued_profile_id_fkey (
            id, full_name, first_name, last_name
          ),
          category:student_certificate_categories!student_certificates_issued_category_id_fkey (
            id, name, title
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) throw error;

      setCertRows(data || []);
    } catch (e) {
      setUiError(e?.message || String(e));
      setCertRows([]);
    } finally {
      setCertLoading(false);
    }
  }

  async function fetchDefinitions() {
    setDefsLoading(true);
    setUiError("");
    setUiOk("");
    try {
      const { data, error } = await supabase
        .from("achievement_definitions")
        .select("id, name, title, description, kind, icon_url, is_active, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      setDefs(data || []);
    } catch (e) {
      setUiError(e?.message || String(e));
      setDefs([]);
    } finally {
      setDefsLoading(false);
    }
  }

  async function fetchNotes() {
    setNotesLoading(true);
    setUiError("");
    setUiOk("");
    try {
      const { data, error } = await supabase
        .from("teacher_student_notes")
        .select(
          `
          id,
          created_at,
          note,
          visibility,
          student_profile_id,
          teacher_profile_id,
          student:profiles!teacher_student_notes_student_profile_id_fkey (id, full_name, first_name, last_name),
          teacher:profiles!teacher_student_notes_teacher_profile_id_fkey (id, full_name, first_name, last_name)
        `
        )
        .order("created_at", { ascending: false })
        .limit(400);

      if (error) throw error;

      setNotes(data || []);
    } catch (e) {
      setUiError(e?.message || String(e));
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchStudents();
      await fetchCertificates();
      await fetchDefinitions();
      await fetchNotes();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // Definitions CRUD
  // -------------------------
  function resetDefForm() {
    setDefEditId("");
    setDefName("");
    setDefTitle("");
    setDefDesc("");
    setDefKind("achievement");
    setDefIconUrl("");
    setDefActive(true);
  }

  useEffect(() => {
    if (!defEditing) return;
    setDefName(defEditing.name || "");
    setDefTitle(defEditing.title || "");
    setDefDesc(defEditing.description || "");
    setDefKind(defEditing.kind || "achievement");
    setDefIconUrl(defEditing.icon_url || "");
    setDefActive(!!defEditing.is_active);
  }, [defEditId]); // eslint-disable-line

  async function saveDefinition() {
    setUiError("");
    setUiOk("");

    if (!defName.trim()) return setUiError("Name is required.");

    try {
      if (defEditId) {
        const { error } = await supabase
          .from("achievement_definitions")
          .update({
            name: defName.trim(),
            title: defTitle.trim() || null,
            description: defDesc.trim() || null,
            kind: defKind.trim() || "achievement",
            icon_url: defIconUrl.trim() || null,
            is_active: !!defActive,
          })
          .eq("id", defEditId);
        if (error) throw error;
        setUiOk("✅ Achievement definition updated.");
      } else {
        const { error } = await supabase.from("achievement_definitions").insert([
          {
            name: defName.trim(),
            title: defTitle.trim() || null,
            description: defDesc.trim() || null,
            kind: defKind.trim() || "achievement",
            icon_url: defIconUrl.trim() || null,
            is_active: !!defActive,
          },
        ]);
        if (error) throw error;
        setUiOk("✅ Achievement definition created.");
      }

      resetDefForm();
      await fetchDefinitions();
    } catch (e) {
      setUiError(e?.message || String(e));
    }
  }

  async function deleteDefinition(id) {
    if (!id) return;
    setUiError("");
    setUiOk("");
    try {
      const { error } = await supabase.from("achievement_definitions").delete().eq("id", id);
      if (error) throw error;
      setUiOk("✅ Definition deleted.");
      if (String(defEditId) === String(id)) resetDefForm();
      await fetchDefinitions();
    } catch (e) {
      setUiError(e?.message || String(e));
    }
  }

  // -------------------------
  // Assign achievement to student (uses your existing profile_achievements)
  // -------------------------
  async function assignAchievementToStudent() {
    setUiError("");
    setUiOk("");

    if (!selectedStudentId) return setUiError("Select a student first.");
    if (!assignDefId) return setUiError("Select an achievement definition.");

    const def = defs.find((d) => String(d.id) === String(assignDefId));
    if (!def) return setUiError("Invalid achievement definition.");

    try {
      const title = def.title || def.name || "Achievement";
      const description = assignDescOverride?.trim() || def.description || null;

      const { error } = await supabase.from("profile_achievements").insert([
        {
          profile_id: selectedStudentId,
          kind: def.kind || "achievement",
          title,
          description,
          ref_table: "achievement_definitions",
          ref_id: def.id,
          bucket: null,
          object_path: null,
          file_name: null,
        },
      ]);

      if (error) throw error;

      setUiOk("✅ Achievement assigned to student.");
      setAssignDefId("");
      setAssignDescOverride("");
    } catch (e) {
      setUiError(e?.message || String(e));
    }
  }

  // -------------------------
  // Filtered views
  // -------------------------
  const filteredCerts = useMemo(() => {
    const q = normalize(certQuery);
    if (!q) return certRows || [];

    return (certRows || []).filter((r) => {
      const student =
        r?.profiles?.full_name ||
        `${r?.profiles?.first_name || ""} ${r?.profiles?.last_name || ""}`.trim();
      const title = r?.payload?.achievement_title || r?.category?.title || r?.category?.name || "";
      const file = r?.file_name || r?.object_path || "";
      return normalize(student).includes(q) || normalize(title).includes(q) || normalize(file).includes(q);
    });
  }, [certRows, certQuery]);

  const filteredNotes = useMemo(() => {
    const q = normalize(notesQuery);
    if (!q) return notes || [];
    return (notes || []).filter((n) => {
      const student =
        n?.student?.full_name || `${n?.student?.first_name || ""} ${n?.student?.last_name || ""}`.trim();
      const teacher =
        n?.teacher?.full_name || `${n?.teacher?.first_name || ""} ${n?.teacher?.last_name || ""}`.trim();
      return (
        normalize(student).includes(q) ||
        normalize(teacher).includes(q) ||
        normalize(n?.note).includes(q) ||
        normalize(n?.visibility).includes(q)
      );
    });
  }, [notes, notesQuery]);

  // -------------------------
  // UI
  // -------------------------
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-aquaBlue">Admin — Achievements</h2>
          <p className="text-sm text-gray-500">
            Certificates generated, achievements you can assign, and teacher notes for students.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
            onClick={async () => {
              await fetchStudents();
              await fetchCertificates();
              await fetchDefinitions();
              await fetchNotes();
            }}
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
          {uiError ? `⚠️ ${uiError}` : `✅ ${uiOk}`}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { k: "certificates", label: "Certificates" },
          { k: "achievements", label: "Achievements" },
          { k: "notes", label: "Teacher Notes" },
        ].map((t) => (
          <button
            key={t.k}
            className={`px-4 py-2 rounded-xl border text-sm ${
              tab === t.k ? "border-aquaBlue bg-blue-50 text-aquaBlue" : "border-gray-200 hover:bg-gray-50"
            }`}
            onClick={() => setTab(t.k)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Shared student picker (used for assignment; optional filtering later) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-700">
          Student (for assignment):
          <span className="ml-2 font-semibold">
            {selectedStudent?.full_name ||
              `${selectedStudent?.first_name || ""} ${selectedStudent?.last_name || ""}`.trim() ||
              "—"}
          </span>
        </div>

        <select
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
          disabled={studentsLoading}
        >
          {studentOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* TAB PANELS */}
      {tab === "certificates" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-800">All generated certificates</h3>
            <input
              className="border rounded-lg px-3 py-2 text-sm w-full sm:w-[360px]"
              placeholder="Search student, title, file…"
              value={certQuery}
              onChange={(e) => setCertQuery(e.target.value)}
            />
          </div>

          {certLoading ? (
            <div className="text-gray-500 italic">Loading…</div>
          ) : filteredCerts.length === 0 ? (
            <div className="text-gray-500 italic">No certificates found.</div>
          ) : (
            <div className="overflow-auto border rounded-xl">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3">Student</th>
                    <th className="text-left p-3">Achievement</th>
                    <th className="text-left p-3">Issued</th>
                    <th className="text-left p-3">Level</th>
                    <th className="text-left p-3">School year</th>
                    <th className="text-left p-3">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCerts.map((r) => {
                    const student =
                      r?.profiles?.full_name ||
                      `${r?.profiles?.first_name || ""} ${r?.profiles?.last_name || ""}`.trim() ||
                      "—";

                    const title =
                      r?.payload?.achievement_title || r?.category?.title || r?.category?.name || "—";

                    const pdfUrl = r?.payload?.public_url || null;

                    return (
                      <tr key={r.id} className="border-t">
                        <td className="p-3 font-semibold text-gray-800">{student}</td>
                        <td className="p-3">{title}</td>
                        <td className="p-3">{r.issued_on || formatDateFrSafe(r.created_at)}</td>
                        <td className="p-3">{r.level_name || "—"}</td>
                        <td className="p-3">
                          {(r.school_year_start || "—") + " – " + (r.school_year_end || "—")}
                        </td>
                        <td className="p-3">
                          {pdfUrl ? (
                            <a
                              className="text-aquaBlue font-semibold hover:underline"
                              href={pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open PDF
                            </a>
                          ) : (
                            <span className="text-gray-400">No URL</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "achievements" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Achievement definitions</h3>
              <button className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm" onClick={resetDefForm}>
                New
              </button>
            </div>

            {defsLoading ? (
              <div className="text-gray-500 italic mt-3">Loading…</div>
            ) : defs.length === 0 ? (
              <div className="text-gray-500 italic mt-3">No definitions yet.</div>
            ) : (
              <div className="mt-3 space-y-2 max-h-[70vh] overflow-auto pr-1">
                {defs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDefEditId(d.id)}
                    className={`w-full text-left rounded-xl border px-3 py-2 transition ${
                      String(defEditId) === String(d.id)
                        ? "border-aquaBlue bg-blue-50"
                        : "border-gray-100 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-gray-800 truncate">{d.name}</div>
                      {!d.is_active && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{d.title || "—"}</div>
                    <div className="text-[11px] text-gray-400 mt-1">{formatDateFrSafe(d.created_at)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor + Assign */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:col-span-7 space-y-6">
            <div>
              <h3 className="font-semibold text-gray-800">{defEditId ? "Edit definition" : "Create definition"}</h3>
              <p className="text-xs text-gray-500">
                Create reusable achievements. Then assign them to a student (creates a row in profile_achievements).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Name *</label>
                <input className="w-full border rounded-lg px-3 py-2" value={defName} onChange={(e) => setDefName(e.target.value)} />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Kind</label>
                <input className="w-full border rounded-lg px-3 py-2" value={defKind} onChange={(e) => setDefKind(e.target.value)} placeholder="achievement" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Title (optional)</label>
                <input className="w-full border rounded-lg px-3 py-2" value={defTitle} onChange={(e) => setDefTitle(e.target.value)} />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Description</label>
                <textarea
                  className="w-full border rounded-xl px-3 py-2 text-sm min-h-[120px]"
                  value={defDesc}
                  onChange={(e) => setDefDesc(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Icon URL (optional)</label>
                <input className="w-full border rounded-lg px-3 py-2" value={defIconUrl} onChange={(e) => setDefIconUrl(e.target.value)} />
              </div>

              <label className="md:col-span-2 text-sm text-gray-700 flex items-center gap-2">
                <input type="checkbox" checked={defActive} onChange={(e) => setDefActive(e.target.checked)} />
                Active
              </label>

              <div className="md:col-span-2 flex items-center justify-end gap-2">
                {defEditId && (
                  <button
                    className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500"
                    onClick={() => deleteDefinition(defEditId)}
                  >
                    Delete
                  </button>
                )}
                <button className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={resetDefForm}>
                  Reset
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={saveDefinition}
                >
                  Save
                </button>
              </div>
            </div>

            <div className="border-t pt-5 space-y-3">
              <h4 className="font-semibold text-gray-800">Assign to selected student</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Achievement</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={assignDefId}
                    onChange={(e) => setAssignDefId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {defs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.is_active ? "" : "(inactive)"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Description override (optional)</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={assignDescOverride}
                    onChange={(e) => setAssignDescOverride(e.target.value)}
                    placeholder="Leave empty to use definition description"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  className="px-4 py-2 rounded-lg bg-aquaBlue text-white hover:opacity-90"
                  onClick={assignAchievementToStudent}
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "notes" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-800">Teacher notes (admin view)</h3>
            <input
              className="border rounded-lg px-3 py-2 text-sm w-full sm:w-[420px]"
              placeholder="Search student, teacher, note…"
              value={notesQuery}
              onChange={(e) => setNotesQuery(e.target.value)}
            />
          </div>

          {notesLoading ? (
            <div className="text-gray-500 italic">Loading…</div>
          ) : filteredNotes.length === 0 ? (
            <div className="text-gray-500 italic">No notes found.</div>
          ) : (
            <div className="overflow-auto border rounded-xl">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3">Student</th>
                    <th className="text-left p-3">Teacher</th>
                    <th className="text-left p-3">Visibility</th>
                    <th className="text-left p-3">Note</th>
                    <th className="text-left p-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotes.map((n) => {
                    const student =
                      n?.student?.full_name ||
                      `${n?.student?.first_name || ""} ${n?.student?.last_name || ""}`.trim() ||
                      "—";
                    const teacher =
                      n?.teacher?.full_name ||
                      `${n?.teacher?.first_name || ""} ${n?.teacher?.last_name || ""}`.trim() ||
                      "—";

                    return (
                      <tr key={n.id} className="border-t align-top">
                        <td className="p-3 font-semibold text-gray-800">{student}</td>
                        <td className="p-3">{teacher}</td>
                        <td className="p-3">{n.visibility || "—"}</td>
                        <td className="p-3 whitespace-pre-wrap">{n.note || ""}</td>
                        <td className="p-3">{formatDateFrSafe(n.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}