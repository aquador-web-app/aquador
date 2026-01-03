// src/pages/Admin/AdminDashboard.jsx
import { useState } from "react"
import { FaUsers, FaChalkboardTeacher, FaClipboardList, FaCalendarAlt, FaBox, FaChartBar, FaSignOutAlt, FaFileAlt, FaPrayingHands, FaUserFriends, FaBell, FaPuzzlePiece, FaCogs } from "react-icons/fa"
import AdminCourses from "./AdminCourses"
import AdminPlans from "./AdminPlans"
import AdminReferrals from "./AdminReferrals"
import AdminCalendarManager from "./AdminCalendarManager"
import AdminProducts from "./AdminProducts"
import AdminReports from "./AdminReports"
import AdminReportsBulletinetFiche from "./AdminReportsBulletinetFiche"
import AdminCommissions from "./AdminCommissions"
import AdminProfitandLoss from "./AdminProfitandLoss"
import AdminCommissionRequests from "./AdminCommissionRequests"
import AdminAttendance from "./AdminAttendance"
import AdminAttendanceReports from "./AdminAttendanceReports"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useEffect } from "react"
import { FaCheckToSlot, FaMoneyBill1Wave, FaMoneyBillTransfer } from "react-icons/fa6"
import AdminUsers from "./AdminUsers";
import AdminInvoices from "./AdminInvoices";
import AdminInvoicePayment from "./AdminInvoicePayment";
import AdminSessions from "./AdminSessions";
import AdminEnrollments from "./AdminEnrollments";
import AdminEmailQueue from "./AdminEmailQueue"; // new file
import AdminEmailTemplates from "./AdminEmailTemplates";
import AdminInvoiceTemplates from "./AdminInvoiceTemplates";  
import AdminSendEmails from "./AdminSendEmails";
import AdminBoutiqueInvoices from "./AdminBoutiqueInvoices";
import AdminNotificationTemplates from "./AdminNotificationTemplates";
import AdminBulletinsetFiches from "./AdminBulletinsetFiches";
import AdminBulletinTemplates from "./AdminBulletinTemplates";
import AdminBulletinForm from "./AdminBulletinForm";
import AdminFicheTechniques from "./AdminFicheTechniques";
import AdminFicheTechniqueTemplates from "./AdminFicheTechniqueTemplates";
import AdminNotificationsAll from "./AdminNotificationsAll";
import AdminSalary from "./AdminSalary";
import { formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";
import { motion } from "framer-motion";


function getHaitiNow() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
  );
}

function getHaitiISOString(date) {
  const local = new Date(
    date.toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
  );
  return local.toISOString();
}

function isToday(birthDate) {
  if (!birthDate) return false;
  const [y, m, d] = String(birthDate).slice(0, 10).split("-");
  const bdMonth = Number(m);
  const bdDay = Number(d);

  const haitiNow = getHaitiNow();
  return bdMonth === haitiNow.getMonth() + 1 && bdDay === haitiNow.getDate();
}


