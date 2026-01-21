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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function todayHaiti() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Port-au-Prince" }).format(new Date());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { profile_id, mode, selected_date } = body;

    if (!profile_id) {
      return new Response(JSON.stringify({ error: "Missing profile_id" }), { status: 400, headers: corsHeaders });
    }

    const attended_on =
      typeof selected_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(selected_date)
        ? selected_date
        : todayHaiti();

    const now = new Date();

    // 1) Active enrollments for this profile
    const { data: enrollments, error: enrollErr } = await supabase
      .from("enrollments")
      .select("id, session_group")
      .eq("profile_id", profile_id)
      .eq("status", "active");

    if (enrollErr) throw enrollErr;
    if (!enrollments?.length) {
      return new Response(JSON.stringify({ error: "⚠️ Aucune inscription active trouvée pour cet élève." }), {
        status: 404, headers: corsHeaders,
      });
    }

// --- NEW RULE: Attendance blocked based on invoice status + Haiti date ---
const haitiNow = new Date(
  new Date().toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
);
const day = haitiNow.getDate();

// Find PARENT (invoices belong to parent, not child)
const { data: prof } = await supabase
  .from("profiles")
  .select("parent_id")
  .eq("id", profile_id)
  .maybeSingle();

const invoiceOwnerId = prof?.parent_id ?? profile_id;

// Only enforce after the 7th
if (day >= 8) {
  // Current month boundaries (Haiti)
  const monthStart = new Date(haitiNow.getFullYear(), haitiNow.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const monthEnd = new Date(haitiNow.getFullYear(), haitiNow.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("status, total, paid_total")
    .eq("user_id", invoiceOwnerId)
    .gte("issued_at", monthStart)
    .lte("issued_at", monthEnd);

  if (invErr) throw invErr;

  const list = invoices ?? [];

  const unpaid = list.some(
    (i) => i.status === "pending" && Number(i.paid_total) === 0
  );

  const partial = list.some(
    (i) =>
      i.status === "partial" ||
      (i.status === "pending" && Number(i.paid_total) > 0)
  );

  let block = false;

  if (day >= 8 && day <= 15 && unpaid) block = true;
  if (day >= 16 && (unpaid || partial)) block = true;

  if (block) {
    return new Response(
      JSON.stringify({
        error:
          "Merci de régler votre facture avant de pouvoir accéder au cours.",
      }),
      { status: 403, headers: corsHeaders }
    );
  }
}



    // 2) Find an ACTIVE session on attended_on among those enrollments
    let chosen: null | { enrollment_id: string; start_time: string } = null;

    for (const enr of enrollments) {
      const { data: s, error: sErr } = await supabase
        .from("sessions")
        .select("id, start_time, status")
        .eq("session_group", enr.session_group)
        .eq("start_date", attended_on)
        .eq("status", "active")
        .maybeSingle();
      if (sErr) throw sErr;
      if (s) {
        chosen = { enrollment_id: enr.id, start_time: s.start_time ?? "00:00" };
        break;
      }
    }

    if (!chosen) {
      // HARD BLOCK: no write
      return new Response(JSON.stringify({ error: "⚠️ Cet élève n’a pas de séance active ce jour-là." }), {
        status: 400, headers: corsHeaders,
      });
    }

    const { enrollment_id, start_time } = chosen;

    // 3) Compute punctuality
    const [hh, mm] = (start_time || "00:00").split(":").map(Number);
    const sessionStart = new Date(`${attended_on}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`);
    const decideStatus = () => (Math.floor((now.getTime() - sessionStart.getTime()) / 60000) <= 15 ? "present" : "late");

    // 4) Profile name (optional backfill)
    const { data: profile } = await supabase.from("profiles_with_unpaid").select("full_name").eq("id", profile_id).maybeSingle();
    const full_name = profile?.full_name ?? null;

    // --- SAFETY NET: re-check right before any write
    async function ensureHasSessionToday() {
      const { data, error } = await supabase
        .from("sessions")
        .select("id")
        .eq("status", "active")
        .eq("start_date", attended_on)
        .in(
          "session_group",
          enrollments.map((e) => e.session_group)
        );
      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    }

    // 5) Read existing (unique per enrollment+date)
    const { data: existing, error: existErr } = await supabase
      .from("attendance")
      .select("id, status, check_in_time, check_out_time")
      .eq("enrollment_id", enrollment_id)
      .eq("attended_on", attended_on)
      .maybeSingle();
    if (existErr) throw existErr;

    async function upsertAttendance(patch: Record<string, any>) {
      // Safety: do not write if there is no active session for that date
      const ok = await ensureHasSessionToday();
      if (!ok) {
        // No writes, hard fail
        throw new Error("NO_SESSION_TODAY");
      }
      const payload = {
        enrollment_id,
        attended_on,
        ...(full_name ? { full_name } : {}),
        ...patch,
      };
      const { error } = await supabase.from("attendance").upsert(payload, { onConflict: "enrollment_id,attended_on" });
      if (error) throw error;
    }

    let message = "";

    async function performCheckIn() {
      if (existing?.check_in_time) {
        message = "⚠️ Arrivée déjà marquée.";
        return;
      }
      await upsertAttendance({ status: decideStatus(), check_in_time: now.toISOString() });
      message = existing ? "✅ Check-in ajouté." : "✅ Check-in enregistré.";
    }

    async function performCheckOut() {
      if (!existing) {
        await upsertAttendance({
          status: decideStatus(),
          check_in_time: now.toISOString(),
          check_out_time: now.toISOString(),
        });
        message = "✅ Check-out enregistré (nouvelle présence créée).";
        return;
      }
      if (existing.check_out_time) {
        message = "⚠️ Déjà marqué aujourd’hui (arrivée + départ).";
        return;
      }
      await upsertAttendance({
        status: decideStatus(),
        check_in_time: existing.check_in_time ?? now.toISOString(),
        check_out_time: now.toISOString(),
      });
      message = "✅ Check-out enregistré.";
    }

    if (mode === "check-in") {
      await performCheckIn();
    } else if (mode === "check-out") {
      await performCheckOut();
    } else {
      if (!existing || !existing.check_in_time) await performCheckIn();
      else if (!existing.check_out_time) await performCheckOut();
      else message = "⚠️ Déjà marqué aujourd’hui (arrivée + départ).";
    }

    return new Response(JSON.stringify({ message }), { status: 200, headers: corsHeaders });
  } catch (err) {
    if (String(err?.message) === "NO_SESSION_TODAY") {
      return new Response(JSON.stringify({ error: "⚠️ Cet élève n’a pas de séance active ce jour-là." }), {
        status: 400, headers: corsHeaders,
      });
    }
    console.error("❌ Error in record-attendance:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
