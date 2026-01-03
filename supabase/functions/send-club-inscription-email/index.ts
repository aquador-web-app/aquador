// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import { Resend } from "npm:resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

serve(async (req) => {
  try {
    const { email, full_name } = await req.json();

    if (!email) throw new Error("Missing email");

    // 🔵 1. Fetch template from email_templates
    const { data: tmpl, error: tmplErr } = await supabase
      .from("email_templates")
      .select("subject, body")
      .eq("name", "club_inscription")
      .single();

    if (tmplErr || !tmpl)
      throw new Error("Template 'club_inscription' not found in email_templates");

    let html = tmpl.body;
    let subject = tmpl.subject || "Inscription Reçue";

    // 🔵 2. Replace placeholders inside template
    html = html
      .replaceAll("{{full_name}}", full_name || "")
      .replaceAll("{{email}}", email || "")
      .replaceAll("{{login_url}}", "https://www.clubaquador.com/login");

    // 🔵 3. Send email
    await resend.emails.send({
      from: "A'QUA D'OR <contact@clubaquador.com>",
      to: email,
      subject,
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});
