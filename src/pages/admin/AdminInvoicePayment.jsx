// src/pages/Admin/AdminInvoicePayment.jsx
import React, { useEffect, useRef, useState } from "react";
  import { supabase } from "../../lib/supabaseClient";
  import { formatCurrencyUSD, formatDateFrSafe, formatMonth } from "../../lib/dateUtils";
  import { useGlobalAlert } from "../../components/GlobalAlert";
  import HoverOverlay from "../../components/HoverOverlay";

  function sanitizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

  export default function AdminInvoicePayment({ onPaymentChange }) {
    const [invoices, setInvoices] = useState([]);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("cash");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const { showAlert, showConfirm } = useGlobalAlert();

    // payments
    const [payments, setPayments] = useState([]);
    const [pendingPayments, setPendingPayments] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const pageSize = 10;
    const [proofUrl, setProofUrl] = useState(null);
const [uploadingProof, setUploadingProof] = useState(false);
const proofInputRef = useRef(null);
    // Hover overlays
const expectedCardRef = useRef(null);
const [expectedHovered, setExpectedHovered] = useState(false);

const currentCardRef = useRef(null);
const [currentHovered, setCurrentHovered] = useState(false);

const unpaidCardRef = useRef(null);
const [unpaidHovered, setUnpaidHovered] = useState(false);

const revertedCardRef = useRef(null);
const [revertedHovered, setRevertedHovered] = useState(false);

const [revertedDetails, setRevertedDetails] = useState([]); // [{ id, name, invoiceNo, amount }]

const [regCollectedDetails, setRegCollectedDetails] = useState([]); // [{ id, name, amount }]
const [regUnpaidDetails, setRegUnpaidDetails] = useState([]);       // [{ id, name, amount }]



    // ✅ LIVE month-to-date summary
const [summary, setSummary] = useState({
  monthKey: "",
  expectedTotal: 0,
  expectedCount: 0,
  currentTotal: 0,
  currentCount: 0, // ✅ add this
  unpaidTotal: 0,
  unpaidCount: 0,
  regCollectedTotal: 0, // ✅ NEW: registration fees collected MTD
  regUnpaidTotal: 0,    // ✅ NEW: registration fees unpaid (still due) for current month
  revertedTotal: 0,
  revertedCount: 0,
});

// ✅ hover details (like AdminDashboard)
const [expectedDetails, setExpectedDetails] = useState([]); // [{ id, name, plan, price }]
const [currentDetails, setCurrentDetails] = useState([]);  // [{ id, name, amount }]
const [unpaidDetails, setUnpaidDetails] = useState([]);    // [{ id, name, remaining }]



const fmtUSD = (v) => `USD ${Number(v || 0).toFixed(2)}`;

// local YYYY-MM
const monthKeyNow = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`; // ✅ matches invoices.month like 2026-02-01
};


const monthRangeUTC = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
};

const todayISODate = () => {
  // "YYYY-MM-DD" in local time (matches typical date columns)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};


    // filters
    const [profiles, setProfiles] = useState([]);
    const [selectedProfileId, setSelectedProfileId] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    // role of logged user
    const [role, setRole] = useState(null);

    const filteredProfiles = profiles.filter((p) =>
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    

    // ----------------- INIT -----------------
    useEffect(() => {
      (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
          if (profile) setRole(profile.role);
        }

        fetchInvoices();
        fetchProfiles();
        fetchPendingPayments();
        fetchPayments();
        fetchExpectedRevenueLive();
        fetchCurrentRevenueLive();
        fetchUnpaidRevenueLive();
        fetchRevertedPaymentsLive();
      })();
    }, []);

    // ----------------- FETCHES -----------------
    async function fetchInvoices() {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, full_name, total, paid_total, status, due_date, month, signup_type")
        .neq("status", "paid")
        .order("due_date", { ascending: true });
      if (!error) setInvoices(data);
    }
  

    async function fetchProfiles() {
      const { data, error } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name")
        .order("full_name");
      if (!error) setProfiles(data);
    }

    async function fetchPayments() {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("payments")
    .select(
      "id, invoice_id, amount, method, notes, paid_at, invoices(full_name, invoice_no, proof_url)",
      { count: "exact" }
    )
    .eq("approved", true) // ✅ ONLY approved payments
    .order("paid_at", { ascending: false })
    .range(from, to);

  if (selectedProfileId) {
    query = query.eq("invoices.user_id", selectedProfileId);
  }

  const { data, error, count } = await query;

  if (!error) {
    setPayments(data || []);
    setTotalPages(Math.ceil((count || 0) / pageSize));
  }
}


    async function fetchPendingPayments() {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, invoice_id, amount, method, notes, paid_at, approved, invoices(full_name, invoice_no, proof_url)"
        )
        .in("method", ["cash", "transfer"])
        .eq("approved", false)
        .order("paid_at", { ascending: false });
      if (!error) setPendingPayments(data || []);
    }

    useEffect(() => {
      fetchPayments();
    }, [page, selectedProfileId]);

    useEffect(() => {
  const saved = localStorage.getItem("admin_payment_proof_url");
  if (saved) setProofUrl(saved);
}, []);

useEffect(() => {
  if (proofUrl) localStorage.setItem("admin_payment_proof_url", proofUrl);
  else localStorage.removeItem("admin_payment_proof_url");
}, [proofUrl]);

async function handleProofPick(file) {
  if (!file) return;

  if (!selectedInvoiceId) {
  showAlert("Veuillez d’abord sélectionner une facture.");
  return;
}

  setUploadingProof(true);
  setProofUrl(null);

  try {
    const invoice = invoices.find((inv) => inv.id === selectedInvoiceId);
    const ext = file.name.split(".").pop();
    const cleanName = sanitizeName(invoice?.full_name || "unknown");
    const path = `proofs/${cleanName}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(path, file, { upsert: true });

    if (uploadErr) throw uploadErr;

    const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
    setProofUrl(pub?.publicUrl || null);
  } catch (err) {
    console.error("Proof upload error:", err);
    showAlert("Erreur lors du téléversement de la preuve.");
  } finally {
    setUploadingProof(false);
  }
}

    // ----------------- HANDLE PAYMENT -----------------
    async function handlePayment() {
    if (!selectedInvoiceId || !amount)
      return showAlert("Veuillez choisir une facture et entrer un montant.");

    setLoading(true);
    const invoice = invoices.find((inv) => inv.id === selectedInvoiceId);
    if (!invoice) {
      setLoading(false);
      return showAlert("Facture introuvable.");
    }

    if (method === "transfer" && !proofUrl) {
  setLoading(false);
  return showAlert("Veuillez joindre une preuve de virement.");
}

    // Determine if payment should be pending approval
    const isPending =
      (method === "cash" || method === "transfer") && role !== "admin";

    // Insert the payment
    const { error: payError } = await supabase.from("payments").insert([
      {
        invoice_id: selectedInvoiceId,
        amount: Number(amount),
        method,
        notes,
        paid_at: new Date().toISOString(),
        approved: !isPending, // true if admin, false if assistant cash/transfer
        created_by: (await supabase.auth.getUser()).data.user.id,
        role: role,
      },
    ]);

    if (payError) {
      setLoading(false);
      return showAlert("Erreur enregistrement paiement: " + payError.message);
    }

    if (method === "transfer" && proofUrl) {
  const { error: proofErr } = await supabase
    .from("invoices")
    .update({ proof_url: proofUrl })
    .eq("id", selectedInvoiceId);

  if (proofErr) {
    setLoading(false);
    return showAlert("Erreur enregistrement preuve: " + proofErr.message);
  }
}

    // Only update invoice totals immediately if payment is auto-approved
    let updatedInvoiceForOverview = null;

if (!isPending) {
  const newPaidTotal = Number(invoice.paid_total || 0) + Number(amount || 0);
  const invoiceTotal = Number(invoice.total || 0);

  const newStatus =
    newPaidTotal <= 0
      ? "pending"
      : newPaidTotal < invoiceTotal
      ? "partial"
      : "paid";

  const { error: invError } = await supabase
    .from("invoices")
    .update({
      paid_total: newPaidTotal,
      status: newStatus,
    })
    .eq("id", selectedInvoiceId);

  if (invError) {
    setLoading(false);
    return showAlert("Erreur mise à jour facture: " + invError.message);
  }

  const { data: refreshedInvoice, error: refreshedInvoiceErr } = await supabase
    .from("invoices")
    .select("id, full_name, total, paid_total, status, signup_type, month")
    .eq("id", selectedInvoiceId)
    .single();

  if (refreshedInvoiceErr) {
    setLoading(false);
    return showAlert("Erreur lecture facture mise à jour: " + refreshedInvoiceErr.message);
  }

  console.log("✅ refreshed invoice from DB after payment:", refreshedInvoice);

  updatedInvoiceForOverview = refreshedInvoice;
}

        setLoading(false);

    if (isPending) {
      showAlert("💸 Paiement soumis pour approbation par l’administrateur.");
    } else {
      showAlert("✅ Paiement enregistré et approuvé automatiquement !");
    }

    setAmount("");
    setNotes("");
    setSelectedInvoiceId("");
    setProofUrl(null);
    localStorage.removeItem("admin_payment_proof_url");

    console.log("💳 handlePayment updatedInvoiceForOverview:", updatedInvoiceForOverview);
console.log("💳 handlePayment onPaymentChange exists:", !!onPaymentChange);
console.log("💳 handlePayment isPending:", isPending);

    // ✅ refresh parent overview immediately after payment/invoice update
    // ✅ instant parent UI update first
if (onPaymentChange && !isPending && updatedInvoiceForOverview) {
  onPaymentChange({
    type: "invoice-updated",
    invoice: updatedInvoiceForOverview,
  });
} else if (onPaymentChange) {
  onPaymentChange();
}

// ✅ then refresh local page data in background of this same action
Promise.all([
  fetchInvoices(),
  fetchPayments(),
  fetchPendingPayments(),
  fetchExpectedRevenueLive(),
  fetchCurrentRevenueLive(),
  fetchUnpaidRevenueLive(),
  fetchRevertedPaymentsLive(),
]).catch((err) => {
  console.error("Post-payment refresh error:", err);
});
  }


    // ----------------- APPROVE / REJECT -----------------
    async function approvePayment(id) {
    const confirmed = await showConfirm("Confirmer ce paiement ?");
    if (!confirmed) return;

    try {
      // 1️⃣ Get payment + its invoice
      const { data: payment, error: fetchErr } = await supabase
  .from("payments")
  .select(`
    id,
    amount,
    invoice_id,
    invoices (
      id,
      full_name,
      total,
      paid_total,
      status,
      signup_type,
      month
    )
  `)
  .eq("id", id)
  .single();

      if (fetchErr) throw fetchErr;
      if (!payment) throw new Error("Paiement introuvable.");

      // 2️⃣ Update invoice totals
      const invoice = payment.invoices;
      const newPaidTotal = (invoice.paid_total || 0) + payment.amount;

      const newStatus =
        newPaidTotal <= 0
          ? "pending"
          : newPaidTotal < invoice.total
          ? "partial"
          : "paid";

      const { error: invError } = await supabase
        .from("invoices")
        .update({
          paid_total: newPaidTotal,
          status: newStatus,
        })
        .eq("id", payment.invoice_id);

      if (invError) throw invError;

      // 3️⃣ Mark payment as approved
      const { error: payErr } = await supabase
        .from("payments")
        .update({ approved: true })
        .eq("id", id);

      if (payErr) throw payErr;

            await showAlert("✅ Paiement approuvé et facture mise à jour !");

      // ✅ refresh overview first
      if (onPaymentChange) {
  onPaymentChange({
    type: "invoice-updated",
    invoice: {
      id: payment.invoice_id,
      full_name: payment.invoices?.full_name,
      total: Number(payment.invoices?.total || 0),
      paid_total: Number(newPaidTotal || 0),
      status: newStatus,
      signup_type: payment.invoices?.signup_type,
      month: payment.invoices?.month,
    },
  });
}

// ✅ then refresh local data without blocking UI
Promise.all([
  fetchPendingPayments(),
  fetchPayments(),
  fetchInvoices(),
  fetchExpectedRevenueLive(),
  fetchCurrentRevenueLive(),
  fetchUnpaidRevenueLive(),
  fetchRevertedPaymentsLive(),
]).catch((err) => {
  console.error("Post-approval refresh error:", err);
});
    } catch (err) {
      await showAlert("❌ Erreur lors de l’approbation : " + err.message);
    }
  }



    async function rejectPayment(id) {
    const confirmed = await showConfirm("Rejeter ce paiement ?");
    if (!confirmed) return;

    try {
      const { error } = await supabase.from("payments").delete().eq("id", id);
if (error) throw error;

await showAlert("🗑️ Paiement rejeté.");
await fetchPendingPayments();
    } catch (err) {
      await showAlert("❌ Erreur rejet : " + err.message);
    }
  }


      // ----------------- REVERT PAYMENT -----------------
    async function handleRevertPayment(paymentId, invoiceId, paymentAmount) {
  const confirmed = await showConfirm(
    "Annuler ce paiement et le remettre en attente d’approbation ?"
  );
  if (!confirmed) return;

  try {
    // 1️⃣ Set payment back to pending
const { error: revertErr } = await supabase
  .from("payments")
  .update({ approved: false })
  .eq("id", paymentId);

if (revertErr) throw revertErr;

// 1️⃣b Mark the corresponding invoice_item as reverted (latest matching amount)
const { data: item, error: itemErr } = await supabase
  .from("invoice_items")
  .select("id")
  .eq("invoice_id", invoiceId)
  .eq("reverted", false)
  .eq("paid", true)
  .eq("amount", Number(paymentAmount || 0))
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (itemErr) throw itemErr;

if (item?.id) {
  const { error: updErr } = await supabase
    .from("invoice_items")
    .update({ reverted: true })
    .eq("id", item.id);

  if (updErr) throw updErr;
}



    // 2️⃣ Recalculate approved total
    const { data: approvedPayments, error: payErr } = await supabase
      .from("payments")
      .select("amount")
      .eq("invoice_id", invoiceId)
      .eq("approved", true);

    if (payErr) throw payErr;

    const newPaidTotal = (approvedPayments || []).reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    // 3️⃣ Fetch invoice total
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("total")
      .eq("id", invoiceId)
      .single();

    if (invErr) throw invErr;

    const newStatus =
      newPaidTotal === 0
        ? "pending"
        : newPaidTotal < invoice.total
        ? "partial"
        : "paid";

    // 4️⃣ Update invoice
    const { error: updateInvoiceErr } = await supabase
  .from("invoices")
  .update({
    paid_total: newPaidTotal,
    status: newStatus,
  })
  .eq("id", invoiceId);

if (updateInvoiceErr) throw updateInvoiceErr;

const { data: updatedInvoice, error: updatedInvoiceErr } = await supabase
  .from("invoices")
  .select("id, full_name, total, paid_total, status, signup_type, month")
  .eq("id", invoiceId)
  .single();

if (updatedInvoiceErr) throw updatedInvoiceErr;

        await showAlert("🔄 Paiement remis en attente d’approbation.");

    // ✅ refresh overview first
   if (onPaymentChange) {
  onPaymentChange({
    type: "invoice-updated",
    invoice: updatedInvoice,
  });
}

// ✅ then refresh local data without blocking UI
Promise.all([
  fetchPayments(),
  fetchPendingPayments(),
  fetchInvoices(),
  fetchExpectedRevenueLive(),
  fetchCurrentRevenueLive(),
  fetchUnpaidRevenueLive(),
  fetchRevertedPaymentsLive(),
]).catch((err) => {
  console.error("Post-revert refresh error:", err);
});
  } catch (err) {
    console.error(err);
    await showAlert("❌ Erreur : " + err.message);
  }
}

