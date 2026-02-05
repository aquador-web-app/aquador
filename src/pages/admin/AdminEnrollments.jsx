import { useEffect, useMemo, useState, useRef  } from "react";
import { supabase } from "../../lib/supabaseClient";
import { normalizeISODate, formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";
import { useAuth } from "../../context/AuthContext";




const FRENCH_DAYS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];

// Display a row's day label. Prefer session.day_of_week (DB uses 1..7), else derive from start_date.
function dayLabel(row) {
  const dbDow = row.sessions?.day_of_week; // 1..7 (1=Dimanche)
  if (dbDow != null) return FRENCH_DAYS[(Number(dbDow) - 1 + 7) % 7];
  if (row.start_date) return FRENCH_DAYS[new Date(row.start_date).getDay()];
  return "—";
} 

// Build hour range like "08h-09h" or "08h-10h"
// Uses session.start_time and the plan duration resolved from plan_id (or the joined plan)
function heureRange(row, plansList) {
  const sessionStart = row.sessions?.start_time ?? row.start_time;
  if (!sessionStart) return "—";

  const planDur =
    Number(plansList?.find(p => p.id === row.plan_id)?.duration_hours) ??
    Number(row.plans?.duration_hours ?? 1);

  const slot = row.selected_slot || "first"; // first | second | both

  const effectiveStart =
    slot === "second" ? addHoursToTimeStr(sessionStart, 1) : sessionStart;

  const effectiveDur = slot === "both" ? 2 : planDur;
  const effectiveEnd = addHoursToTimeStr(effectiveStart, effectiveDur);

  const startH = String(effectiveStart).split(":")[0];
  const endH = String(effectiveEnd).split(":")[0];
  const fmt = (h) => `${String(Number(h)).padStart(2, "0")}h`;

  return `${fmt(startH)}-${fmt(endH)}`;
}


// Add hours (HH:MM:SS or HH:MM) by +N hours, returns "HH:MM"
function addHoursToTimeStr(timeStr, hoursToAdd) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map((x) => parseInt(x, 10));
  const base = new Date(2000, 0, 1, h, m || 0, 0);
  base.setHours(base.getHours() + hoursToAdd);
  const hh = String(base.getHours()).padStart(2, "0");
  const mm = String(base.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function AdminEnrollments() {
  // Data
  const [profiles, setProfiles] = useState([]);
  const [courses, setCourses] = useState([]);
  const [plans, setPlans] = useState([]);
  const { user: currentUser, loading: authLoading } = useAuth();
  const isAdminUser = useMemo(() => {
  return Boolean(
    currentUser &&
    ["admin", "superadmin", "owner"].includes(currentUser.role)
  );
}, [currentUser]);
  const [bypass, setBypass] = useState(false);


  // Always work with PUBLIC plans only
const publicPlans = useMemo(
  () => plans.filter(p => p.is_public === true),
  [plans]
);
const intensiveCourse = useMemo(
  () => courses.find(c => c.course_type === "intensive") || null,
  [courses]
);

  const [seriesByCourse, setSeriesByCourse] = useState({});
  const [overridePlan, setOverridePlan] = useState("");
  const [intensiveDuration, setIntensiveDuration] = useState(null);

  
  // Form state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProfile, setSelectedProfile] = useState(null);
  // Add BEFORE "const [autoCourse, setAutoCourse] = useState(null)"
const [courseMode, setCourseMode] = useState("natation"); 

// natation | aquafitness | both
  const [autoCourse, setAutoCourse] = useState(null);
  const [overrideCourse, setOverrideCourse] = useState(""); // for admin override
  const [selectedHours, setSelectedHours] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overridePlanId, setOverridePlanId] = useState("");
  const { showConfirm, showAlert, showInput } = useGlobalAlert();


  // Table state
  const [enrollments, setEnrollments] = useState([]);
  const [filterCourseId, setFilterCourseId] = useState("");
  const [filterHours, setFilterHours] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  
  const natationCourses = useMemo(() => 
  courses.filter(c => c.course_type === "natation"),
[courses]);

const aquafitnessCourses = useMemo(() => 
  courses.filter(c => c.course_type === "aquafitness"),
[courses]);

// 🔥 Recalculate autoCourse when switching Natation <-> Aquafitness,
// WITHOUT requiring the user to click the profile again.
useEffect(() => {
  if (!selectedProfile) return;

  // If bypass mode is on → do nothing (admin is manually choosing)
  if (bypass) return;

  if (courseMode === "aquafitness") {
    // Always pick the first aquafitness course
    const aqua = courses.find(c => c.course_type === "aquafitness");
    setAutoCourse(aqua || null);
    return;
  }

  // NATATION MODE → use age-based natation logic
  const ec = eligibleCourseFor(selectedProfile);

  if (!ec || ec.course_type !== "natation") {
    setAutoCourse(null);
    return;
  }

  setAutoCourse(ec);
}, [courseMode, selectedProfile, bypass, courses]);

  // Load initial data
  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: crs }, { data: pls }] = await Promise.all([
        supabase
          .from("profiles_with_unpaid")
          .select("id, full_name, birth_date, role, signup_type")
          .order("full_name"),
        supabase.from("courses").select("id, name, course_type").order("name"),
        supabase.from("plans")
  .select(`
    id,
    name,
    price,
    duration_hours,
    is_public,
    course_type,
    plan_category,
    duration_unit,
    duration_value
  `)

      ]);

      // exclude admin/teacher/assistant
      const filteredProfiles = (profs || []).filter(
  (p) =>
    !["admin", "teacher", "assistant"].includes(p.role) &&
    p.signup_type !== "children_only"
);

      setProfiles(filteredProfiles);
      setCourses(crs || []);
      setPlans(pls || []);

      // Preload active series by course
