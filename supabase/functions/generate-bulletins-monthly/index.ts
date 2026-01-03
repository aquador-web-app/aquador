// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeFileName } from "../shared/sanitize.ts";

const supabaseUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async () => {
  try {
    console.log("🗓️ Monthly bulletin generation job running...");

    // Target the *previous* month (since it’s end-of-month data)
    const today = new Date();
    const targetMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 7); // yyyy-MM

    // Fetch all summaries for that month with no PDF yet
    const { data: summaries, error } = await supabase
      .from("bulletin_monthly_summary")
      .select("id, student_name, pdf_url")
      .ilike("month", `${targetMonth}%`)
      .is("pdf_url", null);
    if (error) throw error;

    if (!summaries?.length) {
      console.log("✅ No bulletins to generate this cycle.");
      return new Response("No bulletins to process", { status: 200 });
    }

    console.log(`🧾 Generating ${summaries.length} bulletins for ${targetMonth}...`);

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
