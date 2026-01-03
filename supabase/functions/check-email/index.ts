// /supabase/functions/check-email/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ exists: false }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error("Admin error:", error);
      return new Response(JSON.stringify({ exists: false }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const exists = data.users.some(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    return new Response(JSON.stringify({ exists }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-email error:", err);
    return new Response(JSON.stringify({ exists: false }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
