import { useEffect, useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaEye,
  FaMoneyBillWave,
  FaSearch,
  FaTimes,
  FaUsers,
} from "react-icons/fa";
import { supabase } from "../../../lib/supabaseClient";
import { formatDateFrSafe } from "../../../lib/dateUtils";

const HAITI_TIME_ZONE = "America/Port-au-Prince";

const RESERVATION_STATUSES = [
  "",
  "pending",
  "payment_review",
  "confirmed",
  "completed",
  "cancelled",
  "expired",
  "no_show",
];

const PAYMENT_STATUSES = [
  "",
  "unpaid",
  "pending_review",
  "partial",
  "paid",
  "rejected",
  "refunded",
];

const STATUS_LABELS = {
  pending: "En attente",
  payment_review: "Paiement en vérification",
  confirmed: "Confirmée",
  completed: "Terminée",
  cancelled: "Annulée",
  expired: "Expirée",
  no_show: "Absence",
};

const PAYMENT_LABELS = {
  unpaid: "Non payé",
  pending_review: "En vérification",
  partial: "Partiellement payé",
  paid: "Payé",
  rejected: "Rejeté",
  refunded: "Remboursé",
};

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  payment_review: "bg-violet-100 text-violet-800 border-violet-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  expired: "bg-gray-100 text-gray-700 border-gray-200",
  no_show: "bg-orange-100 text-orange-800 border-orange-200",
};

const PAYMENT_STYLES = {
  unpaid: "bg-red-100 text-red-800 border-red-200",
  pending_review: "bg-amber-100 text-amber-800 border-amber-200",
  partial: "bg-orange-100 text-orange-800 border-orange-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-100 text-rose-800 border-rose-200",
  refunded: "bg-sky-100 text-sky-800 border-sky-200",
};


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

function formatMoney(value) {
  return `USD ${Number(value || 0).toFixed(2)}`;
}

function toDateTimeLocal(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HAITI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const result = {};
  parts.forEach((part) => {
    if (part.type !== "literal") result[part.type] = part.value;
  });

  return `${result.year}-${result.month}-${result.day}T${result.hour}:${result.minute}`;
}

function haitiLocalToIso(value) {
  if (!value) return null;
  return `${value}:00-04:00`;
}

export default function AdminSpaReservations() {
  const [reservations, setReservations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rooms, setRooms] = useState([]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("confirmed");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadRooms();
    loadReservations();
  }, []);

  const monthOptions = useMemo(() => {
  const months = new Set();

  reservations.forEach((reservation) => {
    const monthKey = getHaitiMonthKey(
      reservation.appointment_start
    );

    if (monthKey) {
      months.add(monthKey);
    }
  });

  return Array.from(months).sort((a, b) =>
    b.localeCompare(a)
  );
}, [reservations]);

