  // src/pages/teacher/TeacherDashboard.jsx
  import { useEffect, useMemo, useState } from "react";
  import { supabase } from "../../lib/supabaseClient";
  import { useNavigate } from "react-router-dom";
  import { motion } from "framer-motion";
  import {
    FaChartBar,
    FaMoneyBillWave,
    FaUserCheck,
    FaClipboardList,
    FaSignOutAlt,
    FaBell,
    FaShoppingBag,
  } from "react-icons/fa";

  import { formatCurrencyUSD, formatCurrencyHTG, formatDateFrSafe } from "../../lib/dateUtils";
  import CalendarView from "../../components/CalendarView";
  import useConfirmLogoutOnBack from "../../hooks/useConfirmLogoutOnBack";



  // === Reused blocks from existing dashboards ===
  // Commissions stack from User Dashboard
  import UserCommissions from "../user/UserCommissions";
  import UserCommissionsRequests from "../user/UserCommissionsRequests";
  import UserBoutique from "../user/UserBoutique"; // for "use in boutique" flow :contentReference[oaicite:3]{index=3}
  // Presence manager from Admin Dashboard
  import AdminAttendance from "../admin/AdminAttendance";                 // :contentReference[oaicite:4]{index=4}
  // Bulletins stack from Admin Dashboard
  import AdminBulletinsetFiches from "../admin/AdminBulletinsetFiches";   // List + download/print  :contentReference[oaicite:5]{index=5}
  import AdminBulletinForm from "../admin/AdminBulletinForm";             // Create/edit a bulletin   :contentReference[oaicite:6]{index=6}
  import AdminFicheTechniques from "../admin/AdminFicheTechniques";       // Fiche technique manager :contentReference[oaicite:7]{index=7}

  export default function TeacherDashboard() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState("overview"); // overview | commissions | presence | bulletins
    const [bulletinSubTab, setBulletinSubTab] = useState("list"); // list | form | fiches
    const [profile, setProfile] = useState(null);
    const [role, setRole] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
    useConfirmLogoutOnBack((unlock) => {
  setShowSignOutConfirm(true);

  const original = handleLogout;

  const wrappedLogout = async () => {
    await original();
    unlock();
  };

  window.__teacherLogoutConfirm = wrappedLogout;
});



    // commissions metrics
    const [commissionTotal, setCommissionTotal] = useState(0);
    const [pendingCommission, setPendingCommission] = useState(0);
    const [commissionRequests, setCommissionRequests] = useState([]);
    

    // boutique panel toggle
    const [openBoutique, setOpenBoutique] = useState(false);

    const [sidebarOpen, setSidebarOpen] = useState(false);

  const isMobile = () => window.innerWidth < 768;

  const goToTab = (tab) => {
    setActiveTab(tab);
    if (isMobile()) setSidebarOpen(false);
  };



    // Load commissions + requests (same data model used in user dashboard) :contentReference[oaicite:8]{index=8}
    useEffect(() => {
      if (!profile?.id) return;
      (async () => {
        // totals
        const { data: comms } = await supabase
          .from("commissions")
          .select("amount, remaining_amount")
          .eq("referrer_user_id", profile.id);
        const total = (comms || []).reduce((s, c) => s + Number(c.amount || 0), 0);
        const pending = (comms || []).reduce(
          (s, c) => s + Number(c.remaining_amount || 0),
          0
        );
        setCommissionTotal(total);
        setPendingCommission(pending);

        // latest requests
        const { data: reqs } = await supabase
          .from("commission_requests")
          .select("*")
          .eq("user_id", profile.id)
          .order("requested_at", { ascending: false })
          .limit(10);
        setCommissionRequests(reqs || []);
      })();
    }, [profile?.id]);

    const handleRequest = async (type) => {
      if (!profile?.id || pendingCommission <= 0) return;
      const { error } = await supabase.from("commission_requests").insert({
        user_id: profile.id,
        amount: pendingCommission,
        status: "pending",
        request_type: type, // "payout" | "purchase"
      });
      if (!error) {
        const { data: reqs } = await supabase
          .from("commission_requests")
          .select("*")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(10);
        setCommissionRequests(reqs || []);
        alert(
          type === "payout"
            ? "Demande de paiement envoyée !"
            : "Demande d'achat envoyée !"
        );
      }
    };

    const [salaryDue, setSalaryDue] = useState(0);
  const [salaryMonth, setSalaryMonth] = useState("");

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      // Compute the current month label EXACTLY like SQL: "Month YYYY" (English, capitalized)
      const now = new Date();
      const formattedPeriod = now.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      });
      setSalaryMonth(formattedPeriod);

      // Fetch the salary for this month
      const { data, error } = await supabase
        .from("admin_salaries")
        .select("net_salary")
        .eq("profile_id", profile.id)
        .eq("period", formattedPeriod) // exact match instead of ilike
        .maybeSingle();

      if (error) {
        console.error("Erreur lors du chargement du salaire:", error);
        setSalaryDue(0);
        return;
      }

      setSalaryDue(data?.net_salary || 0);
    })();
  }, [profile?.id]);



    // Same assistant-style restriction: hide templates & admin-only stuff for teachers
    // (In AdminDashboard you hide items like templates/reports for assistants) :contentReference[oaicite:9]{index=9}
    const bulletinsLockedLikeAssistant = true;

    const Overview = () => (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">
            Bienvenue, {profile?.full_name || "Enseignant(e)"}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            className="p-6 bg-white rounded-2xl border border-gray-100 shadow hover:shadow-lg transition-all cursor-pointer"
            whileHover={{ scale: 1.03, y: -3 }}
            onClick={() => setActiveTab("commissions")}
          >
            <p className="text-sm text-gray-500">Total des commissions</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {formatCurrencyUSD(commissionTotal)}
            </p>
          </motion.div>

          <motion.div
            className="p-6 bg-white rounded-2xl border border-gray-100 shadow hover:shadow-lg transition-all cursor-pointer"
            whileHover={{ scale: 1.03, y: -3 }}
            onClick={() => setActiveTab("commissions")}
          >
            <p className="text-sm text-gray-500">En attente</p>
            <p className="text-3xl font-bold text-orange-500 mt-2">
              {formatCurrencyUSD(pendingCommission)}
            </p>
          </motion.div>

          <motion.div
            className="p-6 bg-white rounded-2xl border border-gray-100 shadow hover:shadow-lg transition-all cursor-pointer"
            whileHover={{ scale: 1.03, y: -3 }}
            onClick={() => setActiveTab("presence")}
          >
            <p className="text-sm text-gray-500">Gestion de présence</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">🗓️</p>
          </motion.div>
          <motion.div
    className="p-6 bg-white rounded-2xl border border-gray-100 shadow hover:shadow-lg transition-all"
    whileHover={{ scale: 1.03, y: -3 }}
  >
    <p className="text-sm text-gray-500">Salaire à recevoir</p>
    <p className="text-3xl font-bold text-purple-600 mt-2">
      {formatCurrencyHTG(salaryDue)}
    </p>
    <p className="text-sm text-gray-500 mt-1">
      Mois&nbsp;: <span className="font-semibold">{salaryMonth}</span>
    </p>
  </motion.div>
  </div>
{/* === CALENDAR (NEW) === */}
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        📅 Calendrier des cours
      </h3>

      <CalendarView mode="club" />
    </div>
        
      </div>
    );


    const Presence = () => (
      <div className="p-1">
        <AdminAttendance />
      </div>
    );

    const Bulletins = () => (
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-bold">Bulletins & Fiches</h2>

        {/* Assistant-like restrictions: templates & some reports hidden; these three are allowed */}
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => setBulletinSubTab("list")}
            className={`px-3 py-1 rounded-t ${
              bulletinSubTab === "list" ? "bg-aquaBlue text-white" : "bg-gray-200"
            }`}
          >
            Liste bulletins & fiches
          </button>
          <button
            onClick={() => setBulletinSubTab("form")}
            className={`px-3 py-1 rounded-t ${
              bulletinSubTab === "form" ? "bg-aquaBlue text-white" : "bg-gray-200"
            }`}
          >
            Bulletin – Formulaire
          </button>
          <button
            onClick={() => setBulletinSubTab("fiches")}
            className={`px-3 py-1 rounded-t ${
              bulletinSubTab === "fiches" ? "bg-aquaBlue text-white" : "bg-gray-200"
            }`}
          >
            Fiche technique
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow p-4">
          {bulletinSubTab === "list" && <AdminBulletinsetFiches />}
          {bulletinSubTab === "form" && <AdminBulletinForm />}
          {bulletinSubTab === "fiches" && <AdminFicheTechniques />}
        </div>

        {bulletinsLockedLikeAssistant && (
          <p className="text-xs text-gray-500">
            Certaines sections (modèles, rapports étendus) restent masquées conformément
            aux restrictions d’assistant en Admin.
          </p>
        )}
      </div>
    );

    const handleLogout = async () => {
  await supabase.auth.signOut();

  // 🔥 HARD browser-level redirect (kills history)
  navigate("/login", { replace: true });
};


    // Hard gate so only teachers (and optionally assistants) can access
    const isTeacherOrAssistant = useMemo(
      () => role === "teacher" || role === "assistant",
      [role]
    );

    if (loadingProfile) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-500">
        Chargement…
      </div>
    );
  }


    if (!isTeacherOrAssistant) {
      return (
        <div className="h-screen flex items-center justify-center text-red-600 font-semibold">
          🚫 Accès refusé. Rôle requis: teacher/assistant.
        </div>
      );
    }

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
      className="h-10 w-auto cursor-pointer"
      onClick={() => goToTab("overview")}
    />

    <div className="w-6" />
  </div>
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
    w-64 bg-gray-900 shadow-lg flex flex-col
    transform transition-transform duration-300
    ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
    md:translate-x-0
  `}
>
          <div className="p-4 border-b border-gray-700 flex flex-col items-center">
            <img
    src="/logo/aquador.png"
    alt="Logo"
    className="h-10 w-10 mb-1 cursor-pointer"
    onClick={() => goToTab("overview")}
  />
            <h1 className="text-2xl font-bold text-aquaBlue">A'QUA D'OR</h1>
            <p className="text-gray-400 text-sm">Teacher Dashboard</p>
          </div>

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <button
              onClick={() => goToTab("overview")}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "overview"
                  ? "bg-aquaBlue text-white"
                  : "text-gray-100 hover:bg-orange-700"
              }`}
            >
              <FaChartBar /> Aperçu
            </button>

            <div>
    <button
      onClick={() => setOpenBoutique((v) => !v)}
      className={`flex items-center justify-between w-full px-3 py-2 rounded-lg ${
        activeTab.startsWith("commissions")
          ? "bg-aquaBlue text-white"
          : "text-gray-100 hover:bg-orange-700"
      }`}
    >
      <span className="flex items-center gap-2">
        <FaMoneyBillWave /> Commissions
      </span>
      <span>{openBoutique ? "▲" : "▼"}</span>
    </button>

    {openBoutique && (
      <div className="ml-6 mt-2 flex flex-col space-y-2">
        <button
          onClick={() => goToTab("commissions")}
          className={`text-left px-2 py-1 rounded ${
            activeTab === "commissions"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          📊 Détails des commissions
        </button>

        <button
          onClick={() => goToTab("commissions-requests")}
          className={`text-left px-2 py-1 rounded ${
            activeTab === "commissions-requests"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          💸 Demande de paiement
        </button>
      </div>
    )}
  </div>
<button
          onClick={() => goToTab("boutique")}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
            activeTab === "boutique"
              ? "bg-aquaBlue text-white"
              : "text-gray-100 hover:bg-orange-700"
          }`}
        >
          🛒 Boutique
        </button>

            <button
              onClick={() => goToTab("presence")}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "presence"
                  ? "bg-aquaBlue text-white"
                  : "text-gray-100 hover:bg-orange-700"
              }`}
            >
              <FaUserCheck /> Gérer présence
            </button>

            <button
              onClick={() => goToTab("bulletins")}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "bulletins"
                  ? "bg-aquaBlue text-white"
                  : "text-gray-100 hover:bg-orange-700"
              }`}
            >
              <FaClipboardList /> Bulletins
            </button>
          </nav>

          <div className="p-4 border-t border-gray-700">
            <button
              onClick={() => setShowSignOutConfirm(true)}
              className="flex items-center gap-2 text-gray-200 hover:text-red-400 w-full"
            >
              <FaSignOutAlt /> Se déconnecter
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 pt-16 md:pt-6 px-4 md:p-6 overflow-y-auto">
          {activeTab === "overview" && <Overview />}
          {activeTab === "commissions" && (
    <UserCommissions userId={profile?.id} />
  )}

  {activeTab === "commissions-requests" && (
  <div className="max-w-5xl mx-auto bg-white p-4 sm:p-6 rounded-2xl shadow-lg">
    <UserCommissionsRequests userId={profile?.id} />
  </div>
)}
{/* Confirmation Modal */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm z-[9999] relative">
            <h2 className="text-lg font-bold mb-4">Êtes-vous sûr de vouloir vous déconnecter ?</h2>
            <div className="flex justify-end gap-3">
              <button
  onClick={() => {
    setShowSignOutConfirm(false);
    window.__teacherLogoutConfirm = null;
  }}
  className="px-3 py-1 rounded bg-gray-200"
>
  Annuler
</button>

<button
  onClick={window.__teacherLogoutConfirm}
  className="px-3 py-1 rounded bg-red-600 text-white"
>
  Oui, déconnecter
</button>

            </div>
          </div>
        </div>
      )}

  {activeTab === "boutique" && (
    <UserBoutique userId={profile?.id} />
  )}

          {activeTab === "presence" && <Presence />}
          {activeTab === "bulletins" && <Bulletins />}
        </main>
      </div>
    );
  }