const seriesMap = {};
if (crs && crs.length) {
  for (const c of crs) {
    const { data: s, error: sErr } = await supabase
      .from("sessions")
      .select("id, course_id, start_time, duration_hours, day_of_week, status")
      .eq("course_id", c.id)
      .eq("status", "active")
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (sErr) {
      console.error("sessions load error", sErr);
      seriesMap[c.id] = [];
      continue;
    }
    if (s && s.length) {
      const seen = new Set();
      const grouped = [];
      for (const sess of s) {
  const key = `${sess.day_of_week}-${sess.start_time.slice(0,5)}`; // e.g. "7-08:00"
  if (!seen.has(key)) {
    seen.add(key);
    grouped.push({
      ...sess,
      key, // synthetic series key
    });
  }
}

      seriesMap[c.id] = grouped;
    } else {
      seriesMap[c.id] = [];
    }
  }
}
setSeriesByCourse(seriesMap);

      await loadEnrollments();
    })();
  }, []);

  async function loadEnrollments() {
    const { data, error } = await supabase
      .from("enrollments")
      .select(
        `
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
        selected_slot,
        selected_hours,
        profiles:profile_id ( full_name ),
        courses:course_id ( name ),
        plans:plan_id ( id, name, price, duration_hours ),
        sessions:session_id ( id, day_of_week, start_time, duration_hours )
      `
      )
      .order("enrolled_at", { ascending: false });

    if (error) {
      console.error("Load enrollments error:", error);
      alert("Erreur de chargement des inscriptions: " + (error.message || ""));
      return;
    }
    setEnrollments(data || []);
  }

  function ageInMonths(birthDate) {
    if (!birthDate) return null;
    const b = new Date(birthDate);
    const n = new Date();
    return (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  }

  function eligibleCourseFor(profile) {
    if (!profile) return null;
    const m = ageInMonths(profile.birth_date);
    if (m == null) return null;
    let needle = "Adultes";
    if (m <= 83) needle = "Tous Petits";
    else if (m <= 155) needle = "Enfants";
    else if (m <= 216) needle = "Adolescents";
    return courses.find((c) => c.name.includes(needle)) || null;
  }

  function onSelectProfile(profileId) {
  const p = profiles.find((x) => x.id === profileId) || null;
  setSelectedProfile(p);
  setSelectedHours([]);
  setStartDate("");

  if (bypass) return;

  // Recalculate based on courseMode
  if (courseMode === "aquafitness") {
    const aqua = courses.find(c => c.course_type === "aquafitness");
    setAutoCourse(aqua || null);
    return;
  }

  const ec = eligibleCourseFor(p);

  if (!ec || ec.course_type !== "natation") {
    setAutoCourse(null);
    return;
  }

  setAutoCourse(ec);
}


  // Add this outside the function (module-level)
const hourWarningShown = useRef(false);


// robust handling for keys like "<seriesUUID>-first" or "<seriesUUID>-second"
function toggleHour(which) {
  const FIRST = "-first";
  const SECOND = "-second";

  const isSecond = which.endsWith(SECOND);
  const isFirst = which.endsWith(FIRST);

  const base = which.replace(/-(first|second)$/, "");

  setSelectedHours(prev => {
    const prevBase = prev[0]?.replace(/-(first|second)$/, "") || null;

    const hasFirst = prev.includes(`${base}${FIRST}`);
    const hasSecond = prev.includes(`${base}${SECOND}`);

    // 🔁 SWITCH DAY → clear previous selection
    if (prevBase && prevBase !== base) {
      prev = [];
    }

    // ❌ DESELECT (remove entire day)
    if (prev.includes(which)) {
      return prev.filter(h => !h.startsWith(base));
    }

    // 🚫 USER RULE: cannot select second without first
    if (isSecond && !hasFirst && !isAdminUser) {
      alert(
        "Il est impératif de choisir la première tranche d'heure si vous choisissez 1 heure par séance."
      );
      return prev;
    }

    // 🛠 ADMIN: allow second alone
    if (isSecond && isAdminUser && !hasFirst) {
      return [`${base}${SECOND}`];
    }

    // ✅ FIRST + SECOND = 2h
    if ((isFirst && hasSecond) || (isSecond && hasFirst)) {
      return [...prev, which];
    }

    // ✅ DEFAULT: single selection for this day
    return [`${base}${isSecond ? SECOND : FIRST}`];
  });
}


  const filteredProfiles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return profiles.slice(0, 25);
    return profiles.filter((p) => (p.full_name || "").toLowerCase().includes(term)).slice(0, 25);
  }, [searchTerm, profiles]);

  const hourLabels = useMemo(() => {
    const course = bypass
      ? courses.find((c) => c.id === overrideCourse)
      : autoCourse;
    if (!course) return { first: "—", second: "—" };
    const series = seriesByCourse[course.id];
    const start = series?.start_time || "08:00:00";
    const firstStart = start.slice(0, 5);
    const firstEnd = addHoursToTimeStr(start, 1);
    const secondEnd = addHoursToTimeStr(start, 2);
    return { first: `${firstStart} - ${firstEnd}`, second: `${firstEnd} - ${secondEnd}` };
  }, [autoCourse, overrideCourse, bypass, seriesByCourse, courses]);

  // Which plan matches the chosen duration (1h / 2h)
