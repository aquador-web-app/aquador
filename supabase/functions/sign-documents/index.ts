// /supabase/functions/sign-documents/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const LOCAL_PDF_SERVER = "https://puppeteer-server-bxx4.onrender.com/pdf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function sanitizeFileName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w\-./]/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, full_name, documents } = await req.json();

    if (!user_id) throw new Error("Missing user_id");
    if (!full_name) throw new Error("Missing full_name");
    if (!Array.isArray(documents) || documents.length === 0)
      throw new Error("Missing documents array");

    const safeName = sanitizeFileName(full_name);
    const results = [];

    for (const doc of documents) {
      const form_name = String(doc.form_name || "").trim();
      const html = String(doc.html_content || "");

      if (!form_name || !html)
        throw new Error("Each document must have form_name and html_content");

      // ✅ SEND HTML DIRECTLY (THIS IS THE FIX)
      const res = await fetch(LOCAL_PDF_SERVER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          options: {
            format: "A4",
            printBackground: true,
            margin: { top: "1in", right: 0, bottom: 0, left: 0 },
          },
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const pdfBytes = new Uint8Array(await res.arrayBuffer());

      const pdfName = doc.output_path
        ? sanitizeFileName(doc.output_path)
        : `${safeName}/${sanitizeFileName(form_name)}_signed.pdf`;

      await supabase.storage
        .from("signed_docs")
        .upload(pdfName, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      const { data } = supabase.storage
        .from("signed_docs")
        .getPublicUrl(pdfName);

      if (!data?.publicUrl)
        throw new Error("Failed to get public PDF URL");

      results.push({ form_name, url: data.publicUrl });
      console.log("✅ Signed PDF uploaded:", data.publicUrl);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("🔥 sign-documents error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