async function fetchExpectedRevenueLive() {
  const monthKey = monthKeyNow(); // "YYYY-MM-01"

  // Month boundaries in LOCAL date, formatted as YYYY-MM-DD (no timezone surprises)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const startYMD = toYMD(monthStart);       // e.g. "2026-03-01"
  const nextStartYMD = toYMD(nextMonthStart); // e.g. "2026-04-01"

  // ✅ Active ANY TIME during the month (overlap logic)
  // start_date < nextMonthStart
  // AND (end_date is null OR end_date >= monthStart)
  const { data: enr, error: enrErr } = await supabase
    .from("enrollments")
    .select("id, plan_id, status, start_date, end_date, override_price, profiles:profile_id(full_name)")
    .lt("start_date", nextStartYMD)
    .or(`end_date.is.null,end_date.gte.${startYMD}`);

  if (enrErr) {
    console.error("fetchExpectedRevenueLive enrollments error:", enrErr);
    return;
  }

  // Exclude only clearly inactive statuses
  const active = (enr || []).filter((e) => {
    const st = String(e.status || "").toLowerCase();
    return !["cancelled", "canceled", "stopped", "inactive", "abandoned"].includes(st);
  });

  const planIds = [...new Set(active.map((e) => e.plan_id).filter(Boolean))];

  if (active.length === 0 || planIds.length === 0) {
    setExpectedDetails([]);
    setSummary((s) => ({
      ...s,
      monthKey,
      expectedCount: active.length,
      expectedTotal: 0,
    }));
    return;
  }

  const { data: plans, error: planErr } = await supabase
    .from("plans")
    .select("id, name, price")
    .in("id", planIds);

  if (planErr) {
    console.error("fetchExpectedRevenueLive plans error:", planErr);
    return;
  }

  const planById = new Map((plans || []).map((p) => [p.id, p]));

  const details = active
    .map((e) => {
      const plan = planById.get(e.plan_id);
      const priceUsed =
        e.override_price != null
          ? Number(e.override_price)
          : Number(plan?.price || 0);

      return {
        id: e.id,
        name: e.profiles?.full_name || "—",
        plan: plan?.name || "—",
        price: priceUsed,
      };
    })
    .sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" })
    );

  setExpectedDetails(details);

  const expectedTotal = details.reduce((sum, r) => sum + Number(r.price || 0), 0);

  setSummary((s) => ({
    ...s,
    monthKey,
    expectedCount: details.length,
    expectedTotal,
  }));
}



