// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl =
  Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// === Utils ===
const fmtUSD = (v) => `${Number(v || 0).toFixed(2)} USD`;
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

function formatMonthYearFrCap(value) {
  if (!value) return "Inconnu";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "Inconnu";
  const months = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

// === Template compiler: NO forced signature injection ===
function compileTemplate(templateHtml, invoice, payments = [], LOGO_URL, SIGNATURE_URL) {
  const total = Number(invoice.total || 0);
  const paid = Number(invoice.paid_total || 0);
  const balance = total - paid;
  const docTitle = paid > 0 ? "Reçu" : "Facture";

  // Build items table
  let itemsHTML = "";
  for (let i = 1; i <= 7; i++) {
    const desc = invoice[`description${i}`];
    const amt = invoice[`amount${i}`];
    if (desc && Number(amt) > 0) {
      itemsHTML += `<tr><td>${desc}</td><td style="text-align:right;">${fmtUSD(amt)}</td></tr>`;
    }
  }
  if (!itemsHTML) itemsHTML = `<tr><td colspan="2" style="text-align:center;">—</td></tr>`;

  // Payments table
  const hasPayments = Array.isArray(payments) && payments.length > 0;
  const paymentsRows = hasPayments
    ? payments.map(
        (p) => `
        <tr>
          <td>${fmtDate(p.created_at)}</td>
          <td>${p.method || "—"}</td>
          <td style="text-align:right;">${fmtUSD(p.amount)}</td>
        </tr>`
      ).join("")
    : "";

  const clientAddress =
    (invoice.address?.trim()) ||
    (invoice.client_address?.trim()) ||
    (invoice.billing_address?.trim()) || "—";

  // === Core replacements (keeps {{signature_url}} placeholder) ===
  let bodyHtml = templateHtml
    .replaceAll("{{doc_title}}", docTitle)
    .replaceAll("{{client_name}}", invoice.full_name || invoice.child_full_name || "—")
    .replace(/\{\{\s*client_address\s*\}\}/gi, clientAddress)
    .replaceAll("{{invoice_no}}", invoice.invoice_no || "—")
    .replaceAll("{{issued_at}}", fmtDate(invoice.issued_at))
    .replaceAll("{{due_date}}", fmtDate(invoice.due_date))
    .replaceAll("{{items}}", itemsHTML)
    .replaceAll("{{total}}", fmtUSD(total))
    .replaceAll("{{paid_total}}", fmtUSD(paid))
    .replaceAll("{{balance_due}}", fmtUSD(balance))
    .replaceAll(
      "{{payment_status}}",
      paid >= total && total > 0 ? "Payée" :
      paid > 0 ? "Partiellement payée" : "En attente"
    )
    .replaceAll("{{logo_url}}", LOGO_URL)
    .replaceAll("{{signature_url}}", SIGNATURE_URL);

  // Replace payments
  if (bodyHtml.includes("{{payments}}")) {
    bodyHtml = bodyHtml.replaceAll("{{payments}}", paymentsRows);
  }
  if (!hasPayments) {
    bodyHtml = bodyHtml.replace(
      /\s*<h3[^>]*>\s*Paiements enregistr[ée]s\s*<\/h3>\s*<table[\s\S]*?<\/table>/i,
      ""
    );
  }

  return bodyHtml;
}

// === Main ===
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log("🔔 generate-invoice-pdf invoked", body);
    const { invoice_id, force_regen } = body;
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "Missing invoice_id" }), {
        status: 400, headers: corsHeaders
      });
    }

    // Fetch invoice
    const { data: mainInvoice, error: invErr } = await supabase
      .from("invoices").select("*").eq("id", invoice_id).maybeSingle();
    if (invErr || !mainInvoice) throw new Error("Invoice not found");

    // Skip if already finalized
    if (mainInvoice?.pdf_url?.endsWith(".pdf") && !force_regen) {
      console.log("⏭️ Invoice already finalized, skipping regeneration.");
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // Assets
    const { data: logoUrlData } = await supabase.storage.from("assets").getPublicUrl("aquador.png");
    const { data: sigUrlData }  = await supabase.storage.from("assets").getPublicUrl("signature.png");
    const LOGO_URL      = logoUrlData?.publicUrl || "";
    const SIGNATURE_URL = sigUrlData?.publicUrl || "";

    // Family invoices
    const { data: childrenProfiles } = await supabase
      .from("profiles_with_unpaid").select("id").eq("parent_id", mainInvoice.user_id);
    const familyIds = [mainInvoice.user_id, ...(childrenProfiles?.map(c => c.id) || [])];

    const { data: familyInvoices } = await supabase
      .from("invoices").select("*").in("user_id", familyIds)
      .order("issued_at", { ascending: true });

    const { data: tmpl } = await supabase
      .from("invoice_template").select("body").eq("name", "Facture").maybeSingle();
    if (!tmpl) throw new Error("Template 'Facture' not found");

    // === CSS (keeps full white page, no extra signature styles)
    const styleBlock = `
      <style>
        @page { margin: 25.4mm 12.7mm; }
        html, body { margin: 0; padding: 0; background: #ffffff !important; }
        .page { display: flex; flex-direction: column; page-break-after: always; }
        .page:last-of-type { page-break-after: auto; }
        .page__content { display: flex; justify-content: center; }
        .invoice-card {
  background: #ffffff !important;
  width: 880px;
  transform: scale(1.58);        /* unified scaling */
  transform-origin: top center;
  margin: 0 auto;
  padding: 25mm 18mm 35mm 18mm;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  font-size: 1.1em;
  page-break-inside: avoid;
  overflow: visible;
  border-radius: 8px;
  box-shadow: none;
}

        .page * { max-width: 100%; }
        table, h1, h2, h3, p, div { page-break-inside: avoid; }
      </style>
    `;

    // Build full HTML
    let compiledHtml = styleBlock;
    for (let i = 0; i < (familyInvoices?.length || 0); i++) {
      const inv = familyInvoices[i];
      const { data: payments } = await supabase
        .from("payments")
        .select("amount, method, created_at")
        .eq("invoice_id", inv.id)
        .order("created_at", { ascending: true });

      compiledHtml += compileTemplate(tmpl.body, inv, payments || [], LOGO_URL, SIGNATURE_URL);
    }

    // Upload HTML to bucket
    const sanitizeFileName = (str) =>
      String(str || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_").replace(/[^\w\-./]/g, "");
    const safeClientName = sanitizeFileName(mainInvoice.full_name || "Client");
    const safeInvoiceNo  = sanitizeFileName(mainInvoice.invoice_no);
    const monthYear      = formatMonthYearFrCap(mainInvoice.month || mainInvoice.issued_at);
    const filename       = `${safeClientName}/${safeInvoiceNo}_${monthYear}.html`;

    const { error: uploadErr } = await supabase.storage
      .from("invoices")
      .upload(filename, new TextEncoder().encode(compiledHtml), {
        contentType: "text/html",
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = await supabase.storage.from("invoices").getPublicUrl(filename);
    const htmlPublicUrl = urlData?.publicUrl;

    await supabase.from("invoices").update({ pdf_url: htmlPublicUrl }).eq("id", invoice_id);

    // Trigger PDF generation
    try {
      const outputPath = filename.replace(/\.html$/, ".pdf");
      await fetch(`${supabaseUrl}/functions/v1/convert-html-to-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ html_path: filename, output_path: outputPath, invoice_id }),
      });
    } catch (e) {
      console.error("⚠️ convert-html-to-pdf trigger failed", e);
    }

    return new Response(
      JSON.stringify({ success: true, file_path: filename, public_url: htmlPublicUrl }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (err) {
    console.error("🔥 Generation failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders
    });
  }
});