export default function AdminDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("overview")
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [openReports, setOpenReports] = useState(false)
  const [userCount, setUserCount] = useState(0)
  const [courseCount, setCourseCount] = useState(0)
  const [unpaidInvoices, setUnpaidInvoices] = useState({ count: 0, total: 0 })
  const [attendance, setAttendance] = useState({ percent: 0, total: 0 })
  const [commissions, setCommissions] = useState(0)
  const [newUsers, setNewUsers] = useState({ current: 0, last: 0 });
  const [birthdays, setBirthdays] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tab, setTab] = useState("users"); // 'users' | 'finance'
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [influencerCount, setInfluencerCount] = useState(0);
  const [activeEnrollmentCount, setActiveEnrollmentCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [consentSigned, setConsentSigned] = useState({ count: 0, users: [] });


const [role, setRole] = useState(null);

const fetchStats = async () => {
    // 1) TOTAL users on platform (use PROFILES, not auth.users)
    const { count: profilesTotal } = await supabase
      .from("profiles_with_unpaid")
      .select("*", { count: "exact", head: true });
    setUserCount(profilesTotal || 0);

    // Breakdown for tooltip
    const { count: infl } = await supabase
      .from("profiles_with_unpaid")
      .select("*", { count: "exact", head: true })
      .eq("role", "influencer");
    setInfluencerCount(infl || 0);

    const { count: enrolls } = await supabase
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");
    setActiveEnrollmentCount(enrolls || 0);

    // 2) Courses (yours already worked)
    const { count: courses } = await supabase
      .from("courses")
      .select("*", { count: "exact", head: true });
    setCourseCount(courses || 0);

    // 3) Unpaid invoices (across platform, not filtered by selected user)
    const { data: invs } = await supabase
      .from("invoices")
      .select("id,total,paid_total,status");
    const rows = invs || [];
    const unpaid = rows.filter(r =>
  r.status === "pending" || r.status === "partial"
);

const unpaidCount = unpaid.length;

const unpaidTotal = unpaid.reduce(
  (s, r) => s + (Number(r.total || 0) - Number(r.paid_total || 0)),
  0
);

    setUnpaidInvoices({ count: unpaidCount, total: unpaidTotal });

    // 4) Attendance this month (if your table has a date column, prefer filtering in SQL)
    const { data: presences } = await supabase.from("attendance").select("present, created_at");
    const all = presences || [];
    // compute % for current month
    const now = getHaitiNow();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const thisMonth = all.filter(p => {
      const d = new Date(p.created_at || now);
      return d >= start && d <= end;
    });
    const total = thisMonth.length;
    const presents = thisMonth.filter(p => p.present).length;
    const percent = total ? ((presents / total) * 100).toFixed(1) : 0;
    setAttendance({ percent, total });

    // 5) Commissions still available (sum of remaining_amount > 0)
const { data: comms, error: commErr } = await supabase
  .from("commissions")
  .select("amount, remaining_amount")
  .gt("remaining_amount", 0);  // only those with remaining funds

if (commErr) {
  console.error("❌ Error fetching commissions:", commErr);
} else {
  const totalComms = (comms || []).reduce(
    (sum, c) => sum + Number(c.remaining_amount ?? 0),
    0
  );
  setCommissions(totalComms);
}


    // 6) New users for current month + note for last month
const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

// Count new users this month
const { count: thisMonthCount } = await supabase
  .from("profiles_with_unpaid")
  .select("*", { count: "exact", head: true })
  .gte("created_at", getHaitiISOString(firstDayThisMonth))
  .lt("created_at", getHaitiISOString(firstDayNextMonth))


// Count previous month total (for the small note)
const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const { count: prevMonthCount } = await supabase
  .from("profiles_with_unpaid")
  .select("*", { count: "exact", head: true })
  .gte("created_at", getHaitiISOString(firstDayPrevMonth))
  .lt("created_at", getHaitiISOString(firstDayThisMonth))


// Save both
setNewUsers({
  current: thisMonthCount || 0,
  last: prevMonthCount || 0,
});

// 7) Consentement signé
const { data: consentRows, error: consErr } = await supabase
  .from("consentements_signed")
  .select("user_id, full_name");

console.log("🔎 CONSENT ROWS FOUND:", consentRows, consErr);


if (!consErr) {
  const users = (consentRows || []).map(r => ({
    id: r.user_id,
    name: r.full_name
  }));

  setConsentSigned({
    count: users.length,
    users
  });
}
  };

useEffect(() => {
  async function fetchRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return navigate("/login");

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!error && data) setRole(data.role);
  }

  fetchRole();
}, []);



useEffect(() => {
  let isMounted = true;

  async function fetchUnread() {
    // ✅ Only admin/global notifications (user_id IS NULL)
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("read", false)
      .is("user_id", null);

    if (!error && isMounted) {
      setUnreadCount(count || 0);
    } else if (error) {
      console.error("❌ Error fetching admin notifications:", error.message);
    }
  }

  // 🔹 Initial load
  fetchUnread();

  // 🔹 Realtime updates
  const channel = supabase
    .channel("admin_notifications_realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
      },
      (payload) => {
        const note = payload.new || payload.old || {};
        // ✅ Only refresh when notification is admin/global
        if (!note?.user_id) {
          console.log("🔔 Admin/global notification changed:", payload.eventType);
          fetchUnread();
        }
      }
    )
    .subscribe();

  return () => {
    isMounted = false;
    supabase.removeChannel(channel);
  };
}, []);




useEffect(() => {
  fetchBirthdays();
  fetchSessions();
}, []);

async function fetchBirthdays() {
  const haitiNow = getHaitiNow();
  const currentMonth = haitiNow.getMonth();

const { data, error } = await supabase
  .from("profiles_with_unpaid")
  .select("id, first_name, middle_name, last_name, birth_date")
  .not("birth_date", "is", null);

if (error || !data) return;

const upcoming = data.filter((u) => {
  const [y, m] = String(u.birth_date).slice(0, 10).split("-");
  return Number(m) - 1 === currentMonth;
});


  // Sort by day of month
  upcoming.sort((a, b) => new Date(a.birth_date).getDate() - new Date(b.birth_date).getDate());

  setBirthdays(upcoming);
}