async function fetchCurrentRevenueLive() {
  const monthKey = monthKeyNow();

  // 1) Get all current-month invoices with paid_total and the 2 lines
  const { data, error } = await supabase
    .from("invoices")
    .select("id, full_name, status, month, paid_total, description1, amount1, description2, amount2")
    .eq("month", monthKey);

  if (error) return;

  const isReg = (desc) => {
    const d = String(desc || "").toLowerCase();
    return (
      d.includes("frais d'inscription") ||
      d.includes("frais d’inscription") ||
      d.includes("inscription") ||
      d.includes("registration")
    );
  };

  const rows = (data || [])
    .map((inv) => {
      const a1 = Number(inv.amount1 || 0);
      const a2 = Number(inv.amount2 || 0);

      const d1Reg = isReg(inv.description1);
      const d2Reg = isReg(inv.description2);

      // ✅ registration amount = sum of lines that look like registration
      const regFee = (d1Reg ? a1 : 0) + (d2Reg ? a2 : 0);

      // ✅ course amount = sum of lines that DO NOT look like registration
      const courseTotal = (!d1Reg ? a1 : 0) + (!d2Reg ? a2 : 0);

      const paidTotal = Number(inv.paid_total || 0);

      // ✅ payments cover registration first, then course
      const paidTowardCourse = Math.max(0, paidTotal - regFee);

      // ✅ "current revenue" for this invoice = course part paid so far (capped)
      const coursePaid = Math.min(courseTotal, paidTowardCourse);

      const regPaid = Math.min(regFee, paidTotal);


      return {
        id: inv.id,
        name: inv.full_name || "—",
        amount: coursePaid,
        courseTotal, // debug
        regPaid, // ✅ keep internal for total calc
      };
    })
    // ✅ remove "Plan / 0" invoices (no course amount)
    .filter((r) => r.courseTotal > 0)
    // ✅ only show invoices with some course money paid
    .filter((r) => r.amount > 0)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" }));

  const currentTotal = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const regCollectedTotal = (data || []).reduce((sum, inv) => {
  const a1 = Number(inv.amount1 || 0);
  const a2 = Number(inv.amount2 || 0);

  const d1Reg = isReg(inv.description1);
  const d2Reg = isReg(inv.description2);

  const regFee = (d1Reg ? a1 : 0) + (d2Reg ? a2 : 0);
  const paidTotal = Number(inv.paid_total || 0);

  return sum + Math.min(regFee, paidTotal);
}, 0);

  // ✅ Registration fees collected (names)
const regRows = (data || [])
  .map((inv) => {
    const a1 = Number(inv.amount1 || 0);
    const a2 = Number(inv.amount2 || 0);

    const d1Reg = isReg(inv.description1);
    const d2Reg = isReg(inv.description2);

    const regFee = (d1Reg ? a1 : 0) + (d2Reg ? a2 : 0);
    const paidTotal = Number(inv.paid_total || 0);

    const regPaid = Math.min(regFee, paidTotal);

    return {
      id: inv.id,
      name: inv.full_name || "—",
      amount: regPaid,
    };
  })
  .filter((r) => r.amount > 0)
  .sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" })
  );

