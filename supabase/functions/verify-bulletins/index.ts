// @ts-nocheck
// verify-bulletins.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL"),
  Deno.env.get("FUNCTION_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

serve(async () => {
  console.log("🔎 Verifying missing bulletin PDFs...");

  const today = new Date();
  const targetMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 7);

  const { data, error } = await supabase
    .from("bulletin_monthly_summary")
    .select("id, student_name")
    .ilike("month", `${targetMonth}%`)
    .is("pdf_url", null);

  if (error) throw error;
  if (!data?.length) return new Response("All bulletins OK ✅", { status: 200 });

  console.log(`⚠️ ${data.length} bulletins missing PDFs. Regenerating...`);
  for (const s of data) {
    await fetch(`${supabaseUrl}/functions/v1/generate-bulletin-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ bulletin_id: s.id }),
    });
  }

  return new Response(`Rebuilt ${data.length} missing bulletins`, { status: 200 });
});
