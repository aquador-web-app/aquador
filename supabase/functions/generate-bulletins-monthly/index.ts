// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeFileName } from "../shared/sanitize.ts";

const supabaseUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  try {
    console.log("🗓️ Monthly bulletin generation job running...");

    const body = await req.json().catch(() => ({}));
    const selectedMonth = body?.selected_month;

    const frMonths = [
      "Janvier",
      "Février",
      "Mars",
      "Avril",
      "Mai",
      "Juin",
      "Juillet",
      "Août",
      "Septembre",
      "Octobre",
      "Novembre",
      "Décembre",
    ];

    let targetDate: Date;

    if (selectedMonth) {
      targetDate = new Date(`${selectedMonth}T00:00:00`);
    } else {
      const today = new Date();
      targetDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    }

    if (Number.isNaN(targetDate.getTime())) {
      return new Response(
        JSON.stringify({ error: "Invalid selected_month" }),
        { status: 400 }
      );
    }

    const targetMonthLabel = `${frMonths[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

    console.log(`📅 Target bulletin month: ${targetMonthLabel}`);

    const { data: summaries, error } = await supabase
      .from("bulletin_monthly_summary")
      .select("id, student_name, pdf_url, month")
      .eq("month", targetMonthLabel)
      .is("pdf_url", null);
    if (error) throw error;

    if (!summaries?.length) {
      console.log("✅ No bulletins to generate this cycle.");
      return new Response("No bulletins to process", { status: 200 });
    }

    console.log(`🧾 Generating ${summaries.length} bulletins for ${targetMonthLabel}...`);

    // Loop through each student and call your PDF function internally
    const results = [];
    for (const s of summaries) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-bulletin-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ bulletin_id: s.id }),
        });

        const json = await res.json();
        results.push({ student: s.student_name, success: res.ok, url: json.pdf_url });
      } catch (err) {
        results.push({ student: s.student_name, success: false, error: err.message });
      }
    }

    console.table(results);
    console.log("✅ Monthly bulletin batch finished.");
    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    console.error("🔥 Error in generate-bulletins-monthly:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
