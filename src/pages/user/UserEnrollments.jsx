// src/pages/user/UserEnrollments.jsx
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";


const FRENCH_DAYS = [
  "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi",
];

// --- Helpers ---
function addHoursToTimeStr(timeStr, hoursToAdd) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map((x) => parseInt(x, 10));
  const base = new Date(2000, 0, 1, h, m || 0, 0);
  base.setHours(base.getHours() + hoursToAdd);
  const hh = String(base.getHours()).padStart(2, "0");
  const mm = String(base.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
function ageInMonths(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const n = new Date();
  return (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
}
function stripAccents(s = "") {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function detectCourseByAge(courses, months) {
  if (!Array.isArray(courses) || months == null) return null;

  // Buckets (same as admin)
  let bucket = "adultes";
  if (months <= 83) bucket = "tous petits";
  else if (months <= 155) bucket = "enfants";
  else if (months <= 216) bucket = "adolescents";

  // Synonyms
  const keywords = {
    "tous petits": ["tous petits", "tout petit", "bébé", "bebe", "baby"],
    "enfants": ["enfant", "enfants", "kids"],
    "adolescents": ["adolescent", "adolescents", "ado", "ados", "teen", "teens"],
    "adultes": ["adulte", "adultes", "adult", "adults"],
  }[bucket];

  // Try matching by name (accent-insensitive, case-insensitive)
  const found =
    courses.find((c) => {
      const name = stripAccents(c.name || "");
      return keywords.some((k) => name.includes(stripAccents(k)));
    }) || null;

  return found;
}

export default function UserEnrollments({ userId }) {
  const [profile, setProfile] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);

  const [courses, setCourses] = useState([]);
  const [courseMode, setCourseMode] = useState("natation");
  const [plans, setPlans] = useState([]);
  const [seriesByCourse, setSeriesByCourse] = useState({}); // { courseId: [{ id, day_of_week, start_time, key }, ...] }

  const [selectedCourse, setSelectedCourse] = useState(null); // dropdown value (auto-prefilled)
  const [selectedHours, setSelectedHours] = useState([]); // ["<seriesKey>-first", "<seriesKey>-second"]
  const [startDate, setStartDate] = useState(""); // user must choose
  const [loading, setLoading] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);
  const [existingEnrollment, setExistingEnrollment] = useState(null);
  const { showAlert, showConfirm, showInput } = useGlobalAlert();


  // 1) Load parent & children (with birth_date for detection)
  useEffect(() => {
    (async () => {
      const { data: parent } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name, birth_date, signup_type")
        .eq("id", userId)
        .maybeSingle();

      const { data: kids } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name, birth_date")
        .eq("parent_id", userId);

      setProfile(parent || null);
setChildren(kids || []);

// Determine which profile should be selected by default
if (parent?.signup_type === "children_only" && kids?.length > 0) {
  // if parent is children_only → default to first child
  setSelectedProfile(kids[0]);
} else {
  setSelectedProfile(parent || kids[0] || null);
}

    })();
  }, [userId]);

  // 2) Load ALL courses & plans (no is_public filter) + group active sessions
  useEffect(() => {
    (async () => {
      const [{ data: crs }, { data: pls }] = await Promise.all([
        supabase
  .from("courses")
  .select("id, name, course_type")   // <-- REQUIRED!!
  .order("name"),
        supabase.from("plans").select("id, name, price, duration_hours, is_public, course_type"),
      ]);

      setCourses(crs || []);
      setPlans(pls || []);

      const seriesMap = {};
      if (crs?.length) {
        for (const c of crs) {
          const { data: s } = await supabase
            .from("sessions")
            .select("id, course_id, day_of_week, start_time, duration_hours, status")
            .eq("course_id", c.id)
            .eq("status", "active")
            .order("day_of_week", { ascending: true })
            .order("start_time", { ascending: true });

          if (!s?.length) {
            seriesMap[c.id] = [];
            continue;
          }
          const seen = new Set();
          const grouped = [];
          for (const sess of s) {
            const key = `${sess.day_of_week}-${String(sess.start_time).slice(0, 5)}`; // e.g. "7-08:00"
            if (!seen.has(key)) {
              seen.add(key);
              grouped.push({ ...sess, key });
            }
          }
          seriesMap[c.id] = grouped;
        }
      }
      setSeriesByCourse(seriesMap);
    })();
  }, []);

  // 3) Auto-detect & preselect course when profile or courses change
  useEffect(() => {
    if (!selectedProfile || !courses.length) {
      setSelectedCourse(null);
      return;
    }
    const months = ageInMonths(selectedProfile.birth_date);
    const filtered = courses.filter(c => c.course_type === courseMode);

if (courseMode === "aquafitness") {
  // Aquafitness doesn't depend on age → pick first automatically
  setSelectedCourse(filtered[0] || null);
} else {
  const detected = detectCourseByAge(filtered, months);
  setSelectedCourse(detected || filtered[0] || null);
}


    setSelectedHours([]); // reset hours on profile switch
    setStartDate("");     // user must pick date — never auto-fill
  }, [selectedProfile, courses, courseMode]);

  // 4) Load the latest enrollment (for update path) — DO NOT prefill date
  useEffect(() => {
    if (!selectedProfile) return;
    (async () => {
      const { data: enr } = await supabase
        .from("enrollments")
        .select("id, course_id, session_id, plan_id, start_date, status")
        .eq("profile_id", selectedProfile.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setExistingEnrollment(enr || null);
      // We intentionally DO NOT set startDate here; user must pick it.
    })();
  }, [selectedProfile]);

  // 5) Auto-match plan from 1h/2h
  const chosenPlan = useMemo(() => {
  if (!selectedCourse) return null;
  if (selectedHours.length === 0) return null;

  const isTwoHours = selectedHours.length >= 2;
  const dur = isTwoHours ? 2 : 1;

  return plans
  .filter(p => p.is_public)   // ← ONLY show public plans
  .find(
    (p) =>
      Number(p.duration_hours) === dur &&
      p.course_type === courseMode
  ) || null;
}, [plans, selectedHours, selectedCourse, courseMode]);



  let warningShown = false;
  // 6) Toggle hour checkboxes (admin-like)
  function toggleHour(which) {
  const FIRST = "-first";
  const SECOND = "-second";
  const isSecond = which.endsWith(SECOND);
  const isFirst = which.endsWith(FIRST);

  const base = isSecond
    ? which.slice(0, -SECOND.length)
    : isFirst
    ? which.slice(0, -FIRST.length)
    : which;

  const sessionList = seriesByCourse[selectedCourse?.id] || [];
  const session = sessionList.find((s) => s.key === base);
  const duration = Number(session?.duration_hours ?? 1);

  setSelectedHours((prev) => {
    // ❌ No second hour on a 1h session
    if (isSecond && duration === 1) return prev;

    const has = prev.includes(which);

    // ---- AQUAFITNESS MODE ----
    if (courseMode === "aquafitness") {
      if (!has) {
        // Add hour freely (multi-day allowed)
        // But: cannot pick second without first
        if (isSecond && !prev.includes(`${base}${FIRST}`)) {
          showAlert("Vous devez choisir la première heure avant la seconde.");
          return prev;
        }
        return [...prev, which];
      }

      // Unselecting
      if (isFirst) {
        return prev.filter((h) => h !== which && h !== `${base}${SECOND}`);
      }
      return prev.filter((h) => h !== which);
    }

    // ---- NATATION MODE (existing behavior) ----
    if (!has) {
      const prevBase = prev[0]
        ? prev[0].replace(/(-first|-second)$/, "")
        : null;
      let next = prev;

      if (prevBase && prevBase !== base) next = [];

      if (isSecond && !next.includes(`${base}${FIRST}`)) {
        showAlert(
          "Il est impératif de choisir la première tranche d'heure si vous choisissez 1 heure par séance."
        );
        return next;
      }
      return [...next, which];
    }

    if (isFirst) {
      return prev.filter((h) => h !== which && h !== `${base}${SECOND}`);
    }

    return prev.filter((h) => h !== which);
  });
}



  // 7) Submit (create or update)
  async function handleSubmit(e) {
    e.preventDefault();

    if (!selectedProfile) return alert("Aucun profil sélectionné.");
    if (!selectedCourse) return alert("Sélectionnez un cours.");
    if (!startDate) return alert("Choisissez une date de début.");
    if (selectedHours.length === 0) return alert("Choisissez au moins une heure.");

    // Resolve picked series to a session_id
    const FIRST = "-first";
    const SECOND = "-second";
    const token = selectedHours[0];
    const baseKey = token.endsWith(FIRST)
      ? token.slice(0, -FIRST.length)
      : token.endsWith(SECOND)
      ? token.slice(0, -SECOND.length)
      : token;

    const courseSeries = seriesByCourse[selectedCourse.id] || [];
    const pickedSeries = courseSeries.find((x) => x.key === baseKey);
    if (!pickedSeries) return alert("Créneau introuvable pour ce cours.");

    const plan = chosenPlan;
    if (!plan) return alert("Aucun plan valide trouvé pour la durée choisie.");

    setLoading(true);
    try {
      if (existingEnrollment?.id) {
        // Update path
        const { error: updErr } = await supabase
          .from("enrollments")
          .update({
            course_id: selectedCourse.id,
            session_id: pickedSeries.id,
            plan_id: plan.id,
            start_date: startDate,
          })
          .eq("id", existingEnrollment.id);

        if (updErr) throw updErr;

        setSuccessInfo({
          course: selectedCourse.name,
          plan: plan.name,
          price: plan.price,
          startDate,
        });
        alert("Inscription mise à jour avec succès !");
      } else {
        // Create via RPC (also creates invoice)
        const { error } = await supabase.rpc("create_enrollment_with_invoice", {
          p_profile_id: selectedProfile.id,
          p_course_id: selectedCourse.id,
          p_session_id: pickedSeries.id,
          p_plan_id: plan.id,
          p_start_date: startDate,
          p_course_name: selectedCourse.name,
          p_plan_name: plan.name,
          p_price: plan.price,
          p_full_name: selectedProfile.full_name,
        });
        if (error) throw error;

        setSuccessInfo({
          course: selectedCourse.name,
          plan: plan.name,
          price: plan.price,
          startDate,
        });
        showAlert("Nouvelle inscription enregistrée !");
      }

      // Keep date/course; clear hours for clarity
      setSelectedHours([]);
    } catch (err) {
      console.error(err);
      alert("Erreur: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // UI
  const userName = selectedProfile?.full_name ?? "—";
  const courseSeries = selectedCourse ? (seriesByCourse[selectedCourse.id] || []) : [];

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-blue-600 to-teal-400 text-white rounded-2xl shadow-xl p-6 mb-6"
      >
        <h2 className="text-3xl font-bold mb-2 text-center">S'enregistrer dans une classe</h2>

        {/* Parent/children selector */}
{(() => {
  // Build the pool of selectable profiles
  const selectable = [
    ...(profile?.signup_type === "children_only" ? [] : [profile]),
    ...(children || []),
  ].filter(Boolean);

  // If more than one choice, show dropdown
  if (selectable.length > 1) {
    return (
      <div className="flex justify-center mt-3">
        <select
          value={selectedProfile?.id || ""}
          onChange={(e) => {
            const p = selectable.find((x) => x.id === e.target.value);
            setSelectedProfile(p || null);
          }}
          className="w-60 bg-white text-gray-700 border-none rounded-lg px-4 py-2 text-sm font-medium shadow focus:ring-4 focus:ring-blue-200 transition text-center"
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

  // Otherwise show a single name (no dropdown)
  return <p className="text-center opacity-90">Bienvenue, {selectable[0]?.full_name ?? "—"}</p>;
})()}
</motion.div>

      {/* Form */}
      {!successInfo ? (
        <motion.form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-md p-6 space-y-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Course Type Selector */}
<div>
  <label className="block text-sm font-medium mb-1">Type de cours</label>
  <select
    value={courseMode}
    onChange={(e) => {
      setCourseMode(e.target.value);
setSelectedHours([]);
setStartDate("");

    }}
    className="border p-2 rounded w-full"
  >
    <option value="natation">Natation</option>
    <option value="aquafitness">AQUAFITNESS</option>
  </select>
</div>

          {/* Choisir un cours (dropdown, auto-prefilled) */}
          <div>
            <label className="block text-sm font-medium mb-1">Choisir un cours</label>
            <input
              type="text"
              readOnly
              value={selectedCourse?.name || "—"}
              className="border p-2 rounded w-full bg-gray-50"
            />
          </div>

          {/* Heures (checkboxes like admin) */}
          {selectedCourse && courseSeries.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Sélectionnez vos horaires</label>

              <div className="space-y-3">
                {courseSeries.map((ser) => {
                  const dayName = FRENCH_DAYS[(Number(ser.day_of_week) - 1 + 7) % 7] || "Jour";
                  const firstStart = ser.start_time.slice(0, 5);
                  const duration = Number(ser.duration_hours ?? 1);
                  const firstEnd = addHoursToTimeStr(ser.start_time, 1);
                  const secondEnd = addHoursToTimeStr(ser.start_time, 2);


                  return (
                    <div key={ser.id} className="border rounded-lg p-3">
                      <div className="font-medium text-gray-700 mb-2">
                        {dayName} : {firstStart} - {secondEnd}
                      </div>

                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedHours.includes(`${ser.key}-first`)}
                          onChange={() => toggleHour(`${ser.key}-first`)}
                          className="accent-teal-600"
                        />
                        {dayName} {firstStart} - {firstEnd}
                        <span className="text-xs text-gray-600">
                          (1h → {formatCurrencyUSD((plans.find((p) => p.duration_hours === 1) || {}).price || 0)})
                        </span>
                      </label>
                      {duration === 2 && (
                      <label className="inline-flex items-center gap-2 ml-6">
                        <input
                          type="checkbox"
                          checked={selectedHours.includes(`${ser.key}-second`)}
                          onChange={() => toggleHour(`${ser.key}-second`)}
                          className="accent-teal-600"
                        />
                        {dayName} {firstEnd} - {secondEnd}
                        <span className="text-xs text-gray-600">
                          (2h total → {formatCurrencyUSD((plans.find((p) => p.duration_hours === 2) || {}).price || 0)})
                        </span>
                      </label>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-gray-500 mt-2">
                ℹ️ Si vous choisissez seulement 1 heure, elle doit être la <b>première tranche</b>.
              </p>
            </div>
          )}

          {/* Date (required, never prefilled) */}
          <div>
            <label className="block text-sm font-medium mb-1">Date de début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onClick={(e) => e.target.showPicker && e.target.showPicker()} // ✅ forces dialog open
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-400"
            />
          </div>

          {/* Plan (auto, non-editable) */}
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <div className="border rounded-xl bg-blue-50 p-4 text-center">
              {chosenPlan ? (
                <>
                  <div className="text-lg font-semibold">{chosenPlan.name}</div>
                  <div className="text-gray-700 mt-1">
                    <b>{formatCurrencyUSD(chosenPlan.price)}</b>
                  </div>
                </>
              ) : (
                <div className="text-gray-500">Choisissez vos horaires pour voir le plan.</div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-teal-500 text-white py-3 rounded-xl font-semibold shadow hover:from-blue-500 hover:to-teal-400 transition-all disabled:opacity-60"
          >
            {loading
              ? "Enregistrement..."
              : existingEnrollment
              ? "Mettre à jour mon inscription"
              : "Confirmer mon inscription"}
          </button>
        </motion.form>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-2xl shadow-md p-6 text-center"
        >
          <h3 className="text-2xl font-bold text-green-600 mb-3">✅ Inscription réussie !</h3>
          <p className="text-gray-700">
            Cours: <b>{successInfo.course}</b><br />
            Plan: <b>{successInfo.plan}</b><br />
            Début: <b>{formatDateFrSafe(successInfo.startDate)}</b><br />
            Montant: <b>{formatCurrencyUSD(successInfo.price)}</b>
          </p>
          <button
            className="mt-6 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            onClick={() => setSuccessInfo(null)}
          >
            Nouvelle inscription
          </button>
        </motion.div>
      )}
    </div>
  );
}
