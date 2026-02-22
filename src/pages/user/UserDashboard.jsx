// src/pages/user/UserDashboard.jsx
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useAuth } from "../../context/AuthContext"
import UserProfile from "../user/UserProfile"
import UserCourses from "../user/UserCourses";
import UserInvoices from "../user/UserInvoices";
import UserEnrollments from "../user/UserEnrollments";
import UserAttendance from "../user/UserAttendance";
import UserCommissions from "../user/UserCommissions";
import UserReferrals from "../user/UserReferrals";
import UserReports from "../user/UserReports";
import UserCommissionsRequests from "../user/UserCommissionsRequests";
import UserBoutique from "../user/UserBoutique";
import UserBoutiqueInvoices from "../user/UserBoutiqueInvoices";
import UserForm from "../admin/AdminUsersForm"; // adjust path
import { FaBell } from "react-icons/fa";
import { motion } from "framer-motion";
import BirthdayPopup from "../../components/BirthdayPopup";
import { useGlobalAlert } from "../../components/GlobalAlert";
import CalendarView from "../../components/CalendarView"; 
import UserClubDashboard from "../Club/UserClubDashboard";
import MemberProfile from "../Club/MemberProfile";
import {
  formatDateFrSafe,
  formatDateOnly,
  formatMonth,
  formatCurrencyUSD,
} from "../../lib/dateUtils";
import {
  FaHome,
  FaFileInvoiceDollar,
  FaUserGraduate,
  FaFileAlt,
  FaQrcode,
  FaChartLine,
  FaMoneyBillWave,
  FaLink,
  FaShoppingCart,
  FaSignOutAlt,
  FaFileInvoice,
  FaFileWord,
  FaFileArchive,
  FaFileDownload,
  FaRegImages,
  FaRegistered,
  FaClipboardList,
  FaUserClock,
} from "react-icons/fa"
import { Link, useNavigate } from "react-router-dom"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"
import { FaChalkboardUser, FaDollarSign, FaLaptopFile } from "react-icons/fa6";




export default function UserDashboard() {
  const { user } = useAuth()
  const [hasUnpaid, setHasUnpaid] = useState(false)
  const navigate = useNavigate()
  const [isSchoolMember, setIsSchoolMember] = useState(false);
  const [isClubMember, setIsClubMember] = useState(false);
  const [profile, setProfile] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attendanceProfiles, setAttendanceProfiles] = useState([]);
  const [selectedAttendanceProfileId, setSelectedAttendanceProfileId] = useState(null);
  const [upcomingClasses, setUpcomingClasses] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const isMobile = () => window.innerWidth < 768;

const goToTab = (tab) => {
  setActiveTab(tab);
  if (isMobile()) setSidebarOpen(false);
};

const goToTabAnd = (tab, fn) => {
  setActiveTab(tab);
  if (typeof fn === "function") fn();
  if (isMobile()) setSidebarOpen(false);
};


  // States
  const [activeTab, setActiveTab] = useState(() => {
    return sessionStorage.getItem("userDashboardActiveTab") || "overview";
  });
  const [invoiceSubTab, setInvoiceSubTab] = useState("factures");
  const [referrals, setReferrals] = useState([])
  const [invoices, setInvoices] = useState([])
  const [commission, setCommission] = useState(0)  
  const [referralLink, setReferralLink] = useState("")
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  const [recentReferrals, setRecentReferrals] = useState([])
  const [recentInvoices, setRecentInvoices] = useState([])
  const [notifications, setNotifications] = useState([])
  const [monthlyReferrals, setMonthlyReferrals] = useState([]) // for the chart
  const [balance, setBalance] = useState(0)                     // computed from invoices
  const [credit, setCredit] = useState(0);
  const [pendingCommission, setPendingCommission] = useState(0) // not yet requested
  const [requests, setRequests] = useState([])                  // last commission requests
  const [showAddChildForm, setShowAddChildForm] = useState(() => {
  return sessionStorage.getItem("userDashboard_showAddChildForm") === "true";
});

  const [openClasses, setOpenClasses] = useState(false);
  const [openCommissions, setOpenCommissions] = useState(false);
  const [openBoutique, setOpenBoutique] = useState(false);
  const { showConfirm, showInput, showAlert } = useGlobalAlert();
  const [childrenBirthdays, setChildrenBirthdays] = useState([]);
  const [membershipReady, setMembershipReady] = useState(false);
  const [clubClosingTime, setClubClosingTime] = useState(null);
  const [clubProfileId, setClubProfileId] = useState(null);
  const [clubStatus, setClubStatus] = useState(null);

  const fetchUpcomingClasses = async (profileIdOverride = null) => {
  const pid = profileIdOverride || selectedAttendanceProfileId;
  if (!pid) return;

  setUpcomingLoading(true);
  try {
    const today = todayHaitiISO();

    // enrollments (active)
    const { data: enrollments, error: enrErr } = await supabase
      .from("enrollments")
      .select("id, course_id, session_group, start_date, status, plan_id, plans:plan_id ( duration_hours )")
      .eq("profile_id", pid) // ✅ CHANGED (was selectedAttendanceProfileId)
      .eq("status", "active");

    if (enrErr) throw enrErr;

    if (!enrollments?.length) {
      setUpcomingClasses([]);
      return;
    }

    const sessionGroups = enrollments.map((e) => e.session_group).filter(Boolean);
    const enrollmentIds = enrollments.map((e) => e.id);

    // course names
    const courseIds = [...new Set(enrollments.map((e) => e.course_id).filter(Boolean))];
    const { data: courses } = await supabase.from("courses").select("id, name").in("id", courseIds);
    const courseMap = Object.fromEntries((courses || []).map((c) => [c.id, c.name]));

    // sessions (future)
    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select("id, session_group, start_date, day_of_week, start_time, duration_hours, status")
      .in("session_group", sessionGroups)
      .gte("start_date", today)
      .neq("status", "deleted")
      .order("start_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (sessErr) throw sessErr;

    // attendance for those enrollments
    const { data: attData, error: attErr } = await supabase
      .from("attendance")
      .select("enrollment_id, attended_on, status, marked_by")
      .in("enrollment_id", enrollmentIds);

    if (attErr) throw attErr;

    const attMap = {};
    (attData || []).forEach((a) => {
      attMap[`${a.enrollment_id}_${a.attended_on}`] = a;
    });

    const enrByGroup = {};
    (enrollments || []).forEach((e) => {
      if (!enrByGroup[e.session_group]) enrByGroup[e.session_group] = [];
      enrByGroup[e.session_group].push(e);
    });

    const combined = [];
    (sessions || []).forEach((s) => {
      const ens = enrByGroup[s.session_group] || [];
      ens.forEach((enr) => {
        if (new Date(s.start_date) < new Date(enr.start_date)) return;

        const a = attMap[`${enr.id}_${s.start_date}`];
        const normalized =
          a?.status === "excused" ? "unmarked" : (a?.status || "unmarked");

        combined.push({
          session_id: s.id,
          enrollment_id: enr.id,
          course_name: courseMap[enr.course_id] || "—",
          start_date: s.start_date,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          duration_hours: s.duration_hours ?? enr?.plans?.duration_hours ?? 1,
          attendance_status: normalized,
          marked_by: a?.marked_by || "user",
        });
      });
    });

   

const nowHHMM = nowHaitiTimeHHMM();

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || "00:00").slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

const nowMin = timeToMinutes(nowHHMM);

const filtered = (combined || []).filter((x) => {
  const d = String(x.start_date || "");
  const startHHMM = String(x.start_time || "").slice(0, 5);
  const durH = Number(x.duration_hours || 1);

  if (!d || !startHHMM) return false;

  // compute end time in minutes
  const startMin = timeToMinutes(startHHMM);
  const endMin = startMin + Math.round(durH * 60);

  if (d > today) return true;
  if (d < today) return false;

  // same day: keep only if END is still in the future
  return endMin > nowMin;
});

filtered.sort((a, b) => {
  if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date);
  return String(a.start_time || "").localeCompare(String(b.start_time || ""));
});

setUpcomingClasses(filtered);
  } catch (e) {
    console.error("fetchUpcomingClasses error:", e);
    setUpcomingClasses([]);
  } finally {
    setUpcomingLoading(false);
  }
};

