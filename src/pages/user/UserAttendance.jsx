// src/pages/user/UserAttendance.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion } from "framer-motion";
import { formatDateFrSafe } from "../../lib/dateUtils";
import { FaQrcode } from "react-icons/fa";
import { useGlobalAlert } from "../../components/GlobalAlert";


export default function UserAttendance({ userId }) {
  const [sessions, setSessions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showAlert, showConfirm } = useGlobalAlert();


  // 1️⃣ Load parent + children safely
useEffect(() => {
  if (!userId) return;
  (async () => {
    setLoading(true);

    // ✅ Fetch parent
    const { data: parent, error: parentErr } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, parent_id, signup_type")
      .eq("id", userId)
      .maybeSingle();

    if (parentErr) {
      console.error("❌ Parent load error:", parentErr);
      setLoading(false);
      return;
    }

    // ✅ Fetch children
    const { data: kids, error: kidsErr } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, parent_id")
      .eq("parent_id", userId);

    if (kidsErr) {
      console.error("❌ Children load error:", kidsErr);
      setLoading(false);
      return;
    }

    setProfile(parent || null);
    setChildren(kids || []);

    let chosenProfile = null;
    if (parent?.signup_type === "children_only" && (kids?.length || 0) > 0) {
      chosenProfile = kids[0];
    } else {
      chosenProfile = parent || kids?.[0] || null;
    }

    // ✅ Fetch QR code from main profiles table
    if (chosenProfile?.id) {
      const { data: qrData, error: qrErr } = await supabase
        .from("profiles")
        .select("qr_code_url")
        .eq("id", chosenProfile.id)
        .maybeSingle();

      if (!qrErr && qrData) {
        chosenProfile.qr_code_url = qrData.qr_code_url;
      }
    }

    setSelectedProfile(chosenProfile);
    setSessions([]);
    setLoading(false);
  })();
}, [userId]);

// 👇 Fetch QR when selectedProfile changes
useEffect(() => {
  if (!selectedProfile?.id) return;
  (async () => {
    const { data: qrData, error: qrErr } = await supabase
      .from("profiles")
      .select("qr_code_url")
      .eq("id", selectedProfile.id)
      .maybeSingle();
    if (!qrErr && qrData) {
      setSelectedProfile((prev) => ({ ...prev, qr_code_url: qrData.qr_code_url }));
    }
  })();
}, [selectedProfile?.id]);


  // 2️⃣ Load attendance data for selected profile
  useEffect(() => {
    if (!selectedProfile) return;
    (async () => {
      setLoading(true);

      /** Load enrollments **/
      const { data: enrollments, error: enrollErr } = await supabase
        .from("enrollments")
        .select("id, profile_id, course_id, session_group, start_date, status, plan_id, plans:plan_id ( id, name, duration_unit, duration_value, course_type, plan_category )")
        .eq("profile_id", selectedProfile.id)
        .eq("status", "active");

      if (enrollErr) {
        console.error("❌ Enrollment load error:", enrollErr);
        setLoading(false);
        return;
      }

      if (!enrollments?.length) {
        setSessions([]);
        setLoading(false);
        return;
      }

      const sessionGroups = enrollments.map((e) => e.session_group);
      const enrollmentIds = enrollments.map((e) => e.id);

      /** Load sessions **/
      // Load all sessions for the session_groups
const { data: allSessions, error: sessErr } = await supabase
  .from("sessions")
  .select(
    "id, session_group, start_date, day_of_week, start_time, duration_hours, status"
  )
  .in("session_group", sessionGroups)
  .neq("status", "deleted")
  .order("start_date", { ascending: true });

if (sessErr) {
  console.error("❌ Session load error:", sessErr);
  setLoading(false);
  return;
}

// ✅ Filter sessions by each enrollment’s start_date
const isIntensif = (plan) => {
  const ct = String(plan?.course_type || "").toLowerCase();
  const pc = String(plan?.plan_category || "").toLowerCase();
  const nm = String(plan?.name || "").toLowerCase();
  return ct.includes("intensif") || pc.includes("intensif") || nm.includes("intensif");
};

const sessionsByGroup = {};
(allSessions || []).forEach((s) => {
  if (!sessionsByGroup[s.session_group]) sessionsByGroup[s.session_group] = [];
  sessionsByGroup[s.session_group].push(s);
});

// We need course names to detect intensif (you already build courseMap later)
// So build it earlier, before limiting:
const { data: courses } = await supabase.from("courses").select("id, name");
const courseMap = Object.fromEntries((courses || []).map((c) => [c.id, c.name]));

const sessionsData = [];
(enrollments || []).forEach((enroll) => {
  const rows = (sessionsByGroup[enroll.session_group] || []).filter(
    (s) => new Date(s.start_date) >= new Date(enroll.start_date)
  );

  let maxSessions = null;
  if (isIntensif(enroll?.plans)) {
    const unit = String(enroll?.plans?.duration_unit || "").toLowerCase();
    const val = Number(enroll?.plans?.duration_value || 0);
    if (val > 0 && (unit === "week" || unit === "weeks" || unit === "semaine" || unit === "semaines")) {
      maxSessions = val * 4;
    }
  }

  const finalRows = Number(maxSessions || 0) > 0 ? rows.slice(0, maxSessions) : rows;

  finalRows.forEach((r) => {
    sessionsData.push({
      ...r,
      __enrollment_id: enroll.id,
      __profile_id: enroll.profile_id,
      __course_id: enroll.course_id,
    });
  });
});


      /** Load attendance **/
      const { data: attendanceData, error: attErr } = await supabase
        .from("attendance")
        .select("enrollment_id, attended_on, status, check_in_time, check_out_time, marked_by")
        .in("enrollment_id", enrollmentIds);

      if (attErr) {
        console.error("❌ Attendance load error:", attErr);
      }

      const attendanceMap = {};
      (attendanceData || []).forEach((a) => {
        const key = `${a.enrollment_id}_${a.attended_on}`;
        attendanceMap[key] = a;
      });

      /** Merge **/
      const combined = (sessionsData || []).map((s) => {
  const a = attendanceMap[`${s.__enrollment_id}_${s.start_date}`];
  const normalizedStatus =
    a?.status === "excused" ? "unmarked" : a?.status || "unmarked";

  return {
    session_id: s.id,
    enrollment_id: s.__enrollment_id,
    profile_id: s.__profile_id,
    course_name: courseMap[s.__course_id] || "—",
    start_date: s.start_date,
    day_of_week: s.day_of_week,
    start_time: s.start_time,
    duration_hours: s.duration_hours,
    attendance_status: normalizedStatus,
    check_in_time: a?.check_in_time || null,
    check_out_time: a?.check_out_time || null,
    marked_by: a?.marked_by || "user",
  };
});


      setSessions(combined);
      setLoading(false);
    })();
  }, [selectedProfile]);

  /** === Mark absence === **/
  const markAbsent = async (enrollmentId, date, currentStatus) => {
  try {
    let question = "";

    if (currentStatus === "unmarked") {
      // User is about to mark ABSENT
      question = `Êtes-vous sûr de vouloir marquer « absent » pour le cours du ${formatDateFrSafe(date)} ?`;
    } else {
      // User is undoing → confirming presence
      question = `Voulez-vous reconfirmer votre présence pour le cours du ${formatDateFrSafe(date)} ?`;
    }

    const wants = await showConfirm(question);
    if (!wants) return;

    const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-absent`;

    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        enrollment_id: enrollmentId,
        attended_on: date,
        undo: currentStatus === "absent", // undo only when already absent
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unknown error");

    // Update UI
    setSessions((prev) =>
      prev.map((s) =>
        s.enrollment_id === enrollmentId && s.start_date === date
          ? {
              ...s,
              attendance_status:
                currentStatus === "absent" ? "unmarked" : "absent",
              check_in_time: null,
              check_out_time: null,
            }
          : s
      )
    );

    await showAlert(data.message);

  } catch (err) {
    await showAlert("❌ Erreur lors du marquage : " + err.message);
  }
};


  /** === Utility functions === **/
  const dayLabel = (d) => {
    const days = [
      "Dimanche",
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
    ];
    return days[(d - 1 + 7) % 7] || "—";
  };

  const addHoursToTimeStr = (timeStr, hoursToAdd) => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    const base = new Date(2000, 0, 1, h, m);
    base.setHours(base.getHours() + (hoursToAdd || 1));
    return `${String(base.getHours()).padStart(2, "0")}:${String(
      base.getMinutes()
    ).padStart(2, "0")}`;
  };

  if (loading) return <div className="p-6 text-center">Chargement…</div>;

  // === Build selectable profiles (parent + children) ===
  const selectable = [
    ...(profile?.signup_type === "children_only" ? [] : [profile]),
    ...(children || []),
  ].filter(Boolean);

  return (
    <div className="p-6 space-y-6">
      {/* === QR Code Section === */}
      <motion.div
        className="p-6 bg-white rounded-2xl shadow text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-2xl font-bold text-gray-800 flex items-center justify-center gap-2">
          <FaQrcode className="text-aquaBlue" /> Section présence
        </h2>

        {/* Dropdown or static full name */}
        {selectable.length > 1 ? (
          <div className="mt-3 flex justify-center">
            <select
              value={selectedProfile?.id || ""}
              onChange={(e) => {
                const p = selectable.find((x) => x.id === e.target.value);
                setSelectedProfile(p || null);
              }}
              className="bg-white text-gray-700 border-none rounded-lg px-4 py-2 text-sm font-medium shadow focus:ring-4 focus:ring-blue-200 transition text-center"
            >
              {selectable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-lg font-semibold mt-2">
            {selectable[0]?.full_name ?? "—"}
          </p>
        )}

        {selectedProfile?.qr_code_url ? (
          <img
            src={selectedProfile.qr_code_url}
            alt="QR Code"
            className="hidden md:block mx-auto w-40 h-40 border border-gray-200 rounded-xl mt-3"
          />
        ) : (
          <p className="text-gray-500 italic mt-3">Aucun code disponible</p>
        )}
      </motion.div>

      {/* === Sessions Table === */}
      <div className="hidden md:block bg-white p-4 rounded-lg shadow overflow-x-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          Liste des séances
        </h3>
        <table className="min-w-[1000px] text-sm border-collapse">
          <thead className="bg-aquaBlue text-white">
            <tr>
              <th className="px-4 py-2 text-left">Cours</th>
              <th className="px-4 py-2 text-left">Jour</th>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Heure</th>
              <th className="px-4 py-2 text-center">Présent</th>
              <th className="px-4 py-2 text-center">Absent</th>
              <th className="px-4 py-2 text-center">Entrée</th>
              <th className="px-4 py-2 text-center">Sortie</th>
              <th className="px-4 py-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td
                  colSpan="9"
                  className="text-center py-4 text-gray-500 italic"
                >
                  Aucune séance trouvée
                </td>
              </tr>
            )}

            {sessions.map((s) => (
              <tr key={s.session_id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-semibold text-blue-700">
                  {s.course_name || "—"}
                </td>
                <td className="px-4 py-2">{dayLabel(s.day_of_week)}</td>
                <td className="px-4 py-2">{formatDateFrSafe(s.start_date)}</td>
                <td className="px-4 py-2">
                  {s.start_time?.slice(0, 5)}–
                  {addHoursToTimeStr(s.start_time, s.duration_hours)}
                </td>

                <td className="px-4 py-2 text-center">
                  {s.attendance_status === "present" ? "✔" : "-"}
                </td>
                <td className="px-4 py-2 text-center">
                  {s.attendance_status === "absent" ? "✘" : "-"}
                </td>

                <td className="px-4 py-2 text-center">
                  {s.check_in_time
                    ? new Date(s.check_in_time).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </td>
                <td className="px-4 py-2 text-center">
                  {s.check_out_time
                    ? new Date(s.check_out_time).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </td>

                <td className="px-4 py-2 text-center">
                  {s.attendance_status === "absent" && s.marked_by === "user" ? (
                    <button
                      onClick={() =>
                        markAbsent(s.enrollment_id, s.start_date, "absent")
                      }
                      className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs"
                    >
                      Undo
                    </button>
                  ) : s.attendance_status === "unmarked" ? (
                    <button
                      onClick={() =>
                        markAbsent(s.enrollment_id, s.start_date, "unmarked")
                      }
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                    >
                      Marquer absent
                    </button>
                  ) : (
                    <span className="text-gray-400 text-xs italic">—</span>
                  )}
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 📱 Mobile attendance cards */}
<div className="md:hidden space-y-4">
  {sessions.length === 0 && (
    <p className="text-center text-gray-500 italic">
      Aucune séance trouvée
    </p>
  )}

  {sessions.map((s) => (
    <div
      key={s.session_id}
      className="bg-white rounded-xl shadow p-4 border space-y-3"
    >
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-blue-700">
            {s.course_name || "—"}
          </p>
          <p className="text-xs text-gray-500">
            {dayLabel(s.day_of_week)} · {formatDateFrSafe(s.start_date)}
          </p>
          <p className="text-xs text-gray-500">
            {s.start_time?.slice(0, 5)}–
            {addHoursToTimeStr(s.start_time, s.duration_hours)}
          </p>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            s.attendance_status === "absent"
              ? "bg-red-100 text-red-700"
              : s.attendance_status === "present"
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {s.attendance_status === "absent"
            ? "Absent"
            : s.attendance_status === "present"
            ? "Présent"
            : "Non marqué"}
        </span>
      </div>

      {/* Check-in / out */}
      <div className="text-xs text-gray-600 flex justify-between">
        <div>
          <b>Entrée :</b>{" "}
          {s.check_in_time
            ? new Date(s.check_in_time).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </div>
        <div>
          <b>Sortie :</b>{" "}
          {s.check_out_time
            ? new Date(s.check_out_time).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </div>
      </div>

      {/* Action */}
      <div>
        {s.attendance_status === "absent" && s.marked_by === "user" ? (
          <button
            onClick={() =>
              markAbsent(s.enrollment_id, s.start_date, "absent")
            }
            className="w-full bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg text-sm"
          >
            Annuler l’absence
          </button>
        ) : s.attendance_status === "unmarked" ? (
          <button
            onClick={() =>
              markAbsent(s.enrollment_id, s.start_date, "unmarked")
            }
            className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm"
          >
            Marquer absent
          </button>
        ) : (
          <p className="text-center text-gray-400 text-sm italic">
            Action non disponible
          </p>
        )}
      </div>
    </div>
  ))}
</div>

    </div>
  );
}
