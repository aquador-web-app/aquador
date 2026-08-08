import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useGlobalAlert } from "../../../components/GlobalAlert";
import { formatDateFrSafe, formatCurrencyUSD, formatMonth } from "../../../lib/dateUtils";
import {
  FaArrowLeft,
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaDollarSign,
  FaEnvelope,
  FaEye,
  FaFileInvoiceDollar,
  FaFilePdf,
  FaMoneyBillWave,
  FaPhone,
  FaRedo,
  FaSearch,
  FaTimesCircle,
  FaUser,
  FaUsers,
} from "react-icons/fa";

const CLIENT_STATUS_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "active", label: "Actifs" },
  { id: "completed", label: "Terminés" },
  { id: "cancelled", label: "Annulés" },
  { id: "no_show", label: "Absents" },
  { id: "unpaid", label: "Avec solde" },
];

const PROFILE_TABS = [
  { id: "overview", label: "Aperçu" },
  { id: "appointments", label: "Rendez-vous" },
  { id: "invoices", label: "Factures" },
  { id: "payments", label: "Paiements" },
];

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const formattedDate = formatDateFrSafe(value);

  const formattedTime = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Port-au-Prince",
  }).format(date);

  return `${formattedDate} à ${formattedTime}`;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function getClientKey(row) {
  const phone =
    row.primary_customer_phone ||
    row.customer_phone ||
    row.phone ||
    "";

  const email =
    row.primary_customer_email ||
    row.customer_email ||
    row.email ||
    "";

  const name =
    row.primary_customer_name ||
    row.customer_name ||
    row.name ||
    "";

  const cleanPhone = normalizePhone(phone);
  if (cleanPhone) return `phone:${cleanPhone}`;

  const cleanEmail = normalize(email);
  if (cleanEmail) return `email:${cleanEmail}`;

  return `name:${normalize(name)}`;
}

function getAppointmentStatusInfo(status) {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmé",
        classes: "bg-blue-100 text-blue-700",
      };
    case "completed":
      return {
        label: "Terminé",
        classes: "bg-green-100 text-green-700",
      };
    case "cancelled":
      return {
        label: "Annulé",
        classes: "bg-red-100 text-red-700",
      };
    case "no_show":
      return {
        label: "Absent",
        classes: "bg-orange-100 text-orange-700",
      };
    default:
      return {
        label: "En attente",
        classes: "bg-yellow-100 text-yellow-800",
      };
  }
}

function getInvoiceStatusInfo(status) {
  switch (status) {
    case "paid":
      return {
        label: "Payée",
        classes: "bg-green-100 text-green-700",
      };
    case "partial":
      return {
        label: "Partiellement payée",
        classes: "bg-orange-100 text-orange-700",
      };
    default:
      return {
        label: "Impayée",
        classes: "bg-red-100 text-red-700",
      };
  }
}

function getPaymentStatusInfo(status) {
  switch (status) {
    case "approved":
      return {
        label: "Approuvé",
        classes: "bg-green-100 text-green-700",
      };
    case "rejected":
      return {
        label: "Rejeté",
        classes: "bg-red-100 text-red-700",
      };
    default:
      return {
        label: "En attente",
        classes: "bg-yellow-100 text-yellow-800",
      };
  }
}

function getPaymentMethodLabel(method) {
  switch (method) {
    case "cash":
      return "Espèces";
    case "card":
      return "Carte";
    case "transfer":
      return "Virement / dépôt / chèque";
    default:
      return method || "Non précisé";
  }
}

function getReservationDisplayStatus(reservations) {
  if (!reservations.length) return "inactive";

  const now = new Date();

  const hasUpcoming = reservations.some((reservation) => {
    const appointmentDate = new Date(reservation.appointment_start || 0);
    return (
      appointmentDate >= now &&
      !["cancelled", "completed", "no_show"].includes(reservation.status)
    );
  });

  if (hasUpcoming) return "active";

  const latest = [...reservations].sort(
    (a, b) =>
      new Date(b.appointment_start || b.created_at || 0) -
      new Date(a.appointment_start || a.created_at || 0)
  )[0];

  return latest?.status || "inactive";
}