setRegCollectedDetails(regRows);

  // hover list uses {id,name,amount}
  setCurrentDetails(rows.map(({ courseTotal, ...rest }) => rest));

  setSummary((s) => ({
    ...s,
    monthKey,
    currentTotal,
    currentCount: rows.length,
    regCollectedTotal, // ✅
  }));
}


async function fetchUnpaidRevenueLive() {
  const monthKey = monthKeyNow();

  const { data, error } = await supabase
    .from("invoices")
    .select("id, full_name, status, month, paid_total, description1, amount1, description2, amount2")
    .eq("month", monthKey);

  if (error) return;

  const isReg = (desc) => {
    const d = String(desc || "").toLowerCase();
    return (
      d.includes("frais d'inscription") ||
      d.includes("frais d’inscription") ||
      d.includes("inscription") ||
      d.includes("registration")
    );
  };

  const rows = (data || [])
    .map((inv) => {
      const a1 = Number(inv.amount1 || 0);
      const a2 = Number(inv.amount2 || 0);

      const d1Reg = isReg(inv.description1);
      const d2Reg = isReg(inv.description2);

      // ✅ registration amount = sum of lines that look like registration
      const regFee = (d1Reg ? a1 : 0) + (d2Reg ? a2 : 0);

      // ✅ course amount = sum of lines that DO NOT look like registration
      const courseTotal = (!d1Reg ? a1 : 0) + (!d2Reg ? a2 : 0);

      const paidTotal = Number(inv.paid_total || 0);

      // ✅ payments cover registration first, then course
      const paidTowardCourse = Math.max(0, paidTotal - regFee);

      const remaining = courseTotal - paidTowardCourse;

      const regRemaining = Math.max(0, regFee - paidTotal);


      return {
        id: inv.id,
        name: inv.full_name || "—",
        status: inv.status,
        remaining,
        regRemaining,    // ✅ NEW
        courseTotal, // keep for debugging if needed
        regFee,      // keep for debugging if needed
      };
    })
    // ✅ remove "Plan / 0" invoices (no course amount)
    .filter((r) => r.courseTotal > 0)
    // ✅ only unpaid/partial with remaining course due
    .filter((r) => (r.status === "pending" || r.status === "partial") && r.remaining > 0)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" }));

  const unpaidTotal = rows.reduce((sum, r) => sum + Number(r.remaining || 0), 0);

  // ✅ registration still due — count only invoices that are pending/partial (same as unpaid logic)
const regUnpaidTotal = rows.reduce(
  (sum, r) => sum + Number(r.regRemaining || 0),
  0
);

// ✅ Registration fees unpaid (names)
const regUnpaidRows = (data || [])
  .map((inv) => {
    const a1 = Number(inv.amount1 || 0);
    const a2 = Number(inv.amount2 || 0);

    const d1Reg = isReg(inv.description1);
    const d2Reg = isReg(inv.description2);

    const regFee = (d1Reg ? a1 : 0) + (d2Reg ? a2 : 0);
    const paidTotal = Number(inv.paid_total || 0);

    const regRemaining = Math.max(0, regFee - paidTotal);

    return {
      id: inv.id,
      name: inv.full_name || "—",
      amount: regRemaining,
      status: inv.status,
    };
  })
  .filter((r) => (r.status === "pending" || r.status === "partial") && r.amount > 0)
  .sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" })
  );

