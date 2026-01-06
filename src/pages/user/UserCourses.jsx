import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";


export default function UserCourses({ userId }) {
  const [profile, setProfile] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showConfirm, showAlert, showInput } = useGlobalAlert();


  // 1️⃣ Fetch parent + children
useEffect(() => {
  (async () => {
    const { data: parent } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, parent_id, signup_type")
      .eq("id", userId)
      .maybeSingle();

    const { data: kids } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, parent_id")
      .eq("parent_id", userId);

    setProfile(parent || null);
    setChildren(kids || []);

    // ✅ Default selection logic
    if (parent?.signup_type === "children_only" && kids?.length > 0) {
      setSelectedProfile(kids[0]);
    } else {
      setSelectedProfile(parent || kids[0] || null);
    }

    setExpandedCourse(null);
    setEnrollments([]); // reset to force fresh fetch
    setLoading(false);
  })();
}, [userId]);


  // 2️⃣ Fetch enrollments of selected profile
  useEffect(() => {
    const fetchEnrollments = async () => {
      if (!selectedProfile) return;
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          id,
          status,
          start_date,
          enrolled_at,
          profile_id,
          session_id,
          session_group,
          course_id,
          plan_id,
          override_price,
          type,
          profiles:profile_id ( full_name ),
          courses:course_id ( name ),
          plans:plan_id ( id, name, price, duration_hours ),
          sessions:session_id ( id, day_of_week, start_time )
        `)
        .eq("profile_id", selectedProfile.id)
        .order("start_date", { ascending: false });

      if (error) console.error("Error loading enrollments:", error);
      setEnrollments(data || []);
    };
    fetchEnrollments();
  }, [selectedProfile]);

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

  const toggleExpand = (courseId) => {
    setExpandedCourse(expandedCourse === courseId ? null : courseId);
  };

  if (loading) return <div className="p-6">Chargement…</div>;
  if (!profile)
    return <div className="p-6 text-red-600">Profil introuvable.</div>;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-orange-400 text-white rounded-2xl shadow-lg py-8 px-6 text-center space-y-4">
        <h2 className="text-3xl font-bold tracking-wide drop-shadow-sm">
          Mes Cours
        </h2>

        {(() => {
  // ✅ Build the list of selectable profiles
  const selectable = [
    ...(profile?.signup_type === "children_only" ? [] : [profile]),
    ...(children || []),
  ].filter(Boolean);

  if (selectable.length > 1) {
    return (
      <div className="flex justify-center">
        <select
          value={selectedProfile?.id || ""}
          onChange={(e) => {
            const p = selectable.find((x) => x.id === e.target.value);
            setSelectedProfile(p || null);
          }}
          className="w-full sm:w-50 bg-white text-gray-700 border-none rounded-lg px-4 py-2 text-sm font-medium shadow focus:ring-4 focus:ring-blue-200 transition text-center"
        >
          {selectable.map((p) => (
            <option key={p.id} value={p.id} className="text-center">
              {p.full_name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Only one valid profile (either parent or first child)
  return (
    <p className="text-lg font-semibold">
      {selectable[0]?.full_name ?? "—"}
    </p>
  );
})()}

      </div>

      {/* Enrollment Table */}
      <div className="hidden md:block bg-white p-4 rounded-lg shadow overflow-x-auto">
        <table className="min-w-[900px] text-sm border-collapse">
        <thead className="bg-aquaBlue text-white">
          <tr>
            <th className="px-4 py-2 text-left">Cours</th>
            <th className="px-4 py-2 text-left">Jour</th>
            <th className="px-4 py-2 text-left">Heure</th>
            <th className="px-4 py-2 text-left">Début</th>
            <th className="px-4 py-2 text-left">Statut</th>
            <th className="px-4 py-2 text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {enrollments.map((e) => (
            <>
        <tr
          key={e.id}
          className="border-t hover:bg-gray-50 cursor-pointer"
          onClick={() => toggleExpand(e.course_id)}
        >
          <td className="px-4 py-2 font-semibold text-blue-700">
            {e.courses?.name || "—"}
          </td>
          <td className="px-4 py-2">{dayLabel(e.sessions?.day_of_week)}</td>
          <td className="px-4 py-2">
            {e.sessions?.start_time?.slice(0, 5)}–
            {addHoursToTimeStr(e.sessions?.start_time, e.plans?.duration_hours)}
          </td>
          <td className="px-4 py-2">{formatDateFrSafe(e.start_date)}</td>
          <td className="px-4 py-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                e.status === "active"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {e.status}
            </span>
          </td>

          {/* ✅ New “Annuler inscription” button */}
          <td className="px-4 py-2">
            {e.status === "active" ? (
              <button
                onClick={async (ev) => {
                  ev.stopPropagation(); // prevent expand toggle
                  const wantsCancel = await showConfirm(
                    `Voulez-vous vraiment annuler l'enregistrement à ${e.courses?.name}?`
                  );
                  if (!wantsCancel) return;
                  const { data, error } = await supabase.rpc(
                    "cancel_enrollment",
                    {
                      p_enrollment_id: e.id,
                      p_user_id: selectedProfile.id,
                    }
                  );

                  if (error) {
                    await showAlert(`❌ ${error.message}`);
                    return;
                  }

                  if (typeof data === "string" && data.startsWith("❌")) {
                    await showAlert(data);
                    return;
                  }

                  await showAlert(data);

                  // Reload enrollments
                    const { data: newEnrolls } = await supabase
                      .from("enrollments")
                      .select(
                        `
                        id, status, start_date, enrolled_at, profile_id,
                        session_id, course_id, plan_id,
                        profiles:profile_id ( full_name ),
                        courses:course_id ( name ),
                        plans:plan_id ( id, name, price, duration_hours ),
                        sessions:session_id ( id, day_of_week, start_time )
                      `
                      )
                      .eq("profile_id", selectedProfile.id);
                    setEnrollments(newEnrolls || []);
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-xs sm:text-xs"
              >
                Annuler enregistrement
              </button>
            ) : (
              <span className="text-gray-400 text-xs italic">—</span>
            )}
          </td>
        </tr>

        {/* Expanded sessions */}
        {expandedCourse === e.course_id && (
          <tr className="bg-gray-50">
            <td colSpan={6} className="p-0">
              <SessionsList
                sessionGroup={e.session_group}
                enrollmentStart={e.start_date}
                planDuration={e.plans?.duration_hours}
                userStartTime={e.sessions?.start_time}
              />
            </td>
          </tr>
        )}
      </>
    ))}

    {!enrollments.length && (
      <tr>
        <td colSpan={6} className="text-center py-4 text-gray-500 italic">
          Aucune inscription trouvée
        </td>
      </tr>
    )}
  </tbody>
