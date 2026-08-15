// src/pages/user/UserDashboard.jsx
import { useState, useEffect, useRef } from "react"
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
import ClubMembershipInvoices from "../Club/ClubMembershipInvoices";
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
import PhoneInput, {
  isValidPhoneNumber,
} from "react-phone-number-input";

import { detectCountryISO } from "../../lib/detectCountry";
import PaymentPage from "../../components/payments/PaymentPage";




export default function UserDashboard() {
  const EVENT_CODE = "cloture-2026-08-29";
const EVENT_DATE = "2026-08-29";
const EVENT_NAME =
  "Cérémonie de clôture et remise de certificats";
  const { user } = useAuth()
  const [hasUnpaid, setHasUnpaid] = useState(false)
  const navigate = useNavigate()
  const dashboardContentRef = useRef(null);
  const [isSchoolMember, setIsSchoolMember] = useState(false);
  const [isClubMember, setIsClubMember] = useState(false);
  const [profile, setProfile] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attendanceProfiles, setAttendanceProfiles] = useState([]);
  const [selectedAttendanceProfileId, setSelectedAttendanceProfileId] = useState(null);
  const [upcomingClasses, setUpcomingClasses] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [presenceLoading, setPresenceLoading] =
  useState(false);

const [presenceSaving, setPresenceSaving] =
  useState(false);

const [presenceConfirmations, setPresenceConfirmations] =
  useState([]);

const [showAbsenceReason, setShowAbsenceReason] =
  useState(false);

const [absenceReason, setAbsenceReason] =
  useState("");

const [selectedParticipants, setSelectedParticipants] =
  useState([]);

  const [guestCountry, setGuestCountry] =
  useState("HT");

const [memberGuestData, setMemberGuestData] =
  useState(null);

const [memberGuestLoading, setMemberGuestLoading] =
  useState(false);

const [showFreeGuestModal, setShowFreeGuestModal] =
  useState(false);

const [selectedFreeStudent, setSelectedFreeStudent] =
  useState(null);

const [freeGuestName, setFreeGuestName] =
  useState("");

const [freeGuestPhone, setFreeGuestPhone] =
  useState("");

const [freeGuestSaving, setFreeGuestSaving] =
  useState(false);

  // =========================================================
// CLOTURE — PAID EXTRA GUESTS
// =========================================================

const [showExtraGuestModal, setShowExtraGuestModal] =
  useState(false);

const [extraPeopleCount, setExtraPeopleCount] =
  useState(1);

const [extraParticipants, setExtraParticipants] =
  useState([
    {
      full_name: "",
      phone: "",
    },
  ]);

const [extraGuestSaving, setExtraGuestSaving] =
  useState(false);

const [extraGuestResult, setExtraGuestResult] =
  useState(null);

const [extraPaymentMethod, setExtraPaymentMethod] =
  useState(null);

const [extraShowCardPayment, setExtraShowCardPayment] =
  useState(false);

const [extraManualAmount, setExtraManualAmount] =
  useState("");

const [extraManualProofUrl, setExtraManualProofUrl] =
  useState(null);

const [extraManualUploading, setExtraManualUploading] =
  useState(false);

const [extraManualSubmitting, setExtraManualSubmitting] =
  useState(false);

const [extraManualMessage, setExtraManualMessage] =
  useState("");

const extraAmountDue =
  Number(extraPeopleCount || 0) * 10;

const existingExtraGuests =
  (
    memberGuestData?.participants ||
    []
  ).filter(
    (participant) =>
      participant?.is_free !== true
  );

const existingExtraTotal =
  existingExtraGuests.length * 10;

const existingExtraPaidTotal =
  Math.min(
    existingExtraTotal,
    Number(
      memberGuestData?.paid_total || 0
    )
  );

const existingExtraBalance =
  Math.max(
    0,
    existingExtraTotal -
      existingExtraPaidTotal
  );

  useEffect(() => {
  try {
    setGuestCountry(
      detectCountryISO() || "HT"
    );
  } catch {
    setGuestCountry("HT");
  }
}, []);

  // 🎫 Card receipt confirmation (Access card)
const [cardReceipt, setCardReceipt] = useState({
  loading: false,
  needed: false,
  impressionId: null,
  profileId: null,
});
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

const fetchCardReceiptStatus = async (profileId) => {
  if (!profileId) {
    setCardReceipt({ loading: false, needed: false, impressionId: null, profileId: null });
    return;
  }

  setCardReceipt((p) => ({ ...p, loading: true, profileId }));

  try {
    const { data, error } = await supabase
      .from("student_card_impressions")
      .select("profile_id, card_given, given_at")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error) throw error;

    // ✅ RULE: it disappears ONLY if card_given === true
    const needed = data?.card_given !== true; // if missing row => needed = true

    setCardReceipt({
      loading: false,
      needed,
      impressionId: data?.profile_id || profileId,
      profileId,
    });
  } catch (e) {
    console.error("fetchCardReceiptStatus error:", e);

    // ✅ Even if there's an error, keep it showing (so it doesn’t “disappear” by accident)
    setCardReceipt({
      loading: false,
      needed: true,
      impressionId: profileId,
      profileId,
    });
  }
};


