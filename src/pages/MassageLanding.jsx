import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CalendarView from "../components/CalendarView";
import { supabase } from "../lib/supabaseClient";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { detectCountryISO } from "../lib/detectCountry";

const MASSAGE_OPENING_TIME = "08:00";
const MASSAGE_CLOSING_TIME = "16:00";
const LATEST_MASSAGE_END_MINUTES = 16 * 60 + 30;
const PREPARATION_MINUTES = 15;

const createEmptyGuest = (guestNumber) => ({
  guestNumber,
  customerName: "",
  customerBirthDate: "",
  customerPhone: "",
  customerEmail: "",
  serviceId: "",
  serviceOptionId: "",

  // Person 1 only: the booking customer is receiving this massage.
  isSelf: false,

  // Gift and notification rules.
  isGift: false,
  recipientKnows: true,

  // Required when the recipient is under 18.
  parentOnSiteConfirmed: false,
});

const createInitialReservationForm = () => ({
  peopleCount: 1,

  /*
   * One person:
   * - self
   * - other
   *
   * Two people:
   * - self_and_other
   * - two_others
   */
  recipientMode: "",

  primaryCustomerName: "",
  primaryCustomerBirthDate: "",
  primaryCustomerPhone: "",
  primaryCustomerEmail: "",
  notes: "",
  guests: [createEmptyGuest(1)],
});

export default function MassageLanding() {
  const navigate = useNavigate();
  const [massageServices, setMassageServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [reservationForm, setReservationForm] = useState(
    createInitialReservationForm
  );
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationSubmitting, setReservationSubmitting] = useState(false);
  const [reservationError, setReservationError] = useState("");
  const [confirmedReservation, setConfirmedReservation] = useState(null);
  const [pendingHoldModal, setPendingHoldModal] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [roomAvailability, setRoomAvailability] = useState([]);
  const [roomAvailabilityLoading, setRoomAvailabilityLoading] = useState(false);
  const [roomAvailabilityError, setRoomAvailabilityError] = useState("");
  const [country, setCountry] = useState("HT");
  const [servicesLanguage, setServicesLanguage] = useState("en");
  const [availabilityNow, setAvailabilityNow] = useState(
  Date.now()
);

  useEffect(() => {
    loadMassageServices();
  }, []);

  useEffect(() => {
  try {
    const c = detectCountryISO();
    setCountry(c || "HT");
  } catch {
    setCountry("HT");
  }
}, []);

useEffect(() => {
  const hasTemporaryHold = roomAvailability.some(
    (room) =>
      room.availability_status === "temporary_hold" &&
      room.hold_expires_at
  );

  if (!hasTemporaryHold) {
    return undefined;
  }

  setAvailabilityNow(Date.now());

  const intervalId = window.setInterval(() => {
    setAvailabilityNow(Date.now());
  }, 1000);

  return () => {
    window.clearInterval(intervalId);
  };
}, [roomAvailability]);

  async function loadMassageServices() {
    setServicesLoading(true);
    setServicesError("");

    try {
      const { data, error } = await supabase
      .from("massage_services")
      .select(`
        id,
        name,
        name_fr,
        slug,
        short_description,
        short_description_fr,
        full_description,
        full_description_fr,
        image_url,
        benefits,
        benefits_fr,
        recommended_for,
        recommended_for_fr,
        icon,
        sort_order,
        massage_service_options (
          id,
          duration_minutes,
          price_usd,
          sort_order,
          is_active
        )
      `)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("sort_order", {
        referencedTable: "massage_service_options",
        ascending: true,
      });

      if (error) throw error;

      setMassageServices(
        (data || []).map((service) => ({
          ...service,
          options: (service.massage_service_options || [])
            .filter((option) => option.is_active)
            .sort(
              (a, b) =>
                Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
                Number(a.duration_minutes) - Number(b.duration_minutes)
            ),
        }))
      );
    } catch (error) {
      console.error("Error loading massage services:", error);
      setServicesError("Impossible de charger les massages disponibles.");
    } finally {
      setServicesLoading(false);
    }
  }

  const formattedSelection = useMemo(() => {
    if (!selectedSlot?.start) return null;

    const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Port-au-Prince",
    });
    const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Port-au-Prince",
    });
    const arrivalTime = new Date(
      selectedSlot.start.getTime() - PREPARATION_MINUTES * 60 * 1000
    );

    return {
      date: dateFormatter.format(selectedSlot.start),
      startTime: timeFormatter.format(selectedSlot.start),
      arrivalTime: timeFormatter.format(arrivalTime),
    };
  }, [selectedSlot]);

  const availableRoomCount = roomAvailability.filter(
    (room) => room.available
  ).length;
  const noRoomAvailable =
    !roomAvailabilityLoading &&
    roomAvailability.length > 0 &&
    availableRoomCount === 0;

  const guestSelections = useMemo(
    () =>
      reservationForm.guests.map((guest) => {
        const service =
          massageServices.find((item) => item.id === guest.serviceId) || null;
        const option =
          service?.options.find((item) => item.id === guest.serviceOptionId) ||
          null;
        return { guest, service, option };
      }),
    [massageServices, reservationForm.guests]
  );

  const estimatedTotal = guestSelections.reduce(
    (total, item) => total + Number(item.option?.price_usd || 0),
    0
  );

  function resetReservationFlow() {
    setReservationForm(createInitialReservationForm());
    setReservationError("");
    setShowReservationForm(false);
    setConfirmedReservation(null);
    setPendingHoldModal(null);
  }

  function handlePrimaryFieldChange(event) {
  const { name, value } = event.target;

  setReservationForm((current) => {
    const guests = current.guests.map((guest, index) => {
      if (index !== 0 || !guest.isSelf) {
        return guest;
      }

      if (name === "primaryCustomerName") {
        return {
          ...guest,
          customerName: value,
        };
      }

      if (name === "primaryCustomerBirthDate") {
        return {
          ...guest,
          customerBirthDate: value,
          parentOnSiteConfirmed: false,
        };
      }

      if (name === "primaryCustomerEmail") {
        return {
          ...guest,
          customerEmail: value,
        };
      }

      return guest;
    });

    return {
      ...current,
      [name]: value,
      guests,
    };
  });

  setReservationError("");
}

