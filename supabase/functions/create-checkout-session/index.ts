// supabase/functions/create-user/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import Stripe from "https://esm.sh/stripe@12.5.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

console.log("🚀 create-user function invoked at", new Date().toISOString());
console.log("SUPABASE_URL:", Deno.env.get("SUPABASE_URL"));
console.log("SUPABASE_SERVICE_ROLE_KEY prefix:", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.slice(0, 10));
console.log("SERVICE_ROLE_KEY prefix:", Deno.env.get("SERVICE_ROLE_KEY")?.slice(0, 10));


serve(async (req) => {
  try {
    const { invoice_id } = await req.json();

    const { data: invoice, error } = await supabase
      .from("club_booking_invoices")
      .select("id, final_amount_cents, client_email")
      .eq("id", invoice_id)
      .single();

    if (error || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
      });
    }

    const amount = invoice.final_amount_cents;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Réservation Club A’QUA D’OR",
              description: "Paiement de votre réservation",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: invoice.client_email,
      success_url: `${Deno.env.get("SITE_URL")}/invoice-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${Deno.env.get("SITE_URL")}/invoice-cancelled`,
    });

    // Store session data in DB
    await supabase.rpc("update_invoice_with_stripe_data", {
      p_invoice_id: invoice_id,
      p_session_id: session.id,
      p_payment_intent: session.payment_intent || null,
    });

    return new Response(
      JSON.stringify({ checkout_url: session.url }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Stripe session error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});