const confirmCardReceived = async () => {
  try {
    if (!cardReceipt.profileId) return;

    const ok = await showConfirm("✅ Confirmer avoir reçu votre carte d’accès ?");
    if (!ok) return;

    const { error } = await supabase
      .from("student_card_impressions")
      .upsert(
        {
          profile_id: cardReceipt.profileId,
          card_given: true,
          given_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    if (error) throw error;

    await showAlert("✅ Merci ! La réception de votre carte a été confirmée.");
    setCardReceipt((p) => ({ ...p, needed: false }));
  } catch (e) {
    console.error("confirmCardReceived error:", e);
    await showAlert("❌ Erreur: impossible de confirmer la réception de la carte.");
  }
};

// 🎫 Load + realtime refresh card receipt requirement for the selected profile
useEffect(() => {
  if (!selectedAttendanceProfileId) return;

  // initial load
  fetchCardReceiptStatus(selectedAttendanceProfileId);

  // realtime updates when admin changes card impression status
  const channel = supabase
    .channel("card-impressions-user-" + selectedAttendanceProfileId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "student_card_impressions",
        filter: `profile_id=eq.${selectedAttendanceProfileId}`,
      },
      () => {
        fetchCardReceiptStatus(selectedAttendanceProfileId);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
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
  .select("id, full_name, signup_type, is_active")
      .eq("id", user.id)
      .maybeSingle();

    // children
    const { data: kids } = await supabase
  .from("profiles_with_unpaid")
  .select("id, full_name, parent_id, is_active")
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

const eventParticipants =
  (attendanceProfiles || []).filter(
    (participant) =>
      participant?.id &&
      participant?.is_active !== false
  );

const presenceIsConfirmed =
  presenceConfirmations.some(
    (row) =>
      row.status === "confirmed"
  );

const presenceIsCancelled =
  presenceConfirmations.length > 0 &&
  presenceConfirmations.every(
    (row) =>
      row.status === "cancelled"
  );

function togglePresenceParticipant(
  participantId
) {
  const id = String(participantId);

  setSelectedParticipants((current) =>
    current.includes(id)
      ? current.filter(
          (currentId) =>
            currentId !== id
        )
      : [...current, id]
  );
}

useEffect(() => {
  if (!user?.id) return;

  const participantIds =
    eventParticipants
      .map((participant) =>
        participant.id
      )
      .filter(Boolean);

  if (!participantIds.length) {
    setPresenceConfirmations([]);
    setSelectedParticipants([]);
    return;
  }

  const fetchPresenceConfirmations =
    async () => {
      setPresenceLoading(true);

      try {
        const { data, error } =
          await supabase
            .from(
              "event_presence_confirmations"
            )
            .select(`
              id,
              event_code,
              event_name,
              event_date,
              participant_profile_id,
              confirmed_by_profile_id,
              status,
              confirmed_at,
              cancelled_at,
              cancellation_reason
            `)
            .eq(
              "event_code",
              EVENT_CODE
            )
            .in(
              "participant_profile_id",
              participantIds
            );

        if (error) throw error;

        const rows = data || [];

        setPresenceConfirmations(
          rows
        );

        setSelectedParticipants(
          rows
            .filter(
              (row) =>
                row.status ===
                "confirmed"
            )
            .map((row) =>
              String(
                row.participant_profile_id
              )
            )
        );
      } catch (error) {
        console.error(
          "Presence confirmations loading error:",
          error
        );

        showAlert?.(
          error?.message ||
            "Impossible de charger les confirmations de présence."
        );
      } finally {
        setPresenceLoading(false);
      }
    };

  fetchPresenceConfirmations();
}, [user?.id, attendanceProfiles]);

async function handleConfirmEventPresence() {
  if (!user?.id) return;

  if (!selectedParticipants.length) {
    showAlert?.(
      "Veuillez sélectionner au moins un participant."
    );
    return;
  }

  try {
    setPresenceSaving(true);

    const participantIds =
      eventParticipants.map(
        (participant) =>
          String(participant.id)
      );

    const selectedIds =
      selectedParticipants.map(String);

    const now =
      new Date().toISOString();

    const rowsToConfirm =
      selectedIds.map(
        (participantId) => ({
          event_code:
            EVENT_CODE,

          event_name:
            EVENT_NAME,

          event_date:
            EVENT_DATE,

          participant_profile_id:
            participantId,

          confirmed_by_profile_id:
            user.id,

          status:
            "confirmed",

          confirmed_at:
            now,

          cancelled_at:
            null,

          cancellation_reason:
            null,
        })
      );

    const {
      error: confirmError,
    } = await supabase
      .from(
        "event_presence_confirmations"
      )
      .upsert(
        rowsToConfirm,
        {
          onConflict:
            "event_code,participant_profile_id",
        }
      );

    if (confirmError) {
      throw confirmError;
    }

    const unselectedIds =
      participantIds.filter(
        (participantId) =>
          !selectedIds.includes(
            participantId
          )
      );

    if (unselectedIds.length) {
      const {
        error: cancelError,
      } = await supabase
        .from(
          "event_presence_confirmations"
        )
        .update({
          status:
            "cancelled",

          cancelled_at:
            now,
        })
        .eq(
          "event_code",
          EVENT_CODE
        )
        .eq(
          "confirmed_by_profile_id",
          user.id
        )
        .in(
          "participant_profile_id",
          unselectedIds
        );

      if (cancelError) {
        throw cancelError;
      }
    }

    const {
      data: refreshed,
      error: refreshError,
    } = await supabase
      .from(
        "event_presence_confirmations"
      )
      .select("*")
      .eq(
        "event_code",
        EVENT_CODE
      )
      .in(
        "participant_profile_id",
        participantIds
      );

    if (refreshError) {
      throw refreshError;
    }

    setPresenceConfirmations(
      refreshed || []
    );

    setSelectedParticipants(
      (refreshed || [])
        .filter(
          (row) =>
            row.status ===
            "confirmed"
        )
        .map((row) =>
          String(
            row.participant_profile_id
          )
        )
    );

    showAlert?.(
      "Votre présence pour le 29 août 2026 a été confirmée."
    );
  } catch (error) {
    console.error(
      "Presence confirmation error:",
      error
    );

    showAlert?.(
      error?.message ||
        "Une erreur est survenue lors de la confirmation."
    );
  } finally {
    setPresenceSaving(false);
  }
}

async function handleDeclineEventPresence() {
  if (!user?.id) return;

  const reason =
    absenceReason.trim();

  if (!reason) {
    showAlert?.(
      "Veuillez indiquer la raison de votre absence."
    );
    return;
  }

  if (!eventParticipants.length) {
    showAlert?.(
      "Aucun participant n’est disponible sur ce compte."
    );
    return;
  }

  try {
    setPresenceSaving(true);

    const now =
      new Date().toISOString();

    const rowsToCancel =
      eventParticipants.map(
        (participant) => ({
          event_code:
            EVENT_CODE,

          event_name:
            EVENT_NAME,

          event_date:
            EVENT_DATE,

          participant_profile_id:
            String(
              participant.id
            ),

          confirmed_by_profile_id:
            user.id,

          status:
            "cancelled",

          confirmed_at:
            null,

          cancelled_at:
            now,

          cancellation_reason:
            reason,
        })
      );

    const {
      error: cancelError,
    } = await supabase
      .from(
        "event_presence_confirmations"
      )
      .upsert(
        rowsToCancel,
        {
          onConflict:
            "event_code,participant_profile_id",
        }
      );

    if (cancelError) {
      throw cancelError;
    }

    const participantIds =
      eventParticipants.map(
        (participant) =>
          String(participant.id)
      );

    const {
      data: refreshed,
      error: refreshError,
    } = await supabase
      .from(
        "event_presence_confirmations"
      )
      .select("*")
      .eq(
        "event_code",
        EVENT_CODE
      )
      .in(
        "participant_profile_id",
        participantIds
      );

    if (refreshError) {
      throw refreshError;
    }

    setPresenceConfirmations(
      refreshed || []
    );

    setSelectedParticipants(
      []
    );

    setShowAbsenceReason(
      false
    );

    setAbsenceReason("");

    showAlert?.(
      "Votre absence pour le 29 août 2026 a été enregistrée."
    );
  } catch (error) {
    console.error(
      "Presence decline error:",
      error
    );

    showAlert?.(
      error?.message ||
        "Une erreur est survenue lors de l’enregistrement de votre absence."
    );
  } finally {
    setPresenceSaving(false);
  }
}

async function loadMemberGuestData() {
  if (!user?.id) return;

  try {
    setMemberGuestLoading(true);

    const { data, error } =
      await supabase.rpc(
        "get_or_create_member_event_guest_registration"
      );

    if (error) throw error;

    setMemberGuestData(
      data || null
    );
  } catch (error) {
    console.error(
      "Member event guest load error:",
      error
    );

    setMemberGuestData(null);
  } finally {
    setMemberGuestLoading(false);
  }
}

useEffect(() => {
  if (!user?.id) return;

  loadMemberGuestData();
}, [user?.id]);

function openFreeGuestModal(student) {
  if (!student?.profile_id) return;

  setSelectedFreeStudent(
    student
  );

  setFreeGuestName(
    student.assigned_guest
      ?.full_name || ""
  );

  setFreeGuestPhone(
    student.assigned_guest
      ?.phone || ""
  );

  setShowFreeGuestModal(true);
}

async function handleSaveFreeGuest() {
  if (
    !selectedFreeStudent
      ?.profile_id
  ) {
    await showAlert(
      "Élève introuvable."
    );
    return;
  }

  const guestName =
    freeGuestName.trim();

  if (!guestName) {
    await showAlert(
      "Veuillez entrer le nom complet de la personne."
    );
    return;
  }

  if (
    !freeGuestPhone ||
    !isValidPhoneNumber(
      freeGuestPhone
    )
  ) {
    await showAlert(
      "Veuillez entrer un numéro de téléphone valide."
    );
    return;
  }

  try {
    setFreeGuestSaving(true);

    const { error } =
      await supabase.rpc(
        "assign_member_event_free_guest",
        {
          p_student_profile_id:
            selectedFreeStudent
              .profile_id,

          p_full_name:
            guestName,

          p_phone:
            freeGuestPhone,
        }
      );

    if (error) throw error;

    await loadMemberGuestData();

    setShowFreeGuestModal(false);
    setSelectedFreeStudent(null);
    setFreeGuestName("");
    setFreeGuestPhone("");

    await showAlert(
      "La personne gratuite a été enregistrée."
    );
  } catch (error) {
    console.error(
      "Free guest save error:",
      error
    );

    await showAlert(
      error?.message ||
        "Impossible d'enregistrer cette personne."
    );
  } finally {
    setFreeGuestSaving(false);
  }
}

async function openExtraGuestModal() {
  try {
    /*
     * NON-STUDENT PARENT CASE
     *
     * The getter can display the parent as a virtual free guest
     * for the first child without having saved that participant yet.
     *
     * Before paid extras are allowed, materialize that free pass.
     */
    const virtualParentSlot =
      memberGuestData?.students?.find(
        (student) =>
          student?.assigned_guest?.virtual === true
      );

    if (
      virtualParentSlot?.profile_id &&
      virtualParentSlot
        ?.assigned_guest
        ?.full_name &&
      virtualParentSlot
        ?.assigned_guest
        ?.phone
    ) {
      const { error } =
        await supabase.rpc(
          "assign_member_event_free_guest",
          {
            p_student_profile_id:
              virtualParentSlot.profile_id,

            p_full_name:
              virtualParentSlot
                .assigned_guest
                .full_name,

            p_phone:
              virtualParentSlot
                .assigned_guest
                .phone,
          }
        );

      if (error) {
        throw error;
      }

      await loadMemberGuestData();
    }

    /*
     * IMPORTANT:
     * These fields represent ONLY NEW people to add.
     *
     * Existing extras are not put back into this array,
     * otherwise add_member_event_extra_guests() would insert
     * them again and create duplicates.
     */
    setExtraPeopleCount(1);

    setExtraParticipants([
      {
        full_name: "",
        phone: "",
      },
    ]);

    setExtraGuestResult(null);
    setExtraPaymentMethod(null);
    setExtraShowCardPayment(false);

    setExtraManualAmount("");
    setExtraManualProofUrl(null);
    setExtraManualMessage("");

    setShowExtraGuestModal(true);
  } catch (error) {
    console.error(
      "Open extra guest modal error:",
      error
    );

    await showAlert(
      error?.message ||
        "Impossible d'ouvrir l'ajout de personnes supplémentaires."
    );
  }
}

function openExistingExtraPayment() {
  if (
    !memberGuestData?.registration_id ||
    !memberGuestData?.invoice_id ||
    existingExtraBalance <= 0
  ) {
    return;
  }

  setExtraGuestResult({
    registration_id:
      memberGuestData.registration_id,

    invoice_id:
      memberGuestData.invoice_id,

    total:
      existingExtraTotal,

    paid_total:
      existingExtraPaidTotal,

    balance:
      existingExtraBalance,
  });

  setExtraManualAmount(
    existingExtraBalance.toFixed(2)
  );

  setExtraPaymentMethod(null);
  setExtraShowCardPayment(false);
  setExtraManualProofUrl(null);
  setExtraManualMessage("");

  setShowExtraGuestModal(true);
}

function closeExtraGuestModal() {
  if (
    extraGuestSaving ||
    extraManualSubmitting ||
    extraManualUploading
  ) {
    return;
  }

  setShowExtraGuestModal(false);
  setExtraGuestResult(null);
  setExtraPaymentMethod(null);
  setExtraShowCardPayment(false);

  setExtraPeopleCount(1);

  setExtraParticipants([
    {
      full_name: "",
      phone: "",
    },
  ]);

  setExtraManualAmount("");
  setExtraManualProofUrl(null);
  setExtraManualMessage("");
}

function handleExtraPeopleCountChange(event) {
  const nextCount =
    Number(event.target.value);

  setExtraPeopleCount(nextCount);

  setExtraParticipants((current) => {
    const next = [];

    for (
      let index = 0;
      index < nextCount;
      index += 1
    ) {
      next.push(
        current[index] || {
          full_name: "",
          phone: "",
        }
      );
    }

    return next;
  });
}

function updateExtraParticipant(
  index,
  field,
  value
) {
  setExtraParticipants((current) =>
    current.map(
      (
        participant,
        participantIndex
      ) =>
        participantIndex === index
          ? {
              ...participant,
              [field]: value,
            }
          : participant
    )
  );
}

async function handleAddExtraGuests() {
  for (
    let index = 0;
    index < extraParticipants.length;
    index += 1
  ) {
    const participant =
      extraParticipants[index];

    if (
      !participant.full_name?.trim()
    ) {
      await showAlert(
        `Veuillez entrer le nom du participant ${
          index + 1
        }.`
      );
      return;
    }

    if (!participant.phone) {
      await showAlert(
        `Veuillez entrer le numéro de téléphone du participant ${
          index + 1
        }. Si cette personne ne possède pas de téléphone, veuillez saisir votre propre numéro.`
      );
      return;
    }

    if (
      !isValidPhoneNumber(
        participant.phone
      )
    ) {
      await showAlert(
        `Veuillez entrer un numéro de téléphone valide pour le participant ${
          index + 1
        }.`
      );
      return;
    }
  }

  try {
    setExtraGuestSaving(true);

    const { data, error } =
      await supabase.rpc(
        "add_member_event_extra_guests",
        {
          p_participants:
            extraParticipants.map(
              (participant) => ({
                full_name:
                  participant.full_name.trim(),

                phone:
                  participant.phone,
              })
            ),
        }
      );

    if (error) throw error;

    setExtraGuestResult(data);

    setExtraManualAmount(
      Number(
        data?.balance || 0
      ).toFixed(2)
    );

    // Refresh free + paid participant data
    await loadMemberGuestData();
  } catch (error) {
    console.error(
      "Extra event guests error:",
      error
    );

    await showAlert(
      error?.message ||
        "Impossible d'ajouter ces personnes."
    );
  } finally {
    setExtraGuestSaving(false);
  }
}

async function handleExtraVisitorProof(file) {
  if (!file) return;

  setExtraManualUploading(true);
  setExtraManualProofUrl(null);

  try {
    const ext =
      file.name.split(".").pop() ||
      "jpg";

    const path =
      `event-visitor-proofs/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

    const { error: uploadError } =
      await supabase.storage
        .from("documents")
        .upload(path, file, {
          upsert: false,
          contentType:
            file.type || undefined,
        });

    if (uploadError) {
      throw uploadError;
    }

    const { data } =
      supabase.storage
        .from("documents")
        .getPublicUrl(path);

    if (!data?.publicUrl) {
      throw new Error(
        "Impossible de récupérer l'URL de la preuve."
      );
    }

    setExtraManualProofUrl(
      data.publicUrl
    );
  } catch (error) {
    console.error(
      "Extra visitor proof error:",
      error
    );

    await showAlert(
      error?.message ||
        "Impossible de téléverser la preuve."
    );
  } finally {
    setExtraManualUploading(false);
  }
}

async function submitExtraManualPayment() {
  if (
    !extraGuestResult
      ?.registration_id
  ) {
    await showAlert(
      "Inscription introuvable."
    );
    return;
  }

  const amount =
    Number(extraManualAmount);

  if (!amount || amount <= 0) {
    await showAlert(
      "Veuillez entrer un montant valide."
    );
    return;
  }

  const balance =
    Number(
      extraGuestResult.balance || 0
    );

  if (amount > balance) {
    await showAlert(
      `Le montant ne peut pas dépasser USD ${balance.toFixed(
        2
      )}.`
    );
    return;
  }

  if (
    extraPaymentMethod ===
      "transfer" &&
    !extraManualProofUrl
  ) {
    await showAlert(
      "Veuillez joindre une preuve de virement."
    );
    return;
  }

  const registrationPhone =
  memberGuestData?.member?.phone;

const registrationEmail =
  memberGuestData?.member?.email;

if (
  !registrationPhone ||
  !registrationEmail
) {
  await showAlert(
    "Impossible de retrouver les coordonnées liées à cette inscription."
  );
  return;
}

/* =========================================================
   CHECK FOR AN EXISTING PENDING PAYMENT
   ========================================================= */

try {
  const {
    data: pendingPayments,
    error: pendingError,
  } = await supabase
    .from("event_visitor_payments")
    .select(`
      id,
      amount,
      method,
      created_at
    `)
    .eq(
      "registration_id",
      extraGuestResult.registration_id
    )
    .eq("approved", false)
    .order("created_at", {
      ascending: false,
    });

  if (pendingError) {
    throw pendingError;
  }

  if (
    pendingPayments &&
    pendingPayments.length > 0
  ) {
    const pendingTotal =
      pendingPayments.reduce(
        (sum, payment) =>
          sum +
          Number(payment.amount || 0),
        0
      );

    const continueAnyway =
      await showConfirm(
        `⚠️ Un paiement de USD ${pendingTotal.toFixed(
          2
        )} est déjà en attente de validation pour cette participation.\n\nVeuillez éviter de soumettre le même paiement deux fois.\n\nSouhaitez-vous quand même effectuer un autre paiement ?`
      );

    if (!continueAnyway) {
      return;
    }
  }
} catch (pendingCheckError) {
  console.error(
    "Pending event payment check error:",
    pendingCheckError
  );

  await showAlert(
    "Impossible de vérifier les paiements en attente. Veuillez réessayer."
  );

  return;
}

try {
    setExtraManualSubmitting(true);
    setExtraManualMessage("");

    const { data, error } =
      await supabase.rpc(
        "submit_event_visitor_payment",
        {
          p_registration_id:
            extraGuestResult
              .registration_id,

          p_phone:
            registrationPhone,

          p_email:
            registrationEmail,

          p_amount:
            amount,

          p_method:
            extraPaymentMethod ===
            "cash"
              ? "cash"
              : "transfer",

          p_proof_url:
            extraManualProofUrl,
        }
      );

    if (error) throw error;

    setExtraManualMessage(
      data?.message ||
        "Votre paiement a été soumis pour validation."
    );

    setExtraManualAmount("");
    setExtraManualProofUrl(null);
    setExtraPaymentMethod(null);

    await loadMemberGuestData();
  } catch (error) {
    console.error(
      "Extra visitor payment error:",
      error
    );

    await showAlert(
      error?.message ||
        "Impossible de soumettre le paiement."
    );
  } finally {
    setExtraManualSubmitting(false);
  }
}


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
    if (!user?.id || !isSchoolMember) return;

    // Fetch influencer role + flag
    const { data: profile, error } = await supabase
  .from("profiles")
  .select("id, role, referral_code, referral_prompt_shown")
  .eq("id", user.id)
  .maybeSingle();

if (error) {
  console.error("❌ Error checking influencer popup:", error.message);
  return;
}

// Club-only users do not have a school profile
if (!profile) return;

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
}, [user?.id, isSchoolMember]);


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


    setHasUnpaid(!!parent?.has_unpaid);

console.log(
  "🧾 has_unpaid for",
  parent?.full_name || user?.full_name || "Unknown user",
  "=",
  !!parent?.has_unpaid
);

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
  if (user?.id && isSchoolMember) {
    fetchAllInvoices();
  }
}, [user?.id, isSchoolMember]);

 
useEffect(() => {
  const fetchUnpaidStatus = async () => {
    if (!user?.id || !isSchoolMember) {
      setHasUnpaid(false);
      return;
    }
    const { data: parent, error } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, has_unpaid")
      .eq("id", user.id)
      .maybeSingle();

    console.log("🧾 fetched profile_with_unpaid:", parent, error);

    setHasUnpaid(!!parent?.has_unpaid);
  };

  fetchUnpaidStatus();
}, [user?.id, isSchoolMember]);




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
  if (activeTab === "overview" && isSchoolMember) {
    refreshOverviewData();
  }
}, [activeTab, isSchoolMember]);

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
<div className="flex flex-col sm:flex-row justify-center md:justify-center items-stretch sm:items-center gap-3 mt-4 md:mt-0 w-full">
  <button
    onClick={() => {
      setActiveTab("profile");
      setShowAddChildForm(true);
      sessionStorage.setItem("userDashboard_showAddChildForm", "true");
    }}
    className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition-all w-full sm:w-auto"
  >
    Ajouter une personne
  </button>

  <button
    onClick={() => {
      setActiveTab("enrollments");
      setOpenClasses(true);
    }}
    className="px-5 py-2 bg-orange-500 text-white font-semibold rounded-lg shadow hover:bg-orange-600 transition-all w-full sm:w-auto"
  >
    S’enregistrer dans une classe
  </button>

  <button
    onClick={() => {
      setInvoiceSubTab("paiements");
      setActiveTab("invoices");
    }}
    className="px-5 py-2 bg-green-600 text-white font-semibold rounded-lg shadow hover:bg-green-700 transition-all w-full sm:w-auto"
  >
    Effectuer un paiement
  </button>
</div>
{/* 🎓 CLOTURE 2026 */}
<div className="mt-5 bg-white rounded-2xl shadow border border-orange-100 overflow-hidden">
  <div className="bg-gradient-to-r from-orange-500 to-blue-700 px-5 py-4 text-white">
    <h2 className="text-lg font-bold">
      Cérémonie de clôture — 29 août 2026
    </h2>

    <p className="text-sm text-white/90 mt-1">
      Remise de certificats et mini-compétition à partir de 9 h 00.
    </p>
  </div>

  <div className="p-5 space-y-4">
    <p className="text-sm text-gray-700">
      Tous les élèves ayant participé aux activités
      d’A’QUA D’OR entre septembre 2025 et août 2026
      sont invités à confirmer leur présence.
    </p>

    {presenceLoading ? (
      <p className="text-sm text-gray-500">
        Chargement des confirmations…
      </p>
    ) : eventParticipants.length === 0 ? (
      <p className="text-sm text-gray-500 italic">
        Aucun participant actif trouvé sur ce compte.
      </p>
    ) : (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">
          Sélectionnez les personnes qui seront présentes :
        </p>

        {eventParticipants.map(
          (participant) => {
            const participantId =
              String(
                participant.id
              );

            return (
              <label
                key={
                  participant.id
                }
                className="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedParticipants.includes(
                    participantId
                  )}
                  onChange={() =>
                    togglePresenceParticipant(
                      participantId
                    )
                  }
                  className="w-5 h-5 rounded text-blue-600"
                />

                <span className="font-medium text-gray-800">
                  {
                    participant.full_name
                  }
                </span>
              </label>
            );
          }
        )}
      </div>
    )}

    <div className="flex flex-col sm:flex-row gap-3">
      <button
        type="button"
        onClick={
          handleConfirmEventPresence
        }
        disabled={
          presenceLoading ||
          presenceSaving ||
          presenceIsConfirmed ||
          eventParticipants.length ===
            0 ||
          selectedParticipants.length ===
            0
        }
        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {presenceSaving
          ? "Enregistrement…"
          : presenceIsConfirmed
          ? "Présence confirmée ✓"
          : "Je confirme ma présence"}
      </button>

      <button
        type="button"
        onClick={() =>
          setShowAbsenceReason(
            true
          )
        }
        disabled={
          presenceLoading ||
          presenceSaving ||
          presenceIsCancelled ||
          eventParticipants.length ===
            0
        }
        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {presenceIsCancelled
          ? "Absence enregistrée ✓"
          : "Je ne serai pas présent"}
      </button>
        </div>

    {/* FREE GUESTS */}
    <div className="border-t border-gray-200 pt-5">
      <div className="mb-4">
        <h3 className="text-base font-bold text-gray-800">
          Personnes gratuites
        </h3>

        <p className="mt-1 text-sm text-gray-600">
          Chaque élève actif bénéficie d'une personne gratuite
          pour la cérémonie.
        </p>
      </div>

      {memberGuestLoading ? (
        <p className="text-sm text-gray-500">
          Chargement des invitations…
        </p>
      ) : !memberGuestData?.students?.length ? (
        <p className="text-sm italic text-gray-500">
          Aucune invitation gratuite disponible.
        </p>
      ) : (
        <div className="space-y-3">
          {memberGuestData.students.map(
            (student) => {
                      const isAutoFilledParent =
          !memberGuestData.member_is_student &&
          memberGuestData.auto_filled_parent_profile_id ===
            student.profile_id &&
          !!student.assigned_guest &&
          student.assigned_guest.full_name?.trim() ===
            memberGuestData.member?.full_name?.trim() &&
          student.assigned_guest.phone ===
            memberGuestData.member?.phone;

              return (
                <div
                  key={
                    student.profile_id
                  }
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Invitation gratuite de
                      </p>

                      <p className="font-bold text-gray-800">
                        {
                          student.full_name
                        }
                      </p>

                      {student.assigned_guest ? (
                        <div className="mt-2">
                          {isAutoFilledParent && (
                            <p className="mb-2 text-xs font-medium text-blue-700">
                              Le titulaire du compte a été inscrit automatiquement
                              pour cette invitation gratuite.
                            </p>
                          )}

                          <p className="text-sm text-green-700">
                            ✓{" "}
                            <span className="font-semibold">
                              {
                                student
                                  .assigned_guest
                                  .full_name
                              }
                            </span>
                          </p>

                          <p className="text-xs text-gray-500">
                            {
                              student
                                .assigned_guest
                                .phone
                            }
                          </p>

                          {isAutoFilledParent && (
                            <button
                              type="button"
                              onClick={() =>
                                openFreeGuestModal(
                                  student
                                )
                              }
                              className="mt-2 text-sm font-semibold text-red-600 underline hover:text-red-700"
                            >
                              Je ne pourrai pas être présent
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-orange-600">
                          Aucune personne assignée
                        </p>
                      )}
                    </div>

                    {!isAutoFilledParent && (
                      <button
                        type="button"
                        onClick={() =>
                          openFreeGuestModal(
                            student
                          )
                        }
                        className={`w-full sm:w-auto rounded-xl px-4 py-2.5 font-semibold shadow transition ${
                          student.assigned_guest
                            ? "border border-blue-600 bg-white text-blue-700 hover:bg-blue-50"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                      >
                        {student.assigned_guest
                          ? "Modifier la personne"
                          : "Ajouter ma personne gratuite"}
                      </button>
                    )}
                  </div>
                </div>
              );
            }
                    )}

          {existingExtraGuests.length > 0 && (
  <div className="mt-5 border-t border-gray-200 pt-5">
    <div className="mb-3">
      <h3 className="font-bold text-gray-800">
        Personnes supplémentaires
      </h3>

      <p className="mt-1 text-sm text-gray-500">
        Personnes ajoutées à votre participation au tarif de USD 10.00
        par personne.
      </p>
    </div>

    <div className="space-y-3">
      {existingExtraGuests.map(
        (participant, index) => {
          const paidForThisPerson =
            Math.max(
              0,
              Math.min(
                10,
                existingExtraPaidTotal -
                  index * 10
              )
            );

          const isPaid =
            paidForThisPerson >= 10;

          const isPartial =
            paidForThisPerson > 0 &&
            paidForThisPerson < 10;

          return (
            <div
              key={
                participant.id ||
                index
              }
              className="rounded-xl border border-purple-200 bg-purple-50 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">
                    Personne supplémentaire
                  </p>

                  <p className="mt-1 font-bold text-gray-800">
                    {
                      participant.full_name
                    }
                  </p>

                  <p className="text-xs text-gray-500">
                    {
                      participant.phone
                    }
                  </p>

                  <p className="mt-1 text-xs font-semibold text-blue-700">
                    Invité de :{" "}
                    {memberGuestData?.member?.full_name ||
                      "Titulaire du compte"}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="font-semibold text-gray-800">
                    USD 10.00
                  </p>

                  {isPaid ? (
                    <span className="mt-1 inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                      Payé
                    </span>
                  ) : isPartial ? (
                    <span className="mt-1 inline-flex rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-700">
                      Partiel
                    </span>
                  ) : (
                    <span className="mt-1 inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                      Non payé
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        }
      )}
    </div>

    {existingExtraBalance > 0 && (
  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
    <div className="flex items-center justify-between gap-3 text-sm text-red-700">
      <span className="font-semibold">
        Solde à payer
      </span>

      <strong>
        USD{" "}
        {existingExtraBalance.toFixed(
          2
        )}
      </strong>
    </div>

    <button
      type="button"
      onClick={
        openExistingExtraPayment
      }
      className="mt-3 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white shadow hover:bg-green-700 sm:w-auto"
    >
      💳 Effectuer un paiement
    </button>
  </div>
)}
  </div>
)}

          {memberGuestData?.students?.length > 0 &&
            memberGuestData.students.every(
              (student) =>
                !!student.assigned_guest
            ) && (
              <div className="mt-5 border-t border-gray-200 pt-5">
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                  <p className="font-semibold text-purple-900">
                    Vous souhaitez inviter d'autres personnes ?
                  </p>

                  <p className="mt-1 text-sm text-purple-700">
                    Une fois vos invitations gratuites utilisées,
                    vous pouvez ajouter des personnes supplémentaires
                    au tarif de USD 10.00 par personne.
                  </p>

                  <p className="mt-2 text-xs font-semibold text-red-600">
                    ⚠️ Les frais de participation sont non remboursables.
                  </p>

                  <button
                    type="button"
                    onClick={
                      openExtraGuestModal
                    }
                    className="mt-4 w-full rounded-xl bg-purple-600 px-4 py-3 font-semibold text-white hover:bg-purple-700 sm:w-auto"
                  >
                    + Ajouter d'autres personnes
                  </button>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  </div>
</div>

{showAbsenceReason && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
      <h3 className="text-lg font-bold text-gray-800">
        Motif de votre absence
      </h3>

      <p className="text-sm text-gray-600 mt-2">
        Veuillez nous indiquer brièvement pourquoi vous ne pourrez
        pas être présent le 29 août 2026.
      </p>

      <textarea
        value={absenceReason}
        onChange={(e) =>
          setAbsenceReason(
            e.target.value
          )
        }
        rows={4}
        placeholder="Expliquez brièvement la raison de votre absence…"
        className="w-full mt-4 border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
      />

      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={() => {
            setShowAbsenceReason(
              false
            );
            setAbsenceReason("");
          }}
          disabled={
            presenceSaving
          }
          className="flex-1 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          Retour
        </button>

        <button
          type="button"
          onClick={
            handleDeclineEventPresence
          }
          disabled={
            presenceSaving ||
            !absenceReason.trim()
          }
          className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-60"
        >
          {presenceSaving
            ? "Enregistrement…"
            : "Confirmer mon absence"}
        </button>
      </div>
    </div>
  </div>
)}

{showFreeGuestModal && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {selectedFreeStudent
              ?.assigned_guest
              ? "Modifier la personne gratuite"
              : "Ajouter ma personne gratuite"}
          </h3>

          <p className="mt-1 text-sm text-gray-500">
            Invitation gratuite liée à{" "}
            <strong>
              {
                selectedFreeStudent
                  ?.full_name
              }
            </strong>
          </p>
        </div>

        <button
          type="button"
          disabled={freeGuestSaving}
          onClick={() => {
            setShowFreeGuestModal(
              false
            );
            setSelectedFreeStudent(
              null
            );
            setFreeGuestName("");
            setFreeGuestPhone("");
          }}
          className="text-2xl text-gray-400 hover:text-gray-700"
        >
          ×
        </button>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">
            Nom complet *
          </span>

          <input
            type="text"
            value={freeGuestName}
            onChange={(e) =>
              setFreeGuestName(
                e.target.value
              )
            }
            className="input w-full"
            placeholder="Nom et prénom"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">
            Téléphone *
          </span>

          <PhoneInput
            international
            defaultCountry={
              guestCountry
            }
            countryCallingCodeEditable={
              false
            }
            value={freeGuestPhone}
            onChange={(value) => {
              setFreeGuestPhone(
                value || ""
              );
            }}
            placeholder="Numéro de téléphone"
          />

          <p className="mt-2 text-xs text-gray-500">
            Si cette personne ne possède pas de téléphone,
            veuillez saisir votre propre numéro.
          </p>
        </label>

        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Cette personne utilise l'invitation gratuite de{" "}
          <strong>
            {
              selectedFreeStudent
                ?.full_name
            }
          </strong>
          . Aucun paiement n'est requis.
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            disabled={
              freeGuestSaving
            }
            onClick={() => {
              setShowFreeGuestModal(
                false
              );
              setSelectedFreeStudent(
                null
              );
              setFreeGuestName("");
              setFreeGuestPhone("");
            }}
            className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-200"
          >
            Annuler
          </button>

          <button
            type="button"
            disabled={
              freeGuestSaving
            }
            onClick={
              handleSaveFreeGuest
            }
            className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {freeGuestSaving
              ? "Enregistrement…"
              : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
</div>

{showExtraGuestModal && (
  <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 px-4 py-6">
    <div className="flex min-h-full items-start justify-center sm:items-center">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* HEADER */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Ajouter d'autres personnes
            </h2>

            <p className="text-xs text-gray-500">
              Cérémonie de clôture • 29 août 2026
            </p>
          </div>

          <button
            type="button"
            onClick={
              closeExtraGuestModal
            }
            className="rounded-full bg-gray-100 px-3 py-1.5 text-lg text-gray-600 hover:bg-gray-200"
          >
            ×
          </button>
        </div>

        {!extraGuestResult ? (
          <div className="space-y-6 p-5 sm:p-6">

            {existingExtraGuests.length > 0 && (
  <section>
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">
            Personnes déjà ajoutées
          </h3>

          <p className="mt-1 text-xs text-gray-500">
            Ces personnes sont déjà enregistrées.
            Elles ne seront pas ajoutées une deuxième fois.
          </p>
        </div>

        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700">
          {existingExtraGuests.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {existingExtraGuests.map(
          (participant, index) => {
            /*
             * Payments are currently stored at INVOICE level,
             * not participant level.
             *
             * We allocate payments oldest-first at USD 10/person
             * for display purposes.
             */
            const paidForThisPerson =
              Math.max(
                0,
                Math.min(
                  10,
                  existingExtraPaidTotal -
                    index * 10
                )
              );

            const isPaid =
              paidForThisPerson >= 10;

            const isPartial =
              paidForThisPerson > 0 &&
              paidForThisPerson < 10;

            return (
              <div
                key={
                  participant.id ||
                  index
                }
                className="rounded-xl border bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {
                        participant.full_name
                      }
                    </p>

                    <p className="text-sm text-gray-500">
                      {participant.phone}
                    </p>
                  </div>

                  {isPaid ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                      Payé
                    </span>
                  ) : isPartial ? (
                    <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-700">
                      Partiel
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                      Non payé
                    </span>
                  )}
                </div>

                <div className="mt-3 flex justify-between border-t pt-2 text-xs">
                  <span className="text-gray-500">
                    Frais
                  </span>

                  <strong>
                    USD 10.00
                  </strong>
                </div>
              </div>
            );
          }
        )}
      </div>

      {existingExtraBalance > 0 && (
        <div className="mt-4 flex justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>
            Solde des personnes déjà ajoutées
          </span>

          <strong>
            USD{" "}
            {existingExtraBalance.toFixed(
              2
            )}
          </strong>
        </div>
      )}
    </div>
  </section>
)}

            {/* COUNT */}
            <section>
              <h3 className="font-bold text-gray-900">
                Personnes supplémentaires
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Ces personnes s'ajouteront à vos invitations gratuites.
              </p>

              <label className="mt-4 block">
                <span className="mb-2 block font-semibold text-gray-700">
                  Nombre de personnes *
                </span>

                <select
                  value={
                    extraPeopleCount
                  }
                  onChange={
                    handleExtraPeopleCountChange
                  }
                  className="input w-full"
                >
                  {Array.from(
                    { length: 10 },
                    (_, index) =>
                      index + 1
                  ).map((count) => (
                    <option
                      key={count}
                      value={count}
                    >
                      {count}{" "}
                      personne
                      {count > 1
                        ? "s"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>

              {/* PRICE */}
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex justify-between text-sm">
                  <span>
                    Tarif par personne supplémentaire
                  </span>

                  <strong>
                    USD 10.00
                  </strong>
                </div>

                <div className="mt-2 flex justify-between border-t border-blue-200 pt-2">
                  <span className="font-semibold">
  Nouveaux frais
</span>

                  <strong className="text-lg text-blue-700">
                    USD{" "}
                    {extraAmountDue.toFixed(
                      2
                    )}
                  </strong>
                </div>

                <p className="mt-2 text-xs text-blue-700">
                  Des frais de traitement par carte seront affichés
                  séparément avant le paiement.
                </p>

                <p className="mt-2 text-xs font-semibold text-red-600">
                  ⚠️ Les frais de participation sont non remboursables.
                </p>
              </div>
            </section>

            {/* PARTICIPANTS */}
            <section className="border-t pt-5">
              <h3 className="font-bold text-gray-900">
                Participants
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Indiquez le nom et le téléphone de chaque personne.
              </p>

              <div className="mt-4 space-y-4">
                {extraParticipants.map(
                  (
                    participant,
                    index
                  ) => (
                    <div
                      key={index}
                      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <p className="mb-3 font-semibold text-gray-900">
                        Participant{" "}
                        {index + 1}
                      </p>

                      <div className="space-y-3">
                        <label className="block">
                          <span className="mb-1 block text-sm text-gray-700">
                            Nom complet *
                          </span>

                          <input
                            type="text"
                            value={
                              participant.full_name
                            }
                            onChange={(
                              e
                            ) =>
                              updateExtraParticipant(
                                index,
                                "full_name",
                                e.target
                                  .value
                              )
                            }
                            className="input w-full"
                            required
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm text-gray-700">
                            Téléphone *
                          </span>

                          <PhoneInput
                            international
                            defaultCountry={
                              guestCountry
                            }
                            countryCallingCodeEditable={
                              false
                            }
                            value={
                              participant.phone
                            }
                            onChange={(
                              value
                            ) =>
                              updateExtraParticipant(
                                index,
                                "phone",
                                value ||
                                  ""
                              )
                            }
                            placeholder="Numéro de téléphone"
                          />

                          <p className="mt-2 text-xs text-gray-500">
                            Si cette personne ne possède pas de téléphone,
                            veuillez saisir votre propre numéro.
                          </p>
                        </label>
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={
                  closeExtraGuestModal
                }
                disabled={
                  extraGuestSaving
                }
                className="flex-1 rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={
                  handleAddExtraGuests
                }
                disabled={
                  extraGuestSaving
                }
                className="flex-1 rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
              >
                {extraGuestSaving
                  ? "Enregistrement..."
                  : "Ajouter les personnes"}
              </button>
            </div>
          </div>
        ) : (
          /* ==========================================
             AFTER PEOPLE WERE ADDED — PAYMENT
          ========================================== */
          <div className="p-5 sm:p-6">

            <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
              <div className="text-4xl">
                ✅
              </div>

              <h3 className="mt-3 text-xl font-bold text-green-800">
                Personnes ajoutées
              </h3>

              <p className="mt-2 text-sm text-green-700">
                Les personnes supplémentaires ont bien été ajoutées
                à votre participation.
              </p>
            </div>

            {existingExtraGuests.length > 0 && (
  <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h4 className="font-bold text-gray-900">
          Personnes supplémentaires enregistrées
        </h4>

        <p className="mt-1 text-xs text-gray-500">
          Toutes les personnes supplémentaires liées à votre participation.
        </p>
      </div>

      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700">
        {existingExtraGuests.length}
      </span>
    </div>

    <div className="mt-4 space-y-3">
      {existingExtraGuests.map(
        (participant, index) => {
          const paidForThisPerson =
            Math.max(
              0,
              Math.min(
                10,
                existingExtraPaidTotal -
                  index * 10
              )
            );

          const isPaid =
            paidForThisPerson >= 10;

          const isPartial =
            paidForThisPerson > 0 &&
            paidForThisPerson < 10;

          return (
            <div
              key={
                participant.id ||
                index
              }
              className="rounded-xl border bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    {
                      participant.full_name
                    }
                  </p>

                  <p className="text-sm text-gray-500">
                    {participant.phone}
                  </p>
                </div>

                {isPaid ? (
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                    Payé
                  </span>
                ) : isPartial ? (
                  <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-700">
                    Partiel
                  </span>
                ) : (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                    Non payé
                  </span>
                )}
              </div>

              <div className="mt-3 flex justify-between border-t pt-2 text-xs">
                <span className="text-gray-500">
                  Frais
                </span>

                <strong>
                  USD 10.00
                </strong>
              </div>
            </div>
          );
        }
      )}
    </div>
  </div>
)}

            <div className="mt-5 rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between py-1 text-sm">
                <span className="text-gray-500">
                  Total facture
                </span>

                <strong>
                  USD{" "}
                  {Number(
                    extraGuestResult.total ||
                      0
                  ).toFixed(2)}
                </strong>
              </div>

              <div className="flex justify-between py-1 text-sm">
                <span className="text-gray-500">
                  Déjà payé
                </span>

                <strong>
                  USD{" "}
                  {Number(
                    extraGuestResult.paid_total ||
                      0
                  ).toFixed(2)}
                </strong>
              </div>

              <div className="mt-2 flex justify-between border-t pt-3">
                <span className="font-bold">
                  Montant à payer
                </span>

                <strong className="text-lg text-blue-700">
                  USD{" "}
                  {Number(
                    extraGuestResult.balance ||
                      0
                  ).toFixed(2)}
                </strong>
              </div>

              <p className="mt-3 text-xs font-semibold text-red-600">
                ⚠️ Les frais de participation sont non remboursables.
              </p>
            </div>

            {!extraShowCardPayment ? (
              <div className="mt-5 space-y-3">

                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="mb-3 text-sm font-semibold text-gray-800">
                    Choisissez votre mode de paiement
                  </p>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => {
                        setExtraPaymentMethod(
                          "card"
                        );
                        setExtraShowCardPayment(
                          true
                        );
                      }}
                      className="rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      💳 Carte
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setExtraPaymentMethod(
                          "cash"
                        );
                        setExtraManualAmount(
                          Number(
                            extraGuestResult.balance ||
                              0
                          ).toFixed(2)
                        );
                        setExtraManualProofUrl(
                          null
                        );
                        setExtraManualMessage(
                          ""
                        );
                      }}
                      className="rounded-xl border border-green-500 px-3 py-3 text-sm font-semibold text-green-700 hover:bg-green-50"
                    >
                      💵 Espèces
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setExtraPaymentMethod(
                          "transfer"
                        );
                        setExtraManualAmount(
                          Number(
                            extraGuestResult.balance ||
                              0
                          ).toFixed(2)
                        );
                        setExtraManualProofUrl(
                          null
                        );
                        setExtraManualMessage(
                          ""
                        );
                      }}
                      className="rounded-xl border border-purple-500 px-3 py-3 text-sm font-semibold text-purple-700 hover:bg-purple-50"
                    >
                      🏦 Virement
                    </button>
                  </div>
                </div>

                {extraPaymentMethod ===
                  "cash" && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    <p className="font-semibold">
                      Paiement en espèces
                    </p>

                    <p className="mt-1">
                      Le paiement restera en attente jusqu'à sa
                      validation par notre équipe.
                    </p>

                    <label className="mt-4 block">
                      <span className="mb-1 block font-semibold">
                        Montant (USD)
                      </span>

                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={
                          extraManualAmount
                        }
                        onChange={(e) =>
                          setExtraManualAmount(
                            e.target.value
                          )
                        }
                        className="input w-full bg-white"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={
                        extraManualSubmitting
                      }
                      onClick={
                        submitExtraManualPayment
                      }
                      className="mt-4 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {extraManualSubmitting
                        ? "Soumission..."
                        : "Soumettre le paiement"}
                    </button>
                  </div>
                )}

                {extraPaymentMethod ===
                  "transfer" && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
                    <p className="font-semibold">
                      Paiement par virement
                    </p>

                    <label className="mt-4 block">
                      <span className="mb-1 block font-semibold">
                        Montant du virement (USD)
                      </span>

                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={
                          extraManualAmount
                        }
                        onChange={(e) =>
                          setExtraManualAmount(
                            e.target.value
                          )
                        }
                        className="input w-full bg-white"
                      />
                    </label>

                    <div className="mt-4">
                      <label className="block font-semibold">
                        Preuve du virement
                      </label>

                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) =>
                          handleExtraVisitorProof(
                            e.target
                              .files?.[0]
                          )
                        }
                        className="mt-2 block w-full text-sm"
                      />

                      {extraManualUploading && (
                        <p className="mt-2 text-xs">
                          Téléversement...
                        </p>
                      )}

                      {extraManualProofUrl && (
                        <p className="mt-2 font-semibold text-green-700">
                          ✓ Preuve téléversée
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={
                        extraManualSubmitting ||
                        extraManualUploading
                      }
                      onClick={
                        submitExtraManualPayment
                      }
                      className="mt-4 w-full rounded-xl bg-purple-600 px-4 py-3 font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      {extraManualSubmitting
                        ? "Soumission..."
                        : "Soumettre le virement"}
                    </button>
                  </div>
                )}

                {extraManualMessage && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800">
                    {
                      extraManualMessage
                    }
                  </div>
                )}

                <button
                  type="button"
                  onClick={
                    closeExtraGuestModal
                  }
                  className="w-full rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Payer plus tard / Fermer
                </button>
              </div>
            ) : (
              <div className="mt-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-gray-900">
                      Paiement par carte
                    </h4>

                    <p className="text-xs text-gray-500">
                      Les frais de traitement seront affichés avant
                      la confirmation du paiement.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setExtraShowCardPayment(
                        false
                      );
                      setExtraPaymentMethod(
                        null
                      );
                    }}
                    className="text-sm font-semibold text-blue-600"
                  >
                    Retour
                  </button>
                </div>

                <PaymentPage
                  invoiceId={
                    extraGuestResult
                      .invoice_id
                  }
                  user={user}
                  email={
                    memberGuestData
                      ?.member?.email ||
                    user?.email ||
                    null
                  }
                  invoiceType="event_visitor"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
)}

{/* === FORM PLACEHOLDER (optional — appears only when profile tab is active) === */}
{activeTab === "profile" && (
  <div className="mt-4 bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
    <h3 className="text-lg font-semibold mb-3">Ajouter une personne</h3>
    <UserForm parentId={user.id} />
  </div>
)}


      

      {/* === Animated Balance + Pending Commissions === */}
<div className="grid grid-cols-1 sm:grid-cols-1 gap-6">
  <div className={`grid grid-cols-1 sm:grid-cols-2 ${cardReceipt.needed ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-6`}>
    {/* 🎫 Card receipt confirmation — shown only if required */}
{cardReceipt.needed && (
  <motion.div
    className="relative p-4 bg-white shadow rounded-2xl border border-gray-100 transition-all"
    whileHover={{ scale: 1.03, y: -3 }}
  >
    <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-t-2xl"></div>

    <h3 className="text-center text-sm font-semibold text-gray-500">
      Carte d’accès
    </h3>

    <p className="text-center text-base font-semibold text-gray-800 mt-3">
      J’ai reçu ma carte d’accès
    </p>

    <p className="text-center text-xs text-gray-500 mt-2">
      Merci de confirmer la réception afin de finaliser votre dossier.
    </p>

    <div className="mt-4 flex justify-center">
      <button
        onClick={confirmCardReceived}
        disabled={cardReceipt.loading}
        className={`px-4 py-2 rounded-lg text-white font-semibold shadow transition ${
          cardReceipt.loading ? "bg-gray-400" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        {cardReceipt.loading ? "..." : "Oui, confirmer"}
      </button>
    </div>
  </motion.div>
)}
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
  return (
    <ClubMembershipInvoices
      clubProfileId={clubProfileId}
      initialTab={invoiceSubTab}
    />
  );

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
  onClick={() => {
  goToTab(isSchoolMember ? "overview" : "club-overview");

  setTimeout(() => {
    dashboardContentRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, 100);
}}
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
<main
  ref={dashboardContentRef}
  className="flex-1 pt-20 md:pt-6 px-4 md:p-6 overflow-y-auto"
>
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
