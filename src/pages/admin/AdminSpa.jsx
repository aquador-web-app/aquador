// src/pages/Admin/AdminSpa.jsx

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrencyUSD } from "../../lib/dateUtils";

const HAITI_TIME_ZONE = "America/Port-au-Prince";

function getHaitiNow() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: HAITI_TIME_ZONE,
    })
  );
}

function canMarkAppointmentNoShow(value) {
  if (!value) return false;

  const appointmentDate = new Date(value);

  if (Number.isNaN(appointmentDate.getTime())) {
    return false;
  }

  const noShowAvailableAt = new Date(
    appointmentDate.getTime() + 30 * 60 * 1000
  );

  return new Date() >= noShowAvailableAt;
}

function formatDateForRpc(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatAppointmentDate(value) {
  if (!value) return "Date inconnue";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: HAITI_TIME_ZONE,
  }).format(date);
}

function formatAppointmentTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HAITI_TIME_ZONE,
  }).format(date);
}

function capitalizeFirstLetter(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getReservationStatusLabel(status) {
  switch (status) {
    case "pending":
      return "En attente";

    case "payment_review":
      return "Paiement à vérifier";

    case "confirmed":
      return "Confirmée";

    case "completed":
      return "Terminée";

    case "cancelled":
      return "Annulée";

    case "expired":
      return "Expirée";

    case "no_show":
      return "Absent";

    default:
      return status || "—";
  }
}

function getReservationStatusClasses(status) {
  switch (status) {
    case "confirmed":
      return "bg-green-100 text-green-700";

    case "completed":
      return "bg-blue-100 text-blue-700";

    case "pending":
    case "payment_review":
      return "bg-yellow-100 text-yellow-700";

    case "cancelled":
    case "expired":
    case "no_show":
      return "bg-red-100 text-red-700";

    default:
      return "bg-gray-100 text-gray-700";
  }
}

function getPaymentStatusLabel(status) {
  switch (status) {
    case "paid":
      return "Payée";

    case "pending_review":
      return "À vérifier";

    case "unpaid":
      return "Impayée";

    default:
      return status || "—";
  }
}

function isAppointmentToday(value) {
  if (!value) return false;

  const appointment = new Date(value);

  if (Number.isNaN(appointment.getTime())) {
    return false;
  }

  const todayKey = formatDateForRpc(getHaitiNow());
  const appointmentKey = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: HAITI_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(appointment);

  return appointmentKey === todayKey;
}

function getPaymentStatusClasses(status) {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-700";

    case "pending_review":
      return "bg-yellow-100 text-yellow-700";

    case "unpaid":
      return "bg-red-100 text-red-700";

    default:
      return "bg-gray-100 text-gray-700";
  }
}

