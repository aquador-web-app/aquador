// src/pages/Admin/AdminDashboard.jsx
import { useState, useRef } from "react"
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
import AdminBoutiqueInvoiceTemplates from "./AdminBoutiqueInvoiceTemplates";  
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
import AdminClubBookings from "./AdminClubBookings";
import AdminClubInvoices from "./AdminClubInvoices";
import AdminClubInvoicePayment from "./AdminClubInvoicePayment";
import AdminClubInvoiceTemplates from "./AdminClubInvoiceTemplates";
import AdminClubMembership from "./AdminClubMembership"; 
import ClubQRScanner from "../Club/ClubQRScanner";
import AdminClubMembershipInvoices from "./AdminClubMembershipInvoices";
import AdminClubMembershipInvoiceTemplates from "./AdminClubMembershipInvoiceTemplates";
import AdminClubMembershipPayments from "./AdminClubMembershipPayments";
import AdminClubOverview from "./AdminClubOverview";
import AdminMembershipApproval from "./AdminMembershipApproval";
import AdminMembershipUsers from "./AdminMembershipUsers";
import HoverOverlay from "../../components/HoverOverlay";



function SidebarBtn({ id, icon, label }) {
  const { activeTab, setActiveTab } = window.__ADMIN_CTX__;
  return (
    <button
      onClick={() => {
        setActiveTab(id);
        if (window.innerWidth < 768) {
          window.__ADMIN_CLOSE_SIDEBAR__?.();
        }
      }}
      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
        activeTab === id
          ? "bg-aquaBlue text-white"
          : "text-gray-100 hover:bg-orange-700"
      }`}
    >
      {icon} {label}
    </button>
  );
}


function SidebarSub({ id, label }) {
  const { activeTab, setActiveTab } = window.__ADMIN_CTX__;
  const isActive = activeTab === id;

  return (
    <button
      onClick={() => {
        setActiveTab(id);
        if (window.innerWidth < 768) {
          window.__ADMIN_CLOSE_SIDEBAR__?.();
        }
      }}
      className={`
        text-left w-full
        px-3 py-2
        rounded-lg
        text-sm
        transition
        ${
          isActive
            ? "bg-aquaBlue text-white"
            : "text-gray-200 hover:bg-orange-700"
        }
      `}
    >
      {label}
    </button>
  );
}


function SubGroup({ title, prefix, children }) {
  const { activeTab, setActiveTab } = window.__ADMIN_CTX__;
  const open = activeTab.startsWith(prefix);
  return (
    <div>
      <button
        onClick={() => setActiveTab(open ? "" : `${prefix}`)}
        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
          open ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <span>{title}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="ml-4 mt-1 space-y-1">{children}</div>}
    </div>
  );
}


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
  const [parentCount, setParentCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [unpaidInvoices, setUnpaidInvoices] = useState({
  count: 0,
  total: 0,
  rows: [],
});

  const [attendance, setAttendance] = useState({ percent: 0, total: 0 })
  const [commissions, setCommissions] = useState(0)
  const [newUsers, setNewUsers] = useState({
  current: 0,
  last: 0,
  users: [],
});
  const [birthdays, setBirthdays] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tab, setTab] = useState("users"); // 'users' | 'finance'
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [influencerCount, setInfluencerCount] = useState(0);
  const [activeEnrollmentCount, setActiveEnrollmentCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [consentSigned, setConsentSigned] = useState({ count: 0, users: [] });
  const [openEcole, setOpenEcole] = useState(false);   // default closed
  const [openClub, setOpenClub] = useState(false);    // default closed
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNonEnrolled, setActiveNonEnrolled] = useState({
    count: 0,
    users: [],
  });
  // Hover – Utilisateurs card
const userCardRef = useRef(null);
const [userHovered, setUserHovered] = useState(false);
// Hover – Factures impayées
const unpaidCardRef = useRef(null);
const [unpaidHovered, setUnpaidHovered] = useState(false);

// Hover – Consentements signés
const consentCardRef = useRef(null);
const [consentHovered, setConsentHovered] = useState(false);

// Hover – Nouveaux inscrits
const newUsersCardRef = useRef(null);
const [newUsersHovered, setNewUsersHovered] = useState(false);




const [role, setRole] = useState(null);

const fetchStats = async () => {
    // 1) TOTAL users on platform (use PROFILES, not auth.users)
    const { count: profilesTotal } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });
    setUserCount(profilesTotal || 0);

    // Breakdown for tooltip
    const { count: infl } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "influencer");
    setInfluencerCount(infl || 0);

    const { count: parents } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("signup_type", "children_only");

    setParentCount(parents || 0);

    const { count: staff } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .in("role", ["admin", "teacher", "assistant"]);

    setStaffCount(staff || 0);


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
      .select("id,total, full_name, paid_total,status, signup_type");
      

    const unpaid = (invs || [])
  .map(r => {
    const remaining =
      Number(r.total || 0) - Number(r.paid_total || 0);

    return {
      id: r.id,
      name: r.full_name || "—",
      signup_type: r.signup_type,
      status: r.status,
      remaining,
    };
  })
  .filter(r =>
    (r.status === "pending" || r.status === "partial") &&
    r.signup_type !== "children_only" &&
    r.remaining > 0
  )
  .sort((a, b) =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
  );


const unpaidCount = unpaid.length;

const unpaidTotal = unpaid.reduce(
  (sum, r) => sum + r.remaining,
  0
);

setUnpaidInvoices({
  count: unpaidCount,
  total: unpaidTotal,
  rows: unpaid,
});


    setUnpaidInvoices({ count: unpaidCount, total: unpaidTotal, rows: unpaid, });

    // 4) Attendance this month (if your table has a date column, prefer filtering in SQL)
    const { data: presences } = await supabase.from("attendance").select("status, created_at");
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
    const presents = thisMonth.filter(p => p.status === "present").length;
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


// 6) New users (current month) + names
const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

// 👉 Current month users (with names)
const { data: newUsersRows, error: newUsersErr } = await supabase
  .from("profiles_with_unpaid")
  .select("id, full_name")
  .gte("created_at", getHaitiISOString(firstDayThisMonth))
  .lt("created_at", getHaitiISOString(firstDayNextMonth))
  .neq("signup_type", "children_only") 
  .order("full_name", { ascending: true });

// 👉 Previous month count (note only)
const { count: prevMonthCount } = await supabase
  .from("profiles_with_unpaid")
  .select("*", { count: "exact", head: true })
  .gte("created_at", getHaitiISOString(firstDayPrevMonth))
  .lt("created_at", getHaitiISOString(firstDayThisMonth));

setNewUsers({
  current: newUsersRows?.length || 0,
  last: prevMonthCount || 0,
  users: (newUsersRows || []).map(u => ({
    id: u.id,
    name: u.full_name,
  })),
});


// 7) Consentement signé
const { data: consentRows, error: consErr } = await supabase
  .from("consentements_signed")
  .select("user_id, full_name")
  .order("full_name", { ascending: true });

console.log("🔎 CONSENT ROWS FOUND:", consentRows, consErr);


if (!consErr) {
  const users = (consentRows || [])
  .map(r => ({
    id: r.user_id,
    name: r.full_name
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));


  setConsentSigned({
    count: users.length,
    users
  });
}

// 8) Actifs non inscrits (active users with ZERO enrollments)
const { data: nonEnrolledRows, error: nonEnrErr } = await supabase
  .from("profiles")
  .select(`
    id,
    full_name,
    enrollments!left ( id )
  `)
  .eq("is_active", true)
  .neq("signup_type", "children_only")
  .not("role", "eq", "influencer") // optional safety
  .not("role", "eq", "admin")
  .not("role", "eq", "teacher")
  .not("role", "eq", "assistant")
  .not("role", "eq", "owner")
  .is("enrollments", null)
  .order("full_name", { ascending: true });


if (nonEnrErr) {
  console.error("❌ Active non-enrolled error:", nonEnrErr);
  setActiveNonEnrolled({ count: 0, users: [] });
} else {
  setActiveNonEnrolled({
    count: nonEnrolledRows?.length || 0,
    users: (nonEnrolledRows || []).map(u => ({
      id: u.id,
      name: u.full_name,
    })),
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
  "boutique-invoices-templates",
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

function isEcoleTabHidden(tabId) {
  if (role !== "assistant") return false;

  // Hide if a section starts with any of your restricted prefixes
  return HIDDEN_SECTIONS.some((key) => tabId.startsWith(key));
}


function isClubTabVisibleToAssistant(tabId) {
  if (role !== "assistant") return true; // admins see every tab

  // Assistants can ONLY see:
  const allowed = ["calendar", "club-scan"];

  return allowed.includes(tabId);
}

// =============================
//  ÉCOLE VISIBILITY RULES
// =============================

const HIDDEN_ECOLE_TABS = [
  "users",
  "classes",
  "plans",
  "invoices",
  "manage-referrals",
  "emails",
  "notifications",
  "commissions",
  "manage-attendance",
  "boutique",
  "bulletins",
  "reports",
  "salary"
];

function isEcoleTabVisibleToAssistant(tabId) {
  if (role !== "assistant") return true; // Admin sees everything

  // Hide entire groups by prefix
  return !HIDDEN_ECOLE_TABS.some((prefix) => tabId.startsWith(prefix));
}

const totalUtilisateursPlateforme =
  (activeEnrollmentCount || 0) +
  (activeNonEnrolled.count || 0) +
  (parentCount || 0) +
  (staffCount || 0);

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
  ref={userCardRef}
  className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm cursor-pointer"
  whileHover={{ scale: 1.03, y: -3 }}
  onMouseEnter={() => setUserHovered(true)}
  onMouseLeave={() => setUserHovered(false)}
  onClick={() => setActiveTab("users")}
>
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-t-2xl"></div>
    <p className="text-gray-500 font-medium">Utilisateurs</p>
    <h3 className="text-3xl font-bold text-blue-600 mt-1">{userCount}</h3>
  </motion.div>
  <HoverOverlay
  anchorRef={userCardRef}
  visible={userHovered}
  onMouseEnter={() => setUserHovered(true)}
  onMouseLeave={() => setUserHovered(false)}
>
  <div className="px-4 py-3 text-sm">
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Répartition
    </p>

    <ul className="space-y-1">
      <li className="flex justify-between">
        <span>👥 Influenceurs</span>
        <b>{influencerCount || 0}</b>
      </li>
      <li className="flex justify-between">
        <span>👨‍👩‍👧 Parents</span>
        <b>{parentCount || 0}</b>
      </li>
      <li className="flex justify-between">
        <span>🧑‍🏫 Staff</span>
        <b>{staffCount || 0}</b>
      </li>
      <li className="flex justify-between">
        <span>🏊 Inscriptions actives</span>
        <b>{activeEnrollmentCount || 0}</b>
      </li>
      <li className="flex justify-between">
        <span>🏊 Actifs non inscrits</span>
        <b>{activeNonEnrolled.count || 0}</b>
      </li>
      <li className="flex justify-between border-t pt-2 mt-2 font-semibold">
        <span>📊 Total</span>
        <b>{totalUtilisateursPlateforme}</b>
      </li>
    </ul>
    {activeNonEnrolled.count > 0 && (
  <div className="mt-3 border-t pt-2">
    <p className="text-xs font-semibold text-red-600 mb-1 text-center">
      Actifs non inscrits – suivi requis
    </p>

    <ul className="text-xs text-gray-700 space-y-1 max-h-32 overflow-auto">
      {activeNonEnrolled.users.map(u => (
        <li
          key={u.id}
          className="bg-red-50 px-2 py-1 rounded-md"
        >
          • {u.name}
        </li>
      ))}
    </ul>
  </div>
)}
  </div>
</HoverOverlay>

  {/* Notifications non lues */}
<motion.div
  className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm cursor-pointer"
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
  ref={unpaidCardRef}
  className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm cursor-pointer"
  whileHover={{ scale: 1.03, y: -3 }}
  onMouseEnter={() => setUnpaidHovered(true)}
  onMouseLeave={() => setUnpaidHovered(false)}
  onClick={() => setActiveTab("invoices")}
>
  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-red-500 to-pink-400 rounded-t-2xl"></div>

  <p className="text-gray-500 font-medium">Factures impayées</p>
  <h3 className="text-3xl font-bold text-red-500">
    {unpaidInvoices.count}
  </h3>

  {role !== "assistant" && (
    <p className="text-sm text-gray-600">
      Total: {formatCurrencyUSD(unpaidInvoices.total)}
    </p>
  )}
</motion.div>
<HoverOverlay
  anchorRef={unpaidCardRef}
  visible={unpaidHovered}
  width={420}   // 👈 wider just for invoices
  onMouseEnter={() => setUnpaidHovered(true)}
  onMouseLeave={() => setUnpaidHovered(false)}
>
  <div className="px-4 py-3 text-sm">
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Factures impayées
    </p>

    {unpaidInvoices.rows.length === 0 ? (
      <p className="text-gray-500 italic text-center">
        Aucune facture en attente 🎉
      </p>
    ) : (
      <ul className="space-y-1">
        {unpaidInvoices.rows.map((r) => (
          <li
            key={r.id}
            className="flex justify-between gap-3 bg-red-50 px-2 py-1 rounded-md"
          >
            <span className="truncate">{r.name}</span>
            <b className="text-red-600 whitespace-nowrap">
              {formatCurrencyUSD(r.remaining)}
            </b>
          </li>
        ))}
      </ul>
    )}
  </div>
</HoverOverlay>


  {/* Forme de Consentement Signée */}
<motion.div
  ref={consentCardRef}
  className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm cursor-pointer"
  whileHover={{ scale: 1.03, y: -3 }}
  onMouseEnter={() => setConsentHovered(true)}
  onMouseLeave={() => setConsentHovered(false)}
>
  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-green-500 to-teal-400 rounded-t-2xl"></div>

  <p className="text-gray-500 font-medium">Formes de Consentements Signées</p>
  <h3 className="text-3xl font-bold text-green-600 mt-1">
    {consentSigned.count}
  </h3>
</motion.div>
<HoverOverlay
  anchorRef={consentCardRef}
  visible={consentHovered}
  onMouseEnter={() => setConsentHovered(true)}
  onMouseLeave={() => setConsentHovered(false)}
>
  <div className="px-4 py-3 text-sm">
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Consentements signés
    </p>

    {consentSigned.users.length === 0 ? (
      <p className="text-gray-500 italic text-center">
        Aucun consentement
      </p>
    ) : (
      <ul className="space-y-1">
        {consentSigned.users.map((u) => (
          <li
            key={u.id}
            className="bg-green-50 px-2 py-1 rounded-md"
          >
            • {u.name}
          </li>
        ))}
      </ul>
    )}
  </div>
</HoverOverlay>



  {/* Commissions en attente */}
  <motion.div
  className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm cursor-pointer"
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
  ref={newUsersCardRef}
  className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm cursor-pointer"
  whileHover={{ scale: 1.03, y: -3 }}
  onMouseEnter={() => setNewUsersHovered(true)}
  onMouseLeave={() => setNewUsersHovered(false)}
>
  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-t-2xl"></div>

  <p className="text-gray-500 font-medium">Nouveaux inscrits (mois en cours)</p>
  <h3 className="text-3xl font-bold text-purple-600">
    {newUsers.current}
  </h3>
  <p className="text-sm text-gray-500 mt-1">
    Mois précédent : <b>{newUsers.last}</b>
  </p>
</motion.div>
<HoverOverlay
  anchorRef={newUsersCardRef}
  visible={newUsersHovered}
  onMouseEnter={() => setNewUsersHovered(true)}
  onMouseLeave={() => setNewUsersHovered(false)}
>
  <div className="px-4 py-3 text-sm">
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Nouveaux inscrits – mois en cours
    </p>

    {newUsers.users.length === 0 ? (
      <p className="text-gray-500 italic text-center">
        Aucun nouvel inscrit
      </p>
    ) : (
      <ul className="space-y-1">
        {newUsers.users.map((u) => (
          <li
            key={u.id}
            className="bg-purple-50 px-2 py-1 rounded-md"
          >
            • {u.name}
          </li>
        ))}
      </ul>
    )}
  </div>
</HoverOverlay>


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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1h column */}
            <div>
              <p className="text-xs font-semibold text-yellow-600 mb-2">🕐 1 Heure</p>
              {oneHour.length > 0 ? (
                <ul className="space-y-1">
                  {oneHour.map((e, idx) => (
                    <li
                      key={`${s.id}-1h-${idx}`}
                      className="w-full flex flex-wrap items-center gap-2 bg-white border border-gray-200 px-3 py-2 rounded-lg shadow-sm"
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
                      className="w-full flex flex-wrap items-center gap-2 bg-white border border-gray-200 px-3 py-2 rounded-lg shadow-sm"
                    >
                      <span className="text-gray-800 font-medium break-words">
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
      case "boutique-invoices-templates":
        return <AdminBoutiqueInvoiceTemplates/>
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
      case "bulletins-fiches-techniques":
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
      case "club-bookings":
        return <AdminClubBookings />
      case "club-invoices":
        return <AdminClubInvoices />;
      case "club-invoices-payment":
        return <AdminClubInvoicePayment />;
      case "club-invoices-templates":
        return <AdminClubInvoiceTemplates />;
      case "club-membership-plans":
        return <AdminClubMembership />;
      case "club-users-members":
        return <AdminMembershipUsers />;
      case "club-users-approval":
        return <AdminMembershipApproval />;
      case "club-membership-invoices":
        return <AdminClubMembershipInvoices />;
      case "club-membership-invoices-templates":
        return <AdminClubMembershipInvoiceTemplates />;
      case "club-membership-payments":
        return <AdminClubMembershipPayments />;
      case "club-overview":
        return <AdminClubOverview />;
      case "club-scan":
        return <ClubQRScanner />;
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
window.__ADMIN_CTX__ = { activeTab, setActiveTab };
window.__ADMIN_CLOSE_SIDEBAR__ = () => setSidebarOpen(false);
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      {/* Mobile header */}
<div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white flex items-center justify-between px-4 py-3">
  <button
    onClick={() => setSidebarOpen(true)}
    className="text-2xl"
  >
    ☰
  </button>

  <img
    src="/logo/aquador.png"
    alt="A'QUA D'OR"
    className="h-12 w-auto cursor-pointer"
    onClick={() => setActiveTab("overview")}
  />

  <div className="w-6" />
</div>
{sidebarOpen && (
  <div
    className="fixed inset-0 bg-black/50 z-40 md:hidden"
    onClick={() => setSidebarOpen(false)}
  />
)}
      <aside
  className={`
    fixed md:static inset-y-0 left-0 z-50
    w-64 bg-gray-900 shadow-lg flex flex-col
    transform transition-transform duration-300
    ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
    md:translate-x-0
  `}
>
        <div className="p-4 border-gray-100 border-b flex flex-col items-center">
  <img src="/logo/aquador.png" alt="Logo A'QUA D'OR" className="h-10 w-10" />
  <h1 className="text-2xl font-bold text-aquaBlue">A'QUA D'OR</h1>
  <p className="text-gray-500 text-sm">
    {role === "assistant" ? "Admin-Assist. Dashboard" : "Admin Dashboard"}
  </p>
</div>


        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">

  {/* ========================= */}
{/*      ÉCOLE SECTION        */}
{/* ========================= */}

<button
  onClick={() => {
    const newVal = !openEcole;
    setOpenEcole(newVal);
    if (newVal) setActiveTab("overview");  // 👈 DEFAULT TAB WHEN OPENING CLUB
  }}
  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg 
    ${openEcole ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"}`}