function createSelfGuest(currentGuest, currentForm) {
  return {
    ...currentGuest,
    guestNumber: 1,
    isSelf: true,
    isGift: false,
    recipientKnows: true,
    customerName: currentForm.primaryCustomerName,
    customerBirthDate: currentForm.primaryCustomerBirthDate,
    customerPhone: currentForm.primaryCustomerPhone,
    customerEmail: currentForm.primaryCustomerEmail,
    parentOnSiteConfirmed: false,
  };
}

  function handlePeopleCountChange(event) {
  const peopleCount = Number(event.target.value);

  setReservationForm((current) => {
    const guests =
      peopleCount === 2
        ? [
            current.guests[0] || createEmptyGuest(1),
            current.guests[1] || createEmptyGuest(2),
          ]
        : [current.guests[0] || createEmptyGuest(1)];

    /*
     * Changing the number of people invalidates the previous
     * recipient choice, so require a new selection.
     */
    guests[0] = {
      ...guests[0],
      guestNumber: 1,
      isSelf: false,
      customerName: "",
      customerBirthDate: "",
      customerPhone: "",
      customerEmail: "",
      isGift: false,
      recipientKnows: true,
      parentOnSiteConfirmed: false,
    };

    if (peopleCount === 2) {
      guests[1] = {
        ...guests[1],
        guestNumber: 2,
        isSelf: false,
      };
    }

    return {
      ...current,
      peopleCount,
      recipientMode: "",
      guests,
    };
  });

  setReservationError("");
}

  function handleGuestChange(index, field, value) {
    setReservationForm((current) => {
      const guests = current.guests.map((guest, guestIndex) => {
        if (guestIndex !== index) return guest;
        const updatedGuest = { ...guest, [field]: value };
        if (field === "serviceId") updatedGuest.serviceOptionId = "";
        return updatedGuest;
      });
      return { ...current, guests };
    });
    setReservationError("");
  }

  function handleRecipientModeChange(recipientMode) {
  setReservationForm((current) => {
    const peopleCount = current.peopleCount;

    let guests =
      peopleCount === 2
        ? [
            current.guests[0] || createEmptyGuest(1),
            current.guests[1] || createEmptyGuest(2),
          ]
        : [current.guests[0] || createEmptyGuest(1)];

    const bookingCustomerReceivesMassage =
      recipientMode === "self" ||
      recipientMode === "self_and_other";

    if (bookingCustomerReceivesMassage) {
      guests[0] = createSelfGuest(guests[0], current);
    } else {
      /*
       * Person 1 is a different recipient.
       * Keep massage selections if already selected,
       * but clear the personal information.
       */
      guests[0] = {
        ...guests[0],
        guestNumber: 1,
        isSelf: false,
        customerName: "",
        customerBirthDate: "",
        customerPhone: "",
        customerEmail: "",
        isGift: false,
        recipientKnows: true,
        parentOnSiteConfirmed: false,
      };
    }

    if (peopleCount === 2) {
      guests[1] = {
        ...guests[1],
        guestNumber: 2,
        isSelf: false,
      };
    }

    return {
      ...current,
      recipientMode,
      guests,
    };
  });

  setReservationError("");
}

  function optionFitsSelectedStart(option) {
    if (!selectedSlot?.start || !option) return false;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Port-au-Prince",
    });
    const [hours, minutes] = formatter
      .format(selectedSlot.start)
      .split(":")
      .map(Number);
    return (
      hours * 60 + minutes + Number(option.duration_minutes) <=
      LATEST_MASSAGE_END_MINUTES
    );
  }

  async function handleMassageSlotSelect(slot) {
    resetReservationFlow();
    setSelectedSlot(slot);
    setRoomAvailability([]);
    setRoomAvailabilityError("");
    setRoomAvailabilityLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        "get_massage_room_availability",
        {
          p_start: slot.start.toISOString(),
          p_occupied_until: slot.occupiedUntil.toISOString(),
        }
      );
      if (error) throw error;

      const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Port-au-Prince",
      });

      setRoomAvailability(
        (data || []).map((room) => ({
          room_id: room.room_id,
          room_name: room.room_name,
          sort_order: room.room_sort_order,
          available: Boolean(room.available),
          availability_status: room.availability_status,
          reserved_until: room.reserved_until
            ? timeFormatter.format(new Date(room.reserved_until))
            : null,
          hold_expires_at: room.hold_expires_at || null,
          remaining_hold_seconds:
            room.remaining_hold_seconds == null
              ? null
              : Number(room.remaining_hold_seconds),
        }))
      );
    } catch (error) {
      console.error("Error checking massage-room availability:", error);
      setRoomAvailability([]);
      setRoomAvailabilityError(
        "Impossible de vérifier la disponibilité des salles. Veuillez réessayer."
      );
    } finally {
      setRoomAvailabilityLoading(false);
    }

    window.setTimeout(() => {
      document.getElementById("massage-selection-summary")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  }

  function validateReservation() {
  if (!selectedSlot?.start) {
    return "Veuillez sélectionner un créneau.";
  }

  const validRecipientModes =
  reservationForm.peopleCount === 1
    ? ["self", "other"]
    : ["self_and_other", "two_others"];

if (
  !validRecipientModes.includes(
    reservationForm.recipientMode
  )
) {
  return "Veuillez indiquer à qui la réservation est destinée.";
}

const person1ShouldBeSelf =
  reservationForm.recipientMode === "self" ||
  reservationForm.recipientMode === "self_and_other";

if (
  Boolean(reservationForm.guests[0]?.isSelf) !==
  person1ShouldBeSelf
) {
  return "Les informations de la personne 1 ne correspondent pas au type de réservation sélectionné.";
}

  if (!reservationForm.primaryCustomerName.trim()) {
    return "Veuillez entrer le nom complet du client principal.";
  }

  if (!reservationForm.primaryCustomerBirthDate) {
  return "Veuillez entrer la date de naissance du client principal.";
}

const primaryBirthDate =
  new Date(
    `${reservationForm.primaryCustomerBirthDate}T00:00:00`
  );

if (
  Number.isNaN(primaryBirthDate.getTime()) ||
  primaryBirthDate > new Date()
) {
  return "Veuillez entrer une date de naissance valide pour le client principal.";
}

  if (!reservationForm.primaryCustomerPhone) {
    return "Veuillez entrer le numéro de téléphone du client principal.";
  }

  if (
    !isValidPhoneNumber(
      reservationForm.primaryCustomerPhone
    )
  ) {
    return "Veuillez entrer un numéro de téléphone valide pour le client principal.";
  }

  if (!reservationForm.primaryCustomerEmail.trim()) {
    return "Veuillez entrer l’adresse e-mail du client principal.";
  }

  for (
    let index = 0;
    index < guestSelections.length;
    index += 1
  ) {
    const { guest, service, option } =
      guestSelections[index];

    if (!guest.customerName.trim()) {
      return `Veuillez entrer le nom de la personne ${
        index + 1
      }.`;
    }

    if (!guest.customerBirthDate) {
  return `Veuillez entrer la date de naissance de la personne ${
    index + 1
  }.`;
}

const guestBirthDate =
  new Date(`${guest.customerBirthDate}T00:00:00`);

if (
  Number.isNaN(guestBirthDate.getTime()) ||
  guestBirthDate > new Date()
) {
  return `Veuillez entrer une date de naissance valide pour la personne ${
    index + 1
  }.`;
}

if (
  isMinorAtAppointment(
    guest.customerBirthDate,
    selectedSlot.start
  ) &&
  !guest.parentOnSiteConfirmed
) {
  return `La présence d’un parent ou représentant légal doit être confirmée pour la personne ${
    index + 1
  }.`;
}

    if (!guest.customerPhone) {
      return `Veuillez entrer le numéro de téléphone de la personne ${
        index + 1
      }.`;
    }

    if (!isValidPhoneNumber(guest.customerPhone)) {
      return `Veuillez entrer un numéro de téléphone valide pour la personne ${
        index + 1
      }.`;
    }

    const recipientEmailIsRequired =
      !guest.isGift || guest.recipientKnows;

    if (
      recipientEmailIsRequired &&
      !guest.customerEmail.trim()
    ) {
      return `Veuillez entrer l’adresse e-mail de la personne ${
        index + 1
      }.`;
    }

    if (
      guest.customerEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        guest.customerEmail.trim()
      )
    ) {
      return `Veuillez entrer une adresse e-mail valide pour la personne ${
        index + 1
      }.`;
    }

    if (!service) {
      return `Veuillez sélectionner le massage de la personne ${
        index + 1
      }.`;
    }

    if (!option) {
      return `Veuillez sélectionner la durée de la personne ${
        index + 1
      }.`;
    }

    if (!optionFitsSelectedStart(option)) {
      return `La durée sélectionnée pour la personne ${
        index + 1
      } dépasse l’heure limite de 16:30.`;
    }
  }

  return "";
}

  async function handleMassageReservationSubmit(event) {
    event.preventDefault();
    setReservationError("");

    const validationError = validateReservation();
    if (validationError) {
      setReservationError(validationError);
      return;
    }

    setReservationSubmitting(true);
    try {
      const attendees = guestSelections.map(({ guest }) => ({
  customer_name: guest.customerName.trim(),
  customer_birth_date: guest.customerBirthDate,
  customer_phone: guest.customerPhone,
  customer_email:
    guest.isGift && !guest.recipientKnows
      ? null
      : guest.customerEmail.trim(),

  service_id: guest.serviceId,
  service_option_id: guest.serviceOptionId,

  is_self: Boolean(guest.isSelf),
  is_gift: Boolean(guest.isGift),
  recipient_knows: Boolean(guest.recipientKnows),

  send_email_to_recipient:
    !guest.isGift || guest.recipientKnows,

    parent_on_site_confirmed:
  isMinorAtAppointment(
    guest.customerBirthDate,
    selectedSlot.start
  )
    ? Boolean(guest.parentOnSiteConfirmed)
    : false,
}));

      const { data, error } = await supabase.rpc(
        "create_massage_reservation",
        {
          p_primary_customer_name:
            reservationForm.primaryCustomerName.trim(),
          p_primary_customer_birth_date:
            reservationForm.primaryCustomerBirthDate,
          p_primary_customer_phone:
            reservationForm.primaryCustomerPhone,
          p_primary_customer_email:
            reservationForm.primaryCustomerEmail.trim(),
          p_appointment_start: selectedSlot.start.toISOString(),
          p_attendees: attendees,
          p_notes: reservationForm.notes.trim() || null,
        }
      );
      if (error) throw error;
      if (!data?.reservation_id) {
        throw new Error("La réservation n’a pas pu être créée.");
      }

      const reservation = {
        ...data,
        formatted_selection: formattedSelection,
      };
      setConfirmedReservation(reservation);
      setPendingHoldModal(reservation);
      setShowReservationForm(false);
      setRoomAvailability([]);
      setRoomAvailabilityError("");
    } catch (error) {
      console.error("Error creating massage reservation:", error);
      setReservationError(
        error?.message || "Impossible de confirmer la réservation."
      );
    } finally {
      setReservationSubmitting(false);
    }
  }

  function acknowledgeHold() {
  if (!confirmedReservation?.reservation_id) {
    setPendingHoldModal(null);
    setReservationError(
      "Impossible d’ouvrir la réservation. Veuillez consulter vos réservations."
    );
    return;
  }

  const automaticAccess = {
    phone: reservationForm.primaryCustomerPhone,
    birthDate: reservationForm.primaryCustomerBirthDate,
    email: reservationForm.primaryCustomerEmail.trim(),
    reservationId: confirmedReservation.reservation_id,
    openPaymentModal: true,
  };

  setPendingHoldModal(null);

  navigate("/massage/mes-reservations", {
    state: automaticAccess,
    replace: true,
  });
}

  return (
    <div className="min-h-screen bg-stone-50">
      <section className="relative overflow-hidden bg-gradient-to-br from-stone-900 via-stone-800 to-amber-900 text-white">
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
          <div className="max-w-3xl">
            <Link
              to="/club"
              className="mb-8 inline-flex items-center gap-2 text-sm text-white/80 transition hover:text-white"
            >
              ← Retour au Club A’QUA D’OR
            </Link>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-amber-300">
              Espace bien-être
            </p>
            <h1 className="text-4xl font-bold leading-tight md:text-6xl">
              Massage & relaxation
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
              Accordez-vous un moment de détente dans un espace calme,
              confortable et entièrement consacré à votre bien-être.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
  <a
    href="#massage-calendar"
    className="inline-flex justify-center rounded-xl bg-white px-6 py-3 font-semibold text-stone-900 shadow-lg transition hover:bg-amber-50"
  >
    Prendre rendez-vous
  </a>

  <Link
    to="/massage/mes-reservations"
    className="inline-flex justify-center rounded-xl border border-white/40 bg-white/10 px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-white/20"
  >
    Consulter mes réservations
  </Link>
</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          <InformationCard
            icon="🕐"
            title="Durées flexibles"
            text="Chaque personne peut choisir une séance de 45, 60 ou 90 minutes selon le massage disponible."
          />
          <InformationCard
            icon="🚪"
            title="Jusqu’à deux personnes"
            text="Réservez pour une ou deux personnes, avec un massage et une durée différents pour chacune."
          />
          <InformationCard
            icon="✨"
            title="Préparation soignée"
            text="Une période de 15 minutes est prévue après chaque massage pour préparer la salle."
          />
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white py-14">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="mx-auto mb-10 max-w-3xl text-center">
  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-700">
    {servicesLanguage === "fr"
      ? "Nos soins"
      : "Our treatments"}
  </p>

  <h2 className="mt-2 text-3xl font-bold text-stone-900">
    {servicesLanguage === "fr"
      ? "Découvrez nos massages"
      : "Discover our massages"}
  </h2>

  <p className="mt-3 text-stone-600">
    {servicesLanguage === "fr"
      ? "Découvrez les différents massages proposés, leurs bienfaits, leurs durées et leurs tarifs."
      : "Explore our massage treatments, their benefits, available durations and prices."}
  </p>

  <button
    type="button"
    onClick={() =>
      setServicesLanguage((current) =>
        current === "en" ? "fr" : "en"
      )
    }
    className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
  >
    <span aria-hidden="true">
      {servicesLanguage === "en" ? "🇫🇷" : "🇺🇸"}
    </span>

    {servicesLanguage === "en"
      ? "Voir en français"
      : "View in English"}
  </button>
</div>

          {servicesLoading && (
            <div className="py-12 text-center text-stone-500">
              Chargement des massages...
            </div>
          )}
          {servicesError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-red-700">
              {servicesError}
            </div>
          )}
          {!servicesLoading && !servicesError && massageServices.length === 0 && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-8 text-center text-stone-500">
              Aucun massage n’est disponible pour le moment.
            </div>
          )}
          {!servicesLoading && massageServices.length > 0 && (
  <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
    {massageServices.map((service) => (
      <MassageServiceCard
        key={service.id}
        service={service}
        language={servicesLanguage}
      />
    ))}
  </div>
)}
        </div>
      </section>

      <section
        id="massage-calendar"
        className="border-y border-stone-200 bg-white py-12"
      >
        <div className="mx-auto max-w-7xl px-2 md:px-5">
          <div className="mb-8 px-3 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
              Disponibilités
            </p>
            <h2 className="mt-2 text-3xl font-bold text-stone-900">
              Choisissez votre rendez-vous
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-stone-600">
              Choisissez une date et une heure du massage. Les massages et leurs
              durées seront sélectionnés dans le formulaire.
            </p>
            <p className="mt-2 text-sm text-stone-500">
              Horaire : {MASSAGE_OPENING_TIME} à {MASSAGE_CLOSING_TIME} · Fin
              maximale du massage : 16:30
            </p>
          </div>
          <CalendarView
            mode="massage"
            onMassageSlotSelect={handleMassageSlotSelect}
          />
        </div>
      </section>

      {selectedSlot && formattedSelection && (
        <section
          id="massage-selection-summary"
          className="mx-auto max-w-4xl px-5 py-12 md:px-8"
        >
          <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-lg">
            <div className="bg-gradient-to-r from-stone-900 to-amber-900 px-6 py-5 text-white">
              <p className="text-sm font-medium text-amber-200">
                Créneau sélectionné
              </p>
              <h3 className="mt-1 text-2xl font-semibold">
                Confirmez votre heure de massage
              </h3>
            </div>
            <div className="p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <SummaryItem
                  label="Date"
                  value={capitalizeFirstLetter(formattedSelection.date)}
                />
                <SummaryItem
                  label="Heure du massage"
                  value={formattedSelection.startTime}
                />
                <SummaryItem
                  label="Arrivée recommandée"
                  value={`${formattedSelection.arrivalTime} (15 minutes avant)`}
                />
                <SummaryItem
                  label="Nombre maximal"
                  value="2 personnes"
                />
              </div>

              <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="mb-3 font-semibold text-stone-900">
                  Disponibilité des salles
                </p>
                {roomAvailabilityLoading ? (
                  <p className="text-sm text-stone-500">
                    Vérification des salles disponibles...
                  </p>
                ) : roomAvailabilityError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {roomAvailabilityError}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {roomAvailability.map((room) => (
  <RoomAvailabilityRow
    key={room.room_id}
    room={room}
    now={availabilityNow}
  />
))}
                  </div>
                )}

                {!roomAvailabilityLoading && !roomAvailabilityError && (
                  <p
                    className={`mt-3 text-sm font-medium ${
                      availableRoomCount === 2
                        ? "text-emerald-700"
                        : availableRoomCount === 1
                        ? "text-amber-700"
                        : "text-red-700"
                    }`}
                  >
                    {availableRoomCount === 2
                      ? "Les deux salles sont actuellement disponibles."
                      : availableRoomCount === 1
                      ? "Une seule salle est actuellement disponible."
                      : "Aucune salle n’est actuellement disponible."}
                  </p>
                )}
              </div>

              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                La disponibilité sera vérifiée de nouveau avec la durée exacte
                de chaque personne lors de la confirmation.
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlot(null);
                    resetReservationFlow();
                    setRoomAvailability([]);
                    setRoomAvailabilityError("");
                    document.getElementById("massage-calendar")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                  className="rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-700 transition hover:bg-stone-50"
                >
                  Modifier le créneau
                </button>
                <button
                  type="button"
                  disabled={
                    roomAvailabilityLoading ||
                    Boolean(roomAvailabilityError) ||
                    noRoomAvailable
                  }
                  onClick={() => {
                    setReservationError("");
                    setShowReservationForm(true);
                    window.setTimeout(() => {
                      document
                        .getElementById("massage-reservation-form")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                  className={`rounded-xl px-6 py-3 font-semibold text-white shadow-sm transition ${
                    roomAvailabilityLoading ||
                    roomAvailabilityError ||
                    noRoomAvailable
                      ? "cursor-not-allowed bg-gray-400"
                      : "bg-amber-700 hover:bg-amber-800"
                  }`}
                >
                  {roomAvailabilityLoading
                    ? "Vérification..."
                    : noRoomAvailable
                    ? "Créneau complet"
                    : "Continuer la réservation"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {showReservationForm && selectedSlot && formattedSelection && (
        <section
          id="massage-reservation-form"
          className="mx-auto max-w-4xl px-5 pb-12 md:px-8"
        >
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
            <div className="border-b border-stone-200 bg-stone-50 px-6 py-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                Réservation
              </p>
              <h3 className="mt-1 text-2xl font-bold text-stone-900">
                Finalisez votre réservation
              </h3>
              <p className="mt-2 text-sm text-stone-600">
                Chaque personne peut choisir un massage et une durée différents.
              </p>
            </div>

            <form
              onSubmit={handleMassageReservationSubmit}
              className="space-y-6 p-6"
            >
              {reservationError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {reservationError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <SummaryItem
                  label="Date"
                  value={capitalizeFirstLetter(formattedSelection.date)}
                />
                <SummaryItem
                  label="Heure du massage"
                  value={formattedSelection.startTime}
                />
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-stone-800">
                  Combien de personnes ? *
                </span>
                <select
                  value={reservationForm.peopleCount}
                  onChange={handlePeopleCountChange}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value={1}>1 personne</option>
                  <option value={2} disabled={availableRoomCount < 2}>
                    2 personnes
                    {availableRoomCount < 2 ? " — deux salles requises" : ""}
                  </option>
                </select>
              </label>

              <div className="rounded-2xl border border-stone-200 p-5">
                <h4 className="text-lg font-bold text-stone-900">
                  Coordonnées du client principal
                </h4>
                <p className="mt-1 text-sm text-stone-600">
                  L’e-mail est obligatoire pour le paiement et l’envoi des QR
                  codes.
                </p>
                <div className="mt-4 grid gap-5 sm:grid-cols-3">
                  <TextField
                    label="Nom complet *"
                    name="primaryCustomerName"
                    value={reservationForm.primaryCustomerName}
                    onChange={handlePrimaryFieldChange}
                    autoComplete="name"
                    placeholder="Nom complet"
                    required
                  />
                  <TextField
  label="Date de naissance *"
  type="date"
  name="primaryCustomerBirthDate"
  value={reservationForm.primaryCustomerBirthDate}
  onChange={handlePrimaryFieldChange}
  max={new Date().toISOString().split("T")[0]}
  required
/>
                  <PhoneField
  label="Téléphone *"
  country={country}
  value={reservationForm.primaryCustomerPhone}
  onChange={(value) => {
    const phoneValue = value || "";

    setReservationForm((current) => {
      const guests = current.guests.map((guest, index) => {
        if (index !== 0 || !guest.isSelf) {
          return guest;
        }

        return {
          ...guest,
          customerPhone: phoneValue,
        };
      });

      return {
        ...current,
        primaryCustomerPhone: phoneValue,
        guests,
      };
    });

    setReservationError("");
  }}
  required
/>
                </div>
                <div className="mt-5">
                  <TextField
                    label="Adresse e-mail *"
                    type="email"
                    name="primaryCustomerEmail"
                    value={reservationForm.primaryCustomerEmail}
                    onChange={handlePrimaryFieldChange}
                    autoComplete="email"
                    placeholder="votre@email.com"
                    required
                  />
                </div>
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
  <p className="mb-3 font-semibold text-stone-900">
  {reservationForm.peopleCount === 1
    ? "À qui est destinée la séance de massage ?"
    : "À qui sont destinées les séances de massage ?"}{" "}
  *
</p>

  <div className="space-y-3">
    {reservationForm.peopleCount === 1 ? (
      <>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="recipientMode"
            value="self"
            checked={
              reservationForm.recipientMode === "self"
            }
            onChange={() =>
              handleRecipientModeChange("self")
            }
            className="mt-1 h-4 w-4"
          />

          <span>
            <span className="block font-semibold text-stone-900">
              La séance de massage est pour moi
            </span>

          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="recipientMode"
            value="other"
            checked={
              reservationForm.recipientMode === "other"
            }
            onChange={() =>
              handleRecipientModeChange("other")
            }
            className="mt-1 h-4 w-4"
          />

          <span>
            <span className="block font-semibold text-stone-900">
              La séance de massage est pour une autre personne
            </span>
          </span>
        </label>
      </>
    ) : (
      <>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="recipientMode"
            value="self_and_other"
            checked={
              reservationForm.recipientMode ===
              "self_and_other"
            }
            onChange={() =>
              handleRecipientModeChange(
                "self_and_other"
              )
            }
            className="mt-1 h-4 w-4"
          />

          <span>
            <span className="block font-semibold text-stone-900">
              Les séances de massage sont pour moi et une autre personne
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="recipientMode"
            value="two_others"
            checked={
              reservationForm.recipientMode ===
              "two_others"
            }
            onChange={() =>
              handleRecipientModeChange("two_others")
            }
            className="mt-1 h-4 w-4"
          />

          <span>
            <span className="block font-semibold text-stone-900">
              Les séances de massage sont pour deux autres personnes
            </span>
          </span>
        </label>
      </>
    )}
  </div>
</div>
              </div>

              {reservationForm.guests.map((guest, index) => {
                const selectedService =
                  massageServices.find((service) => service.id === guest.serviceId) ||
                  null;
                const availableOptions = (selectedService?.options || []).filter(
                  optionFitsSelectedStart
                );
                const guestIsMinor = isMinorAtAppointment(
                  guest.customerBirthDate,
                  selectedSlot.start
                );

                const guestAge = calculateAgeAtDate(
                  guest.customerBirthDate,
                  selectedSlot.start
                );
                const selectedOption =
                  availableOptions.find(
                    (option) => option.id === guest.serviceOptionId
                  ) || null;

                return (
                  <div
                    key={guest.guestNumber}
                    className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5"
                  >
                    <h4 className="text-lg font-bold text-stone-900">
                      Personne {index + 1}
                    </h4>
                    <div className="mt-4 grid gap-5 md:grid-cols-3">
  <TextField
    label="Nom complet *"
    value={guest.customerName}
    onChange={(event) =>
      handleGuestChange(
        index,
        "customerName",
        event.target.value
      )
    }
    placeholder={
      index === 0
        ? "Nom de la personne qui recevra le massage"
        : "Nom de l’invité"
    }
    disabled={index === 0 && guest.isSelf}
    required
  />

  <TextField
    label="Date de naissance *"
    type="date"
    value={guest.customerBirthDate}
    onChange={(event) => {
      handleGuestChange(
        index,
        "customerBirthDate",
        event.target.value
      );

      handleGuestChange(
        index,
        "parentOnSiteConfirmed",
        false
      );
    }}
    max={new Date().toISOString().split("T")[0]}
    disabled={index === 0 && guest.isSelf}
    required
  />

  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-stone-800">
      Massage *
    </span>

    <select
      value={guest.serviceId}
      onChange={(event) =>
        handleGuestChange(
          index,
          "serviceId",
          event.target.value
        )
      }
      required
      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
    >
      <option value="">
        Sélectionnez un massage
      </option>

      {massageServices
  .slice()
  .sort(
    (a, b) =>
      Number(a.sort_order || 0) -
        Number(b.sort_order || 0) ||
      String(a.name_fr || a.name).localeCompare(
        String(b.name_fr || b.name),
        "fr",
        { sensitivity: "base" }
      )
  )
  .map((service) => (
    <option key={service.id} value={service.id}>
      {service.name_fr || service.name}
    </option>
  ))}
    </select>
  </label>
</div>
{guestIsMinor && (
  <div className="mt-5 rounded-xl border-2 border-red-300 bg-red-50 p-4">
    <div className="flex items-start gap-3">
      <span className="text-2xl" aria-hidden="true">
        ⚠️
      </span>

      <div>
        <p className="font-bold text-red-800">
          Client mineur
          {guestAge !== null
            ? ` — ${guestAge} an${guestAge > 1 ? "s" : ""}`
            : ""}
        </p>

        <p className="mt-1 text-sm leading-relaxed text-red-700">
          Toute personne âgée de moins de 18 ans doit être
          accompagnée par un parent ou un représentant légal,
          qui devra rester sur place pendant toute la séance.
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={guest.parentOnSiteConfirmed}
            onChange={(event) =>
              handleGuestChange(
                index,
                "parentOnSiteConfirmed",
                event.target.checked
              )
            }
            className="mt-1 h-4 w-4"
          />

          <span className="text-sm font-semibold text-red-800">
            Je confirme qu’un parent ou représentant légal sera
            présent sur place pendant toute la séance. *
          </span>
        </label>
      </div>
    </div>
  </div>
)}

                    <div className="mt-5 grid gap-5 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-stone-800">
                          Durée *
                        </span>
                        <select
                          value={guest.serviceOptionId}
                          onChange={(event) =>
                            handleGuestChange(
                              index,
                              "serviceOptionId",
                              event.target.value
                            )
                          }
                          required
                          disabled={!selectedService}
                          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none transition disabled:bg-stone-100 focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
                        >
                          <option value="">Sélectionnez une durée</option>
                          {availableOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.duration_minutes} min · USD{" "}
                              {Number(option.price_usd).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedOption && (
                        <SummaryItem
                          label="Fin prévue"
                          value={formatEndTime(
                            selectedSlot.start,
                            selectedOption.duration_minutes
                          )}
                        />
                      )}
                    </div>

                    <div className="mt-5 grid gap-5 sm:grid-cols-2">
  <PhoneField
    label="Téléphone *"
    country={country}
    value={guest.customerPhone}
    onChange={(value) =>
      handleGuestChange(
        index,
        "customerPhone",
        value || ""
      )
    }
    placeholder="Numéro de téléphone"
    required
    disabled={index === 0 && guest.isSelf}
  />

  <TextField
    label={
      guest.isGift && !guest.recipientKnows
        ? "Adresse e-mail (facultative)"
        : "Adresse e-mail *"
    }
    type="email"
    value={guest.customerEmail}
    onChange={(event) =>
      handleGuestChange(
        index,
        "customerEmail",
        event.target.value
      )
    }
    placeholder={
      guest.isGift && !guest.recipientKnows
        ? "Facultative pour préserver la surprise"
        : "Adresse e-mail du destinataire"
    }
    disabled={index === 0 && guest.isSelf}
    required={!(guest.isGift && !guest.recipientKnows)}
  />
</div>

{!guest.isSelf && (
  <div className="mt-5 space-y-4 rounded-xl border border-stone-200 bg-white p-4">
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={guest.isGift}
        onChange={(event) => {
          const checked = event.target.checked;

          handleGuestChange(index, "isGift", checked);

          if (!checked) {
            handleGuestChange(
              index,
              "recipientKnows",
              true
            );
          }
        }}
        className="mt-1 h-4 w-4"
      />

      <span>
        <span className="block font-semibold text-stone-900">
          Ce massage est-il un cadeau ?
        </span>

        <span className="mt-1 block text-sm text-stone-600">
          Les communications peuvent être envoyées uniquement
          à la personne qui effectue la réservation.
        </span>
      </span>
    </label>

    {guest.isGift && (
      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">
          La personne sait-elle qu’elle recevra ce massage ? *
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={`recipientKnows-${guest.guestNumber}`}
              checked={guest.recipientKnows === true}
              onChange={() =>
                handleGuestChange(
                  index,
                  "recipientKnows",
                  true
                )
              }
            />
            <span>Oui</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={`recipientKnows-${guest.guestNumber}`}
              checked={guest.recipientKnows === false}
              onChange={() => {
                handleGuestChange(
                  index,
                  "recipientKnows",
                  false
                );

                handleGuestChange(
                  index,
                  "customerEmail",
                  ""
                );
              }}
            />
            <span>Non, c’est une surprise</span>
          </label>
        </div>
      </div>
    )}

    {guest.isGift && !guest.recipientKnows && (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Aucun e-mail ne sera envoyé à cette personne avant le
        rendez-vous. Les informations de réservation seront envoyées
        uniquement au client principal.
      </div>
    )}
  </div>
)}
                  </div>
                );
              })}

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-stone-800">
                  Notes ou préférences
                </span>
                <textarea
                  name="notes"
                  value={reservationForm.notes}
                  onChange={handlePrimaryFieldChange}
                  rows={4}
                  placeholder="Précisez toute information utile..."
                  className="w-full resize-y rounded-xl border border-stone-300 px-4 py-3 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
                />
              </label>

              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold text-stone-800">
                    Total estimé
                  </span>
                  <span className="text-xl font-bold text-amber-800">
                    USD {estimatedTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Après confirmation, le créneau sera retenu pendant 60 minutes.
                Le paiement devra être effectué avant l’expiration du délai.
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={reservationSubmitting}
                  onClick={() => {
                    setShowReservationForm(false);
                    setReservationError("");
                  }}
                  className="rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={reservationSubmitting}
                  className={`rounded-xl px-6 py-3 font-semibold text-white shadow-sm transition ${
                    reservationSubmitting
                      ? "cursor-not-allowed bg-gray-400"
                      : "bg-amber-700 hover:bg-amber-800"
                  }`}
                >
                  {reservationSubmitting
                    ? "Création de la réservation..."
                    : "Confirmer la réservation"}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {pendingHoldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hold-modal-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="text-4xl">⏳</div>
            <h3
              id="hold-modal-title"
              className="mt-3 text-2xl font-bold text-stone-900"
            >
              Votre créneau est maintenant retenu
            </h3>
            <p className="mt-3 leading-relaxed text-stone-700">
              Le créneau est réservé temporairement pendant 60 minutes. Le
              paiement doit être effectué avant l’expiration du délai. Sans
              paiement, la réservation expirera automatiquement et le créneau
              redeviendra disponible.
            </p>
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Le délai a commencé au moment où la réservation a été créée. Le
              compte à rebours affichera le temps réellement restant.
            </div>
            <button
              type="button"
              onClick={acknowledgeHold}
              className="mt-6 w-full rounded-xl bg-amber-700 px-6 py-3 font-semibold text-white transition hover:bg-amber-800"
            >
              OK, procéder au paiement
            </button>
          </div>
        </div>
      )}

      <footer className="bg-stone-950 px-5 py-8 text-center text-sm text-white/60">
        <p>
          © {new Date().getFullYear()} A’QUA D’OR — Espace massage et bien-être
        </p>
      </footer>
    </div>
  );
}

function MassageServiceCard({
  service,
  language,
}) {
  const [expanded, setExpanded] = useState(false);

  const isFrench = language === "fr";

  const serviceName =
    isFrench && service.name_fr
      ? service.name_fr
      : service.name;

  const shortDescription =
    isFrench && service.short_description_fr
      ? service.short_description_fr
      : service.short_description;

  const fullDescription =
    isFrench && service.full_description_fr
      ? service.full_description_fr
      : service.full_description;

  const benefitsText =
    isFrench && service.benefits_fr
      ? service.benefits_fr
      : service.benefits;

  const recommendedForText =
    isFrench && service.recommended_for_fr
      ? service.recommended_for_fr
      : service.recommended_for;

  const benefits = textToList(benefitsText);

  const recommendedFor = textToList(
    recommendedForText
  );

  const visibleBenefits = expanded
    ? benefits
    : benefits.slice(0, 4);

  const visibleRecommendedFor = expanded
    ? recommendedFor
    : recommendedFor.slice(0, 5);

  const hasAdditionalContent =
    Boolean(fullDescription) ||
    benefits.length > 4 ||
    recommendedFor.length > 5;

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        {service.image_url ? (
          <img
            src={service.image_url}
            alt={serviceName}
            className="h-56 w-full object-cover"
          />
        ) : (
          <div className="flex h-56 items-center justify-center bg-gradient-to-br from-stone-200 via-amber-50 to-amber-100 text-7xl">
            {service.icon || "💆"}
          </div>
        )}

        <div className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/50 bg-white/90 text-2xl shadow-md backdrop-blur">
          {service.icon || "💆"}
        </div>
      </div>

      <div className="p-6">
        <h3 className="text-xl font-bold text-stone-900">
          {serviceName}
        </h3>

        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          {shortDescription ||
            (isFrench
              ? "Découvrez ce soin conçu pour favoriser votre détente et votre bien-être."
              : "Discover this treatment designed to promote relaxation and well-being.")}
        </p>

        {benefits.length > 0 && (
          <div className="mt-5">
            <h4 className="text-sm font-bold text-stone-900">
              {isFrench ? "Bienfaits" : "Benefits"}
            </h4>

            <ul className="mt-2 space-y-2">
              {visibleBenefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2 text-sm text-stone-600"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                    ✓
                  </span>

                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recommendedFor.length > 0 && (
          <div className="mt-5">
            <h4 className="text-sm font-bold text-stone-900">
              {isFrench
                ? "Recommandé pour"
                : "Recommended for"}
            </h4>

            <div className="mt-2 flex flex-wrap gap-2">
              {visibleRecommendedFor.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {expanded && fullDescription && (
          <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <h4 className="text-sm font-bold text-stone-900">
              {isFrench
                ? "À propos de ce massage"
                : "About this massage"}
            </h4>

            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-600">
              {fullDescription}
            </p>
          </div>
        )}

        <div className="mt-5">
          <h4 className="text-sm font-bold text-stone-900">
            {isFrench
              ? "Durées et tarifs"
              : "Durations and prices"}
          </h4>

          {service.options?.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {service.options.map((option) => (
                <span
                  key={option.id}
                  className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700"
                >
                  {option.duration_minutes} min · USD{" "}
                  {Number(option.price_usd).toFixed(2)}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-stone-500">
              {isFrench
                ? "Tarifs bientôt disponibles."
                : "Prices coming soon."}
            </p>
          )}
        </div>

        {hasAdditionalContent && (
  <div className="mt-6">
    <button
      type="button"
      onClick={() =>
        setExpanded((current) => !current)
      }
      className="w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
    >
      {expanded
        ? isFrench
          ? "Afficher moins"
          : "Show less"
        : isFrench
        ? "En savoir plus"
        : "Learn more"}
    </button>
  </div>
)}
      </div>
    </article>
  );
}

function RoomAvailabilityRow({ room, now }) {
  const remainingHoldSeconds =
    room.availability_status === "temporary_hold" &&
    room.hold_expires_at
      ? Math.max(
          0,
          Math.floor(
            (new Date(room.hold_expires_at).getTime() - now) /
              1000
          )
        )
      : 0;

  return (
    <div className="rounded-lg bg-white px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <span className="font-medium text-stone-800">
          {room.room_name}
        </span>

        {room.available ? (
          <span className="font-semibold text-emerald-700">
            Disponible
          </span>
        ) : room.availability_status ===
          "temporary_hold" ? (
          <div className="text-left sm:text-right">
            <p className="font-semibold text-amber-700">
              Retenue temporairement
            </p>

            {remainingHoldSeconds > 0 ? (
              <p className="mt-1 font-mono text-lg font-bold text-amber-800">
                {formatCountdown(remainingHoldSeconds)}
              </p>
            ) : (
              <p className="mt-1 text-sm font-semibold text-stone-600">
                Vérification de la disponibilité...
              </p>
            )}
          </div>
        ) : (
          <span className="font-semibold text-red-700">
            Réservée
          </span>
        )}
      </div>

      {!room.available &&
        room.reserved_until && (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <p className="text-sm leading-relaxed text-stone-600">
              {room.availability_status ===
              "temporary_hold"
                ? "Si ce créneau est confirmé, "
                : ""}
              cette salle sera de nouveau disponible à{" "}
              <span className="font-bold text-stone-900">
                {room.reserved_until}
              </span>
              .
            </p>
          </div>
        )}
    </div>
  );
}

function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(
    0,
    Number(totalSeconds || 0)
  );

  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

function PhoneField({
  label,
  country,
  value,
  onChange,
  placeholder = "Numéro de téléphone",
  required = false,
  disabled = false,
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-stone-800">
        {label}
      </span>

      <div className="rounded-xl border border-stone-300 bg-white px-4 py-3 transition focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/20">
        <PhoneInput
          international
          defaultCountry={country}
          countryCallingCodeEditable={false}
          value={value}
          onChange={(phoneValue) => onChange(phoneValue || "")}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="w-full"
        />
      </div>
    </label>
  );
}

function TextField({
  label,
  type = "text",
  disabled = false,
  ...props
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-stone-800">
        {label}
      </span>

      <input
        type={type}
        disabled={disabled}
        {...props}
        className={`w-full rounded-xl border border-stone-300 px-4 py-3 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 ${
          disabled
            ? "cursor-not-allowed bg-stone-100 text-stone-600"
            : "bg-white"
        }`}
      />
    </label>
  );
}

function InformationCard({ icon, title, text }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-4 text-3xl">{icon}</div>
      <h3 className="text-lg font-semibold text-stone-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">{text}</p>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <p className="mt-1 font-semibold text-stone-900">{value || "—"}</p>
    </div>
  );
}

function textToList(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function calculateAgeAtDate(birthDate, referenceDate) {
  if (!birthDate || !referenceDate) return null;

  const [birthYear, birthMonth, birthDay] = birthDate
    .split("-")
    .map(Number);

  if (!birthYear || !birthMonth || !birthDay) {
    return null;
  }

  const referenceParts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Port-au-Prince",
  }).formatToParts(new Date(referenceDate));

  const getPart = (type) =>
    Number(
      referenceParts.find((part) => part.type === type)?.value
    );

  const referenceYear = getPart("year");
  const referenceMonth = getPart("month");
  const referenceDay = getPart("day");

  if (
    !referenceYear ||
    !referenceMonth ||
    !referenceDay
  ) {
    return null;
  }

  let age = referenceYear - birthYear;

  const birthdayHasPassed =
    referenceMonth > birthMonth ||
    (
      referenceMonth === birthMonth &&
      referenceDay >= birthDay
    );

  if (!birthdayHasPassed) {
    age -= 1;
  }

  return age;
}

function isMinorAtAppointment(birthDate, appointmentStart) {
  const age = calculateAgeAtDate(
    birthDate,
    appointmentStart
  );

  return age !== null && age < 18;
}


function formatEndTime(start, durationMinutes) {
  return formatHaitiTime(
    new Date(start.getTime() + Number(durationMinutes) * 60 * 1000)
  );
}

function formatHaitiTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Port-au-Prince",
  }).format(new Date(value));
}

function capitalizeFirstLetter(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}