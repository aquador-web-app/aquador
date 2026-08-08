import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useGlobalAlert } from "../../../components/GlobalAlert";
import {
  FaCheck,
  FaClock,
  FaCreditCard,
  FaEye,
  FaFileInvoiceDollar,
  FaFilePdf,
  FaHistory,
  FaMoneyBillWave,
  FaPlus,
  FaRedo,
  FaSearch,
  FaTimes,
  FaUniversity,
  FaUser,
} from "react-icons/fa";

const HISTORY_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "approved", label: "Approuvés" },
  { id: "rejected", label: "Rejetés" },
  { id: "pending", label: "En attente" },
  { id: "manual", label: "Enregistrés par l’administration" },
  { id: "customer", label: "Soumis par les clients" },
];

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Port-au-Prince",
  }).format(date);
}

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getMethodInfo(method) {
  switch (method) {
    case "cash":
      return {
        label: "Espèces",
        icon: FaMoneyBillWave,
        classes: "bg-green-50 text-green-700 border-green-200",
      };
    case "card":
      return {
        label: "Carte",
        icon: FaCreditCard,
        classes: "bg-purple-50 text-purple-700 border-purple-200",
      };
    case "transfer":
      return {
        label: "Virement / dépôt / chèque",
        icon: FaUniversity,
        classes: "bg-blue-50 text-blue-700 border-blue-200",
      };
    default:
      return {
        label: method || "Non précisé",
        icon: FaMoneyBillWave,
        classes: "bg-gray-50 text-gray-700 border-gray-200",
      };
  }
}

function getStatusInfo(status) {
  switch (status) {
    case "approved":
      return {
        label: "Approuvé",
        icon: FaCheck,
        classes: "bg-green-100 text-green-700",
      };
    case "rejected":
      return {
        label: "Rejeté",
        icon: FaTimes,
        classes: "bg-red-100 text-red-700",
      };
    default:
      return {
        label: "En attente",
        icon: FaClock,
        classes: "bg-yellow-100 text-yellow-800",
      };
  }
}

function getInvoiceStatusLabel(status) {
  switch (status) {
    case "paid":
      return "Payée";
    case "partial":
      return "Partiellement payée";
    default:
      return "En attente";
  }
}