const autoPlan = useMemo(() => {
  if (selectedHours.length === 0) return null;

  const hasFirst = selectedHours.some(h => h.endsWith("-first"));
  const hasSecond = selectedHours.some(h => h.endsWith("-second"));
  const duration = hasFirst && hasSecond ? 2 : 1;

  const course = bypass
    ? courses.find(c => c.id === overrideCourse)
    : autoCourse;

  if (!course) return null;

  return publicPlans.find(
    (p) =>
      Number(p.duration_hours) === duration &&
      p.course_type === course.course_type
  ) || null;
}, [selectedHours, bypass, overrideCourse, autoCourse, publicPlans, courses]);


const chosenPlan = useMemo(() => {
  if (courseMode !== "intensive") return autoPlan;

  if (!intensiveDuration) return null;

  return plans.find(p =>
    p.plan_category === "intensive" &&
    p.course_type === "intensive" &&
    p.duration_unit === "week" &&
    Number(p.duration_value) === Number(intensiveDuration)
  ) || null;
}, [courseMode, intensiveDuration, plans, autoPlan]);






const handleDelete = async (row) => {
  const wantsDelete = await showConfirm(
    `Supprimer l'inscription de ${row.profiles?.full_name} ?`
  );

  if (!wantsDelete) return;

  const { error } = await supabase.rpc("delete_enrollment_and_invoice", {
    p_enrollment_id: row.id,
  });

  if (error) {
    showAlert("Erreur suppression: " + error.message);
    return;
  }

  await loadEnrollments();
};