>
  <span className="flex items-center gap-2">🏫 École</span>
  <span>{openEcole ? "▲" : "▼"}</span>
</button>

{openEcole && (
  <div className="ml-4 mt-2 flex flex-col space-y-2">

    {/* Aperçu */}
    <SidebarBtn id="overview" icon={<FaChartBar />} label="Aperçu" />

    {/* Users */}
    {!isHidden("users") && (
      <SidebarBtn id="users" icon={<FaUsers />} label="Utilisateurs" />
    )}

    {/* Classes */}
    {!isHidden("classes") && (
      <SubGroup title="Classes" prefix="classes">
        <SidebarSub id="classes-courses" label="Cours" />
        <SidebarSub id="classes-sessions" label="Sessions" />
        <SidebarSub id="classes-enrollments" label="Inscriptions" />
      </SubGroup>
    )}

    {/* Plans */}
    {!isHidden("plans") && (
      <SidebarBtn id="plans" icon={<FaClipboardList />} label="Plans" />
    )}

    {/* Invoices / Facturation */}
    {!isHidden("invoices") && (
      <SubGroup title="Facturation" prefix="invoices">
        <SidebarSub id="invoices" label="Factures" />
        <SidebarSub id="invoicespayment" label="Paiements" />
        {!isHidden("invoices-templates") && (
          <SidebarSub id="invoices-templates" label="Templates Factures" />
        )}
      </SubGroup>
    )}

    {/* Parrainage */}
    {!isHidden("manage-referrals") && (
      <SidebarBtn id="manage-referrals" icon={<FaUserFriends />} label="Parrainage" />
    )}

    {/* Emails */}
    {!isHidden("emails") && (
      <SubGroup title="Emails" prefix="emails">
        <SidebarSub id="emails-templates" label="Templates" />
        <SidebarSub id="emails-queue" label="Queue" />
        <SidebarSub id="emails-send" label="Envoyer Email" />
      </SubGroup>
    )}

    {/* === Notifications === */}
    {!isHidden("notifications") && (
      <div>
        <button
          onClick={() =>
            setActiveTab(
              activeTab.startsWith("notifications") ? "" : "notifications"
            )
          }
          className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
            activeTab.startsWith("notifications")
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          <span className="flex items-center gap-2">Notifications</span>

          {unreadCount > 0 && (
            <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}

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
              Toutes
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
                Templates
              </button>
            )}
          </div>
        )}
      </div>
    )}

    {/* Commissions */}
    {!isHidden("commissions") && (
      <SubGroup title="Commissions" prefix="commissions">
        <SidebarSub id="commissions-manage" label="Gérer" />
        <SidebarSub id="commissions-payments" label="Paiements" />
      </SubGroup>
    )}

    {/* Présences */}
    {!isHidden("manage-attendance") && (
      <SidebarBtn id="manage-attendance" icon={<FaCheckToSlot />} label="Présences" />
    )}

    {/* Boutique */}
    {!isHidden("boutique") && (
      <SubGroup title="Boutique" prefix="boutique">
        <SidebarSub id="boutique-products" label="Produits" />
        <SidebarSub id="boutique-invoices" label="Factures" />
        <SidebarSub id="boutique-invoices-templates" label="Template" />
      </SubGroup>
    )}

    {/* Bulletins */}
    {!isHidden("bulletins") && (
      <SubGroup title="Bulletins" prefix="bulletins">
        <SidebarSub id="bulletins-form" label="Bulletins" />
        <SidebarSub id="bulletins-fiches-techniques" label="Fiches Techniques" />
        <SidebarSub id="bulletinsetfiches" label="Bulletins + Fiches" />
        {!isHidden("bulletins-template") && (
          <SidebarSub id="bulletins-template" label="Template Bulletin" />
        )}
        {!isHidden("fiches-template") && (
          <SidebarSub id="fiches-template" label="Template Fiche" />
        )}
      </SubGroup>
    )}

    {/* Rapports */}
    {!isHidden("reports") && (
      <SubGroup title="Rapports" prefix="reports">
        <SidebarSub id="reports-general" label="CSV + PDF" />
        <SidebarSub id="reports-attendance" label="Présences" />
        <SidebarSub id="reports-p&l" label="Entrées / Dépenses" />
      </SubGroup>
    )}

    {/* Salaires */}
    {!isHidden("salary") && (
      <SidebarBtn id="salary" icon={<FaMoneyBill1Wave />} label="Salaires" />
    )}

  </div>
)}


 {/* ========================= */}
{/*        CLUB SECTION       */}
{/* ========================= */}

