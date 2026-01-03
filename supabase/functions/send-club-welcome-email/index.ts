// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import { Resend } from "npm:resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// -----------------------------------------------------------------------------
// Supabase client using SERVICE ROLE
// -----------------------------------------------------------------------------
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// -----------------------------------------------------------------------------
// Helper: replace placeholders inside template.html
// -----------------------------------------------------------------------------
function applyTemplate(html, map) {
  let out = html;

  for (const key in map) {
    const value = map[key] ?? "";
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "gi");
    out = out.replace(regex, value);
  }

  return out;
}

// -----------------------------------------------------------------------------
// Main function
// -----------------------------------------------------------------------------
serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "authorization, content-type, apikey, x-client-info",
        },
      });
    }

    const { email, full_name, membership_type_label, plan_label, monthly_fee, group_names } =
      await req.json();

    if (!email) throw new Error("Missing `email`");
    if (!full_name) throw new Error("Missing `full_name`");

    // -------------------------------------------------------------------------
    // 1️⃣ Fetch template from email_templates
    // -------------------------------------------------------------------------
    const { data: tmpl, error: tmplErr } = await supabase
      .from("email_templates")
      .select("subject, body")
      .eq("name", "club_welcome")
      .maybeSingle();

    if (tmplErr) throw tmplErr;
    if (!tmpl) throw new Error("Template 'club_welcome' not found");

    // -------------------------------------------------------------------------
    // 2️⃣ Build replacement map
    // -------------------------------------------------------------------------
    const replacements = {
      full_name,
      membership_type_label: membership_type_label ?? "",
      plan_label: plan_label ?? "",
      monthly_fee: monthly_fee ?? "",
      group_names: group_names ?? "",
      login_url: "https://www.clubaquador.com/login",
      group_names_block:
      group_names?.trim()
        ? `• Membres inclus : <b>${group_names}</b><br>`
        : "",
    };

    const html = applyTemplate(tmpl.body, replacements);

    // -------------------------------------------------------------------------
    // 3️⃣ Send email via Resend
    // -------------------------------------------------------------------------
    const r = await resend.emails.send({
      from: "A'QUA D'OR <contact@clubaquador.com>",
      to: email,
      subject: tmpl.subject || "Votre adhésion au Club A'QUA D'OR est approuvée",
      html,
    });

    if (r.error) throw new Error(r.error.message);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("❌ send-club-acceptance-email error:", err);

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
