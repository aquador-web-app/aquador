// src/components/payments/PaymentPage.jsx

import React, { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { supabase } from "../../lib/supabaseClient";

const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLIC_KEY
);

const TITLES = {
  school: "Paiement — École",
  club_membership: "Paiement — Club",
  club_booking: "Paiement — Réservation Club",
  spa: "Paiement — Spa",
  boutique: "Paiement — Boutique",
};

const DESCRIPTIONS = {
  school: "A'QUA D'OR School Invoice Payment",
  club_membership: "A'QUA D'OR Club Membership Payment",
  club_booking: "A'QUA D'OR Club Booking Payment",
  spa: "A'QUA D'OR Spa Payment",
  boutique: "A'QUA D'OR Boutique Payment",
};

function money(value) {
  return `USD ${Number(value || 0).toFixed(2)}`;
}

function CheckoutForm({
  invoiceId,
  userId,
  email,
  invoiceType,
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quote, setQuote] = useState(null);

  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [paymentCompleted, setPaymentCompleted] =
    useState(false);

  // ========================================================
  // LOAD EXACT CARD FEE / TOTAL BEFORE PAYMENT
  // ========================================================

  useEffect(() => {
    let cancelled = false;

    async function loadQuote() {
      if (!invoiceId) return;

      setQuoteLoading(true);
      setErrorMsg(null);

      try {
        const {
          data,
          error: functionError,
        } = await supabase.functions.invoke(
          "create-payment-intent",
          {
            body: {
              invoice_id: invoiceId,
              invoice_type: invoiceType,
              user_id: userId || null,
              email: email || null,
              description:
                DESCRIPTIONS[invoiceType] ||
                "A'QUA D'OR Payment",

              // IMPORTANT:
              // This does NOT create a Stripe PaymentIntent.
              quote_only: true,
            },
          }
        );

        if (functionError) {
          throw new Error(
            functionError.message ||
              "Impossible de calculer les frais."
          );
        }

        if (
          data?.invoice_amount == null ||
          data?.processing_fee == null ||
          data?.charge_amount == null
        ) {
          throw new Error(
            data?.error ||
              "Le montant du paiement est indisponible."
          );
        }

        if (!cancelled) {
          setQuote(data);
        }
      } catch (err) {
        console.error(
          "Card payment quote error:",
          err
        );

        if (!cancelled) {
          setErrorMsg(
            err.message ||
              "Impossible de calculer les frais de paiement."
          );
        }
      } finally {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      }
    }

    loadQuote();

    return () => {
      cancelled = true;
    };
  }, [
    invoiceId,
    invoiceType,
    userId,
    email,
  ]);

  // ========================================================
  // PAYMENT
  // ========================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!stripe || !elements) {
      return;
    }

    if (!quote) {
      setErrorMsg(
        "Le total du paiement n'est pas encore disponible."
      );
      return;
    }

    if (paymentCompleted) {
      return;
    }

    setLoading(true);

    try {
      // -----------------------------------------------------
      // 1. Create / reuse PaymentIntent
      // -----------------------------------------------------

      const {
        data,
        error: functionError,
      } = await supabase.functions.invoke(
        "create-payment-intent",
        {
          body: {
            invoice_id: invoiceId,
            invoice_type: invoiceType,
            user_id: userId || null,
            email: email || null,
            description:
              DESCRIPTIONS[invoiceType] ||
              "A'QUA D'OR Payment",
          },
        }
      );

      if (functionError) {
        console.error(
          "create-payment-intent function error:",
          functionError
        );

        throw new Error(
          functionError.message ||
            "Failed to create payment intent"
        );
      }

      if (!data?.client_secret) {
        throw new Error(
          data?.error ||
            "Stripe did not return a client secret."
        );
      }

      // -----------------------------------------------------
      // SAFETY CHECK
      // Ensure server payment total still matches quote shown
      // to the customer.
      // -----------------------------------------------------

      if (
        Number(data.charge_amount_cents) !==
        Number(quote.charge_amount_cents)
      ) {
        setQuote({
          ...quote,
          invoice_amount:
            data.invoice_amount,
          invoice_amount_cents:
            data.invoice_amount_cents,
          processing_fee:
            data.processing_fee,
          processing_fee_cents:
            data.processing_fee_cents,
          charge_amount:
            data.charge_amount,
          charge_amount_cents:
            data.charge_amount_cents,
        });

        throw new Error(
          "Le montant de la facture a changé. Le nouveau total a été affiché. Veuillez vérifier avant de continuer."
        );
      }

      // -----------------------------------------------------
      // 2. Confirm card
      // -----------------------------------------------------

      const cardElement =
        elements.getElement(CardElement);

      if (!cardElement) {
        throw new Error(
          "Card form is unavailable."
        );
      }

      const {
        error: stripeError,
        paymentIntent,
      } =
        await stripe.confirmCardPayment(
          data.client_secret,
          {
            payment_method: {
              card: cardElement,

              billing_details: {
                email:
                  email ||
                  undefined,
              },
            },
          }
        );

      if (stripeError) {
        throw stripeError;
      }

      if (
        paymentIntent?.status !==
        "succeeded"
      ) {
        throw new Error(
          `Unexpected payment status: ${paymentIntent?.status}`
        );
      }

      // -----------------------------------------------------
      // 3. Frontend confirmation only.
      // Webhook updates the database.
      // -----------------------------------------------------

      console.log(
        "Payment confirmed:",
        paymentIntent.id
      );

      setPaymentCompleted(true);

      setSuccessMsg(
        "Votre paiement a été effectué avec succès !"
      );
    } catch (err) {
      console.error(
        "Payment error:",
        err
      );

      setErrorMsg(
        err.message ||
          "Une erreur est survenue."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <h3 className="text-lg font-semibold">
        {TITLES[invoiceType] ||
          "Paiement"}
      </h3>

      {/* ============================================= */}
      {/* CARD CHARGE DISCLOSURE                        */}
      {/* ============================================= */}

      {quoteLoading ? (
        <div className="rounded-lg border bg-gray-50 p-3">
          <p className="text-sm text-gray-500 text-center">
            Calcul des frais de paiement...
          </p>
        </div>
      ) : quote ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">
              Montant de la facture
            </span>

            <strong>
              {money(
                quote.invoice_amount
              )}
            </strong>
          </div>

          <div className="mt-2 flex justify-between text-sm">
            <span className="text-gray-700">
              Frais de traitement par carte
            </span>

            <strong>
              {money(
                quote.processing_fee
              )}
            </strong>
          </div>

          <div className="mt-3 flex justify-between border-t border-blue-200 pt-3">
            <span className="font-bold text-gray-900">
              Total débité sur la carte
            </span>

            <strong className="text-lg text-gray-900">
              {money(
                quote.charge_amount
              )}
            </strong>
          </div>

          <p className="mt-2 text-xs text-gray-600">
            Les frais de traitement par carte
            sont ajoutés au montant de la
            facture.
          </p>
        </div>
      ) : null}

      {/* ============================================= */}
      {/* CARD FIELD                                    */}
      {/* ============================================= */}

      <div className="rounded-lg border p-3">
        <CardElement
          options={{
            hidePostalCode: true,

            style: {
              base: {
                fontSize: "16px",
                color: "#32325d",

                "::placeholder": {
                  color: "#a0aec0",
                },
              },

              invalid: {
                color: "#e53e3e",
              },
            },
          }}
        />
      </div>

      {errorMsg && (
        <p className="text-red-600 text-sm text-center">
          {errorMsg}
        </p>
      )}

      {successMsg && (
        <p className="text-green-600 text-sm text-center">
          {successMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={
          !stripe ||
          loading ||
          quoteLoading ||
          !quote ||
          paymentCompleted
        }
        className={`w-full py-2 rounded-lg font-semibold transition ${
          loading ||
          quoteLoading ||
          !quote ||
          paymentCompleted
            ? "bg-gray-400 cursor-not-allowed text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {paymentCompleted
          ? "Paiement effectué ✓"
          : loading
          ? "Traitement..."
          : quoteLoading
          ? "Calcul du total..."
          : `Payer ${money(
              quote?.charge_amount
            )} 💳`}
      </button>
    </form>
  );
}

export default function PaymentPage({
  invoiceId,
  user,
  invoiceType = "school",
}) {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm
        invoiceId={invoiceId}
        userId={user?.id}
        email={user?.email}
        invoiceType={invoiceType}
      />
    </Elements>
  );
}