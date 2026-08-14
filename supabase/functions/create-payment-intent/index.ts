// supabase/functions/create-payment-intent/index.ts
// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl =
  Deno.env.get("PROJECT_URL") ||
  Deno.env.get("SUPABASE_URL");

const supabaseServiceKey =
  Deno.env.get("FUNCTION_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL / PROJECT_URL");
}

if (!supabaseServiceKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

if (!stripeSecret) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2025-06-30.basil",
});

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function queueErrorEmail(subject: string, body: string) {
  try {
    await supabase.from("email_queue").insert({
      to: "deadrien@clubaquador.com",
      subject,
      body: `<pre>${body}</pre>`,
      status: "pending",
      kind: "system",
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to queue Stripe error email:", err);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405
    );
  }

  try {
    const body = await req.json();

    const {
  invoice_id,
  invoice_type,
  user_id = null,
  email = null,
  description = null,
  quote_only = false,
} = body;

    if (!invoice_id) {
      return jsonResponse(
        { error: "invoice_id is required" },
        400
      );
    }

    if (!invoice_type) {
      return jsonResponse(
        { error: "invoice_type is required" },
        400
      );
    }

    const allowedTypes = [
      "school",
      "club_membership",
      "club_booking",
      "spa",
      "boutique",
      "event_visitor",
    ];

    if (!allowedTypes.includes(invoice_type)) {
      return jsonResponse(
        {
          error: "Invalid invoice_type",
          allowed_types: allowedTypes,
        },
        400
      );
    }

    let invoice: any = null;
    let amountCents = 0;
    let invoiceNo = "";
    let customerEmail = email;
    let customerUserId = user_id;
    let tableName = "";
    let paymentTable = "";
    let defaultDescription = "";

    // =========================================================
    // SCHOOL
    // =========================================================
    if (invoice_type === "school") {
      tableName = "invoices";
      paymentTable = "payments";

      const { data, error } = await supabase
        .from("invoices")
        .select(
          `
          id,
          user_id,
          total,
          paid_total,
          status,
          full_name,
          stripe_payment_intent_id
        `
        )
        .eq("id", invoice_id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return jsonResponse(
          { error: "School invoice not found" },
          404
        );
      }

      invoice = data;

      const total = Number(data.total || 0);
      const paid = Number(data.paid_total || 0);
      const balance = Math.max(0, total - paid);

      amountCents = Math.round(balance * 100);

      customerUserId =
        data.user_id ||
        customerUserId;

      defaultDescription =
        "A'QUA D'OR School Invoice Payment";
    }

    // =========================================================
    // CLUB MEMBERSHIP
    // =========================================================
    else if (invoice_type === "club_membership") {
      tableName = "club_invoices";
      paymentTable = "club_membership_payments";

      const { data, error } = await supabase
        .from("club_invoices")
        .select(
          `
          id,
          customer_id,
          invoice_no,
          total,
          paid_total,
          status,
          client_email
        `
        )
        .eq("id", invoice_id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return jsonResponse(
          { error: "Club membership invoice not found" },
          404
        );
      }

      invoice = data;

      const total = Number(data.total || 0);
      const paid = Number(data.paid_total || 0);
      const balance = Math.max(0, total - paid);

      amountCents = Math.round(balance * 100);

      invoiceNo =
        data.invoice_no || "";

      customerEmail =
        data.client_email ||
        customerEmail;

      customerUserId =
        data.customer_id ||
        customerUserId;

      defaultDescription =
        "A'QUA D'OR Club Membership Payment";
    }

    // =========================================================
    // CLUB BOOKING / VENUE
    // =========================================================
    else if (invoice_type === "club_booking") {
      tableName = "club_booking_invoices";
      paymentTable = "club_payments";

      const { data, error } = await supabase
        .from("club_booking_invoices")
        .select(
          `
          id,
          booking_id,
          customer_id,
          invoice_no,
          final_amount_cents,
          currency,
          status,
          payment_status,
          client_email,
          stripe_payment_intent
        `
        )
        .eq("id", invoice_id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return jsonResponse(
          { error: "Club booking invoice not found" },
          404
        );
      }

      invoice = data;

      amountCents =
        Number(data.final_amount_cents || 0);

      invoiceNo =
        data.invoice_no || "";

      customerEmail =
        data.client_email ||
        customerEmail;

      customerUserId =
        data.customer_id ||
        customerUserId;

      defaultDescription =
        "A'QUA D'OR Club Booking Payment";
    }

    // =========================================================
    // SPA
    // =========================================================
    else if (invoice_type === "spa") {
      tableName = "spa_invoices";
      paymentTable = "spa_payments";

      const { data, error } = await supabase
        .from("spa_invoices")
        .select(
          `
          id,
          reservation_id,
          invoice_no,
          customer_name,
          customer_email,
          total_amount_usd,
          paid_total_usd,
          status
        `
        )
        .eq("id", invoice_id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return jsonResponse(
          { error: "Spa invoice not found" },
          404
        );
      }

      invoice = data;

      const total =
        Number(data.total_amount_usd || 0);

      const paid =
        Number(data.paid_total_usd || 0);

      const balance =
        Math.max(0, total - paid);

      amountCents =
        Math.round(balance * 100);

      invoiceNo =
        data.invoice_no || "";

      customerEmail =
        data.customer_email ||
        customerEmail;

      defaultDescription =
        "A'QUA D'OR Spa Payment";
    }

    // =========================================================
    // BOUTIQUE
    // =========================================================
    else if (invoice_type === "boutique") {
      tableName = "boutique_invoices";
      paymentTable = "boutique_payments";

      const { data, error } = await supabase
        .from("boutique_invoices")
        .select(
          `
          id,
          user_id,
          full_name,
          invoice_no,
          total,
          paid_total,
          status
        `
        )
        .eq("id", invoice_id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return jsonResponse(
          { error: "Boutique invoice not found" },
          404
        );
      }

      invoice = data;

      const total =
        Number(data.total || 0);

      const paid =
        Number(data.paid_total || 0);

      const balance =
        Math.max(0, total - paid);

      amountCents =
        Math.round(balance * 100);

      invoiceNo =
        data.invoice_no || "";

      customerUserId =
        data.user_id ||
        customerUserId;

      defaultDescription =
        "A'QUA D'OR Boutique Payment";
    }

    // =========================================================
// EVENT VISITOR — CLÔTURE
// =========================================================
else if (invoice_type === "event_visitor") {
  tableName = "event_visitor_invoices";
  paymentTable = "";

  const { data, error } = await supabase
    .from("event_visitor_invoices")
    .select(
      `
      id,
      registration_id,
      invoice_no,
      event_code,
      full_name,
      email,
      phone,
      participant_count,
      total,
      paid_total,
      status,
      currency,
      stripe_payment_intent_id
      `
    )
    .eq("id", invoice_id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return jsonResponse(
      {
        error:
          "Event visitor invoice not found",
      },
      404
    );
  }

  invoice = data;

  const total =
    Number(data.total || 0);

  const paid =
    Number(data.paid_total || 0);

  const balance =
    Math.max(0, total - paid);

  amountCents =
    Math.round(balance * 100);

  invoiceNo =
    data.invoice_no || "";

  customerEmail =
    data.email ||
    customerEmail;

  defaultDescription =
    "A'QUA D'OR Closing Ceremony Visitor Payment";
}
  

    // =========================================================
// CARD PROCESSING FEE
// Gross-up so A'QUA D'OR receives approximately the
// original invoice balance after 2.9% + $0.30.
// =========================================================

const invoiceAmountCents = amountCents;

const STRIPE_PERCENT = 0.029;
const STRIPE_FIXED_CENTS = 30;

const stripeChargeCents = Math.ceil(
  (invoiceAmountCents + STRIPE_FIXED_CENTS) /
  (1 - STRIPE_PERCENT)
);

const processingFeeCents =
  stripeChargeCents - invoiceAmountCents;

    // =========================================================
    // VALIDATION
    // =========================================================

    if (!invoice) {
      return jsonResponse(
        { error: "Invoice could not be loaded" },
        404
      );
    }

    if (!Number.isFinite(amountCents)) {
      return jsonResponse(
        { error: "Invalid invoice amount" },
        400
      );
    }

    if (amountCents <= 0) {
      return jsonResponse(
        {
          error: "Invoice has no outstanding balance",
          code: "NO_BALANCE_DUE",
        },
        400
      );
    }

    // Stripe minimums vary by currency/payment method.
    // We simply prevent zero/negative charges here.
    if (amountCents < 1) {
      return jsonResponse(
        { error: "Payment amount is too small" },
        400
      );
    }

    // =========================================================
// QUOTE ONLY
// Return the exact card total without creating/reusing
// a Stripe PaymentIntent.
// =========================================================

if (quote_only === true) {
  return jsonResponse({
    quote_only: true,

    invoice_id,
    invoice_no: invoiceNo,
    invoice_type,

    invoice_amount:
      invoiceAmountCents / 100,

    invoice_amount_cents:
      invoiceAmountCents,

    processing_fee:
      processingFeeCents / 100,

    processing_fee_cents:
      processingFeeCents,

    charge_amount:
      stripeChargeCents / 100,

    charge_amount_cents:
      stripeChargeCents,

    currency: "usd",
  });
}

    // =========================================================
    // REUSE PAYMENT INTENT WHEN POSSIBLE
    // =========================================================

    let existingPaymentIntentId: string | null = null;

if (
  invoice_type === "school" &&
  invoice.stripe_payment_intent_id
) {
  existingPaymentIntentId =
    invoice.stripe_payment_intent_id;
} else if (
  invoice_type === "event_visitor" &&
  invoice.stripe_payment_intent_id
) {
  existingPaymentIntentId =
    invoice.stripe_payment_intent_id;
} else if (
  invoice_type === "club_booking" &&
  invoice.stripe_payment_intent
) {
  existingPaymentIntentId =
    invoice.stripe_payment_intent;
}

    if (existingPaymentIntentId) {
  try {
    const existing =
      await stripe.paymentIntents.retrieve(
        existingPaymentIntentId
      );

    // =====================================================
    // ALREADY PAID — BLOCK ANOTHER CARD PAYMENT
    // =====================================================

    if (existing.status === "succeeded") {
      console.warn(
        `Blocked duplicate Stripe payment for ${invoice_type} invoice ${invoice_id}. Existing PI: ${existing.id}`
      );

      return jsonResponse(
        {
          error:
            "Cette facture a déjà été payée par carte.",
          code:
            "STRIPE_PAYMENT_ALREADY_SUCCEEDED",
          payment_intent_id:
            existing.id,
        },
        409
      );
    }

    // =====================================================
    // CURRENTLY PROCESSING — DO NOT CREATE ANOTHER ONE
    // =====================================================

    if (existing.status === "processing") {
      return jsonResponse(
        {
          error:
            "Un paiement par carte est déjà en cours pour cette facture.",
          code:
            "STRIPE_PAYMENT_PROCESSING",
          payment_intent_id:
            existing.id,
        },
        409
      );
    }

    // =====================================================
    // REUSE EXISTING UNPAID PAYMENT INTENT
    // =====================================================

    const reusableStatuses = [
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
    ];

    if (
      reusableStatuses.includes(
        existing.status
      )
    ) {
      let paymentIntentToReturn =
        existing;

      // If invoice balance changed, update the same PI.
      if (
  existing.amount !==
  stripeChargeCents
) {
  paymentIntentToReturn =
    await stripe.paymentIntents.update(
      existing.id,
      {
        amount: stripeChargeCents,
        metadata: {
          ...existing.metadata,
          invoice_amount_cents:
            String(invoiceAmountCents),
          processing_fee_cents:
            String(processingFeeCents),
          stripe_charge_cents:
            String(stripeChargeCents),
        },
      }
    );
}

      console.log(
        `Reusing Stripe PaymentIntent ${paymentIntentToReturn.id} for ${invoice_type} invoice ${invoice_id}`
      );

      return jsonResponse({
        client_secret:
          paymentIntentToReturn.client_secret,

        payment_intent_id:
          paymentIntentToReturn.id,

        invoice_amount:
  invoiceAmountCents / 100,

invoice_amount_cents:
  invoiceAmountCents,

processing_fee:
  processingFeeCents / 100,

processing_fee_cents:
  processingFeeCents,

charge_amount:
  stripeChargeCents / 100,

charge_amount_cents:
  stripeChargeCents,

        currency:
          "usd",

        invoice_id,

        invoice_no:
          invoiceNo,

        invoice_type,

        reused:
          true,
      });
    }

    // If canceled, we allow creation of a fresh PI below.
    if (
      existing.status ===
      "canceled"
    ) {
      console.log(
        `Stored PaymentIntent ${existing.id} is canceled. A new one will be created.`
      );
    }
  } catch (err) {
    console.warn(
      "Unable to retrieve stored PaymentIntent:",
      err
    );
  }
}

    // =========================================================
    // CREATE PAYMENT INTENT
    // =========================================================

    const metadata: Record<string, string> = {
      invoice_id:
        String(invoice_id),

      invoice_type:
        String(invoice_type),

      invoice_table:
        String(tableName),

      payment_table:
        String(paymentTable),

      invoice_no:
        String(invoiceNo || ""),
    };

    if (customerUserId) {
      metadata.user_id =
        String(customerUserId);
    }

    if (customerEmail) {
      metadata.user_email =
        String(customerEmail);
    }

    if (
      invoice_type === "club_booking" &&
      invoice.booking_id
    ) {
      metadata.booking_id =
        String(invoice.booking_id);
    }

    if (
      invoice_type === "spa" &&
      invoice.reservation_id
    ) {
      metadata.reservation_id =
        String(invoice.reservation_id);
    }

    if (
  invoice_type === "event_visitor" &&
  invoice.registration_id
) {
  metadata.registration_id =
    String(invoice.registration_id);
}

    // =========================================================
// CARD PAYMENT AMOUNTS
// =========================================================

metadata.invoice_amount_cents =
  String(invoiceAmountCents);

metadata.processing_fee_cents =
  String(processingFeeCents);

metadata.stripe_charge_cents =
  String(stripeChargeCents);

// =========================================================
// CREATE STRIPE PAYMENT INTENT PARAMS
// =========================================================


    const createParams: Stripe.PaymentIntentCreateParams = {
  amount: stripeChargeCents,

  currency: "usd",

  description:
    description ||
    defaultDescription,

  metadata,

  payment_method_types: [
  "card",
],
};

    if (customerEmail) {
      createParams.receipt_email =
        customerEmail;
    }

    const paymentIntent =
  await stripe.paymentIntents.create(
    createParams,
    {
      idempotencyKey:
        `aquador-${invoice_type}-${invoice_id}-${crypto.randomUUID()}`,
    }
  );

    // =========================================================
    // STORE PAYMENT INTENT WHERE COLUMN CURRENTLY EXISTS
    // =========================================================

    if (invoice_type === "school") {
  const { error: updateError } =
    await supabase
      .from("invoices")
      .update({
        stripe_payment_intent_id:
          paymentIntent.id,
      })
      .eq(
        "id",
        invoice_id
      );

  if (updateError) {
    throw new Error(
      `Failed storing school PaymentIntent: ${updateError.message}`
    );
  }
}

if (invoice_type === "event_visitor") {
  const { error: updateError } =
    await supabase
      .from("event_visitor_invoices")
      .update({
        stripe_payment_intent_id:
          paymentIntent.id,
      })
      .eq(
        "id",
        invoice_id
      );

  if (updateError) {
    throw new Error(
      `Failed storing event visitor PaymentIntent: ${updateError.message}`
    );
  }
}

if (invoice_type === "club_booking") {
  const { error: updateError } =
    await supabase
      .from("club_booking_invoices")
      .update({
        stripe_payment_intent:
          paymentIntent.id,
        payment_provider_id:
          paymentIntent.id,
      })
      .eq(
        "id",
        invoice_id
      );

  if (updateError) {
    throw new Error(
      `Failed storing club booking PaymentIntent: ${updateError.message}`
    );
  }
}

    console.log(
      `Stripe PaymentIntent ${paymentIntent.id} created`,
      {
        invoice_id,
        invoice_type,
        invoice_amount_cents:
  invoiceAmountCents,

processing_fee_cents:
  processingFeeCents,

stripe_charge_cents:
  stripeChargeCents,
      }
    );

    return jsonResponse({
      client_secret:
        paymentIntent.client_secret,

      payment_intent_id:
        paymentIntent.id,

      invoice_id,

      invoice_no:
        invoiceNo,

      invoice_type,

      invoice_amount:
  invoiceAmountCents / 100,

invoice_amount_cents:
  invoiceAmountCents,

processing_fee:
  processingFeeCents / 100,

processing_fee_cents:
  processingFeeCents,

charge_amount:
  stripeChargeCents / 100,

charge_amount_cents:
  stripeChargeCents,

currency: "usd",
    });
  } catch (error) {
    console.error(
      "Stripe create-payment-intent error:",
      error
    );

    const message =
      error?.message ||
      String(error);

    await queueErrorEmail(
      "Stripe PaymentIntent Creation Error",
      message
    );

    return jsonResponse(
      {
        error: message,
      },
      500
    );
  }
});