// 🔄 Simple placeholder — load invoices after enrollment
async function loadInvoices() {
  console.log("🧾 loadInvoices() called — fetching invoices for latest enrollment");

  try {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("issued_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    console.log("✅ Invoices loaded:", data);
    // TODO: if you track invoices in state, update it here with setInvoices(data)
  } catch (err) {
    console.error("❌ loadInvoices error:", err.message);
  }
}


 async function handleSubmit(e) {
  e.preventDefault();

  if (!selectedProfile) return alert("Sélectionnez un étudiant.");
  const course =
  courseMode === "intensive"
    ? intensiveCourse
    : bypass
    ? courses.find((c) => c.id === overrideCourse)
    : autoCourse;
  if (!course) return alert("Cours introuvable.");
  if (!startDate) return alert("Choisissez une date.");
  if (courseMode !== "intensive" && selectedHours.length === 0) {
  return alert("Choisissez au moins une heure.");
}


  // Determine if it's 1h or 2h
  const durationNeeded = selectedHours.length === 2 ? 2 : 1;
  let plan;

if (courseMode === "intensive") {
  plan = chosenPlan; // 🔒 FORCED AUTOMATIC
} else if (overrideEnabled && overridePlanId) {
  plan = plans.find(p => p.id === overridePlanId);
} else {
  plan = chosenPlan;
}

if (!plan) {
  alert("Aucun plan valide trouvé.");
  return;
}




// Safety check
if (!plan) {
  alert("Aucun plan valide trouvé.");
  return;
} 

  // Extract the picked series key from the checkbox
  let pickedSeries;
let selectedHoursCount = 0;
let selectedSlot = "first";

const seriesList = seriesByCourse[course.id] || [];

if (courseMode === "intensive") {
  // 🔥 Intensive = first active session in the group
  pickedSeries = seriesList[0];
  if (!pickedSeries) {
    return alert("Aucune session trouvée pour ce cours intensif.");
  }
} else {
  const FIRST = "-first";
  const SECOND = "-second";

  const hasFirst = selectedHours.some((h) => h.endsWith("-first"));
  const hasSecond = selectedHours.some((h) => h.endsWith("-second"));

  selectedHoursCount = hasFirst && hasSecond ? 2 : 1;

  if (hasFirst && hasSecond) selectedSlot = "both";
  else if (hasSecond && isAdminUser) selectedSlot = "second";

  const token = selectedHours[0];
  const baseKey = token.replace(/-(first|second)$/, "");

  pickedSeries = seriesList.find((x) => x.key === baseKey);

  if (!pickedSeries) {
    return alert("Série introuvable pour ce créneau.");
  }
}


  const chosenDate = new Date(startDate);
  const chosenDay = chosenDate.getDay();
  const dbDay = Number(pickedSeries.day_of_week);
  const jsDayToDb = chosenDay === 0 ? 1 : chosenDay + 1;
  if (jsDayToDb !== dbDay) {
    console.warn("⚠️ La date choisie n'est pas alignée avec le jour du créneau.");
  }

  setLoading(true);
  try {
    // When calling RPC, use these values
// use override price if present
const { id: plan_id, name: plan_name, price } = plan;
// ✅ Use the manually typed override price if user enters one, otherwise plan price
let effectivePrice;

if (overrideEnabled && overridePlanId) {
  // Override plan selected
  const selectedOverridePlan = plans.find(p => p.id === overridePlanId);
if (!selectedOverridePlan) {
  console.error("⚠️ overridePlanId not found in publicPlans:", overridePlanId);
}
effectivePrice = selectedOverridePlan?.price ?? plan.price;
} else {
  // Auto plan
  effectivePrice = chosenPlan?.price ?? 0;
} 

console.log("===== DEBUG PLAN SELECTION =====");
console.log("courseMode:", courseMode);
console.log("autoCourse:", autoCourse);
console.log("bypass:", bypass);
console.log("selectedHours:", selectedHours);
console.log("autoPlan:", autoPlan);
console.log("overridePlanId:", overridePlanId);
console.log("chosenPlan:", chosenPlan);
console.log("publicPlans:", publicPlans);
console.log("================================");



const { data, error } = await supabase.rpc("create_enrollment_with_invoice", {
  p_profile_id: selectedProfile.id,
  p_course_id: course.id,
  p_session_id: pickedSeries.id,
  p_plan_id: plan_id,
  p_start_date: normalizeISODate(startDate),
  p_course_name: course.name,
  p_plan_name: plan_name,
  p_price: effectivePrice, // 👈 override applied here
  p_full_name:
    selectedProfile.full_name ||
    `${selectedProfile.first_name} ${selectedProfile.last_name}`,

  // 🔥 THESE TWO LINES FIX EVERYTHING
  p_admin_override: isAdminUser === true,
  p_selected_hours: courseMode === "intensive" ? null : selectedHoursCount,
  p_selected_slot: courseMode === "intensive" ? null : selectedSlot,
  p_course_mode: courseMode,
}
);



    if (error) throw error;

    // If the RPC returns invoice_id, trigger PDF generation
const invId = Array.isArray(data) ? data[0]?.invoice_id : data?.invoice_id;

if (invId) {
  const { error: pdfErr } = await supabase.functions.invoke(
    "generate-invoice-pdf",
    {
      body: {
        invoice_id: invId,   // ✅ CORRECT
        source: "on_demand",
      },
    }
  );

  if (pdfErr) {
    console.error("PDF generation error:", pdfErr);
  }
}

    const displayedPrice = effectivePrice || plan.price;

alert(
  `✅ Inscription + facture créées\nÉtudiant: ${
    selectedProfile.full_name
  }\nCours: ${course.name}\nPlan: ${plan_name}\nMontant: $${displayedPrice}\nDébut: ${formatDateFrSafe(
    startDate
  )}`
);


    await loadEnrollments();
    setSelectedHours([]);
    setStartDate("");
  } catch (err) {
  console.error("RPC Error:", err);

  if (
    err?.message?.toLowerCase().includes("déjà inscrit") ||
    err?.code === "23505"
  ) {
    alert("⚠️ Cet étudiant est déjà inscrit à ce créneau.");
  } else {
    alert("Erreur inscription: " + err.message);
  }
} finally {
    setLoading(false);
  }
}


// filter state (day/hour)
const [dayFilter, setDayFilter] = useState("");    // "", "0".."6"
const [timeFilter, setTimeFilter] = useState("");  // "", "08h-09h" etc.

// hour options for the filter dropdown
const hourOptions = useMemo(() => {
  const set = new Set((enrollments || [])
    .map((e) => heureRange(e, plans))
    .filter((x) => x && x !== "—"));
  return Array.from(set).sort();
}, [enrollments, plans]);

// ✅ define filteredEnrollments BEFORE using it
const filteredEnrollments = useMemo(() => {
  return (enrollments || []).filter((e) => {
    if (filterCourseId && e.course_id !== filterCourseId) return false;
    if (filterHours && Number(e.plans?.duration_hours ?? 0) !== Number(filterHours)) return false;

    if (dayFilter !== "") {
      const dowDb = e.sessions?.day_of_week != null ? Number(e.sessions.day_of_week) - 1 : null; // 0..6
      const dowJs = e.start_date ? new Date(e.start_date).getDay() : null;
      const dow = dowDb ?? dowJs;
      if (String(dow) !== String(dayFilter)) return false;
    }

    if (timeFilter && timeFilter !== "" && heureRange(e, plans) !== timeFilter) return false;
    return true;
  });
}, [enrollments, plans, filterCourseId, filterHours, dayFilter, timeFilter]);

const enrolledCount = filteredEnrollments.length;

// ✅ now it’s safe to paginate
const { totalPages, visibleRows } = useMemo(() => {
  const total = Math.max(1, Math.ceil(filteredEnrollments.length / pageSize));
  const start = (page - 1) * pageSize;
  return {
    totalPages: total,
    visibleRows: filteredEnrollments.slice(start, start + pageSize),
  };
}, [filteredEnrollments, page, pageSize]);

// Resolve the current duration from the selected plan_id (fallback to joined plan)
const getCurrentDur = (row) =>
  Number(
    (publicPlans.find(p => p.id === row.plan_id)?.duration_hours) ??
    (row.plans?.duration_hours ?? 1)
  );



  return (
    <div className="px-3 py-4 sm:px-4 lg:px-6 max-w-[1600px] mx-auto">
      <h2 className="text-xl font-semibold mb-4">Inscriptions</h2>

      {/* Form */}
      <form
  onSubmit={handleSubmit}
  className="bg-white border p-4 rounded shadow mb-6 grid grid-cols-1 md:grid-cols-2 gap-4"
>
        {/* Search student */}
        <label className="block text-sm font-medium mb-1">Rechercher un étudiant</label>
        <input
          type="text"
          placeholder="Tapez un nom…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border p-2 rounded w-full"
        />
        <div className="mt-2 max-h-40 overflow-auto border rounded">
          {filteredProfiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectProfile(p.id)}
              className={`block w-full text-left px-3 py-2 hover:bg-gray-100 ${
                selectedProfile?.id === p.id ? "bg-gray-100 font-medium" : ""
              }`}
            >
              {p.full_name}
            </button>
          ))}
          {filteredProfiles.length === 0 && (
            <div className="px-3 py-2 text-gray-500">Aucun résultat.</div>
          )}
        </div>
        {selectedProfile && (
          <div className="mt-2 text-sm">Sélectionné: <b>{selectedProfile.full_name}</b></div>
        )}

        {/* Course Mode Selector */}
