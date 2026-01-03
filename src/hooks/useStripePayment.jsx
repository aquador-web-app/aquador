// src/hooks/useStripePayment.js
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  useStripe,
  useElements,
  CardElement,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

/**
 * useStripePayment
 * Hook to handle payment creation + card confirmation from any React component.
 */
export function useStripePayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  /**
   * Starts a Stripe payment flow for the given invoice.
   * 
   * @param {object} opts
   * @param {string} opts.invoiceId - Invoice UUID
   * @param {string} opts.userId - User UUID
   * @param {string} opts.email - User email
   * @param {string} opts.origin - "school" | "club"
   * @param {function} opts.onSuccess - Callback when payment succeeds
   */
  const startPayment = async ({ invoiceId, userId, email, origin, onSuccess }) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // 1️⃣ Call backend to create PaymentIntent
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/create-payment-intent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice_id: invoiceId,
            user_id: userId,
            email,
            description:
              origin === "club"
                ? "A'QUA D'OR Club Booking Payment"
                : "A'QUA D'OR School Invoice Payment",
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create payment intent");

      // Return the client_secret for Stripe Elements
      return data.client_secret;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      console.error("❌ Error creating payment intent:", err);
      return null;
    }
  };

  return { startPayment, loading, error, success, setSuccess };
}

/**
 * Internal reusable Stripe Card Form component.
 * Use this if you want to embed card UI directly.
 */
export function StripeCardForm({ clientSecret, email, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);

    const card = elements.getElement(CardElement);
    const { error: stripeError, paymentIntent } =
      await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card,
          billing_details: { email },
        },
      });

    if (stripeError) {
      setError(stripeError.message);
      setProcessing(false);
      return;
    }

    console.log("✅ Payment succeeded:", paymentIntent.id);
    setProcessing(false);
    if (onSuccess) onSuccess(paymentIntent);
  };

  return (
    <form onSubmit={handleConfirm} className="space-y-3 bg-white p-4 rounded-xl shadow">
      <CardElement
        options={{
          hidePostalCode: true,
          style: {
            base: { fontSize: "16px", color: "#32325d" },
            invalid: { color: "#e53e3e" },
          },
        }}
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || processing}
        className={`w-full py-2 rounded-lg font-semibold transition ${
          processing
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {processing ? "Traitement..." : "Confirmer le paiement"}
      </button>
    </form>
  );
}

/**
 * Wraps Stripe Elements Provider for convenience.
 */
export function StripeElementsWrapper({ children }) {
  return <Elements stripe={stripePromise}>{children}</Elements>;
}
