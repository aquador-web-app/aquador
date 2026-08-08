import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { supabase } from "../../lib/supabaseClient";
import { detectCountryISO } from "../../lib/detectCountry";
import SpaInvoicesPayments from "./SpaInvoicesPayments";

const HAITI_TIME_ZONE = "America/Port-au-Prince";

const STATUS_LABELS = {
  pending: "En attente de paiement",
  payment_review: "Paiement en vérification",
  confirmed: "Confirmée",
  expired: "Expirée",
  cancelled: "Annulée",
  completed: "Terminée",
  no_show: "Absence",
};

const PAYMENT_LABELS = {
  unpaid: "Non payé",
  pending_review: "En vérification",
  paid: "Payé",
  rejected: "Rejeté",
  refunded: "Remboursé",
};

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: HAITI_TIME_ZONE,
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HAITI_TIME_ZONE,
  }).format(new Date(value));
}

function formatMoney(value) {
  return `USD ${Number(value || 0).toFixed(2)}`;
}

function statusClasses(status) {
  if (["confirmed", "completed"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["expired", "cancelled", "no_show"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export default function SpaReservationsAccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState("HT");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [selectedReservationId, setSelectedReservationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [paymentReservation, setPaymentReservation] =
    useState(null);

  const [automaticAccessLoading, setAutomaticAccessLoading] =
    useState(false);

  const [reactivationReservation, setReactivationReservation] =
  useState(null);

const [reactivating, setReactivating] = useState(false);
const [reactivationError, setReactivationError] = useState("");

  useEffect(() => {
    try {
      setCountry(detectCountryISO() || "HT");
    } catch {
      setCountry("HT");
    }
  }, []);

  useEffect(() => {
    if (!dashboard) return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [dashboard]);

    useEffect(() => {
    const navigationState = location.state;

    if (
      !navigationState?.phone ||
      !navigationState?.birthDate ||
      !navigationState?.email
    ) {
      return undefined;
    }

    let cancelled = false;

    async function openDashboardFromReservation() {
      setAutomaticAccessLoading(true);
      setError("");

      try {
        await loadCustomerDashboard({
          customerPhone: navigationState.phone,
          customerBirthDate: navigationState.birthDate,
          customerEmail: navigationState.email,
          reservationId: navigationState.reservationId,
          openPaymentModal: Boolean(
            navigationState.openPaymentModal
          ),
        });

        if (!cancelled) {
          navigate(location.pathname, {
            replace: true,
            state: null,
          });
        }
      } catch (automaticAccessError) {
        console.error(
          "Automatic massage dashboard access error:",
          automaticAccessError
        );

        if (!cancelled) {
          setDashboard(null);
          setError(
            automaticAccessError?.message ||
              "Impossible d’ouvrir automatiquement votre réservation."
          );
        }
      } finally {
        if (!cancelled) {
          setAutomaticAccessLoading(false);
        }
      }
    }

    openDashboardFromReservation();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.state, navigate]);

  const reservations = dashboard?.reservations || [];

  const selectedReservation =
    reservations.find((item) => item.id === selectedReservationId) ||
    reservations[0] ||
    null;

  const upcomingReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          new Date(reservation.appointment_start).getTime() >= now &&
          !["expired", "cancelled", "completed", "no_show"].includes(
            reservation.status
          )
      ),
    [reservations, now]
  );

  const historyReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          !upcomingReservations.some((upcoming) => upcoming.id === reservation.id)
      ),
    [reservations, upcomingReservations]
  );

  function continueToVerification(event) {
    event.preventDefault();
    setError("");

    if (!phone || !isValidPhoneNumber(phone)) {
      setError("Veuillez entrer un numéro de téléphone valide.");
      return;
    }

    setStep(2);
  }

  async function verifyIdentity(event) {
    event.preventDefault();
    setError("");

    if (!birthDate || !email.trim()) {
      setError("Veuillez confirmer votre date de naissance et votre e-mail.");
      return;
    }

    setLoading(true);
    try {
      await loadCustomerDashboard({
  customerPhone: phone,
  customerBirthDate: birthDate,
  customerEmail: email,
});
    } catch (verificationError) {
      console.error("Massage reservation access error:", verificationError);
      setDashboard(null);
      setError(
        "Aucune réservation ne correspond aux informations fournies. Vérifiez les trois informations et réessayez."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomerDashboard({
  customerPhone,
  customerBirthDate,
  customerEmail,
  reservationId = null,
  openPaymentModal = false,
}) {
  const { data, error: rpcError } = await supabase.rpc(
    "get_massage_customer_dashboard",
    {
      p_phone: customerPhone,
      p_birth_date: customerBirthDate,
      p_email: customerEmail.trim(),
    }
  );

  if (rpcError) throw rpcError;

  const loadedReservations = data?.reservations || [];

  const requestedReservation =
    loadedReservations.find(
      (reservation) => reservation.id === reservationId
    ) || loadedReservations[0] || null;

  setPhone(customerPhone);
  setBirthDate(customerBirthDate);
  setEmail(customerEmail.trim());
  setDashboard(data);
  setSelectedReservationId(requestedReservation?.id || null);

  if (openPaymentModal && requestedReservation) {
    setPaymentReservation(requestedReservation);
  }

  return data;
}

async function reactivateReservation() {
  if (!reactivationReservation) return;

  setReactivating(true);
  setReactivationError("");

  try {
    const { data, error: rpcError } = await supabase.rpc(
      "reactivate_massage_reservation",
      {
        p_reservation_id: reactivationReservation.id,
        p_phone: phone,
        p_birth_date: birthDate,
        p_email: email.trim(),
      }
    );

    if (rpcError) throw rpcError;

    const reservationId =
      data?.reservation_id || reactivationReservation.id;

    setReactivationReservation(null);

    await loadCustomerDashboard({
      customerPhone: phone,
      customerBirthDate: birthDate,
      customerEmail: email,
      reservationId,
      openPaymentModal: true,
    });
  } catch (reactivationRequestError) {
    console.error(
      "Massage reservation reactivation error:",
      reactivationRequestError
    );

    setReactivationError(
      reactivationRequestError?.message ||
        "Impossible de réactiver cette réservation."
    );
  } finally {
    setReactivating(false);
  }
}

    function resetAccess() {
    setStep(1);
    setPhone("");
    setBirthDate("");
    setEmail("");
    setDashboard(null);
    setSelectedReservationId(null);
    setPaymentReservation(null);
    setReactivationReservation(null);
    setReactivating(false);
    setReactivationError("");
    setAutomaticAccessLoading(false);
    setError("");
  }

    if (automaticAccessLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-5">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-amber-700" />

          <h1 className="mt-5 text-xl font-bold text-stone-900">
            Ouverture de votre réservation
          </h1>

          <p className="mt-2 text-sm text-stone-600">
            Veuillez patienter pendant le chargement de votre espace client.
          </p>
        </div>
      </div>
    );
  }

  if (dashboard) {
    return (
      <div className="min-h-screen bg-stone-50">
        <header className="bg-gradient-to-br from-stone-900 via-stone-800 to-amber-900 text-white">
          <div className="mx-auto max-w-7xl px-5 py-10 md:px-8">
            <Link to="/massage" className="text-sm text-white/80 hover:text-white">
              ← Retour aux massages
            </Link>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
                  Mes réservations
                </p>
                <h1 className="mt-2 text-3xl font-bold">
                  Bonjour {dashboard.customer_name}
                </h1>
              </div>
              <button
                type="button"
                onClick={resetAccess}
                className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              >
                Fermer la session
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-7xl gap-6 px-5 py-8 md:px-8 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-6">
            <ReservationGroup
              title="À venir"
              reservations={upcomingReservations}
              selectedReservationId={selectedReservation?.id}
              onSelect={setSelectedReservationId}
            />
            <ReservationGroup
              title="Historique"
              reservations={historyReservations}
              selectedReservationId={selectedReservation?.id}
              onSelect={setSelectedReservationId}
            />
          </aside>

          <section>
            {selectedReservation ? (
              <ReservationDetails
                reservation={selectedReservation}
                now={now}
                onOpenPayment={() =>
                  setPaymentReservation(selectedReservation)
                }
                onOpenReactivation={() => {
                  setReactivationError("");
                  setReactivationReservation(selectedReservation);
                }}
              />
            ) : (
              <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-stone-500">
                Aucune réservation trouvée.
              </div>
            )}
          </section>
        </main>
        {paymentReservation && (
  <MassagePaymentModal
    reservation={paymentReservation}
    phone={phone}
    birthDate={birthDate}
    email={email}
    loadCustomerDashboard={loadCustomerDashboard}
    onClose={() => setPaymentReservation(null)}
  />
)}
        {reactivationReservation && (
  <MassageReactivationModal
    reservation={reactivationReservation}
    loading={reactivating}
    error={reactivationError}
    onConfirm={reactivateReservation}
    onClose={() => {
      if (reactivating) return;

      setReactivationReservation(null);
      setReactivationError("");
    }}
  />
)}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-gradient-to-br from-stone-900 via-stone-800 to-amber-900 text-white">
        <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
          <Link to="/massage" className="text-sm text-white/80 hover:text-white">
            ← Retour aux massages
          </Link>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.22em] text-amber-300">
            Accès client
          </p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">
            Consulter mes réservations
          </h1>
          <p className="mt-3 max-w-2xl text-white/80">
            Retrouvez vos rendez-vous, leur statut, les détails des séances et
            vos codes QR.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 py-10 md:px-8">
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-200 bg-stone-50 px-6 py-5">
            <p className="text-sm font-semibold text-amber-700">
              Étape {step} sur 2
            </p>
            <h2 className="mt-1 text-xl font-bold text-stone-900">
              {step === 1
                ? "Entrez votre numéro de téléphone"
                : "Confirmez votre identité"}
            </h2>
          </div>

          {step === 1 ? (
            <form onSubmit={continueToVerification} className="space-y-5 p-6">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-stone-800">
                  Numéro de téléphone *
                </span>
                <PhoneInput
                  international
                  defaultCountry={country}
                  value={phone}
                  onChange={(value) => {
                    setPhone(value || "");
                    setError("");
                  }}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-3"
                />
              </label>

              {error && <ErrorMessage message={error} />}

              <button className="w-full rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800">
                Continuer
              </button>
            </form>
          ) : (
            <form onSubmit={verifyIdentity} className="space-y-5 p-6">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs uppercase tracking-wide text-stone-500">
                  Téléphone
                </p>
                <p className="mt-1 font-semibold text-stone-900">{phone}</p>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-stone-800">
                  Date de naissance *
                </span>
                <input
                  type="date"
                  value={birthDate}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(event) => {
                    setBirthDate(event.target.value);
                    setError("");
                  }}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-stone-800">
                  Adresse e-mail *
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  autoComplete="email"
                  placeholder="votre@email.com"
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
                  required
                />
              </label>

              {error && <ErrorMessage message={error} />}

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                  className="flex-1 rounded-xl border border-stone-300 px-5 py-3 font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Modifier le téléphone
                </button>
                <button
                  disabled={loading}
                  className="flex-1 rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  {loading ? "Vérification..." : "Accéder"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function ReservationGroup({
  title,
  reservations,
  selectedReservationId,
  onSelect,
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-stone-500">
        {title}
      </h2>
      <div className="space-y-3">
        {reservations.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
            Aucune réservation.
          </div>
        ) : (
          reservations.map((reservation) => (
            <button
              key={reservation.id}
              type="button"
              onClick={() => onSelect(reservation.id)}
              className={`w-full rounded-xl border p-4 text-left transition ${
                selectedReservationId === reservation.id
                  ? "border-amber-500 bg-amber-50 shadow-sm"
                  : "border-stone-200 bg-white hover:border-amber-300"
              }`}
            >
              <p className="font-bold text-stone-900">
                {formatDate(reservation.appointment_start)}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {formatTime(reservation.appointment_start)} ·{" "}
                {reservation.people_count} personne
                {reservation.people_count > 1 ? "s" : ""}
              </p>
              <span
                className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                  reservation.status
                )}`}
              >
                {STATUS_LABELS[reservation.status] || reservation.status}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ReservationDetails({
  reservation,
  now,
  onOpenPayment,
  onOpenReactivation,
}) {
  const remainingSeconds =
    reservation.status === "pending"
      ? Math.max(
          0,
          Math.floor(
            (new Date(reservation.hold_expires_at).getTime() - now) / 1000
          )
        )
      : 0;

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-stone-900 to-amber-900 px-6 py-6 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-amber-200">Rendez-vous</p>
            <h2 className="mt-1 text-2xl font-bold">
              {formatDate(reservation.appointment_start)}
            </h2>
            <p className="mt-1 text-white/80">
              {formatTime(reservation.appointment_start)}
            </p>
          </div>
          <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-semibold">
            {STATUS_LABELS[reservation.status] || reservation.status}
          </span>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Info label="Paiement" value={PAYMENT_LABELS[reservation.payment_status] || reservation.payment_status} />
          <Info label="Total" value={formatMoney(reservation.total_amount_usd)} />
          <Info
            label="Nombre de personnes"
            value={String(reservation.people_count)}
          />
        </div>

        {reservation.status === "pending" && remainingSeconds > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-semibold">Créneau temporairement réservé</p>
            <p className="mt-1 text-sm">
              Temps restant : {Math.floor(remainingSeconds / 60)}:
              {String(remainingSeconds % 60).padStart(2, "0")}
            </p>
          </div>
        )}

        {reservation.status === "pending" &&
  remainingSeconds > 0 &&
  ["unpaid", "rejected"].includes(
    reservation.payment_status
  ) && (
    <button
      type="button"
      onClick={onOpenPayment}
      className="w-full rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-amber-800"
    >
      {reservation.payment_status === "rejected"
        ? "Soumettre un nouveau paiement"
        : "Procéder au paiement"}
    </button>
  )}

  {reservation.status === "expired" &&
  reservation.can_attempt_reactivation && (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <p className="font-bold text-amber-900">
        Votre délai de paiement a expiré
      </p>

      <p className="mt-2 text-sm leading-relaxed text-amber-900">
        Vous pouvez tenter de réactiver cette réservation si le
        créneau est toujours disponible.
      </p>

      <div className="mt-3 rounded-lg border border-amber-300 bg-white/70 p-3 text-sm font-semibold text-amber-950">
        Attention : vous ne pouvez réactiver cette réservation
        qu’une seule fois. Si le nouveau délai expire sans paiement,
        vous devrez effectuer une nouvelle réservation.
      </div>

      <button
        type="button"
        onClick={onOpenReactivation}
        className="mt-4 w-full rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-amber-800"
      >
        Réactiver cette réservation
      </button>
    </div>
  )}

  {reservation.status === "expired" &&
  Number(reservation.reactivation_count || 0) >= 1 && (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
      <p className="font-bold">
        Cette réservation ne peut plus être réactivée
      </p>

      <p className="mt-2 text-sm leading-relaxed">
        Cette réservation a déjà été réactivée une fois. Vous devez
        maintenant effectuer une nouvelle réservation.
      </p>

      <Link
        to="/massage"
        className="mt-4 inline-flex w-full justify-center rounded-xl bg-red-700 px-5 py-3 font-semibold text-white transition hover:bg-red-800"
      >
        Effectuer une nouvelle réservation
      </Link>
    </div>
  )}

  {reservation.status === "expired" &&
  !reservation.can_attempt_reactivation &&
  Number(reservation.reactivation_count || 0) < 1 &&
  reservation.reactivation_unavailable_reason && (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
      <p className="font-bold">
        Réactivation impossible
      </p>

      <p className="mt-2 text-sm">
        {reservation.reactivation_unavailable_reason}
      </p>

      <Link
        to="/massage"
        className="mt-4 inline-flex w-full justify-center rounded-xl bg-red-700 px-5 py-3 font-semibold text-white transition hover:bg-red-800"
      >
        Effectuer une nouvelle réservation
      </Link>
    </div>
  )}

        <div>
          <h3 className="text-lg font-bold text-stone-900">Séances</h3>
          <div className="mt-4 space-y-4">
            {(reservation.appointments || []).map((appointment) => (
              <div
                key={appointment.id}
                className="rounded-xl border border-stone-200 p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Personne {appointment.guest_number}
                    </p>
                    <h4 className="mt-1 text-lg font-bold text-stone-900">
                      {appointment.customer_name}
                    </h4>
                    <p className="mt-2 text-stone-600">
                      {appointment.service?.name} ·{" "}
                      {appointment.option?.duration_minutes} minutes
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      Salle : {appointment.room?.name}
                    </p>
                  </div>
                  <p className="font-bold text-stone-900">
                    {formatMoney(appointment.price_usd)}
                  </p>
                </div>

                {appointment.qr_code_url && (
                  <div className="mt-5 border-t border-stone-200 pt-5">
                    <p className="mb-3 text-sm font-semibold text-stone-800">
                      Code QR
                    </p>
                    <img
                      src={appointment.qr_code_url}
                      alt={`QR code de ${appointment.customer_name}`}
                      className="h-40 w-40 rounded-lg border border-stone-200 object-contain"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {reservation.payment_reference && (
          <Info
            label="Référence de paiement"
            value={reservation.payment_reference}
          />
        )}
      </div>
    </article>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <p className="mt-1 font-bold text-stone-900">{value}</p>
    </div>
  );
}

function ErrorMessage({ message }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function MassageReactivationModal({
  reservation,
  loading,
  error,
  onConfirm,
  onClose,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onMouseDown={loading ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="massage-reactivation-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-stone-200 px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Réactivation
            </p>

            <h2
              id="massage-reactivation-title"
              className="mt-1 text-2xl font-bold text-stone-900"
            >
              Réactiver cette réservation ?
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-3 py-2 text-xl text-stone-500 transition hover:bg-stone-100 disabled:cursor-not-allowed"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info
              label="Date"
              value={formatDate(reservation.appointment_start)}
            />

            <Info
              label="Heure"
              value={formatTime(reservation.appointment_start)}
            />
          </div>

          <p className="text-sm leading-relaxed text-stone-700">
            Le système vérifiera de nouveau si le créneau est
            disponible. S’il est toujours libre, votre réservation
            sera retenue pendant 60 minutes supplémentaires.
          </p>

          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-800">
            <strong>Attention :</strong> cette réservation ne peut
            être réactivée qu’une seule fois. Si le paiement n’est
            pas soumis avant la fin du nouveau délai, vous devrez
            effectuer une nouvelle réservation.
          </div>

          {error && <ErrorMessage message={error} />}

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-stone-300 px-5 py-3 font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {loading
                ? "Vérification..."
                : "Vérifier et réactiver"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MassagePaymentModal({
  reservation,
  phone,
  birthDate,
  email,
  loadCustomerDashboard,
  onClose,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="massage-payment-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-stone-200 px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Paiement
            </p>

            <h2
              id="massage-payment-title"
              className="mt-1 text-2xl font-bold text-stone-900"
            >
              Payer la réservation
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xl text-stone-500 transition hover:bg-stone-100"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="space-y-5 p-6">
          <SpaInvoicesPayments
    reservation={reservation}
    phone={phone}
    birthDate={birthDate}
    email={email}
    onClose={onClose}
    onPaymentSubmitted={async () => {
        await loadCustomerDashboard({
            customerPhone: phone,
            customerBirthDate: birthDate,
            customerEmail: email,
            reservationId: reservation.id,
        });

        onClose();
    }}
/>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-stone-300 px-5 py-3 font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}