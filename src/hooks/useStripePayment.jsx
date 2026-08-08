// src/hooks/useStripePayment.jsx

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  useStripe,
  useElements,
  CardElement,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLIC_KEY
);

const PAYMENT_DESCRIPTIONS = {
  school: "A'QUA D'OR School Invoice Payment",
  club_membership: "A'QUA D'OR Club Membership Payment",
  club_booking: "A'QUA D'OR Club Booking Payment",
  spa: "A'QUA D'OR Spa Payment",
  boutique: "A'QUA D'OR Boutique Payment",
};

export function useStripePayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const startPayment = async ({
    invoiceId,
    userId,
    email,
    invoiceType = "school",
  }) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/create-payment-intent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            invoice_id: invoiceId,
            invoice_type: invoiceType,
            user_id: userId || null,
            email: email || null,
            description:
              PAYMENT_DESCRIPTIONS[invoiceType] ||
              "A'QUA D'OR Payment",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to create payment intent"
        );
      }

      setLoading(false);

      return {
        clientSecret: data.client_secret,
        paymentIntentId: data.payment_intent_id,
        amount: data.amount,
        invoiceType: data.invoice_type,
      };
    } catch (err) {
      console.error(
        "Error creating PaymentIntent:",
        err
      );

      setError(err.message);
      setLoading(false);

      return null;
    }
  };

  return {
    startPayment,
    loading,
    error,
    success,
    setSuccess,
  };
}

export function StripeCardForm({
  clientSecret,
  email,
  onSuccess,
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [processing, setProcessing] =
    useState(false);

  const [error, setError] =
    useState(null);

  const handleConfirm = async (e) => {
    e.preventDefault();

    if (
      !stripe ||
      !elements ||
      !clientSecret
    ) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const card =
        elements.getElement(CardElement);

      if (!card) {
        throw new Error(
          "Card form is not available."
        );
      }

      const {
        error: stripeError,
        paymentIntent,
      } =
        await stripe.confirmCardPayment(
          clientSecret,
          {
            payment_method: {
              card,
              billing_details: {
                email:
                  email || undefined,
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

      console.log(
        "Payment confirmed by Stripe:",
        paymentIntent.id
      );

      setProcessing(false);

      if (onSuccess) {
        onSuccess(paymentIntent);
      }
    } catch (err) {
      console.error(
        "Stripe confirmation error:",
        err
      );

      setError(
        err.message ||
          "Payment could not be completed."
      );

      setProcessing(false);
    }
  };

  return (
    <form
      onSubmit={handleConfirm}
      className="space-y-4"
    >
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

      {error && (
        <p className="text-red-600 text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={
          !stripe ||
          processing ||
          !clientSecret
        }
        className={`w-full py-2 rounded-lg font-semibold transition ${
          processing
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {processing
          ? "Traitement..."
          : "Confirmer le paiement"}
      </button>
    </form>
  );
}

export function StripeElementsWrapper({
  children,
}) {
  return (
    <Elements stripe={stripePromise}>
      {children}
    </Elements>
  );
}