useEffect(() => {
  if (!selectedAttendanceProfileId) return;

  // run immediately
  fetchUpcomingClasses();

  // auto-refresh every minute
  const id = setInterval(() => {
    fetchUpcomingClasses();
  }, 60 * 1000);

  return () => clearInterval(id);
}, [selectedAttendanceProfileId]);

const markAbsentFromOverview = async (enrollmentId, attendedOnISO, currentStatus) => {
  try {
    const question =
      currentStatus === "unmarked"
        ? `Êtes-vous sûr de vouloir marquer « absent » pour le cours du ${formatDateFrSafe(attendedOnISO)} ?`
        : `Voulez-vous annuler l’absence pour le cours du ${formatDateFrSafe(attendedOnISO)} ?`;

    const ok = await showConfirm(question);
    if (!ok) return;

    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-absent`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        enrollment_id: enrollmentId,
        attended_on: attendedOnISO,
        undo: currentStatus === "absent",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unknown error");

    await showAlert(data.message);
    fetchUpcomingClasses();
  } catch (err) {
    await showAlert("❌ Erreur lors du marquage : " + err.message);
  }
};

  useEffect(() => {
  if (clubStatus === "pending") {
    showAlert(
      "Vous n'avez pas encore accès à tous les éléments du Club. Votre dossier est en attente d'approbation.",
      "warning"
    );
  }
}, [clubStatus]);

useEffect(() => {
  sessionStorage.setItem(
    "userDashboard_showAddChildForm",
    showAddChildForm ? "true" : "false"
  );
}, [showAddChildForm]);

useEffect(() => {
  if (activeTab) {
    sessionStorage.setItem("userDashboardActiveTab", activeTab);
  }
}, [activeTab]);


  useEffect(() => {
  if (!user?.id) return;

  const checkMemberships = async () => {
    // --- SCHOOL ---
    const { data: school } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    setIsSchoolMember(!!school);

    // --- CLUB ---
    const { data: club } = await supabase
      .from("club_profiles")
      .select("id, status")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    setIsClubMember(!!club);
    setClubProfileId(club?.id || null);   // 🔥 THIS FIXES EVERYTHING
    setClubStatus(club?.status || null);

    setMembershipReady(true);
  };

  checkMemberships();
}, [user?.id]);

useEffect(() => {
  if (!user?.id) return;

  (async () => {
    // parent
    const { data: parent } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, signup_type")
      .eq("id", user.id)
      .maybeSingle();

    // children
    const { data: kids } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, parent_id")
      .eq("parent_id", user.id);

    const options =
      parent?.signup_type === "children_only"
        ? (kids || [])
        : [parent, ...(kids || [])].filter(Boolean);

    setAttendanceProfiles(options);

    // default selection
    const defaultId =
      parent?.signup_type === "children_only"
        ? (kids?.[0]?.id || null)
        : (parent?.id || kids?.[0]?.id || null);

    setSelectedAttendanceProfileId((prev) => prev || defaultId);
  })();
}, [user?.id]);


// 🎯 Determine default tab based on combined membership
useEffect(() => {
  if (!membershipReady) return;

  // 🚫 Do NOT override if a tab was already restored
  const storedTab = sessionStorage.getItem("userDashboardActiveTab");
  if (storedTab) return;

  // 1️⃣ Club-only → default to club overview
  if (!isSchoolMember && isClubMember) {
    setActiveTab("club-overview");
    return;
  }

  // 2️⃣ School (or school+club) → default to overview
  if (isSchoolMember) {
    setActiveTab("overview");
  }
}, [membershipReady, isSchoolMember, isClubMember]);



  
  
  useEffect(() => {
  if (!user?.id) return;

  const checkSchool = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    setIsSchoolMember(!!data);
  };

  checkSchool();
}, [user?.id]);


useEffect(() => {
  if (!invoices) return;

  const totalBal = invoices.reduce(
    (sum, i) => sum + ((i.total || 0) - (i.paid_total || 0)),
    0
  );

  setBalance(totalBal - credit);
}, [invoices, credit]);

useEffect(() => {
  const loadClosingTime = async () => {
    const { data, error } = await supabase
      .from("calendar_settings")
      .select("closing_time")
      .single();

    if (error) {
      console.error("⚠️ Error fetching closing_time:", error);
      return;
    }

    setClubClosingTime(data?.closing_time || null);
  };

  loadClosingTime();
}, []);

 
  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
if (authUser) {
        const { data } = await supabase
          .from("profiles_with_unpaid")
          .select("id, full_name, birth_date")
          .eq("id", authUser.id)
          .maybeSingle();
        setProfile(data);
        // 🎂 Fetch children birthdays
const { data: kids } = await supabase
  .from("profiles")
  .select("id, full_name, birth_date, parent_id")
  .eq("parent_id", authUser.id);

setChildrenBirthdays(kids || []);
      }
    })();
  }, []);

  // 🎉 Load CLUB profile birthdays if user is a club member
useEffect(() => {
  if (!user?.id || !isClubMember) return;

  const loadClubBirthdays = async () => {
    // Fetch parent club profile
    const { data: clubParent } = await supabase
      .from("club_profiles")
      .select("id, main_full_name, birth_date")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (clubParent) {
      setProfile({
        full_name: clubParent.main_full_name,
        birth_date: clubParent.birth_date
      });
    }

    // Fetch club children
    const { data: clubKids } = await supabase
      .from("club_profile_families")
      .select("full_name, birth_date, club_profile_id")
      .eq("club_profile_id", clubParent?.id);

    if (clubKids) {
      setChildrenBirthdays(clubKids);
    }
  };

  loadClubBirthdays();
}, [user?.id, isClubMember]);


  // 🎯 Ask influencers if they want to change their referral code
useEffect(() => {
  async function askReferralChange() {
    if (!user?.id) return;

    // Fetch influencer role + flag
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, role, referral_code, referral_prompt_shown")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("❌ Error checking influencer popup:", error.message);
      return;
    }

    // ✅ Only trigger popup if user is influencer and hasn’t seen it yet
if (profile.role === "influencer" && profile.referral_prompt_shown === false) {
  const wantsChange = await showConfirm(
        "🎉 Tu es maintenant un(e) collaborateur(trice) de A'QUA D'OR! Souhaite tu change ton code de parrainage?"
      );

      if (wantsChange) {
        const newCode = await showInput("✨ Entre ton nouveau code de parrainage (lettres & chiffres uniquement)");

if (newCode && /^[A-Za-z0-9]+$/.test(newCode)) {
  // update DB
} else {
  showAlert("❌ Code invalide: uniquement lettres et chiffres !");
}

        if (newCode && newCode.trim() !== "") {
          const { error: updateErr } = await supabase
            .from("profiles")
            .update({
              referral_code: newCode.trim(),
              referral_prompt_shown: true, // ✅ don’t show popup again
            })
            .eq("id", profile.id);

          if (updateErr)
            showAlert("❌ Error updating referral code: " + updateErr.message);
          else showAlert("✅ Your referral code was successfully updated!");
        }
      } else {
        // Just mark the flag so popup won’t reappear
        await supabase
          .from("profiles")
          .update({ referral_prompt_shown: true })
          .eq("id", profile.id);
      }
    }
  }

  askReferralChange();
}, [user?.id]);


  // ✅ Centralized invoice loader
const fetchAllInvoices = async () => {
  if (!user?.id || user.role === "influencer") return;

  try {
    const { data: parent } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, signup_type, has_unpaid")
      .eq("id", user.id)
      .maybeSingle();

      // === Load credit from credit table ===
const { data: creditRow } = await supabase
  .from("credits")
  .select("amount")
  .eq("user_id", user.id)
  .maybeSingle();

setCredit(creditRow?.amount || 0);


    if (parent) setHasUnpaid(parent.has_unpaid);
    console.log("🧾 has_unpaid for", parent.full_name, "=", parent.has_unpaid);

    const { data: children, error: childError } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, has_unpaid")
      .eq("parent_id", user.id);

    if (childError) throw childError;

    const childIds = children?.map((c) => c.id) || [];
    const idsToInclude =
      parent?.signup_type === "children_only"
        ? [...childIds]
        : [user.id, ...childIds];

    const { data: allInvoices, error: invError } = await supabase
      .from("invoices_normalized")
      .select(
        "id, user_id, invoice_no, total, paid_total, created_at, issued_at, status"
      )
      .in("user_id", idsToInclude);

    if (invError) throw invError;

    const mergedInvoices = allInvoices.map((inv) => {
      const child = children.find((c) => c.id === inv.user_id);
      return { ...inv, child_name: child ? child.full_name : null };
    });

    setInvoices(mergedInvoices || []);

    const totalBal = mergedInvoices.reduce(
  (sum, i) => sum + ((i.total || 0) - (i.paid_total || 0)),
  0
);

// Subtract credit (credit reduces balance)
const finalBalance = totalBal - credit;

setBalance(finalBalance);


    const sortedInv = [...(mergedInvoices || [])].sort(
      (a, b) =>
        new Date(b.issued_at || b.created_at) -
        new Date(a.issued_at || a.created_at)
    );
    setRecentInvoices(sortedInv.slice(0, 5));
  } catch (err) {
    console.error("Error fetching invoices:", err);
  }
};

useEffect(() => {
  if (user?.id) fetchAllInvoices();
}, [user?.id]);

 
useEffect(() => {
  const fetchUnpaidStatus = async () => {
    if (!user?.id) return;
    const { data: parent, error } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, has_unpaid")
      .eq("id", user.id)
      .maybeSingle();

    console.log("🧾 fetched profile_with_unpaid:", parent, error);

    setHasUnpaid(!!parent?.has_unpaid);
  };

  fetchUnpaidStatus();
}, [user?.id]);




  // ✅ Fetch referrals and their referred users' active status
useEffect(() => {
  if (!user?.id) return;

  const fetchReferrals = async () => {
    try {
      console.log("🔍 Fetching referrals for:", user.id);

      // ✅ NEW METHOD: use the secure RPC view function
      const { data: refs, error: refErr } = await supabase
        .rpc("get_referrals_with_profiles", { p_user_id: user.id });

      if (refErr) throw refErr;

      if (!refs?.length) {
        console.log("ℹ️ No referrals found");
        setReferrals([]);
        setCommission(0);
        return;
      }

      // Map the results into the same shape your UI expects
      const joined = refs.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        referred_user_id: r.referred_user_id,
        referred: {
          full_name: r.referred_full_name,
          is_active: r.referred_is_active,
        },
      }));

      // Save state
      setReferrals(joined);

    // ✅ Fetch real commissions from DB instead of simulating
try {
  const { data: comms, error: commErr } = await supabase
    .from("commissions")
    .select("amount, remaining_amount, status")
    .eq("referrer_user_id", user.id);

  if (commErr) throw commErr;

  const totalPending = (comms || []).reduce(
    (sum, c) => sum + Number(c.remaining_amount ?? 0),
    0
  );

  const totalAll = (comms || []).reduce(
    (sum, c) => sum + Number(c.amount ?? 0),
    0
  );

  setCommission(totalAll);
  setPendingCommission(totalPending);
} catch (e) {
  console.error("Error fetching real commissions:", e);
}


      console.table(
        joined.map((r) => ({
          referred: r.referred?.full_name,
          active: r.referred?.is_active,
        }))
      );
      console.log("✅ Referrals fetched via RPC:", joined.length);
    } catch (err) {
      console.error("❌ Referral fetch failed:", err);
    }
  };

  // ✅ Call the async function
  fetchReferrals();
}, [user]);

  
  useEffect(() => {
    if (user) {
      setReferralLink(
        `${window.location.origin}/signup?ref=${user.referral_code}`
      )
    }
  }, [user])

  useEffect(() => {
  if (!user?.id) return;

  const buildNotifications = async () => {
    const recentThreshold = Date.now() - 1000 * 60 * 60 * 24 * 7; // 7 days
    const notes = [];

    // --- 1️⃣ Recent referrals ---
    const sortedRefs = [...(referrals || [])].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    sortedRefs.slice(0, 5).forEach((r) => {
      if (new Date(r.created_at).getTime() >= recentThreshold) {
        notes.push({
          id: `ref-${r.id}`,
          type: "referral",
          text: `Nouveau parrainage: ${r.referred?.full_name || "Utilisateur"}`,
          date: r.created_at,
        });
      }
    });

    // --- 2️⃣ Recent paid invoices ---
    (recentInvoices || []).slice(0, 5).forEach((inv) => {
      if ((inv.status || "").toLowerCase() === "paid") {
        notes.push({
          id: `inv-${inv.id}`,
          type: "payment",
          text: `Paiement reçu: ${Number(inv.paid_total || 0).toFixed(2)} $`,
          date: inv.updated_at || inv.created_at,
        });
      }
    });

    // --- 3️⃣ Real notifications from Supabase ---
    const { data: dbNotes, error: dbErr } = await supabase
      .from("notifications")
      .select("id, text, category, date, read")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(5);

    if (dbErr) console.error("DB notifications fetch failed:", dbErr);

    // --- Merge DB + local ---
    const allNotes = [
      ...(dbNotes || []),
      ...notes.map((n) => ({
        id: n.id,
        text: n.text,
        category: n.type,
        date: n.date,
        read: false,
      })),
    ];

    // --- Deduplicate + sort ---
    const unique = Array.from(new Map(allNotes.map((n) => [n.id, n])).values())
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    setNotifications(unique);
  };

  buildNotifications();

  // --- Realtime for DB notifications ---
  const channel = supabase
    .channel("user-notifications-" + user.id)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
      (payload) => {
        console.log("🔔 New notification for user:", payload.new);
        buildNotifications();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id, referrals, recentInvoices]);



const [commissionRequests, setCommissionRequests] = useState([]);

const handleCommissionRequest = async (type) => {
  const { error } = await supabase.from("commission_requests").insert({
    user_id: user.id,
    amount: pendingCommission, // you can allow custom amount if needed
    status: "pending",
    request_type: type,
  });

  if (error) {
    console.error("Error creating commission request:", error);
  } else {
    showAlert(
      type === "payout"
        ? "Demande de paiement envoyée !"
        : "Demande d'achat envoyée !"
    );
    fetchCommissionRequests(); // refresh list
  }
};

const fetchCommissionRequests = async () => {
  const { data, error } = await supabase
    .from("commission_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("requested_at", { ascending: false })
    .limit(5);

  if (!error) setCommissionRequests(data);
};

const fetchCredit = async () => {
  if (!user?.id) return;

  const { data: creditRow } = await supabase
    .from("credits")
    .select("amount")
    .eq("user_id", user.id)
    .maybeSingle();

  setCredit(creditRow?.amount || 0);
};


// ✅ STEP 1 — Central refresh function for the Aperçu tab
const refreshOverviewData = async () => {
  console.log("🔄 Refreshing overview data...");
  await Promise.all([
    fetchAllInvoices(),        // 🧾 refresh invoices + balance
    fetchCredit(),           // 🔥 NEW — always reload credit
    fetchCommissionRequests(), // 💰 refresh commissions
    // fetchReferrals(),        // 👥 optional
  ]);
};



useEffect(() => {
  if (user?.id) {
    fetchCommissionRequests();
  }
}, [user]);


// ✅ STEP 2 — Automatically refresh data when switching back to "Aperçu"
useEffect(() => {
  if (activeTab === "overview") {
    refreshOverviewData();
  }
}, [activeTab]);

useEffect(() => {
  if (!user?.id) return;

  const channel = supabase
    .channel("user-financial-realtime-" + user.id)

    // 🧾 INVOICES
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "invoices", filter: `user_id=eq.${user.id}` },
      () => {
        console.log("🧾 Invoice change detected");
        fetchAllInvoices();
      }
    )

    // 💳 CREDIT
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "credits", filter: `user_id=eq.${user.id}` },
      () => {
        console.log("💳 Credit updated");
        fetchCredit();
      }
    )

    // 💰 COMMISSIONS
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "commissions", filter: `referrer_user_id=eq.${user.id}` },
      () => {
        console.log("💰 Commission updated");
        refreshOverviewData();
      }
    )

    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id]);


  const handleLogout = async () => {
  try {
    await supabase.auth.signOut();

    // Optional but recommended if OneSignal exists
    if (window.OneSignal?.logout) {
      try {
        await window.OneSignal.logout();
      } catch {}
    }
  } finally {
    // HARD reset — PWA safe
    window.location.href = "/login";
  }
};

function todayHaitiISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
  }).format(new Date());
}

function dayLabel(d) {
  if (d == null) return "—";
  const days = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  return days[(d - 1 + 7) % 7] || "—";
}

function addHoursToTimeStr(timeStr, hoursToAdd) {
  if (!timeStr) return "";
  const [h, m] = String(timeStr).split(":").map(Number);
  const base = new Date(2000, 0, 1, h || 0, m || 0, 0);
  base.setHours(base.getHours() + (Number(hoursToAdd) || 1));
  return `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`;
}

function nowHaitiTimeHHMM() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Port-au-Prince",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const h = parts.find((p) => p.type === "hour")?.value || "00";
  const m = parts.find((p) => p.type === "minute")?.value || "00";
  return `${h}:${m}`; // "HH:MM"
}

const hasManyAttendanceProfiles = (attendanceProfiles?.length || 0) > 1;
const selectedAttendanceProfile = (attendanceProfiles || []).find(p => p.id === selectedAttendanceProfileId) || null;

  const renderContent = () => {
  // If user is club-only and activeTab is a school tab → redirect internally
  if (!isSchoolMember && activeTab === "overview") {
    return <div></div>; // temporarily prevent crash
  }

  switch (activeTab) {
    case "overview":
      if (!isSchoolMember) return null;
  return (
    <div className="space-y-6">
      {/* === HEADER SECTION === */}
<div className="grid grid-cols-1 md:grid-cols-2 items-center mb-8">
  {/* LEFT COLUMN — Welcome text */}
  <div className="text-left space-y-1 flex flex-col justify-center">
    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
  Bienvenue, 
  <span>{user?.full_name}</span>
  {hasUnpaid && (
  <span
    title="Factures impayées"
    className="text-red-700 bg-red-200 px-2 py-0.5 rounded-full text-base font-bold shadow-sm border border-red-400"
  >
    $
  </span>
)}

</h2>


    <p className="text-gray-600">
      Voici un aperçu de ton activité et de tes finances.
    </p>
  </div>

  {/* RIGHT COLUMN — Buttons */}
  <div className="flex justify-center md:justify-center items-center gap-4 mt-4 md:mt-0">
    <button
  onClick={() => {
    setActiveTab("profile");
    setShowAddChildForm(true);
    sessionStorage.setItem("userDashboard_showAddChildForm", "true");
  }}
  className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition-all"
>
  Ajouter une personne
</button>


    <button
      onClick={() => {
        setActiveTab("enrollments");
        setOpenClasses(true);
      }}
      className="px-5 py-2 bg-orange-500 text-white font-semibold rounded-lg shadow hover:bg-orange-600 transition-all"
    >
      S’enregister dans une classe
    </button>
  </div>
</div>

{/* === FORM PLACEHOLDER (optional — appears only when profile tab is active) === */}
{activeTab === "profile" && (
  <div className="mt-4 bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
    <h3 className="text-lg font-semibold mb-3">Ajouter une personne</h3>
    <UserForm parentId={user.id} />
  </div>
)}


      

      {/* === Animated Balance + Pending Commissions === */}
<div className="grid grid-cols-1 sm:grid-cols-1 gap-6">
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
    
    {/* 🧾 Balance card with hover breakdown */}
    <motion.div
      className="relative group p-4 bg-white shadow rounded-2xl border border-gray-100 cursor-pointer transition-all"
      whileHover={{ scale: 1.03, y: -3 }}
      onClick={() => {
  setInvoiceSubTab("factures");   // <-- opens the correct subtab
  setActiveTab("invoices");       // <-- go to invoices tab
}}
    >
      <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-t-2xl"></div>
      <h3 className="text-center text-sm font-semibold text-gray-500">
        Solde actuel
      </h3>

      <p
        className={`text-center text-4xl font-bold mt-6 ${
          balance > 0 ? "text-red-600" : "text-green-600"
        }`}
      >
        {balance > 0
          ? `${formatCurrencyUSD(Math.abs(balance))}`
          : `${formatCurrencyUSD(balance)}`}
      </p>

      {/* Badge */}
      <div className="text-center mt-2">
        {balance > 0 ? (
          <span className="text-red-600 bg-red-100 px-3 py-1 rounded-full text-sm font-medium">
            Facture à payer
          </span>
        ) : balance < 0 ? (
          <span className="text-green-600 bg-green-100 px-3 py-1 rounded-full text-sm font-medium">
            Crédit disponible
          </span>
        ) : (
          <span className="text-gray-600 bg-gray-100 px-3 py-1 rounded-full text-sm font-medium">
            Solde à jour
          </span>
        )}
      </div>

      {/* 🧾 Hover breakdown tooltip */}
      <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-3 w-72 bg-white shadow-xl rounded-lg p-3 border border-gray-200 text-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-300 z-50 scale-95 group-hover:scale-100">
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-white border-l border-t border-gray-200 rotate-45"></div>
        <p className="font-semibold text-gray-700 mb-2 text-center">Détail du solde</p>

        <ul className="space-y-1">
  {/* Parent (only if not children_only) */}
  {user.signup_type !== "children_only" && (
    <li className="flex justify-between font-medium">
      <span>{user.full_name}</span>
      <span
        className={
          invoices
            .filter((i) => i.user_id === user.id)
            .reduce(
              (s, i) => s + ((i.total || 0) - (i.paid_total || 0)),
              0
            ) > 0
            ? "text-red-600"
            : "text-green-600"
        }
      >
        {formatCurrencyUSD(
          invoices
            .filter((i) => i.user_id === user.id)
            .reduce(
              (s, i) => s + ((i.total || 0) - (i.paid_total || 0)),
              0
            )
        )}
      </span>
    </li>
  )}

  {/* Each child */}
  {Array.from(
  new Set(
    invoices.filter((i) => i.child_name).map((i) => i.child_name)
  )
).map((child) => {
  const childBal = invoices
    .filter((i) => i.child_name === child)
    .reduce(
      (s, i) => s + ((i.total || 0) - (i.paid_total || 0)),
      0
    );
  return (
    <li key={child} className="flex justify-between">
      <span>{child}</span>
      <span
        className={childBal > 0 ? "text-red-600" : "text-green-600"}
      >
        {formatCurrencyUSD(childBal)}
      </span>
    </li>
  );
})}

</ul>

      </div>
    </motion.div>

    {/* 💸 Pending Commissions */}
    <motion.div
      className="relative p-4 bg-white shadow rounded-2xl border border-gray-100 transition-all cursor-pointer"
      whileHover={{ scale: 1.03, y: -3 }}
      onClick={() => setActiveTab("commissions")}
    >
      <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg mx-auto text-center p-4 overflow-hidden">
  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-orange-400 to-yellow-400 rounded-t-2xl"></div>

  <h3 className="text-sm font-semibold text-gray-500 break-words">
    Commissions en attente
  </h3>

  <p
    className={`text-2xl font-bold mt-2 break-words ${
      pendingCommission === 0 ? "text-green-600" : "text-red-600"
    }`}
  >
    {formatCurrencyUSD(pendingCommission)}
  </p>

  <div className="mt-3 flex flex-wrap justify-center gap-3">
    <button
      onClick={(e) => {
        e.stopPropagation();
        setActiveTab("commissions-requests");
        setOpenCommissions(true);
      }}
      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 flex-1 sm:flex-none"
    >
      Demander un paiement
    </button>

    <button
      onClick={(e) => {
    e.stopPropagation();
    setActiveTab("boutique");
  }}
      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 flex-1 sm:flex-none"
    >
      Utiliser en boutique
    </button>
  </div>
</div>

    </motion.div>

    {/* 🔗 Referral Link */}
    <motion.div
      className="relative p-4 bg-white shadow rounded-2xl border border-gray-100 transition-all cursor-pointer"
      whileHover={{ scale: 1.03, y: -3 }}
      onClick={() => setActiveTab("referrals")}
    >
      <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-t-2xl"></div>
      <h3 className="text-sm font-semibold text-gray-500 mb-2">
        Lien de parrainage
      </h3>
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={referralLink}
          readOnly
          onClick={(e) => e.stopPropagation()}
          className="flex-1 border rounded p-2 text-sm"
        />
        <button
          onClick={(e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(referralLink);
    showAlert("Lien copié !");
  }}
          className="px-3 py-1 bg-aquaBlue text-white rounded"
        >
          Copier
        </button>
      </div>
    </motion.div>
  </div>
</div>


      {/* === Quick Stats === */}
<div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
  {/* Total Parrainages */}
  <motion.div
    className="p-4 bg-white shadow rounded-2xl border border-gray-100 text-center transition-all cursor-pointer"
    whileHover={{ scale: 1.03, y: -3 }}
  >
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-t-2xl"></div>
    <h3 className="text-sm font-semibold text-gray-500">
      Total Parrainages
    </h3>
    <p className="text-2xl font-bold mt-2">{referrals.length}</p>
  </motion.div>

  {/* Actifs */}
  <motion.div
    className="p-4 bg-white shadow rounded-2xl border border-gray-100 text-center transition-all cursor-pointer"
    whileHover={{ scale: 1.03, y: -3 }}
  >
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-t-2xl"></div>
    <h3 className="text-sm font-semibold text-gray-500">Actifs</h3>
    <p className="text-2xl font-bold mt-2 text-green-600">
      {referrals.filter((r) => r.referred?.is_active).length}
    </p>
  </motion.div>

  {/* Inactifs */}
  <motion.div
    className="p-4 bg-white shadow rounded-2xl border border-gray-100 text-center transition-all cursor-pointer"
    whileHover={{ scale: 1.03, y: -3 }}
  >
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-red-500 to-pink-400 rounded-t-2xl"></div>
    <h3 className="text-sm font-semibold text-gray-500">Inactifs</h3>
    <p className="text-2xl font-bold mt-2 text-red-600">
      {referrals.filter((r) => !r.referred?.is_active).length}
    </p>
  </motion.div>
</div>

{/* === Next session (mark absent) === */}
{(() => {
  const next = (upcomingClasses || [])
    .slice()
    .sort((a, b) => {
      const da = new Date(`${a.start_date}T${(a.start_time || "00:00").slice(0, 5)}:00`);
      const db = new Date(`${b.start_date}T${(b.start_time || "00:00").slice(0, 5)}:00`);
      return da - db;
    })[0];

  return (
    <motion.div
      className="p-5 bg-white shadow rounded-2xl border border-gray-100 mt-8"
      whileHover={{ scale: 1.01, y: -2 }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
  <div className="flex flex-col">
    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
      <FaUserClock className="text-aquaBlue" />
      Prochain cours
    </h3>

    {/* ✅ Dropdown only if multiple profiles */}
    {hasManyAttendanceProfiles ? (
      <select
        value={selectedAttendanceProfileId || ""}
        onChange={(e) => {
          const newId = e.target.value || null;
          setSelectedAttendanceProfileId(newId);
          setUpcomingClasses([]);           // optional: avoids showing old person's session
          fetchUpcomingClasses(newId);      // ✅ immediate refresh for selected person
        }}
        className="mt-2 w-full sm:w-[280px] border rounded-lg px-3 py-2 text-sm bg-white"
      >
        {(attendanceProfiles || []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
    ) : (
      // ✅ No dropdown if only one person
      <div className="mt-2 text-sm text-gray-600">
        {(selectedAttendanceProfile?.full_name || user?.full_name || "").trim()}
      </div>
    )}
  </div>

  <button
    onClick={() => fetchUpcomingClasses()}
    className="px-4 h-[38px] bg-aquaBlue text-white rounded-lg text-sm hover:bg-blue-700"
  >
    Rafraîchir
  </button>
</div>

      {upcomingLoading ? (
        <div className="text-center py-4 text-aquaBlue font-medium">⏳ Chargement…</div>
      ) : !next ? (
        <p className="text-gray-500 italic">Aucun cours à venir.</p>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="text-gray-900 font-semibold text-base">
              {next.course_name || "—"}
            </div>

            <div className="text-sm text-gray-600">
              {dayLabel(next.day_of_week)} • {formatDateFrSafe(next.start_date)} •{" "}
              {(next.start_time || "").slice(0, 5)}–{addHoursToTimeStr(next.start_time, next.duration_hours)}
            </div>

            <div className="mt-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  next.attendance_status === "absent"
                    ? "text-red-700 bg-red-100"
                    : next.attendance_status === "present"
                    ? "text-green-700 bg-green-100"
                    : "text-gray-700 bg-gray-100"
                }`}
              >
                {next.attendance_status === "absent"
                  ? "Absent"
                  : next.attendance_status === "present"
                  ? "Présent"
                  : "Non marqué"}
              </span>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            {next.attendance_status === "absent" ? (
              <button
                onClick={() => markAbsentFromOverview(next.enrollment_id, next.start_date, "absent")}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700"
              >
                Undo
              </button>
            ) : next.attendance_status === "unmarked" ? (
              <button
                onClick={() => markAbsentFromOverview(next.enrollment_id, next.start_date, "unmarked")}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                Marquer absent
              </button>
            ) : (
              <button
                onClick={() => setActiveTab("attendance")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Voir présence
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
})()}

{/* === Recent Activity === */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
  {/* Activité récente (Parrainages) */}
  <motion.div
    className="p-4 bg-white shadow rounded-2xl border border-gray-100 transition-all cursor-pointer"
    whileHover={{ scale: 1.03, y: -3 }}
  >
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-t-2xl"></div>
    <h3 className="text-lg font-semibold mb-2">
      Activité récente (Parrainages)
    </h3>
    {recentReferrals.length === 0 ? (
      <p className="text-gray-600">Aucune activité récente.</p>
    ) : (
      <ul className="space-y-2 text-sm">
        {recentReferrals.map((r) => (
          <li key={r.id} className="flex justify-between">
            <span>{r.referred?.full_name || "Utilisateur"}</span>
            <span className="text-gray-500">
              {formatDateFrSafe(r.created_at)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </motion.div>

  {/* Activité récente (Factures) */}
  <motion.div
    className="p-5 bg-gradient-to-br from-blue-50 to-orange-50 shadow-md rounded-2xl border border-gray-100 transition-all cursor-pointer"
    whileHover={{ scale: 1.03, y: -3 }}
  >
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-orange-400 to-yellow-400 rounded-t-2xl"></div>
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
        <FaFileInvoiceDollar className="text-aquaBlue" />
        Activité récente (Factures)
      </h3>
      <span className="text-xs text-gray-500 italic">
        Dernières transactions
      </span>
    </div>

    {recentInvoices.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500">
        <FaFileInvoiceDollar className="text-4xl text-gray-300 mb-2" />
        <p className="text-sm font-medium">Aucune facture récente</p>
      </div>
    ) : (
      <ul className="divide-y divide-gray-100">
        {recentInvoices.map((f) => {
          const statusColor =
            f.status === "paid"
              ? "text-green-600 bg-green-50"
              : f.status === "partial"
              ? "text-yellow-600 bg-yellow-50"
              : "text-red-600 bg-red-50";

          return (
            <li
  key={f.id}
  onClick={() => {
    if (f.status === "paid" || f.status === "partial") {
      setInvoiceSubTab("recus");
    } else {
      setInvoiceSubTab("factures");
    }
    setActiveTab("invoices");
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("openInvoiceFromDashboard", {
          detail: { invoiceId: f.id },
        })
      );
    }, 100);
  }}
  className="flex justify-between items-center py-3 px-2 hover:bg-white hover:shadow-sm rounded-lg transition cursor-pointer"
>
  <div className="flex flex-col">
    <span className="font-semibold text-gray-800">
      #{f.invoice_no?.toUpperCase() ||
        (f.referral_code ? f.referral_code.toUpperCase() : "—")}
    </span>
    <span className="text-sm text-gray-600">
      {formatCurrencyUSD(f.total || 0)}
    </span>
  </div>

  <div className="flex flex-col text-right">
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        f.status === "paid"
          ? "text-green-600 bg-green-50"
          : f.status === "partial"
          ? "text-yellow-600 bg-yellow-50"
          : "text-red-600 bg-red-50"
      }`}
    >
      {f.status === "paid"
        ? "Payée"
        : f.status === "partial"
        ? "Partielle"
        : "En attente"}
    </span>
    <span className="text-xs text-gray-500 mt-1">
      {formatDateFrSafe(f.issued_at || f.created_at)}
    </span>
  </div>
</li>

          );
        })}
      </ul>
    )}
  </motion.div>
</div>

{/* === Notifications === */}
<motion.div
  className="p-5 bg-gradient-to-br from-blue-50 to-orange-50 shadow-md rounded-2xl border border-gray-100 mt-8 transition-all cursor-pointer"
  whileHover={{ scale: 1.03, y: -3 }}
>
  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-t-2xl"></div>
  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-3">
    <FaBell className="text-aquaBlue" /> Notifications
  </h3>

  {notifications.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
      <FaBell className="text-4xl text-gray-300 mb-2" />
      <p className="text-sm font-medium">Aucune notification</p>
    </div>
  ) : (
    <ul className="divide-y divide-gray-100 text-sm">
      {notifications.map((n) => (
        <li key={n.id} className="py-3 flex justify-between items-start">
          <span className="text-gray-700">{n.text}</span>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {formatDateFrSafe(n.date)}
          </span>
        </li>
      ))}
    </ul>
  )}
</motion.div>
{/* === SCHOOL CALENDAR === */}
<div className="mt-10">
  <h3 className="text-xl font-bold mb-4">Calendrier </h3>
  <CalendarView mode="ecole" />
</div>

</div>
  )
  case "profile":
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Mon Profil</h2>
      <UserProfile userId={user.id} onAddChild={() => setShowAddChildForm(true)} />
        {showAddChildForm && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">Ajouter un enfant</h3>
          <UserForm
            parentId={user.id}
            onClose={() => setShowAddChildForm(false)}
          />
        </div>
      )}
    </div>
  )

      case "invoices":
  return (
    <div>
      <UserInvoices userId={user.id} initialTab={invoiceSubTab} />
    </div>
  );
      case "courses":
  return (
    <div>
      <UserCourses userId={user.id} />
    </div>
  );

case "enrollments":
  return (
    <div>
      <UserEnrollments userId={user.id} />
    </div>
  );
case "attendance":
  return (
    <div>
      <UserAttendance userId={user.id} />
    </div>
  );

      case "bulletins":
        return (
          <div>
      <UserReports user={user} />
    </div>
        )
      case "referrals":
        return (
          <div>
      <UserReferrals user={user} />
    </div>
        )
      case "commissions":
  return (
    <div>
      <UserCommissions setActiveTab={setActiveTab} />
    </div>
  )


      case "commissions-requests":
        return (
          <div>
      <UserCommissionsRequests setActiveTab={setActiveTab} />
    </div>
  )
      case "boutique":
        return (
          <div>
            <UserBoutique setActiveTab={setActiveTab} />
          </div>
        )
        case "boutique-invoices":
  return (
    <div>
      <UserBoutiqueInvoices setActiveTab={setActiveTab} />
    </div>
  );
  case "club-overview":
  return ( <div><UserClubDashboard setActiveTab={setActiveTab}/></div>);

case "club-profile":
  return (
    <div>
      <MemberProfile 
        setActiveTab={setActiveTab}
        clubProfileId={clubProfileId}
      />
    </div>
  );



case "club-invoices":
  return <div>Club Invoices Placeholder</div>;

case "club-boutique":
  return <UserBoutique setActiveTab={setActiveTab} isClubVersion={true} />;

case "club-referrals":
  return <div>Club Referrals Placeholder</div>;
case "calendar":
  return (
    <div>
      <h2 className="text-xl text-center font-bold mb-8">Calendrier du Club - Cliquer sur une date pour faire une réservation</h2>
      <CalendarView
  mode="club"
  closingTime={clubClosingTime}
  overtimeCutoff={clubClosingTime}   // TEMP: same cutoff until you add column
  extraTimePricePer30={0}             // TEMP: no hard logic impact
  overtimePricePer30={0}
/>
    </div>
  );


      }
  }
if (!membershipReady) return <div>Loading...</div>;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile header */}
<div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-950 text-white flex items-center justify-between px-4 py-3">
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
    onClick={() => goToTab("overview")}
  />

  <div className="w-6" />
</div>


{/* Overlay */}
{sidebarOpen && (
  <div
    className="fixed inset-0 bg-black/50 z-40 md:hidden"
    onClick={() => setSidebarOpen(false)}
  />
)}

      {/* Sidebar */}
      <aside
  className={`
    fixed md:static inset-y-0 left-0 z-50
    w-64 bg-gray-950 shadow-lg flex flex-col
    transform transition-transform duration-300
    ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
    md:translate-x-0
  `}
>

        <div className="p-4 border-gray-100 border-b flex flex-col items-center">
          <img src="/logo/aquador.png" alt="Logo A'QUA D'OR" className="h-10 w-10" />
          <h1 className="text-2xl font-bold text-aquaBlue">A'QUA D'OR</h1>    
          <p className="text-gray-500 text-sm">
            {isClubMember
              ? "Member Dashboard"
              : user?.role === "influencer"
              ? "Collaboratrice Dashboard"
              : "Parent/Élève Dashboard"}
          </p>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <ul>
            {isSchoolMember && (
    <>
            <li
              onClick={() => {
  goToTab("overview");
  if (window.innerWidth < 768) {
    setSidebarOpen(false);
  }
}}

              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
              activeTab === "overview" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
            }`}
            >
              <FaHome className="mr-2" /> Aperçu
            </li>         
            <li
              onClick={() => goToTab("profile")}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "profile"
                  ? "bg-aquaBlue text-white"
                  : "text-gray-100 hover:bg-orange-700"
              }`}
            >
              <FaUserGraduate className="mr-2" /> Profil
            </li>      
            {user?.role !== "influencer" && (
  <li
    onClick={() => goToTab("invoices")}
    className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
      activeTab === "invoices"
        ? "bg-aquaBlue text-white"
        : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <FaDollarSign className="mr-2" /> Factures
  </li>
)}
       
            {/* === CLASSES (expandable) === */}
<li>
  <button
    onClick={() => setOpenClasses(!openClasses)}
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("enrollments") ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2">
      <FaUserGraduate className="mr-2" /> Classes
    </span>
    <span>{openClasses ? "▲" : "▼"}</span>
  </button>

  {openClasses && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => goToTabAnd("enrollments", () => setOpenClasses(true))}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
          activeTab === "enrollments"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <FaClipboardList className="mr-1" /> Enregistrement
      </button>

      <button
        onClick={() => goToTabAnd("courses", () => setOpenClasses(true))}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
          activeTab === "courses"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <FaChalkboardUser className="mr-1" /> Cours
      </button>
    </div>
  )}
</li>
<li
  onClick={() => goToTab("attendance")}
  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
    activeTab === "attendance"
      ? "bg-aquaBlue text-white"
      : "text-gray-100 hover:bg-orange-700"
  }`}
>
  <FaUserClock className="mr-2" /> Présence
</li>

            <li
              onClick={() => goToTab("bulletins")}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
              activeTab === "bulletins" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
            }`}
            >
              <FaFileDownload className="mr-2" /> Rapports
            </li>
            <li
              onClick={() => goToTab("referrals")}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
              activeTab === "referrals" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
            }`}
            >
              <FaLink className="mr-2" /> Parrainage
            </li>
{/* === COMMISSIONS (expandable group) === */}
<li>
  <button
    onClick={() => setOpenCommissions(!openCommissions)}
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("commissions")
        ? "bg-aquaBlue text-white"
        : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2">
      <FaChartLine className="mr-2" /> Commissions
    </span>
    <span>{openCommissions ? "▲" : "▼"}</span>
  </button>

  {openCommissions && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => goToTabAnd("commissions", () => setOpenCommissions(true))}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
          activeTab === "commissions"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <FaChartLine className="mr-1" /> Détails des commissions
      </button>

      <button
        onClick={() => goToTabAnd("commissions-requests", () => setOpenCommissions(true))}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
          activeTab === "commissions-requests"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <FaMoneyBillWave className="mr-1" /> Demande de paiement
      </button>
    </div>
  )}
</li>


            {/* === BOUTIQUE (expandable group) === */}
<li>
  <button
    onClick={() => setOpenBoutique(!openBoutique)}
    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
      activeTab.startsWith("boutique")
        ? "bg-aquaBlue text-white"
        : "text-gray-100 hover:bg-orange-700"
    }`}
  >
    <span className="flex items-center gap-2">
      <FaShoppingCart className="mr-2" /> Boutique
    </span>
    <span>{openBoutique ? "▲" : "▼"}</span>
  </button>

  {openBoutique && (
    <div className="ml-6 mt-2 flex flex-col space-y-2">
      <button
        onClick={() => goToTabAnd("boutique", () => setOpenBoutique(true))}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
          activeTab === "boutique"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <FaShoppingCart className="mr-1" /> Articles
      </button>

      <button
        onClick={() => goToTabAnd("boutique-invoices", () => setOpenBoutique(true))}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded ${
          activeTab === "boutique-invoices"
            ? "bg-aquaBlue text-white"
            : "text-gray-100 hover:bg-orange-700"
        }`}
      >
        <FaFileInvoiceDollar className="mr-1" /> Factures / Reçus
      </button>
    </div>
  )}