const filteredReservations = useMemo(() => {
  if (!selectedMonth) {
    return reservations;
  }

  return reservations.filter((reservation) => {
    return (
      getHaitiMonthKey(
        reservation.appointment_start
      ) === selectedMonth
    );
  });
}, [reservations, selectedMonth]);

  const summary = useMemo(() => {
  return filteredReservations.reduce(
    (acc, reservation) => {
      const normalizedStatus = String(
        reservation.status || ""
      ).toLowerCase();

      const isExpired =
        normalizedStatus === "expired";

      /*
       * All reservations remain counted here,
       * including expired reservations.
       */
      acc.total += 1;

      /*
       * Expired reservations get their own count.
       */
      if (isExpired) {
        acc.expired += 1;
        return acc;
      }

      /*
       * Expired reservations must not affect
       * people or reserved amount.
       */
      acc.people += Number(
        reservation.people_count || 0
      );

      acc.amount += Number(
        reservation.total_amount_usd || 0
      );

      if (
        normalizedStatus === "pending" ||
        normalizedStatus === "payment_review"
      ) {
        acc.pending += 1;
      }

      if (normalizedStatus === "confirmed") {
        acc.confirmed += 1;
      }

      if (
        reservation.payment_status ===
        "pending_review"
      ) {
        acc.paymentReview += 1;
      }

      return acc;
    },
    {
      total: 0,
      pending: 0,
      confirmed: 0,
      expired: 0,
      paymentReview: 0,
      people: 0,
      amount: 0,
    }
  );
}, [filteredReservations]);

  async function loadRooms() {
    const { data, error } = await supabase
      .from("massage_rooms")
      .select("id, name, is_active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("Erreur chargement salles Spa :", error);
      return;
    }

    setRooms(data || []);
  }

  async function loadReservations() {
    setLoading(true);
    setErrorMessage("");
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "admin_get_spa_reservations",
        {
          p_search: search.trim() || null,
          p_status: status || null,
          p_payment_status: paymentStatus || null,
          p_from: null,
          p_to: null,
          p_limit: 300,
          p_offset: 0,
        }
      );

      if (error) throw error;

      setReservations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Erreur chargement réservations Spa :", error);
      setReservations([]);
      setErrorMessage(
        error?.message || "Impossible de charger les réservations Spa."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadReservationDetails(reservationId) {
    if (!reservationId) return;

    setDetailsLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "admin_get_spa_reservation_details",
        {
          p_reservation_id: reservationId,
        }
      );

      if (error) throw error;

      setSelected(data || null);
    } catch (error) {
      console.error("Erreur détails réservation Spa :", error);
      setErrorMessage(
        error?.message || "Impossible de charger cette réservation."
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  async function updateReservation({
    nextStatus,
    nextPaymentStatus,
  } = {}) {
    const reservation = selected?.reservation;
    if (!reservation?.id) return;

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "admin_update_spa_reservation",
        {
          p_reservation_id: reservation.id,
          p_status: nextStatus || null,
          p_payment_status: nextPaymentStatus || null,
          p_payment_reference: reservation.payment_reference || null,
          p_notes: reservation.notes || null,
        }
      );

      if (error) throw error;

      setSelected(data || selected);
      setMessage("Réservation mise à jour avec succès.");
      await loadReservations();
    } catch (error) {
      console.error("Erreur mise à jour réservation Spa :", error);
      setErrorMessage(
        error?.message || "Impossible de mettre à jour la réservation."
      );
    } finally {
      setSaving(false);
    }
  }

  async function checkAppointmentAvailability(
  appointmentId,
  newLocalDateTime
) {
  if (!appointmentId || !newLocalDateTime) {
    return {
      available: false,
      message: "Veuillez sélectionner une nouvelle date et heure.",
    };
  }

  setErrorMessage("");

  try {
    const { data, error } = await supabase.rpc(
      "admin_check_spa_appointment_reschedule",
      {
        p_appointment_id: appointmentId,
        p_new_start: haitiLocalToIso(newLocalDateTime),
      }
    );

    if (error) throw error;

    return (
      data || {
        available: false,
        message: "Impossible de vérifier ce créneau.",
      }
    );
  } catch (error) {
    console.error(
      "Erreur vérification disponibilité Spa :",
      error
    );

    return {
      available: false,
      message:
        error?.message ||
        "Impossible de vérifier la disponibilité de ce créneau.",
    };
  }
}

