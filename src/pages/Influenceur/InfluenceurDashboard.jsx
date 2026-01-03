// src/pages/Influenceur/InfluenceurDashboard.jsx
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useAuth } from "../../context/AuthContext"
import UserProfile from "../Influenceur/UserProfile";
import UserCourses from "../Influenceur/UserCourses";
import UserForm from "../admin/AdminUsersForm"; // adjust path
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
} from "react-icons/fa"
import { Link, useNavigate } from "react-router-dom"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"
import { FaDollarSign, FaLaptopFile } from "react-icons/fa6";


export default function InfluenceurDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // States
  const [activeTab, setActiveTab] = useState("overview")
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
  const [pendingCommission, setPendingCommission] = useState(0) // not yet requested
  const [requests, setRequests] = useState([])                  // last commission requests
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  
 
  // Fetch invoices for parent + children and compute total balance
  useEffect(() => {
    if (!user) return;
  
    const fetchAllInvoices = async () => {
      try {
        // Get children of this parent
        const { data: children, error: childError } = await supabase
          .from("profiles_with_unpaid")
          .select("id, full_name")
          .eq("parent_id", user.id);
  
        if (childError) throw childError;
  
        const childIds = children?.map((c) => c.id) || [];
  
        // Fetch invoices for parent + children
        const { data: allInvoices, error: invError } = await supabase
          .from("invoices")
          .select("id, user_id, invoice_no, total, paid_total, created_at, issued_at, status")
          .in("user_id", [user.id, ...childIds]);
  
        if (invError) throw invError;
  
        // Attach child names for tooltip
        const mergedInvoices = allInvoices.map((inv) => {
          const child = children.find((c) => c.id === inv.user_id);
          return { ...inv, child_name: child ? child.full_name : null };
        });
  
        setInvoices(mergedInvoices || []);
  
        // Compute total (parent + children)
        const totalBal = mergedInvoices.reduce(
          (sum, i) => sum + ((i.total || 0) - (i.paid_total || 0)),
          0
        );
        setBalance(totalBal);
  
        // Recent invoices (5 latest)
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
  
    fetchAllInvoices();
  }, [user]);
  
  
  
    // Fetch referrals
    useEffect(() => {
      if (user) {
        supabase
          .from("referrals")
          .select(
            `
            id, created_at,
            referred_user_id,
            profiles!referrals_referred_user_id_fkey(full_name, role, is_active)
          `
          )
          .eq("referrer_user_id", user.id)
          .then(({ data, error }) => {
            if (error) console.error("Error loading referrals:", error)
            else {
              setReferrals(data || [])
  
              // Calculate commissions: $10 per active referral
              const activeCount = (data || []).filter(
                (r) => r.profiles?.is_active
              ).length
              setCommission(activeCount * 10)
            }
          })
      }
    }, [user])
    
    useEffect(() => {
      if (user) {
        setReferralLink(
          `${window.location.origin}/signup?ref=${user.referral_code}`
        )
      }
    }, [user])
  
    useEffect(() => {
    if (!referrals) return
  
    // Last 5 referrals
    const sortedRefs = [...(referrals || [])].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    )
    setRecentReferrals(sortedRefs.slice(0, 5))
  
    // Monthly counts for the current year (or last 12 months)
    const now = new Date()
    const last12 = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      last12.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("fr-FR", { month: "short" }) })
    }
    const counts = last12.map(m => ({
      month: m.label,
      key: m.key,
      count: 0
    }))
    referrals.forEach(r => {
      const d = new Date(r.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const idx = counts.findIndex(c => c.key === key)
      if (idx >= 0) counts[idx].count += 1
    })
    setMonthlyReferrals(counts.map(({ month, count }) => ({ month, count })))
  
    // Notifications: simple examples
    const recentThreshold = Date.now() - 1000 * 60 * 60 * 24 * 7 // 7 days
    const notes = []
    sortedRefs.slice(0, 5).forEach(r => {
      if (new Date(r.created_at).getTime() >= recentThreshold) {
        notes.push({ id: `ref-${r.id}`, type: "referral", text: `Nouveau parrainage: ${r.profiles?.full_name || "Utilisateur"}`, date: r.created_at })
      }
    })
    recentInvoices.slice(0, 5).forEach(inv => {
      if ((inv.status || "").toLowerCase() === "paid") {
        notes.push({ id: `inv-${inv.id}`, type: "payment", text: `Paiement reçu: ${Number(inv.paid_total || 0).toFixed(2)} $`, date: inv.updated_at || inv.created_at })
      }
    })
    
    const buildNotifications = async () => {
    const recentThreshold = Date.now() - 1000 * 60 * 60 * 24 * 7 // 7 days
    const notes = []
  
    // 1) Recent referrals (keep your existing logic)
    const sortedRefs = [...(referrals || [])].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )
    sortedRefs.slice(0, 5).forEach((r) => {
      if (new Date(r.created_at).getTime() >= recentThreshold) {
        notes.push({
          id: `ref-${r.id}`,
          type: "referral",
          text: `Nouveau parrainage: ${r.profiles?.full_name || "Utilisateur"}`,
          date: r.created_at,
        })
      }
    })
  
    // 2) Recent paid invoices (keep your existing logic)
    ;(recentInvoices || []).slice(0, 5).forEach((inv) => {
      if ((inv.status || "").toLowerCase() === "paid") {
        notes.push({
          id: `inv-${inv.id}`,
          type: "payment",
          text: `Paiement reçu: ${Number(inv.paid_total || 0).toFixed(2)} $`,
          date: inv.updated_at || inv.created_at,
        })
      }
    })
  
    // 3) Upcoming birthdays (next 7 days) for *referred users only* to satisfy RLS
    const today = new Date()
    const nextWeek = new Date()
    nextWeek.setDate(today.getDate() + 15)
  
    // collect referred user ids from current referrals
    const referredIds = (referrals || [])
      .map((r) => r.referred_user_id)
      .filter(Boolean)
  
    if (referredIds.length > 0) {
      const { data: birthdayProfiles, error: bdayError } = await supabase
        .from("profiles_with_unpaid")
        .select("id, first_name, last_name, birth_date")
        .in("id", referredIds)
        .not("birth_date", "is", null)
  
      if (!bdayError && birthdayProfiles) {
        birthdayProfiles.forEach((u) => {
          const bDate = new Date(u.birth_date)
          const upcoming = new Date(
            today.getFullYear(),
            bDate.getMonth(),
            bDate.getDate()
          )
  
          if (upcoming >= today && upcoming <= nextWeek) {
            notes.push({
              id: `bday-${u.id}`,
              type: "birthday",
              text: `🎂 Anniversaire de ${u.first_name} ${u.last_name}`,
              date: upcoming.toISOString(),
            })
          }
        })
      }
    }
  
    // Sort newest first and keep a few
    notes.sort((a, b) => new Date(b.date) - new Date(a.date))
    setNotifications(notes.slice(0, 5))
  }
  
  // call the async builder
  buildNotifications()
  
  
    // Sort notifications by date desc & keep a few
    notes.sort((a, b) => new Date(b.date) - new Date(a.date))
    setNotifications(notes.slice(0, 5))
  
    // Pending commission = $10 * active referrals minus already requested/paid (simple version)
    const activeCount = referrals.filter(r => r.profiles?.is_active).length
    setPendingCommission(activeCount * 10)
  }, [referrals, recentInvoices])
  
  
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
      alert(
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
      .order("created_at", { ascending: false })
      .limit(5);
  
    if (!error) setCommissionRequests(data);
  };
  
  useEffect(() => {
    if (user?.id) {
      fetchCommissionRequests();
    }
  }, [user]);
  
  
  
    const handleLogout = async () => {
      await supabase.auth.signOut()
      navigate("/ecolelanding") // back to landing page
    }
  
    const renderContent = () => {
      switch (activeTab) {
        case "overview":
    return (
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Bienvenue, {user?.full_name}
          </h2>
          <p className="text-gray-600">
            Voici un aperçu de ton activité et de tes finances.
          </p>
        </div>
  
        {/* Balance + Pending Commissions */}
  <div className="grid grid-cols-1 sm:grid-cols-1 gap-6">   
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
    {/* Balance card with hover breakdown (shows above) */}
  <div className="relative group p-4 bg-white shadow rounded-lg cursor-pointer">
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
  
    {/* 🧾 Hover breakdown tooltip (appears above) */}
    <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-3 w-72 bg-white shadow-xl rounded-lg p-3 border border-gray-200 text-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-300 z-50 scale-95 group-hover:scale-100">
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-white border-l border-t border-gray-200 rotate-45"></div>
      <p className="font-semibold text-gray-700 mb-2 text-center">Détail du solde</p>
  
      <ul className="space-y-1">
        {/* Parent */}
        <li className="flex justify-between font-medium">
          <span>{user.full_name}</span>
          <span
            className={
              invoices
                .filter((i) => i.user_id === user.id)
                .reduce((s, i) => s + ((i.total || 0) - (i.paid_total || 0)), 0) >
              0
                ? "text-red-600"
                : "text-green-600"
            }
          >
            {formatCurrencyUSD(
              invoices
                .filter((i) => i.user_id === user.id)
                .reduce((s, i) => s + ((i.total || 0) - (i.paid_total || 0)), 0)
            )}
          </span>
        </li>
  
        {/* Each child */}
        {Array.from(
          new Set(invoices.filter((i) => i.child_name).map((i) => i.child_name))
        ).map((child) => {
          const childBal = invoices
            .filter((i) => i.child_name === child)
            .reduce((s, i) => s + ((i.total || 0) - (i.paid_total || 0)), 0)
          return (
            <li key={child} className="flex justify-between">
              <span>{child}</span>
              <span className={childBal > 0 ? "text-red-600" : "text-green-600"}>
                {formatCurrencyUSD(childBal)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  </div>
  
  
  
    {/* Pending Commissions */}
    <div className="p-4 bg-white shadow rounded-lg">
      <h3 className="text-sm font-semibold text-gray-500">Commissions en attente</h3>
      <p
    className={`text-2xl font-bold mt-2 ${
      pendingCommission === 0 ? "text-green-600" : "text-red-600"
    }`}
  >
    {formatCurrencyUSD(pendingCommission)}
      </p>
  
      <div className="mt-3 flex gap-3">
        <button
          onClick={() => setActiveTab("request")}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Demander un paiement
        </button>
        <button
          onClick={() => handleCommissionRequest("purchase")}
          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Utiliser en boutique
        </button>
      </div>
    </div>
   
  
  {/* Referral Link */}
        <div className="p-4 bg-white shadow rounded-lg">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Lien de parrainage</h3>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={referralLink}
              readOnly
              className="flex-1 border rounded p-2 text-sm"
            />
            <button
              onClick={() => navigator.clipboard.writeText(referralLink)}
              className="px-3 py-1 bg-aquaBlue text-white rounded"
            >
              Copier
            </button>
          </div>
        </div>
  </div>
  </div>
  
        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-4 bg-white shadow rounded-lg text-center">
            <h3 className="text-sm font-semibold text-gray-500">Total Parrainages</h3>
            <p className="text-2xl font-bold mt-2">{referrals.length}</p>
          </div>
          <div className="p-4 bg-white shadow rounded-lg text-center">
            <h3 className="text-sm font-semibold text-gray-500">Actifs</h3>
            <p className="text-2xl font-bold mt-2 text-green-600">
              {referrals.filter((r) => r.profiles?.is_active).length}
            </p>
          </div>
          <div className="p-4 bg-white shadow rounded-lg text-center">
            <h3 className="text-sm font-semibold text-gray-500">Inactifs</h3>
            <p className="text-2xl font-bold mt-2 text-red-600">
              {referrals.filter((r) => !r.profiles?.is_active).length}
            </p>
          </div>
        </div>
  
              
        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-4 bg-white shadow rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Activité récente (Parrainages)</h3>
            {recentReferrals.length === 0 ? (
              <p className="text-gray-600">Aucune activité récente.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentReferrals.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.profiles?.full_name || "Utilisateur"}</span>
                    <span className="text-gray-500">{new Date(r.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-4 bg-white shadow rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Activité récente (Factures)</h3>
            {recentInvoices.length === 0 ? (
              <p className="text-gray-600">Aucune facture récente.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentInvoices.map((f) => (
                  <li key={f.id} className="flex justify-between">
                    <span>
                      #{f.invoice_no?.toUpperCase() || (f.referral_code ? f.referral_code.toUpperCase() : "—")} – {formatCurrencyUSD(f.total || 0)}
                    </span>
                    <span className="text-gray-500">
                      {formatDateFrSafe(f.issued_at || f.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
  
        
        {/* Notifications */}
        <div className="p-4 bg-white shadow rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Notifications</h3>
          {notifications.length === 0 ? (
            <p className="text-gray-600">Aucune notification.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {notifications.map(n => (
                <li key={n.id} className="flex justify-between">
                  <span>{n.text}</span>
                  <span className="text-gray-500">
                    {new Date(n.date).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
        <h2 className="text-xl font-bold mb-4">Mes Factures</h2>
        <table className="min-w-full text-sm bg-white shadow rounded">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left"># Facture</th>
              <th className="px-3 py-2 text-left">Montant</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Émise le</th>
              <th className="px-3 py-2 text-left">PDF</th>
            </tr>
          </thead>
          <tbody>
            {(invoices || []).map(inv => (
              <tr key={inv.id} className="border-t">
                <td className="px-3 py-2">{inv.invoice_no || inv.id}</td>
                <td className="px-3 py-2">${Number(inv.total || 0).toFixed(2)}</td>
                <td className="px-3 py-2">{inv.status || "pending"}</td>
                <td className="px-3 py-2">
                  {new Date(inv.issued_at || inv.created_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  {inv.pdf_url ? (
                    <a
                      href={inv.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Voir PDF
                    </a>
                  ) : (
                    <span className="text-gray-500">En cours…</span>
                  )}
                </td>
              </tr>
            ))}
            {(!invoices || invoices.length === 0) && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Aucune facture.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
        case "courses":
          return (
            <div>
              <UserCourses userId={user.id} />
            </div>
          )
        case "bulletins":
          return (
            <div>
              <h2 className="text-xl font-bold mb-4">Mes Rapports</h2>
              <p>Bulletins et fiches techniques classés par mois.</p>
            </div>
          )
        case "receipts":
          return (
            <div>
              <h2 className="text-xl font-bold mb-4">Mes Reçus</h2>
              <p>Télécharge tes reçus de paiement en PDF.</p>
            </div>
          )
        case "referrals":
          return (
            <div>
              <h2 className="text-xl font-bold mb-4">Mon Parrainage</h2>
              <p className="mb-2">Ton code parrainage : {user?.referral_code}</p>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={referralLink}
                  readOnly
                  className="border p-2 rounded w-full"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/signup?ref=${user?.referral_code}`)
                    alert("Lien copié !")
                  }}
                  className="bg-aquaBlue text-white px-3 py-1 rounded"
                >
                  Copier
                </button>
              </div>
              <p className="mt-3 text-sm text-gray-600">
                Partage ce lien pour parrainer et gagner des réductions/commissions.
              </p>
            </div>
          )
        case "commissions":
          return (
            <div>
              <h2 className="text-xl font-bold mb-4">Mes Commissions</h2>
              <p>Résumé des commissions gagnées, en attente ou payées.</p>
            </div>
          )
        case "request":
          return (
            <div>
              <h2 className="text-xl font-bold mb-4">Demande de Paiement</h2>
              <p>Formulaire pour demander le paiement de tes commissions.</p>
            </div>
          )
        case "boutique":
          return (
            <div>
              <h2 className="text-xl font-bold mb-4">Boutique</h2>
              <p>Acheter des produits disponibles dans la boutique A’QUA D’OR.</p>
            </div>
          )
        default:
          return <p>Sélectionne une option dans le menu.</p>
      }
    }
  
    return (
      <div className="flex h-screen bg-gray-100">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-950 shadow-lg flex flex-col">
          <div className="p-4 border-gray-100 border-b flex flex-col items-center">
            <img src="/logo/aquador.png" alt="Logo A'QUA D'OR" className="h-10 w-10" />
            <h1 className="text-2xl font-bold text-aquaBlue">A'QUA D'OR</h1>    
            <p className="text-gray-500 text-sm">Parent/Elève Dashboard</p>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <ul>
              <li
                onClick={() => setActiveTab("overview")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "overview" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
              >
                <FaHome className="mr-2" /> Aperçu
              </li>         
              <li
                onClick={() => setActiveTab("profile")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                  activeTab === "profile"
                    ? "bg-aquaBlue text-white"
                    : "text-gray-100 hover:bg-orange-700"
                }`}
              >
                <FaUserGraduate className="mr-2" /> Mon profil
              </li>      
              <li
                onClick={() => setActiveTab("invoices")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "invoices" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
              >
                <FaDollarSign className="mr-2" /> Mes Factures
              </li>       
              <li
                onClick={() => setActiveTab("courses")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "courses" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
              >
                <FaUserGraduate className="mr-2" /> Mes Cours
              </li>
              <li
                onClick={() => setActiveTab("bulletins")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "bulletins" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
              >
                <FaFileDownload className="mr-2" /> Mes Rapports
              </li>
              <li
                onClick={() => setActiveTab("receipts")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "receipts" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
              >
                <FaQrcode className="mr-2" /> Mes Reçus
              </li>
              <li
                onClick={() => setActiveTab("commissions")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "commissions" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
              >              
                <FaChartLine className="mr-2" /> Mes Commissions
              </li>
              <li
                onClick={() => setActiveTab("request")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "request" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
              >
                <FaMoneyBillWave className="mr-2" /> Demande de Paiement
              </li>
              <li
                onClick={() => setActiveTab("referrals")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "referrals" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
              >
                <FaLink className="mr-2" /> Parrainage
              </li>
              <li
                onClick={() => setActiveTab("boutique")}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left ${
                activeTab === "boutique" ? "bg-aquaBlue text-white" : "text-gray-100 hover:bg-orange-700"
              }`}
              >
                <FaShoppingCart className="mr-2" /> Boutique
              </li>
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
        <main className="flex-1 p-6 overflow-y-auto">{renderContent()}</main>
  
        {/* Confirmation Modal */}
        {showSignOutConfirm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm">
              <h2 className="text-lg font-bold mb-4">Êtes-vous sûr de vouloir vous déconnecter ?</h2>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSignOutConfirm(false)}
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                >
                  Annuler
                </button>
                <button
                  onClick={handleLogout}
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
  