</li>
</>
)}
{/* ======================================= */}
    {/* =====  CLUB SECTION (CORRECT PLACE) === */}
    {/* ======================================= */}
    {isClubMember && (
  <>
    <li className="mt-4 text-gray-400 uppercase text-xs tracking-wider">
      Club
    </li>

    {/* ALWAYS visible */}
    <li
      onClick={() => goToTab("club-overview")}
      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
        activeTab === "club-overview"
          ? "bg-aquaBlue text-white"
          : "text-gray-100 hover:bg-orange-700"
      }`}
    >
      Aperçu Club
    </li>

    {/* ONLY SHOW WHEN APPROVED */}
    {clubStatus === "active" && (
      <>
        <li
          onClick={() => goToTab("club-profile")}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
            activeTab === "club-profile"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          Mon Profil Club
        </li>

        <li
          onClick={() => goToTab("club-invoices")}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
            activeTab === "club-invoices"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          Factures Club
        </li>

        <li
          onClick={() => goToTab("club-boutique")}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
            activeTab === "club-boutique"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          Boutique 
        </li>

        <li
          onClick={() => goToTab("calendar")}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
            activeTab === "calendar"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          Calendrier - Bookings
        </li>

        <li
          onClick={() => goToTab("visits")}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
            activeTab === "visits"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          Visiteurs
        </li>

        <li
          onClick={() => goToTab("club-referrals")}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
            activeTab === "club-referrals"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          Parrainage Club
        </li>
      </>
    )}
  </>
)}



          </ul>
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
      <main className="flex-1 pt-20 md:pt-6 px-4 md:p-6 overflow-y-auto">
  {renderContent()}
</main>


      {/* Confirmation Modal */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-[999999] pointer-events-auto">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm z-[1000000]">
            <h2 className="text-lg font-bold mb-4">Êtes-vous sûr de vouloir vous déconnecter ?</h2>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="px-3 py-1 rounded bg-gray-200"
              >
                Annuler
              </button>

              <button
                onClick={handleLogout}
                className="px-3 py-1 rounded bg-red-600 text-white"
              >
                Oui, déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 🎉 Birthday popup overlay (always last so it's on top) */}
      {profile && (
  <BirthdayPopup
  fullName={profile.full_name}
  birthDate={profile.birth_date || null}
  childrenBirthdays={childrenBirthdays}
/>

)}   
    </div>
  )
}
