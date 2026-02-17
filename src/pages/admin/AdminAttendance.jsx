import { useState, useEffect, useMemo, useRef, Fragment} from "react";
import { supabase } from "../../lib/supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";
import { formatDateFrSafe, formatMonth } from "../../lib/dateUtils";
import { FaDollarSign } from "react-icons/fa";
import { useAuth } from "../../context/AuthContext";


// Haiti = UTC-5
function getHaitiDateISO(dateString) {
  const d = new Date(dateString + "T00:00:00");
  const haiti = new Date(
    d.toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
  );
  // Return YYYY-MM-DD corrected for Haiti timezone
  return haiti.toISOString().split("T")[0];
}



export default function AdminAttendance() {
  const [cours, setCours] = useState([]);
  const [coursSelectionne, setCoursSelectionne] = useState("");
  const [date, setDate] = useState(() => {
  const today = new Date();
  return new Date(
    today.toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
  )
    .toISOString()
    .split("T")[0];
});
  const [sessions, setSessions] = useState([]);
  const [resumeMensuel, setResumeMensuel] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState(null);
  const [modalEnrollment, setModalEnrollment] = useState(null);
  const [modalSessionStartISO, setModalSessionStartISO] = useState(null);
  const [globalErreur, setGlobalErreur] = useState("");
  const [globalResult, setGlobalResult] = useState("");
  const [modalErreur, setModalErreur] = useState("");
  const [modalResult, setModalResult] = useState("");
  const lastScanTime = useRef(0);
  const [nameFilter, setNameFilter] = useState("");
  const { user, profile } = useAuth();
  const [role, setRole] = useState(null);
  // ✅ Staff attendance (teachers + assistant)
  const [staffList, setStaffList] = useState([]);
  const [staffMap, setStaffMap] = useState({}); // profile_id -> attendance row
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffMonthlyRows, setStaffMonthlyRows] = useState([]);
  const [staffMonthlyLoading, setStaffMonthlyLoading] = useState(false);


useEffect(() => {
  async function fetchRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!error && data) {
      setRole(data.role);
    }
  }

  fetchRole();
}, []);

  const isAdmin = role === "admin";
  const isAssistant = role === "assistant";
