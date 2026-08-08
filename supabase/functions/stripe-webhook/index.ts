// supabase/functions/stripe-webhook/index.ts
// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// ENVIRONMENT
// ============================================================

const supabaseUrl =
  Deno.env.get("PROJECT_URL") ||
  Deno.env.get("SUPABASE_URL");

const supabaseServiceKey =
  Deno.env.get("FUNCTION_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const stripeSecret =
  Deno.env.get("STRIPE_SECRET_KEY");

const webhookSecret =
  Deno.env.get("STRIPE_WEBHOOK_SECRET");

const ALERT_EMAIL =
  "deadrien@clubaquador.com";

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL / PROJECT_URL");
}

if (!supabaseServiceKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

if (!stripeSecret) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

if (!webhookSecret) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET");
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2025-06-30.basil",
});

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

// ============================================================
// RESPONSE HELPER
// ============================================================

function jsonResponse(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

// ============================================================
// ADMIN ALERT — BEST EFFORT ONLY
// ============================================================

async function queueSystemEmail(
  subject: string,
  body: string
) {
  try {
    const { error } =
      await supabase
        .from("email_queue")
        .insert({
          to: ALERT_EMAIL,
          subject,
          body: `<pre>${body}</pre>`,
          status: "pending",
          kind: "system",
          created_at:
            new Date().toISOString(),
        });

    if (error) {
      console.error(
        "Unable to queue system email:",
        error
      );
    }
  } catch (err) {
    console.error(
      "Unable to queue system email:",
      err
    );
  }
}

// ============================================================
// DUPLICATE PAYMENT PROTECTION
// ============================================================

async function paymentAlreadyExists(
  tableName: string,
  stripeColumn: string,
  paymentIntentId: string
) {
  const { data, error } =
    await supabase
      .from(tableName)
      .select("id")
      .eq(
        stripeColumn,
        paymentIntentId
      )
      .maybeSingle();

  if (error) {
    console.error(
      `Duplicate check failed for ${tableName}:`,
      error
    );

    throw error;
  }

  return Boolean(data);
}

// ============================================================
// SAFE PAYMENT INSERT
// ============================================================

async function insertPaymentOnce({
  tableName,
  stripeColumn,
  paymentIntentId,
  payload,
}: {
  tableName: string;
  stripeColumn: string;
  paymentIntentId: string;
  payload: Record<string, unknown>;
}) {
  const exists =
    await paymentAlreadyExists(
      tableName,
      stripeColumn,
      paymentIntentId
    );

  if (exists) {
    console.log(
      `Duplicate Stripe payment ignored: ${paymentIntentId} already exists in ${tableName}`
    );

    return {
      duplicate: true,
    };
  }

  const { error } =
    await supabase
      .from(tableName)
      .insert(payload);

  if (error) {
    // PostgreSQL unique violation.
    // This protects against simultaneous/retried webhook delivery.
    if (error.code === "23505") {
      console.log(
        `Duplicate Stripe payment blocked by DB index: ${paymentIntentId}`
      );

      return {
        duplicate: true,
      };
    }

    throw error;
  }

  return {
    duplicate: false,
  };
}

// ============================================================
// PAYMENT AMOUNT HELPERS
// ============================================================

function getStripePaymentAmounts(
  intent: Stripe.PaymentIntent
) {
  const metadata =
    intent.metadata || {};

  const chargedCents =
    Number(
      metadata.stripe_charge_cents ||
      intent.amount_received ||
      0
    );

  const invoiceAmountCents =
    Number(
      metadata.invoice_amount_cents ||
      intent.amount_received ||
      0
    );

  const processingFeeCents =
    Number(
      metadata.processing_fee_cents ||
      Math.max(
        0,
        chargedCents -
          invoiceAmountCents
      )
    );

  return {
    // What gets credited against the invoice
    invoiceAmount:
      invoiceAmountCents / 100,

    invoiceAmountCents,

    // Extra amount paid by customer for card processing
    processingFee:
      processingFeeCents / 100,

    processingFeeCents,

    // Actual total Stripe charged
    chargedAmount:
      chargedCents / 100,

    chargedCents,
  };
}

// ============================================================
// SCHOOL PAYMENT
// invoices → payments
// ============================================================

async function handleSchoolPayment(
  intent: Stripe.PaymentIntent,
  invoiceId: string
) {
  const {
    data: invoice,
    error: invoiceError,
  } =
    await supabase
      .from("invoices")
      .select(`
        id,
        user_id,
        full_name,
        total,
        paid_total,
        status
      `)
      .eq("id", invoiceId)
      .maybeSingle();

  if (invoiceError) {
    throw invoiceError;
  }

  if (!invoice) {
    throw new Error(
      `School invoice not found: ${invoiceId}`
    );
  }

  const {
  invoiceAmount: amount,
  processingFee,
  chargedAmount,
} = getStripePaymentAmounts(
  intent
);

  if (amount <= 0) {
    throw new Error(
      `Invalid school payment amount for ${intent.id}`
    );
  }

  const now =
    new Date().toISOString();

  const result =
    await insertPaymentOnce({
      tableName: "payments",
      stripeColumn:
        "stripe_payment_intent",
      paymentIntentId:
        intent.id,

      payload: {
        invoice_id:
          invoice.id,

        amount,

        method: "card",

        reversed: false,

        notes:
  `Stripe payment — ${intent.id} | Invoice: $${amount.toFixed(
    2
  )} | Card fee: $${processingFee.toFixed(
    2
  )} | Charged: $${chargedAmount.toFixed(
    2
  )}`,

        paid_at: now,

        currency:
          intent.currency ||
          "usd",

        status:
          "succeeded",

        stripe_payment_intent:
          intent.id,

        full_name:
          invoice.full_name ||
          null,

        approved: true,

        approved_at: now,

        role: "stripe",
      },
    });

  console.log(
    `School payment processed`,
    {
      invoice_id:
        invoice.id,
      payment_intent:
        intent.id,
      amount,
      duplicate:
        result.duplicate,
    }
  );

  return result;
}

// ============================================================
// CLUB MEMBERSHIP
// club_invoices → club_membership_payments
// ============================================================

async function handleClubMembershipPayment(
  intent: Stripe.PaymentIntent,
  invoiceId: string
) {
  const {
    data: invoice,
    error: invoiceError,
  } =
    await supabase
      .from("club_invoices")
      .select(`
        id,
        customer_id,
        membership_id,
        invoice_no,
        total,
        paid_total,
        status
      `)
      .eq("id", invoiceId)
      .maybeSingle();

  if (invoiceError) {
    throw invoiceError;
  }

  if (!invoice) {
    throw new Error(
      `Club membership invoice not found: ${invoiceId}`
    );
  }

  const {
  invoiceAmount: amount,
  processingFee,
  chargedAmount,
} = getStripePaymentAmounts(
  intent
);

  if (amount <= 0) {
    throw new Error(
      `Invalid club membership payment amount for ${intent.id}`
    );
  }

  const now =
    new Date().toISOString();

  const result =
    await insertPaymentOnce({
      tableName:
        "club_membership_payments",

      stripeColumn:
        "stripe_payment_intent_id",

      paymentIntentId:
        intent.id,

      payload: {
        invoice_id:
          invoice.id,

        amount,

        method: "card",

        notes:
  `Stripe payment — ${intent.id} | Invoice: $${amount.toFixed(
    2
  )} | Card fee: $${processingFee.toFixed(
    2
  )} | Charged: $${chargedAmount.toFixed(
    2
  )}`,

        paid_at: now,

        approved: true,

        role: "stripe",

        stripe_payment_intent_id:
          intent.id,
      },
    });

  console.log(
    `Club membership payment processed`,
    {
      invoice_id:
        invoice.id,
      payment_intent:
        intent.id,
      amount,
      duplicate:
        result.duplicate,
    }
  );

  return result;
}

// ============================================================
// CLUB BOOKING / VENUE
// club_booking_invoices → club_payments
// ============================================================

async function handleClubBookingPayment(
  intent: Stripe.PaymentIntent,
  invoiceId: string
) {
  const {
    data: invoice,
    error: invoiceError,
  } =
    await supabase
      .from(
        "club_booking_invoices"
      )
      .select(`
        id,
        booking_id,
        customer_id,
        invoice_no,
        final_amount_cents,
        status,
        payment_status,
        stripe_payment_intent
      `)
      .eq("id", invoiceId)
      .maybeSingle();

  if (invoiceError) {
    throw invoiceError;
  }

  if (!invoice) {
    throw new Error(
      `Club booking invoice not found: ${invoiceId}`
    );
  }

  const {
  invoiceAmount: amount,
  processingFee,
  chargedAmount,
} = getStripePaymentAmounts(
  intent
);

  if (amount <= 0) {
    throw new Error(
      `Invalid club booking payment amount for ${intent.id}`
    );
  }

  const now =
    new Date().toISOString();

  const result =
    await insertPaymentOnce({
      tableName:
        "club_payments",

      stripeColumn:
        "stripe_payment_intent_id",

      paymentIntentId:
        intent.id,

      payload: {
        invoice_id:
          invoice.id,

        amount,

        method: "card",

        notes:
  `Stripe payment — ${intent.id} | Invoice: $${amount.toFixed(
    2
  )} | Card fee: $${processingFee.toFixed(
    2
  )} | Charged: $${chargedAmount.toFixed(
    2
  )}`,

        paid_at: now,

        approved: true,

        role: "stripe",

        stripe_payment_intent_id:
          intent.id,
      },
    });

  // ----------------------------------------------------------
  // Mark the booking invoice as paid
  // ----------------------------------------------------------

  const {
    error: updateInvoiceError,
  } =
    await supabase
      .from(
        "club_booking_invoices"
      )
      .update({
        status: "paid",
        payment_status:
          "paid",
        payment_method:
          "card",
        payment_provider_id:
          intent.id,
        stripe_payment_intent:
          intent.id,
      })
      .eq(
        "id",
        invoice.id
      );

  if (updateInvoiceError) {
    throw updateInvoiceError;
  }

  // ----------------------------------------------------------
  // Confirm venue booking
  // ----------------------------------------------------------

  if (invoice.booking_id) {
    const {
      error: bookingError,
    } =
      await supabase
        .from("venue_bookings")
        .update({
          status:
            "confirmed",
        })
        .eq(
          "id",
          invoice.booking_id
        );

    if (bookingError) {
      console.error(
        `Payment was recorded, but booking ${invoice.booking_id} could not be confirmed:`,
        bookingError
      );

      await queueSystemEmail(
        "Stripe Payment Received — Booking Confirmation Failed",
        `
Payment Intent: ${intent.id}
Invoice: ${invoice.id}
Booking: ${invoice.booking_id}

${JSON.stringify(
  bookingError,
  null,
  2
)}
        `
      );
    }
  }

  console.log(
    `Club booking payment processed`,
    {
      invoice_id:
        invoice.id,
      booking_id:
        invoice.booking_id,
      payment_intent:
        intent.id,
      amount,
      duplicate:
        result.duplicate,
    }
  );

  return result;
}

// ============================================================
// SPA
// spa_invoices → spa_payments
// ============================================================

async function handleSpaPayment(
  intent: Stripe.PaymentIntent,
  invoiceId: string
) {
  const {
    data: invoice,
    error: invoiceError,
  } =
    await supabase
      .from("spa_invoices")
      .select(`
        id,
        reservation_id,
        invoice_no,
        customer_name,
        customer_email,
        total_amount_usd,
        paid_total_usd,
        status
      `)
      .eq("id", invoiceId)
      .maybeSingle();

  if (invoiceError) {
    throw invoiceError;
  }

  if (!invoice) {
    throw new Error(
      `Spa invoice not found: ${invoiceId}`
    );
  }

  const {
  invoiceAmount: amount,
  processingFee,
  chargedAmount,
} = getStripePaymentAmounts(
  intent
);

  if (amount <= 0) {
    throw new Error(
      `Invalid spa payment amount for ${intent.id}`
    );
  }

  const now =
    new Date().toISOString();

  const result =
    await insertPaymentOnce({
      tableName:
        "spa_payments",

      stripeColumn:
        "stripe_payment_intent_id",

      paymentIntentId:
        intent.id,

      payload: {
        invoice_id:
          invoice.id,

        reservation_id:
          invoice.reservation_id ||
          null,

        amount,

        method: "card",

        notes:
  `Stripe payment — ${intent.id} | Invoice: $${amount.toFixed(
    2
  )} | Card fee: $${processingFee.toFixed(
    2
  )} | Charged: $${chargedAmount.toFixed(
    2
  )}`,

        reference:
          intent.id,

        paid_at: now,

        approved: true,

        approved_at: now,

        status:
          "approved",

        submitted_by:
          "stripe",

        stripe_payment_intent_id:
          intent.id,
      },
    });

  console.log(
    `Spa payment processed`,
    {
      invoice_id:
        invoice.id,
      reservation_id:
        invoice.reservation_id,
      payment_intent:
        intent.id,
      amount,
      duplicate:
        result.duplicate,
    }
  );

  return result;
}

// ============================================================
// BOUTIQUE
// boutique_invoices → boutique_payments
// ============================================================

async function handleBoutiquePayment(
  intent: Stripe.PaymentIntent,
  invoiceId: string
) {
  const {
    data: invoice,
    error: invoiceError,
  } =
    await supabase
      .from(
        "boutique_invoices"
      )
      .select(`
        id,
        user_id,
        full_name,
        invoice_no,
        total,
        paid_total,
        status
      `)
      .eq("id", invoiceId)
      .maybeSingle();

  if (invoiceError) {
    throw invoiceError;
  }

  if (!invoice) {
    throw new Error(
      `Boutique invoice not found: ${invoiceId}`
    );
  }

  const {
  invoiceAmount: amount,
  processingFee,
  chargedAmount,
} = getStripePaymentAmounts(
  intent
);

  if (amount <= 0) {
    throw new Error(
      `Invalid boutique payment amount for ${intent.id}`
    );
  }

  const result =
    await insertPaymentOnce({
      tableName:
        "boutique_payments",

      stripeColumn:
        "stripe_payment_intent_id",

      paymentIntentId:
        intent.id,

      payload: {
        invoice_id:
          invoice.id,

        method: "card",

        amount,

        note:
  `Stripe payment — ${intent.id} | Invoice: $${amount.toFixed(
    2
  )} | Card fee: $${processingFee.toFixed(
    2
  )} | Charged: $${chargedAmount.toFixed(
    2
  )}`,

        stripe_payment_intent_id:
          intent.id,
      },
    });

  console.log(
    `Boutique payment processed`,
    {
      invoice_id:
        invoice.id,
      payment_intent:
        intent.id,
      amount,
      duplicate:
        result.duplicate,
    }
  );

  return result;
}

// ============================================================
// ROUTER FOR PAYMENT INTENTS
// ============================================================

async function processPaymentIntent(
  intent: Stripe.PaymentIntent
) {
  const metadata =
    intent.metadata || {};

  const invoiceId =
    metadata.invoice_id ||
    null;

  const invoiceType =
    metadata.invoice_type ||
    null;

  // ----------------------------------------------------------
  // Some legacy Stripe Checkout PaymentIntents have no metadata.
  // checkout.session.completed handles those separately below.
  // ----------------------------------------------------------

  if (
    !invoiceId ||
    !invoiceType
  ) {
    console.warn(
      `PaymentIntent ${intent.id} has no A'QUA D'OR invoice metadata. Ignoring in PaymentIntent router.`
    );

    return {
      ignored: true,
    };
  }

  console.log(
    `Processing Stripe PaymentIntent`,
    {
      payment_intent:
        intent.id,
      invoice_id:
        invoiceId,
      invoice_type:
        invoiceType,
      stripe_amount_received:
  intent.amount_received,

invoice_amount_cents:
  intent.metadata
    ?.invoice_amount_cents,

processing_fee_cents:
  intent.metadata
    ?.processing_fee_cents,

stripe_charge_cents:
  intent.metadata
    ?.stripe_charge_cents,
    }
  );

  switch (invoiceType) {
    case "school":
      return await handleSchoolPayment(
        intent,
        invoiceId
      );

    case "club_membership":
      return await handleClubMembershipPayment(
        intent,
        invoiceId
      );

    case "club_booking":
      return await handleClubBookingPayment(
        intent,
        invoiceId
      );

    case "spa":
      return await handleSpaPayment(
        intent,
        invoiceId
      );

    case "boutique":
      return await handleBoutiquePayment(
        intent,
        invoiceId
      );

    default:
      throw new Error(
        `Unknown invoice_type "${invoiceType}" on PaymentIntent ${intent.id}`
      );
  }
}

// ============================================================
// LEGACY CHECKOUT SUPPORT
// ============================================================

async function handleLegacyCheckoutSession(
  session: Stripe.Checkout.Session
) {
  if (
    session.payment_status !==
    "paid"
  ) {
    console.log(
      `Checkout Session ${session.id} completed but payment_status=${session.payment_status}`
    );

    return;
  }

  const paymentIntentId =
    typeof session.payment_intent ===
    "string"
      ? session.payment_intent
      : session.payment_intent?.id ||
        null;

  // ----------------------------------------------------------
  // First locate the old club booking using session ID
  // ----------------------------------------------------------

  let invoice = null;

  const {
    data: bySession,
    error: bySessionError,
  } =
    await supabase
      .from(
        "club_booking_invoices"
      )
      .select(`
        id,
        booking_id,
        customer_id,
        invoice_no
      `)
      .eq(
        "stripe_session_id",
        session.id
      )
      .maybeSingle();

  if (
    bySessionError &&
    bySessionError.code !==
      "PGRST116"
  ) {
    console.warn(
      "Legacy checkout session lookup error:",
      bySessionError
    );
  }

  invoice =
    bySession || null;

  // ----------------------------------------------------------
  // Fallback: locate using PaymentIntent ID
  // ----------------------------------------------------------

  if (
    !invoice &&
    paymentIntentId
  ) {
    const {
      data: byIntent,
      error:
        byIntentError,
    } =
      await supabase
        .from(
          "club_booking_invoices"
        )
        .select(`
          id,
          booking_id,
          customer_id,
          invoice_no
        `)
        .eq(
          "stripe_payment_intent",
          paymentIntentId
        )
        .maybeSingle();

    if (byIntentError) {
      console.warn(
        "Legacy PaymentIntent lookup error:",
        byIntentError
      );
    }

    invoice =
      byIntent || null;
  }

  if (!invoice) {
    console.warn(
      `Legacy Checkout Session ${session.id} could not be linked to a club booking invoice.`
    );

    return;
  }

  if (!paymentIntentId) {
    throw new Error(
      `Legacy Checkout Session ${session.id} has no PaymentIntent ID`
    );
  }

  // ----------------------------------------------------------
  // Retrieve the real PaymentIntent
  // ----------------------------------------------------------

  const intent =
    await stripe
      .paymentIntents
      .retrieve(
        paymentIntentId
      );

  // Give legacy intent the metadata expected by our new router.
  const normalizedIntent = {
    ...intent,

    metadata: {
      ...(intent.metadata ||
        {}),

      invoice_id:
        invoice.id,

      invoice_type:
        "club_booking",

      booking_id:
        invoice.booking_id ||
        "",

      user_id:
        invoice.customer_id ||
        "",
    },
  };

  await handleClubBookingPayment(
    normalizedIntent,
    invoice.id
  );
}

// ============================================================
// MAIN WEBHOOK
// ============================================================

serve(
  async (req: Request) => {
    if (
      req.method !== "POST"
    ) {
      return jsonResponse(
        {
          error:
            "Method not allowed",
        },
        405
      );
    }

    // IMPORTANT:
    // Stripe signature verification MUST use
    // the raw, unmodified request body.
    const signature =
      req.headers.get(
        "stripe-signature"
      );

    if (!signature) {
      return jsonResponse(
        {
          error:
            "Missing Stripe signature",
        },
        400
      );
    }

    const rawBody =
      await req.text();

    let event:
      Stripe.Event;

    // ========================================================
    // VERIFY STRIPE SIGNATURE
    // ========================================================

    try {
      event =
        await stripe.webhooks
          .constructEventAsync(
            rawBody,
            signature,
            webhookSecret
          );
    } catch (err) {
      console.error(
        "Stripe webhook signature verification failed:",
        err
      );

      return jsonResponse(
        {
          error:
            `Webhook signature verification failed: ${err.message}`,
        },
        400
      );
    }

    console.log(
      `Stripe event received: ${event.type} (${event.id})`
    );

    // ========================================================
    // PROCESS EVENT
    // ========================================================

    try {
      switch (
        event.type
      ) {
        // ----------------------------------------------------
        // PRIMARY PAYMENT SUCCESS EVENT
        // ----------------------------------------------------

        case "payment_intent.succeeded": {
          const intent =
            event.data
              .object as
              Stripe.PaymentIntent;

          await processPaymentIntent(
            intent
          );

          break;
        }

        // ----------------------------------------------------
        // PAYMENT FAILED
        // ----------------------------------------------------

        case "payment_intent.payment_failed": {
          const intent =
            event.data
              .object as
              Stripe.PaymentIntent;

          console.warn(
            "Stripe payment failed",
            {
              payment_intent:
                intent.id,

              invoice_id:
                intent.metadata
                  ?.invoice_id,

              invoice_type:
                intent.metadata
                  ?.invoice_type,

              message:
                intent
                  .last_payment_error
                  ?.message ||
                "Unknown failure",
            }
          );

          break;
        }

        // ----------------------------------------------------
        // LEGACY STRIPE CHECKOUT
        // Keep while old club pages still use
        // create-checkout-session.
        // ----------------------------------------------------

        case "checkout.session.completed": {
          const session =
            event.data
              .object as
              Stripe.Checkout.Session;

          await handleLegacyCheckoutSession(
            session
          );

          break;
        }

        default: {
          console.log(
            `Stripe event ignored: ${event.type}`
          );
        }
      }

      // Stripe receives 200 only after our handler finishes.
      return jsonResponse({
        received: true,
        event_id:
          event.id,
        event_type:
          event.type,
      });
    } catch (error) {
      const message =
        error?.message ||
        String(error);

      console.error(
        `Stripe webhook processing error for ${event.id}:`,
        error
      );

      await queueSystemEmail(
        "Stripe Webhook Processing Error",
        `
Event ID: ${event.id}
Event type: ${event.type}

${message}

${error?.stack || ""}
        `
      );

      // Return 500 intentionally.
      // Stripe can retry the webhook.
      return jsonResponse(
        {
          error:
            message,
          event_id:
            event.id,
        },
        500
      );
    }
  }
);