async function rescheduleAppointment(
  appointmentId,
  newLocalDateTime
) {
  if (!appointmentId || !newLocalDateTime) return;

  setSaving(true);
  setErrorMessage("");
  setMessage("");

  try {
    const { data, error } = await supabase.rpc(
      "admin_reschedule_spa_appointment",
      {
        p_appointment_id: appointmentId,
        p_new_start: haitiLocalToIso(newLocalDateTime),
      }
    );

    if (error) throw error;

    setSelected(data || selected);

    setMessage(
      "Le rendez-vous a été déplacé avec succès."
    );

    await loadReservations();
  } catch (error) {
    console.error(
      "Erreur déplacement rendez-vous Spa :",
      error
    );

    setErrorMessage(
      error?.message ||
        "Impossible de déplacer ce rendez-vous."
    );
  } finally {
    setSaving(false);
  }
}

  async function changeRoom(appointmentId, roomId) {
    if (!appointmentId || !roomId) return;

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "admin_change_spa_appointment_room",
        {
          p_appointment_id: appointmentId,
          p_room_id: roomId,
        }
      );

      if (error) throw error;

      setSelected(data || selected);
      setMessage("Salle modifiée.");
      await loadReservations();
    } catch (error) {
      console.error("Erreur changement salle Spa :", error);
      setErrorMessage(
        error?.message || "Impossible de modifier la salle."
      );
    } finally {
      setSaving(false);
    }
  }

  function updateSelectedReservation(patch) {
    setSelected((current) => {
      if (!current?.reservation) return current;

      return {
        ...current,
        reservation: {
          ...current.reservation,
          ...patch,
        },
      };
    });
  }

  return (
    <div className="mx-auto max-w-[1700px] px-3 py-4 sm:px-4 lg:px-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-500">
            A&apos;QUA D&apos;OR SPA
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            Gestion des réservations
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Consultez, confirmez, déplacez et gérez toutes les réservations Spa.
          </p>
        </div>

        <button
          type="button"
          onClick={loadReservations}
          disabled={loading}
          className="rounded-xl bg-aquaBlue px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Chargement..." : "Actualiser"}
        </button>
      </div>

      {(message || errorMessage) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            errorMessage
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {errorMessage || message}
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <SummaryCard icon={<FaCalendarAlt />} label="Réservations" value={summary.total} />
        <SummaryCard icon={<FaClock />} label="En attente" value={summary.pending} />
        <SummaryCard icon={<FaCheckCircle />} label="Confirmées" value={summary.confirmed} />
        <SummaryCard icon={<FaTimes />} label="Expirées" value={summary.expired}/>
        <SummaryCard icon={<FaMoneyBillWave />} label="Paiements à vérifier" value={summary.paymentReview} />
        <SummaryCard icon={<FaUsers />} label="Personnes" value={summary.people} />
        <SummaryCard icon={<FaMoneyBillWave />} label="Montant réservé" value={formatMoney(summary.amount)} />
      </div>

      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative md:col-span-2">
            <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") loadReservations();
              }}
              placeholder="Nom, téléphone ou e-mail..."
              className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-aquaBlue focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm">
            {RESERVATION_STATUSES.map((item) => (
              <option key={item || "all"} value={item}>
                {item ? STATUS_LABELS[item] : "Tous les statuts"}
              </option>
            ))}
          </select>

          <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm">
            {PAYMENT_STATUSES.map((item) => (
              <option key={item || "all"} value={item}>
                {item ? PAYMENT_LABELS[item] : "Tous les paiements"}
              </option>
            ))}
          </select>

          <select
  value={selectedMonth}
  onChange={(event) =>
    setSelectedMonth(event.target.value)
  }
  className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
>
  <option value="">Tous les mois</option>

  {monthOptions.map((month) => (
    <option key={month} value={month}>
      {formatMonthLabel(month)}
    </option>
  ))}
</select>

          <button type="button" onClick={loadReservations} className="rounded-xl bg-aquaBlue px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            Appliquer
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-gray-900">
  Réservations ({filteredReservations.length})