const isStaff = role === "admin" || role === "teacher" || role === "assistant";
const canSeeMonthlySummary = role === "admin" || role === "assistant";
const canSeeStaffDaily = role === "admin" || role === "assistant"; // ✅ admin + assistant
const canSeeStaffMonthly = role === "admin"; // ✅ ONLY admin





  const fmtHeure = (t) =>
    t ? new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";

  const fmtJour = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR") : "—";


  const jourSemaine = useMemo(() => {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("fr-FR", { weekday: "long" });
  }, [date]);

  const ajouterHeures = (hhmm, duree) => {
    if (!hhmm || duree == null) return null;
    const [h, m] = hhmm.split(":").map(Number);
    const base = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    base.setHours(base.getHours() + Number(duree || 0));
    return base.toTimeString().slice(0, 5);
  };

  const toSessionStartISO = (start_time_hhmm) => {
    if (!start_time_hhmm) return null;
    const [hh, mm] = start_time_hhmm.split(":").map(Number);
    const d = new Date(date + "T00:00:00");
    d.setHours(hh || 0, mm || 0, 0, 0);
    return d.toISOString();
  };

  // Auto-dismiss global messages after 3s
  useEffect(() => {
    if (globalErreur || globalResult) {
      const timer = setTimeout(() => {
        setGlobalErreur("");
        setGlobalResult("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [globalErreur, globalResult]);

  // Auto-dismiss modal messages after 3s
  useEffect(() => {
    if (modalErreur || modalResult) {
      const timer = setTimeout(() => {
        setModalErreur("");
        setModalResult("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [modalErreur, modalResult]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("courses").select("id, name").order("name");
      setCours(data || []);
    })();
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(
  new Date().getMonth() + 1 // 1–12
);
const [selectedYear, setSelectedYear] = useState(
  new Date().getFullYear()
);

const fetchStaffAttendance = async () => {
  const dayISO = getHaitiDateISO(date);

  setStaffLoading(true);
  try {
    // 1) Get staff profiles
    const { data: staff, error: staffErr } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["teacher", "assistant"])
      .order("full_name", { ascending: true });

      console.log("STAFF RESULT:", staff, staffErr);


    if (staffErr) throw staffErr;

// ✅ ALWAYS show staff list even if attendance table/view is missing
setStaffList(staff || []);

// 2) Get staff attendance for the selected day
const { data: pres, error: presErr } = await supabase
  .from("staff_attendance")
  .select("profile_id, attended_on, status, check_in_time, check_out_time")
  .eq("attended_on", dayISO);

// ✅ If the table doesn't exist yet, don't hide staff list
if (presErr) {
  console.error("staff_attendance missing or blocked:", presErr.message);
  setStaffMap({});
  return;
}

const map = {};
(pres || []).forEach((p) => {
  map[p.profile_id] = p;
});

setStaffMap(map);

  } catch (e) {
    console.error("fetchStaffAttendance error:", e.message);
  } finally {
    setStaffLoading(false);
  }
};

const fetchStaffMonthlySummary = async () => {
  setStaffMonthlyLoading(true);

  try {
    // Haiti-safe month boundaries (YYYY-MM-DD)
    const startISO = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const endISO = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
    // If selectedMonth = 12, JS won't auto-roll here, so do it properly:
    const endDate = new Date(selectedYear, selectedMonth, 1); // next month
    const endISO2 = endDate.toLocaleDateString("en-CA", { timeZone: "America/Port-au-Prince" }); // YYYY-MM-DD

    // 1) Get staff list (teachers + assistant)
    const { data: staff, error: sErr } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["teacher", "assistant"])
      .order("full_name", { ascending: true });

    if (sErr) throw sErr;

    const nameMap = {};
    const roleMap = {};
    (staff || []).forEach((p) => {
      nameMap[p.id] = p.full_name || "—";
      roleMap[p.id] = p.role;
    });

    const staffIds = (staff || []).map((p) => p.id);
    if (!staffIds.length) {
      setStaffMonthlyRows([]);
      return;
    }

    // 2) Fetch attendance rows for that month (teachers + assistant)
    const { data: rows, error: aErr } = await supabase
      .from("staff_attendance")
      .select("profile_id, attended_on, check_in_time, monthly_first_count, is_monthly_top_first")
      .in("profile_id", staffIds)
      .gte("attended_on", startISO)
      .lt("attended_on", endISO2)
      .not("check_in_time", "is", null)
      .order("attended_on", { ascending: true })
      .order("check_in_time", { ascending: true });

    if (aErr) {
      console.error("staff_attendance monthly blocked/missing:", aErr.message);
      setStaffMonthlyRows([]);
      return;
    }

    // 3) Compute "arrived first" ONLY among teachers
    const firstByDayTeacherOnly = {};
    (rows || []).forEach((r) => {
      const day = r.attended_on;
      const role = roleMap[r.profile_id];
      if (role !== "teacher") return; // ✅ ignore assistants for "first"

      const t = r.check_in_time ? new Date(r.check_in_time).getTime() : null;
      if (!day || !t) return;

      if (!firstByDayTeacherOnly[day] || t < firstByDayTeacherOnly[day].t) {
        firstByDayTeacherOnly[day] = { profile_id: r.profile_id, t };
      }
    });

    // 4) Build display rows (include assistant too, but is_first only for teachers)
    const out = (rows || []).map((r) => {
      const day = r.attended_on;
      const role = roleMap[r.profile_id];

      const isFirstTeacher =
        role === "teacher" &&
        firstByDayTeacherOnly[day]?.profile_id === r.profile_id;

      return {
        profile_id: r.profile_id,
        full_name: nameMap[r.profile_id] || "—",
        role,
        attended_on: day,
        check_in_time: r.check_in_time,
        is_first: isFirstTeacher,
        // ✅ monthly leader info (from DB)
        monthly_first_count: r.monthly_first_count ?? 0,
        is_monthly_top_first: !!r.is_monthly_top_first,
      };
    });

    setStaffMonthlyRows(out);
  } catch (e) {
    console.error("fetchStaffMonthlySummary error:", e.message);
    setStaffMonthlyRows([]);
  } finally {
    setStaffMonthlyLoading(false);
  }
};




  const fetchSessions = async () => {
    setChargement(true);
    setErreur("");
    try {
      const { data: sessData, error: sessErr } = await supabase
        .from("sessions")
        .select(`
          id,
          course:course_id ( name ),
          start_date,
          start_time,
          duration_hours,
          day_of_week,
          session_group,
          status
        `)
        .eq("start_date", getHaitiDateISO(date))
        .order("start_time", { ascending: true });
      if (sessErr) throw sessErr;
      if (!sessData?.length) return setSessions([]);

      const groupIds = [...new Set(sessData.map((s) => s.session_group).filter(Boolean))];
      if (!groupIds.length) return setSessions([]);

      const dayISO = getHaitiDateISO(date);

      const { data: enrData } = await supabase
        .from("enrollments")
        .select(`
          id,
          status,
          profile_id,
          session_group,
          course_id,
          plan_id,
          start_date,
          end_date,
          profiles_with_unpaid!inner (
            id,
            full_name,
            has_unpaid
          ),
          courses:course_id ( name ),
          plans:plan_id ( duration_hours )
        `)
        .in("session_group", groupIds)
        .eq("status", "active")
        .lte("start_date", dayISO)
        .or(`end_date.is.null,end_date.gte.${dayISO}`);

      const { data: presences } = await supabase
        .from("attendance")
        .select("enrollment_id, status, check_in_time, check_out_time, attended_on")
        .eq("attended_on", dayISO);

      const mapPresences = {};
      (presences || []).forEach((p) => (mapPresences[p.enrollment_id] = p));

      const grouped = (enrData || []).reduce((acc, row) => {
        const gid = row.session_group;
        acc[gid] = acc[gid] || [];
        acc[gid].push({
          enrollment_id: row.id,
          nom: row.profiles_with_unpaid?.full_name || "—",
          has_unpaid: row.profiles_with_unpaid?.has_unpaid || false,
          cours: row.courses?.name,
          duree: row.plans?.duration_hours || 1,
          presence: mapPresences[row.id] || null,
        });
        return acc;
      }, {});

      const merged = sessData.map((s) => ({
        ...s,
        inscriptions: grouped[s.session_group] || [],
      }));

      const filtered =
        coursSelectionne && coursSelectionne.trim()
          ? merged.filter((m) => m.course?.name === coursSelectionne)
          : merged;

      setSessions(filtered);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [date, coursSelectionne]);

  useEffect(() => {
  if (!canSeeStaffDaily) return;
  fetchStaffAttendance();
}, [date, canSeeStaffDaily]);


  const saveAttendanceWithRules = async (enrollment_id, action, sessionStartISO) => {
    const dayISO = getHaitiDateISO(date);
    const now = new Date();
    const start = sessionStartISO ? new Date(sessionStartISO) : null;
    const decideStatus = () => {
      if (!start) return "present";
      const diffMin = Math.floor((now - start) / 60000);
      return diffMin <= 15 ? "present" : "late";
    };

    const { data: exist } = await supabase
      .from("attendance")
      .select("id, status, check_in_time, check_out_time")
      .eq("enrollment_id", enrollment_id)
      .eq("attended_on", dayISO)
      .maybeSingle();

    if (action === "check-in") {
      const newStatus = decideStatus();
      if (!exist) {
        await supabase.from("attendance").insert([
          { enrollment_id, attended_on: dayISO, status: newStatus, check_in_time: now.toISOString() },
        ]);
      } else {
        const patch = {};
        if (!exist.check_in_time) patch.check_in_time = now.toISOString();
        if (exist.status === "absent") patch.status = newStatus;
        await supabase.from("attendance").update(patch).eq("id", exist.id);
      }
    } else if (action === "check-out") {
      if (!exist) {
        const impliedStatus = decideStatus();
        await supabase.from("attendance").insert([
          {
            enrollment_id,
            attended_on: dayISO,
            status: impliedStatus,
            check_in_time: now.toISOString(),
            check_out_time: now.toISOString(),
          },
        ]);
      } else {
        const patch = { check_out_time: now.toISOString() };
        if (exist.status === "absent" && !exist.check_in_time) {
          patch.status = decideStatus();
          patch.check_in_time = now.toISOString();
        }
        await supabase.from("attendance").update(patch).eq("id", exist.id);
      }
          } else if (action === "mark-absent") {
      // Mark student as ABSENT manually
      const { data: existAbsent } = await supabase
        .from("attendance")
        .select("id")
        .eq("enrollment_id", enrollment_id)
        .eq("attended_on", dayISO)
        .maybeSingle();

      if (!existAbsent) {
        await supabase.from("attendance").insert([
          {
            enrollment_id,
            attended_on: dayISO,
            status: "absent",
            check_in_time: null,
            check_out_time: null,
          },
        ]);
      } else {
        await supabase
          .from("attendance")
          .update({
            status: "absent",
            check_in_time: null,
            check_out_time: null,
          })
          .eq("id", existAbsent.id);
      }
    } else if (action === "undo-checkin") {
      await supabase
        .from("attendance")
        .delete()
        .eq("enrollment_id", enrollment_id)
        .eq("attended_on", dayISO);
    } else if (action === "undo-checkout") {
      await supabase
        .from("attendance")
        .update({ check_out_time: null })
        .eq("enrollment_id", enrollment_id)
        .eq("attended_on", dayISO);
    }

    await fetchSessions();
    await fetchResumeMensuel();
  };

  const handleStaffScan = async (text) => {
  if (typeof text !== "string" || !text.trim()) return;

  const nowMs = Date.now();
  if (nowMs - lastScanTime.current < 3000) return;
  lastScanTime.current = nowMs;

  setModalErreur("");
  setModalResult("");

  // 🔹 Extract UUID from ANY QR content
  const match = String(text).match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/
  );

  if (!match) {
    setModalErreur("⚠️ QR code invalide.");
    return;
  }

  const profile_id = match[0];

  // ✅ Prevent teacher/assistant from scanning their own QR
  if (!isAdmin && user?.id && profile_id === user.id) {
    setModalErreur("⚠️ Vous ne pouvez pas scanner votre propre QR code.");
    return;
  }

  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      setModalErreur("⚠️ Session expirée. Veuillez vous reconnecter.");
      return;
    }

    // ✅ This assumes you have an edge function for staff attendance
    const { data, error } = await supabase.functions.invoke("record-staff-attendance", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { profile_id, selected_date: getHaitiDateISO(date) },
    });

    if (error) {
      setModalErreur(error.message || "Erreur lors du scan.");
      return;
    }
    if (data?.error) {
      setModalErreur(data.error);
      return;
    }

    setModalResult(data?.message || "✅ Présence staff enregistrée !");
    await fetchStaffAttendance();

    // Close only if not global scan
    if (modalAction !== "scan-global") closeModal();
  } catch (err) {
    setModalErreur("Erreur lors du scan : " + err.message);
  }
};


  // ✅ lightweight scan handler (no infinite reloads, no double check-in)
// ✅ QR SCAN → EDGE FUNCTION ONLY
const handleScan = async (text) => {
  console.log("📸 SCAN RAW TEXT:", text); 
  if (typeof text !== "string" || !text.trim()) return;

  const nowMs = Date.now();
  if (nowMs - lastScanTime.current < 3000) return;
  lastScanTime.current = nowMs;

  setGlobalErreur("");
  setGlobalResult("");

  // 🔹 Extract UUID from ANY QR content
  const match = String(text).match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/
  );

  console.log("🔍 UUID MATCH:", match);

  if (!match) {
    setGlobalErreur("⚠️ QR code invalide.");
    return;
  }

  const profile_id = match[0];

  try {
    const session = (await supabase.auth.getSession()).data.session;

    console.log("🔑 SESSION:", session);
    

if (!session) {
  setGlobalErreur("⚠️ Session expirée. Veuillez vous reconnecter.");
  return;
}

console.log("🚀 CALLING EDGE FUNCTION", {
  profile_id,
  date: getHaitiDateISO(date),
});

const { data, error } = await supabase.functions.invoke(
  "record-attendance",
  {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      profile_id,
      selected_date: getHaitiDateISO(date),
    },
  }
);
console.log("📡 EDGE RESPONSE", { data, error });

    if (error) {
      setGlobalErreur(error.message || "Erreur lors du scan.");
      return;
    }

    if (data?.error) {
      setGlobalErreur(data.error);
      return;
    }

    setGlobalResult(data?.message || "✅ Présence enregistrée !");
    await fetchSessions();
    // ⬇️ CLOSE ONLY IF NOT GLOBAL SCAN
if (modalAction !== "scan-global") {
  closeModal();
}
  } catch (err) {
    setGlobalErreur("Erreur lors du scan : " + err.message);
  }
};


const filteredResumeMensuel = useMemo(() => {
  if (!nameFilter.trim()) return resumeMensuel;

  const q = nameFilter
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return resumeMensuel.filter((r) =>
    r.full_name
      ?.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes(q)
  );
}, [resumeMensuel, nameFilter]);

const staffMonthlyTop = useMemo(() => {
  // Unique teachers who are monthly top
  const tops = (staffMonthlyRows || [])
    .filter((r) => r.role === "teacher" && r.is_monthly_top_first)
    .reduce((acc, r) => {
      // dedupe by profile_id
      if (!acc.some((x) => x.profile_id === r.profile_id)) acc.push(r);
      return acc;
    }, []);

  // sort by count desc then name
  tops.sort((a, b) => {
    const ca = Number(a.monthly_first_count || 0);
    const cb = Number(b.monthly_first_count || 0);
    if (cb !== ca) return cb - ca;
    return String(a.full_name || "").localeCompare(String(b.full_name || ""));
  });

  return tops;
}, [staffMonthlyRows]);



  const openModal = (action, enrollment_id, sessionStartHHMM) => {
    setModalAction(action);
    setModalEnrollment(enrollment_id);
    setModalSessionStartISO(toSessionStartISO(sessionStartHHMM));
    setModalOpen(true);
  };

  const closeModal = () => {
  setModalOpen(false);
  setModalAction(null);
  setModalEnrollment(null);
  setModalSessionStartISO(null);
  setModalErreur("");
  setModalResult("");
};


  const handleModalScan = async (text) => {
  if (typeof text !== "string" || !text.trim()) return;
  const m = String(text).match(
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/
);

if (!m) {
  setModalErreur("⚠️ QR code invalide.");
  return;
}

const scanned_profile_id = m[0];

    setModalErreur("");
    setModalResult("");

    try {
      const { data: enrollmentData, error: enrollmentErr } = await supabase
        .from("enrollments")
        .select("profile_id, status")
        .eq("id", modalEnrollment)
        .maybeSingle();

      if (enrollmentErr) throw enrollmentErr;
      if (!enrollmentData)
        return setModalErreur("⚠️ Enregistrement introuvable pour cet élève.");

      if (enrollmentData.profile_id !== scanned_profile_id)
        return setModalErreur("⚠️ Ce QR code n’appartient pas à cet élève.");

      const { data: sessionCheck, error: sessionErr } = await supabase
        .from("sessions")
        .select("id")
        .eq("start_date", getHaitiDateISO(date))
        .in("session_group", sessions.map((s) => s.session_group));

      if (sessionErr) throw sessionErr;
      if (!sessionCheck?.length)
        return setModalErreur("⚠️ Cet élève n’a pas de séance aujourd’hui.");

      await saveAttendanceWithRules(modalEnrollment, modalAction, modalSessionStartISO);
      closeModal();
      setModalResult("✅ Présence enregistrée !");
      setTimeout(() => setModalResult(""), 2000);
    } catch (e) {
      setModalErreur("Erreur lors du scan : " + e.message);
    }
  };

  const handleManual = async () => {
    try {
      await saveAttendanceWithRules(modalEnrollment, modalAction, modalSessionStartISO);
      closeModal();
    } catch (e) {
      setErreur(e.message);
    }
  };

  const fetchResumeMensuel = async () => {
  try {
    // build first and next month range
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const nextMonth = new Date(selectedYear, selectedMonth, 1);

    const { data, error } = await supabase
      .from("attendance_monthly_summary")
      .select("*")
      .gte("month", firstDay.toISOString())
      .lt("month", nextMonth.toISOString());

    if (error) {
      console.error("Résumé mensuel error:", error.message);
      setResumeMensuel([]);
      return;
    }

    setResumeMensuel(data || []);
  } catch (err) {
    console.error("Résumé mensuel error:", err.message);
  }
};




  useEffect(() => {
    fetchResumeMensuel();
  }, []);

  useEffect(() => {
  fetchResumeMensuel();
  if (canSeeStaffMonthly) fetchStaffMonthlySummary();
}, [selectedMonth, selectedYear, canSeeStaffMonthly]);



  const StatusBadge = ({ status }) => {
    const map = {
      present: "bg-green-100 text-green-700",
      late: "bg-yellow-100 text-yellow-700",
      absent: "bg-red-100 text-red-700",
    };
    const label =
      status === "present"
        ? "Présent"
        : status === "late"
        ? "En retard"
        : status === "absent"
        ? "Absent"
        : "—";
    return (
      <span
        className={`px-2 py-1 rounded text-xs font-semibold ${
          map[status] || "bg-gray-100 text-gray-600"
        }`}
      >
        {label}
      </span>
    );
  };


  return (
    <div className="p-6 space-y-6">

      <h2 className="text-2xl font-bold text-gray-800">Gestion des présences</h2>

      {/* Filtres */}
<div className="bg-white rounded-xl shadow p-4">
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_auto]">

    {/* Jour */}
    <div className="flex flex-col">
      <label className="text-sm text-gray-600 mb-1">Jour</label>

      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="border rounded-lg px-3 h-[44px]"
      />

    </div>

    {/* Cours */}
    <div className="flex flex-col">
      <label className="text-sm text-gray-600 mb-1">Cours</label>

      <select
        value={coursSelectionne}
        onChange={(e) => setCoursSelectionne(e.target.value)}
        className="border rounded-lg px-3 h-[44px]"
      >
        <option value="">Tous les cours</option>
        {cours.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
    </div>

    {/* Button */}
    <div className="flex flex-col justify-end">
      <button
        onClick={fetchSessions}
        className="bg-aquaBlue text-white px-6 h-[44px] rounded-lg hover:bg-blue-700 transition"
      >
        Rafraîchir
      </button>
    </div>

  </div>
</div>

    

      {/* QR Scanner (Global) */}
<div className="flex justify-center">
  <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 w-full max-w-md text-center">
    <div className="flex flex-col items-center border-b pb-3 mb-4">
      <div className="bg-blue-300 text-Blue-700 p-2 rounded-xl mb-2">
        <i className="fa-solid fa-qrcode text-2xl"></i>
      </div>
      <h3 className="font-semibold text-lg text-gray-800">Scanner un QR code</h3>
    </div>

    <div className="flex flex-col items-center space-y-3">
  <button
    onClick={() => {
      setModalAction("scan-global");
      setModalEnrollment(null);
      setModalSessionStartISO(null);
      setModalOpen(true);
    }}
    className="bg-aquaBlue text-white px-6 py-2 rounded-lg font-medium shadow hover:bg-blue-700 transition"
  >
    <i className="fa-solid fa-camera mr-2"></i>Démarrer le scan
  </button>
</div>


    {globalErreur && (
      <div className="p-3 bg-red-100 text-red-800 rounded-lg text-center mt-4 font-medium">
        {globalErreur}
      </div>
    )}

    {globalResult && (
      <div className="p-3 bg-green-100 text-green-800 rounded-lg text-center mt-4 font-medium">
        {globalResult}
      </div>
    )}
  </div>
</div>

{canSeeStaffDaily && (
  <>
{/* ✅ Staff Attendance Card (Teachers + Assistant) */}
<div className="bg-white rounded-2xl shadow p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="font-semibold text-lg">
      Présence du {formatDateFrSafe(date)} / Professeurs et Assistante
    </h3>

    <button
      onClick={() => {
        setModalAction("scan-staff");
        setModalEnrollment(null);
        setModalSessionStartISO(null);
        setModalOpen(true);
      }}
      className="bg-aquaBlue text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
    >
      Démarrer le scan
    </button>
  </div>

  {staffLoading ? (
    <div className="text-center py-3 text-aquaBlue font-medium">⏳ Chargement…</div>
  ) : staffList.length ? (
    <div className="space-y-2">
      {staffList.map((p) => {
        const pres = staffMap[p.id];
        return (
          <div
            key={p.id}
            className="flex items-center justify-between border rounded-xl px-4 py-3"
          >
            <div className="flex flex-col">
              <div className="font-medium text-gray-800">{p.full_name}</div>
              <div className="text-xs text-gray-500">
                {p.role === "assistant" ? "Assistante" : "Professeur"}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={pres?.status} />
              <div className="text-xs text-gray-600">
                {pres?.check_in_time ? `Arrivée: ${fmtHeure(pres.check_in_time)}` : "Arrivée: —"}
                {pres?.check_out_time ? ` • Départ: ${fmtHeure(pres.check_out_time)}` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div className="text-gray-400 italic text-sm">Aucun staff trouvé.</div>
  )}
</div>
</>
)}



      {/* Tableau de présences */}
      <div className="hidden md:block">
      <div className="bg-white rounded-2xl shadow p-6 overflow-x-auto">
        <h3 className="font-semibold text-lg mb-3">Présences du {formatDateFrSafe(date)}</h3>
        {chargement ? (
          <div className="text-center py-3 text-aquaBlue font-medium">⏳ Chargement des données…</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="p-2 text-left">Élève</th>
                <th className="p-2 text-left">Cours</th>
                <th className="p-2 text-left">Heure</th>
                <th className="p-2 text-center">Actions</th>
                <th className="p-2 text-center">Statut</th>
                <th className="p-2 text-left">Arrivée</th>
                <th className="p-2 text-left">Départ</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length ? (
                sessions.map((s) => (
                  <Fragment key={s.id}>
                    <tr key={`head-${s.id}`} className={s.status === "cancelled" ? "bg-red-50 text-red-700 font-semibold" : "bg-blue-50 text-aquaBlue font-semibold"}>
                      <td colSpan="7" className="p-2">
                        {s.status === "cancelled"
                          ? `🚫 Séance annulée — ${s.course?.name}`
                          : `🏊 ${s.course?.name} — ${s.start_time?.slice(0, 5)} → ${ajouterHeures(s.start_time?.slice(0, 5), s.duration_hours)}`}
                      </td>
                    </tr>
                    {s.status !== "cancelled" &&
                      (s.inscriptions.length ? (
                        s.inscriptions.map((e) => (
                          <tr key={e.enrollment_id} className="border-t hover:bg-gray-50">
                            <td className="p-2 flex items-center gap-1">
                              {e.nom}
                              {e.has_unpaid && (
                                <FaDollarSign className="text-red-500" title="Facture impayée" />
                              )}
                            </td>
                            <td className="p-2">{e.cours}</td>
                            <td className="p-2">
                              {s.start_time?.slice(0, 5)} – {ajouterHeures(s.start_time?.slice(0, 5), s.duration_hours)}
                            </td>
                            <td className="p-2 text-center space-x-1">
                              {!e.presence?.check_in_time ? (
                                <button
                                  className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                                  onClick={() => openModal("check-in", e.enrollment_id, s.start_time)}
                                >
                                  Check-in
                                </button>
                              ) : (
                                <button
                                  className="px-3 py-1 rounded bg-gray-500 text-white hover:bg-gray-600"
                                  onClick={() => saveAttendanceWithRules(e.enrollment_id, "undo-checkin", s.start_time)}
                                >
                                  Undo
                                </button>
                              )}
                              {!e.presence?.check_out_time ? (
                                <button
                                  className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                                  onClick={() => openModal("check-out", e.enrollment_id, s.start_time)}
                                >
                                  Check-out
                                </button>
                              ) : (
                                <button
                                  className="px-3 py-1 rounded bg-gray-500 text-white hover:bg-gray-600"
                                  onClick={() => saveAttendanceWithRules(e.enrollment_id, "undo-checkout", s.start_time)}
                                >
                                  Undo
                                </button>
                              )}
                              {!e.presence?.check_in_time && !e.presence?.check_out_time && (
                                <button
                                  className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                                  onClick={() => saveAttendanceWithRules(e.enrollment_id, "mark-absent", s.start_time)}
                                >
                                  Marquer absent
                                </button>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <StatusBadge status={e.presence?.status} />
                            </td>
                            <td className="p-2 text-gray-600">{fmtHeure(e.presence?.check_in_time)}</td>
                            <td className="p-2 text-gray-600">{fmtHeure(e.presence?.check_out_time)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="text-gray-400 italic text-sm p-2">
                            Aucun participant inscrit
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-gray-500 italic">
                    Aucune session prévue pour ce jour.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      </div>
      <div className="md:hidden space-y-4">
  {sessions.map((s) => (
    <div key={s.id} className="bg-white rounded-xl shadow p-4 space-y-2">
      <div className="font-semibold text-aquaBlue">
        {s.course?.name}
      </div>

      <div className="text-sm text-gray-600">
        {s.start_time?.slice(0,5)} → {ajouterHeures(s.start_time?.slice(0,5), s.duration_hours)}
      </div>

      {s.inscriptions.map((e) => (
        <div key={e.enrollment_id} className="border-t pt-2 mt-2 space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-medium">{e.nom}</span>
            {e.has_unpaid && <FaDollarSign className="text-red-500" />}
          </div>

          <StatusBadge status={e.presence?.status} />

<div className="text-sm text-gray-600 flex justify-between">
  <span>Arrivée :</span>
  <span>{fmtHeure(e.presence?.check_in_time)}</span>
</div>

<div className="text-sm text-gray-600 flex justify-between">
  <span>Départ :</span>
  <span>{fmtHeure(e.presence?.check_out_time)}</span>
</div>

          <div className="grid grid-cols-2 gap-2">
  {/* CHECK-IN / UNDO CHECK-IN */}
  {!e.presence?.check_in_time ? (
    <button
      className="bg-green-600 text-white py-2 rounded"
      onClick={() => openModal("check-in", e.enrollment_id, s.start_time)}
    >
      Check-in
    </button>
  ) : (
    <button
      className="bg-gray-500 text-white py-2 rounded"
      onClick={() =>
        saveAttendanceWithRules(
          e.enrollment_id,
          "undo-checkin",
          s.start_time
        )
      }
    >
      Undo
    </button>
  )}

  {/* CHECK-OUT / UNDO CHECK-OUT */}
  {!e.presence?.check_out_time ? (
    <button
      className="bg-blue-600 text-white py-2 rounded"
      onClick={() => openModal("check-out", e.enrollment_id, s.start_time)}
    >
      Check-out
    </button>
  ) : (
    <button
      className="bg-gray-500 text-white py-2 rounded"
      onClick={() =>
        saveAttendanceWithRules(
          e.enrollment_id,
          "undo-checkout",
          s.start_time
        )
      }
    >
      Undo
    </button>
  )}
  {!e.presence?.check_in_time && !e.presence?.check_out_time && (
  <button
    className="bg-red-600 text-white py-2 rounded col-span-2"
    onClick={() =>
      saveAttendanceWithRules(
        e.enrollment_id,
        "mark-absent",
        s.start_time
      )
    }
  >
    Marquer absent
  </button>
)}

</div>

        </div>
      ))}
    </div>
  ))}
</div>
{canSeeMonthlySummary && (

  <>
{/* Filtres Résumé mensuel */}
<div className="bg-white rounded-xl shadow p-4 mt-6">
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[260px_520px_540px_140px]">

    {/* Mois */}
    <div className="flex flex-col">
      <label className="text-sm text-gray-600 mb-1">Mois</label>
      <select
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(Number(e.target.value))}
        className="border rounded-lg px-3 h-[44px]"
      >
        <option value={1}>Janvier</option>
        <option value={2}>Février</option>
        <option value={3}>Mars</option>
        <option value={4}>Avril</option>
        <option value={5}>Mai</option>
        <option value={6}>Juin</option>
        <option value={7}>Juillet</option>
        <option value={8}>Août</option>
        <option value={9}>Septembre</option>
        <option value={10}>Octobre</option>
        <option value={11}>Novembre</option>
        <option value={12}>Décembre</option>
      </select>
    </div>

    {/* Année */}
    <div className="flex flex-col">
      <label className="text-sm text-gray-600 mb-1">Année</label>
      <input
        type="number"
        value={selectedYear}
        onChange={(e) => setSelectedYear(Number(e.target.value))}
        min="2023"
        max="2100"
        className="border rounded-lg px-3 h-[44px]"
      />
    </div>

    {/* Nom */}
<div className="flex flex-col">
  <label className="text-sm text-gray-600 mb-1">Nom</label>
  <input
    type="text"
    placeholder="Nom de l’élève"
    value={nameFilter}
    onChange={(e) => setNameFilter(e.target.value)}
    className="border rounded-lg px-3 h-[44px]"
  />
</div>


    {/* Button */}
    <div className="flex flex-col justify-end">
      <button
        onClick={fetchResumeMensuel}
        className="bg-aquaBlue text-white px-6 h-[44px] rounded-lg hover:bg-blue-700 transition"
      >
        Filtrer
      </button>
    </div>

  </div>
</div>

      {/* Résumé mensuel */}
      
        {/* ✅ Résumé mensuel des présences / STAFF (Teachers only) */}
{canSeeStaffMonthly && (
  <div className="bg-white rounded-2xl border border-gray-100 shadow p-4 mb-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
  <div className="flex items-center gap-3 flex-wrap">
    <h4 className="font-semibold text-gray-800">
      Résumé mensuel des présences / STAFF (Professeurs)
    </h4>

    {/* ✅ Top du mois badge(s) between title and button */}
    {staffMonthlyTop.length > 0 && (
      <div className="flex items-center gap-2 flex-wrap">
        {staffMonthlyTop.map((t) => (
          <span
            key={t.profile_id}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-800 border border-yellow-200"
            title="Top du mois (1er arrivé le plus souvent)"
          >
            <span aria-hidden>🏅</span>
            <span className="whitespace-nowrap">{t.full_name}</span>
            <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-900">
              {Number(t.monthly_first_count || 0)}
            </span>
          </span>
        ))}
      </div>
    )}
  </div>

  <button
    onClick={fetchStaffMonthlySummary}
    className="text-sm bg-aquaBlue text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition self-start sm:self-auto"
  >
    Rafraîchir
  </button>
</div>


    {staffMonthlyLoading ? (
      <div className="text-center py-3 text-aquaBlue font-medium">⏳ Chargement…</div>
    ) : staffMonthlyRows.length ? (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="p-2 text-left">Nom</th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Heure d’arrivée</th>
              <th className="p-2 text-center">1er arrivé</th>
            </tr>
          </thead>
          <tbody>
            {staffMonthlyRows.map((r, idx) => (
              <tr key={`${r.profile_id}-${r.attended_on}-${idx}`} className="border-t">
                <td className="p-2">{r.full_name}</td>
                <td className="p-2">{fmtJour(r.attended_on)}</td>
                <td className="p-2">{fmtHeure(r.check_in_time)}</td>
                <td className="p-2 text-center">
                  {r.role === "teacher" ? (r.is_first ? "🏆" : "—") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="text-gray-500 italic text-sm">
        Aucun enregistrement staff pour ce mois.
      </div>
    )}
  </div>
)}

{/* ✅ STUDENTS — Résumé mensuel (BLOCK 2) */}
<div className="bg-white rounded-2xl shadow p-6 mt-6">
  <h3 className="font-semibold text-lg mb-3">
    Résumé mensuel des présences — {formatMonth(`${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`)}
  </h3>
<div className="hidden md:block">
  {resumeMensuel.length ? (
    <table className="w-full text-sm border-collapse">
      <thead className="bg-gray-100 text-gray-600">
        <tr>
          <th className="p-2 text-left">Élève</th>
          <th className="p-2 text-left">Cours</th>
          <th className="p-2 text-center">Présents</th>
          <th className="p-2 text-center">Absents</th>
          <th className="p-2 text-center">Retards</th>
          <th className="p-2 text-center">Taux présence</th>
        </tr>
      </thead>

      <tbody>
        {filteredResumeMensuel.map((r) => (
          <tr
            key={`${r.profile_id}-${r.course_name}`}
            className="border-t hover:bg-gray-50"
          >
            <td className="p-2">{r.full_name}</td>
            <td className="p-2">{r.course_name}</td>
            <td className="p-2 text-center text-green-700 font-medium">{r.presents}</td>
            <td className="p-2 text-center text-red-600 font-medium">{r.absents}</td>
            <td className="p-2 text-center text-yellow-600 font-medium">{r.retards}</td>
            <td className="p-2 text-center font-bold">
              {Number(r.taux_presence).toFixed(0)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <div className="text-center py-4 text-gray-500 italic">
      Aucun enregistrement ce mois-ci.
    </div>
  )}
</div>
</div>
<div className="md:hidden space-y-3">
  {filteredResumeMensuel.map((r) => (
    <div
      key={`${r.profile_id}-${r.course_name}`}
      className="bg-white rounded-xl shadow p-4 space-y-1"
    >
      <div className="font-semibold">{r.full_name}</div>
      <div className="text-sm text-gray-600">{r.course_name}</div>

      <div className="grid grid-cols-3 text-center mt-3 gap-y-1">
  {/* Labels */}
  <div className="text-xs font-semibold text-green-700">
    Présence
  </div>
  <div className="text-xs font-semibold text-yellow-600">
    Retard
  </div>
  <div className="text-xs font-semibold text-red-600">
    Absence
  </div>

  {/* Counts */}
  <div className="text-lg font-bold text-green-700">
    {r.presents}
  </div>
  <div className="text-lg font-bold text-yellow-600">
    {r.retards}
  </div>
  <div className="text-lg font-bold text-red-600">
    {r.absents}
  </div>
</div>


      <div className="text-center font-bold mt-2">
        {Number(r.taux_presence).toFixed(0)}%
      </div>
    </div>
  ))}
</div>
</>
)}

      {/* MODAL (QR + manuel) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          style={{ position: "fixed", top: 0, left: 0 }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-5 relative">
            <button
              onClick={closeModal}
              className="absolute top-3 right-4 text-gray-500 hover:text-gray-800 text-2xl font-bold"
            >
              ×
            </button>

            <h4 className="text-xl font-semibold text-gray-800 text-center mb-2">
  {modalAction === "scan-global"
  ? "Scan global des présences"
  : modalAction === "scan-staff"
  ? "Scan présence — Professeurs & Assistante"
  : modalAction === "check-in"
  ? "Check-in"
  : modalAction === "check-out"
  ? "Check-out"
  : ""}
</h4>


            <div className="flex flex-col items-center space-y-4">
              {modalErreur && (
  <div className="absolute -top-3 left-0 w-full text-center bg-red-100 text-red-800 font-medium py-2 rounded-t-2xl shadow">
    {modalErreur}
  </div>
)}

{modalResult && (
  <div className="absolute -top-3 left-0 w-full text-center bg-green-100 text-green-800 font-medium py-2 rounded-t-2xl shadow">
    {modalResult}
  </div>
)}

              <div className="w-[280px] h-[280px] rounded-lg overflow-hidden border-2 border-aquaBlue shadow-inner">
  <Scanner
    onScan={(result) => {
      if (!result) return;

      const value = Array.isArray(result)
        ? result[0]?.rawValue || result[0]?.text
        : result.rawValue || result.text;

      if (!value) return;

      if (modalAction === "scan-global") {
  handleScan(value);
} else if (modalAction === "scan-staff") {
  handleStaffScan(value);
} else {
  handleModalScan(value);
}

    }}
    onError={(err) => console.error("SCANNER ERROR:", err)}
    constraints={{ facingMode: "environment" }}
    scanDelay={300}
    style={{ width: "100%", height: "100%" }}
  />
</div>
{(modalAction === "scan-global" || modalAction === "scan-staff") && (
  <button
    onClick={closeModal}
    className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 transition"
  >
    Fermer le scanner
  </button>
)}


              <button
                onClick={handleManual}
                className="text-aquaBlue hover:text-blue-700 underline font-medium"
              >
                Cliquer ici pour un enregistrement manuel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