function AttendanceButton({
  label,
  active,
  disabled,
  onClick,
  activeClass,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? activeClass
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

export default function AdminSpa() {
  const [dashboard, setDashboard] = useState(null);
  const [upcomingReservations, setUpcomingReservations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attendanceSavingId, setAttendanceSavingId] =
  useState(null);

  async function recordAttendance(
  appointmentId,
  attendanceStatus
) {
  if (!appointmentId || !attendanceStatus) return;

  const labels = {
    present: "Présent",
    late: "En retard",
    no_show: "Absent",
  };

  const confirmed = window.confirm(
    `Enregistrer cette personne comme « ${labels[attendanceStatus]} » ?`
  );

  if (!confirmed) return;

  setAttendanceSavingId(appointmentId);
  setError("");

  try {
    const { error } = await supabase.rpc(
      "admin_record_spa_attendance",
      {
        p_appointment_id: appointmentId,
        p_attendance_status: attendanceStatus,
      }
    );

    if (error) throw error;

    await loadSpaOverview();
  } catch (err) {
    console.error(
      "Erreur enregistrement présence Spa :",
      err
    );

    setError(
      err?.message ||
        "Impossible d’enregistrer la présence."
    );
  } finally {
    setAttendanceSavingId(null);
  }
}

  async function loadSpaOverview() {
    setLoading(true);
    setError("");

    try {
      const now = getHaitiNow();

      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const fromDate = formatDateForRpc(now);
      const toDate = formatDateForRpc(nextWeek);

      const [
        { data: dashboardData, error: dashboardError },
        { data: reservationsData, error: reservationsError },
      ] = await Promise.all([
        supabase.rpc("admin_get_spa_dashboard", {
          p_from: fromDate,
          p_to: toDate,
        }),

        supabase.rpc("admin_get_spa_reservations", {
          p_search: null,
          p_status: null,
          p_payment_status: null,
          p_from: fromDate,
          p_to: toDate,
          p_limit: 100,
          p_offset: 0,
        }),
      ]);

      if (dashboardError) {
        throw dashboardError;
      }

      if (reservationsError) {
        throw reservationsError;
      }

      const reservations = (reservationsData || [])
  .filter((reservation) => {
    if (!reservation.appointment_start) return false;

    // Expired reservations must not appear anywhere
    if (reservation.status === "expired") return false;

    const appointmentDate = new Date(
  reservation.appointment_start
);

if (Number.isNaN(appointmentDate.getTime())) {
  return false;
}

/*
 * Keep the reservation visible until
 * 30 minutes after its scheduled time.
 */
const visibilityLimit = new Date(
  appointmentDate.getTime() + 45 * 60 * 1000
);

return visibilityLimit >= now;
  })
        .sort(
          (a, b) =>
            new Date(a.appointment_start).getTime() -
            new Date(b.appointment_start).getTime()
        );

      setDashboard(dashboardData || {});
      setUpcomingReservations(reservations);
    } catch (err) {
      console.error("Erreur chargement aperçu Spa:", err);

      setError(
        err?.message ||
          "Impossible de charger les informations du Spa."
      );

      setDashboard(null);
      setUpcomingReservations([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSpaOverview();
  }, []);

  const totalReservations = Number(
    dashboard?.total_reservations || 0
  );

  const totalPeople = Number(dashboard?.people_count || 0);

  const pendingReservations = Number(
    dashboard?.pending || 0
  );

  const confirmedReservations = Number(
    dashboard?.confirmed || 0
  );

  const unpaidReservations = Number(
    dashboard?.unpaid || 0
  );

  const pendingPaymentReview = Number(
    dashboard?.pending_review || 0
  );

  const revenue = Number(
    dashboard?.revenue_usd || 0
  );

  const expectedRevenue = Number(
    dashboard?.expected_revenue_usd || 0
  );

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-gray-500">
          Chargement de l’aperçu Spa...
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-aquaBlue">
            💆 Spa – Overview
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Résumé des activités prévues pour les 7 prochains jours
          </p>
        </div>

        <button
          type="button"
          onClick={loadSpaOverview}
          disabled={loading}
          className="rounded-lg bg-aquaBlue px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Actualiser
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {/* ============================ */}
      {/*        STATISTIQUES          */}
      {/* ============================ */}

      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {/* RÉSERVATIONS */}

        <motion.div
          whileHover={{ scale: 1.04, y: -3 }}
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow"
        >
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-blue-500 to-cyan-400" />

          <p className="text-gray-500">
            Réservations (7 jours)
          </p>

          <h3 className="mt-1 text-4xl font-bold text-blue-600">
            {totalReservations}
          </h3>

          <p className="mt-2 text-sm text-gray-600">
            {totalPeople} personne
            {totalPeople !== 1 ? "s" : ""} attendue
            {totalPeople !== 1 ? "s" : ""}
          </p>
        </motion.div>

        {/* CONFIRMÉES */}

        <motion.div
          whileHover={{ scale: 1.04, y: -3 }}
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow"
        >
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-green-500 to-emerald-400" />

          <p className="text-gray-500">
            Réservations confirmées
          </p>

          <h3 className="mt-1 text-4xl font-bold text-green-600">
            {confirmedReservations}
          </h3>

          <p className="mt-2 text-sm text-gray-600">
            En attente :{" "}
            <strong>{pendingReservations}</strong>
          </p>
        </motion.div>

        {/* PAIEMENTS À SUIVRE */}

        <motion.div
          whileHover={{ scale: 1.04, y: -3 }}
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow"
        >
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-red-500 to-orange-400" />

          <p className="text-gray-500">
            Paiements à suivre
          </p>

          <h3 className="mt-1 text-4xl font-bold text-red-500">
            {unpaidReservations + pendingPaymentReview}
          </h3>

          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <p>
              Impayés :{" "}
              <strong>{unpaidReservations}</strong>
            </p>

            <p>
              À vérifier :{" "}
              <strong>{pendingPaymentReview}</strong>
            </p>
          </div>
        </motion.div>

        {/* REVENUS */}

        <motion.div
          whileHover={{ scale: 1.04, y: -3 }}
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow"
        >
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-purple-500 to-pink-400" />

          <p className="text-gray-500">
            Revenus encaissés
          </p>

          <h3 className="mt-1 text-3xl font-bold text-purple-600">
            {formatCurrencyUSD(revenue)}
          </h3>

          <p className="mt-2 text-sm text-gray-600">
            Revenus attendus :{" "}
            <strong>
              {formatCurrencyUSD(expectedRevenue)}
            </strong>
          </p>
        </motion.div>
      </div>

      {/* ============================ */}
      {/*    PROCHAINES RÉSERVATIONS   */}
      {/* ============================ */}

      <div className="mb-10 rounded-2xl bg-white p-6 shadow">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-bold text-aquaBlue">
            📅 Prochaines réservations (7 jours)
          </h3>

          <span className="text-sm text-gray-500">
            {upcomingReservations.length} réservation
            {upcomingReservations.length !== 1 ? "s" : ""}
          </span>
        </div>

        {upcomingReservations.length === 0 ? (
          <p className="text-gray-500 italic">
            Aucune réservation prévue
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingReservations.map((reservation) => {
              const appointments = Array.isArray(
                reservation.appointments
              )
                ? reservation.appointments
                : [];

              return (
                <motion.div
                  key={reservation.id}
                  whileHover={{ scale: 1.01, y: -2 }}
                  className="rounded-xl border border-gray-100 bg-gradient-to-r from-white to-blue-50 p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-gray-800">
                        {reservation.primary_customer_name ||
                          "Client inconnu"}
                      </p>

                      <p className="mt-1 text-sm text-gray-600">
                        📅{" "}
                        {capitalizeFirstLetter(
                          formatAppointmentDate(
                            reservation.appointment_start
                          )
                        )}
                      </p>

                      <p className="text-sm text-gray-600">
                        🕒{" "}
                        {formatAppointmentTime(
                          reservation.appointment_start
                        )}
                      </p>

                      <p className="mt-1 text-sm text-gray-600">
                        👥{" "}
                        {reservation.people_count || 1} personne
                        {Number(reservation.people_count || 1) !== 1
                          ? "s"
                          : ""}
                      </p>

                      {reservation.primary_customer_phone && (
                        <p className="mt-1 text-sm text-gray-500">
                          📞 {reservation.primary_customer_phone}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-start gap-2 lg:items-end">
                      <p className="text-lg font-bold text-aquaBlue">
                        {formatCurrencyUSD(
                          Number(
                            reservation.total_amount_usd || 0
                          )
                        )}
                      </p>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getReservationStatusClasses(
                            reservation.status
                          )}`}
                        >
                          {getReservationStatusLabel(
                            reservation.status
                          )}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getPaymentStatusClasses(
                            reservation.payment_status
                          )}`}
                        >
                          {getPaymentStatusLabel(
                            reservation.payment_status
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {appointments.length > 0 && (
                    <div className="mt-4 border-t border-gray-200 pt-4">
                      <p className="mb-2 text-sm font-semibold text-gray-700">
                        Services réservés
                      </p>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
  {appointments.map((appointment) => {
    const appointmentDateTime =
      appointment.appointment_start ||
      reservation.appointment_start;

    const canManageAttendance =
      isAppointmentToday(appointmentDateTime);

    const canMarkNoShow =
  canMarkAppointmentNoShow(
    appointmentDateTime
  );

    return (
      <div
        key={appointment.id}
        className="rounded-lg border border-gray-100 bg-white px-3 py-3 text-sm shadow-sm"
      >
        <p className="font-medium text-gray-800">
          {appointment.customer_name ||
            reservation.primary_customer_name}
        </p>

        <p className="text-gray-600">
          {appointment.service_name ||
            "Service non précisé"}
        </p>

        <p className="text-xs text-gray-500">
          {appointment.duration_minutes
            ? `${appointment.duration_minutes} minutes`
            : "Durée non précisée"}

          {appointment.room_name
            ? ` — ${appointment.room_name}`
            : ""}
        </p>

        {canManageAttendance ? (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Gestion de la présence
            </p>

            <div className="flex flex-wrap gap-2">
              <AttendanceButton
                label="Présent"
                active={
                  appointment.attendance_status ===
                  "present"
                }
                disabled={
                  attendanceSavingId ===
                  appointment.id
                }
                onClick={() =>
                  recordAttendance(
                    appointment.id,
                    "present"
                  )
                }
                activeClass="border-emerald-600 bg-emerald-600 text-white"
              />

              <AttendanceButton
                label="En retard"
                active={
                  appointment.attendance_status ===
                  "late"
                }
                disabled={
                  attendanceSavingId ===
                  appointment.id
                }
                onClick={() =>
                  recordAttendance(
                    appointment.id,
                    "late"
                  )
                }
                activeClass="border-amber-500 bg-amber-500 text-white"
              />

              <AttendanceButton
  label={
    canMarkNoShow
      ? "Absent"
      : "Absent après 30 min"
  }
  active={
    appointment.attendance_status ===
    "no_show"
  }
  disabled={
    attendanceSavingId === appointment.id ||
    !canMarkNoShow
  }
  onClick={() =>
    recordAttendance(
      appointment.id,
      "no_show"
    )
  }
  activeClass="border-red-600 bg-red-600 text-white"
/>
            </div>

            {attendanceSavingId ===
              appointment.id && (
              <p className="mt-2 text-xs text-gray-500">
                Enregistrement...
              </p>
            )}

            {appointment.attendance_recorded_at &&
              attendanceSavingId !==
                appointment.id && (
                <p className="mt-2 text-xs text-gray-500">
                  Enregistré à{" "}
                  {formatAppointmentTime(
                    appointment.attendance_recorded_at
                  )}
                </p>
              )}
          </div>
        ) : (
          <p className="mt-3 border-t border-gray-100 pt-3 text-xs italic text-gray-400">
            La présence pourra être enregistrée le
            jour du rendez-vous.
          </p>
        )}
      </div>
    );
  })}
</div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}