</table>

      </div>
      {/* 📱 Mobile cards */}
<div className="md:hidden space-y-4">
  {enrollments.map((e) => {
    const isExpanded = expandedCourse === e.course_id;

    return (
      <div
        key={e.id}
        className="bg-white rounded-xl shadow p-4 space-y-3 border"
      >
        {/* Header */}
        <div
          className="flex justify-between items-start cursor-pointer"
          onClick={() => toggleExpand(e.course_id)}
        >
          <div>
            <p className="text-sm font-semibold text-blue-700">
              {e.courses?.name}
            </p>
            <p className="text-xs text-gray-500">
              {dayLabel(e.sessions?.day_of_week)} ·{" "}
              {e.sessions?.start_time?.slice(0, 5)}–
              {addHoursToTimeStr(
                e.sessions?.start_time,
                e.plans?.duration_hours
              )}
            </p>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              e.status === "active"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {e.status}
          </span>
        </div>

        {/* Meta */}
        <div className="text-xs text-gray-600">
          <div>
            <b>Début :</b> {formatDateFrSafe(e.start_date)}
          </div>
          <div>
            <b>Plan :</b> {e.plans?.name}
          </div>
        </div>

        {/* Actions */}
        {e.status === "active" && (
          <button
            className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm"
            onClick={async (ev) => {
              ev.stopPropagation();

              const wantsCancel = await showConfirm(
                `Voulez-vous vraiment annuler l'enregistrement à ${e.courses?.name}?`
              );
              if (!wantsCancel) return;

              const { data, error } = await supabase.rpc("cancel_enrollment", {
                p_enrollment_id: e.id,
                p_user_id: selectedProfile.id,
              });

              if (error || (typeof data === "string" && data.startsWith("❌"))) {
                await showAlert(error?.message || data);
                return;
              }

              await showAlert(data);

              const { data: refreshed } = await supabase
                .from("enrollments")
                .select(
                  `
                  id, status, start_date, enrolled_at, profile_id,
                  session_id, session_group, course_id, plan_id,
                  profiles:profile_id ( full_name ),
                  courses:course_id ( name ),
                  plans:plan_id ( id, name, price, duration_hours ),
                  sessions:session_id ( id, day_of_week, start_time )
                `
                )
                .eq("profile_id", selectedProfile.id);

              setEnrollments(refreshed || []);
            }}
          >
            Annuler l'inscription
          </button>
        )}

        {/* Expanded sessions */}
        {isExpanded && (
          <div className="border-t pt-3">
            <SessionsList
              sessionGroup={e.session_group}
              enrollmentStart={e.start_date}
              planDuration={e.plans?.duration_hours}
              userStartTime={e.sessions?.start_time}
            />
          </div>
        )}
      </div>
    );
  })}

  {!enrollments.length && (
    <p className="text-center text-gray-500 italic">
      Aucune inscription trouvée
    </p>
  )}