<button
  onClick={() => {
    const newVal = !openClub;
    setOpenClub(newVal);
    if (newVal) setActiveTab("club-overview");  // 👈 DEFAULT TAB WHEN OPENING CLUB
  }}
  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg 
    ${openClub ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"}`}
>
  <span className="flex items-center gap-2">🏝️ Club</span>
  <span>{openClub ? "▲" : "▼"}</span>
</button>

{openClub && (
  <div className="ml-4 mt-2 flex flex-col space-y-2">

    <SidebarBtn id="club-overview" icon={<FaChartBar />} label="Aperçu Club" />
    <SubGroup title="Users"  prefix="club-users">
    
    <SidebarSub
      id="club-users-members"
      label="Utilisateurs"
    />
 {role !== "assistant" && (
    <>
    <SidebarSub
      id="club-users-approval"
      label="Approbation"
    />
</>
 )}
  </SubGroup>

    
    {/* Calendrier Club — assistants can see it */}
    {isClubTabVisibleToAssistant("calendar") && (
      <SidebarBtn id="calendar" icon={<FaCalendarAlt />} label="Calendrier Club" />
    )}

    {/* Réservations */}
    {role !== "assistant" && (
      <SidebarBtn id="club-bookings" icon={<FaMoneyBillTransfer />} label="Réservations" />
    )}

    {/* ===== MEMBERSHIP GROUP ===== */}
{role !== "assistant" && (
  <SubGroup title="Membership" prefix="club-membership">
    
    <SidebarSub
      id="club-membership-plans"
      label="Plans Membership"
    />

    <SidebarSub
      id="club-membership-invoices"
      label="Factures Membership"
    />

    <SidebarSub
      id="club-membership-payments"
      label="Paiements Membership"
    />

    <SidebarSub
      id="club-membership-invoices-templates"
      label="Templates Facture Membership"
    />

  </SubGroup>
)}



    {/* ========================= */}
{/*  BOOKINGS (Club) Group    */}
{/* ========================= */}
{role !== "assistant" && (
  <SubGroup title="Bookings" prefix="club-invoices">
    <SidebarSub
      id="club-invoices"
      label="Factures Club"
    />
    <SidebarSub
      id="club-invoices-payment"
      label="Paiements Club"
    />
    <SidebarSub
      id="club-invoices-templates"
      label="Templates Factures Club"
    />
  </SubGroup>
)}


    {/* Scanner QR — assistants can see it */}
    {isClubTabVisibleToAssistant("club-scan") && (
      <SidebarBtn id="club-scan" icon={<FaCheckToSlot />} label="Scanner QR" />
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
      <main className="flex-1 pt-20 md:pt-6 px-4 md:p-6 overflow-y-auto">{renderContent()}</main>

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