function getDisplayStatusInfo(status) {
  switch (status) {
    case "active":
    case "confirmed":
    case "pending":
      return {
        label: "Actif",
        classes: "bg-blue-100 text-blue-700",
      };
    case "completed":
      return {
        label: "Terminé",
        classes: "bg-green-100 text-green-700",
      };
    case "cancelled":
      return {
        label: "Annulé",
        classes: "bg-red-100 text-red-700",
      };
    case "no_show":
      return {
        label: "Absent",
        classes: "bg-orange-100 text-orange-700",
      };
    default:
      return {
        label: "Inactif",
        classes: "bg-gray-100 text-gray-700",
      };
  }
}

function AdminSpaClientProfile({ client, onBack, onOpenProof }) {
  const [activeTab, setActiveTab] = useState("overview");

  const sortedReservations = useMemo(() => {
    const now = new Date();

    return [...client.reservations]
      .filter((reservation) => {
        const appointmentDate = new Date(
          reservation.appointment_start || 0
        );

        if (Number.isNaN(appointmentDate.getTime())) return false;

        return (
          appointmentDate >= now &&
          !["cancelled", "completed", "no_show"].includes(
            reservation.status
          )
        );
      })
      .sort(
        (a, b) =>
          new Date(a.appointment_start || a.created_at || 0) -
          new Date(b.appointment_start || b.created_at || 0)
      );
  }, [client.reservations]);

  const sortedInvoices = useMemo(
    () =>
      [...client.invoices].sort(
        (a, b) =>
          new Date(b.issued_at || b.created_at || 0) -
          new Date(a.issued_at || a.created_at || 0)
      ),
    [client.invoices]
  );

  const sortedPayments = useMemo(
    () =>
      [...client.payments].sort(
        (a, b) =>
          new Date(b.paid_at || b.created_at || 0) -
          new Date(a.paid_at || a.created_at || 0)
      ),
    [client.payments]
  );

  const statusInfo = getDisplayStatusInfo(client.displayStatus);

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 font-semibold text-gray-700 transition hover:bg-gray-50"
      >
        <FaArrowLeft />
        Retour aux clients
      </button>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 bg-gradient-to-r from-blue-50 to-white p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-aquaBlue text-2xl text-white shadow">
              <FaUser />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aquaBlue">
                Client spa
              </p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900 md:text-3xl">
                {client.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.classes}`}
                >
                  {statusInfo.label}
                </span>

                {client.outstandingBalance > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                    <FaDollarSign />
                    Solde {formatCurrencyUSD(client.outstandingBalance)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <a
              href={client.phone ? `tel:${client.phone}` : undefined}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-700"
            >
              <FaPhone className="text-aquaBlue" />
              {client.phone || "—"}
            </a>

            <a
              href={client.email ? `mailto:${client.email}` : undefined}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-700"
            >
              <FaEnvelope className="text-aquaBlue" />
              <span className="break-all">{client.email || "—"}</span>
            </a>
          </div>
        </div>

        <div className="flex overflow-x-auto border-t border-gray-200">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-w-fit border-b-2 px-5 py-4 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "border-aquaBlue text-aquaBlue"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Rendez-vous"
              value={client.visitCount}
              icon={FaCalendarAlt}
            />
            <SummaryCard
              label="Terminés"
              value={client.completedCount}
              icon={FaCheckCircle}
            />
            <SummaryCard
              label="Total payé"
              value={formatCurrencyUSD(client.totalPaid)}
              icon={FaMoneyBillWave}
            />
            <SummaryCard
              label="Solde restant"
              value={formatCurrencyUSD(client.outstandingBalance)}
              icon={FaDollarSign}
              danger={client.outstandingBalance > 0}
            />
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">
              Informations du client
            </h2>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <InfoItem label="Nom complet" value={client.name} />
              <InfoItem label="Téléphone" value={client.phone || "—"} />
              <InfoItem label="E-mail" value={client.email || "—"} />
              <InfoItem
  label="Date de naissance"
  value={
    client.birthDate
      ? formatDateFrSafe(client.birthDate)
      : "—"
  }
/>
              <InfoItem
                label="Première visite"
                value={formatDateTime(client.firstVisit)}
              />
              <InfoItem
                label="Dernière visite"
                value={formatDateTime(client.lastVisit)}
              />
              <InfoItem
                label="Prochaine visite"
                value={formatDateTime(client.nextVisit)}
              />
              <InfoItem
                label="Annulations"
                value={client.cancelledCount}
              />
              <InfoItem
                label="Absences"
                value={client.noShowCount}
              />
            </div>
          </section>
        </div>
      )}

      {activeTab === "appointments" && (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-bold text-gray-900">
              Rendez-vous à venir
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {sortedReservations.length} rendez-vous trouvé(s)
            </p>
          </div>

          {sortedReservations.length === 0 ? (
            <EmptyState text="Aucun rendez-vous à venir pour ce client." />
          ) : (
            <div className="divide-y divide-gray-100">
              {sortedReservations.map((reservation) => {
                const status =
                  getAppointmentStatusInfo(reservation.status);

                return (
                  <div
                    key={reservation.id}
                    className="grid gap-4 px-6 py-5 md:grid-cols-[1.2fr_1fr_auto]"
                  >
                    <div>
                      <p className="font-bold text-gray-900">
                        {formatDateTime(reservation.appointment_start)}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Réservation #{String(reservation.id || "").slice(0, 8)}
                      </p>
                    </div>

                    <div className="text-sm text-gray-600">
                      <p>
                        <strong>Personnes :</strong>{" "}
                        {reservation.people_count || 1}
                      </p>
                      <p className="mt-1">
                        <strong>Total :</strong>{" "}
                        {formatCurrencyUSD(reservation.total_amount_usd)}
                      </p>
                      <p className="mt-1">
                        <strong>Paiement :</strong>{" "}
                        {reservation.payment_status || "—"}
                      </p>
                    </div>

                    <span
                      className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${status.classes}`}
                    >
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "invoices" && (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-bold text-gray-900">
              Factures
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {sortedInvoices.length} facture(s)
            </p>
          </div>

          {sortedInvoices.length === 0 ? (
            <EmptyState text="Aucune facture pour ce client." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Facture</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Total</th>
                    <th className="px-5 py-3">Payé</th>
                    <th className="px-5 py-3">Solde</th>
                    <th className="px-5 py-3">Statut</th>
                    <th className="px-5 py-3 text-center">PDF</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {sortedInvoices.map((invoice) => {
                    const status = getInvoiceStatusInfo(invoice.status);
                    const balance = Math.max(
                      0,
                      Number(invoice.total_amount_usd || 0) -
                        Number(invoice.paid_total_usd || 0)
                    );

                    return (
                      <tr key={invoice.id}>
                        <td className="px-5 py-4 font-semibold text-gray-900">
                          {invoice.invoice_no || "Sans numéro"}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {formatDateTime(invoice.issued_at)}
                        </td>
                        <td className="px-5 py-4 font-semibold">
                          {formatCurrencyUSD(invoice.total_amount_usd)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-green-700">
                          {formatCurrencyUSD(invoice.paid_total_usd)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-red-600">
                          {formatCurrencyUSD(balance)}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${status.classes}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
  {invoice.pdf_url ? (
    <button
      type="button"
      onClick={() =>
        window.open(
          invoice.pdf_url,
          "_blank",
          "noopener,noreferrer"
        )
      }
      className="inline-flex items-center justify-center text-red-600 hover:text-red-700"
      title="Ouvrir le PDF"
    >
      <FaFilePdf className="text-xl" />
    </button>
  ) : (
    "—"
  )}
</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "payments" && (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-bold text-gray-900">
              Historique des paiements
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {sortedPayments.length} paiement(s)
            </p>
          </div>

          {sortedPayments.length === 0 ? (
            <EmptyState text="Aucun paiement pour ce client." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Facture</th>
                    <th className="px-5 py-3">Montant</th>
                    <th className="px-5 py-3">Méthode</th>
                    <th className="px-5 py-3">Référence</th>
                    <th className="px-5 py-3">Statut</th>
                    <th className="px-5 py-3 text-right">Documents</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {sortedPayments.map((payment) => {
                    const status = getPaymentStatusInfo(payment.status);

                    return (
                      <tr key={payment.id}>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {formatDateTime(
                            payment.paid_at || payment.created_at
                          )}
                        </td>
                        <td className="px-5 py-4 font-semibold text-gray-900">
                          {payment.invoice?.invoice_no || "—"}
                        </td>
                        <td className="px-5 py-4 font-bold text-aquaBlue">
                          {formatCurrencyUSD(payment.amount)}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {getPaymentMethodLabel(payment.method)}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {payment.reference || "—"}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${status.classes}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            {payment.invoice?.pdf_url && (
                              <button
                                type="button"
                                onClick={() =>
                                  window.open(
                                    payment.invoice.pdf_url,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700"
                              >
                                <FaFilePdf />
                                Facture
                              </button>
                            )}

                            {payment.proof_url && (
                              <button
                                type="button"
                                onClick={() => onOpenProof(payment)}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
                              >
                                <FaEye />
                                Preuve
                              </button>
                            )}

                            {!payment.invoice?.pdf_url &&
                              !payment.proof_url &&
                              "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, danger = false }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-500">{label}</p>
          <p
            className={`mt-2 text-2xl font-bold ${
              danger ? "text-red-600" : "text-gray-900"
            }`}
          >
            {value}
          </p>
        </div>
        <div
          className={`rounded-xl p-3 ${
            danger
              ? "bg-red-50 text-red-600"
              : "bg-blue-50 text-aquaBlue"
          }`}
        >
          <Icon />
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="p-12 text-center">
      <FaUsers className="mx-auto text-4xl text-gray-300" />
      <p className="mt-4 font-semibold text-gray-600">{text}</p>
    </div>
  );
}

export default function AdminSpaClients() {
  const { showAlert } = useGlobalAlert();

  const [reservations, setReservations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedClientKey, setSelectedClientKey] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState("az");

  async function fetchData({ silent = false } = {}) {
    silent ? setRefreshing(true) : setLoading(true);

    try {
      const [reservationsResult, invoicesResult, paymentsResult] =
        await Promise.all([
          supabase
            .from("massage_reservations")
            .select(`
              id,
              primary_customer_name,
              primary_customer_phone,
              primary_customer_email,
              primary_customer_birth_date,
              people_count,
              appointment_start,
              status,
              payment_status,
              subtotal_usd,
              total_amount_usd,
              created_at,
              updated_at
            `)
            .order("appointment_start", { ascending: false }),

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
              subtotal_usd,
              discount_usd,
              total_amount_usd,
              paid_total_usd,
              status,
              pdf_url,
              issued_at,
              due_date,
              created_at
            `)
            .order("issued_at", { ascending: false }),

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
              approved_at,
              rejected_at,
              rejection_reason,
              created_at,
              status,
              submitted_by,
              invoice:spa_invoices!spa_payments_invoice_id_fkey(
                id,
                invoice_no,
                customer_name,
                customer_phone,
                customer_email,
                pdf_url
              )
            `)
            .order("created_at", { ascending: false }),
        ]);

      if (reservationsResult.error) throw reservationsResult.error;
      if (invoicesResult.error) throw invoicesResult.error;
      if (paymentsResult.error) throw paymentsResult.error;

      setReservations(reservationsResult.data || []);
      setInvoices(invoicesResult.data || []);
      setPayments(paymentsResult.data || []);
    } catch (error) {
      console.error("Admin spa clients fetch error:", error);
      showAlert(
        error?.message || "Impossible de charger les clients du spa."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clients = useMemo(() => {
    const map = new Map();

    function ensureClient(key, values = {}) {
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: values.name || "Client spa",
          phone: values.phone || "",
          email: values.email || "",
          birthDate: values.birthDate || null,
          reservations: [],
          invoices: [],
          payments: [],
        });
      }

      const client = map.get(key);

      if (!client.name || client.name === "Client spa") {
        client.name = values.name || client.name;
      }

      if (!client.phone) client.phone = values.phone || "";
      if (!client.email) client.email = values.email || "";
      if (!client.birthDate) client.birthDate = values.birthDate || null;

      return client;
    }

    reservations.forEach((reservation) => {
      const key = getClientKey(reservation);
      const client = ensureClient(key, {
        name: reservation.primary_customer_name,
        phone: reservation.primary_customer_phone,
        email: reservation.primary_customer_email,
        birthDate: reservation.primary_customer_birth_date,
      });

      client.reservations.push(reservation);
    });

    invoices.forEach((invoice) => {
      const key = getClientKey(invoice);
      const client = ensureClient(key, {
        name: invoice.customer_name,
        phone: invoice.customer_phone,
        email: invoice.customer_email,
      });

      client.invoices.push(invoice);
    });

    payments.forEach((payment) => {
      const invoice = payment.invoice || {};
      const key = getClientKey(invoice);

      const client = ensureClient(key, {
        name: invoice.customer_name,
        phone: invoice.customer_phone,
        email: invoice.customer_email,
      });

      client.payments.push(payment);
    });

    const now = new Date();

    return Array.from(map.values()).map((client) => {
      const appointmentDates = client.reservations
        .map((reservation) => new Date(reservation.appointment_start || 0))
        .filter((date) => !Number.isNaN(date.getTime()));

      const pastDates = appointmentDates
        .filter((date) => date < now)
        .sort((a, b) => b - a);

      const futureDates = appointmentDates
        .filter((date) => date >= now)
        .sort((a, b) => a - b);

      const completedCount = client.reservations.filter(
        (reservation) => reservation.status === "completed"
      ).length;

      const cancelledCount = client.reservations.filter(
        (reservation) => reservation.status === "cancelled"
      ).length;

      const noShowCount = client.reservations.filter(
        (reservation) => reservation.status === "no_show"
      ).length;

      const totalPaid = client.payments
        .filter((payment) => payment.status === "approved")
        .reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        );

      const outstandingBalance = client.invoices.reduce(
        (sum, invoice) =>
          sum +
          Math.max(
            0,
            Number(invoice.total_amount_usd || 0) -
              Number(invoice.paid_total_usd || 0)
          ),
        0
      );

      return {
        ...client,
        visitCount: client.reservations.length,
        completedCount,
        cancelledCount,
        noShowCount,
        firstVisit:
          appointmentDates.length > 0
            ? [...appointmentDates].sort((a, b) => a - b)[0]
            : null,
        lastVisit: pastDates[0] || null,
        nextVisit: futureDates[0] || null,
        totalPaid,
        outstandingBalance,
        hasUnpaid: outstandingBalance > 0,
        displayStatus: getReservationDisplayStatus(client.reservations),
      };
    });
  }, [reservations, invoices, payments]);

  const filteredClients = useMemo(() => {
    const needle = normalize(search);

    return clients
      .filter((client) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "unpaid") return client.hasUnpaid;
        if (statusFilter === "active") {
          return ["active", "confirmed", "pending"].includes(
            client.displayStatus
          );
        }
        return client.displayStatus === statusFilter;
      })
      .filter((client) => {
        if (!needle) return true;

        return normalize(
          [
            client.name,
            client.phone,
            client.email,
            ...client.invoices.map((invoice) => invoice.invoice_no),
          ].join(" ")
        ).includes(needle);
      })
      .sort((a, b) => {
        if (sortMode === "newest") {
          return (
            new Date(b.firstVisit || 0) -
            new Date(a.firstVisit || 0)
          );
        }

        if (sortMode === "oldest") {
          return (
            new Date(a.firstVisit || 0) -
            new Date(b.firstVisit || 0)
          );
        }

        if (sortMode === "most_visits") {
          return b.visitCount - a.visitCount;
        }

        if (sortMode === "highest_balance") {
          return b.outstandingBalance - a.outstandingBalance;
        }

        if (sortMode === "za") {
          return normalize(b.name).localeCompare(normalize(a.name));
        }

        return normalize(a.name).localeCompare(normalize(b.name));
      });
  }, [clients, search, statusFilter, sortMode]);

  const selectedClient = useMemo(
    () =>
      clients.find((client) => client.key === selectedClientKey) ||
      null,
    [clients, selectedClientKey]
  );

  async function openProof(payment) {
    if (!payment.proof_url) {
      showAlert("Aucune preuve n’est disponible pour ce paiement.");
      return;
    }

    try {
      if (/^https?:\/\//i.test(payment.proof_url)) {
        window.open(
          payment.proof_url,
          "_blank",
          "noopener,noreferrer"
        );
        return;
      }

      const { data, error } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(payment.proof_url, 60 * 10);

      if (error) throw error;
      if (!data?.signedUrl) {
        throw new Error("Le lien de la preuve n’a pas pu être créé.");
      }

      window.open(
        data.signedUrl,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (error) {
      console.error("Spa client proof open error:", error);
      showAlert(
        error?.message ||
          "Impossible d’ouvrir la preuve de paiement."
      );
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-aquaBlue" />
          <p className="mt-4 text-sm text-gray-500">
            Chargement des clients du spa...
          </p>
        </div>
      </div>
    );
  }

  if (selectedClient) {
    return (
      <div className="mx-auto w-full max-w-7xl pb-10">
        <AdminSpaClientProfile
          client={selectedClient}
          onBack={() => setSelectedClientKey("")}
          onOpenProof={openProof}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <section className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aquaBlue">
            Spa
          </p>

          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-gray-900 md:text-3xl">
            <FaUsers className="text-aquaBlue" />
            Clients
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Consultez les coordonnées, rendez-vous, factures et paiements de chaque client.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchData({ silent: true })}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaRedo className={refreshing ? "animate-spin" : ""} />
          Actualiser
        </button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Clients"
          value={clients.length}
          icon={FaUsers}
        />
        <SummaryCard
          label="Clients actifs"
          value={
            clients.filter((client) =>
              ["active", "confirmed", "pending"].includes(
                client.displayStatus
              )
            ).length
          }
          icon={FaClock}
        />
        <SummaryCard
          label="Avec solde"
          value={clients.filter((client) => client.hasUnpaid).length}
          icon={FaDollarSign}
          danger={clients.some((client) => client.hasUnpaid)}
        />
        <SummaryCard
          label="Total à recevoir"
          value={formatCurrencyUSD (
            clients.reduce(
              (sum, client) =>
                sum + client.outstandingBalance,
              0
            )
          )}
          icon={FaMoneyBillWave}
          danger={clients.some((client) => client.hasUnpaid)}
        />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_210px_210px]">
          <div className="relative">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom, téléphone, e-mail ou facture..."
              className="w-full rounded-xl border border-gray-300 py-3 pl-11 pr-4 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
          >
            {CLIENT_STATUS_FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>

          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
          >
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="newest">Plus récents</option>
            <option value="oldest">Plus anciens</option>
            <option value="most_visits">Plus de visites</option>
            <option value="highest_balance">Solde le plus élevé</option>
          </select>
        </div>
      </section>

      <section className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[1250px] w-full">
            <thead className="bg-aquaBlue text-left text-sm text-white">
              <tr>
                <th className="px-5 py-4">Client</th>
                <th className="px-5 py-4">Téléphone</th>
                <th className="px-5 py-4">E-mail</th>
                <th className="px-5 py-4 text-center">Visites</th>
                <th className="px-5 py-4">Dernière visite</th>
                <th className="px-5 py-4">Prochaine visite</th>
                <th className="px-5 py-4 text-right">Solde</th>
                <th className="px-5 py-4 text-center">Statut</th>
                <th className="px-5 py-4 text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredClients.map((client) => {
                const statusInfo =
                  getDisplayStatusInfo(client.displayStatus);

                return (
                  <tr
                    key={client.key}
                    onClick={() =>
                      setSelectedClientKey(client.key)
                    }
                    className="cursor-pointer transition hover:bg-blue-50"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-50 p-3 text-aquaBlue">
                          <FaUser />
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-gray-900">
                              {client.name}
                            </p>

                            {client.hasUnpaid && (
                              <FaDollarSign
                                className="text-red-500"
                                title="Solde impayé"
                              />
                            )}
                          </div>

                          <p className="mt-1 text-xs text-gray-500">
                            Première visite :{" "}
                            {formatDateTime(client.firstVisit)}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {client.phone ? (
                        <a
                          href={`tel:${client.phone}`}
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                          className="text-blue-600 hover:underline"
                        >
                          {client.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {client.email ? (
                        <a
                          href={`mailto:${client.email}`}
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                          className="text-blue-600 hover:underline"
                        >
                          {client.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="px-5 py-4 text-center font-bold">
                      {client.visitCount}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600">
                      {formatDateTime(client.lastVisit)}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600">
                      {formatDateTime(client.nextVisit)}
                    </td>

                    <td
                      className={`px-5 py-4 text-right font-bold ${
                        client.outstandingBalance > 0
                          ? "text-red-600"
                          : "text-green-700"
                      }`}
                    >
                      {formatCurrencyUSD(client.outstandingBalance)}
                    </td>

                    <td className="px-5 py-4 text-center">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.classes}`}
                      >
                        {statusInfo.label}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedClientKey(client.key);
                        }}
                        className="rounded-lg bg-aquaBlue px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        Voir le profil
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredClients.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-gray-500"
                  >
                    Aucun client ne correspond aux filtres sélectionnés.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 md:hidden">
        {filteredClients.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <FaUsers className="mx-auto text-4xl text-gray-300" />
            <p className="mt-4 font-semibold text-gray-600">
              Aucun client trouvé
            </p>
          </div>
        ) : (
          filteredClients.map((client) => {
            const statusInfo =
              getDisplayStatusInfo(client.displayStatus);

            return (
              <article
                key={client.key}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-900">
                        {client.name}
                      </h2>

                      {client.hasUnpaid && (
                        <FaDollarSign className="text-red-500" />
                      )}
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      {client.visitCount} rendez-vous
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.classes}`}
                  >
                    {statusInfo.label}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm text-gray-600">
                  <p>
                    <strong>Téléphone :</strong>{" "}
                    {client.phone || "—"}
                  </p>

                  <p>
                    <strong>E-mail :</strong>{" "}
                    {client.email || "—"}
                  </p>

                  <p>
                    <strong>Dernière visite :</strong>{" "}
                    {formatDateTime(client.lastVisit)}
                  </p>

                  <p>
                    <strong>Prochaine visite :</strong>{" "}
                    {formatDateTime(client.nextVisit)}
                  </p>

                  <p>
                    <strong>Solde :</strong>{" "}
                    <span
                      className={
                        client.outstandingBalance > 0
                          ? "font-bold text-red-600"
                          : "font-bold text-green-700"
                      }
                    >
                      {formatCurrencyUSD(client.outstandingBalance)}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedClientKey(client.key)
                  }
                  className="mt-5 w-full rounded-xl bg-aquaBlue px-4 py-3 font-semibold text-white"
                >
                  Voir le profil
                </button>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}