<div className="mt-4">
  <label className="block text-sm font-medium mb-1">Type de cours</label>
  <select
    value={courseMode}
    onChange={(e) => setCourseMode(e.target.value)}
    className="border p-2 rounded w-full"
  >
    <option value="natation">Natation</option>
    <option value="aquafitness">AQUAFITNESS</option>
    <option value="intensive">Cours Intensif</option>
  </select>
</div>


        {/* Override toggle */}
        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={bypass}
            onChange={(e) => setBypass(e.target.checked)}
          />
          <span className="text-sm">Bypass auto-sélection de cours (choisir manuellement)</span>
        </div>

        {/* Course */}
        <div className="mt-3">
          <label className="block text-sm font-medium mb-1">Cours</label>
          {bypass ? (
            <select
              value={overrideCourse}
              onChange={(e) => setOverrideCourse(e.target.value)}
              className="border p-2 rounded w-full"
            >
              <option value="">— Choisir un cours —</option>
              {courses
                .filter(c => c.course_type === courseMode)
                .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              readOnly
              value={
                courseMode === "intensive"
                  ? intensiveCourse?.name || "—"
                  : autoCourse?.name || "—"
              }
              className="border p-2 rounded w-full bg-gray-50"
            />
          )}
        </div>

        {/* Hours */}
{courseMode !== "intensive" && (
<div className="mt-3">
  <label className="block text-sm font-medium mb-1">Heures disponibles</label>

  {(() => {
    const course = bypass
      ? courses.find((c) => c.id === overrideCourse)
      : autoCourse;

    if (!course) return null;

    const slots = seriesByCourse[course.id] || [];

    return slots.map((ser) => {
      const firstStart = ser.start_time.slice(0, 5);
      const firstEnd = addHoursToTimeStr(ser.start_time, 1);
      const secondEnd = addHoursToTimeStr(ser.start_time, 2);

      // 🔥 REAL session duration from DB
      const duration = Number(ser.duration_hours ?? 1);

      const dayName = FRENCH_DAYS[(ser.day_of_week - 1 + 7) % 7];

      return (
        <div key={ser.id} className="ml-2 mb-2">

          {/* Top row showing correct total duration */}
          <div className="font-medium text-gray-700">
            {dayName} : {firstStart} - {duration === 2 ? secondEnd : firstEnd}
          </div>

          {/* FIRST HOUR ALWAYS SHOWN */}
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedHours.includes(`${ser.key}-first`)}
              onChange={() => toggleHour(`${ser.key}-first`)}
            />
            {dayName} {firstStart} - {firstEnd}
            <span className="text-xs text-gray-600">
              (1h → {formatCurrencyUSD(
                publicPlans.find((p) => p.duration_hours === 1)?.price ?? 60
              )})
            </span>
          </label>

          {/* SECOND HOUR ONLY IF SESSION IS 2h */}
          {(duration === 2 || isAdminUser) && (
            <label className="inline-flex items-center gap-2 ml-6">
              <input
                type="checkbox"
                checked={selectedHours.includes(`${ser.key}-second`)}
                onChange={() => toggleHour(`${ser.key}-second`)}
              />
              {dayName} {firstEnd} - {secondEnd}
              <span className="text-xs text-gray-600">
                (2h total → {formatCurrencyUSD(
                  publicPlans.find((p) => p.duration_hours === 2)?.price ?? 85
                )})
              </span>
            </label>
          )}
        </div>
      );
    });
  })()}
</div>
)}
{courseMode === "intensive" && (
  <div className="mt-3">
    <label className="block text-sm font-medium mb-1">Durée</label>
    <select
      value={intensiveDuration ?? ""}
      onChange={e => setIntensiveDuration(Number(e.target.value))}
      className="border p-2 rounded w-full"
    >
      <option value="">— Choisir —</option>
      <option value={1}>1 semaine</option>
      <option value={2}>2 semaines</option>
      <option value={4}>4 semaines</option>
    </select>
  </div>
)}



        {/* Date */}
        <div className="mt-3">
          <label className="block text-sm font-medium mb-1">Date de début</label>
          <input
            type="date"
            value={startDate ? startDate : ""}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-60 border p-2 rounded w-full"
          />
        </div>
        {/* Plan display */}