const TabBtn = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-t-md border-b-2 ${
        tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"
      }`}
      style={{ marginRight: 8 }}
    >
      {label}
    </button>
  );

async function fetchSessions() {
  const haitiNow = getHaitiNow();
  const nextWeek = new Date(haitiNow);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const todayStr = haitiNow.toISOString().slice(0, 10);
  const nextWeekStr = nextWeek.toISOString().slice(0, 10);

  try {
    // 1️⃣ Get upcoming sessions (within 7 days)
    const { data: sessData, error: sessErr } = await supabase
      .from("sessions")
      .select(`
        id,
        course:course_id ( name ),
        start_date,
        start_time,
        duration_hours,
        day_of_week,
        session_group
      `)
      .gte("start_date", todayStr)
      .lte("start_date", nextWeekStr)
      .order("start_date", { ascending: true });

    if (sessErr) throw sessErr;
    if (!sessData?.length) return setSessions([]);

    // 2️⃣ Extract all session_group IDs
    const groupIds = [...new Set(sessData.map(s => s.session_group).filter(Boolean))];
    if (!groupIds.length) return setSessions([]);


    const { data: enrData, error: enrErr } = await supabase
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
      .in("session_group", groupIds); // ✅ fixed variable name
      
      

    if (enrErr) throw enrErr;

    console.log("✅ Sessions found:", sessData.length);
    console.log("✅ Enrollments found:", enrData?.length);

    // 4️⃣ Group enrollments by session_group
    const byGroup = (enrData || []).reduce((acc, row) => {
      const gid = row.session_group;
      acc[gid] = acc[gid] || [];
      acc[gid].push({
        full_name: row.profiles?.full_name || "Inconnu",
        duration_hours: row.plans?.duration_hours || 1,
        profile_status: row.profiles?.status || "active",
        start_date: row.start_date, // ✅ add this
      });
      return acc;
    }, {});

    // 5️⃣ Attach enrollments + compute times
    const merged = sessData.map((s) => {
      const [y, mo, d] = (s.start_date || "").split("-");
      const [hh, mm] = (s.start_time || "00:00").split(":");

      const startLocal = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm));
      const endLocal = new Date(startLocal.getTime() + (Number(s.duration_hours || 2) * 60 * 60 * 1000));

      // Filter enrollments for this session
  const enrolls = (byGroup[s.session_group] || []).filter((e) => {
    // parse enrollment start_date as a Date
    const eStart = new Date(e.start_date);
    // only include if enrollment has started before the session date
    return eStart <= startLocal;
  });

      return {
        ...s,
        startLocal,
        endLocal,
        enrollments: enrolls, // ✅ use the filtered list
      };
    });

    // 6️⃣ Sort sessions chronologically by hour & date
    const sortedSessions = merged.sort((a, b) => {
      if (a.startLocal < b.startLocal) return -1;
      if (a.startLocal > b.startLocal) return 1;
      return 0;
    });

    setSessions(sortedSessions);
  } catch (err) {
    console.error("🔥 fetchSessions() error:", err);
    setSessions([]);
  }
}



  useEffect(() => {
  if (activeTab === "overview") {
    fetchStats();
    fetchBirthdays();
    fetchSessions();
  }
}, [activeTab]);




const HIDDEN_SECTIONS = [
  "classes",                 // whole Classes tab
  "plans",
  "invoices-templates",
  "emails",
  "notifications-templates",
  "commissions",
  "bulletins-template",
  "fiches-template",
  "salary",
  "reports"
];

function isHidden(tabId) {
  if (role !== "assistant") return false;
  return HIDDEN_SECTIONS.some((key) => tabId.startsWith(key));
}

if (isHidden(activeTab)) {
  return (
    <div className="p-10 text-center text-red-600 font-semibold text-lg">
      🚫 You do not have permission to access this section.
    </div>
  );
}


  const renderContent = () => {
    switch (activeTab) {
      case "overview":
  return (
    <div>
      <div className="flex items-center space-x-3 mb-6">
  <h2 className="text-2xl font-bold text-aquaBlue">
    A'QUA D'OR – {role === "assistant" ? "Admin-Assist. Dashboard" : "Admin Dashboard"}
  </h2>
</div>


      {/* === Animated Overview Stats === */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
  {/* Utilisateurs (total on platform) + centered hover breakdown */}
  <motion.div
    className="relative group bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl cursor-pointer transition-all"
    whileHover={{ scale: 1.03, y: -3 }}
    onClick={() => setActiveTab("users")}
  >
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-t-2xl"></div>
    <p className="text-gray-500 font-medium">Utilisateurs</p>
    <h3 className="text-3xl font-bold text-blue-600 mt-1">{userCount}</h3>

    {/* Centered hover card */}
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-2xl px-4 py-3 w-64">
          <p className="font-semibold text-gray-800 mb-1 text-center">Répartition</p>
          <ul className="text-sm text-gray-700 space-y-1">
            <li className="flex justify-between">
              <span>👥 Influenceurs</span>
              <b>{influencerCount || 0}</b>
            </li>
            <li className="flex justify-between">
              <span>🏊 Inscriptions actives</span>
              <b>{activeEnrollmentCount || 0}</b>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </motion.div>

  {/* Notifications non lues */}
<motion.div
  className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg cursor-pointer transition-all"
  whileHover={{ scale: 1.03, y: -3 }}
  onClick={() => setActiveTab("notifications-all")}
>
  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-teal-400 to-blue-500 rounded-t-2xl"></div>
  <p className="text-gray-500 font-medium flex items-center gap-2">
    <span>🔔 Notifications non lues</span>
  </p>
  <h3
    className={`text-3xl font-bold ${
      unreadCount > 0 ? "text-red-500" : "text-teal-500"
    } mt-1`}
  >
    {unreadCount}
  </h3>
  <p className="text-sm text-gray-600">
    {unreadCount === 0
      ? "Aucune notification en attente"
      : `${unreadCount} notification${unreadCount > 1 ? "s" : ""} à lire`}
  </p>
</motion.div>


  {/* Factures impayées */}
  <motion.div
    className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg cursor-pointer transition-all"
    whileHover={{ scale: 1.03, y: -3 }}
    onClick={() => setActiveTab("invoices")}
  >
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-red-500 to-pink-400 rounded-t-2xl"></div>
    <p className="text-gray-500 font-medium">Factures impayées</p>
    <h3 className="text-3xl font-bold text-red-500">{unpaidInvoices.count}</h3>
    {/* 🧩 Hide total when assistant */}
  {role !== "assistant" && (
    <p className="text-sm text-gray-600">
      Total: {formatCurrencyUSD(unpaidInvoices.total)}
    </p>
  )}
  </motion.div>

  {/* Forme de Consentement Signée */}
<motion.div
  className="relative group bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl cursor-pointer transition-all"
  whileHover={{ scale: 1.03, y: -3 }}
>
  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-green-500 to-teal-400 rounded-t-2xl"></div>

  <p className="text-gray-500 font-medium">Formes de Consentements Signées</p>
  <h3 className="text-3xl font-bold text-green-600 mt-1">
    {consentSigned.count}
  </h3>

  {/* Hover list (same style as Répartition) */}
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-2xl px-4 py-3 w-72 max-h-72 overflow-y-auto">
        <p className="font-semibold text-gray-800 mb-2 text-center">
          Signataires ({consentSigned.count})
        </p>

        {consentSigned.users.length === 0 ? (
          <p className="text-sm text-gray-600 italic text-center">
            Aucun utilisateur n’a signé
          </p>
        ) : (
          <ul className="text-sm text-gray-700 space-y-1">
            {consentSigned.users.map((u) => (
              <li
                key={u.id}
                className="flex justify-between bg-gray-50 px-3 py-1 rounded-md"
              >
                <span>{u.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  </div>
</motion.div>


  {/* Commissions en attente */}
  <motion.div
    className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg cursor-pointer transition-all"
    whileHover={{ scale: 1.03, y: -3 }}
    onClick={() => {
  if (role !== "assistant") setActiveTab("commissions");
}}
  >
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-orange-400 to-yellow-400 rounded-t-2xl"></div>
    <p className="text-gray-500 font-medium">Commissions en attente</p>
    <h3 className="text-3xl font-bold text-orange-500">{formatCurrencyUSD(commissions)}</h3>
  </motion.div>

  {/* Nouveaux inscrits (mois en cours) */}
<motion.div
  className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl cursor-pointer transition-all"
  whileHover={{ scale: 1.03, y: -3 }}
>
  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-t-2xl"></div>
  <p className="text-gray-500 font-medium">Nouveaux inscrits (mois en cours)</p>
  <h3 className="text-3xl font-bold text-purple-600">{newUsers.current}</h3>
  <p className="text-sm text-gray-500 mt-1">
    Mois précédent : <b>{newUsers.last}</b>
  </p>
</motion.div>
      </div>
      <br />
      <div className="bg-white shadow rounded-lg p-6">
  <h3 className="font-bold mb-4 text-aquaBlue text-lg flex items-center gap-2">
    🎂 Anniversaires du mois
  </h3>

  {birthdays.length === 0 ? (
    <p className="text-gray-500 italic">Aucun anniversaire ce mois</p>
  ) : (
    <ul className="space-y-3">
      {birthdays.map((b) => {
        const isBdayToday = isToday(b.birth_date);
        return (
          <li
  key={b.id}
  className={`flex items-center justify-between border-b pb-2 transition-all ${
    isToday(b.birth_date)
      ? "animate-birthdayFlash font-semibold"
      : ""
  }`}
>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{isBdayToday ? "🎉" : "🎈"}</span>
              <span>
                <span className="text-gray-800">
                  {b.first_name} {b.middle_name} {b.last_name}
                </span>
                <span className="text-gray-500 ml-2 text-sm">
                  — {formatDateFrSafe(b.birth_date)}
                </span>
              </span>
            </div>
            {isBdayToday && (
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium shadow-sm">
                🎊 Aujourd’hui !
              </span>
            )}
          </li>
        );
      })}
    </ul>
  )}
</div>
       
      <div className="bg-white shadow rounded-2xl p-6 mt-6 border border-gray-100">
  <h3 className="font-bold mb-4 text-aquaBlue text-lg flex items-center gap-2">
    📅 Prochaines sessions (7 jours)
  </h3>

  {sessions.length === 0 ? (
    <p className="text-gray-500 italic">Aucune session prévue cette semaine</p>
  ) : (
    <ul className="divide-y divide-gray-100">
      {sessions.map((s) => {
  const start = s.startLocal;
  const end = s.endLocal;

  const dayLabel = start
    ? start.toLocaleDateString("fr-FR", { weekday: "long" })
    : s.day_of_week || "Jour inconnu";

  const dateStr = start
    ? start.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "Date inconnue";

  const startTime = start
    ? start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "Heure inconnue";

  const endTime = end
    ? end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <motion.div
      key={s.id}
      whileHover={{ scale: 1.02, y: -2 }}
      className="bg-gradient-to-r from-white to-blue-50 border border-gray-100 shadow-sm hover:shadow-md transition-all rounded-xl p-4 mb-3"
    >
      <div>
        <p className="font-semibold text-aquaBlue text-lg flex items-center gap-2">
          🏊 {s.course?.name || "Cours inconnu"}
        </p>
        <p className="text-sm text-gray-600">
          📅 {dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)} — {dateStr}
        </p>
        <p className="text-sm text-gray-500">
          🕗 {startTime} → {endTime}
        </p>
      </div>

      {/* 👥 Participants */}
<div className="mt-3">
  {s.enrollments?.length > 0 ? (
    <div className="mt-1 bg-blue-50 border border-blue-100 rounded-xl p-3 shadow-inner">
      <p className="text-sm font-semibold text-blue-600 mb-3 flex items-center gap-1">
        👥 Participants ({s.enrollments.length})
      </p>

      {(() => {
        const oneHour = s.enrollments
          .filter(e => (e.duration_hours ?? s.duration_hours ?? 1) === 1)
          .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

        const twoHour = s.enrollments
          .filter(e => (e.duration_hours ?? s.duration_hours ?? 1) === 2)
          .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1h column */}
            <div>
              <p className="text-xs font-semibold text-yellow-600 mb-2">🕐 1 Heure</p>
              {oneHour.length > 0 ? (
                <ul className="space-y-1">
                  {oneHour.map((e, idx) => (
                    <li
                      key={`${s.id}-1h-${idx}`}
                      className="w-80 flex items-center gap-2 bg-white border border-gray-200 px-3 py-1 rounded-lg shadow-sm"
                    >
                      <span className="text-gray-800 font-medium">
                        {e.full_name}
                      </span>
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        (1h)
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 text-sm italic">—</p>
              )}
            </div>

            {/* 2h column */}
            <div>
              <p className="text-xs font-semibold text-green-600 mb-2">🕑 2 Heures</p>
              {twoHour.length > 0 ? (
                <ul className="space-y-1">
                  {twoHour.map((e, idx) => (
                    <li
                      key={`${s.id}-2h-${idx}`}
                      className="w-60 flex items-center gap-2 bg-white border border-gray-200 px-3 py-1 rounded-lg shadow-sm"
                    >
                      <span className="text-gray-800 font-medium">
                        {e.full_name}
                      </span>
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        (2h)
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 text-sm italic">—</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  ) : (
    <p className="text-gray-400 italic text-sm">Aucun participant</p>
  )}
</div>

    </motion.div>
  );
})}



    </ul>
  )}
</div>
    </div>
  )

      case "users":
        return <AdminUsers />
      case "courses":
        return <AdminCourses />      
      case "classes-courses":
        return <AdminCourses />
      case "classes-sessions":
        return <AdminSessions />
      case "classes-enrollments":
        return <AdminEnrollments />
      case "plans": 
        return <AdminPlans />
      case "invoices":
        return <AdminInvoices />
      case "factures-invoices":
        return <AdminInvoices />
      case "invoicespayment":
        return <AdminInvoicePayment />
      case "invoices-templates":
        return <AdminInvoiceTemplates/>
      case "emails-templates":
        return <AdminEmailTemplates />
      case "notifications-all":
        return <AdminNotificationsAll onUnreadCountChange={setUnreadCount} />;
      case "notifications-templates":
        return <AdminNotificationTemplates />;
      case "emails-queue":
        return <AdminEmailQueue />
      case "emails-send":
        return <AdminSendEmails />  // new component for manual sending
      case "calendar":
        return <AdminCalendarManager />
      case "bulletinsetfiches":
        return <AdminBulletinsetFiches />;
      case "bulletins-template":
        return <AdminBulletinTemplates />;
      case "bulletins-form":
        return <AdminBulletinForm />;
      case "fiches-techniques":
        return <AdminFicheTechniques />;
      case "fiches-template":
        return <AdminFicheTechniqueTemplates />;
      case "boutique-products":
        return <AdminProducts />;
      case "boutique-invoices":
        return <AdminBoutiqueInvoices />;
      case "reports-general":
        return <AdminReports />
      case "reports-bulletins":
        return <AdminReportsBulletinetFiche />
      case "reports-commissions":
        return <AdminCommissions />
      case "reports-p&l":
        return <AdminProfitandLoss />
      case "reports-commission-requests":
        return <AdminCommissionRequests />
      case "reports-attendance":
        return <AdminAttendanceReports />
      {/* --- Update case in renderContent() --- */}
      case "commissions-manage":
        return <AdminCommissions />
      case "commissions":
        return <AdminCommissions />
      case "commissions-payments":
        return <AdminCommissionRequests />
      case "salary":
        return <AdminSalary />
      case "manage-referrals":
        return <AdminReferrals />
      case "manage-attendance":
        return <AdminAttendance />
      default:
        return <h2 className="text-xl">Sélectionnez une section</h2>
    }
  }

  const handleSignOut = () => {
    setShowSignOutConfirm(false)
    navigate("/ecole-landing")
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 shadow-lg flex flex-col">
        <div className="p-4 border-gray-100 border-b flex flex-col items-center">
  <img src="/logo/aquador.png" alt="Logo A'QUA D'OR" className="h-10 w-10" />
  <h1 className="text-2xl font-bold text-aquaBlue">A'QUA D'OR</h1>
  <p className="text-gray-500 text-sm">
    {role === "assistant" ? "Admin-Assist. Dashboard" : "Admin Dashboard"}
  </p>
</div>


        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {/* Aperçu */}
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
              activeTab === "overview" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
            }`}
          >
            <FaChartBar /> Aperçu
          </button>

          {/* Utilisateurs */}
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
              activeTab === "users" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
            }`}
          >
            <FaUsers /> Utilisateurs
          </button>

          {/* Classes (Courses + Sessions) */}
 {!isHidden("classes") && (         
<div>
  <button
    onClick={() => setActiveTab(activeTab.startsWith("classes") ? "" : "classes-courses")}
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("classes") ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2">
      <FaChalkboardTeacher /> Classes
    </span>
    <span>{activeTab.startsWith("classes") ? "▲" : "▼"}</span>
  </button>
  {activeTab.startsWith("classes") && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => setActiveTab("classes-courses")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "classes-courses" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        📘 Cours
      </button>
      <button
        onClick={() => setActiveTab("classes-sessions")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "classes-sessions" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        📅 Sessions
      </button>
      <button
        onClick={() => setActiveTab("classes-enrollments")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "classes-enrollments" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        👥 Enrollments
      </button>
    </div>
  )}
</div>
)}

          

          {/* Plans */}
          {!isHidden("plans") && (
          <button
            onClick={() => setActiveTab("plans")}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
              activeTab === "plans" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
            }`}
          >
            <FaClipboardList /> Plans
          </button>
          )}

          {/* Factures impayées */}
          <div>
  <button
    onClick={() => setActiveTab(activeTab.startsWith("invoices") ? "" : "invoices")}
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("invoices") ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2">
      <FaFileAlt /> Gestion des Factures
    </span>
    <span>{activeTab.startsWith("invoices") ? "▲" : "▼"}</span>
    </button>
  {activeTab.startsWith("invoices") && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => setActiveTab("invoices")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "invoices" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        📘 Factures
      </button>
      <button
        onClick={() => setActiveTab("invoicespayment")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "invoicespayment" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        👥 Paiements
      </button>
      {!isHidden("invoices-templates") && (
    <button
      onClick={() => setActiveTab("invoices-templates")}
      className={`text-left px-2 py-1 rounded ${activeTab === "invoices-templates" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"}`}
    >
     📘 Invoice - Template
    </button>
    )}
      </div>
  )}
