import { loadStripe } from "@stripe/stripe-js";

// Initialize Stripe once (replace with your public key)
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

/**
 * Create and start a payment for school or club.
 *
 * @param {Object} params
 * @param {string} params.invoiceId - Invoice UUID
 * @param {string} params.userId - User UUID
 * @param {string} params.email - User email
 * @param {string} params.origin - "school" or "club"
 * @param {string} [params.description] - Optional description
 */
export async function startPayment({ invoiceId, userId, email, origin, description }) {
  try {
    const stripe = await stripePromise;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/create-payment-intent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          user_id: userId,
          email,
          description: description || (origin === "club"
            ? "A'QUA D'OR Club Booking"
            : "A'QUA D'OR School Payment"),
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to create payment");

    console.log("✅ PaymentIntent:", data);

    // Redirect to Stripe’s secure payment page
    const { error } = await stripe.redirectToCheckout({
      clientReferenceId: invoiceId,
      sessionId: data.payment_intent_id, // if using Checkout Sessions
    });

    if (error) throw error;
  } catch (err) {
    console.error("❌ Error starting payment:", err);
    alert("Payment initialization failed. Please try again.");
  }
}
