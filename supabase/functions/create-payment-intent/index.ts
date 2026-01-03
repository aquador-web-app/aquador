// supabase/functions/create-payment-intent/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// === Load environment variables ===
const supabaseUrl =
  Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2025-06-30.basil",
});
const supabase = createClient(supabaseUrl, supabaseKey);

// === CORS headers ===
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// === Utility: Queue error email ===
async function queueErrorEmail(subject: string, body: string) {
  try {
    await supabase.from("email_queue").insert({
      to: "admin@aquador.ht", // update if you want your real admin email
      subject,
      body: `<pre>${body}</pre>`,
      status: "pending",
      kind: "system",
      created_at: new Date().toISOString(),
    });
    console.log("📨 Error email queued to admin@aquador.ht");
  } catch (err) {
    console.error("❌ Failed to queue error email:", err);
  }
}

// === Main HTTP entry ===
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const { invoice_id, user_id, email, description } = await req.json();

    // ============================
    // 1️⃣ Try to locate invoice in all tables
    // ============================
    let invoice = null;
    let origin = null;
    let tableName = null;

    const tablesToCheck = [
      { name: "invoices", label: "school" },
      { name: "club_invoices", label: "club" },
      { name: "club_booking_invoices", label: "club_booking" },
    ];

    for (const t of tablesToCheck) {
      const { data, error } = await supabase
        .from(t.name)
        .select("id, total_usd, status")
        .eq("id", invoice_id)
        .maybeSingle();

      if (data) {
        invoice = data;
        origin = t.label;
        tableName = t.name;
        break;
      }
    }

    if (!invoice) {
      const message = `❌ Invoice not found in any table.\nInvoice ID: ${invoice_id}\nUser: ${user_id}\nEmail: ${email}`;
      console.error(message);
      await queueErrorEmail("⚠️ Invoice Not Found - create-payment-intent", message);

      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // ============================
    // 2️⃣ Create Stripe PaymentIntent
    // ============================
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(invoice.total_usd * 100), // USD → cents
      currency: "usd",
      description:
        description ||
        (origin === "school"
          ? "A'QUA D'OR School Invoice Payment"
          : origin === "club_booking"
          ? "A'QUA D'OR Club Booking Payment"
          : "A'QUA D'OR Club Payment"),
      metadata: {
        invoice_id,
        user_id,
        user_email: email,
        origin,
      },
      automatic_payment_methods: { enabled: true },
    });

    console.log(
      `✅ PaymentIntent created for ${origin} invoice ${invoice_id}, amount ${invoice.total_usd}`
    );

    // ============================
    // 3️⃣ Update invoice status
    // ============================
    const { error: updateErr } = await supabase
      .from(tableName)
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        status: "awaiting_payment",
      })
      .eq("id", invoice_id);

    if (updateErr) {
      const msg = `⚠️ Failed to update ${tableName} for invoice ${invoice_id}: ${updateErr.message}`;
      console.error(msg);
      await queueErrorEmail("⚠️ Invoice Update Failed", msg);
    }

    // ============================
    // 4️⃣ Return client_secret to frontend
    // ============================
    return new Response(
      JSON.stringify({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount: invoice.total_usd,
        currency: "usd",
        origin,
        table: tableName,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    const msg = `🔥 Error creating PaymentIntent:\n${error.stack || error.message}`;
    console.error(msg);
    await queueErrorEmail("🔥 Stripe PaymentIntent Creation Error", msg);

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