</div>

    </div>
  );
}

// 📋 Updated UI ONLY
function SessionsList({ sessionGroup, enrollmentStart, planDuration, userStartTime }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
  const fetchSessions = async () => {
    if (!sessionGroup) return;
    const { data, error } = await supabase
      .from("sessions")
      .select("id, day_of_week, start_time, duration_hours, start_date, status")
      .eq("session_group", sessionGroup)
      .neq("status", "deleted")
      .gte("start_date", enrollmentStart) // only show sessions after enrollment date
      .order("start_date", { ascending: true });

    if (error) console.error("Error fetching sessions:", error);
    setSessions(data || []);
  };
  fetchSessions();
}, [sessionGroup, enrollmentStart]);


  const dayLabel = (d) =>
    ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"][
      (d - 1 + 7) % 7
    ];

  const addHoursToTimeStr = (timeStr, hoursToAdd) => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    const base = new Date(2000, 0, 1, h, m);
    base.setHours(base.getHours() + (hoursToAdd || 1));
    return `${String(base.getHours()).padStart(2, "0")}:${String(
      base.getMinutes()
    ).padStart(2, "0")}`;
  };

  return (
    <div className="overflow-x-auto">
    <table className="min-w-full text-sm bg-gray-50">
      <thead>
        <tr className="text-gray-600 border-b">
          <th className="w-60 px-6 py-2 text-left"></th>
          <th className="px-6 py-2 text-left">Jour</th>
          <th className="px-6 py-2 text-left">Date</th>
          <th className="px-6 py-2 text-left">Heure</th>
          <th className="px-6 py-2 text-left">Statut</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((s, i) => (   // ✅ include index i
          <tr key={s.id} className="border-b">
            <td className="px-6 py-2"></td>
            <td className="px-6 py-2">{dayLabel(s.day_of_week)}</td>
            <td className="px-6 py-2">
              {userStartTime?.slice(0, 5)}–
              {addHoursToTimeStr(userStartTime, planDuration)}
            </td>
            <td className="px-6 py-2">
              {formatDateFrSafe(i === 0 ? enrollmentStart : s.start_date)}
            </td>
            <td className="px-6 py-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  s.status === "cancelled"
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {s.status === "cancelled" ? "Session annulée" : "Active"}
              </span>
            </td>
          </tr>
        ))}

        {!sessions.length && (
          <tr>
            <td colSpan={5} className="text-center text-gray-500 italic py-2">
              Aucune session disponible
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
  );
}
