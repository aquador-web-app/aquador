// supabase/functions/generate-membership-invoice-pdf/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

// ======================================================
// CONFIG
// ======================================================
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PDF_SERVER = "https://puppeteer-server-bxx4.onrender.com/pdf";


// 🔥 USE YOUR REAL PAYMENTS TABLE
const PAYMENTS_TABLE = "club_membership_payments";

const supabase = createClient(supabaseUrl, supabaseService, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ======================================================
// HELPERS
// ======================================================
function nowHT() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
  );
}

function fmtDateFR(d) {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("fr-FR", {
    timeZone: "America/Port-au-Prince",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmt(n) {
  const num = Number(n ?? 0);
  return Number.isNaN(num) ? "0.00" : num.toFixed(2);
}

function escapeHTML(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitize(str) {
  return String(str || "client")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-./]/g, "");
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function todayStamp() {
  const d = nowHT();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${mm}${dd}`;
}

// ======================================================
// MAIN
// ======================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id)
      return new Response(JSON.stringify({ error: "Missing invoice_id" }),
        { status: 400, headers: corsHeaders });

    console.log("🔵 GENERATING CLUB INVOICE:", invoice_id);

    // --------------------------------------------------
    // LOAD INVOICE (YOUR REAL TABLE: club_invoices)
    // --------------------------------------------------
    const { data: invoice, error: invErr } = await supabase
      .from("club_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice)
      return new Response(JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: corsHeaders });

    // --------------------------------------------------
    // CLIENT INFO
    // --------------------------------------------------
    const clientName = invoice.client_email?.split("@")[0] || "Client";
    const safeName = sanitize(clientName);

    let invoiceNo = invoice.invoice_no || `${initials(clientName)}_${todayStamp()}`;
    const safeNo = sanitize(invoiceNo);

    // --------------------------------------------------
    // DESCRIPTION LINES (1..7)
    // --------------------------------------------------
    const descriptions = [];
    for (let i = 1; i <= 7; i++) {
      const desc = invoice[`description${i}`];
      const amt = invoice[`amount${i}`];
      if (desc && Number(amt) > 0) {
        descriptions.push({ description: desc, amount: Number(amt) });
      }
    }

    const itemsHTML = descriptions.length
      ? descriptions
          .map(
            (it) => `
          <tr>
            <td>${escapeHTML(it.description)}</td>
            <td style="text-align:right">USD ${fmt(it.amount)}</td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="2">—</td></tr>`;

    // --------------------------------------------------
    // PAYMENTS (club_membership_payments)
    // --------------------------------------------------
    const { data: payments } = await supabase
      .from(PAYMENTS_TABLE)
      .select("amount, method, paid_at, approved")
      .eq("invoice_id", invoice_id)
      .eq("approved", true)
      .order("paid_at");

    const showPayments = payments && payments.length > 0;

    const paymentsHTML = showPayments
      ? payments
          .map(
            (p) => `
        <tr>
          <td>${fmtDateFR(p.paid_at)}</td>
          <td>${escapeHTML(p.method)}</td>
          <td>USD ${fmt(p.amount)}</td>
        </tr>`
          )
          .join("")
      : "";

    // --------------------------------------------------
    // TOTALS
    // --------------------------------------------------
    const total = Number(invoice.total || 0);
    const paid = Number(invoice.paid_total || 0);
    const balance = total - paid;

    let paymentStatus = "En attente de paiement";
    if (paid >= total && total > 0) paymentStatus = "Payée";
    else if (paid > 0) paymentStatus = "Partiellement payée";

    // --------------------------------------------------
    // LOAD TEMPLATE
    // --------------------------------------------------
    const { data: tmpl } = await supabase
      .from("membership_invoice_template")
      .select("body")
      .eq("active", true)
      .limit(1)
      .single();

    if (!tmpl?.body)
      return new Response(JSON.stringify({ error: "Template missing" }),
        { status: 500, headers: corsHeaders });

    let html = tmpl.body;

    // --------------------------------------------------
    // LOGO & SIGNATURE
    // --------------------------------------------------
    const { data: logoData } = await supabase.storage
      .from("assets")
      .getPublicUrl("aquador.png");

    const { data: sigData } = await supabase.storage
      .from("assets")
      .getPublicUrl("signature.png");

    const LOGO = logoData?.publicUrl || "";
    const SIGN = sigData?.publicUrl || "";

    // --------------------------------------------------
    // REPLACE TOKENS
    // --------------------------------------------------
    html = html
      .replaceAll("{{logo_url}}", LOGO)
      .replaceAll("{{signature_url}}", SIGN)
      .replaceAll("{{client_name}}", escapeHTML(clientName))
      .replaceAll("{{invoice_no}}", escapeHTML(invoiceNo))
      .replaceAll("{{issued_at}}", fmtDateFR(invoice.issued_at || invoice.created_at))
      .replaceAll("{{due_date}}", fmtDateFR(invoice.due_date))
      .replaceAll("{{items}}", itemsHTML)
      .replaceAll("{{total}}", fmt(total))
      .replaceAll("{{paid_total}}", fmt(paid))
      .replaceAll("{{balance_due}}", fmt(balance))
      .replaceAll("{{payment_status}}", escapeHTML(paymentStatus))
      .replaceAll("{{payments}}", paymentsHTML);

    if (!showPayments)
      html = html.replace(/<div class="payments">[\s\S]*?<\/div>/i, "");


    // --------------------------------------------------
    // PDF GENERATION
    // --------------------------------------------------
    const pdfResp = await fetch(PDF_SERVER, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    html, // ✔ inline HTML, no URL
    options: {
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  }),
});

    if (!pdfResp.ok) {
      const text = await pdfResp.text();
      return new Response(JSON.stringify({ error: "PDF failed", details: text }),
        { status: 500, headers: corsHeaders });
    }

    const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());

    // --------------------------------------------------
    // UPLOAD PDF
    // --------------------------------------------------
    const pdfPath = `club/${safeName}/${safeNo}.pdf`;

    const { error: pdfErr } = await supabase.storage
      .from("club_invoices")
      .upload(pdfPath, pdfBytes, {
        upsert: true,
        contentType: "application/pdf",
      });

    if (pdfErr)
      return new Response(JSON.stringify({ error: pdfErr.message }),
        { status: 500, headers: corsHeaders });

    const { data: pdfURL } = await supabase.storage
      .from("club_invoices")
      .getPublicUrl(pdfPath);

    const pdfUrl = pdfURL?.publicUrl || null;

    // --------------------------------------------------
    // UPDATE INVOICE
    // --------------------------------------------------
    await supabase
      .from("club_invoices")
      .update({
        pdf_url: pdfUrl,
        invoice_no: invoiceNo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice_id);

        // --------------------------------------------------
    // 🔔 QUEUE EMAIL (do NOT send directly, only push to email_queue)
    // --------------------------------------------------
    try {
      // Load email template
      const { data: emailTpl } = await supabase
        .from("email_templates")
        .select("subject, body")
        .eq("name", "club_invoice_created")
        .single();

      if (emailTpl?.subject && emailTpl?.body && invoice.client_email) {
        let body = emailTpl.body;

        body = body
          .replace(/{{full_name}}/g, escapeHTML(clientName))
          .replace(/{{invoice_no}}/g, escapeHTML(invoiceNo))
          .replace(/{{total}}/g, fmt(total))
          .replace(/{{due_date}}/g, fmtDateFR(invoice.due_date))
          .replace(/{{pdf_url}}/g, pdfUrl || "");

        await supabase.from("email_queue").insert({
          user_id: invoice.customer_id,          // 1 membership = 1 main user
          email: invoice.client_email,
          subject: emailTpl.subject,
          body,
          status: "pending",
          kind: "club_invoice_notification",
          scheduled_at: new Date().toISOString(),
          attachment_url: pdfUrl,
        });
      }
    } catch (e) {
      console.error("Failed to queue club invoice email:", e);
      // Do NOT fail the function because of email failure
    }


  
    return new Response(
      JSON.stringify({ ok: true, pdf_url: pdfUrl, invoice_no: invoiceNo }),
      { status: 200, headers: corsHeaders }
    );

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: corsHeaders });
  }
});
