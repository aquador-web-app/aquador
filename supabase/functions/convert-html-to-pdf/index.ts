// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

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

const LOCAL_PDF_SERVER = "https://unmanly-hulkiest-tessa.ngrok-free.dev/pdf";

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    // =====================================================
    // 1️⃣ Parse payload (from generate-invoice-pdf)
    // =====================================================
    const { html_path, output_path, invoice_id } = await req.json();
    if (!html_path || !output_path || !invoice_id)
      return new Response(
        JSON.stringify({ error: "Missing html_path, output_path, or invoice_id" }),
        { status: 400, headers: corsHeaders }
      );

    // =====================================================
    // 2️⃣ Fetch invoice data for later use (email, etc.)
    // =====================================================
    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id, user_id, invoice_no, full_name, total, due_date, month")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !inv) throw new Error("Invoice not found");

    // =====================================================
    // 3️⃣ Download HTML directly from Storage
    // =====================================================
    console.log("📥 Downloading HTML from:", html_path);
    const { data: htmlFile, error: dlErr } = await supabase.storage
      .from("invoices")
      .download(html_path);
    if (dlErr) throw new Error("Failed to download HTML: " + dlErr.message);

    const htmlText = await htmlFile.text();

    // =====================================================
// 4️⃣ Send HTML to Puppeteer endpoint (URL-based)
// =====================================================
const { data: htmlUrlData } = await supabase.storage
  .from("invoices")
  .getPublicUrl(html_path);
const htmlUrl = htmlUrlData?.publicUrl;
if (!htmlUrl) throw new Error("Public URL for HTML not found");

console.log("🚀 Sending HTML URL to Puppeteer:", htmlUrl);

const pdfResponse = await fetch(LOCAL_PDF_SERVER, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${htmlUrl}?t=${Date.now()}`,
    options: {
      format: "A4",
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
    },
  }),
});

if (!pdfResponse.ok) {
  const errorText = await pdfResponse.text();
  throw new Error("Puppeteer render failed: " + errorText);
}

// Read PDF stream
const reader = pdfResponse.body.getReader();
const chunks = [];
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}
const totalLen = chunks.reduce((a, c) => a + c.length, 0);
console.log("📦 PDF buffer length:", totalLen);
const pdfBuffer = new Uint8Array(totalLen);
let offset = 0;
for (const c of chunks) {
  pdfBuffer.set(c, offset);
  offset += c.length;
}


    // =====================================================
    // 5️⃣ Upload generated PDF
    // =====================================================
    const pdfFileName = sanitizeFileName(output_path);
    const { error: uploadErr } = await supabase.storage
      .from("invoices")
      .upload(pdfFileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    // ✅ Get full public URL for the uploaded PDF
const { data: urlData } = await supabase.storage
  .from("invoices")
  .getPublicUrl(pdfFileName);

const pdfPublicUrl = urlData?.publicUrl;
if (!pdfPublicUrl) throw new Error("Could not resolve public URL for PDF");

console.log("✅ Generated public PDF URL:", pdfPublicUrl);

// ✅ Save the absolute URL in invoices table
await supabase
  .from("invoices")
  .update({ pdf_url: pdfPublicUrl })
  .eq("id", invoice_id);


    // =====================================================
    // 6️⃣ Delete old HTML file
    // =====================================================
    try {
      const { error: delErr } = await supabase.storage
        .from("invoices")
        .remove([html_path]);
      if (delErr) console.warn("⚠️ Failed to delete HTML:", delErr.message);
      else console.log("🧹 Deleted old HTML:", html_path);
    } catch (cleanupErr) {
      console.error("⚠️ HTML cleanup error:", cleanupErr.message);
    }

    // =====================================================
    // 7️⃣ Queue invoice email (optional, same as before)
    // =====================================================
    try {
      const { data: profile } = await supabase
        .from("profiles_with_unpaid")
        .select("email, full_name")
        .eq("id", inv.user_id)
        .maybeSingle();

      const { data: tmpl } = await supabase
        .from("email_templates")
        .select("subject, body")
        .eq("name", "invoice_notification")
        .maybeSingle();

      if (tmpl && profile?.email) {
        let emailBody = tmpl.body
          .replaceAll("{{full_name}}", inv.full_name || profile.full_name)
          .replaceAll("{{invoice_no}}", inv.invoice_no)
          .replaceAll("{{total}}", inv.total?.toFixed(2))
          .replaceAll(
            "{{due_date}}",
            new Date(inv.due_date).toLocaleDateString("fr-FR")
          )
          .replaceAll(
            "{{month}}",
            new Date(inv.month).toLocaleString("fr-FR", {
              month: "long",
              year: "numeric",
            })
          );

        emailBody += `<br><br><a href="${pdfPublicUrl}" target="_blank" style="background:#007BFF;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;">📄 Ouvrir ma facture</a>`;

        await supabase.from("email_queue").insert({
          email: profile.email,
          subject: tmpl.subject,
          body: emailBody,
          status: "pending",
          kind: "invoice_notification",
          invoice_id,
          attachment_url: pdfPublicUrl,
        });

        console.log("📨 Queued invoice email for:", profile.email);
      }
    } catch (mailErr) {
      console.error("⚠️ Email queue failed:", mailErr.message);
    }

    // =====================================================
    // ✅ Success
    // =====================================================
    return new Response(
      JSON.stringify({
        success: true,
        message: "✅ PDF generated, HTML deleted, email queued",
        pdf_public_url: pdfPublicUrl,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("❌ PDF conversion failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