setRegUnpaidDetails(regUnpaidRows);


  setUnpaidDetails(rows.map(({ courseTotal, regFee, regRemaining, ...rest }) => rest)); // don't show debug fields in hover
  setSummary((s) => ({
    ...s,
    monthKey,
    unpaidCount: rows.length,
    unpaidTotal,
    regUnpaidTotal, // ✅
  }));
}

async function fetchRevertedPaymentsLive() {
  const monthKey = monthKeyNow(); // "YYYY-MM-01" (matches invoices.month)

  const { data, error } = await supabase
    .from("invoice_items")
    .select(
      "id, amount, invoice_id, created_at, reverted, invoices!inner(id, full_name, invoice_no, status, month)"
    )
    .eq("reverted", true)
    .eq("invoices.month", monthKey) // ✅ CURRENT MONTH ONLY
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchRevertedPaymentsLive error:", error);
    return;
  }

  // ✅ aggregate per invoice (so hover list is clean)
  const byInvoice = new Map();

  for (const row of data || []) {
    const inv = row.invoices;
    const key = row.invoice_id;

    const prev = byInvoice.get(key) || {
      id: key,
      name: inv?.full_name || "—",
      invoiceNo: inv?.invoice_no || "—",
      amount: 0,
    };

    prev.amount += Number(row.amount || 0);
    byInvoice.set(key, prev);
  }

  const rows = Array.from(byInvoice.values()).sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" })
  );

  const revertedTotal = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  setRevertedDetails(rows);

  setSummary((s) => ({
    ...s,
    revertedTotal,
    revertedCount: rows.length,
  }));
}





    // ----------------- RENDER -----------------
    return (
      <div className="p-4 bg-white border rounded shadow">
        <h2 className="text-lg font-bold mb-4">Enregistrer un Paiement</h2>

        {/* ✅ LIVE Revenue Summary */}
<div className="mb-4 border rounded-lg bg-gray-50 p-3">
  <p className="text-xs text-gray-600">
    Live view — {summary.monthKey ? formatMonth(summary.monthKey) : "—"} (as of today)
  </p>
  <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
  <div
  ref={expectedCardRef}
  className="relative bg-white border rounded-lg p-3 cursor-pointer"
  onMouseEnter={() => setExpectedHovered(true)}
  onMouseLeave={() => setExpectedHovered(false)}
>
  <p className="text-sm text-gray-600">Expected revenue (active enrollments)</p>
  <p className="text-xl font-bold">{formatCurrencyUSD(summary.expectedTotal)}</p>
  <p className="text-xs text-gray-500 mt-1">
    Active enrollments today: <b>{summary.expectedCount}</b>
  </p>
</div>

<div
  ref={currentCardRef}
  className="relative bg-white border rounded-lg p-3 cursor-pointer"
  onMouseEnter={() => setCurrentHovered(true)}
  onMouseLeave={() => setCurrentHovered(false)}
>
  <p className="text-sm text-gray-600">Current revenue (approved payments MTD)</p>
  <p className="text-xl font-bold">
  {formatCurrencyUSD(summary.currentTotal)}

  {/* Desktop inline */}
  <span className="hidden md:inline text-sm font-medium text-gray-500">
    {" "} / ({formatCurrencyUSD(summary.regCollectedTotal)}) Registration fees
  </span>
</p>

{/* Mobile separate line */}
<p className="md:hidden text-sm font-medium text-gray-500 mt-1">
  Registration fees ({formatCurrencyUSD(summary.regCollectedTotal)})
</p>


    <p className="text-xs text-gray-500 mt-1">
    Approved payments MTD: <b>{summary.currentCount || 0}</b>
  </p>

</div>

<div
  ref={revertedCardRef}
  className="relative bg-white border rounded-lg p-3 cursor-pointer"
  onMouseEnter={() => setRevertedHovered(true)}
  onMouseLeave={() => setRevertedHovered(false)}
>
  <p className="text-sm text-gray-600">Reverted payments (MTD)</p>
  <p className="text-xl font-bold">{formatCurrencyUSD(summary.revertedTotal)}</p>

  <p className="text-xs text-gray-500 mt-1">
    Reverted payments: <b>{summary.revertedCount || 0}</b>
  </p>
</div>


<div
  ref={unpaidCardRef}
  className="relative bg-white border rounded-lg p-3 cursor-pointer"
  onMouseEnter={() => setUnpaidHovered(true)}
  onMouseLeave={() => setUnpaidHovered(false)}
>
  <p className="text-sm text-gray-600">Unpaid (current month)</p>
  <p className="text-xl font-bold">
  {formatCurrencyUSD(summary.unpaidTotal)}

  {/* Desktop inline */}
  <span className="hidden md:inline text-sm font-medium text-gray-500">
    {" "} / ({formatCurrencyUSD(summary.regUnpaidTotal)}) Registration fees
  </span>
</p>

{/* Mobile separate line */}
<p className="md:hidden text-sm font-medium text-gray-500 mt-1">
  Registration fees ({formatCurrencyUSD(summary.regUnpaidTotal)})
</p>


  <p className="text-xs text-gray-500 mt-1">
    Unpaid invoices: <b>{summary.unpaidCount}</b>
  </p>
</div>
</div>
</div>
<HoverOverlay
  anchorRef={expectedCardRef}
  visible={expectedHovered}
  onMouseEnter={() => setExpectedHovered(true)}
  onMouseLeave={() => setExpectedHovered(false)}
  width={420}
>
  <div className="px-4 py-3 text-sm">
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Active enrollments (today)
    </p>

    {expectedDetails.length === 0 ? (
      <p className="text-gray-500 italic text-center">—</p>
    ) : (
      <ul className="space-y-1 max-h-60 overflow-auto">
        {expectedDetails.map((r) => (
          <li
            key={r.id}
            className="flex justify-between gap-3 bg-blue-50 px-2 py-1 rounded-md"
          >
            <span className="truncate">
              {r.name} <span className="text-xs text-gray-500">({r.plan})</span>
            </span>
            <b className="whitespace-nowrap">{formatCurrencyUSD(r.price)}</b>
          </li>
        ))}
      </ul>
    )}
  </div>
</HoverOverlay>

<HoverOverlay
  anchorRef={currentCardRef}
  visible={currentHovered}
  onMouseEnter={() => setCurrentHovered(true)}
  onMouseLeave={() => setCurrentHovered(false)}
  width={420}
>
  <div className="px-4 py-3 text-sm">
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Approved payments (MTD)
    </p>

    {currentDetails.length === 0 ? (
      <p className="text-gray-500 italic text-center">—</p>
    ) : (
      <ul className="space-y-1 max-h-60 overflow-auto">
        {currentDetails.map((r) => (
          <li
            key={r.id}
            className="flex justify-between gap-3 bg-green-50 px-2 py-1 rounded-md"
          >
            <span className="truncate">{r.name}</span>
            <b className="whitespace-nowrap">{formatCurrencyUSD(r.amount)}</b>
          </li>
        ))}
      </ul>
    )}
 
  {regCollectedDetails.length > 0 && (
  <>
    <div className="my-3 border-t pt-3" />
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Registration fees collected (MTD)
    </p>

    <ul className="space-y-1 max-h-48 overflow-auto">
      {regCollectedDetails.map((r) => (
        <li
          key={r.id}
          className="flex justify-between gap-3 bg-emerald-50 px-2 py-1 rounded-md"
        >
          <span className="truncate">{r.name}</span>
          <b className="whitespace-nowrap">{formatCurrencyUSD(r.amount)}</b>
        </li>
      ))}
    </ul>
  </>
)}
 </div>
</HoverOverlay>

<HoverOverlay
  anchorRef={revertedCardRef}
  visible={revertedHovered}
  onMouseEnter={() => setRevertedHovered(true)}
  onMouseLeave={() => setRevertedHovered(false)}
  width={420}
>
  <div className="px-4 py-3 text-sm">
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Reverted payments (MTD)
    </p>

    {revertedDetails.length === 0 ? (
      <p className="text-gray-500 italic text-center">—</p>
    ) : (
      <ul className="space-y-1 max-h-60 overflow-auto">
        {revertedDetails.map((r) => (
          <li
            key={r.id}
            className="flex justify-between gap-3 bg-orange-50 px-2 py-1 rounded-md"
          >
            <span className="truncate">
              {r.name} <span className="text-xs text-gray-500">({r.invoiceNo})</span>
            </span>
            <b className="whitespace-nowrap">{formatCurrencyUSD(r.amount)}</b>
          </li>
        ))}
      </ul>
    )}
  </div>
</HoverOverlay>


<HoverOverlay
  anchorRef={unpaidCardRef}
  visible={unpaidHovered}
  onMouseEnter={() => setUnpaidHovered(true)}
  onMouseLeave={() => setUnpaidHovered(false)}
  width={420}
>
  <div className="px-4 py-3 text-sm">
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Unpaid invoices (current month)
    </p>

    {unpaidDetails.length === 0 ? (
      <p className="text-gray-500 italic text-center">Aucune facture impayée 🎉</p>
    ) : (
      <ul className="space-y-1 max-h-60 overflow-auto">
        {unpaidDetails.map((r) => (
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
  
  {regUnpaidDetails.length > 0 && (
  <>
    <div className="my-3 border-t pt-3" />
    <p className="font-semibold text-gray-800 mb-2 text-center">
      Registration fees unpaid (current month)
    </p>

    <ul className="space-y-1 max-h-48 overflow-auto">
      {regUnpaidDetails.map((r) => (
        <li
          key={r.id}
          className="flex justify-between gap-3 bg-rose-50 px-2 py-1 rounded-md"
        >
          <span className="truncate">{r.name}</span>
          <b className="whitespace-nowrap">{formatCurrencyUSD(r.amount)}</b>
        </li>
      ))}
    </ul>
  </>
)}
</div>
</HoverOverlay>



        {/* Select invoice */}
        <label className="block mb-2 font-medium">Choisir une facture</label>
        <select
          value={selectedInvoiceId}
          onChange={(e) => {
  setSelectedInvoiceId(e.target.value);
  setProofUrl(null);
  localStorage.removeItem("admin_payment_proof_url");
  if (proofInputRef.current) proofInputRef.current.value = "";
}}
          className="w-full border px-2 py-1 rounded mb-4"
        >
          <option value="">-- Sélectionner une facture --</option>
          {invoices.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.full_name} | Total: USD {inv.total} | Payé: USD{" "}
              {inv.paid_total} | Restant: USD {inv.total - inv.paid_total} | {formatMonth(inv.month)}
              
            </option>
          ))}
        </select>

        {/* Amount */}
        <label className="block mb-2 font-medium">Montant payé</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border px-2 py-1 rounded mb-4"
        />

        {/* Method */}
        <label className="block mb-2 font-medium">Méthode de paiement</label>
        <select
          value={method}
          onChange={(e) => {
  const value = e.target.value;
  setMethod(value);

  if (value !== "transfer") {
    setProofUrl(null);
    localStorage.removeItem("admin_payment_proof_url");
    if (proofInputRef.current) proofInputRef.current.value = "";
  }
}}
          className="w-full border px-2 py-1 rounded mb-4"
        >
          <option value="cash">Espèces</option>
          <option value="card">Carte</option>
          <option value="transfer">Virement</option>
          <option value="other">Autre</option>
        </select>

        {method === "transfer" && (
  <div className="mb-4">
    <label className="block mb-2 font-medium">
      Preuve de virement
    </label>

    <input
  ref={proofInputRef}
  type="file"
  accept=".pdf,.jpg,.jpeg,.png"
  onChange={(e) => handleProofPick(e?.target?.files?.[0])}
  className="w-full border px-2 py-1 rounded"
/>

    {uploadingProof && (
      <p className="text-sm text-gray-500 mt-2">Téléversement en cours...</p>
    )}

    {!uploadingProof && proofUrl && (
      <a
        href={proofUrl}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-blue-600 underline mt-2 inline-block"
      >
        Voir la preuve téléversée
      </a>
    )}
  </div>
)}

        {/* Notes */}
        <label className="block mb-2 font-medium">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full border px-2 py-1 rounded mb-4"
        ></textarea>

        {/* Submit */}
        <button
          onClick={handlePayment}
          disabled={loading}
          className="bg-aquaBlue text-white px-4 py-2 rounded hover:bg-orange-600"
        >
          {loading ? "Enregistrement..." : "Enregistrer Paiement"}
        </button>

        {/* 🔹 Pending Payments Section */}
<h2 className="text-lg font-bold mt-8 mb-4 text-yellow-700">
  Paiements en attente
</h2>

<div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-6">

  {/* EMPTY STATE */}
  {pendingPayments.length === 0 && (
    <p className="text-gray-600 text-sm text-center">
      Aucun paiement en attente.
    </p>
  )}

  {pendingPayments.length > 0 && (
    <>
      {/* ================= DESKTOP TABLE ================= */}
      <div className="hidden md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-yellow-100">
            <tr>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-left">Facture</th>
              <th className="px-3 py-2 text-left">Montant</th>
              <th className="px-3 py-2 text-left">Méthode</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Preuve</th>
              <th className="px-3 py-2 text-left">
                {role === "admin" ? "Actions" : "Statut"}
              </th>
            </tr>
          </thead>

          <tbody>
            {pendingPayments.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">
                  {p.invoices?.full_name || "—"}
                </td>

                <td className="px-3 py-2">
                  {p.invoices?.invoice_no || "—"}
                </td>

                <td className="px-3 py-2">
                  USD {Number(p.amount).toFixed(2)}
                </td>

                <td className="px-3 py-2 capitalize">
                  {p.method}
                </td>

                <td className="px-3 py-2">
                  {formatDateFrSafe(p.paid_at)}
                </td>

                <td className="px-3 py-2">
                  {p.method === "transfer" && p.invoices?.proof_url ? (
                    <a
                      href={p.invoices.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Voir preuve
                    </a>
                  ) : (
                    "—"
                  )}
                </td>

                {role === "admin" ? (
                  <td className="px-3 py-2 flex gap-2">
                    <button
                      onClick={() => approvePayment(p.id)}
                      className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                    >
                      Approuver
                    </button>
                    <button
                      onClick={() => rejectPayment(p.id)}
                      className="bg-red-500 text-white px-2 py-1 rounded text-xs"
                    >
                      Rejeter
                    </button>
                  </td>
                ) : (
                  <td className="px-3 py-2 text-yellow-700 font-medium">
                    En attente d’approbation
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ================= MOBILE CARDS ================= */}
      <div className="md:hidden space-y-3">
        {pendingPayments.map((p) => (
          <div
            key={p.id}
            className="bg-white border rounded-lg p-3 shadow-sm"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-gray-800">
                  {p.invoices?.full_name || "—"}
                </p>
                <p className="text-xs text-gray-500">
                  Facture: {p.invoices?.invoice_no || "—"}
                </p>
              </div>

              <span className="text-sm font-bold text-yellow-700">
                USD {Number(p.amount).toFixed(2)}
              </span>
            </div>

            <div className="mt-2 text-sm space-y-1">
              <p><b>Méthode:</b> {p.method}</p>
              <p><b>Date:</b> {formatDateFrSafe(p.paid_at)}</p>

              {p.method === "transfer" && p.invoices?.proof_url && (
                <a
                  href={p.invoices.proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline text-sm"
                >
                  Voir preuve
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="mt-3">
              {role === "admin" ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => approvePayment(p.id)}
                    className="flex-1 bg-green-600 text-white px-3 py-2 rounded text-sm"
                  >
                    Approuver
                  </button>
                  <button
                    onClick={() => rejectPayment(p.id)}
                    className="flex-1 bg-red-500 text-white px-3 py-2 rounded text-sm"
                  >
                    Rejeter
                  </button>
                </div>
              ) : (
                <p className="text-yellow-700 text-sm font-medium">
                  Paiement en attente d’approbation
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )}
</div>


        {/* Payment History */}
        <h2 className="text-lg font-bold mb-4">Historique des Paiements</h2>

        {/* Filter section */}
        <div className="mb-4">
          <label className="block mb-2 font-medium">Filtrer par client</label>
          <input
            type="text"
            placeholder="Rechercher un client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border px-2 py-1 rounded mb-2"
          />
          <select
            value={selectedProfileId}
            onChange={(e) => {
              setSelectedProfileId(e.target.value);
              setPage(1);
            }}
            className="w-full border px-2 py-1 rounded"
          >
            <option value="">-- Tous les clients --</option>
            {filteredProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Payments Table */}
        <div className="bg-gray-50 border rounded p-2">

  {/* DESKTOP TABLE */}
  <div className="hidden md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-200">
              <tr>
                <th className="px-3 py-2 text-left">Nom</th>
                <th className="px-3 py-2 text-left">Facture</th>
                <th className="px-3 py-2 text-left">Montant</th>
                <th className="px-3 py-2 text-left">Méthode</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Preuve</th>
                <th className="px-3 py-2 text-left">Notes</th>
                {role === "admin" && (
                  <th className="px-3 py-2 text-left">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">{p.invoices?.full_name || "—"}</td>
                  <td className="px-3 py-2">{p.invoices?.invoice_no}</td>
                  <td className="px-3 py-2">
                    USD {Number(p.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">{p.method}</td>
                  <td className="px-3 py-2">{formatDateFrSafe(p.paid_at)}</td>
                  <td className="px-3 py-2">
                    {p.invoices?.proof_url ? (
                      <a
                        href={p.invoices.proof_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        Voir preuve
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{p.notes || "—"}</td>
                {/* 🔁 Action column */}
                    {role === "admin" && (
                      <td className="px-3 py-2">
                        <button
                          onClick={() =>
                            handleRevertPayment(p.id, p.invoice_id, p.amount)
                          }
                          className="bg-red-100 text-red-700 border border-red-300 px-2 py-1 text-xs rounded hover:bg-red-200"
                        >
                          Annuler
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-gray-500">
                    Aucun paiement trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
         {/* MOBILE CARDS */}
  <div className="md:hidden space-y-3">
    {payments.map((p) => (
      <div key={p.id} className="bg-white border rounded-lg p-3 shadow-sm">
        <div className="flex justify-between">
          <div>
            <p className="font-semibold">{p.invoices?.full_name}</p>
            <p className="text-xs text-gray-500">
              Facture: {p.invoices?.invoice_no}
            </p>
          </div>
          <span className="font-bold text-blue-700">
            USD {Number(p.amount).toFixed(2)}
          </span>
        </div>

        <div className="mt-2 text-sm space-y-1">
          <p><b>Méthode:</b> {p.method}</p>
          <p><b>Date:</b> {formatDateFrSafe(p.paid_at)}</p>
          <p>
            <b>Preuve:</b>{" "}
            {p.invoices?.proof_url ? (
              <a
                href={p.invoices.proof_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                Voir preuve
              </a>
            ) : (
              "—"
            )}
          </p>
          {p.notes && <p><b>Notes:</b> {p.notes}</p>}
        </div>

        {role === "admin" && (
          <button
            onClick={() => handleRevertPayment(p.id, p.invoice_id, p.amount)}
            className="mt-3 w-full bg-red-100 text-red-700 border px-3 py-2 rounded text-sm"
          >
            Annuler
          </button>
        )}
      </div>
    ))}
  </div>

</div>

        {/* Pagination */}
        <div className="flex items-center justify-between p-3">
          <span className="text-xs text-gray-600">
            Page {page} / {totalPages}
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
    );
  }
