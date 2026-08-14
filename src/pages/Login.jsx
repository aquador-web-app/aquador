import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from "../context/AuthContext";
import usePWAHardwareBack from "../hooks/usePWAHardwareBack";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import PhoneInput, {
  isValidPhoneNumber,
} from "react-phone-number-input";

import { detectCountryISO } from "../lib/detectCountry";
import PaymentPage from "../components/payments/PaymentPage";

function InstallButton() {
  const { canInstall, install } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <button
      onClick={install}
      className="mt-4 w-full bg-green-600 text-white py-2 rounded-lg font-semibold"
    >
      📲 Installer l’application
    </button>
  );
}


function ClosureVisitorRegistration() {
  const [open, setOpen] = useState(false);

  const [showMemberWarning, setShowMemberWarning] =
  useState(false);

  const [country, setCountry] =
    useState("HT");

  const [fullName, setFullName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [visitorEmail, setVisitorEmail] =
    useState("");

  const [peopleCount, setPeopleCount] =
    useState(1);

  const [registrationType, setRegistrationType] =
    useState("self");

  const [participants, setParticipants] =
    useState([
      {
        full_name: "",
        phone: "",
      },
    ]);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [registration, setRegistration] =
    useState(null);

  const [showPayment, setShowPayment] =
    useState(false);

    const [visitorPaymentMethod, setVisitorPaymentMethod] =
  useState(null);

  const [manualAmount, setManualAmount] =
  useState("");

const [manualProofUrl, setManualProofUrl] =
  useState(null);

const [manualSubmitting, setManualSubmitting] =
  useState(false);

const [manualUploading, setManualUploading] =
  useState(false);

const [manualMessage, setManualMessage] =
  useState("");

  useEffect(() => {
    try {
      setCountry(
        detectCountryISO() || "HT"
      );
    } catch {
      setCountry("HT");
    }
  }, []);

  useEffect(() => {
  // POUR MOI SEULEMENT
  if (registrationType === "self") {
    setPeopleCount(1);

    setParticipants([
      {
        full_name: fullName,
        phone: phone,
      },
    ]);

    return;
  }

  // POUR MOI + D'AUTRES
  // Participant 1 must always be the main contact.
  if (registrationType === "self_others") {
    setParticipants((current) => {
      const count =
        Math.max(2, peopleCount);

      const next = [];

      for (
        let i = 0;
        i < count;
        i += 1
      ) {
        if (i === 0) {
          next.push({
            full_name: fullName,
            phone: phone,
          });
        } else {
          next.push(
            current[i] || {
              full_name: "",
              phone: "",
            }
          );
        }
      }

      return next;
    });
  }
}, [
  registrationType,
  fullName,
  phone,
  peopleCount,
]);

  const amountDue =
    Number(peopleCount || 0) * 10;

  function handlePeopleCountChange(event) {
  const nextCount =
    Number(event.target.value);

  setPeopleCount(nextCount);

  setParticipants((current) => {
    const next = [];

    for (
      let i = 0;
      i < nextCount;
      i += 1
    ) {
      // POUR MOI + D'AUTRES
      // Participant 1 = main contact
      if (
        registrationType ===
          "self_others" &&
        i === 0
      ) {
        next.push({
          full_name: fullName,
          phone: phone,
        });

        continue;
      }

      next.push(
        current[i] || {
          full_name: "",
          phone: "",
        }
      );
    }

    return next;
  });

  setError("");
}

  function updateParticipant(
    index,
    field,
    value
  ) {
    setParticipants((current) =>
      current.map(
        (participant, participantIndex) =>
          participantIndex === index
            ? {
                ...participant,
                [field]: value,
              }
            : participant
      )
    );

    setError("");
  }

  function validate() {
    if (!fullName.trim()) {
      return "Veuillez entrer votre nom complet.";
    }

    if (!phone) {
      return "Veuillez entrer votre numéro de téléphone.";
    }

    if (
      !isValidPhoneNumber(phone)
    ) {
      return "Veuillez entrer un numéro de téléphone valide.";
    }

    if (!visitorEmail.trim()) {
  return "Veuillez entrer votre adresse e-mail.";
}

if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    visitorEmail.trim()
  )
) {
  return "Veuillez entrer une adresse e-mail valide.";
}

    for (
      let index = 0;
      index < participants.length;
      index += 1
    ) {
      const participant =
        participants[index];

      if (
        !participant.full_name.trim()
      ) {
        return `Veuillez entrer le nom du participant ${
          index + 1
        }.`;
      }

      if (!participant.phone) {
        return `Veuillez entrer le numéro de téléphone du participant ${
          index + 1
        }. Si cette personne ne possède pas de téléphone, veuillez saisir votre propre numéro.`;
      }

      if (
        !isValidPhoneNumber(
          participant.phone
        )
      ) {
        return `Veuillez entrer un numéro de téléphone valide pour le participant ${
          index + 1
        }.`;
      }
    }

    return "";
  }

  async function handleVisitorProof(file) {
  if (!file) return;

  setManualUploading(true);
  setManualProofUrl(null);
  setError("");

  try {
    const ext =
      file.name.split(".").pop() || "jpg";

    const path =
      `event-visitor-proofs/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

    const { error: uploadError } =
      await supabase.storage
        .from("documents")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
        });

    if (uploadError) {
      throw uploadError;
    }

    const { data } =
      supabase.storage
        .from("documents")
        .getPublicUrl(path);

    if (!data?.publicUrl) {
      throw new Error(
        "Impossible de récupérer l'URL de la preuve."
      );
    }

    setManualProofUrl(
      data.publicUrl
    );
  } catch (err) {
    console.error(
      "Visitor proof upload error:",
      err
    );

    setError(
      err?.message ||
        "Impossible de téléverser la preuve."
    );
  } finally {
    setManualUploading(false);
  }
}

async function submitVisitorManualPayment() {
  if (!registration?.registration_id) {
    setError(
      "Inscription introuvable."
    );
    return;
  }

  const amount =
    Number(manualAmount);

  if (!amount || amount <= 0) {
    setError(
      "Veuillez entrer un montant valide."
    );
    return;
  }

  const balance =
    Number(
      registration.amount_due || 0
    );

  if (amount > balance) {
    setError(
      `Le montant ne peut pas dépasser USD ${balance.toFixed(
        2
      )}.`
    );
    return;
  }

  if (
    visitorPaymentMethod ===
      "transfer" &&
    !manualProofUrl
  ) {
    setError(
      "Veuillez joindre une preuve de virement."
    );
    return;
  }

  setManualSubmitting(true);
  setError("");
  setManualMessage("");

  try {
    const {
      data,
      error: paymentError,
    } = await supabase.rpc(
      "submit_event_visitor_payment",
      {
        p_registration_id:
          registration.registration_id,

        p_phone:
          phone,

        p_email:
          visitorEmail.trim(),

        p_amount:
          amount,

        p_method:
          visitorPaymentMethod ===
          "cash"
            ? "cash"
            : "transfer",

        p_proof_url:
          manualProofUrl,
      }
    );

    if (paymentError) {
      throw paymentError;
    }

    setManualMessage(
      data?.message ||
        "Votre paiement a été soumis pour validation."
    );

    setManualAmount("");
    setManualProofUrl(null);
    setVisitorPaymentMethod(null);
  } catch (err) {
    console.error(
      "Visitor payment submission error:",
      err
    );

    setError(
      err?.message ||
        "Impossible de soumettre le paiement."
    );
  } finally {
    setManualSubmitting(false);
  }
}

  async function submitRegistration(
    event
  ) {
    event.preventDefault();

    setError("");

    const validationError =
      validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        "create_event_visitor_registration",
        {
          p_full_name:
            fullName.trim(),

          p_phone:
            phone,

          p_email:
            visitorEmail.trim() ||
            null,

          p_participants:
            participants.map(
              (participant) => ({
                full_name:
                  participant.full_name.trim(),

                phone:
                  participant.phone,
              })
            ),
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      if (
        !data?.registration_id ||
        !data?.invoice_id
      ) {
        throw new Error(
          "La confirmation n'a pas pu être créée."
        );
      }

      setRegistration(data);
      setShowPayment(false);
      setVisitorPaymentMethod(null);
    } catch (err) {
      console.error(
        "Visitor registration error:",
        err
      );

      setError(
        err?.message ||
          "Impossible d'enregistrer votre participation."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function closeVisitorModal() {
  setOpen(false);
  setShowPayment(false);
  setVisitorPaymentMethod(null);
}

  return (
    <>
      {/* PUBLIC CLOSING CEREMONY CARD */}
      <div className="w-full max-w-md mb-6 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-lg">
        <div className="bg-gradient-to-r from-blue-700 to-cyan-500 px-6 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
            A'QUA D'OR
          </p>

          <h2 className="mt-1 text-xl font-bold">
            🏅 Cérémonie de clôture
          </h2>

          <p className="mt-1 text-sm text-white/90">
            Samedi 29 août 2026 • 9 h 00
          </p>
        </div>

        <div className="p-5">
          <p className="text-sm leading-relaxed text-gray-600">
            Vous souhaitez assister à notre
            cérémonie de clôture, à la remise
            des certificats et à la
            mini-compétition ?
          </p>

          <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <strong>
              Participation visiteur :
            </strong>{" "}
            USD 10.00 par personne.
            <p className="mt-1 text-xs font-semibold text-red-600">
    ⚠️ Frais non remboursables.
  </p>
          </div>

          <div className="mt-4 space-y-3">
  <button
  type="button"
  onClick={() => {
    setError("");
    setShowMemberWarning(true);
  }}
  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
>
  Confirmer ma participation
</button>

  <Link
    to="/ceremonie/ma-participation"
    className="flex w-full items-center justify-center rounded-xl border border-blue-600 px-5 py-3 font-semibold text-blue-700 transition hover:bg-blue-50"
  >
    J'ai déjà confirmé — Gérer ma participation
  </Link>
</div>
        </div>
      </div>

      {/* MEMBER WARNING BEFORE PUBLIC REGISTRATION */}
{showMemberWarning && (
  <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4 py-6">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <div className="text-center">
        <div className="text-4xl">
          ⚠️
        </div>

        <h3 className="mt-3 text-xl font-bold text-gray-900">
          Êtes-vous déjà inscrit(e) à A'QUA D'OR ?
        </h3>

        <p className="mt-4 text-sm leading-relaxed text-gray-600">
          Si vous êtes déjà inscrit(e) à A'QUA D'OR,
          <strong className="text-gray-900">
            {" "}n'utilisez pas ce portail visiteur.
          </strong>
        </p>

        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Veuillez vous connecter à votre profil afin de
          confirmer votre participation à la cérémonie et
          d'ajouter votre ou vos invités.
        </p>

        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Ce portail est destiné aux personnes qui ne sont
          pas déjà inscrites à A'QUA D'OR.
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setShowMemberWarning(false);

            setTimeout(() => {
              document
                .getElementById(
                  "aquador-login-card"
                )
                ?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
            }, 100);
          }}
          className="rounded-xl border border-blue-600 px-4 py-3 font-semibold text-blue-700 hover:bg-blue-50"
        >
          🔐 Me connecter
        </button>

        <button
          type="button"
          onClick={() => {
            setShowMemberWarning(false);
            setError("");
            setOpen(true);
          }}
          className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Continuer
        </button>
      </div>

      <button
        type="button"
        onClick={() =>
          setShowMemberWarning(false)
        }
        className="mt-3 w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
      >
        Annuler
      </button>
    </div>
  </div>
)}

      {/* MODAL */}
      {open && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 px-4 py-6">
          <div className="flex min-h-full items-start justify-center sm:items-center">
            <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Cérémonie de clôture
                  </h2>

                  <p className="text-xs text-gray-500">
                    Samedi 29 août 2026 •
                    9 h 00
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeVisitorModal
                  }
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-lg text-gray-600 hover:bg-gray-200"
                >
                  ×
                </button>
              </div>

              {!registration ? (
                <form
                  onSubmit={
                    submitRegistration
                  }
                  className="space-y-6 p-5 sm:p-6"
                >
                  {/* CONTACT */}
                  <section>
                    <h3 className="font-bold text-gray-900">
                      Contact principal
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      Informations de la
                      personne effectuant la
                      confirmation.
                    </p>

                    <div className="mt-4 space-y-4">
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-gray-700">
                          Nom complet *
                        </span>

                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => {
                            setFullName(
                              e.target.value
                            );
                            setError("");
                          }}
                          className="input w-full"
                          placeholder="Nom et prénom"
                          required
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-gray-700">
                          Téléphone *
                        </span>

                        <PhoneInput
  international
  defaultCountry={country}
  countryCallingCodeEditable={false}
  value={phone}
  onChange={(value) => {
    setPhone(value || "");
    setError("");
  }}
  placeholder="Numéro de téléphone"
/>
                      </label>

                      <label className="block">
  <span className="mb-1.5 block text-sm font-medium text-gray-700">
    E-mail *
  </span>

  <input
    type="email"
    value={visitorEmail}
    onChange={(e) => {
      setVisitorEmail(e.target.value);
      setError("");
    }}
    className="input w-full"
    placeholder="votre@email.com"
    required
  />

  <p className="mt-1 text-xs text-gray-500">
    Cette adresse sera utilisée avec votre numéro de téléphone
    pour accéder et gérer votre participation.
  </p>
</label>
                    </div>
                  </section>

                 {/* REGISTRATION TYPE + COUNT */}
<section className="border-t pt-5">
  <h3 className="font-bold text-gray-900">
    Qui souhaitez-vous inscrire ?
  </h3>

  <div className="mt-4 grid grid-cols-1 gap-3">
    {/* SELF */}
    <label
      className={`cursor-pointer rounded-xl border p-4 ${
        registrationType === "self"
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name="registrationType"
          value="self"
          checked={
            registrationType === "self"
          }
          onChange={() => {
            setRegistrationType("self");

            setPeopleCount(1);

            setParticipants([
              {
                full_name: fullName,
                phone: phone,
              },
            ]);

            setError("");
          }}
          className="mt-1"
        />

        <div>
          <span className="font-semibold text-gray-900">
            Pour moi seulement
          </span>

          <p className="mt-1 text-xs text-gray-500">
            Vos informations seront
            utilisées automatiquement
            comme participant.
          </p>
        </div>
      </div>
    </label>

    {/* SELF + OTHERS */}
    <label
      className={`cursor-pointer rounded-xl border p-4 ${
        registrationType ===
        "self_others"
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name="registrationType"
          value="self_others"
          checked={
            registrationType ===
            "self_others"
          }
          onChange={() => {
            setRegistrationType(
              "self_others"
            );

            setPeopleCount(2);

            setParticipants([
              {
                full_name: fullName,
                phone: phone,
              },
              {
                full_name: "",
                phone: "",
              },
            ]);

            setError("");
          }}
          className="mt-1"
        />

        <div>
          <span className="font-semibold text-gray-900">
            Pour moi et d’autres
            personnes
          </span>

          <p className="mt-1 text-xs text-gray-500">
            Le participant 1 sera
            automatiquement rempli avec
            vos informations.
          </p>
        </div>
      </div>
    </label>

    {/* OTHERS ONLY */}
    <label
      className={`cursor-pointer rounded-xl border p-4 ${
        registrationType === "others"
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name="registrationType"
          value="others"
          checked={
            registrationType === "others"
          }
          onChange={() => {
            setRegistrationType("others");

            setPeopleCount(1);

            setParticipants([
              {
                full_name: "",
                phone: "",
              },
            ]);

            setError("");
          }}
          className="mt-1"
        />

        <div>
          <span className="font-semibold text-gray-900">
            Pour d’autres personnes
          </span>

          <p className="mt-1 text-xs text-gray-500">
            Vous êtes uniquement le
            contact principal. Les
            participants seront saisis
            séparément.
          </p>
        </div>
      </div>
    </label>
  </div>

  {/* NUMBER OF PARTICIPANTS */}
  {registrationType !== "self" && (
    <div className="mt-5">
      <label className="block">
        <span className="mb-2 block font-bold text-gray-900">
          Nombre total de participants *
        </span>

        <select
          value={peopleCount}
          onChange={
            handlePeopleCountChange
          }
          className="input w-full"
        >
          {Array.from(
            {
              length:
                registrationType ===
                "self_others"
                  ? 9
                  : 10,
            },
            (_, index) =>
              registrationType ===
              "self_others"
                ? index + 2
                : index + 1
          ).map((count) => (
            <option
              key={count}
              value={count}
            >
              {count}{" "}
              personne
              {count > 1 ? "s" : ""}
            </option>
          ))}
        </select>

        {registrationType ===
          "self_others" && (
          <p className="mt-1 text-xs text-gray-500">
            Ce nombre vous inclut.
          </p>
        )}
      </label>
    </div>
  )}

  {/* PRICE */}
  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
    <div className="flex justify-between text-sm">
      <span>
        Tarif par personne
      </span>

      <strong>USD 10.00</strong>
    </div>

    <div className="mt-2 flex justify-between border-t border-blue-200 pt-2">
      <span className="font-semibold">
        Total participation
      </span>

      <strong className="text-lg text-blue-700">
        USD {amountDue.toFixed(2)}
      </strong>
    </div>

    <p className="mt-2 text-xs text-blue-700">
      Des frais de traitement par carte
      seront affichés séparément avant
      le paiement.
    </p>
    <p className="mt-2 text-xs font-semibold text-red-600">
  ⚠️ Les frais de participation sont non remboursables.
</p>
  </div>
</section>

                  {/* PARTICIPANTS */}
                  <section className="border-t pt-5">
                    <h3 className="font-bold text-gray-900">
                      Participants
                    </h3>

                    {registrationType === "self" ? (
                      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <p className="font-semibold text-gray-900">
                          Participant 1
                        </p>

                        <div className="mt-3 space-y-2 text-sm">
                          <div>
                            <span className="text-gray-500">
                              Nom :
                            </span>{" "}
                            <strong>
                              {fullName ||
                                "À compléter"}
                            </strong>
                          </div>

                          <div>
                            <span className="text-gray-500">
                              Téléphone :
                            </span>{" "}
                            <strong>
                              {phone ||
                                "À compléter"}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="mt-1 text-sm text-gray-500">
                          Indiquez le nom et le téléphone
                          de chaque personne inscrite.
                        </p>

                        <div className="mt-4 space-y-4">
                          {participants.map(
                            (
                              participant,
                              index
                            ) => (
                              <div
                                key={index}
                                className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                              >
                                <p className="mb-3 font-semibold text-gray-900">
                                  Participant{" "}
                                  {index + 1}
                                </p>

                                {registrationType ===
  "self_others" &&
  index === 0 && (
    <p className="mb-3 text-xs font-medium text-blue-600">
      Vous
    </p>
  )}

                                <div className="space-y-3">
                                  <label className="block">
                                    <span className="mb-1 block text-sm text-gray-700">
                                      Nom complet *
                                    </span>

                                    <input
  type="text"
  value={participant.full_name}
  onChange={(e) =>
    updateParticipant(
      index,
      "full_name",
      e.target.value
    )
  }
  disabled={
    registrationType ===
      "self_others" &&
    index === 0
  }
  className={`input w-full ${
    registrationType ===
      "self_others" &&
    index === 0
      ? "bg-gray-100 cursor-not-allowed"
      : ""
  }`}
  required
/>
                                  </label>

                                  <label className="block">
                                    <span className="mb-1 block text-sm text-gray-700">
                                      Téléphone *
                                    </span>

                                    <PhoneInput
  international
  defaultCountry={country}
  countryCallingCodeEditable={false}
  value={participant.phone}
  onChange={(value) =>
    updateParticipant(
      index,
      "phone",
      value || ""
    )
  }
  disabled={
    registrationType ===
      "self_others" &&
    index === 0
  }
  placeholder="Numéro de téléphone"
/>

                                    {!(
  registrationType === "self_others" &&
  index === 0
) && (
  <p className="mt-2 text-xs text-gray-500">
    Si ce participant, notamment un enfant,
    ne possède pas de téléphone, veuillez
    saisir à nouveau votre propre numéro.
  </p>
)}
                                  </label>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </section>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={
                        closeVisitorModal
                      }
                      disabled={
                        submitting
                      }
                      className="flex-1 rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>

                    <button
                      type="submit"
                      disabled={
                        submitting
                      }
                      className="flex-1 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {submitting
                        ? "Confirmation..."
                        : "Confirmer ma participation"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-5 sm:p-6">
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
                    <div className="text-4xl">
                      ✅
                    </div>

                    <h3 className="mt-3 text-xl font-bold text-green-800">
                      Participation confirmée
                    </h3>

                    <p className="mt-2 text-sm text-green-700">
                      Votre participation à la
                      cérémonie de clôture du
                      29 août 2026 a bien été
                      enregistrée.
                    </p>
                  </div>

                  <div className="mt-5 rounded-xl border border-gray-200 p-4">
                    <div className="flex justify-between py-1 text-sm">
                      <span className="text-gray-500">
                        Participants
                      </span>

                      <strong>
                        {
                          registration.participant_count
                        }
                      </strong>
                    </div>

                    <div className="flex justify-between py-1 text-sm">
                      <span className="text-gray-500">
                        Tarif
                      </span>

                      <strong>
                        USD 10.00 /
                        personne
                      </strong>
                    </div>

                    <div className="mt-2 flex justify-between border-t pt-3">
                      <span className="font-bold">
                        Total
                      </span>

                      <strong className="text-lg text-blue-700">
                        USD{" "}
                        {Number(
                          registration.amount_due ||
                            0
                        ).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  {!showPayment ? (
                    <div className="mt-5 space-y-3">
                      <div className="rounded-xl border border-gray-200 p-4">
  <p className="mb-3 text-sm font-semibold text-gray-800">
    Choisissez votre mode de paiement
  </p>

  <div className="grid gap-2 sm:grid-cols-3">
    <button
      type="button"
      onClick={() => {
        setVisitorPaymentMethod("card");
        setShowPayment(true);
      }}
      className="rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-700"
    >
      💳 Carte
    </button>

    <button
      type="button"
      onClick={() => {
  setVisitorPaymentMethod("cash");
  setShowPayment(false);
  setManualAmount("");
  setManualProofUrl(null);
  setManualMessage("");
}}
      className="rounded-xl border border-green-500 px-3 py-3 text-sm font-semibold text-green-700 hover:bg-green-50"
    >
      💵 Espèces
    </button>

    <button
      type="button"
      onClick={() => {
  setVisitorPaymentMethod("transfer");
  setShowPayment(false);
  setManualAmount("");
  setManualProofUrl(null);
  setManualMessage("");
}}
      className="rounded-xl border border-purple-500 px-3 py-3 text-sm font-semibold text-purple-700 hover:bg-purple-50"
    >
      🏦 Virement
    </button>
  </div>
</div>

{visitorPaymentMethod === "cash" && (
  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
    <p className="font-semibold">
      Paiement en espèces
    </p>

    <p className="mt-1">
      Si vous avez effectué ou comptez effectuer
      un paiement en espèces auprès de
      l'administration A'QUA D'OR, soumettez le
      montant ci-dessous. Le paiement restera en
      attente jusqu'à sa validation par notre équipe.
    </p>

    <label className="mt-4 block">
      <span className="mb-1 block font-semibold">
        Montant (USD)
      </span>

      <input
        type="number"
        min="0.01"
        step="0.01"
        value={manualAmount}
        onChange={(e) =>
          setManualAmount(
            e.target.value
          )
        }
        placeholder="Ex. 20.00"
        className="input w-full bg-white"
      />
    </label>

    <button
      type="button"
      disabled={manualSubmitting}
      onClick={
        submitVisitorManualPayment
      }
      className="mt-4 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {manualSubmitting
        ? "Soumission..."
        : "Soumettre le paiement"}
    </button>
  </div>
)}

{visitorPaymentMethod === "transfer" && (
  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
    <p className="font-semibold">
      Paiement par virement
    </p>

    <p className="mt-1">
      Entrez le montant transféré et joignez une
      preuve du virement. Le paiement sera crédité
      après validation par notre équipe.
    </p>

    <label className="mt-4 block">
      <span className="mb-1 block font-semibold">
        Montant du virement (USD)
      </span>

      <input
        type="number"
        min="0.01"
        step="0.01"
        value={manualAmount}
        onChange={(e) =>
          setManualAmount(
            e.target.value
          )
        }
        placeholder="Ex. 20.00"
        className="input w-full bg-white"
      />
    </label>

    <div className="mt-4">
      <label className="block font-semibold">
        Preuve du virement
      </label>

      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) =>
          handleVisitorProof(
            e.target.files?.[0]
          )
        }
        className="mt-2 block w-full text-sm"
      />

      {manualUploading && (
        <p className="mt-2 text-xs">
          Téléversement...
        </p>
      )}

      {manualProofUrl && (
        <p className="mt-2 font-semibold text-green-700">
          ✓ Preuve téléversée
        </p>
      )}
    </div>

    <button
      type="button"
      disabled={
        manualSubmitting ||
        manualUploading
      }
      onClick={
        submitVisitorManualPayment
      }
      className="mt-4 w-full rounded-xl bg-purple-600 px-4 py-3 font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {manualSubmitting
        ? "Soumission..."
        : "Soumettre le virement"}
    </button>
  </div>
)}

{manualMessage && (
  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800">
    {manualMessage}
  </div>
)}

                      <Link
  to="/ceremonie/ma-participation"
  className="flex w-full items-center justify-center rounded-xl border border-blue-600 px-5 py-3 font-semibold text-blue-700 hover:bg-blue-50"
>
  Gérer ma participation
</Link>

                      <button
                        type="button"
                        onClick={
                          closeVisitorModal
                        }
                        className="w-full rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Payer plus tard /
                        Fermer
                      </button>

                      <p className="text-center text-xs text-gray-500">
                        Le paiement par carte
                        est facultatif à cette
                        étape.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-gray-900">
                            Paiement par carte
                          </h4>

                          <p className="text-xs text-gray-500">
                            Les frais de
                            traitement seront
                            affichés avant la
                            confirmation du
                            paiement.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
  setShowPayment(false);
  setVisitorPaymentMethod(null);
}}
                          className="text-sm font-semibold text-blue-600"
                        >
                          Retour
                        </button>
                      </div>

                      <PaymentPage
                        invoiceId={
                          registration.invoice_id
                        }
                        user={null}
                        email={visitorEmail.trim() || null}
                        invoiceType="event_visitor"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Login() {
//  usePWAHardwareBack({
//  onExit: () => {
//    // Do nothing or just prevent exit
//    console.log("Back pressed on login");
//  },
//});


  const navigate = useNavigate()   // ✅ REQUIRED
  const { user, loading } = useAuth();   // ✅ REQUIRED
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

usePWAHardwareBack({
  onExit: () => {
    setShowExitModal(true);
  },
});

  
useEffect(() => {
  if (loading || !user) return;

  const role = (user.role || "").toLowerCase();

  if (role === "admin" || role === "assistant") {
    navigate("/admin", { replace: true });
    return;
  }

  if (role === "teacher") {
    navigate("/teacher", { replace: true });
    return;
  }

  // default: normal user / influencer / student / club user
  navigate("/user", { replace: true });
}, [user, loading, navigate]);



  useEffect(() => {
    const accs = JSON.parse(localStorage.getItem("savedAccounts") || "[]");
    setSavedAccounts(accs);
  }, []);


// ⬅️ ADD THIS AT THE VERY TOP OF THE COMPONENT BODY

if (loading) {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Chargement…
    </div>
  );
}
  

  const submit = async (e) => {
    e.preventDefault()
    setErr('')

    const { data: {user}, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErr(error.message)
      return
    }

    const accs = JSON.parse(localStorage.getItem("savedAccounts") || "[]");

// Update or insert
const idx = accs.findIndex((a) => a.email === email);
if (idx >= 0) {
  accs[idx].password = password;
} else {
  accs.push({ email, password });
}

localStorage.setItem("savedAccounts", JSON.stringify(accs));
setSavedAccounts(accs);


    const { data: { session } } = await supabase.auth.getSession()
    console.log("Session:", session)

    // Fetch profile from SCHOOL profile table
const { data: schoolProf, error: schoolErr } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .maybeSingle();

if (schoolErr) {
  setErr("Erreur de récupération du profil: " + schoolErr.message);
  return;
}

// Fetch profile from CLUB profile table
const { data: clubProf, error: clubErr } = await supabase
  .from("club_profiles")
  .select("id")
  .eq("auth_user_id", user.id)
  .maybeSingle();

if (clubErr) {
  setErr("Erreur de récupération du profil Club: " + clubErr.message);
  return;
}

// CASE 1 — SCHOOL REAL user (not auto-created club placeholder)
// CASE 1 — SCHOOL REAL user
if (schoolProf && schoolProf.role && schoolProf.role !== "student_placeholder") {
  const role = (schoolProf.role || "").toLowerCase();

  switch (role) {
  case "admin":
  case "assistant":
    navigate("/admin", { replace: true });
    return;

  case "teacher":
    navigate("/teacher", { replace: true });
    return;

  case "influencer":
  case "student":
  default:
    navigate("/user", { replace: true });
    return;
}
}

// CASE 2 — CLUB ONLY user
if (!schoolProf && clubProf) {
  navigate("/user", { replace: true })
  return;
}


// CASE 3 — NO PROFILE ANYWHERE
setErr("Profil introuvable.");

}

  return (
  <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 sm:px-8 bg-gray-50">
    
    {/* Top navigation (responsive) */}
    <div className="w-full max-w-5xl flex justify-between items-center mb-6">
      <Link
        to="/ecole"
        className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm sm:text-base font-semibold shadow hover:bg-orange-600 transition"
      >
        ← Portail École
      </Link>

      <Link
        to="/club"
        className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm sm:text-base font-semibold shadow hover:bg-orange-600 transition"
      >
        Portail Club →
      </Link>
    </div>

    {/* Logo + subtitle */}
    <div className="flex flex-col items-center mb-6">
      <img
        src="/logo/aquador.png"
        alt="A'QUA D'OR Logo"
        className="h-16 w-16 sm:h-20 sm:w-20 mb-2"
      />
      <p className="text-gray-500 text-sm text-center">
        Accéder à votre Dashboard
      </p>
    </div>

    <ClosureVisitorRegistration />

    {/* Login card */}
    <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 w-full max-w-md">
      <h1 className="text-xl sm:text-2xl font-bold mb-4 text-center">
        Connexion
      </h1>

      {err && (
        <div className="mb-3 text-red-600 text-sm text-center">
          {err}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        
        {/* Email with dropdown */}
        <div className="relative">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            className="input w-full mt-1"
          />

          {showDropdown && savedAccounts.length > 0 && (
            <ul className="absolute left-0 right-0 bg-white border rounded shadow z-10 max-h-40 overflow-y-auto">
              {savedAccounts.map((acc) => (
                <li
                  key={acc.email}
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword(acc.password);
                    setShowDropdown(false);
                  }}
                  className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-sm"
                >
                  {acc.email}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="text-sm font-medium">Mot de passe</label>
          <div className="relative mt-1">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"
              onClick={() => setShow((s) => !s)}
            >
              {show ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button className="btn btn-primary w-full py-2 text-base">
          Se connecter
        </button>
      </form>
<InstallButton />
      {/* Links */}
      <div className="text-center mt-4 text-sm">
        Pas de compte ?{" "}
        <Link to="/signup" className="text-aquaBlue hover:underline">
          Créer un compte
        </Link>
      </div>

      <div className="text-center mt-3">
        <Link
          to="/forgot-password"
          className="text-blue-600 hover:underline text-sm"
        >
          Mot de passe oublié ?
        </Link>
      </div>
    </div>
  </div>
);
}
