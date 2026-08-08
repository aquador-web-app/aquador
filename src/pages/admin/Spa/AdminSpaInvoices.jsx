import { useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { supabase } from "../../../lib/supabaseClient";

const PAGE_SIZE = 15;
const HAITI_TIME_ZONE = "America/Port-au-Prince";

const SPA_INVOICE_BUCKET = "spa_invoices";

function resolveStorageUrl(value, bucket = SPA_INVOICE_BUCKET) {
  if (!value) return null;

  const stringValue = String(value);

  if (stringValue.startsWith("http")) {
    return stringValue;
  }

  return supabase.storage
    .from(bucket)
    .getPublicUrl(stringValue).data.publicUrl;
}

function getInvoicePdfUrl(invoice) {
  return resolveStorageUrl(
    invoice.pdf_url ||
      invoice.invoice_pdf_url ||
      invoice.invoice_url ||
      null
  );
}

const RESERVATION_STATUSES = [
  "all",
  "pending",
  "payment_review",
  "confirmed",
  "completed",
  "cancelled",
  "expired",
  "no_show",
];

const PAYMENT_STATUSES = [
  "all",
  "unpaid",
  "pending_review",
  "paid",
  "rejected",
  "refunded",
];

const STATUS_LABELS = {
  all: "Tous",
  pending: "En attente",
  payment_review: "Paiement en vérification",
  confirmed: "Confirmée",
  completed: "Terminée",
  cancelled: "Annulée",
  expired: "Expirée",
  no_show: "Absence",
};

const PAYMENT_LABELS = {
  all: "Tous",
  unpaid: "Non payé",
  pending_review: "En vérification",
  paid: "Payé",
  rejected: "Rejeté",
  refunded: "Remboursé",
};

function formatCurrencyUSD(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatDateFr(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: HAITI_TIME_ZONE,
  }).format(date);
}

function formatDateShort(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: HAITI_TIME_ZONE,
  }).format(date);
}

function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HAITI_TIME_ZONE,
  }).format(date);
}

function dateKey(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HAITI_TIME_ZONE,
  }).format(date);
}

