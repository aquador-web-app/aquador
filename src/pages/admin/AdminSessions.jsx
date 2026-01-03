import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";


// Calculate and update remaining capacity only for main session rows
// Compute remaining capacity for main rows (don’t touch child rows)
// Compute remaining capacity per SERIES = course + start_time + days_of_week (+ date range)
// We count enrollments by first finding the sessions that belong to the series,
// then counting active enrollments whose session_id is in that set.


async function computeMainRowCapacities(seriesRows, supabase) {
  const result = [];

  for (const s of seriesRows || []) {
    // 1) get all session ids that belong to this series slot
    const { data: sessIds, error: sessErr } = await supabase
      .from("sessions")
      .select("id")
      .eq("course_id", s.course_id)
      .eq("start_time", s.start_time)
      .gte("start_date", s.start_date)
      .lte("start_date", s.end_date)
      .in("day_of_week", Array.isArray(s.days_of_week) ? s.days_of_week : [])
      .neq("status", "cancelled"); // don't count canceled sessions

    if (sessErr) {
      console.error("Session-id fetch error for series", s.id, sessErr.message);
      result.push({ ...s, capacity_remaining: s.capacity });
      continue;
    }

    const ids = (sessIds || []).map(r => r.id);
    if (ids.length === 0) {
      // No generated sessions in range — keep original capacity
      result.push({ ...s, capacity_remaining: s.capacity });
      continue;
    }

    // 2) count active enrollments on those sessions
    const { count, error: cntErr } = await supabase
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .in("session_id", ids)
      .eq("status", "active");

    if (cntErr) {
      console.error("Enrollment count error for series", s.id, cntErr.message);
      result.push({ ...s, capacity_remaining: s.capacity });
      continue;
    }

    const remaining = Math.max(0, (s.capacity ?? 15) - (count ?? 0));
    result.push({ ...s, capacity_remaining: remaining });
  }

  return result;
}




const DOW_SHORT = { 1: "Dim", 2: "Lun", 3: "Mar", 4: "Mer", 5: "Jeu", 6: "Ven", 7: "Sam" };
const DOW_LABEL = {
  1: "Dimanche (Fermé)",
  2: "Lundi",
  3: "Mardi",
  4: "Mercredi",
  5: "Jeudi",
  6: "Vendredi",
  7: "Samedi",
};


function* eachDay(start, end) {
  const dt = new Date(start);
  const last = new Date(end);
  while (dt <= last) {
    yield new Date(dt);
    dt.setDate(dt.getDate() + 1);
  }
}

export default function AdminSessions() {
  const { showAlert, showConfirm } = useGlobalAlert();
  // series list & expansion
  const [series, setSeries] = useState([]);
  const [expanded, setExpanded] = useState({}); // { [seriesId]: true|false }
  const [sessionsBySeries, setSessionsBySeries] = useState({}); // { [seriesId]: Session[] }
  

  // courses for display in list and in form
  const [courses, setCourses] = useState([]);

  // create / edit form state
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    course_id: "",
    start_date: "",
    end_date: "",
    start_time: "",
    duration_hours: 2,
    capacity: 15,
    booking_mode: "allow",
    days: [], // [2..7] (no 1)
    status: "active",
  });

  // load initial data
  useEffect(() => {
    fetchCourses();
    fetchSeries();
  }, []);

  async function fetchCourses() {
    const { data, error } = await supabase.from("courses").select("id,name").order("created_at", { ascending: false });
    if (error) console.error("courses error", error);
    else setCourses(data || []);
  }

  async function fetchSeries() {
    const { data, error } = await supabase
  .from("session_series")
  .select("id, course_id, start_date, end_date, days_of_week, start_time, duration_hours, capacity, booking_mode, status, courses(name)")
  .order("created_at", { ascending: false });

if (error) {
  console.error("series fetch error:", error.message);
  setSeries([]);
  return;
} else {
      const withCaps = await computeMainRowCapacities(data || [], supabase);
setSeries(withCaps);

    }
  }

  // Expand/collapse row (click entire row)
  const onRowClick = async (row) => {
    setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }));
    // lazy-load sessions when expanding
    if (!expanded[row.id]) {
      await loadSessionsForSeries(row);
    }
  };