function ModalShell({ title, subtitle, onClose, children, disabled = false }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-6"
      onMouseDown={disabled ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
          <div>
            {subtitle && (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aquaBlue">
                {subtitle}
              </p>
            )}
            <h2 className="mt-1 text-2xl font-bold text-gray-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="rounded-lg px-3 py-2 text-xl text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AdminSpaInvoicesPayments() {
  const { showAlert, showConfirm } = useGlobalAlert();
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [activeView, setActiveView] = useState("pending");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingPaymentId, setProcessingPaymentId] = useState("");
  const [rejectPayment, setRejectPayment] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualInvoiceId, setManualInvoiceId] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualMethod, setManualMethod] = useState("cash");
  const [manualReference, setManualReference] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualPaidAt, setManualPaidAt] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [recordingManual, setRecordingManual] = useState(false);

  async function fetchData({ silent = false } = {}) {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [paymentsResult, invoicesResult] = await Promise.all([
        supabase
          .from("spa_payments")
          .select(`
            id,
            invoice_id,
            reservation_id,
            amount,
            method,
            reference,
            notes,
            proof_url,
            paid_at,
            approved,
            approved_at,
            approved_by,
            created_by,
            created_at,
            status,
            submitted_by,
            rejected_at,
            rejected_by,
            rejection_reason,
            updated_at,
            invoice:spa_invoices!spa_payments_invoice_id_fkey(
              id,
              reservation_id,
              invoice_no,
              customer_name,
              customer_phone,
              customer_email,
              appointment_start,
              subtotal_usd,
              discount_usd,
              total_amount_usd,
              paid_total_usd,
              status,
              pdf_url,
              issued_at,
              due_date
            ),
            reservation:massage_reservations!spa_payments_reservation_id_fkey(
              id,
              primary_customer_name,
              primary_customer_phone,
              primary_customer_email,
              people_count,
              appointment_start,
              status,
              payment_status,
              total_amount_usd
            )
          `)
          .order("created_at", { ascending: false }),
        supabase
          .from("spa_invoices")
          .select(`
            id,
            reservation_id,
            invoice_no,
            customer_name,
            customer_phone,
            customer_email,
            appointment_start,
            total_amount_usd,
            paid_total_usd,
            status
          `)
          .order("appointment_start", { ascending: false }),
      ]);

      if (paymentsResult.error) throw paymentsResult.error;
      if (invoicesResult.error) throw invoicesResult.error;
      setPayments(paymentsResult.data || []);
      setInvoices(invoicesResult.data || []);
    } catch (error) {
      console.error("Admin spa payments fetch error:", error);
      showAlert(error?.message || "Impossible de charger les paiements du spa.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(
    () => ({
      pending: payments.filter((payment) => payment.status === "pending").length,
      approved: payments.filter((payment) => payment.status === "approved").length,
      rejected: payments.filter((payment) => payment.status === "rejected").length,
      all: payments.length,
      manual: payments.filter(
        (payment) =>
          String(payment.submitted_by || "").toLowerCase() === "admin" ||
          Boolean(payment.created_by)
      ).length,
      customer: payments.filter(
        (payment) =>
          String(payment.submitted_by || "client").toLowerCase() !== "admin" &&
          !payment.created_by
      ).length,
    }),
    [payments]
  );

  const filteredPayments = useMemo(() => {
    const needle = normalizeSearchValue(search);

    return payments.filter((payment) => {
      if (activeView === "pending" && payment.status !== "pending") return false;

      if (activeView === "history") {
        const isManual =
          String(payment.submitted_by || "").toLowerCase() === "admin" ||
          Boolean(payment.created_by);

        if (historyFilter === "manual" && !isManual) return false;
        if (historyFilter === "customer" && isManual) return false;
        if (
          !["all", "manual", "customer"].includes(historyFilter) &&
          payment.status !== historyFilter
        ) {
          return false;
        }
      }

      if (!needle) return true;

      const invoice = payment.invoice || {};
      const reservation = payment.reservation || {};

      return normalizeSearchValue(
        [
          invoice.invoice_no,
          invoice.customer_name,
          invoice.customer_phone,
          invoice.customer_email,
          reservation.primary_customer_name,
          reservation.primary_customer_phone,
          reservation.primary_customer_email,
          payment.reference,
          payment.method,
          payment.amount,
          payment.status,
          payment.submitted_by,
          payment.notes,
          payment.rejection_reason,
        ].join(" ")
      ).includes(needle);
    });
  }, [payments, activeView, historyFilter, search]);

  const manualInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === manualInvoiceId) || null,
    [invoices, manualInvoiceId]
  );

  const unpaidInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoice.status !== "paid" &&
          Number(invoice.total_amount_usd || 0) -
            Number(invoice.paid_total_usd || 0) >
            0
      ),
    [invoices]
  );

  useEffect(() => {
    if (!manualInvoice) {
      setManualAmount("");
      return;
    }
    const remaining =
      Number(manualInvoice.total_amount_usd || 0) -
      Number(manualInvoice.paid_total_usd || 0);
    setManualAmount(Math.max(0, remaining).toFixed(2));
  }, [manualInvoice]);

  async function approvePayment(payment) {
    const confirmed = await showConfirm(
      `Approuver le paiement de ${formatCurrency(payment.amount)} pour la facture ${
        payment.invoice?.invoice_no || "sélectionnée"
      } ?`
    );
    if (!confirmed) return;
    setProcessingPaymentId(payment.id);
    try {
      const { data, error } = await supabase.rpc("admin_approve_spa_payment", {
        p_payment_id: payment.id,
      });
      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.message || "Le paiement n’a pas pu être approuvé.");
      }
      await fetchData({ silent: true });
      showAlert("Le paiement a été approuvé.");
    } catch (error) {
      console.error("Spa payment approval error:", error);
      showAlert(error?.message || "Erreur lors de l’approbation du paiement.");
    } finally {
      setProcessingPaymentId("");
    }
  }

  async function submitRejection(event) {
    event.preventDefault();
    if (!rejectPayment) return;
    const reason = rejectionReason.trim();
    if (!reason) {
      showAlert("Veuillez préciser le motif du rejet.");
      return;
    }
    setProcessingPaymentId(rejectPayment.id);
    try {
      const { data, error } = await supabase.rpc("admin_reject_spa_payment", {
        p_payment_id: rejectPayment.id,
        p_reason: reason,
      });
      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.message || "Le paiement n’a pas pu être rejeté.");
      }
      setRejectPayment(null);
      setRejectionReason("");
      await fetchData({ silent: true });
      showAlert("Le paiement a été rejeté.");
    } catch (error) {
      console.error("Spa payment rejection error:", error);
      showAlert(error?.message || "Erreur lors du rejet du paiement.");
    } finally {
      setProcessingPaymentId("");
    }
  }

  async function recordManualPayment(event) {
    event.preventDefault();
    if (!manualInvoice) {
      showAlert("Veuillez sélectionner une facture.");
      return;
    }
    const numericAmount = Number(manualAmount);
    const remaining =
      Number(manualInvoice.total_amount_usd || 0) -
      Number(manualInvoice.paid_total_usd || 0);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showAlert("Veuillez saisir un montant valide.");
      return;
    }
    if (numericAmount > remaining) {
      showAlert(
        `Le montant ne peut pas dépasser le solde restant de ${formatCurrency(remaining)}.`
      );
      return;
    }
    setRecordingManual(true);
    try {
      const { data, error } = await supabase.rpc("admin_record_spa_payment", {
        p_invoice_id: manualInvoice.id,
        p_amount: numericAmount,
        p_method: manualMethod,
        p_reference: manualReference.trim() || null,
        p_notes: manualNotes.trim() || null,
        p_paid_at: manualPaidAt
          ? new Date(manualPaidAt).toISOString()
          : new Date().toISOString(),
      });
      if (error) throw error;
      if (data?.success === false) {
        throw new Error(
          data?.message || "Le paiement manuel n’a pas pu être enregistré."
        );
      }
      setShowManualModal(false);
      resetManualForm();
      await fetchData({ silent: true });
      showAlert("Le paiement manuel a été enregistré et approuvé.");
    } catch (error) {
      console.error("Manual spa payment error:", error);
      showAlert(
        error?.message || "Erreur lors de l’enregistrement du paiement manuel."
      );
    } finally {
      setRecordingManual(false);
    }
  }

  function resetManualForm() {
    setManualInvoiceId("");
    setManualAmount("");
    setManualMethod("cash");
    setManualReference("");
    setManualNotes("");
    setManualPaidAt(new Date().toISOString().slice(0, 16));
  }

  async function openProof(payment) {
    if (!payment.proof_url) {
      showAlert("Aucune preuve n’est disponible pour ce paiement.");
      return;
    }
    try {
      if (/^https?:\/\//i.test(payment.proof_url)) {
        window.open(payment.proof_url, "_blank", "noopener,noreferrer");
        return;
      }
      const { data, error } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(payment.proof_url, 60 * 10);
      if (error) throw error;
      if (!data?.signedUrl) {
        throw new Error("Le lien de la preuve n’a pas pu être créé.");
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Spa proof open error:", error);
      showAlert(error?.message || "Impossible d’ouvrir la preuve de paiement.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-aquaBlue" />
          <p className="mt-4 text-sm text-gray-500">Chargement des paiements du spa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aquaBlue">Spa</p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-gray-900 md:text-3xl">
            <FaFileInvoiceDollar className="text-aquaBlue" />
            Paiements des factures
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Validez les paiements soumis par les clients et enregistrez les paiements reçus directement.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => fetchData({ silent: true })}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaRedo className={refreshing ? "animate-spin" : ""} />
            Actualiser
          </button>
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-aquaBlue px-4 py-3 font-semibold text-white shadow transition hover:opacity-90"
          >
            <FaPlus />
            Enregistrer un paiement
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setActiveView("pending")}
          className={`rounded-2xl border p-5 text-left transition ${
            activeView === "pending"
              ? "border-aquaBlue bg-blue-50 shadow-sm"
              : "border-gray-200 bg-white hover:border-blue-200"
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-600">Paiements en attente</p>
              <p className="mt-1 text-xs text-gray-500">
                Paiements qui doivent encore être approuvés ou rejetés.
              </p>
            </div>
            <div className="rounded-xl bg-yellow-100 p-3 text-yellow-700">
              <FaClock />
            </div>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">{counts.pending}</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("history")}
          className={`rounded-2xl border p-5 text-left transition ${
            activeView === "history"
              ? "border-aquaBlue bg-blue-50 shadow-sm"
              : "border-gray-200 bg-white hover:border-blue-200"
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-600">Historique des paiements</p>
              <p className="mt-1 text-xs text-gray-500">
                Tous les paiements soumis ou enregistrés, sans exception.
              </p>
            </div>
            <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
              <FaHistory />
            </div>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">{counts.all}</p>
        </button>
      </div>

      {activeView === "history" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {HISTORY_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setHistoryFilter(filter.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  historyFilter === filter.id
                    ? "bg-aquaBlue text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {filter.label} ({counts[filter.id]})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher par client, facture, téléphone, e-mail ou référence..."
            className="w-full rounded-xl border border-gray-300 py-3 pl-11 pr-4 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {filteredPayments.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <FaFileInvoiceDollar className="mx-auto text-4xl text-gray-300" />
          <p className="mt-4 font-semibold text-gray-700">
            {activeView === "pending"
              ? "Aucun paiement en attente"
              : "Aucun paiement dans l’historique"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Aucun paiement ne correspond au filtre sélectionné.
          </p>
        </div>
      ) : activeView === "history" ? (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Facture</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Mode</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500">Montant</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Origine</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Statut</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredPayments.map((payment) => {
                    const invoice = payment.invoice || {};
                    const reservation = payment.reservation || {};
                    const statusInfo = getStatusInfo(payment.status);
                    const methodInfo = getMethodInfo(payment.method);
                    const StatusIcon = statusInfo.icon;
                    const MethodIcon = methodInfo.icon;
                    const isManual =
                      String(payment.submitted_by || "").toLowerCase() === "admin" ||
                      Boolean(payment.created_by);

                    return (
                      <tr key={payment.id} className="align-top hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-600">
                          {formatDateTime(payment.paid_at || payment.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-gray-900">
                          {invoice.invoice_no || "—"}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold text-gray-900">
                            {invoice.customer_name ||
                              reservation.primary_customer_name ||
                              "Client spa"}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {invoice.customer_phone ||
                              reservation.primary_customer_phone ||
                              "—"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${methodInfo.classes}`}>
                            <MethodIcon />
                            {methodInfo.label}
                          </span>
                          {payment.reference && (
                            <p className="mt-2 max-w-[180px] truncate text-xs text-gray-500">
                              Réf. {payment.reference}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-bold text-gray-900">
                          {formatCurrency(payment.amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-600">
                          {isManual ? "Administration" : "Client"}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.classes}`}>
                            <StatusIcon />
                            {statusInfo.label}
                          </span>
                          {payment.status === "approved" && payment.approved_at && (
                            <p className="mt-2 text-xs text-gray-500">
                              {formatDateTime(payment.approved_at)}
                            </p>
                          )}
                          {payment.status === "rejected" && payment.rejected_at && (
                            <p className="mt-2 text-xs text-gray-500">
                              {formatDateTime(payment.rejected_at)}
                            </p>
                          )}
                          {payment.rejection_reason && (
                            <p className="mt-2 max-w-[220px] text-xs text-red-600">
                              {payment.rejection_reason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            {invoice.pdf_url && (
                              <button
                                type="button"
                                onClick={() =>
                                  window.open(
                                    invoice.pdf_url,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                                className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-700 transition hover:bg-blue-100"
                                title="Voir la facture"
                              >
                                <FaFilePdf />
                              </button>
                            )}
                            {payment.proof_url && (
                              <button
                                type="button"
                                onClick={() => openProof(payment)}
                                className="rounded-lg border border-gray-300 bg-white p-2 text-gray-700 transition hover:bg-gray-100"
                                title="Voir la preuve"
                              >
                                <FaEye />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4 md:hidden">
            {filteredPayments.map((payment) => {
              const invoice = payment.invoice || {};
              const reservation = payment.reservation || {};
              const statusInfo = getStatusInfo(payment.status);
              const methodInfo = getMethodInfo(payment.method);
              const StatusIcon = statusInfo.icon;
              const MethodIcon = methodInfo.icon;
              const isManual =
                String(payment.submitted_by || "").toLowerCase() === "admin" ||
                Boolean(payment.created_by);

              return (
                <article
                  key={payment.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-900">
                        {invoice.customer_name ||
                          reservation.primary_customer_name ||
                          "Client spa"}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {invoice.invoice_no || "Facture en préparation"}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.classes}`}>
                      <StatusIcon />
                      {statusInfo.label}
                    </span>
                  </div>

                  <p className="mt-4 text-2xl font-bold text-aquaBlue">
                    {formatCurrency(payment.amount)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${methodInfo.classes}`}>
                      <MethodIcon />
                      {methodInfo.label}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      {isManual ? "Administration" : "Client"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-gray-600">
                    <p>
                      <strong>Date :</strong>{" "}
                      {formatDateTime(payment.paid_at || payment.created_at)}
                    </p>
                    <p>
                      <strong>Référence :</strong> {payment.reference || "—"}
                    </p>
                    {payment.rejection_reason && (
                      <p className="text-red-600">
                        <strong>Motif du rejet :</strong>{" "}
                        {payment.rejection_reason}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
                    {invoice.pdf_url && (
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            invoice.pdf_url,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700"
                      >
                        <FaFilePdf />
                        Facture
                      </button>
                    )}
                    {payment.proof_url && (
                      <button
                        type="button"
                        onClick={() => openProof(payment)}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
                      >
                        <FaEye />
                        Preuve
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-5">
          {filteredPayments.map((payment) => {
            const invoice = payment.invoice || {};
            const reservation = payment.reservation || {};
            const statusInfo = getStatusInfo(payment.status);
            const methodInfo = getMethodInfo(payment.method);
            const StatusIcon = statusInfo.icon;
            const MethodIcon = methodInfo.icon;
            const remaining = Math.max(
              0,
              Number(invoice.total_amount_usd || 0) -
                Number(invoice.paid_total_usd || 0)
            );
            const processing = processingPaymentId === payment.id;

            return (
              <article
                key={payment.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-4 border-b border-gray-100 bg-gray-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <FaUser className="text-aquaBlue" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">
                        {invoice.customer_name ||
                          reservation.primary_customer_name ||
                          "Client spa"}
                      </h2>
                      <p className="text-sm text-gray-500">
                        {invoice.invoice_no || "Facture en préparation"}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${statusInfo.classes}`}>
                    <StatusIcon />
                    {statusInfo.label}
                  </span>
                </div>

                <div className="grid gap-6 p-5 xl:grid-cols-[1.15fr_1fr_1fr]">
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Client et rendez-vous
                    </h3>
                    <div className="mt-3 space-y-2 text-sm">
                      <p>
                        <span className="font-semibold text-gray-600">Téléphone :</span>{" "}
                        {invoice.customer_phone ||
                          reservation.primary_customer_phone ||
                          "—"}
                      </p>
                      <p>
                        <span className="font-semibold text-gray-600">E-mail :</span>{" "}
                        {invoice.customer_email ||
                          reservation.primary_customer_email ||
                          "—"}
                      </p>
                      <p>
                        <span className="font-semibold text-gray-600">Rendez-vous :</span>{" "}
                        {formatDateTime(
                          invoice.appointment_start ||
                            reservation.appointment_start
                        )}
                      </p>
                      <p>
                        <span className="font-semibold text-gray-600">Personnes :</span>{" "}
                        {reservation.people_count || "—"}
                      </p>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Facture
                    </h3>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Total</span>
                        <strong>{formatCurrency(invoice.total_amount_usd)}</strong>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Déjà payé</span>
                        <strong className="text-green-700">
                          {formatCurrency(invoice.paid_total_usd)}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-4 border-t border-gray-200 pt-2">
                        <span className="font-semibold text-gray-700">Solde actuel</span>
                        <strong className="text-red-600">
                          {formatCurrency(remaining)}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Statut</span>
                        <strong>{getInvoiceStatusLabel(invoice.status)}</strong>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Paiement soumis
                    </h3>
                    <div className="mt-3 space-y-3">
                      <p className="text-3xl font-bold text-aquaBlue">
                        {formatCurrency(payment.amount)}
                      </p>
                      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${methodInfo.classes}`}>
                        <MethodIcon />
                        {methodInfo.label}
                      </span>
                      <div className="space-y-1 text-sm">
                        <p>
                          <span className="font-semibold text-gray-600">Référence :</span>{" "}
                          {payment.reference || "—"}
                        </p>
                        <p>
                          <span className="font-semibold text-gray-600">Soumis le :</span>{" "}
                          {formatDateTime(payment.created_at || payment.paid_at)}
                        </p>
                        <p>
                          <span className="font-semibold text-gray-600">Soumis par :</span>{" "}
                          {payment.submitted_by || "client"}
                        </p>
                      </div>
                    </div>
                  </section>
                </div>

                {(payment.notes || payment.rejection_reason) && (
                  <div className="space-y-3 border-t border-gray-100 px-5 py-4">
                    {payment.notes && (
                      <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                        <strong>Note :</strong> {payment.notes}
                      </div>
                    )}
                    {payment.rejection_reason && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <strong>Motif du rejet :</strong>{" "}
                        {payment.rejection_reason}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
                  {invoice.pdf_url && (
                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          invoice.pdf_url,
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      <FaFilePdf />
                      Facture PDF
                    </button>
                  )}
                  {payment.proof_url && (
                    <button
                      type="button"
                      onClick={() => openProof(payment)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 font-semibold text-gray-700 transition hover:bg-gray-100"
                    >
                      <FaEye />
                      Voir la preuve
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setRejectPayment(payment);
                      setRejectionReason("");
                    }}
                    disabled={processing}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    <FaTimes />
                    Rejeter
                  </button>
                  <button
                    type="button"
                    onClick={() => approvePayment(payment)}
                    disabled={processing}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    <FaCheck />
                    {processing ? "Traitement..." : "Approuver"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rejectPayment && (
        <ModalShell
          title="Rejeter le paiement"
          subtitle={rejectPayment.invoice?.invoice_no || "Paiement spa"}
          onClose={() => {
            if (processingPaymentId) return;
            setRejectPayment(null);
            setRejectionReason("");
          }}
          disabled={Boolean(processingPaymentId)}
        >
          <form onSubmit={submitRejection} className="space-y-5 p-6">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Vous êtes sur le point de rejeter un paiement de <strong>{formatCurrency(rejectPayment.amount)}</strong>. Le client pourra soumettre un nouveau paiement après le rejet.
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Motif du rejet *</span>
              <textarea rows={4} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Ex. preuve illisible, montant incorrect, transaction introuvable..." className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100" required />
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setRejectPayment(null); setRejectionReason(""); }} disabled={Boolean(processingPaymentId)} className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">Annuler</button>
              <button type="submit" disabled={Boolean(processingPaymentId)} className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400">{processingPaymentId ? "Rejet..." : "Confirmer le rejet"}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {showManualModal && (
        <ModalShell
          title="Enregistrer un paiement"
          subtitle="Paiement reçu par l’administration"
          onClose={() => {
            if (recordingManual) return;
            setShowManualModal(false);
            resetManualForm();
          }}
          disabled={recordingManual}
        >
          <form onSubmit={recordManualPayment} className="space-y-5 p-6">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Facture *</span>
              <select value={manualInvoiceId} onChange={(event) => setManualInvoiceId(event.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100" required>
                <option value="">— Sélectionner une facture —</option>
                {unpaidInvoices.map((invoice) => {
                  const remaining = Number(invoice.total_amount_usd || 0) - Number(invoice.paid_total_usd || 0);
                  return <option key={invoice.id} value={invoice.id}>{invoice.invoice_no || "Sans numéro"} — {invoice.customer_name || "Client"} — {formatCurrency(remaining)}</option>;
                })}
              </select>
            </label>

            {manualInvoice && (
              <div className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
                <div><p className="text-xs uppercase tracking-wide text-gray-400">Client</p><p className="mt-1 font-semibold text-gray-800">{manualInvoice.customer_name || "—"}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-gray-400">Solde restant</p><p className="mt-1 font-bold text-red-600">{formatCurrency(Number(manualInvoice.total_amount_usd || 0) - Number(manualInvoice.paid_total_usd || 0))}</p></div>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Montant *</span>
                <input type="number" min="0.01" step="0.01" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100" required />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Mode de paiement *</span>
                <select value={manualMethod} onChange={(event) => setManualMethod(event.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100" required>
                  <option value="cash">Espèces</option>
                  <option value="transfer">Virement / dépôt / chèque</option>
                  <option value="card">Carte</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Date du paiement</span>
              <input type="datetime-local" value={manualPaidAt} onChange={(event) => setManualPaidAt(event.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Référence</span>
              <input type="text" value={manualReference} onChange={(event) => setManualReference(event.target.value)} placeholder="Numéro de transaction, reçu, dépôt..." className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Note</span>
              <textarea rows={3} value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} placeholder="Informations complémentaires..." className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100" />
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setShowManualModal(false); resetManualForm(); }} disabled={recordingManual} className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">Annuler</button>
              <button type="submit" disabled={recordingManual} className="rounded-xl bg-aquaBlue px-5 py-3 font-semibold text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-400">{recordingManual ? "Enregistrement..." : "Enregistrer"}</button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}