</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Chargement des réservations...</div>
        ) : filteredReservations.length === 0 ? (
          <div className="p-10 text-center">
            <FaCalendarAlt className="mx-auto text-4xl text-gray-300" />
            <p className="mt-3 font-semibold text-gray-700">Aucune réservation trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Personnes</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Paiement</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReservations.map((reservation) => (
                  <tr key={reservation.id} className="hover:bg-blue-50/40">
                    <td className="whitespace-nowrap px-4 py-4">
                      <p className="font-semibold text-gray-900">{formatDateFrSafe(reservation.appointment_start)}</p>
                      <p className="text-xs text-gray-500">{formatTime(reservation.appointment_start)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-900">{reservation.primary_customer_name || "—"}</p>
                      <p className="text-xs text-gray-500">{reservation.primary_customer_phone || "—"}</p>
                    </td>
                    <td className="px-4 py-4 font-semibold text-gray-700">{reservation.people_count || 0}</td>
                    <td className="px-4 py-4"><StatusBadge value={reservation.status} labels={STATUS_LABELS} styles={STATUS_STYLES} /></td>
                    <td className="px-4 py-4"><StatusBadge value={reservation.payment_status} labels={PAYMENT_LABELS} styles={PAYMENT_STYLES} /></td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-bold text-gray-900">{formatMoney(reservation.total_amount_usd)}</td>
                    <td className="px-4 py-4 text-right">
                      <button type="button" onClick={() => loadReservationDetails(reservation.id)} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white">
                        <FaEye /> Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(selected || detailsLoading) && (
        <ReservationModal
  data={selected}
  rooms={rooms}
  loading={detailsLoading}
  saving={saving}
  onClose={() => setSelected(null)}
  onUpdate={updateReservation}
  onCheckAvailability={checkAppointmentAvailability}
  onReschedule={rescheduleAppointment}
  onChangeRoom={changeRoom}
  onChangeReservation={updateSelectedReservation}
/>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-aquaBlue">{icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ value, labels, styles }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[value] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
      {labels[value] || value || "—"}
    </span>
  );
}

function ReservationModal({
  data,
  rooms,
  loading,
  saving,
  onClose,
  onUpdate,
  onCheckAvailability,
  onReschedule,
  onChangeRoom,
  onChangeReservation,
}) {
  const reservation = data?.reservation;
  const appointments = data?.appointments || [];

  function cancelReservation() {
    const confirmed = window.confirm(
      "Voulez-vous vraiment annuler cette réservation ? Tous les rendez-vous associés seront annulés et les salles seront libérées."
    );

    if (!confirmed) return;

    onUpdate({
      nextStatus: "cancelled",
    });
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 p-3 sm:p-5">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 bg-gray-50 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
              Réservation Spa
            </p>

            <h2 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
              {reservation?.primary_customer_name || "Chargement..."}
            </h2>

            {reservation?.appointment_start && (
              <p className="mt-1 text-sm text-gray-500">
                {formatDateFrSafe(reservation.appointment_start)} à{" "}
                {formatTime(reservation.appointment_start)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-xl text-gray-500 hover:bg-gray-200"
          >
            <FaTimes />
          </button>
        </div>

        {loading || !reservation ? (
          <div className="p-10 text-center text-gray-500">
            Chargement...
          </div>
        ) : (
          <div className="space-y-6 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoCard
                label="Téléphone"
                value={reservation.primary_customer_phone || "—"}
              />

              <InfoCard
                label="E-mail"
                value={reservation.primary_customer_email || "—"}
              />

              <InfoCard
                label="Personnes"
                value={
                  reservation.people_count ||
                  appointments.length ||
                  0
                }
              />

              <InfoCard
                label="Total"
                value={formatMoney(
                  reservation.total_amount_usd
                )}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge
                value={reservation.status}
                labels={STATUS_LABELS}
                styles={STATUS_STYLES}
              />

              <StatusBadge
                value={reservation.payment_status}
                labels={PAYMENT_LABELS}
                styles={PAYMENT_STYLES}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700">
                  Référence de paiement
                </span>

                <input
                  value={
                    reservation.payment_reference || ""
                  }
                  onChange={(event) =>
                    onChangeReservation({
                      payment_reference:
                        event.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                />
              </label>

              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700">
                  Notes administratives
                </span>

                <textarea
                  rows={3}
                  value={reservation.notes || ""}
                  onChange={(event) =>
                    onChangeReservation({
                      notes: event.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <div>
              <h3 className="mb-3 text-lg font-bold text-gray-900">
                Prestations réservées
              </h3>

              <div className="space-y-4">
                {appointments.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    rooms={rooms}
                    saving={saving}
                    onChangeRoom={onChangeRoom}
                    onCheckAvailability={
                      onCheckAvailability
                    }
                    onReschedule={onReschedule}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-5">
              <ActionButton
  onClick={() => {
    if (reservation.status === "confirmed") {
      const confirmed = window.confirm(
        "Voulez-vous annuler la confirmation de cette réservation ? Elle repassera au statut En attente."
      );

      if (!confirmed) return;

      onUpdate({
        nextStatus: "pending",
      });

      return;
    }

    onUpdate({
      nextStatus: "confirmed",
    });
  }}
  disabled={
    saving ||
    reservation.status === "cancelled"
  }
  className={
    reservation.status === "confirmed"
      ? "bg-amber-600 hover:bg-amber-700"
      : "bg-emerald-600 hover:bg-emerald-700"
  }
>
  {reservation.status === "confirmed"
    ? "Annuler la confirmation"
    : "Confirmer"}
</ActionButton>

              <ActionButton
                onClick={cancelReservation}
                disabled={
                  saving ||
                  reservation.status === "cancelled"
                }
                className="bg-red-700 hover:bg-red-800"
              >
                {reservation.status === "cancelled"
                  ? "Déjà annulée"
                  : "Annuler"}
              </ActionButton>

              <ActionButton
                onClick={() => onUpdate({})}
                disabled={saving}
                className="bg-aquaBlue hover:opacity-90"
              >
                Enregistrer les notes
              </ActionButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppointmentCard({
  appointment,
  rooms,
  saving,
  onChangeRoom,
  onCheckAvailability,
  onReschedule,
}) {
  const currentStart =
    appointment.appointment_start;

  const currentRoomId =
    appointment.room?.id ||
    appointment.room_id ||
    "";

  const duration =
    appointment.option?.duration_minutes ||
    appointment.duration_minutes ||
    0;

  const serviceName =
    appointment.service?.name ||
    appointment.service_name ||
    "Massage";

  const [newDateTime, setNewDateTime] = useState(
    toDateTimeLocal(currentStart)
  );

  const [availability, setAvailability] =
    useState(null);

  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setNewDateTime(toDateTimeLocal(currentStart));
    setAvailability(null);
  }, [currentStart]);

  async function verifyAvailability() {
    if (!newDateTime) return;

    if (
      newDateTime ===
      toDateTimeLocal(currentStart)
    ) {
      setAvailability({
        available: false,
        message:
          "Veuillez sélectionner une date ou une heure différente du rendez-vous actuel.",
      });

      return;
    }

    setChecking(true);
    setAvailability(null);

    try {
      const result =
        await onCheckAvailability(
          appointment.id,
          newDateTime
        );

      setAvailability(result);
    } finally {
      setChecking(false);
    }
  }

  async function confirmReschedule() {
    if (!availability?.available) return;

    const confirmed = window.confirm(
      `Confirmer le déplacement du rendez-vous de ${
        appointment.customer_name || "ce client"
      } vers le ${newDateTime.replace(
        "T",
        " à "
      )} ?`
    );

    if (!confirmed) return;

    await onReschedule(
      appointment.id,
      newDateTime
    );

    setAvailability(null);
  }

  return (
    <article className="rounded-2xl border border-gray-200 p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            Personne{" "}
            {appointment.guest_number || "—"}
          </p>

          <h4 className="mt-1 text-lg font-bold text-gray-900">
            {appointment.customer_name || "Client"}
          </h4>

          <p className="mt-2 text-sm text-gray-600">
            {serviceName}
            {duration
              ? ` · ${duration} minutes`
              : ""}
          </p>

          <p className="mt-1 font-semibold text-gray-900">
            {formatMoney(appointment.price_usd)}
          </p>

          <p className="mt-2 text-sm text-gray-500">
            Rendez-vous actuel :{" "}
            <span className="font-semibold text-gray-700">
              {formatDateFrSafe(currentStart)} à{" "}
              {formatTime(currentStart)}
            </span>
          </p>

          {appointment.appointment_end && (
            <p className="text-xs text-gray-500">
              Fin prévue :{" "}
              {formatTime(
                appointment.appointment_end
              )}
            </p>
          )}
        </div>

        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Salle
          </span>

          <select
            value={currentRoomId}
            onChange={(event) =>
              onChangeRoom(
                appointment.id,
                event.target.value
              )
            }
            disabled={saving}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
          >
            <option value="">
              Sélectionner une salle
            </option>

            {rooms
              .filter(
                (room) =>
                  room.is_active ||
                  room.id === currentRoomId
              )
              .map((room) => (
                <option
                  key={room.id}
                  value={room.id}
                >
                  {room.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="font-semibold text-blue-900">
          Déplacer ce rendez-vous
        </p>

        <p className="mt-1 text-xs text-blue-700">
          Cette modification concernera uniquement{" "}
          {appointment.customer_name || "cette personne"}.
        </p>

        <div className="mt-3 flex flex-col gap-2 lg:flex-row">
          <input
            type="datetime-local"
            value={newDateTime}
            onChange={(event) => {
              setNewDateTime(
                event.target.value
              );

              setAvailability(null);
            }}
            className="flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm"
          />

          <button
            type="button"
            onClick={verifyAvailability}
            disabled={
              saving ||
              checking ||
              !newDateTime ||
              !currentRoomId
            }
            className="rounded-xl border border-blue-600 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {checking
              ? "Vérification..."
              : "Vérifier la disponibilité"}
          </button>
        </div>

        {availability && (
          <div
            className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
              availability.available
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            <p>{availability.message}</p>

            {availability.available && (
              <button
                type="button"
                onClick={confirmReschedule}
                disabled={saving}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Confirmer le déplacement
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 break-words font-bold text-gray-900">{value ?? "—"}</p>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, className = "" }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${className}`}>
      {children}
    </button>
  );
}

function getHaitiMonthKey(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HAITI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const result = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  });

  return `${result.year}-${result.month}`;
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "Tous les mois";

  const [year, month] = monthKey
    .split("-")
    .map(Number);

  if (!year || !month) {
    return monthKey;
  }

  const date = new Date(year, month - 1, 1, 12);

  const label = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}