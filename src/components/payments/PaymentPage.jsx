// src/components/payments/PaymentPage.jsx

import React, { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
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
  clientSecret,
  quote,
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [paymentCompleted, setPaymentCompleted] =
    useState(false);


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
      // 2. Confirm card
      // -----------------------------------------------------

      const {
  error: stripeError,
  paymentIntent,
} = await stripe.confirmPayment({
  elements,

  confirmParams: {
    payment_method_data: {
      billing_details: {
        email: email || undefined,
      },
    },

    return_url:
      `${window.location.origin}/payment-success`,
  },

  redirect: "if_required",
});

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

      {quote && (
  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
    <div className="flex justify-between text-sm">
      <span className="text-gray-700">
        Montant de la facture
      </span>

      <strong>
        {money(quote.invoice_amount)}
      </strong>
    </div>

    <div className="mt-2 flex justify-between text-sm">
      <span className="text-gray-700">
        Frais de traitement par carte
      </span>

      <strong>
        {money(quote.processing_fee)}
      </strong>
    </div>

    <div className="mt-3 flex justify-between border-t border-blue-200 pt-3">
      <span className="font-bold text-gray-900">
        Total débité sur la carte
      </span>

      <strong className="text-lg text-gray-900">
        {money(quote.charge_amount)}
      </strong>
    </div>

    <p className="mt-2 text-xs text-gray-600">
      Les frais de traitement par carte
      sont ajoutés au montant de la facture.
    </p>
  </div>
)}

      {/* ============================================= */}
      {/* CARD FIELD                                    */}
      {/* ============================================= */}

      <div className="rounded-xl border border-gray-200 p-3 bg-white">
  <PaymentElement
    options={{
      layout: "tabs",
    }}
  />
  <p className="mt-3 text-xs text-center text-gray-500">
  🔒 Paiement sécurisé traité par Stripe
</p>
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

          !quote ||
          paymentCompleted
        }
        className={`w-full py-2 rounded-lg font-semibold transition ${
          loading ||
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
  const [quote, setQuote] =
    useState(null);

  const [clientSecret, setClientSecret] =
    useState(null);

  const [loadingPayment, setLoadingPayment] =
    useState(true);

  const [loadError, setLoadError] =
    useState(null);

  useEffect(() => {
    let cancelled = false;

    async function initializePayment() {
      if (!invoiceId) return;

      setLoadingPayment(true);
      setLoadError(null);

      try {
        // -----------------------------------------
        // 1. Get quote
        // -----------------------------------------

        const {
          data: quoteData,
          error: quoteError,
        } = await supabase.functions.invoke(
          "create-payment-intent",
          {
            body: {
              invoice_id: invoiceId,
              invoice_type: invoiceType,
              user_id: user?.id || null,
              email: user?.email || null,
              description:
                DESCRIPTIONS[invoiceType] ||
                "A'QUA D'OR Payment",

              quote_only: true,
            },
          }
        );

        if (quoteError) {
          throw new Error(
            quoteError.message ||
              "Impossible de calculer les frais."
          );
        }

        if (
          quoteData?.charge_amount_cents == null
        ) {
          throw new Error(
            quoteData?.error ||
              "Le montant du paiement est indisponible."
          );
        }

        // -----------------------------------------
        // 2. Create/reuse real PaymentIntent
        // -----------------------------------------

        const {
          data: intentData,
          error: intentError,
        } = await supabase.functions.invoke(
          "create-payment-intent",
          {
            body: {
              invoice_id: invoiceId,
              invoice_type: invoiceType,
              user_id: user?.id || null,
              email: user?.email || null,
              description:
                DESCRIPTIONS[invoiceType] ||
                "A'QUA D'OR Payment",
            },
          }
        );

        if (intentError) {
          throw new Error(
            intentError.message ||
              "Impossible de préparer le paiement."
          );
        }

        if (!intentData?.client_secret) {
          throw new Error(
            intentData?.error ||
              "Stripe n'a pas retourné de client secret."
          );
        }

        // -----------------------------------------
        // 3. Make sure quote = actual Stripe intent
        // -----------------------------------------

        if (
          Number(
            quoteData.charge_amount_cents
          ) !==
          Number(
            intentData.charge_amount_cents
          )
        ) {
          throw new Error(
            "Le montant de la facture a changé. Veuillez rouvrir le paiement."
          );
        }

        if (!cancelled) {
          setQuote(quoteData);
          setClientSecret(
            intentData.client_secret
          );
        }
      } catch (err) {
        console.error(
          "Stripe initialization error:",
          err
        );

        if (!cancelled) {
          setLoadError(
            err.message ||
              "Impossible de préparer le paiement."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingPayment(false);
        }
      }
    }

    initializePayment();

    return () => {
      cancelled = true;
    };
  }, [
    invoiceId,
    invoiceType,
    user?.id,
    user?.email,
  ]);

  if (loadingPayment) {
    return (
      <div className="py-6 text-center text-sm text-gray-500">
        Préparation du paiement sécurisé...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-4 text-center text-sm text-red-600">
        {loadError}
      </div>
    );
  }

  if (!clientSecret || !quote) {
    return null;
  }

  const options = {
    clientSecret,

    appearance: {
      theme: "stripe",

      variables: {
        borderRadius: "8px",
      },
    },
  };

  return (
    <Elements
      stripe={stripePromise}
      options={options}
    >
      <CheckoutForm
        invoiceId={invoiceId}
        userId={user?.id}
        email={user?.email}
        invoiceType={invoiceType}
        clientSecret={clientSecret}
        quote={quote}
      />
    </Elements>
  );
}