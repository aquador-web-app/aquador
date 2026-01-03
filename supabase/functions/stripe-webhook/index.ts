// supabase/functions/stripe-webhook/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// === Environment setup ===
const supabaseUrl =
  Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const ALERT_EMAIL = "deadrien@clubaquador.com";


const stripe = new Stripe(stripeSecret, { apiVersion: "2025-06-30.basil" });
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// === Utility: Queue system email for admin alerts ===
async function queueSystemEmail(subject: string, body: string) {
  try {
    await supabase.from("email_queue").insert({
      to: "deadrien@aclubaquador.com",
      subject,
      body: `<pre>${body}</pre>`,
      status: "pending",
      kind: "system",
      created_at: new Date().toISOString(),
    });
    console.log("📨 System alert queued → deadrien@aclubaquador.com");
  } catch (err) {
    console.error("❌ Failed to queue system email:", err);
  }
}

// === Utility: Queue receipt email to user ===
async function queueReceiptEmail(user, amount, invoiceId) {
  if (!user?.email) return;
  const body = `
    <p>Bonjour ${user.full_name || "cher membre"},</p>
    <p>Nous avons bien reçu votre paiement de <strong>$${amount.toFixed(2)}</strong>.</p>
    <p>Votre réservation ou facture est maintenant confirmée 🎉</p>
    <p>Merci d’avoir choisi <strong>A'QUA D'OR</strong> !</p>
    <p>— L’équipe A'QUA D'OR 💧</p>
  `;
  const { error } = await supabase.from("email_queue").insert({
    user_id: user.id || null,
    email: user.email,
    subject: "Reçu de paiement — A'QUA D'OR",
    body,
    status: "pending",
    kind: "receipt",
    invoice_id: invoiceId,
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error("❌ Failed to queue receipt email:", error);
    await queueSystemEmail("⚠️ Receipt Email Failure", JSON.stringify(error, null, 2));
  } else {
    console.log(`📧 Receipt queued successfully for ${user.email}`);
  }
}

// === Main webhook handler ===
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    const msg = `❌ Webhook signature verification failed: ${err.message}`;
    console.error(msg);
    await queueSystemEmail("❌ Stripe Webhook Signature Error", msg);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  console.log("✅ Stripe event received:", event.type);

  try {
    switch (event.type) {
      // 💰 Payment succeeded
      case "payment_intent.succeeded": {
        const intent = event.data.object;
        const metadata = intent.metadata || {};
        const invoiceId = metadata.invoice_id || metadata.club_invoice_id || null;
        const userId = metadata.user_id || null;
        const origin = metadata.origin || "unknown";

        console.log(`💸 Payment succeeded for invoice: ${invoiceId} (origin: ${origin})`);

        // Record payment
        const { error: payErr } = await supabase.from("payments").insert({
          user_id: userId,
          invoice_id: invoiceId,
          stripe_payment_intent: intent.id,
          amount: intent.amount_received / 100,
          currency: intent.currency,
          status: "succeeded",
          method: intent.payment_method_types?.[0] || "card",
          paid_at: new Date().toISOString(),
        });
        if (payErr) {
          console.error("❌ Error inserting payment:", payErr);
          await queueSystemEmail("❌ Stripe Payment Record Error", JSON.stringify(payErr, null, 2));
        }

        // Try updating the right invoice table
        const possibleTables = [
          "club_booking_invoices",
          "club_invoices",
          "invoices",
        ];
        let invoice = null;
        for (const table of possibleTables) {
          const { data, error } = await supabase
            .from(table)
            .update({
              status: "paid",
              payment_method: "card",
              paid_at: new Date().toISOString(),
            })
            .eq("id", invoiceId)
            .select("id, user_id, total_usd, booking_id")
            .maybeSingle();

          if (data) {
            invoice = data;
            console.log(`✅ Invoice ${invoiceId} updated in table ${table}`);
            break;
          } else if (error) {
            console.warn(`⚠️ Invoice not found in ${table}`);
          }
        }

        // Booking confirmation & email
        if (invoice?.booking_id) {
          await supabase
            .from("venue_bookings")
            .update({ status: "confirmed" })
            .eq("id", invoice.booking_id);
          console.log(`🎯 Booking ${invoice.booking_id} confirmed`);
        }

        if (invoice?.user_id) {
          const { data: user, error: userErr } = await supabase
            .from("profiles_with_unpaid")
            .select("id, email, full_name")
            .eq("id", invoice.user_id)
            .single();
          if (!userErr && user) await queueReceiptEmail(user, invoice.total_usd, invoiceId);
          else await queueSystemEmail("⚠️ User Profile Fetch Failed", JSON.stringify(userErr, null, 2));
        }
        break;
      }

      // 🧾 Checkout session completed
      case "checkout.session.completed": {
        const session = event.data.object;
        const metadata = session.metadata || {};
        const invoiceId = metadata.invoice_id || metadata.club_invoice_id || null;
        const userId = metadata.user_id || null;
        const origin = metadata.origin || "unknown";

        console.log(`🧾 Checkout completed for invoice: ${invoiceId} (${origin})`);

        const { error: payErr } = await supabase.from("payments").insert({
          user_id: userId,
          invoice_id: invoiceId,
          stripe_checkout_id: session.id,
          amount: session.amount_total / 100,
          currency: session.currency,
          status: "succeeded",
          method: "card",
          paid_at: new Date().toISOString(),
        });

        if (payErr) {
          console.error("❌ Error inserting payment:", payErr);
          await queueSystemEmail("❌ Stripe Checkout Payment Insert Error", JSON.stringify(payErr, null, 2));
        }

        // Update invoice (any table)
        const tables = ["club_booking_invoices", "club_invoices", "invoices"];
        let invoice = null;
        for (const table of tables) {
          const { data, error } = await supabase
            .from(table)
            .update({
              status: "paid",
              payment_method: "card",
              paid_at: new Date().toISOString(),
            })
            .eq("id", invoiceId)
            .select("id, user_id, total_usd, booking_id")
            .maybeSingle();

          if (data) {
            invoice = data;
            console.log(`✅ Invoice ${invoiceId} updated in ${table}`);
            break;
          }
        }

        if (invoice?.booking_id) {
          await supabase
            .from("venue_bookings")
            .update({ status: "confirmed" })
            .eq("id", invoice.booking_id);
          console.log(`🎯 Booking ${invoice.booking_id} confirmed`);
        }

        if (invoice?.user_id) {
          const { data: user, error: userErr } = await supabase
            .from("profiles_with_unpaid")
            .select("id, email, full_name")
            .eq("id", invoice.user_id)
            .single();
          if (!userErr && user) await queueReceiptEmail(user, invoice.total_usd, invoiceId);
          else await queueSystemEmail("⚠️ User Profile Fetch Failed", JSON.stringify(userErr, null, 2));
        }

        break;
      }

      default:
        console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    const msg = `🔥 Error processing webhook: ${error.message}\n${error.stack}`;
    console.error(msg);
    await queueSystemEmail("🔥 Stripe Webhook Fatal Error", msg);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
