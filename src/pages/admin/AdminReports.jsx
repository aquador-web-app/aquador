import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { exportAllCardsPDF } from "../../components/ExportAllCardsPDF"
import { exportAllUsersCSV } from "../../components/ExportAllUsersCSV"
import { exportInvoicesCSV } from "../../components/ExportInvoicesCSV"
import { exportAttendanceCSV } from "../../components/ExportAttendanceCSV"
import { exportCommissionsCSV } from "../../components/ExportCommissionsCSV"
import { useNavigate } from "react-router-dom"
import Papa from "papaparse"
import CardGenerator from "../../components/CardGenerator";


export default function AdminReports() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    courses: 0,
    invoices: 0,
    invoicesPaid: 0,
    invoicesUnpaid: 0,
    revenue: 0,
    commissions: 0,
    commissionsPending: 0,
    absences: 0,
  })
  const [users, setUsers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [attendance, setAttendance] = useState([])
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [monthFilter, setMonthFilter] = useState(() => new Date().toISOString().slice(0, 7));

  

  const load = async () => {
    setLoading(true)

    // Charger utilisateurs
    const { data: profiles } = await supabase
      .from("profiles_with_unpaid")
      .select("*")
      .order("created_at", { ascending: false })
    setUsers(profiles || [])

    // Charger factures + noms utilisateurs
const { data: inv } = await supabase
  .from("invoices")
  .select("*")
  .order("created_at", { ascending: false });

const { data: prof } = await supabase
  .from("profiles")
  .select("id, full_name");

const mergedInvoices = (inv || []).map((i) => ({
  ...i,
  full_name: prof.find((p) => p.id === i.user_id)?.full_name || i.user_id,
}));

setInvoices(mergedInvoices);


    // Charger présences
    const { data: att } = await supabase
      .from("attendance")
      .select("*")
      .order("attended_on", { ascending: false });
    setAttendance(att || [])

    // Charger commissions
    const { data: comms } = await supabase
      .from("commissions")
      .select("*")
      .order("created_at", { ascending: false })
    setCommissions(comms || [])

    // Stats utilisateurs
    const { count: total } = await supabase
      .from("profiles_with_unpaid")
      .select("*", { count: "exact", head: true })
    const { count: active } = await supabase
      .from("profiles_with_unpaid")
      .select("*", { count: "exact", head: true })
      .neq("referral_code", null)

    // Stats cours
    const { count: c } = await supabase
      .from("courses")
      .select("*", { count: "exact", head: true })

    // Stats factures
    let invPaid = 0
    let invUnpaid = 0
    let revenue = 0
    inv?.forEach((i) => {
      if (i.status === "paid") invPaid++
      if (i.status === "open") invUnpaid++
      revenue += Number(i.paid_total || 0)
    })

    // Stats commissions
    let commTotal = 0
    let commPending = 0
    comms?.forEach((c) => {
      commTotal += Number(c.amount)
      if (!c.paid) commPending += Number(c.amount)
    })

    // Stats absences
    const { count: abs } = await supabase
      .from("attendance")
      .select("*", { count: "exact", head: true })
      .eq("status", "absent")

    setStats({
      totalUsers: total || 0,
      activeUsers: active || 0,
      courses: c || 0,
      invoices: inv?.length || 0,
      invoicesPaid: invPaid,
      invoicesUnpaid: invUnpaid,
      revenue,
      commissions: commTotal,
      commissionsPending: commPending,
      absences: abs || 0,
    })
    setLoading(false)
  }

  const exportStatsCSV = () => {
    const rows = [
      ["Total Utilisateurs", stats.totalUsers],
      ["Utilisateurs Actifs", stats.activeUsers],
      ["Cours", stats.courses],
      ["Factures", stats.invoices],
      ["Factures Payées", stats.invoicesPaid],
      ["Factures Non Payées", stats.invoicesUnpaid],
      ["Revenus", stats.revenue],
      ["Commissions Totales", stats.commissions],
      ["Commissions en attente", stats.commissionsPending],
      ["Absences totales", stats.absences],
    ]
    const csv = rows.map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", "stats.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportStatsPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Rapport A'QUA D'OR", 14, 20)

    const data = [
      ["Total Utilisateurs", stats.totalUsers],
      ["Utilisateurs Actifs", stats.activeUsers],
      ["Cours", stats.courses],
      ["Factures", stats.invoices],
      ["Factures Payées", stats.invoicesPaid],
      ["Factures Non Payées", stats.invoicesUnpaid],
      ["Revenus", `$${stats.revenue.toFixed(2)}`],
      ["Commissions Totales", `$${stats.commissions.toFixed(2)}`],
      ["Commissions en attente", `$${stats.commissionsPending.toFixed(2)}`],
      ["Absences totales", stats.absences],
    ]

    autoTable(doc, {
      startY: 30,
      head: [["Statistique", "Valeur"]],
      body: data,
    })

    doc.save("stats.pdf")
  }

    const exportInvoicesCSV = () => {
  if (!invoices.length) return;

  let filtered = invoices;

  // If a month is selected, filter by that month (using the 'month' column)
  if (monthFilter && monthFilter.trim() !== "") {
    filtered = invoices.filter((i) => i.month?.slice(0, 7) === monthFilter);
  }

  // If no invoices found for that month, but a month was selected → alert
  if (!filtered.length && monthFilter && monthFilter.trim() !== "") {
    alert(`Aucune facture trouvée pour le mois ${monthFilter}.`);
    return;
  }

  // Build CSV data
  const csv = Papa.unparse(
    filtered.map((i) => ({
      Utilisateur: i.full_name,
      Mois: i.month ? i.month.slice(0, 7) : "",
      Montant: i.total,
      Statut: i.status,
      Échéance: i.due_date || "—",
    }))
  );

  // Name the file based on selection
  const fileName = monthFilter && monthFilter.trim() !== ""
    ? `factures_${monthFilter}.csv`
    : "factures_toutes.csv";

  // Download file
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
};

// === Export Enrollments (Inscriptions) CSV ===
const exportInscriptionsCSV = async () => {
  // Load enrollments joined with profiles and courses
  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select(`
      id,
      status,
      enrolled_at,
      start_date,
      profile_id,
      session_id,
      session_group,
      course_id,
      plan_id,
      override_price,
      type,
      profiles:profile_id ( full_name ),
      courses:course_id ( name ),
      plans:plan_id ( name, price, duration_hours ),
      sessions:session_id ( day_of_week, start_time )
    `)
    .order("enrolled_at", { ascending: false });

  if (error) {
    console.error(error);
    alert("Erreur lors du chargement des inscriptions.");
    return;
  }

  if (!enrollments || enrollments.length === 0) {
    alert("Aucune inscription trouvée.");
    return;
  }

  // ✅ Filter by selected month using enrolled_at
  let filtered = enrollments;
  if (monthFilter && monthFilter.trim() !== "") {
    filtered = enrollments.filter((e) =>
      e.enrolled_at?.slice(0, 7) === monthFilter
    );
  }

  if (!filtered.length) {
    alert(`Aucune inscription trouvée pour le mois ${monthFilter}.`);
    return;
  }

  // ✅ Build CSV rows
  const csv = Papa.unparse(
    filtered.map((e) => ({
      Utilisateur: e.profiles?.full_name || e.profile_id,
      Cours: e.courses?.name || e.course_id,
      Plan: e.plans?.name || "—",
      Statut: e.status || "—",
      Date_inscription: e.enrolled_at?.slice(0, 10) || "—",
      Début_cours: e.start_date?.slice(0, 10) || "—",
      Séance: e.sessions
        ? `${e.sessions.day_of_week || ""} ${e.sessions.start_time || ""}`
        : "—",
    }))
  );

  // ✅ File name
  const fileName =
    monthFilter && monthFilter.trim() !== ""
      ? `inscriptions_${monthFilter}.csv`
      : "inscriptions_toutes.csv";

  // ✅ Trigger download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
};



  useEffect(() => {
    load()
  }, [])

  if (loading) return <div className="p-6">Chargement...</div>

  return (
    <div className="space-y-8">
      {/* Boutons d’export */}
      <div className="flex flex-wrap gap-2">
        <button onClick={exportStatsCSV} className="btn">
          📊 Stats CSV
        </button>
        <button onClick={exportStatsPDF} className="btn btn-primary">
          📄 Stats PDF
        </button>
        {/* 🪪 New Card Generator Dropdown */}
  <CardGenerator users={users} />
         <button
          onClick={() => exportAllUsersCSV(users)}
          className="bg-aquaOrange text-white px-3 py-2 rounded hover:bg-orange-500 text-sm"
        >
          👥 Utilisateurs CSV
        </button>
        <div className="flex items-center gap-2">
  <input
    type="month"
    value={monthFilter}
    onChange={(e) => setMonthFilter(e.target.value)}
    placeholder="Toutes les factures"
    className="border rounded-lg px-2 py-1 text-sm"
  />
  <button
    onClick={exportInvoicesCSV}
    className="bg-purple-600 text-white px-3 py-2 rounded hover:bg-purple-700 text-sm"
  >
    📑 Factures CSV
  </button>
</div>

        <button
  onClick={exportInscriptionsCSV}
  className="bg-pink-600 text-white px-3 py-2 rounded hover:bg-pink-700 text-sm"
>
  📝 Inscriptions CSV
</button>

        <button
          onClick={() => exportCommissionsCSV(commissions)}
          className="bg-yellow-500 text-black px-3 py-2 rounded hover:bg-yellow-600 text-sm"
        >
          💵 Commissions CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold text-gray-700">Utilisateurs</h2>
          <p>Total: {stats.totalUsers}</p>
          <p>Actifs: {stats.activeUsers}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold text-gray-700">Cours</h2>
          <p>Total: {stats.courses}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold text-gray-700">Absences</h2>
          <p>Total: {stats.absences}</p>
        </div>
      </div>

      {/* Factures Preview */}
      <div className="bg-white p-4 rounded-xl shadow">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold text-gray-700">Dernières Factures</h2>
          <button
            onClick={() => navigate("/admin/invoices")}
            className="text-blue-600 text-sm underline"
          >
            Voir tout →
          </button>
        </div>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Utilisateur</th>
              <th className="p-2 border">Montant</th>
              <th className="p-2 border">Statut</th>
              <th className="p-2 border">Échéance</th>
            </tr>
          </thead>
          <tbody>
            {invoices.slice(0, 5).map((i) => (
              <tr key={i.id} className="hover:bg-gray-50">
                <td className="p-2 border">{i.full_name}</td>
                <td className="p-2 border">${i.total}</td>
                <td className="p-2 border">{i.status}</td>
                <td className="p-2 border">{i.due_date || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Présences Preview */}
      <div className="bg-white p-4 rounded-xl shadow">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold text-gray-700">Dernières Présences</h2>
          <button
            onClick={() => navigate("/admin/attendance")}
            className="text-blue-600 text-sm underline"
          >
            Voir tout →
          </button>
        </div>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Utilisateur</th>
              <th className="p-2 border">Date</th>
              <th className="p-2 border">Présent</th>
            </tr>
          </thead>
          <tbody>
            {attendance.slice(0, 5).map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="p-2 border">{a.user_id}</td>
                <td className="p-2 border">{a.attended_on}</td>
                <td className="p-2 border">
                  {a.status === "present" ? "Oui" : "Non"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Commissions Preview */}
      <div className="bg-white p-4 rounded-xl shadow">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold text-gray-700">Dernières Commissions</h2>
          <button
            onClick={() => navigate("/admin/commissions")}
            className="text-blue-600 text-sm underline"
          >
            Voir tout →
          </button>
        </div>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Utilisateur</th>
              <th className="p-2 border">Montant</th>
              <th className="p-2 border">Payée</th>
            </tr>
          </thead>
          <tbody>
            {commissions.slice(0, 5).map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="p-2 border">{c.full_name}</td>
                <td className="p-2 border">${c.amount}</td>
                <td className="p-2 border">{c.paid ? "Oui" : "Non"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
