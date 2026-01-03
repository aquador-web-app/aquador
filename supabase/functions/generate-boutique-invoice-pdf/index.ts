// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeFileName } from "../shared/sanitize.ts";

const supabaseUrl =
  Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const LOCAL_PDF_SERVER = "https://puppeteer-server-bxx4.onrender.com/pdf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const fmtUSD = (v) => `${Number(v || 0).toFixed(2)} USD`;
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

function sanitizeFileName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w\-./]/g, "");
}

// === Template compiler ===
function compileTemplate(templateHtml, invoice, items, payments, LOGO_URL, SIGN_URL) {
  const total = Number(invoice.total || 0);
  const paid = Number(invoice.paid_total || 0);
  const balance = total - paid;
  const docTitle = paid >= total ? "Reçu Boutique" : "Facture Boutique";

  // === Items Table ===
  const itemsRows =
    items?.length
      ? items
          .map(
            (it) => `
          <tr>
            <td>${it.name} (x${it.qty})</td>
            <td style="text-align:right;">${fmtUSD(it.unit_price * it.qty)}</td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="2" style="text-align:center;">—</td></tr>`;

  // === Payments Table ===
  const hasPayments = payments && payments.length > 0;
  const fallbackPayment =
    invoice.status === "paid" &&
    !hasPayments &&
    (invoice.paid_total || invoice.total);

  const paymentsRows = hasPayments
    ? payments
        .map(
          (p) => `
        <tr>
          <td>${fmtDate(p.created_at)}</td>
          <td>${
            ["cash", "especes"].includes((p.method || "").toLowerCase())
              ? "Espèces"
              : ["virement", "transfer"].includes((p.method || "").toLowerCase())
              ? "Virement"
              : ["commission", "commissions"].includes(
                  (p.method || "").toLowerCase()
                )
              ? "Commissions"
              : "Stripe"
          }</td>
          <td style="text-align:right;">${fmtUSD(p.amount)}</td>
        </tr>`
        )
        .join("")
    : fallbackPayment
    ? `
        <tr>
          <td>${fmtDate(invoice.updated_at || invoice.created_at)}</td>
          <td>${
            ["cash", "especes"].includes(
              (invoice.payment_method || "").toLowerCase()
            )
              ? "Espèces"
              : ["virement", "transfer"].includes(
                  (invoice.payment_method || "").toLowerCase()
                )
              ? "Virement"
              : ["commission", "commissions"].includes(
                  (invoice.payment_method || "").toLowerCase()
                )
              ? "Commissions"
              : "Stripe"
          }</td>
          <td style="text-align:right;">${fmtUSD(
            invoice.paid_total || invoice.total
          )}</td>
        </tr>`
    : ""; // nothing shown if unpaid and no payments

  // === Replace base tokens ===
  let html = templateHtml
    .replaceAll("{{doc_title}}", docTitle)
    .replaceAll("{{client_name}}", invoice.full_name || "Client")
    .replaceAll("{{invoice_no}}", invoice.invoice_no || "—")
    .replaceAll("{{issued_at}}", fmtDate(invoice.created_at || invoice.issued_at))
    .replaceAll("{{due_date}}", fmtDate(invoice.due_date))
    .replaceAll("{{items}}", itemsRows)
    .replaceAll("{{total}}", fmtUSD(total))
    .replaceAll("{{paid_total}}", fmtUSD(paid))
    .replaceAll("{{balance_due}}", fmtUSD(balance))
    .replaceAll(
      "{{payment_status}}",
      invoice.status === "paid"
        ? "Payée"
        : invoice.status === "pending"
        ? "En attente"
        : "Annulée"
    )
    .replaceAll("{{client_address}}", invoice.client_address || "—")
    .replaceAll("{{payments}}", paymentsRows);

  // === Replace logo and signature URLs ===
  html = html.replace(
    /<img[^>]*alt=["']Logo A'?QUA D'?OR["'][^>]*>/i,
    `<img src="${LOGO_URL}" alt="Logo A'QUA D'OR" style="max-width:160px;margin:0 auto;display:block;">`
  );
  html = html.replaceAll(
    "{{logo_url}}",
    `<img src="${LOGO_URL}" style="max-width:160px;margin:0 auto;display:block;">`
  );
  // === Replace signature placeholder safely (URL only, not <img>)
html = html.replaceAll(
  "{{signature_url}}",
  SIGN_URL || ""
);


  // === Hide entire payment section if no payments ===
  if (!hasPayments && !fallbackPayment) {
    html = html.replace(/<h3[^>]*>\s*Paiements enregistrés\s*<\/h3>[\s\S]*?(<\/section>|<\/div>)/i, "");
  }

  // === Adjust invoice card style ===
  html = html.replace(
    /\.invoice-card\s*\{[\s\S]*?\}/,
    `.invoice-card {
      background: #ffffff !important;
      width: 880px;
      margin: 0 auto;
      padding: 26mm 20mm 38mm 20mm;
      font-size: 1.08em;
      page-break-inside: avoid;
      overflow: visible;
      border-radius: 8px;
      transform: scale(1.06);
      transform-origin: top center;
    }`
  );

  return html;
}


// === Main handler ===
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id)
      return new Response(JSON.stringify({ error: "Missing invoice_id" }), {
        status: 400,
        headers: corsHeaders,
      });

    console.log("🧾 Generating boutique invoice for:", invoice_id);

    // Fetch boutique invoice
    const { data: invoice, error: invErr } = await supabase
      .from("boutique_invoices")
      .select("*")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !invoice)
      throw new Error("Invoice not found in boutique_invoices");

    // Fetch payments depending on method
    let payments = [];
    if (invoice.payment_method === "commissions" || invoice.payment_method === "stripe") {
      payments = [
        {
          created_at: invoice.created_at,
          method: invoice.payment_method,
          amount: invoice.paid_total || invoice.total,
        },
      ];
    } else {
      const { data: paymentRows } = await supabase
        .from("boutique_payments")
        .select("amount, method, created_at")
        .eq("invoice_id", invoice_id)
        .order("created_at", { ascending: true });
      payments = paymentRows || [];
    }

    // Load template
    const { data: tmpl, error: tmplErr } = await supabase
      .from("boutique_invoice_template")
      .select("body")
      .eq("name", "facture_boutique")
      .maybeSingle();
    if (tmplErr || !tmpl) throw new Error("Template 'Facture' not found");

    // Fetch assets
    const { data: logoData } = await supabase.storage
      .from("assets")
      .getPublicUrl("aquador.png");
    const { data: sigData } = await supabase.storage
      .from("assets")
      .getPublicUrl("signature.png");
    const LOGO_URL = logoData?.publicUrl || "";
    const SIGN_URL = sigData?.publicUrl || "";

    // Fetch items
    const { data: items, error: itemsErr } = await supabase
      .from("boutique_invoice_items")
      .select("name, unit_price, qty")
      .eq("invoice_id", invoice_id);
    if (itemsErr) throw itemsErr;

    // Build HTML
    const compiledHtml = compileTemplate(tmpl.body, invoice, items, payments, LOGO_URL, SIGN_URL);

    const safeName = sanitizeFileName(invoice.full_name || "Client");
    const safeInvNo = sanitizeFileName(invoice.invoice_no || invoice.id);
    const pdfName = `${safeName}/${safeInvNo}.pdf`;

  

    // Convert to PDF via Puppeteer server
    const pdfResponse = await fetch(LOCAL_PDF_SERVER, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    html: compiledHtml,   // 🔥 INLINE HTML
    options: {
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  }),
});
    if (!pdfResponse.ok) throw new Error(await pdfResponse.text());

    // Combine PDF stream
    const reader = pdfResponse.body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const pdfBuffer = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      pdfBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Upload PDF
    const { error: pdfUploadErr } = await supabase.storage
      .from("boutique_invoices")
      .upload(pdfName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (pdfUploadErr) throw pdfUploadErr;

    // Get PDF URL
    const { data: pdfUrlData } = await supabase.storage
      .from("boutique_invoices")
      .getPublicUrl(pdfName);
    const pdfUrl = pdfUrlData?.publicUrl;
    if (!pdfUrl) throw new Error("Failed to get public PDF URL");

    // Update invoice record
    await supabase.from("boutique_invoices").update({ pdf_url: pdfUrl }).eq("id", invoice_id);

    console.log("✅ PDF generated for boutique invoice:", pdfUrl);

    return new Response(JSON.stringify({ success: true, pdf_url: pdfUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("🔥 Boutique PDF generation failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
