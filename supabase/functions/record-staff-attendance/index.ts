// supabase/functions/record-staff-attendance/index.ts
// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function todayHaiti() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
  }).format(new Date());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { profile_id, mode, selected_date } = body;

    if (!profile_id) {
      return new Response(JSON.stringify({ error: "Missing profile_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const attended_on =
      typeof selected_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(selected_date)
        ? selected_date
        : todayHaiti();

    const now = new Date();

    // Optional: verify staff role (teacher/assistant/admin)
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", profile_id)
      .maybeSingle();

    if (profErr) throw profErr;
    if (!prof) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (!["teacher", "assistant", "admin"].includes(prof.role)) {
      return new Response(JSON.stringify({ error: "Not a staff profile" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Read existing staff attendance (unique per profile_id + attended_on)
    const { data: existing, error: existErr } = await supabase
      .from("staff_attendance")
      .select("id, status, check_in_time, check_out_time")
      .eq("profile_id", profile_id)
      .eq("attended_on", attended_on)
      .maybeSingle();

    if (existErr) throw existErr;

    async function upsertStaff(patch: Record<string, any>) {
      const payload = {
        profile_id,
        attended_on,
        ...patch,
      };
      const { error } = await supabase
        .from("staff_attendance")
        .upsert(payload, { onConflict: "profile_id,attended_on" });

      if (error) throw error;
    }

    let message = "";

    async function performCheckIn() {
      if (existing?.check_in_time) {
        message = "⚠️ Arrivée déjà marquée.";
        return;
      }
      await upsertStaff({
        status: "present",
        check_in_time: now.toISOString(),
      });
      message = existing ? "✅ Arrivée ajoutée." : "✅ Arrivée enregistrée.";
    }

    async function performCheckOut() {
      if (!existing) {
        await upsertStaff({
          status: "present",
          check_in_time: now.toISOString(),
          check_out_time: now.toISOString(),
        });
        message = "✅ Départ enregistré (nouvelle présence créée).";
        return;
      }
      if (existing.check_out_time) {
        message = "⚠️ Départ déjà marqué.";
        return;
      }
      await upsertStaff({
        status: existing.status || "present",
        check_in_time: existing.check_in_time ?? now.toISOString(),
        check_out_time: now.toISOString(),
      });
      message = "✅ Départ enregistré.";
    }

    if (mode === "check-in") {
      await performCheckIn();
    } else if (mode === "check-out") {
      await performCheckOut();
    } else {
      // default toggle
      if (!existing || !existing.check_in_time) await performCheckIn();
      else if (!existing.check_out_time) await performCheckOut();
      else message = "⚠️ Déjà marqué aujourd’hui (arrivée + départ).";
    }

    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("❌ Error in record-staff-attendance:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
