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
    console.log("🗓️ Monthly fiche generation job running...");

    // Target the *previous* month
    const today = new Date();
    const targetMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 7); // yyyy-MM

    // === Fetch all fiches for that month without a generated PDF ===
    const { data: fiches, error } = await supabase
      .from("fiche_technique")
      .select("id, student_name, pdf_url, month")
      .ilike("month", `${targetMonth}%`)
      .is("pdf_url", null);

    if (error) throw error;

    if (!fiches?.length) {
      console.log("✅ No fiches to generate this cycle.");
      return new Response("No fiches to process", { status: 200 });
    }

    console.log(`🧾 Generating ${fiches.length} fiches techniques for ${targetMonth}...`);

    const results = [];

    for (const f of fiches) {
      try {
        // Call your `generate-fiche-pdf` Edge Function internally
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-fiche-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ fiche_id: f.id }),
        });

        const json = await res.json();
        results.push({
          student: f.student_name,
          success: res.ok,
          url: json.pdf_url || null,
          error: json.error || null,
        });

        if (res.ok) {
          console.log(`✅ Fiche generated for ${f.student_name}`);
        } else {
          console.warn(`⚠️ Fiche failed for ${f.student_name}: ${json.error}`);
        }
      } catch (err) {
        results.push({
          student: f.student_name,
          success: false,
          error: err.message,
        });
        console.error(`🔥 Error for ${f.student_name}:`, err.message);
      }
    }

    console.table(results);
    console.log("✅ Monthly fiche batch finished.");
    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    console.error("🔥 Error in generate-fiche-monthly:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});