function normalizeAppointments(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getReservationReference(reservation) {
  if (reservation.invoice_no) return reservation.invoice_no;
  if (reservation.reservation_no) return reservation.reservation_no;
  if (reservation.reference_no) return reservation.reference_no;
  if (reservation.payment_reference) return reservation.payment_reference;

  if (reservation.id) {
    return `SPA-${String(reservation.id)
      .replaceAll("-", "")
      .slice(0, 8)
      .toUpperCase()}`;
  }

  return "—";
}

function getCustomerName(reservation) {
  return (
    reservation.primary_customer_name ||
    reservation.customer_name ||
    reservation.full_name ||
    "Client Spa"
  );
}

function getCustomerPhone(reservation) {
  return (
    reservation.primary_customer_phone ||
    reservation.customer_phone ||
    reservation.phone ||
    ""
  );
}

function getCustomerEmail(reservation) {
  return (
    reservation.primary_customer_email ||
    reservation.customer_email ||
    reservation.email ||
    ""
  );
}

function getServices(reservation) {
  const appointments = normalizeAppointments(reservation.appointments);

  return appointments.map((appointment, index) => ({
    id: appointment.id || `${reservation.id}-${index}`,
    customerName:
      appointment.customer_name ||
      appointment.guest_name ||
      getCustomerName(reservation),
    serviceName:
      appointment.service_name ||
      appointment.service?.name ||
      "Service Spa",
    duration:
      appointment.duration_minutes ||
      appointment.option?.duration_minutes ||
      null,
    roomName:
      appointment.room_name ||
      appointment.room?.name ||
      "",
    amount:
      appointment.price_usd ??
      appointment.amount_usd ??
      appointment.price ??
      0,
  }));
}

export default function AdminSpaInvoices() {
  const [allInvoices, setAllInvoices] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedInvoices, setExpandedInvoices] = useState({});

  const [reservationStatus, setReservationStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [nameFilter, setNameFilter] = useState("");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "admin_get_spa_reservations",
        {
          p_search: null,
          p_status: null,
          p_payment_status: null,
          p_from: null,
          p_to: null,
          p_limit: 1000,
          p_offset: 0,
        }
      );

      if (error) throw error;

      const reservations = data || [];

/*
 * Get the actual invoice records because pdf_url is stored
 * in public.spa_invoices, not massage_reservations.
 */
const reservationIds = reservations
  .map((reservation) => reservation.id)
  .filter(Boolean);

let spaInvoices = [];

if (reservationIds.length > 0) {
  const { data: invoiceData, error: invoiceError } = await supabase
    .from("spa_invoices")
    .select(`
      id,
      reservation_id,
      invoice_no,
      status,
      subtotal_usd,
      discount_usd,
      total_amount_usd,
      paid_total_usd,
      pdf_url,
      issued_at,
      due_date,
      created_at,
      updated_at
    `)
    .in("reservation_id", reservationIds);

  if (invoiceError) throw invoiceError;

  spaInvoices = invoiceData || [];
}

/*
 * Create a lookup:
 * reservation ID -> Spa invoice
 */
const invoicesByReservationId = new Map(
  spaInvoices.map((invoice) => [
    invoice.reservation_id,
    invoice,
  ])
);

const normalized = reservations.map((reservation) => {
  const spaInvoice =
    invoicesByReservationId.get(reservation.id) || null;

  return {
    ...reservation,

    appointments: normalizeAppointments(
      reservation.appointments
    ),

    client_name:
      spaInvoice?.customer_name ||
      getCustomerName(reservation),

    client_phone:
      spaInvoice?.customer_phone ||
      getCustomerPhone(reservation),

    client_email:
      spaInvoice?.customer_email ||
      getCustomerEmail(reservation),

    /*
     * Keep reservation ID because appointments and grouping
     * belong to the reservation.
     */
    reservation_id: reservation.id,

    /*
     * Actual Spa invoice information.
     */
    invoice_id: spaInvoice?.id || null,
    invoice_no: spaInvoice?.invoice_no || null,
    invoice_status: spaInvoice?.status || null,

    reference:
      spaInvoice?.invoice_no ||
      getReservationReference(reservation),

    subtotal_usd: Number(
      spaInvoice?.subtotal_usd ??
        reservation.total_amount_usd ??
        0
    ),

    discount_usd: Number(
      spaInvoice?.discount_usd || 0
    ),

    total_amount_usd: Number(
      spaInvoice?.total_amount_usd ??
        reservation.total_amount_usd ??
        0
    ),

    paid_total_usd: Number(
      spaInvoice?.paid_total_usd || 0
    ),

    /*
     * This is the important field for the PDF button.
     */
    pdf_url: spaInvoice?.pdf_url || null,

    issued_at: spaInvoice?.issued_at || null,
    due_date: spaInvoice?.due_date || null,
  };
});

setAllInvoices(normalized);
    } catch (error) {
      console.error("Erreur chargement factures Spa :", error);
      setAllInvoices([]);
      setErrorMessage(
        error?.message || "Impossible de charger les factures Spa."
      );
    } finally {
      setLoading(false);
    }
  }

  const nameOptions = useMemo(() => {
    const names = new Set();

    for (const invoice of allInvoices) {
      if (invoice.client_name) {
        names.add(invoice.client_name);
      }
    }

    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, "fr", {
        sensitivity: "base",
      })
    );
  }, [allInvoices]);

  const filteredInvoices = useMemo(() => {
  return allInvoices.filter((invoice) => {
    const normalizedReservationStatus = String(
      invoice.status || ""
    ).toLowerCase();

    const normalizedPaymentStatus = String(
      invoice.payment_status || ""
    ).toLowerCase();

    /*
     * Do not show expired reservations in the general list.
     * They remain visible when "Expirée" is selected.
     */
    if (
      reservationStatus === "all" &&
      normalizedReservationStatus === "expired"
    ) {
      return false;
    }

    if (
      reservationStatus !== "all" &&
      normalizedReservationStatus !== reservationStatus
    ) {
      return false;
    }

    if (
      paymentStatus !== "all" &&
      normalizedPaymentStatus !== paymentStatus
    ) {
      return false;
    }

    if (nameFilter && invoice.client_name !== nameFilter) {
      return false;
    }

    const appointmentDate = invoice.appointment_start
      ? new Date(invoice.appointment_start)
      : null;

    if (
      appointmentDate &&
      !Number.isNaN(appointmentDate.getTime())
    ) {
      if (startDate) {
        const minimum = new Date(startDate);
        minimum.setHours(0, 0, 0, 0);

        if (appointmentDate < minimum) return false;
      }

      if (endDate) {
        const maximum = new Date(endDate);
        maximum.setHours(23, 59, 59, 999);

        if (appointmentDate > maximum) return false;
      }
    }

    return true;
  });
}, [
  allInvoices,
  reservationStatus,
  paymentStatus,
  nameFilter,
  startDate,
  endDate,
]);

  useEffect(() => {
    setPage(1);
  }, [
    reservationStatus,
    paymentStatus,
    nameFilter,
    startDate,
    endDate,
  ]);

  const invoiceGroups = useMemo(() => {
    const grouped = {};

    for (const invoice of filteredInvoices) {
      const key =
        dateKey(invoice.appointment_start) ||
        `sans-date-${invoice.id}`;

      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          date: invoice.appointment_start,
          invoices: [],
        };
      }

      grouped[key].invoices.push(invoice);
    }

    return Object.values(grouped)
      .map((group) => ({
        ...group,
        invoices: [...group.invoices].sort((a, b) => {
          const timeA = new Date(a.appointment_start || 0).getTime();
          const timeB = new Date(b.appointment_start || 0).getTime();

          return timeA - timeB;
        }),
      }))
      .sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();

        return dateB - dateA;
      });
  }, [filteredInvoices]);

  const totalGroups = invoiceGroups.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalGroups / PAGE_SIZE)
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return invoiceGroups.slice(start, start + PAGE_SIZE);
  }, [invoiceGroups, page]);

    const countableInvoices = useMemo(() => {
  return filteredInvoices.filter(
    (invoice) => !isExpiredReservation(invoice)
  );
}, [filteredInvoices]);

  const summary = useMemo(() => {
  return countableInvoices.reduce(
    (totals, invoice) => {
      const totalAmount = Number(
        invoice.total_amount_usd || 0
      );

      const paidAmount = Number(
        invoice.paid_total_usd || 0
      );

      totals.total += totalAmount;
      totals.paid += paidAmount;
      totals.remaining += Math.max(
        totalAmount - paidAmount,
        0
      );

      return totals;
    },
    {
      total: 0,
      paid: 0,
      remaining: 0,
    }
  );
}, [countableInvoices]);


  const firstRow =
    totalGroups === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;

  const lastRow = Math.min(
    page * PAGE_SIZE,
    totalGroups
  );

  function resetFilters() {
    setReservationStatus("all");
    setPaymentStatus("all");
    setNameFilter("");
    setStartDate(null);
    setEndDate(null);
  }

  function toggleGroup(groupId) {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  function toggleInvoice(invoiceId) {
    setExpandedInvoices((current) => ({
      ...current,
      [invoiceId]: !current[invoiceId],
    }));
  }

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4 lg:px-6">
      <header className="mb-5 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800 sm:text-2xl lg:text-3xl">
              Factures Spa
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Gestion des factures liées aux réservations Spa
            </p>
          </div>

          <button
            type="button"
            onClick={loadInvoices}
            disabled={loading}
            className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Chargement..." : "Recharger"}
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
          <SelectField
            label="Statut de réservation"
            value={reservationStatus}
            onChange={setReservationStatus}
            options={RESERVATION_STATUSES.map((status) => ({
              value: status,
              label: STATUS_LABELS[status] || status,
            }))}
          />

          <SelectField
            label="Statut du paiement"
            value={paymentStatus}
            onChange={setPaymentStatus}
            options={PAYMENT_STATUSES.map((status) => ({
              value: status,
              label: PAYMENT_LABELS[status] || status,
            }))}
          />

          <div>
            <label className="mb-1 block text-sm text-gray-700">
              Client
            </label>

            <select
              value={nameFilter}
              onChange={(event) =>
                setNameFilter(event.target.value)
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Tous les clients</option>

              {nameOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <DateField
            label="Date de début"
            date={startDate}
            onChange={setStartDate}
          />

          <DateField
            label="Date de fin"
            date={endDate}
            onChange={setEndDate}
          />

          <button
            type="button"
            onClick={resetFilters}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50"
          >
            Réinitialiser
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
  label="Factures"
  value={countableInvoices.length}
/>

          <SummaryCard
            label="Montant total"
            value={formatCurrencyUSD(summary.total)}
          />

          <SummaryCard
            label="Montant payé"
            value={formatCurrencyUSD(summary.paid)}
            valueClassName="text-green-700"
          />

          <SummaryCard
            label="Montant non payé"
            value={formatCurrencyUSD(summary.remaining)}
            valueClassName="text-red-600"
          />
        </div>

        {loading ? (
          <div className="rounded-lg border bg-white p-5 text-gray-500">
            Chargement des factures...
          </div>
        ) : paginatedGroups.length === 0 ? (
          <div className="rounded-lg border bg-white p-5 text-gray-500">
            Aucune facture ne correspond aux filtres.
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedGroups.map((group) => (
              <InvoiceGroup
                key={group.id}
                group={group}
                open={Boolean(expandedGroups[group.id])}
                onToggle={() => toggleGroup(group.id)}
                expandedInvoices={expandedInvoices}
                onToggleInvoice={toggleInvoice}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-gray-600">
            Page {page} sur {totalPages} • Affichage{" "}
            {firstRow}–{lastRow} sur {totalGroups}
          </span>

          <div className="flex justify-between gap-2 sm:justify-end">
            <button
              type="button"
              disabled={page === 1}
              onClick={() =>
                setPage((current) =>
                  Math.max(1, current - 1)
                )
              }
              className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
            >
              Précédent
            </button>

            <button
              type="button"
              disabled={page === totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1)
                )
              }
              className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function InvoiceGroup({
  group,
  open,
  onToggle,
  expandedInvoices,
  onToggleInvoice,
}) {
  const countableGroupInvoices = group.invoices.filter(
  (invoice) => !isExpiredReservation(invoice)
);

const totals = countableGroupInvoices.reduce(
  (result, invoice) => {
    const totalAmount = Number(
      invoice.total_amount_usd || 0
    );

    const paidAmount = Number(
      invoice.paid_total_usd || 0
    );

    result.total += totalAmount;
    result.paid += paidAmount;
    result.remaining += Math.max(
      totalAmount - paidAmount,
      0
    );

    return result;
  },
  {
    total: 0,
    paid: 0,
    remaining: 0,
  }
);

  return (
    <div className="overflow-hidden rounded-xl border shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between bg-blue-900 px-4 py-4 text-left"
      >
        <div>
          <span className="font-semibold text-white">
            {formatDateFr(group.date)}
          </span>

          <span className="ml-2 text-sm text-blue-100">
            {group.invoices.length} facture
            {group.invoices.length > 1 ? "s" : ""}
          </span>
        </div>

        <span className="text-white">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="bg-white p-3">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <Th>Référence</Th>
                  <Th>Client</Th>
                  <Th>Rendez-vous</Th>
                  <Th>Services</Th>
                  <Th right>Total</Th>
                  <Th>Réservation</Th>
                  <Th>Paiement</Th>
                  <Th>Contact</Th>
                  <Th>PDF</Th>
                  <Th>Détails</Th>
                </tr>
              </thead>

              <tbody>
                {group.invoices.map((invoice) => (
                  <InvoiceTableRow
                    key={invoice.id}
                    invoice={invoice}
                    expanded={Boolean(
                      expandedInvoices[invoice.id]
                    )}
                    onToggle={() =>
                      onToggleInvoice(invoice.id)
                    }
                  />
                ))}
              </tbody>

              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td
                    colSpan="4"
                    className="px-3 py-3 text-right"
                  >
                    Total de la journée :
                  </td>

                  <td className="px-3 py-3 text-right text-red-600">
                    {formatCurrencyUSD(totals.total)}
                  </td>

                  <td colSpan="4">
                    <div className="flex justify-end gap-5 px-3 text-xs">
                      <span className="text-green-700">
                        Payé :{" "}
                        {formatCurrencyUSD(totals.paid)}
                      </span>

                      <span className="text-red-600">
                        Non payé :{" "}
                        {formatCurrencyUSD(
                          totals.remaining
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="space-y-4 md:hidden">
            {group.invoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                expanded={Boolean(
                  expandedInvoices[invoice.id]
                )}
                onToggle={() =>
                  onToggleInvoice(invoice.id)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceTableRow({
  invoice,
  expanded,
  onToggle,
}) {
  const services = getServices(invoice);

  return (
    <>
      <tr className="border-b align-top">
        <Td>
          <span className="font-medium text-blue-700">
            {invoice.reference}
          </span>
        </Td>

        <Td>
          <div className="font-medium text-gray-900">
            {invoice.client_name}
          </div>

          {invoice.people_count && (
            <div className="text-xs text-gray-500">
              {invoice.people_count} personne
              {Number(invoice.people_count) > 1 ? "s" : ""}
            </div>
          )}
        </Td>

        <Td>
          <div>
            {formatDateShort(invoice.appointment_start)}
          </div>

          <div className="text-xs text-gray-500">
            {formatTime(invoice.appointment_start)}
          </div>
        </Td>

        <Td>
          {services.length ? (
            <div className="max-w-[260px] space-y-1">
              {services.slice(0, 2).map((service) => (
                <div key={service.id}>
                  <span className="text-gray-700">
                    {service.serviceName}
                  </span>

                  {service.duration && (
                    <span className="ml-1 text-xs text-gray-500">
                      ({service.duration} min)
                    </span>
                  )}
                </div>
              ))}

              {services.length > 2 && (
                <span className="text-xs text-blue-600">
                  +{services.length - 2} autre
                  {services.length - 2 > 1 ? "s" : ""}
                </span>
              )}
            </div>
          ) : (
            "—"
          )}
        </Td>

        <Td right>
          <span className="font-semibold">
            {formatCurrencyUSD(
              invoice.total_amount_usd
            )}
          </span>
        </Td>

        <Td>
          <StatusBadge
            status={invoice.status}
            type="reservation"
          />
        </Td>

        <Td>
          <StatusBadge
            status={invoice.payment_status}
            type="payment"
          />
        </Td>

        <Td>
          <div>{invoice.client_phone || "—"}</div>

          {invoice.client_email && (
            <div className="max-w-[220px] break-all text-xs text-gray-500">
              {invoice.client_email}
            </div>
          )}
        </Td>

        <Td>
  <PdfButton url={getInvoicePdfUrl(invoice)} />
</Td>

        <Td>
          <button
            type="button"
            onClick={onToggle}
            className="font-medium text-blue-600 hover:underline"
          >
            {expanded ? "Masquer" : "Afficher"}
          </button>
        </Td>
      </tr>

      {expanded && (
        <tr className="border-b bg-gray-50">
          <td colSpan="10" className="p-4">
            <InvoiceDetails
              invoice={invoice}
              services={services}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function InvoiceCard({
  invoice,
  expanded,
  onToggle,
}) {
  const services = getServices(invoice);

  return (
    <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-blue-700">
            {invoice.client_name}
          </p>

          <p className="text-xs text-gray-500">
            {invoice.reference}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            {formatDateShort(invoice.appointment_start)} à{" "}
            {formatTime(invoice.appointment_start)}
          </p>
        </div>

        <StatusBadge
          status={invoice.payment_status}
          type="payment"
        />
      </div>

      <div className="space-y-2 text-sm">
        <InfoRow
          label="Total"
          value={formatCurrencyUSD(
            invoice.total_amount_usd
          )}
          emphasized
        />

        <InfoRow
          label="Réservation"
          value={
            STATUS_LABELS[invoice.status] ||
            invoice.status ||
            "—"
          }
        />

        <InfoRow
          label="Personnes"
          value={invoice.people_count || 1}
        />
      </div>

      <div className="rounded-lg bg-gray-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Services
        </p>

        {services.length ? (
          <div className="space-y-2 text-sm">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex justify-between gap-3"
              >
                <div>
                  <p>{service.serviceName}</p>

                  {service.duration && (
                    <p className="text-xs text-gray-500">
                      {service.duration} minutes
                    </p>
                  )}
                </div>

                <strong>
                  {formatCurrencyUSD(service.amount)}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Aucun service disponible.
          </p>
        )}
      </div>

      <div className="flex gap-2">
  <PdfButton
    url={getInvoicePdfUrl(invoice)}
    mobile
  />

  <button
    type="button"
    onClick={onToggle}
    className="flex-1 rounded-lg bg-gray-100 py-2.5 text-sm font-medium text-gray-700"
  >
    {expanded
      ? "Masquer les détails"
      : "Afficher les détails"}
  </button>
</div>

      {expanded && (
        <InvoiceDetails
          invoice={invoice}
          services={services}
        />
      )}
    </article>
  );
}

function InvoiceDetails({ invoice, services }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border bg-white p-4">
        <h3 className="font-semibold text-gray-800">
          Informations du client
        </h3>

        <div className="mt-3 space-y-2 text-sm">
          <InfoRow
            label="Nom"
            value={invoice.client_name}
          />

          <InfoRow
            label="Téléphone"
            value={invoice.client_phone || "—"}
          />

          <InfoRow
            label="E-mail"
            value={invoice.client_email || "—"}
          />

          <InfoRow
            label="Nombre de personnes"
            value={invoice.people_count || 1}
          />

          <InfoRow
            label="Référence paiement"
            value={invoice.payment_reference || "—"}
          />
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h3 className="font-semibold text-gray-800">
          Détail des services
        </h3>

        <div className="mt-3 space-y-3">
          {services.length ? (
            services.map((service) => (
              <div
                key={service.id}
                className="flex justify-between gap-4 border-b pb-2 text-sm last:border-b-0"
              >
                <div>
                  <p className="font-medium">
                    {service.serviceName}
                  </p>

                  <p className="text-xs text-gray-500">
                    {service.customerName}

                    {service.duration
                      ? ` · ${service.duration} min`
                      : ""}

                    {service.roomName
                      ? ` · ${service.roomName}`
                      : ""}
                  </p>
                </div>

                <strong>
                  {formatCurrencyUSD(service.amount)}
                </strong>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">
              Aucun détail de service disponible.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-between border-t pt-3 font-semibold">
          <span>Total</span>

          <span className="text-red-600">
            {formatCurrencyUSD(
              invoice.total_amount_usd
            )}
          </span>
        </div>
      </section>

      {invoice.notes && (
        <section className="rounded-lg border bg-white p-4 lg:col-span-2">
          <h3 className="font-semibold text-gray-800">
            Notes
          </h3>

          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
            {invoice.notes}
          </p>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueClassName = "text-gray-900",
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">
        {label}
      </p>

      <p
        className={`mt-2 text-xl font-bold ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-700">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateField({ label, date, onChange }) {
  return (
    <div className="flex flex-col">
      <label className="mb-1 text-sm text-gray-700">
        {label}
      </label>

      <DatePicker
        selected={date}
        onChange={onChange}
        dateFormat="dd/MM/yyyy"
        placeholderText="Sélectionner"
        isClearable
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        wrapperClassName="w-full"
      />
    </div>
  );
}

function PdfButton({ url, mobile = false }) {
  if (!url) {
    return mobile ? (
      <span className="flex-1 rounded-lg bg-gray-100 py-2.5 text-center text-sm text-gray-400">
        PDF indisponible
      </span>
    ) : (
      <span className="text-gray-400">—</span>
    );
  }

  function openPdf() {
    const separator = url.includes("?") ? "&" : "?";
    const finalUrl = `${url}${separator}refresh=${Date.now()}`;

    if (window.matchMedia("(display-mode: standalone)").matches) {
      window.location.href = finalUrl;
      return;
    }

    window.open(finalUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={openPdf}
      className={
        mobile
          ? "flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          : "font-medium text-blue-600 underline hover:text-blue-800"
      }
    >
      Voir PDF
    </button>
  );
}

function StatusBadge({
  status,
  type = "reservation",
}) {
  const normalized = String(status || "").toLowerCase();

  let classes = "bg-gray-100 text-gray-700";

  if (
    normalized === "paid" ||
    normalized === "confirmed" ||
    normalized === "completed"
  ) {
    classes = "bg-green-100 text-green-700";
  } else if (
    normalized === "pending" ||
    normalized === "pending_review" ||
    normalized === "payment_review"
  ) {
    classes = "bg-yellow-100 text-yellow-700";
  } else if (
    normalized === "rejected" ||
    normalized === "cancelled" ||
    normalized === "expired" ||
    normalized === "no_show"
  ) {
    classes = "bg-red-100 text-red-700";
  } else if (normalized === "refunded") {
    classes = "bg-purple-100 text-purple-700";
  }

  const label =
    type === "payment"
      ? PAYMENT_LABELS[normalized]
      : STATUS_LABELS[normalized];

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${classes}`}
    >
      {label || status || "—"}
    </span>
  );
}

function InfoRow({
  label,
  value,
  emphasized = false,
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${
        emphasized ? "font-semibold" : ""
      }`}
    >
      <span className="text-gray-500">
        {label}
      </span>

      <span
        className={`text-right ${
          emphasized ? "text-red-600" : "text-gray-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Th({ children, right = false }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-600 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function isExpiredReservation(invoice) {
  return (
    String(invoice?.status || "").toLowerCase() ===
    "expired"
  );
}

function Td({ children, right = false }) {
  return (
    <td
      className={`px-3 py-3 text-sm ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}