<div className="mt-3">
  <label className="block text-sm font-medium mb-1">Plan</label>
  {!overrideEnabled ? (
    <div className="flex items-center justify-between border p-2 rounded bg-gray-50">
      <span>
  {chosenPlan ? (
    <>
      {chosenPlan.name} ({chosenPlan.duration_hours}h →{" "}
{formatCurrencyUSD(
  overrideEnabled && overridePlanId
    ? plans.find((p) => p.id === overridePlanId)?.price ??
      chosenPlan.price
    : overridePlanId
    ? plans.find((p) => p.id === overridePlanId)?.price ??
      chosenPlan.price
    : chosenPlan.price
)}
)

    </>
  ) : (
    "Aucun plan (choisissez une heure)"
  )}
</span>


      <button
        type="button"
        onClick={() => setOverrideEnabled(true)}
        className="ml-2 px-3 py-1 text-xs bg-yellow-500 text-white rounded"
      >
        Override
      </button>
    </div>
  ) : (
    <div className="flex gap-2">
      <select
        value={overridePlanId}
        onChange={(e) => setOverridePlanId(e.target.value)}
        className="border p-2 rounded w-full"
      >
        <option value="">-- Choisir un plan --</option>
        {publicPlans.map((pl) => (
          <option key={pl.id} value={pl.id}>
            {pl.name} ({pl.duration_hours}h → {formatCurrencyUSD(pl.price)})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          setOverrideEnabled(false);
          setOverridePlanId("");
        }}
        className="px-3 py-1 text-xs bg-gray-300 rounded"
      >
        Annuler
      </button>
    </div>
  )}
</div>



        <button
          type="submit"
          disabled={loading}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Enregistrement…" : "Confirmer l'inscription"}
        </button>
      </form>

      {/* Table with filters */}
      <div className="flex flex-wrap gap-3 mb-3">
  <label className="text-sm">Filtrer par jour</label>
  <select
    value={dayFilter}
    onChange={(e) => setDayFilter(e.target.value)}
    className="border rounded px-2 py-1 text-sm"
  >
    <option value="">Tous</option>
    {FRENCH_DAYS.map((d, i) => (
      <option key={i} value={i}>{d}</option>
    ))}
  </select>

  <label className="text-sm">Filtrer par heure</label>
  <select
    value={timeFilter}
    onChange={(e) => setTimeFilter(e.target.value)}
    className="border rounded px-2 py-1 text-sm"
  >
    <option value="">Toutes</option>
    {hourOptions.map((h) => (
      <option key={h} value={h}>{h}</option>
    ))}
  </select>
  <label className="text-sm">Filtrer par cours</label>
<select
  value={filterCourseId}
  onChange={(e) => setFilterCourseId(e.target.value)}
  className="border rounded px-2 py-1 text-sm"
>
  <option value="">Tous</option>
  {courses.map(c => (
    <option key={c.id} value={c.id}>{c.name}</option>
  ))}
</select>

</div>



  {/* 🖥 Desktop table */}
    <div className="hidden md:block overflow-x-auto">
      {/* Enrollments Table */}
      <div className="bg-white border rounded shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Étudiant</th>
              <th className="px-3 py-2 text-left">Cours</th>
              <th className="px-3 py-2 text-left">Jour</th>
              <th className="px-3 py-2 text-left">Heure</th>
              <th className="px-3 py-2 text-left">Durée</th>
              <th className="px-3 py-2 text-left">Plan</th>
              <th className="px-3 py-2 text-left">Début</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-2">{e.full_name || e.profiles?.full_name || "—"}</td>
                <td className="px-3 py-2">{e.courses?.name || "—"}</td>
                <td className="px-3 py-2">{dayLabel(e)}</td>
                <td className="px-3 py-2">{heureRange(e, plans)}</td>
                <td className="px-3 py-2">
                  {/* Allow switching duration by swapping to a plan with same course but 1h/2h */}
                  <select
                  value={getCurrentDur(e)}
                  onChange={async (ev) => {
                    const newDur = Number(ev.target.value);
                    // find a plan of the same course (or general) with the chosen duration
                    const courseType = courses.find(c => c.id === e.course_id)?.course_type;

                  const candidate = publicPlans.find(
                    (p) =>
                      Number(p.duration_hours) === newDur &&
                      p.course_type === courseType
                  );


                    if (!candidate) {
                      alert("Aucun plan trouvé pour cette durée.");
                      return;
                    }

                    const { error } = await supabase
                      .from("enrollments")
                      .update({ plan_id: candidate.id })
                      .eq("id", e.id);

                    if (error) {
                      alert("Erreur mise à jour de la durée: " + error.message);
                    } else {
                      await loadEnrollments(); // refresh rows + join
                    }
                  }}
                  className="border rounded px-1 py-0.5 text-sm">
                  <option value={1}>1h</option>
                  <option value={2}>2h</option>
                  
                  </select>
                </td>
                  <td className="px-3 py-2">
                  <select
                    value={e.plan_id || ""}
                    onChange={async (ev) => {
                  const newPlanId = ev.target.value;

                  // Find the new plan price
                  const chosenPlan = plans.find(p => p.id === newPlanId);
                  const newPrice = chosenPlan?.price || 0;

                  // Update the enrollment (plan + optional override)
                  const { data: updated, error } = await supabase
                  .from("enrollments")
                  .update({
                    plan_id: newPlanId,
                    override_price: newPrice
                  })
                  .eq("id", e.id)
                  .select("id, plan_id, override_price")
                  .single();

                  await loadEnrollments();


                if (error) {
                  alert("Erreur mise à jour du plan: " + error.message);
                } else {
                  // ✅ Immediately reflect the new override price in UI
                  setEnrollments(prev =>
                    prev.map(row =>
                      row.id === e.id
                        ? { ...row, ...updated }
                        : row
                    )
                  );

                    alert(`✅ Plan mis à jour: ${chosenPlan.name} — $${newPrice}`);
                  }
                }}

                    className="border rounded px-1 py-0.5 text-sm"
                  >
                    <option value="">—</option>
                    {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatCurrencyUSD(
                      e.plan_id === p.id
                        ? (e.override_price ?? p.price)   // ✅ use override_price if present
                        : p.price
                    )}
                  </option>
                ))}

                  </select>
                </td>
                <td className="px-3 py-2">{formatDateFrSafe(e.start_date)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      e.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => handleDelete(e)}
                    className="px-2 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-700"
                    title="Supprimer inscription"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-4 text-gray-500">
                  Aucune inscription.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3">
          <span className="text-xs text-gray-600">
            Page {page} / {totalPages}
            <span className="ml-3 text-gray-500">
              • {enrolledCount} / {enrollments.length} inscriptions
            </span>
          </span>
          <div className="flex gap-2">
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Précédent
            </button>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Suivant
            </button>
          </div>
        </div>
      </div>
    </div>
    {/* 📱 Mobile cards */}