const [hoveredSeries, setHoveredSeries] = useState(null);
const [enrolledStudents, setEnrolledStudents] = useState({});


useEffect(() => {
  async function loadEnrolledStudents() {
    const allSessionIds = Object.values(sessionsBySeries)
      .flat()
      .map((s) => s.id);

    if (!allSessionIds.length) {
      setEnrolledStudents({});
      return;
    }

    const { data, error } = await supabase
      .from("enrollments")
      .select("id, full_name, session_id")
      .in("session_id", allSessionIds)
      .eq("status", "active");

    if (error) {
      console.error("loadEnrolledStudents error:", error.message);
      return;
    }

    const grouped = data.reduce((acc, item) => {
      const sid = item.session_id;
      acc[sid] = acc[sid] || [];
      acc[sid].push(item);
      return acc;
    }, {});

    setEnrolledStudents(grouped);
  }

  loadEnrolledStudents();
}, [sessionsBySeries]);



  // Load sessions that belong to a series signature
  async function loadSessionsForSeries(s) {
    const { data, error } = await supabase
      .from("sessions")
      .select("id, start_date, start_time, duration_hours, capacity, booking_mode, status, day_of_week, courses(name)")
      .eq("course_id", s.course_id)
      .eq("start_time", s.start_time)
      .gte("start_date", s.start_date)
      .lte("start_date", s.end_date)
      .in("day_of_week", s.days_of_week || [])
      .order("start_date", { ascending: true });

    if (error) {
      console.error("sessions fetch error", error);
      return;
    }
    setSessionsBySeries((old) => ({ ...old, [s.id]: data || [] }));
  }

  // Cancel a single session
  async function cancelSession(sessionId, seriesId, e) {
    e?.stopPropagation?.();
    const { error } = await supabase.from("sessions").update({ status: "cancelled" }).eq("id", sessionId);
    if (error) {
      alert("Erreur lors de l'annulation.");
      console.error(error);
      return;
    }
    
    // local refresh
    setSessionsBySeries((old) => ({
      ...old,
      [seriesId]: (old[seriesId] || []).map((x) => (x.id === sessionId ? { ...x, status: "cancelled" } : x)),
    }));
  }

  // Helpers
  const daysString = (arr) => (arr || []).map((d) => DOW_SHORT[d] || d).join(", ");

  // --- Form handling

  const resetForm = () => {
    setEditingId(null);
    setForm({
      course_id: "",
      start_date: "",
      end_date: "",
      start_time: "",
      duration_hours: 2,
      capacity: 15,
      booking_mode: "allow",
      days: [],
      status: "active",
    });
  };

  const startEditing = (row, e) => {
    e?.stopPropagation?.();
    setEditingId(row.id);
    setForm({
      course_id: row.course_id || "",
      start_date: row.start_date || "",
      end_date: row.end_date || "",
      start_time: row.start_time || "",
      duration_hours: row.duration_hours ?? 2,
      capacity: row.capacity ?? 15,
      booking_mode: row.booking_mode || "allow",
      days: (row.days_of_week || []).slice(),
      status: row.status || "active",
    });
    // ensure expanded to see sessions while editing
    setExpanded((prev) => ({ ...prev, [row.id]: true }));
    loadSessionsForSeries(row);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "days") {
      const v = parseInt(value, 10);
      setForm((prev) => ({
        ...prev,
        days: checked ? [...prev.days, v] : prev.days.filter((d) => d !== v),
      }));
    } else if (name === "duration_hours" || name === "capacity") {
      setForm((prev) => ({ ...prev, [name]: Number(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Restore a single session (uses seriesId to locally refresh that expanded list)
async function restoreSession(sessionId, seriesId, e) {
  e?.stopPropagation?.();
  const { error } = await supabase
    .from("sessions")
    .update({ status: "active" })
    .eq("id", sessionId);

  if (error) {
    alert("Erreur lors de la restauration.");
    console.error(error);
    return;
  }

  // local refresh of the expanded child list
  setSessionsBySeries((old) => ({
    ...old,
    [seriesId]: (old[seriesId] || []).map((x) =>
      x.id === sessionId ? { ...x, status: "active" } : x
    ),
  }));

  // refresh series header (capacity)
  const { data } = await supabase
    .from("session_series")
    .select("id, course_id, start_date, end_date, days_of_week, start_time, duration_hours, capacity, booking_mode, status, courses(name)")
    .order("created_at", { ascending: false });
  const withCaps = await computeMainRowCapacities(data || [], supabase);
  setSeries(withCaps);

  alert("Séance restaurée avec succès ✅");
}



  async function handleSave(e) {
    e?.preventDefault?.();
    const { course_id, start_date, end_date, start_time, duration_hours, capacity, booking_mode, days, status } = form;
    if (!course_id || !start_date || !end_date || !start_time || !days.length) {
      alert("Veuillez remplir tous les champs et choisir au moins un jour (Dimanche exclu).");
      return;
    }
    if (days.includes(1)) {
      alert("Dimanche est fermé.");
      return;
    }

    if (!editingId) {
      // CREATE: insert into session_series (DB trigger will generate sessions)
      const payload = {
        course_id,
        start_date,
        end_date,
        days_of_week: days,
        start_time,
        duration_hours,
        capacity,
        booking_mode,
        status: status || "active",
      };
      const { error } = await supabase.from("session_series").insert([payload]);
      if (error) {
        console.error(error);
        alert("Erreur lors de la création de la série : " + error.message);
        return;
      }
      await fetchSeries();
      resetForm();
      alert("✅ Série créée, séances générées !");
      return;
    }

    // UPDATE: update the series
    const updatePayload = {
      course_id,
      start_date,
      end_date,
      days_of_week: days,
      start_time,
      duration_hours,
      capacity,
      booking_mode,
      status,
    };
    const { error: upErr } = await supabase.from("session_series").update(updatePayload).eq("id", editingId);
    if (upErr) {
      console.error(upErr);
      alert("Erreur lors de la mise à jour de la série : " + upErr.message);
      return;
    }

    // Regenerate FUTURE sessions: delete future matching ones then insert new ones
    const today = new Date();
    const todayISO = toISODate(today);

    // 1) delete future sessions for this signature
    const { error: delErr } = await supabase
      .from("sessions")
      .delete()
      .eq("course_id", course_id)
      .eq("start_time", start_time)
      .gte("start_date", todayISO)
      .in("day_of_week", days);
    if (delErr) {
      console.error(delErr);
      alert("Série mise à jour (partielle). Erreur pendant la régénération des séances : " + delErr.message);
      await fetchSeries();
      resetForm();
      return;
    }

    // 2) generate future dates client-side and insert (respect Sunday exclusion)
    // Build map to count occurrences per month and per weekday
function isFifthWeekday(date, dow) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0..11

  // Count previous occurrences of the same weekday in the SAME month
  let count = 0;
  for (let d = 1; d <= date.getDate(); d++) {
    const test = new Date(y, m, d);
    const testDow = test.getDay() === 0 ? 1 : test.getDay() + 1; // convert 0–6 into 1–7

    if (testDow === dow) {
      count++;
    }
  }

  return count === 5; // true if this date is the 5th repeating weekday
}

const newRows = [];
const start = new Date(start_date);
const end = new Date(end_date);

for (const d of eachDay(start, end)) {
  const jsDow = d.getDay(); // 0=Sun..6=Sat
  const dow = jsDow === 0 ? 1 : jsDow + 1; // convert to 1..7
  const iso = toISODate(d);

  if (iso < todayISO) continue;
  if (dow === 1) continue;           // skip Sunday
  if (!days.includes(dow)) continue; // skip non-selected weekday

  // ⛔ NEW RULE: SKIP 5th weekday of the month
  if (isFifthWeekday(d, dow)) {
    console.log("Skipping 5th weekday", iso, "dow:", dow);
    continue;
  }

  // OK → create a real session
  newRows.push({
    course_id,
    start_date: iso,
    end_date: iso,
    day_of_week: dow,
    start_time,
    duration_hours,
    capacity,
    booking_mode,
    status: "active",
  });
}


    if (newRows.length) {
      const { error: insErr } = await supabase.from("sessions").insert(newRows);
      if (insErr) {
        console.error(insErr);
        alert("Série mise à jour (partielle). Erreur à l’insertion des nouvelles séances : " + insErr.message);
      }
    }

    await fetchSeries();
    // refresh expanded list if that row is open
    const row = series.find((r) => r.id === editingId);
    if (row) await loadSessionsForSeries({ ...row, ...updatePayload });
    resetForm();
    alert("✅ Série mise à jour et futures séances régénérées.");
  }

  async function handleDelete(row, e) {
  e?.stopPropagation?.();

  const confirmed = await showConfirm(
    "Supprimer cette série et ses séances associées ?"
  );
  if (!confirmed) return;

  // 1️⃣ Delete sessions
  const { error: delSessErr } = await supabase
    .from("sessions")
    .delete()
    .eq("course_id", row.course_id)
    .eq("start_time", row.start_time)
    .gte("start_date", row.start_date)
    .lte("start_date", row.end_date)
    .in("day_of_week", row.days_of_week || []);

  if (delSessErr) {
    console.error(delSessErr);
    await showAlert(
      "❌ Erreur lors de la suppression des séances : " + delSessErr.message
    );
    return;
  }

    const { error } = await supabase.from("session_series").delete().eq("id", row.id);
    if (error) {
      console.error(error);
      alert("Erreur lors de la suppression de la série : " + error.message);
      return;
    }

    // local update
    setSeries((list) => list.filter((s) => s.id !== row.id));
    setExpanded((ex) => {
      const n = { ...ex };
      delete n[row.id];
      return n;
    });
    const sb = { ...sessionsBySeries };
    delete sb[row.id];
    setSessionsBySeries(sb);
  }

  const courseNameById = useMemo(() => {
    const m = new Map();
    for (const c of courses) m.set(c.id, c.name);
    return m;
  }, [courses]);

  return (
    <div className="p-6">
      {/* Form */}
      <div className="bg-white border p-4 rounded shadow mb-6">
        <h3 className="font-semibold mb-3">
          {editingId ? "Modifier la série" : "Créer une série de séances"}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <label>
            Cours
            <select
              name="course_id"
              value={form.course_id}
              onChange={onFormChange}
              className="border p-1 rounded w-full"
            >
              <option value="">-- Choisir un cours --</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Début
            <input
              type="date"
              name="start_date"
              value={form.start_date}
              onChange={onFormChange}
              className="border p-1 rounded w-full"
            />
          </label>

          <label>
            Fin
            <input
              type="date"
              name="end_date"
              value={form.end_date}
              onChange={onFormChange}
              className="border p-1 rounded w-full"
            />
          </label>

          <label>
            Heure
            <input
              type="time"
              name="start_time"
              value={form.start_time}
              onChange={onFormChange}
              className="border p-1 rounded w-full"
            />
          </label>

          <label>
            Durée (h)
            <input
              type="number"
              name="duration_hours"
              value={form.duration_hours}
              onChange={onFormChange}
              className="border p-1 rounded w-full"
              min={1}
            />
          </label>

          <label>
            Capacité
            <input
              type="number"
              name="capacity"
              value={form.capacity}
              onChange={onFormChange}
              className="border p-1 rounded w-full"
              min={0}
            />
          </label>

          <label>
            Mode
            <select
              name="booking_mode"
              value={form.booking_mode}
              onChange={onFormChange}
              className="border p-1 rounded w-full"
            >
              <option value="allow">Ouvert</option>
              <option value="admin_only">Admin seulement</option>
            </select>
          </label>

          <div>
            <p className="font-medium">Jours (Dimanche exclu)</p>
            <div className="flex flex-wrap gap-3 mt-1">
              {[2, 3, 4, 5, 6, 7].map((d) => (
                <label key={d} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="days"
                    value={d}
                    checked={form.days.includes(d)}
                    onChange={onFormChange}
                  />
                  {DOW_LABEL[d]}
                </label>
              ))}
            </div>
          </div>

          <label>
            Statut
            <select
              name="status"
              value={form.status}
              onChange={onFormChange}
              className="border p-1 rounded w-full"
            >
              <option value="active">active</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {editingId ? "Mettre à jour" : "Créer la série"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              type="button"
            >
              Annuler l’édition
            </button>
          )}
        </div>
      </div>

      {/* Series list */}
      <h3 className="text-lg font-semibold mb-2">Séries existantes</h3>
      <table className="min-w-full bg-white border border-gray-200 shadow-sm rounded-lg">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-1 text-left">Cours</th>
            <th className="px-2 py-1 text-left">Jours</th>
            <th className="px-2 py-1">Début</th>
            <th className="px-2 py-1">Fin</th>
            <th className="px-2 py-1">Heure</th>
            <th className="px-2 py-1">Durée</th>
            <th className="px-2 py-1">Capacité</th>
            <th className="px-2 py-1">Mode</th>
            <th className="px-2 py-1">Statut</th>
            <th className="px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {series.map((row) => {
            const isOpen = !!expanded[row.id];
            const courseName = row.courses?.name || courseNameById.get(row.course_id) || "—";
            return (
              <FragmentRow
                key={row.id}
                row={row}
                isOpen={isOpen}
                courseName={courseName}
                onRowClick={() => onRowClick(row)}
                onEdit={(e) => startEditing(row, e)}
                onDelete={(e) => handleDelete(row, e)}
                sessions={sessionsBySeries[row.id] || []}
                onCancelSession={(sid, e) => cancelSession(sid, row.id, e)}
                onRestoreSession={(sid, e) => restoreSession(sid, row.id, e)}  
              />
            );
          })}
          {series.length === 0 && (
            <tr>
              <td colSpan={10} className="text-center py-4 text-gray-500">
                Aucune série trouvée.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({
  row,
  isOpen,
  courseName,
  onRowClick,
  onEdit,
  onDelete,
  sessions,
  onCancelSession,
  onRestoreSession,
}) {
  // Local hover state (per row)
  const [hoveredId, setHoveredId] = useState(null);
  const [studentsBySession, setStudentsBySession] = useState({}); // { [sessionId]: string[] }

  async function loadStudents(sessionId) {
    if (studentsBySession[sessionId]) return; // cache
    const { data, error } = await supabase
      .from("enrollments")
      .select("profiles(first_name, last_name)")
      .eq("session_id", sessionId)
      .eq("status", "active");

    if (error) {
      console.error("Error fetching enrolled students:", error.message);
      setStudentsBySession((m) => ({ ...m, [sessionId]: [] }));
      return;
    }

    const names = (data || []).map((d) => {
      const fn = d?.profiles?.first_name || "";
      const ln = d?.profiles?.last_name || "";
      return `${fn} ${ln}`.trim();
    });

    setStudentsBySession((m) => ({ ...m, [sessionId]: names }));
  }

  return (
    <>
      <tr
  className={`border-t cursor-pointer relative hover:bg-gray-50 ${isOpen ? "bg-gray-50" : ""}`}
  onClick={onRowClick}
  onMouseEnter={async () => {
    setHoveredId(row.id);
    // Load enrolled students for this whole series (all sessions)
    const { data, error } = await supabase
  .from("enrollments")
  .select(`
    profile_id,
    profiles (
      id,
      first_name,
      last_name,
      full_name
    )
  `)
  .in(
    "session_id",
    (
      await supabase
        .from("sessions")
        .select("id")
        .eq("course_id", row.course_id)
        .eq("start_time", row.start_time)
        .in("day_of_week", row.days_of_week || [])
        .neq("status", "cancelled")
    ).data?.map((r) => r.id) || []
  )
  .eq("status", "active");

if (!error && data) {
  setStudentsBySession((prev) => ({
    ...prev,
    [row.id]: data.map((d) => ({
      id: d.profiles?.id || d.profile_id, // ✅ keep a valid uuid here
      name:
        d.profiles?.full_name ||
        `${d.profiles?.first_name || ""} ${d.profiles?.last_name || ""}`.trim() ||
        "Nom inconnu",
    })),
  }));
}

}}
  onMouseLeave={() => setHoveredId(null)}
>

        <td className="px-2 py-2 relative group">
  {courseName}
  

  {hoveredId === row.id && studentsBySession[row.id]?.length > 0 && (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-white border border-gray-200 shadow-xl rounded-lg p-3 text-sm z-50 w-64
                 animate-fade-in"
    >
      {/* Decorative arrow */}
      <div className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-white drop-shadow"></div>

      <p className="font-semibold text-gray-800 border-b pb-1 mb-2 text-center">
        👥 Élèves inscrits ({studentsBySession[row.id].length})
      </p>

      <ul className="list-none pl-0 text-gray-700 space-y-1 max-h-40 overflow-y-auto">
  {studentsBySession[row.id].map((student, i) => (
    <li
      key={i}
      className="bg-gray-50 hover:bg-blue-100 rounded-md px-2 py-1 transition-colors cursor-pointer text-sm text-center"
      onClick={(e) => {
        e.stopPropagation();
        const uid = student.id;
        if (!uid) {
          alert("Profil introuvable pour cet élève.");
          return;
        }
        window.dispatchEvent(
          new CustomEvent("openUserProfile", { detail: { id: uid } })
        );
      }}
    >
      {student.name}
    </li>
  ))}
</ul>

    </div>
  )}
</td>


        <td className="px-2 py-2">{(row.days_of_week || []).map((d) => DOW_SHORT[d]).join(", ")}</td>
        <td className="px-2 py-2">{formatDateFrSafe(row.start_date)}</td>
        <td className="px-2 py-2">{formatDateFrSafe(row.end_date)}</td>
        <td className="px-2 py-2">{row.start_time}</td>
        <td className="px-2 py-2">{row.duration_hours}h</td>
        <td className="px-2 py-2">{row.capacity_remaining ?? row.capacity}</td>
        <td className="px-2 py-2">{row.booking_mode}</td>
        <td className="px-2 py-2">
          <span
            className={`px-2 py-1 rounded text-xs ${
              row.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {row.status}
          </span>
        </td>
        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2">
            <button className="px-2 py-1 bg-yellow-500 text-white rounded" onClick={onEdit}>
              Modifier
            </button>
            <button className="px-2 py-1 bg-red-600 text-white rounded" onClick={onDelete}>
              Supprimer
            </button>
          </div>
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td colSpan={10} className="bg-gray-50 px-2 py-3">
            <h4 className="font-semibold mb-2">Séances générées</h4>
            <table className="min-w-full border">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Heure</th>
                  <th className="p-2">Durée</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2">Statut</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b relative"
                    onMouseEnter={async () => {
                      setHoveredId(s.id);
                      await loadStudents(s.id);
                    }}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <td className="p-2 relative">
                      {formatDateFrSafe(s.start_date)}

                      {/* Tooltip */}
                      {hoveredId === s.id && (studentsBySession[s.id]?.length ?? 0) > 0 && (
                        <div className="absolute left-0 top-full mt-1 bg-white border shadow-lg rounded p-2 text-xs z-50 w-56">
                          <p className="font-semibold text-gray-700 mb-1">Élèves inscrits :</p>
                          <ul className="list-none pl-0 text-gray-700 space-y-1 max-h-40 overflow-y-auto">
  {studentsBySession[s.id]?.map((student, i) => (
  <li
    key={i}
    className="bg-gray-50 hover:bg-blue-100 rounded-md px-2 py-1 transition-colors cursor-pointer text-sm text-center"
    onClick={(e) => {
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent("openUserProfile", { detail: { id: student.id } })
      );
    }}
  >
    {student.name}
  </li>
))}

</ul>


                        </div>
                      )}
                    </td>

                    <td className="p-2">{s.start_time}</td>
                    <td className="p-2">{s.duration_hours}h</td>
                    <td className="p-2">{s.booking_mode}</td>
                    <td className="p-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          s.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="p-2">
                      {s.status === "active" && (
                        <button
                          onClick={(e) => onCancelSession(s.id, e)}
                          className="px-2 py-1 bg-red-500 text-white rounded"
                        >
                          Annuler
                        </button>
                      )}
                      {s.status === "cancelled" && (
                        <button
                          onClick={(e) => onRestoreSession(s.id, e)}
                          className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Restaurer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-3 text-gray-500 text-center">
                      Aucune séance dans cette plage.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