</div>

  
          {/* --- Add new management buttons in sidebar --- */}

<button
  onClick={() => setActiveTab("manage-referrals")}
  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
    activeTab === "manage-referrals" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
  }`}
>
  <FaUserFriends/> Gestion des Parrainages
</button>
{/* Emails (Templates + Queue + Send) */}

<div>
  {!isHidden("emails") && (
  <button
    onClick={() => setActiveTab(activeTab.startsWith("emails") ? "" : "emails-templates")}
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("emails")
        ? "bg-aquaBlue text-white"
        : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2">
      ✉️ Emails
    </span>
    <span>{activeTab.startsWith("emails") ? "▲" : "▼"}</span>
  </button>
)}
  {activeTab.startsWith("emails") && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => setActiveTab("emails-templates")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "emails-templates"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        📧 Emails - Templates
      </button>

      <button
        onClick={() => setActiveTab("emails-queue")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "emails-queue"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        📨 Emails - Queue
      </button>

      <button
        onClick={() => setActiveTab("emails-send")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "emails-send"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        🚀 Envoyer un Email
      </button>
    </div>
    
  )}
  
  {/* Notifications (All + Templates) */}
<div>
  
  <button
    onClick={() =>
      setActiveTab(activeTab.startsWith("notifications") ? "" : "notifications-all")
    }
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("notifications")
        ? "bg-aquaBlue text-white"
        : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2 relative">
  <FaBell /> Notifications
  {unreadCount > 0 && (
    <span className="absolute -top-2 -right-3 bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 shadow-md">
      {unreadCount}
    </span>
  )}
</span>

    <span>{activeTab.startsWith("notifications") ? "▲" : "▼"}</span>
  </button>

  {activeTab.startsWith("notifications") && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => setActiveTab("notifications-all")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "notifications-all"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        🔔 Toutes les Notifications
      </button>
{!isHidden("notifications-templates") && (
      <button
        onClick={() => setActiveTab("notifications-templates")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "notifications-templates"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        🧩 Notifications - Templates
      </button>
      )}
    </div>
  )}
</div>

</div>

{/* === COMMISSIONS === */}
{!isHidden("commissions") && (
<div>
  <button
    onClick={() =>
      setActiveTab(
        activeTab.startsWith("commissions") ? "" : "commissions"
      )
    }
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("commissions-manage")
        ? "bg-aquaBlue text-white"
        : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2">
      <FaMoneyBillTransfer /> Commissions
    </span>
    <span>{activeTab.startsWith("commissions") ? "▲" : "▼"}</span>
  </button>

  {activeTab.startsWith("commissions") && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => setActiveTab("commissions-manage")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "commissions-manage"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        💰 Gérer les Commissions
      </button>
      <button
        onClick={() => setActiveTab("commissions-payments")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "commissions-payments"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        🧾 Gérer les Paiements
      </button>
    </div>
  )}
</div>
)}

<button
  onClick={() => setActiveTab("manage-attendance")}
  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
    activeTab === "manage-attendance" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
  }`}