<div className="md:hidden space-y-4">
  {visibleRows.map((e) => (
    <EnrollmentCard
      key={e.id}
      e={e}
      plans={plans}
      publicPlans={publicPlans}
      courses={courses}
      onDelete={handleDelete}
      loadEnrollments={loadEnrollments}
    />
  ))}
</div>

  </div>
  );
  function EnrollmentCard({ e, plans, publicPlans, courses, onDelete, loadEnrollments }) {
  const currentDur = Number(
    (publicPlans?.find((p) => p.id === e.plan_id)?.duration_hours) ??
      (e.plans?.duration_hours ?? 1)
  );

  const planName =
    e.plans?.name || plans.find((p) => p.id === e.plan_id)?.name || "—";

  const planPrice =
    e.override_price ??
    e.plans?.price ??
    plans.find((p) => p.id === e.plan_id)?.price ??
    0;

  // (optional) show loading state per card
  const [savingDur, setSavingDur] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-blue-700">
            {e.profiles?.full_name || "—"}
          </p>
          <p className="text-xs text-gray-500">{e.courses?.name}</p>
        </div>

        <span
          className={`px-2 py-1 rounded text-xs ${
            e.status === "active"
              ? "bg-green-100 text-green-700"
              : "bg-gray-200 text-gray-700"
          }`}
        >
          {e.status}
        </span>
      </div>

      <div className="text-sm text-gray-700 space-y-2">
        <div className="flex justify-between">
          <span>Jour</span>
          <span>{dayLabel(e)}</span>
        </div>

        <div className="flex justify-between">
          <span>Heure</span>
          <span>{heureRange(e, plans)}</span>
        </div>

        {/* ✅ Durée (editable like desktop) */}
        <div className="flex justify-between items-center gap-3">
          <span>Durée</span>

          <select
            value={currentDur}
            disabled={savingDur}
            onChange={async (ev) => {
              const newDur = Number(ev.target.value);

              // same logic as desktop
              const courseType = courses.find((c) => c.id === e.course_id)?.course_type;

              const candidate = publicPlans.find(
                (p) =>
                  Number(p.duration_hours) === newDur &&
                  p.course_type === courseType
              );

              if (!candidate) {
                alert("Aucun plan trouvé pour cette durée.");
                return;
              }

              setSavingDur(true);
              try {
                const { error } = await supabase
                  .from("enrollments")
                  .update({ plan_id: candidate.id })
                  .eq("id", e.id);

                if (error) {
                  alert("Erreur mise à jour de la durée: " + error.message);
                  return;
                }

                await loadEnrollments();
              } finally {
                setSavingDur(false);
              }
            }}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            <option value={1}>1h</option>
            <option value={2}>2h</option>
          </select>
        </div>

        {/* ✅ Plan (responsive) */}
<div className="grid grid-cols-[auto,1fr] items-center gap-3">
  <span className="shrink-0">Plan</span>

  <div className="min-w-0">
    <select
      value={e.plan_id || ""}
      disabled={savingPlan}
      onChange={async (ev) => {
        const newPlanId = ev.target.value;

        const chosen = plans.find((p) => p.id === newPlanId);
        const newPrice = chosen?.price || 0;

        setSavingPlan(true);
        try {
          const { data: updated, error } = await supabase
            .from("enrollments")
            .update({
              plan_id: newPlanId,
              override_price: newPrice,
            })
            .eq("id", e.id)
            .select("id, plan_id, override_price")
            .single();

          if (error) {
            alert("Erreur mise à jour du plan: " + error.message);
            return;
          }

          await loadEnrollments();
          alert(`✅ Plan mis à jour: ${chosen?.name || "—"} — $${newPrice}`);
        } finally {
          setSavingPlan(false);
        }
      }}
      className="w-full min-w-0 max-w-full border rounded px-2 py-1 text-sm bg-white truncate"
    >
      <option value="">—</option>
      {plans.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} — {formatCurrencyUSD(
            e.plan_id === p.id ? (e.override_price ?? p.price) : p.price
          )}
        </option>
      ))}
    </select>
  </div>
</div>


        {/* Info line (still useful) */}
        <div className="text-xs text-gray-500 flex justify-end">
          {planName} — {formatCurrencyUSD(planPrice)}
        </div>

        <div className="flex justify-between">
          <span>Début</span>
          <span>{formatDateFrSafe(e.start_date)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(e)}
        className="w-full mt-2 bg-red-600 text-white py-2 rounded-lg text-sm"
      >
        Supprimer
      </button>
    </div>
  );
}


}
