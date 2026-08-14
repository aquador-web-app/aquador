import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { supabase } from "../lib/supabaseClient";
import { detectCountryISO } from "../lib/detectCountry";
import PaymentPage from "../components/payments/PaymentPage";

const EVENT_CODE = "cloture-2026-08-29";

function formatMoney(value) {
  return `USD ${Number(value || 0).toFixed(2)}`;
}

function paymentLabel(status) {
  if (status === "paid") return "Payé";
  if (status === "partial") return "Partiellement payé";
  return "Non payé";
}

export default function ClotureVisitorAccess() {
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState("HT");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [dashboard, setDashboard] = useState(null);
  const [participants, setParticipants] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] =
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
      setCountry(detectCountryISO() || "HT");
    } catch {
      setCountry("HT");
    }
  }, []);

  function continueToVerification(event) {
    event.preventDefault();
    setError("");

    if (!phone || !isValidPhoneNumber(phone)) {
      setError("Veuillez entrer un numéro de téléphone valide.");
      return;
    }

    setStep(2);
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
          contentType:
            file.type || undefined,
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
  if (!dashboard?.registration?.id) {
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

  const invoice =
    dashboard.invoice || {};

  const total =
    Number(
      invoice.total ??
        dashboard.registration
          ?.amount_due ??
        0
    );

  const paid =
    Number(
      invoice.paid_total ??
        dashboard.registration
          ?.amount_paid ??
        0
    );

  const balance =
    Math.max(
      0,
      total - paid
    );

  if (amount > balance) {
    setError(
      `Le montant ne peut pas dépasser ${formatMoney(
        balance
      )}.`
    );
    return;
  }

  if (
    paymentMethod === "transfer" &&
    !manualProofUrl
  ) {
    setError(
      "Veuillez joindre une preuve de virement."
    );
    return;
  }

  setManualSubmitting(true);
  setError("");
  setSuccess("");
  setManualMessage("");

  try {
    const {
      data,
      error: paymentError,
    } = await supabase.rpc(
      "submit_event_visitor_payment",
      {
        p_registration_id:
          dashboard.registration.id,

        p_phone:
          phone,

        p_email:
          email.trim(),

        p_amount:
          amount,

        p_method:
          paymentMethod === "cash"
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

    await loadDashboard({
      customerPhone: phone,
      customerEmail: email,
    });
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

  async function verifyIdentity(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Veuillez entrer votre adresse e-mail.");
      return;
    }

    setLoading(true);

    try {
      await loadDashboard({
        customerPhone: phone,
        customerEmail: email,
      });
    } catch (verificationError) {
      console.error(
        "Cloture visitor access error:",
        verificationError
      );

      setDashboard(null);
      setParticipants([]);
      setError(
        verificationError?.message ||
          "Aucune participation ne correspond aux informations fournies."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard({
    customerPhone,
    customerEmail,
  }) {
    const { data, error: rpcError } =
      await supabase.rpc(
        "get_event_visitor_dashboard",
        {
          p_event_code: EVENT_CODE,
          p_phone: customerPhone,
          p_email: customerEmail.trim(),
        }
      );

    if (rpcError) throw rpcError;

    if (!data?.registration?.id) {
      throw new Error(
        "Aucune participation ne correspond aux informations fournies."
      );
    }

    setPhone(customerPhone);
    setEmail(customerEmail.trim());
    setDashboard(data);
    setParticipants(
      Array.isArray(data.participants)
        ? data.participants.map((item) => ({
            id: item.id || null,
            full_name: item.full_name || "",
            phone: item.phone || "",
          }))
        : []
    );

    return data;
  }

  function updateParticipant(index, field, value) {
    setParticipants((current) =>
      current.map((participant, participantIndex) =>
        participantIndex === index
          ? {
              ...participant,
              [field]: value,
            }
          : participant
      )
    );

    setError("");
    setSuccess("");
  }

  function addParticipant() {
    if (participants.length >= 10) {
      setError(
        "Un maximum de 10 participants est autorisé pour une même participation."
      );
      return;
    }

    setParticipants((current) => [
      ...current,
      {
        id: null,
        full_name: "",
        phone: phone,
      },
    ]);

    setError("");
    setSuccess("");
  }

  function removeParticipant(index) {
    if (participants.length <= 1) {
      setError(
        "La participation doit contenir au moins une personne."
      );
      return;
    }

    setParticipants((current) =>
      current.filter(
        (_, participantIndex) =>
          participantIndex !== index
      )
    );

    setError("");
    setSuccess("");
  }

  function validateParticipants() {
    if (!participants.length) {
      return "Ajoutez au moins un participant.";
    }

    for (
      let index = 0;
      index < participants.length;
      index += 1
    ) {
      const participant = participants[index];

      if (!participant.full_name?.trim()) {
        return `Veuillez entrer le nom du participant ${
          index + 1
        }.`;
      }

      if (!participant.phone) {
        return `Veuillez entrer le numéro de téléphone du participant ${
          index + 1
        }.`;
      }

      if (
        !isValidPhoneNumber(participant.phone)
      ) {
        return `Veuillez entrer un numéro de téléphone valide pour le participant ${
          index + 1
        }.`;
      }
    }

    return "";
  }

  async function saveChanges() {
    setError("");
    setSuccess("");

    const validationError =
      validateParticipants();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      const { data, error: rpcError } =
        await supabase.rpc(
          "update_event_visitor_registration",
          {
            p_event_code: EVENT_CODE,
            p_registration_id:
              dashboard.registration.id,
            p_phone: phone,
            p_email: email.trim(),
            p_participants:
              participants.map(
                (participant) => ({
                  id: participant.id || null,
                  full_name:
                    participant.full_name.trim(),
                  phone: participant.phone,
                })
              ),
          }
        );

      if (rpcError) throw rpcError;

      await loadDashboard({
        customerPhone: phone,
        customerEmail: email,
      });

      setSuccess(
        data?.message ||
          "Votre participation a été mise à jour."
      );
    } catch (saveError) {
      console.error(
        "Cloture visitor update error:",
        saveError
      );

      setError(
        saveError?.message ||
          "Impossible de mettre à jour votre participation."
      );
    } finally {
      setSaving(false);
    }
  }

  function resetAccess() {
    setStep(1);
    setPhone("");
    setEmail("");
    setDashboard(null);
    setParticipants([]);
    setError("");
    setSuccess("");
    setShowPayment(false);
    setPaymentMethod(null);
    setManualAmount("");
setManualProofUrl(null);
setManualMessage("");
  }

  if (dashboard) {
    const registration =
      dashboard.registration || {};

    const invoice =
      dashboard.invoice || {};

    const total =
      Number(
        invoice.total ??
          registration.amount_due ??
          participants.length * 10
      );

    const paid =
      Number(
        invoice.paid_total ??
          registration.amount_paid ??
          0
      );

    const balance =
      Math.max(0, total - paid);

    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-gradient-to-r from-blue-800 to-cyan-600 text-white">
          <div className="mx-auto max-w-4xl px-5 py-10 md:px-8">
            <Link
              to="/"
              className="text-sm text-white/80 hover:text-white"
            >
              ← Retour
            </Link>

            <p className="mt-7 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
              A'QUA D'OR
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Gérer ma participation
            </h1>

            <p className="mt-2 text-white/85">
              Cérémonie de clôture • Samedi 29 août 2026 • 9 h 00
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-6 px-5 py-8 md:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-600">
                  Contact principal
                </p>

                <h2 className="mt-2 text-xl font-bold text-slate-900">
                  {registration.full_name ||
                    dashboard.customer_name ||
                    "Participant"}
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  {phone}
                </p>

                <p className="text-sm text-slate-600">
                  {email}
                </p>
              </div>

              <button
                type="button"
                onClick={resetAccess}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Fermer la session
              </button>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <InfoCard
              label="Participants"
              value={String(participants.length)}
            />

            <InfoCard
              label="Total"
              value={formatMoney(total)}
            />

            <InfoCard
              label="Paiement"
              value={paymentLabel(
                invoice.status ||
                  registration.payment_status
              )}
            />
          </section>

          {paid > 0 && balance > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Déjà payé :{" "}
              <strong>{formatMoney(paid)}</strong>
              {" · "}
              Solde restant :{" "}
              <strong>{formatMoney(balance)}</strong>
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              {success}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Participants
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Ajoutez ou modifiez les personnes associées à cette participation.
                </p>
              </div>

              <button
                type="button"
                onClick={addParticipant}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                + Ajouter une personne
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {participants.map(
                (participant, index) => (
                  <div
                    key={
                      participant.id ||
                      `participant-${index}`
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <p className="font-bold text-slate-900">
                        Participant {index + 1}
                      </p>

                      {participants.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            removeParticipant(index)
                          }
                          className="text-sm font-semibold text-red-600 hover:text-red-700"
                        >
                          Retirer
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                          Nom complet *
                        </span>

                        <input
                          type="text"
                          value={
                            participant.full_name
                          }
                          onChange={(event) =>
                            updateParticipant(
                              index,
                              "full_name",
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          required
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                          Téléphone *
                        </span>

                        <PhoneInput
                          international
                          defaultCountry={country}
                          countryCallingCodeEditable={
                            false
                          }
                          value={participant.phone}
                          onChange={(value) =>
                            updateParticipant(
                              index,
                              "phone",
                              value || ""
                            )
                          }
                          className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                        />
                      </label>
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex justify-between text-sm">
                <span>Tarif par personne</span>
                <strong>USD 10.00</strong>
              </div>

              <div className="mt-2 flex justify-between border-t border-blue-200 pt-2">
                <span className="font-semibold">
                  Nouveau total
                </span>

                <strong className="text-lg text-blue-700">
                  {formatMoney(
                    participants.length * 10
                  )}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={saveChanges}
              disabled={saving}
              className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving
                ? "Enregistrement..."
                : "Enregistrer les modifications"}
            </button>
          </section>

          {balance > 0 && invoice.id && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">
                Paiement
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Vous pouvez régler le solde restant de votre participation.
              </p>

              {!showPayment ? (
  <div className="mt-5 space-y-3">
    <div className="grid gap-3 sm:grid-cols-3">
      <button
        type="button"
        onClick={() => {
          setPaymentMethod("card");
          setShowPayment(true);
        }}
        className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
      >
        💳 Carte
      </button>

      <button
        type="button"
        onClick={() => {
  setPaymentMethod("cash");
  setManualAmount("");
  setManualProofUrl(null);
  setManualMessage("");
  setError("");
}}
        className="rounded-xl border border-green-500 px-4 py-3 font-semibold text-green-700 hover:bg-green-50"
      >
        💵 Espèces
      </button>

      <button
        type="button"
        onClick={() => {
  setPaymentMethod("transfer");
  setManualAmount("");
  setManualProofUrl(null);
  setManualMessage("");
  setError("");
}}
        className="rounded-xl border border-purple-500 px-4 py-3 font-semibold text-purple-700 hover:bg-purple-50"
      >
        🏦 Virement
      </button>
    </div>

    {paymentMethod === "cash" && (
  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
    <p className="font-semibold">
      Paiement en espèces
    </p>

    <p className="mt-1">
      Soumettez le montant que vous paierez ou avez payé
      en espèces. Le paiement restera en attente jusqu'à
      sa validation par notre équipe.
    </p>

    <p className="mt-2 text-xs">
      Solde actuel : {formatMoney(balance)}
    </p>

    <label className="mt-4 block">
      <span className="mb-1 block font-semibold">
        Montant (USD)
      </span>

      <input
        type="number"
        min="0.01"
        max={balance}
        step="0.01"
        value={manualAmount}
        onChange={(e) => {
          setManualAmount(
            e.target.value
          );
          setError("");
        }}
        placeholder="Ex. 10.00"
        className="w-full rounded-xl border border-green-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-green-500"
      />
    </label>

    <button
      type="button"
      onClick={
        submitVisitorManualPayment
      }
      disabled={manualSubmitting}
      className="mt-4 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {manualSubmitting
        ? "Soumission..."
        : "Soumettre le paiement"}
    </button>
  </div>
)}

    {paymentMethod === "transfer" && (
  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
    <p className="font-semibold">
      Paiement par virement
    </p>

    <p className="mt-1">
      Entrez le montant du virement et joignez une preuve.
      Le paiement restera en attente jusqu'à sa validation.
    </p>

    <p className="mt-2 text-xs">
      Solde actuel : {formatMoney(balance)}
    </p>

    <label className="mt-4 block">
      <span className="mb-1 block font-semibold">
        Montant du virement (USD)
      </span>

      <input
        type="number"
        min="0.01"
        max={balance}
        step="0.01"
        value={manualAmount}
        onChange={(e) => {
          setManualAmount(
            e.target.value
          );
          setError("");
        }}
        placeholder="Ex. 10.00"
        className="w-full rounded-xl border border-purple-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-purple-500"
      />
    </label>

    <div className="mt-4">
      <label className="block font-semibold">
        Preuve du virement *
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
      onClick={
        submitVisitorManualPayment
      }
      disabled={
        manualSubmitting ||
        manualUploading
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
  </div>
) : (
                <div className="mt-5">
                  <div className="mb-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
  setShowPayment(false);
  setPaymentMethod(null);
}}
                      className="text-sm font-semibold text-blue-600"
                    >
                      Fermer le paiement
                    </button>
                  </div>

                  <PaymentPage
                    invoiceId={invoice.id}
                    user={null}
                    email={email}
                    invoiceType="event_visitor"
                  />
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-blue-800 to-cyan-600 text-white">
        <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
          <Link
            to="/"
            className="text-sm text-white/80 hover:text-white"
          >
            ← Retour
          </Link>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
            A'QUA D'OR
          </p>

          <h1 className="mt-2 text-3xl font-bold md:text-4xl">
            Gérer ma participation
          </h1>

          <p className="mt-3 max-w-2xl text-white/85">
            Retrouvez votre participation à la cérémonie de clôture, ajoutez des participants ou complétez votre paiement.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 py-10 md:px-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
            <p className="text-sm font-semibold text-blue-600">
              Étape {step} sur 2
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {step === 1
                ? "Entrez votre numéro de téléphone"
                : "Confirmez votre adresse e-mail"}
            </h2>
          </div>

          {step === 1 ? (
            <form
              onSubmit={continueToVerification}
              className="space-y-5 p-6"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-800">
                  Numéro de téléphone *
                </span>

                <PhoneInput
                  international
                  defaultCountry={country}
                  countryCallingCodeEditable={
                    false
                  }
                  value={phone}
                  onChange={(value) => {
                    setPhone(value || "");
                    setError("");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                />
              </label>

              {error && (
                <ErrorMessage message={error} />
              )}

              <button className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
                Continuer
              </button>
            </form>
          ) : (
            <form
              onSubmit={verifyIdentity}
              className="space-y-5 p-6"
            >
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Téléphone
                </p>

                <p className="mt-1 font-semibold text-slate-900">
                  {phone}
                </p>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-800">
                  Adresse e-mail *
                </span>

                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(
                      event.target.value
                    );
                    setError("");
                  }}
                  autoComplete="email"
                  placeholder="votre@email.com"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </label>

              {error && (
                <ErrorMessage message={error} />
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                  className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Modifier le téléphone
                </button>

                <button
                  disabled={loading}
                  className="flex-1 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {loading
                    ? "Vérification..."
                    : "Accéder"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-1 font-bold text-slate-900">
        {value}
      </p>
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