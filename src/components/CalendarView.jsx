import { useEffect, useState, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import frLocale from "@fullcalendar/core/locales/fr";
import { addYears } from "date-fns";
import { supabase } from "../lib/supabaseClient";
import "../styles/calendar-theme.css";
import { useGlobalAlert } from "../components/GlobalAlert";
//import { formatCurrencyUSD, formatDateFrSafe } from "../lib/dateUtils";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { detectCountryISO } from "../lib/detectCountry";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    window.innerWidth < breakpoint
  );

  useEffect(() => {
    const onResize = () =>
      setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function cleanTime(t) {
  if (!t) return "—";
  if (!t.includes(":")) return t + ":00"; // Fix "10" → "10:00"
  let [hh, mm] = t.split(":");
  hh = hh.padStart(2, "0");
  mm = (mm || "00").padStart(2, "0");
  return `${hh}:${mm}`;
}


function toMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function diffMinutes(a, b) {
  return Math.max(0, toMinutes(a) - toMinutes(b));
}

function ceilTo30(mins) {
  return Math.ceil(mins / 30);
}


function minTime(a, b) {
  return a < b ? a : b;
}

export default function CalendarView({
  mode = "ecole",
  onSlotSelect,
  closingTime,
  overtimeCutoff,
  extraTimePricePer30,
  overtimePricePer30,
}) {

    // ===============================
  // Admin-safe pricing (Option A)
  // ===============================
  const effectiveExtraPrice = Number(extraTimePricePer30 || 0);
const effectiveOvertimePrice = Number(overtimePricePer30 || 0);



  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const clampAlertShownRef = useRef(false);
  const [country, setCountry] = useState("HT");
  const [visibleRange, setVisibleRange] = useState(null);


useEffect(() => {
  detectCountryISO()
    .then((c) => setCountry(c || "HT"))
    .catch(() => setCountry("HT"));
}, []);



  // ---- Booking Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null); // { date: Date, start?: Date, end?: Date }
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "", 
    title: "",
    booking_type: "daypass", // "daypass" | "full"
    date: "", // "YYYY-MM-DD"
    start_time: "10:00",
    end_time: "12:00",
    quantity: 1,
  });
  const [errors, setErrors] = useState({}); // inline validation
  const [qty, setQty] = useState(1);
  const [liveEstimate, setLiveEstimate] = useState(null);
  const effectiveOvertimeCutoff =
  overtimeCutoff && overtimeCutoff.includes(":")
    ? overtimeCutoff
    : closingTime;


  const [currentTitle, setCurrentTitle] = useState("");
  const calendarRef = useRef(null);
  const today = useMemo(() => new Date(), []);
  const [studentsBySession, setStudentsBySession] = useState({});
  const { showAlert, showConfirm } = useGlobalAlert();
  const [useExtraTime, setUseExtraTime] = useState(false);
  const [extraBlocks, setExtraBlocks] = useState(0); // 30 min blocks
  const isMobile = useIsMobile();
  const [currentView, setCurrentView] = useState("dayGridMonth");



  const [useOvertime, setUseOvertime] = useState(false);
  const [overtimeBlocks, setOvertimeBlocks] = useState(0);
  const extraCost = extraBlocks * effectiveExtraPrice;
const overtimeCost = overtimeBlocks * effectiveOvertimePrice;



const totalExtraCost = extraCost + overtimeCost;

const finalEstimate =
  liveEstimate != null
    ? Number(liveEstimate) + Number(totalExtraCost || 0)
    : null;

  const defaultDurationMinutes =
  form.booking_type === "full" ? 5 * 60 : 4 * 60;

  useEffect(() => {
  if (showModal) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
  return () => {
    document.body.style.overflow = "";
  };
}, [showModal]);


useEffect(() => {
  if (!form.start_time) return;
  if (!closingTime || !closingTime.includes(":")) return;

  const startM = toMinutes(form.start_time);
  const closingM = toMinutes(closingTime);
  const cutoffM =
    overtimeCutoff && overtimeCutoff.includes(":")
      ? toMinutes(overtimeCutoff)
      : closingM;

  let baseEndM = startM + defaultDurationMinutes;
  let endM = baseEndM;
  let wasClamped = false;

  // Extra time before closing
  if (useExtraTime && extraBlocks > 0) {
    const requested = baseEndM + extraBlocks * 30;
    if (!useOvertime && requested > closingM) {
      wasClamped = true;
    }
    endM = Math.min(requested, closingM);
  } else {
    if (!useOvertime && baseEndM > closingM) {
      wasClamped = true;
    }
    endM = Math.min(baseEndM, closingM);
  }

  // Overtime
  if (useOvertime && overtimeBlocks > 0 && endM >= closingM) {
    endM = Math.min(
      closingM + overtimeBlocks * 30,
      cutoffM
    );
  }

  // ✅ ALERT ONLY ONCE
  if (wasClamped && !clampAlertShownRef.current) {
    clampAlertShownRef.current = true;
    showAlert(
      `⛔ L’heure de fin a été limitée à ${closingTime} car la durée dépasse l’heure de fermeture.\n\n👉 Activez « Prolongation après fermeture » pour aller au-delà.`
    );
  }

  // Reset alert flag if no longer clamped
  if (!wasClamped) {
    clampAlertShownRef.current = false;
  }

  const hh = String(Math.floor(endM / 60)).padStart(2, "0");
  const mm = String(endM % 60).padStart(2, "0");

  setForm((p) => ({ ...p, end_time: `${hh}:${mm}` }));
}, [
  form.start_time,
  form.booking_type,
  useExtraTime,
  extraBlocks,
  useOvertime,
  overtimeBlocks,
  closingTime,
  overtimeCutoff,
]);



useEffect(() => {
  if (!useOvertime) return;
  if (!form.start_time || !closingTime) return;

  const startM = toMinutes(form.start_time);
  const closingM = toMinutes(closingTime);
  const cutoffM = effectiveOvertimeCutoff
    ? toMinutes(effectiveOvertimeCutoff)
    : closingM;

  const baseEndM = startM + defaultDurationMinutes;

  if (baseEndM <= closingM) {
  // let the next effect handle disabling overtime entirely
  return;
}


  const overtimeMinutes = Math.min(
    baseEndM - closingM,
    cutoffM - closingM
  );

  const blocks = Math.ceil(overtimeMinutes / 30);

  setOvertimeBlocks(blocks);
}, [
  useOvertime,
  form.booking_type,   // ← THIS now works
  form.start_time,
  closingTime,
  effectiveOvertimeCutoff,
  defaultDurationMinutes,
]);

useEffect(() => {
  if (!useOvertime) return;
  if (!form.start_time || !closingTime) return;

  const startM = toMinutes(form.start_time);
  const closingM = toMinutes(closingTime);

  // 🔑 Compute CURRENT end time (base + extra)
  let currentEndM = startM + defaultDurationMinutes;

  if (useExtraTime && extraBlocks > 0) {
    currentEndM = Math.min(
      currentEndM + extraBlocks * 30,
      closingM
    );
  } else {
    currentEndM = Math.min(currentEndM, closingM);
  }

  // ❌ Disable overtime ONLY if we did NOT reach closing
  if (currentEndM < closingM) {
    setUseOvertime(false);
    setOvertimeBlocks(0);
  }
}, [
  useOvertime,
  useExtraTime,
  extraBlocks,
  form.start_time,
  form.booking_type,
  closingTime,
  defaultDurationMinutes,
]);



useEffect(() => {
  if (!showModal) return;
  if (!closingTime || !closingTime.includes(":")) return;

  // 🔁 Force recalculation when modal opens
  setForm((p) => ({ ...p }));
}, [showModal, closingTime]);


  // Prefill modal form when selectedSlot changes
  useEffect(() => {
  if (!selectedSlot?.date) return;

  const dateISO = toISODate(selectedSlot.date);

  const hasExplicitRange =
    selectedSlot.start instanceof Date &&
    selectedSlot.end instanceof Date &&
    selectedSlot.start.getTime() !== selectedSlot.end.getTime();

  setForm((prev) => ({
    ...prev,
    date: dateISO,

    // ✅ ONLY set times if user dragged a range
    ...(hasExplicitRange
      ? {
          start_time: cleanTime(
            selectedSlot.start.toTimeString().slice(0, 5)
          ),
          end_time: cleanTime(
            selectedSlot.end.toTimeString().slice(0, 5)
          ),
        }
      : {}),
  }));
}, [selectedSlot]);



  // 🔁 Whenever type or quantity changes, fetch estimate from DB
  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!form.booking_type || !qty) return;
      const { data, error } = await supabase.rpc("calculate_booking_price", {
        p_booking_type: form.booking_type, // 'daypass' | 'full'
        p_quantity: Number(qty),
      });
      if (!ignore && !error) setLiveEstimate(data); // numeric
      if (!ignore && error) setLiveEstimate(null);
    })();
    return () => {
      ignore = true;
    };
  }, [form.booking_type, qty]);

  // ---------------- Load events
  useEffect(() => {
  if (!visibleRange) return;
  loadEvents(visibleRange.start, visibleRange.end);
}, [visibleRange]);


  async function loadEvents(rangeStart, rangeEnd) {
    setLoading(true);
    try {
      const startISO = toISODate(rangeStart);
const endISO = toISODate(rangeEnd);

    
      const { data: sess } = await supabase
  .from("sessions")
  .select(
    `id, course_id, start_date, start_time, duration_hours, status,
     courses:course_id ( name )`
  )
  .gte("start_date", startISO)
  .lte("start_date", endISO)
  .neq("status", "deleted");

      

      const legacyEvents =
        sess?.map((s) => {
          const start = toLocalDate(s.start_date, s.start_time);
          const end = new Date(start);
          end.setHours(end.getHours() + (Number(s.duration_hours) || 1));
          return {
            id: `legacy-${s.id}`,
            title: s.courses?.name || "Cours",
            start,
            end,
            classNames: ["aq-session"],
          };
        }) || [];

      const { data: bookings } = await supabase
  .from("venue_bookings")
  .select("id, title, date, start_time, end_time, booking_type, status")
  .gte("date", startISO)
  .lte("date", endISO)
  .eq("status", "approved");


      const bookingEvents =
        bookings?.map((b) => {
          const isFull = b.booking_type === "full";
          const isPublicView = mode !== "admin";
          return {
            id: `booking-${b.id}`,
            title: isPublicView
              ? isFull
                ? "Exclusive"
                : "Non Exclusive"
              : b.title || (isFull ? "Réservation complète" : "Réservation club"),
            start: toLocalDate(b.date, cleanTime(b.start_time)),
            end: toLocalDate(b.date, cleanTime(b.end_time)),
            classNames: [isFull ? "aq-booking-full" : "aq-booking-daypass"],
          };
        }) || [];

      // Sundays (fermé)
      const sundays = [];
      const cursor = new Date(rangeStart);
while (cursor <= rangeEnd) {

        if (cursor.getDay() === 0) {
          sundays.push({
            id: `closed-${cursor.toISOString()}`,
            title: "Fermé",
            start: new Date(cursor),
            allDay: true,
            classNames: ["aq-ferme"],
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      const allEvents = [...legacyEvents, ...bookingEvents, ...sundays];

      const unique = Array.from(
        new Map(
          allEvents.map((e) => [
            `${e.title}-${e.start.toISOString()}-${e.end?.toISOString()}`,
            e,
          ])
        ).values()
      );

      setEvents(unique);
    } catch (err) {
      console.error("Error loading events:", err);
    } finally {
      setLoading(false);
    }
  }

  // ---------- Enrollment names
  // ---------- Enrollment names
async function loadStudents(sessionId) {
  try {
    // Already loaded?
    if (studentsBySession[sessionId]) return;

    // 1️⃣ Get the session_group
    const { data: sessInfo, error: sessErr } = await supabase
      .from("sessions")
      .select("session_group")
      .eq("id", sessionId)
      .single();

    if (sessErr || !sessInfo?.session_group) return;

    const groupId = sessInfo.session_group;

    // 2️⃣ Load names
    const { data, error } = await supabase
      .from("enrollments")
      .select(`
        id,
        profile_id,
        status,
        profiles:profile_id (
          full_name,
          first_name,
          last_name
        )
      `)
      .eq("session_group", groupId)
      .eq("status", "active")
      .not("profile_id", "is", null)
      .order("id", { ascending: true });

    if (error) throw error;

    const names = (data || []).map(
      (d) =>
        d.profiles?.full_name ||
        `${d.profiles?.first_name || ""} ${d.profiles?.last_name || ""}`.trim()
    );

    // 3️⃣ Store names
    setStudentsBySession((prev) => ({ ...prev, [sessionId]: names }));

    setEvents((prev) => [...prev]);

    // 4️⃣ Refresh ONLY event rendering → CORRECT WAY
    setTimeout(() => {
  const api = calendarRef.current?.getApi();
  if (api) {
    api.refetchEvents(); // ✅ Works in FullCalendar v6+
  }
}, 20);
  } catch (err) {
    console.error("❌ loadStudents crashed:", err);
  }
}


  // ---------- Click on a day
  const handleDateClick = (info) => {
    const calendarApi = calendarRef.current?.getApi();
    if (mode === "ecole") return;

    // 🔒 CLUB MODE: block past dates + Sundays
    if (mode === "club" || mode === "admin") {
      const clicked = info.date;
      if (!(clicked instanceof Date) || isNaN(clicked)) return;

      const d = new Date(clicked);
      d.setHours(0, 0, 0, 0);

      const today0 = new Date();
      today0.setHours(0, 0, 0, 0);

      // Past day OR Sunday => no action
      if (d < today0 || d.getDay() === 0) {
        return;
      }
    }

    const dayHasEvents = events.some(
      (e) => e.start && new Date(e.start).toDateString() === info.date.toDateString()
    );
    if (dayHasEvents) {
      calendarApi.changeView("timeGridDay", info.date);
      return;
    }

    if (["admin", "club"].includes(mode)) {
      const safeDate =
        info?.date instanceof Date && !isNaN(info.date)
          ? info.date
          : new Date(info?.dateStr || Date.now());

      onSlotSelect?.({
        date: toISODate(safeDate),
        start: `${toISODate(safeDate)}T10:00:00`,
        end: `${toISODate(safeDate)}T12:00:00`,
      });

      setSelectedSlot({ date: safeDate });
      setShowModal(true);
    }
  };

  // ---------- Drag select on time grid
  const handleSelect = (info) => {
    try {
      if (mode === "ecole") return;
      const viewType = info.view.type;
      if (!["timeGridDay", "timeGridWeek"].includes(viewType)) return;
      if (!info.start || !info.end) return;

      const date = info.start;
      const startDate = info.startStr;
      const endDate = info.endStr;

      // Block if selection ends past closingTime
      // Block if selection ends past overtime cutoff
      if (effectiveOvertimeCutoff) {
  const endStr = info.endStr.slice(11, 16);
  const endM = toMinutes(endStr);
  const maxM = toMinutes(effectiveOvertimeCutoff);

  if (endM > maxM) {
    showAlert(`Impossible de réserver après ${effectiveOvertimeCutoff}`);
    return;
  }
}


      onSlotSelect?.({
        date: date.toISOString().slice(0, 10),
        start: startDate,
        end: endDate,
      });

      setSelectedSlot({ date, start: info.start, end: info.end });
      setShowModal(true);
    } catch (err) {
      console.error("❌ Error in select handler:", err);
    }
  };

  // ---------- Event click
  const handleEventClick = (info) => {
    const start = info.event.start
  ? cleanTime(info.event.start.toTimeString().slice(0, 5))
  : "";

const end = info.event.end
  ? cleanTime(info.event.end.toTimeString().slice(0, 5))
  : "";

    const classes = info.event.classNames || [];
    let label = "Événement";

    if (classes.includes("aq-ferme")) label = "Jour fermé";
    else if (classes.includes("aq-booking-full")) label = "Réservation Exclusive";
    else if (classes.includes("aq-booking-daypass")) label = "Réservation Non Exclusive (Day Pass)";
    else if (classes.includes("aq-session")) label = "Cours";

    showAlert(`${label}: ${info.event.title}\n${start} – ${end}`);
  };

  const MAX_VISIBLE = 15;

  const eventContent = (arg) => {
    if (!arg?.event) return;
    const start = arg.timeText ? `${arg.timeText} ` : "";
    const htmlMain = `
      <div class="aq-event-chip ${arg.event.classNames?.join(" ") || ""}">
        <span class="aq-event-time">${start}</span>
        <span class="aq-event-title">${arg.event.title}</span>
      </div>
    `;

    const id = arg.event.id || "";
    const isCourse = id.startsWith("legacy-") || id.startsWith("seance-");
    if (!isCourse || mode !== "admin") return { html: htmlMain };

    const sessionId = id.replace(/^legacy-|^seance-/, "");
    const names = studentsBySession?.[sessionId] || [];
    if (!names.length) return { html: htmlMain };

    const view = calendarRef.current?.getApi()?.view?.type;
    if (!["timeGridDay", "listWeek"].includes(view)) return { html: htmlMain };

    const visible = names.slice(0, MAX_VISIBLE);
    const hiddenCount = names.length - visible.length;

    return {
      html:
        htmlMain +
        `
        <div class="aq-enrollment-list ${hiddenCount > 0 ? "collapsed" : ""}"
             ${hiddenCount > 0 ? `data-more="+${hiddenCount}"` : ""}>
          ${visible.map((n) => `<span>👤 ${n}</span>`).join("")}
        </div>
      `,
    };
  };

  useEffect(() => {
    const calendarEl = calendarRef.current?.el;
    if (!calendarEl) return;

    const tooltip = document.createElement("div");
    tooltip.className = "aq-student-tooltip";
    document.body.appendChild(tooltip);

    calendarEl.addEventListener("mouseover", (e) => {
      const collapsed = e.target.closest(".aq-enrollment-list.collapsed");
      if (collapsed) {
        const names = collapsed.querySelectorAll("span");
        tooltip.innerHTML = Array.from(names)
          .map((n) => n.textContent)
          .join("<br>");
        tooltip.style.display = "block";
      }
    });

    calendarEl.addEventListener("mousemove", (e) => {
      tooltip.style.top = e.pageY + 12 + "px";
      tooltip.style.left = e.pageX + 12 + "px";
    });

    calendarEl.addEventListener("mouseout", () => {
      tooltip.style.display = "none";
    });

    return () => tooltip.remove();
  }, []);

  // ---------------- Validation (JS version)
  const validate = () => {
    const errs = {};
    if (!form.full_name || !form.full_name.trim())
      errs.full_name = "Nom complet requis.";
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email))
      errs.email = "Email valide requis.";
    if (!form.phone || !isValidPhoneNumber(form.phone)) {
  errs.phone = "Numéro de téléphone invalide.";
}
    if (!form.title || !form.title.trim()) errs.title = "Titre requis.";
    if (!form.date) errs.date = "Date requise.";
    if (!form.start_time) errs.start_time = "Heure début requise.";
    if (!form.end_time) errs.end_time = "Heure fin requise.";

    const startM = form.start_time ? toMinutes(form.start_time) : null;
    const endM = form.end_time ? toMinutes(form.end_time) : null;

    if (startM != null && endM != null && endM <= startM) {
      errs.end_time = "L'heure de fin doit être après l'heure de début.";
    }

    const closingM = closingTime ? toMinutes(closingTime) : null;
const cutoffM = effectiveOvertimeCutoff ? toMinutes(effectiveOvertimeCutoff) : null;

// If NOT using overtime, end_time cannot exceed closing time
if (!useOvertime && closingM != null && endM != null && endM > closingM) {
  errs.end_time = `L'heure de fin ne peut pas dépasser ${closingTime}`;
}

// If using overtime, end_time cannot exceed cutoff
if (useOvertime && cutoffM != null && endM != null && endM > cutoffM) {
  errs.end_time = `L'heure de fin ne peut pas dépasser ${effectiveOvertimeCutoff}`;
}


 
    // use qty state (not form.quantity)
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum < 1) {
      errs.quantity = "Quantité minimale: 1";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ---------------- Submit booking
  const submitBooking = async (e) => {
    e.preventDefault();
    if (!validate()) return;

  const frozenTotal =
  typeof finalEstimate === "number" && !Number.isNaN(finalEstimate)
    ? finalEstimate
    : null;

    const { title, date, start_time, end_time, booking_type } = form;

    // Optional conflict check
    const { data: conflict } = await supabase.rpc("check_booking_conflict", {
      p_date: date,
      p_start_time: cleanTime(form.start_time),
      p_end_time: cleanTime(form.end_time),
      p_venue: "pool",
      p_booking_type: booking_type,
      p_quantity: Number(qty),
      p_exclude_id: null
    });

    if (conflict?.has_conflict) {
      showAlert(conflict.reason || "Ce créneau est déjà occupé.");
      return;
    }

    const { data, error } = await supabase.rpc("create_booking_request", {
      p_full_name: form.full_name,
      p_email: form.email,
      p_phone: form.phone,
      p_title: form.title,
      p_date: form.date,
      p_start_time: cleanTime(form.start_time),
      p_end_time: cleanTime(form.end_time),
      p_booking_type: form.booking_type, // 'daypass' | 'full'
      p_quantity: Number(qty),
      p_venue: "pool",

      p_forced_total: frozenTotal,

    });

    if (error) {
      showAlert("Erreur : " + error.message);
      return;
    }
    if (data?.reason) {
      showAlert("Impossible de créer la demande : " + data.reason);
      return;
    }

    // success UI
    showAlert(
      <div className="text-center">
        <p className="text-xl font-semibold text-aquaBlue mb-2">
          Demande envoyée ✅
        </p>

        <p className="text-lg text-gray-700 mb-2">
          💵 Estimation : USD {Number(data.estimated_price).toFixed(2)}
        </p>

        <p className="text-lg text-gray-700">
          📌 Statut : <strong>{data.status}</strong>
          <br />
          <span className="text-sm text-gray-500">
            (en attente d'approbation administrateur)
          </span>
        </p>
      </div>
    );

    // 1️⃣ generate draft invoice PDF
await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-club-invoice-pdf`,
  {
  method: "POST",
  headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${
    (await supabase.auth.getSession()).data.session?.access_token
  }`,
},

  body: JSON.stringify({
    invoice_id: data.invoice_id,   // ⚠ must come from RPC return
    trigger: "draft"               // ⚠ tells backend to send draft email
  }),
});


// 2️⃣ Reload calendar
setTimeout(() => {
  if (visibleRange) {
    loadEvents(visibleRange.start, visibleRange.end);
  }
}, 150);


// 3️⃣ Close the modal
setShowModal(false);
  };

  const calendarProps = {
  ref: calendarRef,
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: "dayGridMonth",
  locales: [frLocale],
  locale: "fr",
  height: "auto",
  expandRows: true,
  headerToolbar: false,
  events,
  selectable: true,
  selectMirror: true,
  select: handleSelect,
  dateClick: handleDateClick,
  eventClick: handleEventClick,
  eventContent,
  listDayFormat: { weekday: "long", day: "numeric", month: "short" },
  listDaySideFormat: false,
  eventTimeFormat: {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  },
  datesSet: (arg) => {
  const newStart = arg.start.getTime();
  const newEnd = arg.end.getTime();

  setCurrentTitle(arg.view.title);
  setCurrentView(arg.view.type); // 🔑 REQUIRED for month-only horizontal scroll

  setVisibleRange((prev) => {
    if (
      prev &&
      prev.start.getTime() === newStart &&
      prev.end.getTime() === newEnd
    ) {
      return prev;
    }
    return { start: arg.start, end: arg.end };
  });
},
  firstDay: 0,
  slotMinTime: "07:00:00",
  slotMaxTime: "21:00:00",
  allDaySlot: false,
  dayMaxEvents: isMobile ? 1 : 2,
  moreLinkClick: isMobile ? "day" : "popover",
  moreLinkContent: (args) => `+${args.num} autres`,
  eventDidMount: async (info) => {
    const eventId = info.event.id || "";
    if (!eventId.startsWith("legacy-") && !eventId.startsWith("seance-")) return;
    const sessionId = eventId.replace(/^legacy-|^seance-/, "");
    await loadStudents(sessionId);
  },
};


  // ---------------- Render
  try {
    return (
      <div className="flex justify-center px-3 md:px-6">
        <div className="aq-card w-full max-w-7xl">
          {/* Toolbar */}
          <div className="mb-4 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-3 items-center">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <button
                onClick={() => calendarRef.current?.getApi().prev()}
                className="bg-white border rounded-full px-3 py-1 text-gray-700 shadow-sm hover:bg-gray-50 transition"
              >
                ‹
              </button>
              <button
                onClick={() => calendarRef.current?.getApi().today()}
                className="bg-white border rounded-full px-4 py-1 text-gray-700 shadow-sm hover:bg-gray-50 transition"
              >
                Aujourd’hui
              </button>
              <button
                onClick={() => calendarRef.current?.getApi().next()}
                className="bg-white border rounded-full px-3 py-1 text-gray-700 shadow-sm hover:bg-gray-50 transition"
              >
                ›
              </button>
            </div>

            <h2 className="font-semibold text-base md:text-lg text-gray-800 text-center">
              {currentTitle.charAt(0).toUpperCase() + currentTitle.slice(1)}
            </h2>

            <div className="flex gap-2 justify-center md:justify-end overflow-x-auto md:overflow-visible">
              <div className="flex gap-2 min-w-max">
                {[
                  { label: "Mois", view: "dayGridMonth" },
                  { label: "Semaine", view: "timeGridWeek" },
                  { label: "Jour", view: "timeGridDay" },
                  { label: "Agenda", view: "listWeek" },
                ].map((v) => (
                  <button
                    key={v.view}
                    onClick={() =>
                      calendarRef.current?.getApi().changeView(v.view)
                    }
                    className={`px-2 py-[2px] text-[11px] sm:px-3 sm:py-1 sm:text-sm
                      rounded-full border shadow-sm transition whitespace-nowrap
                      ${
                        currentView === v.view
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="aq-calendar-shell">
            <div
              className={
                ["dayGridMonth", "timeGridWeek"].includes(currentView)
                  ? "overflow-x-auto"
                  : "overflow-x-hidden"
              }
            >
              <div
                className={
                  ["dayGridMonth", "timeGridWeek"].includes(currentView)
                    ? "min-w-[900px]"
                    : "min-w-0"
                }
              >
                <FullCalendar {...calendarProps} />
              </div>
            </div>
          </div>
        </div>

        {/* Booking Modal */}
        {showModal && selectedSlot?.date instanceof Date && !isNaN(selectedSlot.date) && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[999]">

            <div
              className="bg-white rounded-2xl shadow-2xl w-[95%] max-w-2xl max-h-[90vh] relative flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-700 to-orange-400 px-6 py-4">
                <h3 className="text-white text-lg font-semibold">
                  Nouvelle réservation —{" "}
                  {selectedSlot.date.toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
              </div>
              {totalExtraCost > 0 && (
  <div className="rounded-lg bg-amber-50 border p-3 text-sm mt-3">
    <p className="font-semibold">⏱️ Temps supplémentaire</p>
    {extraCost > 0 && (
      <p>Avant fermeture : USD {extraCost.toFixed(2)}</p>
    )}
    {overtimeCost > 0 && (
      <p>Après fermeture : USD {overtimeCost.toFixed(2)}</p>
    )}
    <p className="font-semibold mt-1">
      Total supplémentaire : USD {totalExtraCost.toFixed(2)}
    </p>
  </div>
)}


              <form onSubmit={submitBooking} className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Top info row: date + estimation (from DB) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm mb-1 font-medium text-gray-700">
                      Date *
                    </label>
                    <input
                      type="date"
                      className={`w-full border rounded-lg p-2 text-sm ${
                        errors.date ? "border-red-400" : "border-gray-300"
                      }`}
                      value={form.date}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, date: e.target.value }))
                      }
                    />
                    {errors.date && (
                      <p className="text-xs text-red-500 mt-1">{errors.date}</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <div className="rounded-xl border bg-gray-50 p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Estimation</p>
                        <p className="text-xl font-semibold">
  {finalEstimate == null
    ? "—"
    : `USD ${finalEstimate.toFixed(2)}`}
</p>

{totalExtraCost > 0 && liveEstimate != null && (
  <div className="text-xs text-gray-600 mt-1 space-y-0.5">
    <p>Base : USD {Number(liveEstimate).toFixed(2)}</p>
    <p className="text-amber-700">
      Supplément : + USD {totalExtraCost.toFixed(2)}
    </p>
  </div>
)}

                      </div>
                      <span className="text-xs text-gray-500">
                        Calculée selon le type et la quantité
                      </span>
                    </div>
                  </div>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-sm mb-1 font-medium text-gray-700">
                    Nom complet *
                  </label>
                  <input
                    className={`w-full border rounded-lg p-2 text-sm ${
                      errors.full_name ? "border-red-400" : "border-gray-300"
                    }`}
                    placeholder=""
                    value={form.full_name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, full_name: e.target.value }))
                    }
                  />
                  {errors.full_name && (
                    <p className="text-xs text-red-500 mt-1">
                      {errors.full_name}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm mb-1 font-medium text-gray-700">
                    Email *
                  </label>
                  <input
                    type="email"
                    className={`w-full border rounded-lg p-2 text-sm ${
                      errors.email ? "border-red-400" : "border-gray-300"
                    }`}
                    placeholder=""
                    value={form.email}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                  />
                  {errors.email && (
                    <p className="text-xs text-red-500 mt-1">{errors.email}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm mb-1 font-medium text-gray-700">
                    Téléphone *
                  </label>
                  <PhoneInput
  international
  defaultCountry={country}
  countryCallingCodeEditable={false}
  value={form.phone}
  onChange={(v) =>
    setForm((p) => ({ ...p, phone: v || "" }))
  }
  placeholder="Numéro de téléphone"
  className="w-full"
/>

{errors.phone && (
  <p className="text-xs text-red-500 mt-1">{errors.phone}</p>
)}
                </div>


                {/* Title */}
                <div>
                  <label className="block text-sm mb-1 font-medium text-gray-700">
                    Titre *
                  </label>
                  <input
                    className={`w-full border rounded-lg p-2 text-sm ${
                      errors.title ? "border-red-400" : "border-gray-300"
                    }`}
                    placeholder="Anniversaire, Baby Shower, etc..."
                    value={form.title}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, title: e.target.value }))
                    }
                  />
                  {errors.title && (
                    <p className="text-xs text-red-500 mt-1">{errors.title}</p>
                  )}
                </div>

                {/* Times + Type + Qty */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm mb-1 font-medium text-gray-700">
                      Début *
                    </label>
                    <input
                      type="time"
                      className={`w-full border rounded-lg p-2 text-sm ${
                        errors.start_time ? "border-red-400" : "border-gray-300"
                      }`}
                      value={form.start_time}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          start_time: e.target.value,
                        }))
                      }
                    />
                    {errors.start_time && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.start_time}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm mb-1 font-medium text-gray-700">
                      Fin *
                    </label>
                    <input
  type="time"
  className="w-full border rounded-lg p-2 text-sm bg-gray-100 cursor-not-allowed"
  value={form.end_time}
  disabled
/>
<p className="text-xs text-gray-500 mt-1">
  Heure calculée automatiquement
</p>

                    {errors.end_time && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.end_time}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm mb-1 font-medium text-gray-700">
                      Type *
                    </label>
                    <select
                      className="w-full border rounded-lg p-2 text-sm border-gray-300"
                      value={form.booking_type}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          booking_type: e.target.value,
                        }))
                      }
                    >
                      <option value="daypass">
                        Day Pass (réservation non-exclusive)
                      </option>
                      <option value="full">Réservation Exclusive</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {form.booking_type === "daypass"
                        ? "⏳ Durée indicative (prolongation possible)"
                        : "⏳ Durée indicative (prolongation possible)"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm mb-1 font-medium text-gray-700">
                      Quantité de personnes *
                    </label>
                    <input
                      type="number"
                      min={1}
                      className={`w-full border rounded-lg p-2 text-sm ${
                        errors.quantity
                          ? "border-red-400"
                          : "border-gray-300"
                      }`}
                      value={qty}
                      onChange={(e) =>
                        setQty(Math.max(1, Number(e.target.value || 1)))
                      }
                    />
                    {errors.quantity && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.quantity}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Tables & chaises incluses
                    </p>
                  </div>
                  <div className="md:col-span-4">
  {/* Default duration info */}
  <p className="text-xs text-gray-500 mt-1">
    ⏳ Durée par défaut :{" "}
    <strong>{form.booking_type === "full" ? "5h" : "4h"}</strong>
  </p>

  {/* Optional notice */}
  {useExtraTime && (
    <p className="text-xs text-blue-600 mt-1">
      ℹ️ Temps supplémentaire appliqué avant la fermeture
    </p>
  )}

  {/* Side-by-side controls */}
  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* EXTRA TIME */}
    <div className="border rounded-lg p-3 bg-gray-50">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
  type="checkbox"
  checked={useExtraTime}
  disabled={useOvertime}
  onChange={(e) => {
    const checked = e.target.checked;

    

    setUseExtraTime(checked);

    if (!checked) {
      setExtraBlocks(0);
    }
  }}
/>

        Ajouter du temps supplémentaire
      </label>

      {useExtraTime && (
        <select
  className="mt-2 w-full border rounded p-2 text-sm"
  value={extraBlocks}
  disabled={useOvertime}
  onChange={(e) => {
    const blocks = Number(e.target.value);

    if (!form.start_time || !closingTime) {
      setExtraBlocks(blocks);
      return;
    }

    const startM = toMinutes(form.start_time);
    const closingM = toMinutes(closingTime);
    const baseEndM = startM + defaultDurationMinutes;
    const requestedEndM = baseEndM + blocks * 30;

    // ⛔ Still block going past closing without overtime
    if (!useOvertime && blocks > 0 && requestedEndM > closingM) {
      showAlert(
        `⛔ Cette prolongation dépasse l’heure de fermeture (${closingTime}).\nVeuillez activer « Prolongation après fermeture ».`
      );
      return;
    }

    setExtraBlocks(blocks);
  }}
>
  {[0, 1, 2, 3, 4, 5, 6].map((b) => (
    <option key={b} value={b} >
      {b * 30} minutes
    </option>
  ))}
</select>


      )}
    </div>

    {/* OVERTIME */}
    <div className="border rounded-lg p-3 bg-red-50">
      <label className="flex items-center gap-2 text-sm font-medium text-red-700">
        <input
  type="checkbox"
  checked={useOvertime}
  onChange={(e) => {
    const checked = e.target.checked;
    setUseOvertime(checked);

    if (!checked) {
      setOvertimeBlocks(0);
    }
  }}
/>



        Prolongation après fermeture
      </label>

      {useOvertime && (
        <select
  className="mt-2 w-full border rounded p-2 text-sm"
  value={overtimeBlocks}
  onChange={(e) => {
    const blocks = Number(e.target.value);

    if (!form.start_time || !closingTime) {
      setOvertimeBlocks(blocks);
      return;
    }

    const startM = toMinutes(form.start_time);
    const closingM = toMinutes(closingTime);
    const cutoffM = effectiveOvertimeCutoff
      ? toMinutes(effectiveOvertimeCutoff)
      : closingM;

    const requestedEndM = closingM + blocks * 30;

    // ⛔ BLOCK going past overtime cutoff
    if (requestedEndM > cutoffM) {
      showAlert(
        `⛔ La prolongation dépasse l’heure limite autorisée (${effectiveOvertimeCutoff}).`
      );
      return;
    }

    setOvertimeBlocks(blocks);
  }}
>

          {[0, 1, 2, 3, 4].map((b) => (
            <option key={b} value={b}>
              {b * 30} minutes
            </option>
          ))}
        </select>
      )}
    </div>
  </div>
</div>

                </div>

                {/* Footer actions */}
                <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowModal(false)}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    console.error("Calendar render error:", err);
    return (
      <p className="text-red-500 p-4">
        ⚠️ Erreur d’affichage du calendrier. Veuillez recharger la page.
      </p>
    );
  }
}

/* ===== Helpers ===== */
function toLocalDate(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h = 0, mi = 0] = (timeStr || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, mi);
}
function toISODate(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`; // ⬅️ LOCAL, no timezone shift
}
