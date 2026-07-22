// supabase/functions/generate-membership-invoice-pdf/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PDF_SERVER = "https://puppeteer-server-bxx4.onrender.com/pdf";
const PAYMENTS_TABLE = "club_membership_payments";

const supabase = createClient(supabaseUrl, supabaseService, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function nowHT() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Port-au-Prince",
    })
  );
}

function fmtDateFR(value) {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);

  return date.toLocaleDateString("fr-FR", {
    timeZone: "America/Port-au-Prince",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmt(value) {
  const number = Number(value ?? 0);
  return Number.isNaN(number) ? "0.00" : number.toFixed(2);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitize(value) {
  return String(value || "client")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-./]/g, "");
}

function initials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function todayStamp() {
  const date = nowHT();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}${month}${day}`;
}

function relationLabel(relation) {
  const normalized = String(relation || "").toLowerCase();

  if (normalized === "spouse") return "Conjoint(e)";
  if (normalized === "child") return "Enfant";
  if (normalized === "parent") return "Parent";
  if (normalized === "sibling") return "Frère / sœur";
  if (normalized === "other") return "Autre";

  return relation || "Utilisateur additionnel";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: "Missing invoice_id" }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log("🔵 GENERATING CLUB MEMBERSHIP INVOICE:", invoice_id);

    const { data: invoice, error: invoiceError } = await supabase
      .from("club_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({
          error: "Invoice not found",
          details: invoiceError?.message || null,
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    const memberId = invoice.customer_id || invoice.membership_id;

    const { data: member, error: memberError } = await supabase
      .from("club_profiles")
      .select(`
        id,
        auth_user_id,
        main_full_name,
        email,
        address,
        plan_code,
        membership_type,
        base_monthly_fee_usd,
        total_monthly_fee_usd,
        is_couple,
        has_swim_school_kids
      `)
      .eq("id", memberId)
      .single();

    if (memberError || !member) {
      return new Response(
        JSON.stringify({
          error: "Club member not found",
          details: memberError?.message || null,
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    const { data: additionalUsers, error: familyError } = await supabase
      .from("club_profile_families")
      .select(`
        id,
        full_name,
        relation,
        birth_date,
        phone,
        monthly_fee_usd
      `)
      .eq("club_profile_id", member.id)
      .order("created_at", { ascending: true });

    if (familyError) {
      console.error("Could not load additional Club users:", familyError);
    }

    const clientName = member.main_full_name || "Membre Club";
    const clientEmail = member.email || invoice.client_email || "";
    const clientAddress = member.address || "—";

    const membershipLabel = [member.plan_code, member.membership_type]
      .filter(Boolean)
      .join(" — ") || "Adhésion Club";

    const safeName = sanitize(clientName);
    const invoiceNo =
      invoice.invoice_no || `${initials(clientName)}_${todayStamp()}`;
    const safeNo = sanitize(invoiceNo);

    const total = Number(invoice.total || 0);
    const paid = Number(invoice.paid_total || 0);
    const balance = total - paid;

    // --------------------------------------------------
// INVOICE ITEMS — USE ONLY WHAT IS STORED ON INVOICE
// --------------------------------------------------
const detailedItems = [];

for (let i = 1; i <= 7; i += 1) {
  const description = String(
    invoice[`description${i}`] || ""
  ).trim();

  const amount = Number(invoice[`amount${i}`] || 0);

  if (description) {
    detailedItems.push({
      description,
      amount,
    });
  }
}

    const itemsHTML = detailedItems.length
      ? detailedItems
          .map(
            (item) => `
              <tr>
                <td>${escapeHTML(item.description)}</td>
                <td style="text-align:right">
                  USD ${fmt(item.amount)}
                </td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="2">—</td></tr>`;

    const { data: payments, error: paymentsError } = await supabase
      .from(PAYMENTS_TABLE)
      .select("amount, method, paid_at, approved")
      .eq("invoice_id", invoice_id)
      .eq("approved", true)
      .order("paid_at", { ascending: true });

    if (paymentsError) {
      console.error("Could not load membership payments:", paymentsError);
    }

    const showPayments = Array.isArray(payments) && payments.length > 0;

    const paymentsHTML = showPayments
      ? payments
          .map(
            (payment) => `
              <tr>
                <td>${fmtDateFR(payment.paid_at)}</td>
                <td>${escapeHTML(payment.method || "—")}</td>
                <td>USD ${fmt(payment.amount)}</td>
              </tr>
            `
          )
          .join("")
      : "";

    let paymentStatus = "En attente de paiement";
    let docTitle = "Facture";

    if (paid >= total && total > 0) {
      paymentStatus = "Payée";
      docTitle = "Reçu Club";
    } else if (paid > 0) {
      paymentStatus = "Partiellement payée";
      docTitle = "Reçu Club (partiel)";
    }

    const { data: template, error: templateError } = await supabase
  .from("membership_invoice_template")
  .select("body")
  .eq("active", true)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (templateError || !template?.body) {
  return new Response(
    JSON.stringify({
      error: "Template missing",
      details:
        templateError?.message ||
        "No active membership invoice template was found",
    }),
    {
      status: 500,
      headers: corsHeaders,
    }
  );
}

const templateHtml = template.body;

    const { data: logoData } = supabase.storage
      .from("assets")
      .getPublicUrl("aquador.png");

    const { data: signatureData } = supabase.storage
      .from("assets")
      .getPublicUrl("signature.png");

    const logoUrl = logoData?.publicUrl || "";
    const signatureUrl = signatureData?.publicUrl || "";

    let html = templateHtml
      .replaceAll("{{logo_url}}", logoUrl)
      .replaceAll("{{signature_url}}", signatureUrl)
      .replaceAll("{{doc_title}}", escapeHTML(docTitle))
      .replaceAll("{{client_name}}", escapeHTML(clientName))
      .replaceAll("{{client_email}}", escapeHTML(clientEmail))
      .replaceAll("{{client_address}}", escapeHTML(clientAddress))
      .replaceAll("{{membership_label}}", escapeHTML(membershipLabel))
      .replaceAll("{{invoice_no}}", escapeHTML(invoiceNo))
      .replaceAll(
        "{{issued_at}}",
        fmtDateFR(invoice.issued_at || invoice.created_at)
      )
      .replaceAll("{{due_date}}", fmtDateFR(invoice.due_date))
      .replaceAll("{{month}}", fmtDateFR(invoice.month))
      .replaceAll("{{items}}", itemsHTML)
      .replaceAll("{{total}}", fmt(total))
      .replaceAll("{{paid_total}}", fmt(paid))
      .replaceAll("{{balance_due}}", fmt(balance))
      .replaceAll("{{payment_status}}", escapeHTML(paymentStatus))
      .replaceAll("{{payments}}", paymentsHTML);

    if (!showPayments) {
      html = html.replace(
        /<div class="payments">[\s\S]*?<\/div>/i,
        ""
      );
    }

    const pdfResponse = await fetch(PDF_SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        options: {
          format: "A4",
          printBackground: true,
          margin: {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          },
        },
      }),
    });

    if (!pdfResponse.ok) {
      const details = await pdfResponse.text();

      return new Response(
        JSON.stringify({
          error: "PDF failed",
          details,
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    const pdfBytes = new Uint8Array(
      await pdfResponse.arrayBuffer()
    );

    const pdfPath = `membership/${safeName}/${safeNo}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("club_invoices")
      .upload(pdfPath, pdfBytes, {
        upsert: true,
        contentType: "application/pdf",
        cacheControl: "0",
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    const { data: pdfData } = supabase.storage
      .from("club_invoices")
      .getPublicUrl(pdfPath);

    const pdfUrl = pdfData?.publicUrl || null;

    const { error: updateError } = await supabase
      .from("club_invoices")
      .update({
        pdf_url: pdfUrl,
        invoice_no: invoiceNo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice_id);

    if (updateError) {
      console.error("Could not update invoice PDF URL:", updateError);
    }

    try {
      const { data: emailTemplate } = await supabase
        .from("email_templates")
        .select("subject, body")
        .eq("name", "club_invoice_created")
        .single();

      if (
        emailTemplate?.subject &&
        emailTemplate?.body &&
        clientEmail
      ) {
        let emailBody = emailTemplate.body
          .replace(/{{full_name}}/g, escapeHTML(clientName))
          .replace(/{{invoice_no}}/g, escapeHTML(invoiceNo))
          .replace(/{{total}}/g, fmt(total))
          .replace(/{{due_date}}/g, fmtDateFR(invoice.due_date))
          .replace(/{{pdf_url}}/g, pdfUrl || "");

        await supabase.from("email_queue").insert({
          user_id: member.auth_user_id || invoice.customer_id,
          email: clientEmail,
          subject: emailTemplate.subject,
          body: emailBody,
          status: "pending",
          kind: "club_invoice_notification",
          scheduled_at: new Date().toISOString(),
          attachment_url: pdfUrl,
        });
      }
    } catch (emailError) {
      console.error("Failed to queue Club invoice email:", emailError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pdf_url: pdfUrl,
        invoice_no: invoiceNo,
        items: detailedItems,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error?.message || String(error),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});