>
  <FaCheckToSlot/> Gérer les Présences
</button>


          {/* === BOUTIQUE SECTION === */}
<div>
  <button
    onClick={() => setActiveTab(activeTab.startsWith("boutique") ? "" : "boutique-products")}
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("boutique")
        ? "bg-aquaBlue text-white"
        : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2">
      <FaBox /> Boutique
    </span>
    <span>{activeTab.startsWith("boutique") ? "▲" : "▼"}</span>
  </button>

  {activeTab.startsWith("boutique") && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => setActiveTab("boutique-products")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "boutique-products"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        🛍️ Produits
      </button>

      <button
        onClick={() => setActiveTab("boutique-invoices")}
        className={`text-left px-2 py-1 rounded ${
          activeTab === "boutique-invoices"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        💳 Factures
      </button>
    </div>
  )}
</div>


          {/* Calendrier */}
          <button
            onClick={() => setActiveTab("calendar")}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
              activeTab === "calendar" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
            }`}
          >
            <FaCalendarAlt /> Gestion du calendrier
          </button>
          {!isHidden("salary") && (
          <button
  onClick={() => setActiveTab("salary")}
  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
    activeTab === "salary"
      ? "bg-aquaBlue text-white"
      : "text-gray-100 hover:bg-orange-700"
  }`}
>
  💰 Salaires
</button>
          )}

{/* === GESTION DES BULLETINS === */}
<div>
  <button
    onClick={() => {
      if (
        activeTab.startsWith("bulletins") ||
        activeTab.startsWith("fiches") ||
        activeTab === "bulletinsetfiches"
      ) {
        setActiveTab("");
      } else {
        setActiveTab("bulletins-form");
      }
    }}
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("bulletins") ||
      activeTab.startsWith("fiches") ||
      activeTab === "bulletinsetfiches"
        ? "bg-aquaBlue text-white"
        : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2 flex-1 overflow-hidden">
      <FaFileAlt className="w-4 h-4 shrink-0" />
      <span className="truncate whitespace-nowrap">Gestion des Bulletins</span>
    </span>

    <span className="ml-2 leading-none">
      {activeTab.startsWith("bulletins") ||
      activeTab.startsWith("fiches") ||
      activeTab === "bulletinsetfiches"
        ? "▲"
        : "▼"}
    </span>
  </button>

  {(activeTab.startsWith("bulletins") ||
    activeTab.startsWith("fiches") ||
    activeTab === "bulletinsetfiches") && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => setActiveTab("bulletins-form")}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
          activeTab === "bulletins-form"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <FaFileAlt className="w-4 h-4" /> Bulletins
      </button>

      <button
        onClick={() => setActiveTab("fiches-techniques")}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
          activeTab === "fiches-techniques"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <FaClipboardList className="w-4 h-4" /> Fiche Technique
      </button>

      <button
        onClick={() => setActiveTab("bulletinsetfiches")}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
          activeTab === "bulletinsetfiches"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <FaFileAlt className="w-4 h-4" /> Bulletins et Fiches
      </button>

      {!isHidden("bulletins-template") && (
        <button
          onClick={() => setActiveTab("bulletins-template")}
          className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
            activeTab === "bulletins-template"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          <FaPuzzlePiece className="w-4 h-4" /> Template - Bulletin
        </button>
      )}

      {!isHidden("fiches-template") && (
        <button
          onClick={() => setActiveTab("fiches-template")}
          className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
            activeTab === "fiches-template"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          <FaCogs className="w-4 h-4" /> Template – Fiche Technique
        </button>
      )}
    </div>
  )}
</div>




          {/* Rapports */}
          {!isHidden("reports") && (
          <div>
            <button
              onClick={() => setOpenReports(!openReports)}
              className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
                openReports ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <FaChartBar /> Rapports
              </span>
              <span>{openReports ? "▲" : "▼"}</span>
            </button>
            {openReports && (
              <div className="ml-6 mt-2 flex flex-col space-y-2">
                <button
                  onClick={() => setActiveTab("reports-general")}
                  className={`text-left px-2 py-1 rounded ${
                    activeTab === "reports-general" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
                  }`}
                >
                  📑 CSV + PDF
                </button>
                <button
                  onClick={() => setActiveTab("reports-attendance")}
                  className={`text-left px-2 py-1 rounded ${
                    activeTab === "reports-attendance" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
                  }`}
                >
                  ✅ Présences
                </button><button
                  onClick={() => setActiveTab("reports-p&l")}
                  className={`text-left px-2 py-1 rounded ${
                    activeTab === "reports-p&l" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
                  }`}
                >
                  Rentrées Vs Dépenses
                </button>
              </div>
            )}
          </div>
          )}
        </nav>

        {/* Sign Out */}
        <div className="p-4 border-t">
          <button
            onClick={() => setShowSignOutConfirm(true)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-red-600 hover:bg-red-100"
          >
            <FaSignOutAlt /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-y-auto">{renderContent()}</main>

      {/* Confirmation Modal */}
      {showSignOutConfirm && (
  <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40">
    <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm z-[9999] relative">
            <h2 className="text-lg font-bold mb-4">Êtes-vous sûr de vouloir vous déconnecter ?</h2>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={handleSignOut}
                className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Oui, déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
