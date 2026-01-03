// src/components/payments/PaymentPage.jsx
import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// ✅ Load Stripe with your publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// ==========================
// Inner checkout form
// ==========================
function CheckoutForm({ invoiceId, userId, email, origin }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!stripe || !elements) return;

    setLoading(true);

    try {
      // 1️⃣ Create PaymentIntent from Supabase Edge Function
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

      // 2️⃣ Confirm payment in Stripe
      const cardElement = elements.getElement(CardElement);
      const { error: stripeError, paymentIntent } =
        await stripe.confirmCardPayment(data.client_secret, {
          payment_method: {
            card: cardElement,
            billing_details: { email },
          },
        });

      if (stripeError) throw new Error(stripeError.message);

      // 3️⃣ Payment succeeded
      console.log("✅ Payment succeeded:", paymentIntent.id);
      setSuccessMsg("Votre paiement a été effectué avec succès !");
      setLoading(false);

      // Optional: reload invoice status in UI here
    } catch (err) {
      console.error("❌ Payment error:", err);
      setErrorMsg(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4 bg-white shadow p-6 rounded-2xl">
      <h2 className="text-lg font-semibold text-center text-gray-800">
        {origin === "club" ? "Paiement — Club Booking" : "Paiement — École"}
      </h2>

      <CardElement
        options={{
          hidePostalCode: true,
          style: {
            base: {
              fontSize: "16px",
              color: "#32325d",
              "::placeholder": { color: "#a0aec0" },
            },
            invalid: { color: "#e53e3e" },
          },
        }}
      />

      {errorMsg && <p className="text-red-600 text-sm text-center">{errorMsg}</p>}
      {successMsg && <p className="text-green-600 text-sm text-center">{successMsg}</p>}

      <button
        type="submit"
        disabled={!stripe || loading}
        className={`w-full py-2 rounded-lg font-semibold transition ${
          loading
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {loading ? "Traitement..." : "Payer maintenant 💳"}
      </button>
    </form>
  );
}

// ==========================
// Main exported component
// ==========================
export default function PaymentPage({ invoiceId, user, origin }) {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm
        invoiceId={invoiceId}
        userId={user.id}
        email={user.email}
        origin={origin}
      />
    </Elements>
  );
}
