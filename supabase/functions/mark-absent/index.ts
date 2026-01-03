// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

// ========= DATE FORMAT (matches formatDateFrSafe) =========
function formatDateFr(ymd) {
  try {
    const d = new Date(ymd);
    if (isNaN(d)) return ymd;

    return d.toLocaleDateString("fr-FR", {
      weekday: undefined,
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch (e) {
    return ymd;
  }
}
// ===========================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { enrollment_id, attended_on, undo } = await req.json();

    if (!enrollment_id || !attended_on) {
      return new Response(
        JSON.stringify({
          error: "Missing enrollment_id or attended_on",
        }),
        { status: 400, headers: cors }
      );
    }

    const formattedDate = formatDateFr(attended_on);

    // 🔎 Load student info for notifications
    let studentName = "Un élève";
    let isFemale = false;

    try {
      const { data: info } = await supabase
        .from("enrollments")
        .select("profile_id, profiles(full_name, sex)")
        .eq("id", enrollment_id)
        .maybeSingle();

      if (info?.profiles?.full_name) studentName = info.profiles.full_name;
      if (info?.profiles?.sex?.toLowerCase().startsWith("f")) isFemale = true;
    } catch (e) {
      console.error("❌ student info error:", e);
    }

    // 1️⃣ UNDO → DELETE attendance row
    if (undo) {
      const { error: delErr } = await supabase
        .from("attendance")
        .delete()
        .eq("enrollment_id", enrollment_id)
        .eq("attended_on", attended_on);

      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 500,
          headers: cors,
        });
      }

      // 🔔 Notify admin: student will attend
      try {
        const notifText =
          "✅ " +
          studentName +
          " " +
          (isFemale ? "sera présente" : "sera présent") +
          " le " +
          formattedDate;

        await supabase.from("notifications").insert([
          {
            user_id: null,
            text: notifText,
            category: "attendance",
            date: new Date().toISOString(),
            read: false,
          },
        ]);
      } catch (e) {
        console.error("❌ undo notification error:", e);
      }

      return new Response(
        JSON.stringify({
          message: "✅ Absence annulée. Bandelette supprimée.",
        }),
        { headers: cors }
      );
    }

    // 2️⃣ MARK ABSENT (no marked_by here)
    const { error: upsertErr } = await supabase.from("attendance").upsert(
      [
        {
          enrollment_id,
          attended_on,
          status: "absent",
          check_in_time: null,
          check_out_time: null,
        },
      ],
      { onConflict: "enrollment_id,attended_on" }
    );

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: cors,
      });
    }

    // 🔔 Notify admin: absent
    try {
      const notifText =
        "🚨 " +
        studentName +
        " a été " +
        (isFemale ? "marquée absente" : "marqué absent") +
        " pour le " +
        formattedDate;

      await supabase.from("notifications").insert([
        {
          user_id: null,
          text: notifText,
          category: "attendance",
          date: new Date().toISOString(),
          read: false,
        },
      ]);
    } catch (e) {
      console.error("❌ absent notification error:", e);
    }

    return new Response(
      JSON.stringify({ message: "✅ Absence marquée." }),
      { headers: cors }
    );
  } catch (e) {
    console.error("❌ mark-absent error:", e);
    return new Response(
      JSON.stringify({ error: e.message, stack: e.stack }),
      { status: 500, headers: cors }
    );
  }
});
