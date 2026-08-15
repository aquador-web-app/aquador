import {
  useEffect,
  useState,
} from "react";

import PhoneInput, {
  isValidPhoneNumber,
} from "react-phone-number-input";

import { supabase } from "../lib/supabaseClient";
import { detectCountryISO } from "../lib/detectCountry";
import PaymentPage from "../components/payments/PaymentPage";

const PACKAGES = [
  {
    ticketCount: 1,
    amount: 8,
    label: "1 billet",
  },
  {
    ticketCount: 3,
    amount: 16,
    label: "3 billets",
  },
  {
    ticketCount: 5,
    amount: 32,
    label: "5 billets",
  },
  {
    ticketCount: 10,
    amount: 60,
    label: "10 billets",
  },
];

export default function ClotureTombolaPayment() {
  const [country, setCountry] =
    useState("HT");

  const [fullName, setFullName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [
    selectedTicketCount,
    setSelectedTicketCount,
  ] = useState(1);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [payment, setPayment] =
    useState(null);

  useEffect(() => {
    try {
      setCountry(
        detectCountryISO() || "HT"
      );
    } catch {
      setCountry("HT");
    }
  }, []);

  const selectedPackage =
    PACKAGES.find(
      (item) =>
        item.ticketCount ===
        selectedTicketCount
    ) || PACKAGES[0];

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

    if (!email.trim()) {
      return "Veuillez entrer votre adresse e-mail.";
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email.trim()
      )
    ) {
      return "Veuillez entrer une adresse e-mail valide.";
    }

    if (
      ![1, 3, 5, 10].includes(
        selectedTicketCount
      )
    ) {
      return "Veuillez sélectionner un forfait valide.";
    }

    return "";
  }

  async function handleContinueToPayment(
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

    try {
      setSubmitting(true);

      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        "create_cloture_tombola_payment",
        {
          p_full_name:
            fullName.trim(),

          p_phone:
            phone,

          p_email:
            email
              .trim()
              .toLowerCase(),

          p_ticket_count:
            selectedTicketCount,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      if (
        !data?.payment_id
      ) {
        throw new Error(
          "Le paiement n'a pas pu être initialisé."
        );
      }

      setPayment({
        paymentId:
          data.payment_id,

        ticketCount:
          Number(
            data.ticket_count ||
              selectedTicketCount
          ),

        amount:
          Number(
            data.amount ||
              selectedPackage.amount
          ),

        currency:
          data.currency || "USD",
      });
    } catch (err) {
      console.error(
        "Tombola payment initialization error:",
        err
      );

      setError(
        err?.message ||
          "Impossible d'initialiser le paiement."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto w-full max-w-xl">

        {/* LOGO */}
        <div className="mb-6 text-center">
          <img
            src="/logo/aquador.png"
            alt="A'QUA D'OR"
            className="mx-auto h-20 w-20 object-contain"
          />

          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
            A'QUA D'OR
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-xl">

          {/* HEADER */}
          <div className="bg-gradient-to-r from-blue-700 to-cyan-500 px-6 py-6 text-center text-white">
            <div className="text-4xl">
              🎟️
            </div>

            <h1 className="mt-2 text-2xl font-bold">
              Tombola
            </h1>

            <p className="mt-1 text-sm text-white/90">
              Cérémonie de clôture
            </p>

            <p className="mt-1 text-sm font-semibold text-white">
              Samedi 29 août 2026
            </p>
          </div>

          {!payment ? (
            <form
              onSubmit={
                handleContinueToPayment
              }
              className="space-y-6 p-5 sm:p-6"
            >

              {/* INTRO */}
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
                Sélectionnez le nombre de billets
                désiré et effectuez votre paiement
                directement par carte.
              </div>

              {/* PACKAGES */}
              <section>
                <h2 className="font-bold text-gray-900">
                  Choisissez votre forfait
                </h2>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {PACKAGES.map(
                    (item) => {
                      const selected =
                        selectedTicketCount ===
                        item.ticketCount;

                      return (
                        <button
                          key={
                            item.ticketCount
                          }
                          type="button"
                          onClick={() => {
                            setSelectedTicketCount(
                              item.ticketCount
                            );

                            setError("");
                          }}
                          className={`rounded-xl border p-4 text-left transition ${
                            selected
                              ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                              : "border-gray-200 bg-white hover:border-blue-300"
                          }`}
                        >
                          <p className="font-bold text-gray-900">
                            {item.label}
                          </p>

                          <p className="mt-1 text-lg font-bold text-blue-700">
                            USD{" "}
                            {item.amount.toFixed(
                              2
                            )}
                          </p>
                        </button>
                      );
                    }
                  )}
                </div>
              </section>

              {/* CONTACT */}
              <section className="border-t pt-5">
                <h2 className="font-bold text-gray-900">
                  Vos informations
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Ces informations permettront
                  d'identifier votre paiement.
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
                      autoComplete="name"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">
                      Téléphone *
                    </span>

                    <PhoneInput
                      international
                      defaultCountry={
                        country
                      }
                      countryCallingCodeEditable={
                        false
                      }
                      value={phone}
                      onChange={(
                        value
                      ) => {
                        setPhone(
                          value || ""
                        );
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
                      value={email}
                      onChange={(e) => {
                        setEmail(
                          e.target.value
                        );
                        setError("");
                      }}
                      className="input w-full"
                      placeholder="votre@email.com"
                      autoComplete="email"
                      required
                    />

                    <p className="mt-1 text-xs text-gray-500">
                      Stripe pourra également utiliser
                      cette adresse pour votre reçu de
                      paiement.
                    </p>
                  </label>
                </div>
              </section>

              {/* SUMMARY */}
              <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    Forfait
                  </span>

                  <strong>
                    {
                      selectedPackage.label
                    }
                  </strong>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                  <span className="font-bold text-gray-900">
                    Montant
                  </span>

                  <strong className="text-xl text-blue-700">
                    USD{" "}
                    {selectedPackage.amount.toFixed(
                      2
                    )}
                  </strong>
                </div>

                <p className="mt-3 text-xs text-gray-500">
                  Les frais de traitement par carte
                  seront calculés et affichés avant
                  la confirmation finale du paiement.
                </p>

                <p className="mt-2 text-xs font-semibold text-red-600">
                  ⚠️ Les frais de Tombola sont non
                  remboursables.
                </p>
              </section>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  submitting
                }
                className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {submitting
                  ? "Préparation du paiement..."
                  : `Continuer — USD ${selectedPackage.amount.toFixed(
                      2
                    )}`}
              </button>

              <p className="text-center text-xs text-gray-400">
                Paiement sécurisé par Stripe
              </p>
            </form>
          ) : (
            <div className="p-5 sm:p-6">

              {/* ORDER SUMMARY */}
              <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-800">
                    Tombola
                  </span>

                  <strong className="text-blue-900">
                    {payment.ticketCount}{" "}
                    billet
                    {payment.ticketCount >
                    1
                      ? "s"
                      : ""}
                  </strong>
                </div>

                <div className="mt-2 flex justify-between border-t border-blue-200 pt-2">
                  <span className="font-semibold text-blue-900">
                    Montant
                  </span>

                  <strong className="text-lg text-blue-700">
                    USD{" "}
                    {payment.amount.toFixed(
                      2
                    )}
                  </strong>
                </div>

                <p className="mt-2 text-xs font-semibold text-red-600">
                  ⚠️ Les frais de Tombola sont non
                  remboursables.
                </p>
              </div>

              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  Paiement par carte
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Vérifiez le montant total, incluant
                  les frais de traitement, puis
                  complétez votre paiement.
                </p>
              </div>

              <PaymentPage
                invoiceId={
                  payment.paymentId
                }
                user={null}
                email={
                  email
                    .trim()
                    .toLowerCase()
                }
                invoiceType="cloture_tombola"
              />
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-gray-400">
          © 2026 A'QUA D'OR
        </p>
      </div>
    </div>
  );
}