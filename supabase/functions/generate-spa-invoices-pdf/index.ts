// supabase/functions/generate-spa-invoices-pdf/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PDF_SERVER =
  Deno.env.get("PDF_SERVER_URL") ||
  "https://puppeteer-server-bxx4.onrender.com/pdf";

const SPA_INVOICE_BUCKET = "spa_invoices";
const HAITI_TIME_ZONE = "America/Port-au-Prince";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeFileName(value: unknown) {
  return String(value || "client")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w\-./]/g, "");
}

function formatMoney(value: unknown) {
  return Number(value || 0).toFixed(2);
}

function formatDateFr(value: unknown) {
  if (!value) return "—";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return "—";

  const formatted = new Intl.DateTimeFormat("fr-FR", {
    timeZone: HAITI_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatTimeFr(value: unknown) {
  if (!value) return "—";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: HAITI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateTimeFr(value: unknown) {
  if (!value) return "—";

  return `${formatDateFr(value)} à ${formatTimeFr(value)}`;
}

function getHaitiDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HAITI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const result: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return {
    year: result.year,
    month: result.month,
    day: result.day,
  };
}

function generateInvoiceNumber(invoice: any) {
  if (invoice.invoice_no) {
    return invoice.invoice_no;
  }

  const { year, month, day } = getHaitiDateParts();

  const suffix = String(invoice.id || "")
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase();

  return `SPA-${year}${month}${day}-${suffix}`;
}

function getReservationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "En attente",
    payment_review: "Paiement en vérification",
    confirmed: "Confirmée",
    completed: "Terminée",
    cancelled: "Annulée",
    expired: "Expirée",
    no_show: "Absence",
  };

  return labels[status] || status || "—";
}

function getPaymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "En attente",
    unpaid: "Non payée",
    pending_review: "En vérification",
    partial: "Partiellement payée",
    paid: "Payée",
    rejected: "Rejetée",
    refunded: "Remboursée",
    cancelled: "Annulée",
  };

  return labels[status] || status || "Non payée";
}

function getPaymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    cash: "Espèces",
    card: "Carte",
    transfer: "Virement",
    bank_transfer: "Virement",
    moncash: "MonCash",
    natcash: "NatCash",
    other: "Autre",
  };

  return labels[method] || method || "—";
}

function replaceToken(
  html: string,
  token: string,
  value: unknown
) {
  return html.replaceAll(
    `{{${token}}}`,
    String(value ?? "")
  );
}

function buildItemsHtml(appointments: any[]) {
  if (!appointments?.length) {
    return `
      <tr>
        <td colspan="4" style="text-align:center; color:#78716c;">
          Aucun massage associé à cette facture.
        </td>
      </tr>
    `;
  }

  return appointments
    .map((appointment) => {
      const serviceName =
        appointment.massage_services?.name ||
        appointment.service?.name ||
        appointment.service_name ||
        "Massage";

      const beneficiary =
        appointment.customer_name ||
        appointment.guest_name ||
        "Client";

      const duration =
        appointment.massage_service_options?.duration_minutes ??
        appointment.option?.duration_minutes ??
        appointment.duration_minutes;

      const amount = Number(
        appointment.price_usd ??
          appointment.massage_service_options?.price_usd ??
          appointment.option?.price_usd ??
          0
      );

      return `
        <tr>
          <td>
            <div class="service-name">
              ${escapeHtml(serviceName)}
            </div>
          </td>

          <td class="beneficiary">
            ${escapeHtml(beneficiary)}
          </td>

          <td class="duration">
            ${
              duration
                ? `${escapeHtml(duration)} minutes`
                : "—"
            }
          </td>

          <td class="amount">
            USD ${formatMoney(amount)}
          </td>
        </tr>
      `;
    })
    .join("");
}

function buildPaymentsHtml(payments: any[]) {
  if (!payments?.length) {
    return "";
  }

  return payments
    .map(
      (payment) => `
        <tr>
          <td>
            ${escapeHtml(formatDateFr(payment.paid_at))}
          </td>

          <td>
            ${escapeHtml(
              getPaymentMethodLabel(payment.method)
            )}
          </td>

          <td>
            ${escapeHtml(
              payment.reference ||
                payment.payment_reference ||
                "—"
            )}
          </td>

          <td>
            USD ${formatMoney(payment.amount)}
          </td>
        </tr>
      `
    )
    .join("");
}

async function loadSpaPayments(invoiceId: string) {
  /*
   * This function supports a future spa_payments table.
   *
   * Since the Spa payment table may not exist yet, an absent table
   * does not prevent the invoice PDF from being generated.
   */

  const { data, error } = await supabase
    .from("spa_payments")
    .select(
      `
      id,
      invoice_id,
      amount,
      method,
      reference,
      payment_reference,
      paid_at,
      approved
      `
    )
    .eq("invoice_id", invoiceId)
    .eq("approved", true)
    .order("paid_at", { ascending: true });

  if (error) {
    console.warn(
      "spa_payments unavailable; using invoice paid_total_usd:",
      error.message
    );

    return [];
  }

  return data || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed.",
      },
      405
    );
  }

  try {
    const payload = await req.json().catch(() => ({}));

    const invoiceId = payload?.invoice_id;

    if (!invoiceId) {
      return jsonResponse(
        {
          error: "Missing invoice_id.",
        },
        400
      );
    }

    console.log(
      "Generating Spa invoice PDF:",
      invoiceId
    );

    // --------------------------------------------------
    // 1. Load Spa invoice
    // --------------------------------------------------

    const {
      data: invoice,
      error: invoiceError,
    } = await supabase
      .from("spa_invoices")
      .select(
        `
        id,
        reservation_id,
        invoice_no,
        customer_name,
        customer_phone,
        customer_email,
        appointment_start,
        subtotal_usd,
        discount_usd,
        total_amount_usd,
        paid_total_usd,
        status,
        pdf_url,
        issued_at,
        due_date,
        created_at,
        updated_at
        `
      )
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error(
        "Spa invoice load error:",
        invoiceError
      );

      return jsonResponse(
        {
          error: "Spa invoice not found.",
          details: invoiceError?.message || null,
        },
        404
      );
    }

    // --------------------------------------------------
    // 2. Load reservation
    // --------------------------------------------------

    const {
      data: reservation,
      error: reservationError,
    } = await supabase
      .from("massage_reservations")
      .select(
        `
        id,
        primary_customer_name,
        primary_customer_phone,
        primary_customer_email,
        primary_customer_birth_date,
        people_count,
        appointment_start,
        status,
        payment_status,
        total_amount_usd,
        payment_reference,
        payment_proof_url,
        created_at
        `
      )
      .eq("id", invoice.reservation_id)
      .single();

    if (reservationError || !reservation) {
      console.error(
        "Spa reservation load error:",
        reservationError
      );

      return jsonResponse(
        {
          error: "Spa reservation not found.",
          details: reservationError?.message || null,
        },
        404
      );
    }

    // --------------------------------------------------
    // 3. Load all massages for the reservation
    // --------------------------------------------------

    const {
      data: appointments,
      error: appointmentsError,
    } = await supabase
      .from("massage_appointments")
      .select(
        `
        id,
        reservation_id,
        guest_number,
        customer_name,
        appointment_start,
        appointment_end,
        price_usd,
        status,

        massage_services:service_id (
          id,
          name
        ),

        massage_service_options:service_option_id (
          id,
          duration_minutes,
          price_usd
        ),

        massage_rooms:room_id (
          id,
          name
        )
        `
      )
      .eq("reservation_id", reservation.id)
      .order("guest_number", {
        ascending: true,
      });

    if (appointmentsError) {
      console.error(
        "Spa appointments load error:",
        appointmentsError
      );

      return jsonResponse(
        {
          error: "Unable to load Spa appointments.",
          details: appointmentsError.message,
        },
        500
      );
    }

    // --------------------------------------------------
    // 4. Load approved payments when available
    // --------------------------------------------------

    const payments = await loadSpaPayments(invoice.id);

    const paymentsTotal = payments.reduce(
      (sum, payment) =>
        sum + Number(payment.amount || 0),
      0
    );

    const storedPaidTotal = Number(
      invoice.paid_total_usd || 0
    );

    const paidTotal =
      payments.length > 0
        ? paymentsTotal
        : storedPaidTotal;

    const subtotal = Number(
      invoice.subtotal_usd ??
        reservation.total_amount_usd ??
        0
    );

    const discount = Number(
      invoice.discount_usd || 0
    );

    const total = Number(
      invoice.total_amount_usd ??
        reservation.total_amount_usd ??
        subtotal - discount
    );

    const balanceDue = Math.max(
      total - paidTotal,
      0
    );

    // --------------------------------------------------
    // 5. Determine document title and status
    // --------------------------------------------------

    const hasPayment = paidTotal > 0;

    const documentTitle = hasPayment
      ? "Reçu"
      : "Facture";

    let paymentStatus = getPaymentStatusLabel(
      invoice.status ||
        reservation.payment_status
    );

    if (paidTotal >= total && total > 0) {
      paymentStatus = "Payée";
    } else if (paidTotal > 0) {
      paymentStatus = "Partiellement payée";
    } else {
      paymentStatus = "Non payée";
    }

    // --------------------------------------------------
    // 6. Generate or reuse invoice number
    // --------------------------------------------------

    const finalInvoiceNo =
      generateInvoiceNumber(invoice);

    const issuedAt =
      invoice.issued_at ||
      new Date().toISOString();

    const appointmentStart =
      invoice.appointment_start ||
      reservation.appointment_start ||
      appointments?.[0]?.appointment_start ||
      null;

    // --------------------------------------------------
    // 7. Load active Spa invoice template
    // --------------------------------------------------

    const {
      data: template,
      error: templateError,
    } = await supabase
      .from("spa_invoice_template")
      .select(
        `
        id,
        name,
        html_template,
        is_active,
        updated_at
        `
      )
      .eq("is_active", true)
      .order("updated_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (
      templateError ||
      !template?.html_template
    ) {
      console.error(
        "Spa invoice template error:",
        templateError
      );

      return jsonResponse(
        {
          error:
            "No active Spa invoice template was found.",
          details: templateError?.message || null,
        },
        500
      );
    }

    // --------------------------------------------------
    // 8. Public logo and signature URLs
    // --------------------------------------------------

    const { data: logoData } =
      supabase.storage
        .from("assets")
        .getPublicUrl("aquador.png");

    const { data: signatureData } =
      supabase.storage
        .from("assets")
        .getPublicUrl("signature.png");

    const logoUrl =
      logoData?.publicUrl || "";

    const signatureUrl =
      signatureData?.publicUrl || "";

    // --------------------------------------------------
    // 9. Compile HTML
    // --------------------------------------------------

    const clientName =
      invoice.customer_name ||
      reservation.primary_customer_name ||
      "Client Spa";

    const clientPhone =
      invoice.customer_phone ||
      reservation.primary_customer_phone ||
      "—";

    const clientEmail =
      invoice.customer_email ||
      reservation.primary_customer_email ||
      "—";

    const peopleCount =
      reservation.people_count ||
      appointments?.length ||
      1;

    const itemsHtml =
      buildItemsHtml(appointments || []);

    const paymentsHtml =
      buildPaymentsHtml(payments || []);

    const paymentsSectionHtml =
      hasPayment && paymentsHtml
    ? `
      <div class="payments">
        <h3>Paiements enregistrés</h3>

        <table class="payments">
          <thead>
            <tr>
              <th>Date</th>
              <th>Méthode</th>
              <th>Référence</th>
              <th>Montant</th>
            </tr>
          </thead>

          <tbody>
            ${paymentsHtml}
          </tbody>
        </table>
      </div>
    `
    : "";

    let html = template.html_template;

    html = replaceToken(
      html,
      "logo_url",
      logoUrl
    );

    html = replaceToken(
      html,
      "signature_url",
      signatureUrl
    );

    html = replaceToken(
      html,
      "doc_title",
      documentTitle
    );

    html = replaceToken(
      html,
      "invoice_no",
      escapeHtml(finalInvoiceNo)
    );

    html = replaceToken(
      html,
      "issued_at",
      escapeHtml(formatDateFr(issuedAt))
    );

    html = replaceToken(
      html,
      "client_name",
      escapeHtml(clientName)
    );

    html = replaceToken(
      html,
      "client_phone",
      escapeHtml(clientPhone)
    );

    html = replaceToken(
      html,
      "client_email",
      escapeHtml(clientEmail)
    );

    html = replaceToken(
      html,
      "people_count",
      escapeHtml(peopleCount)
    );

    html = replaceToken(
      html,
      "payment_reference",
      escapeHtml(
        reservation.payment_reference || "—"
      )
    );

    html = replaceToken(
      html,
      "appointment_date",
      escapeHtml(
        formatDateFr(appointmentStart)
      )
    );

    html = replaceToken(
      html,
      "appointment_time",
      escapeHtml(
        formatTimeFr(appointmentStart)
      )
    );

    html = replaceToken(
      html,
      "reservation_status",
      escapeHtml(
        getReservationStatusLabel(
          reservation.status
        )
      )
    );

    html = replaceToken(
      html,
      "items",
      itemsHtml
    );

    html = replaceToken(
      html,
      "subtotal",
      formatMoney(subtotal)
    );

    html = replaceToken(
      html,
      "discount",
      formatMoney(discount)
    );

    html = replaceToken(
      html,
      "total",
      formatMoney(total)
    );

    html = replaceToken(
      html,
      "paid_total",
      formatMoney(paidTotal)
    );

    html = replaceToken(
      html,
      "balance_due",
      formatMoney(balanceDue)
    );

    html = replaceToken(
      html,
      "payment_status",
      escapeHtml(paymentStatus)
    );

    html = replaceToken(
      html,
      "payments_section",
      paymentsSectionHtml
    );

    // Remove discount row when no discount exists.
    if (discount <= 0) {
      html = html.replace(
        /<tr[^>]*class=["'][^"']*discount-row[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi,
        ""
      );
    }

    // Remove any remaining conditional-template syntax.
    html = html
      .replace(/{{#if[^}]*}}/g, "")
      .replace(/{{\/if}}/g, "");

    // Detect unresolved tokens before generating the PDF.
    const unresolvedTokens =
      html.match(/{{[^{}]+}}/g);

    if (unresolvedTokens?.length) {
      console.warn(
        "Unresolved Spa invoice tokens:",
        unresolvedTokens
      );

      html = html.replace(
        /{{[^{}]+}}/g,
        ""
      );
    }

    // --------------------------------------------------
    // 10. Generate PDF
    // --------------------------------------------------

    const pdfResponse = await fetch(
      PDF_SERVER,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          html,
          options: {
            format: "A4",
            printBackground: true,
            preferCSSPageSize: true,
            margin: {
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            },
          },
        }),
      }
    );

    if (!pdfResponse.ok) {
      const details =
        await pdfResponse.text();

      console.error(
        "Spa PDF server error:",
        details
      );

      return jsonResponse(
        {
          error: "PDF generation failed.",
          details,
        },
        500
      );
    }

    const contentType =
      pdfResponse.headers.get("content-type");

    if (
      contentType &&
      !contentType.includes("application/pdf")
    ) {
      const details =
        await pdfResponse.text();

      console.error(
        "Unexpected PDF response:",
        contentType,
        details
      );

      return jsonResponse(
        {
          error:
            "The PDF server returned an invalid response.",
          details,
        },
        500
      );
    }

    const pdfBytes = new Uint8Array(
      await pdfResponse.arrayBuffer()
    );

    if (!pdfBytes.length) {
      return jsonResponse(
        {
          error:
            "The generated PDF file is empty.",
        },
        500
      );
    }

    // --------------------------------------------------
    // 11. Upload to spa_invoices bucket
    // --------------------------------------------------

    const safeClientName =
      sanitizeFileName(clientName);

    const safeInvoiceNo =
      sanitizeFileName(finalInvoiceNo);

    const appointmentYear =
      appointmentStart
        ? new Intl.DateTimeFormat("en-US", {
            timeZone: HAITI_TIME_ZONE,
            year: "numeric",
          }).format(
            new Date(appointmentStart)
          )
        : getHaitiDateParts().year;

    const pdfPath =
      `${appointmentYear}/${safeClientName}/${safeInvoiceNo}.pdf`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from(SPA_INVOICE_BUCKET)
      .upload(
        pdfPath,
        pdfBytes,
        {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: true,
        }
      );

    if (uploadError) {
      console.error(
        "Spa PDF upload error:",
        uploadError
      );

      return jsonResponse(
        {
          error:
            "Unable to upload the Spa invoice PDF.",
          details: uploadError.message,
        },
        500
      );
    }

    // --------------------------------------------------
    // 12. Get public URL
    // --------------------------------------------------

    const { data: publicUrlData } =
      supabase.storage
        .from(SPA_INVOICE_BUCKET)
        .getPublicUrl(pdfPath);

    const pdfUrl =
      publicUrlData?.publicUrl;

    if (!pdfUrl) {
      return jsonResponse(
        {
          error:
            "Unable to resolve the Spa invoice public URL.",
        },
        500
      );
    }

    // --------------------------------------------------
    // 13. Update spa_invoices
    // --------------------------------------------------

    const {
      error: updateError,
    } = await supabase
      .from("spa_invoices")
      .update({
        invoice_no: finalInvoiceNo,
        customer_name: clientName,
        customer_phone:
          clientPhone === "—"
            ? null
            : clientPhone,
        customer_email:
          clientEmail === "—"
            ? null
            : clientEmail,
        appointment_start:
          appointmentStart,
        subtotal_usd: subtotal,
        discount_usd: discount,
        total_amount_usd: total,
        paid_total_usd: paidTotal,
        status:
          paidTotal >= total && total > 0
            ? "paid"
            : paidTotal > 0
            ? "partial"
            : invoice.status === "cancelled"
            ? "cancelled"
            : "unpaid",
        pdf_url: pdfUrl,
        issued_at: issuedAt,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", invoice.id);

    if (updateError) {
      console.error(
        "Spa invoice update error:",
        updateError
      );

      return jsonResponse(
        {
          error:
            "PDF created, but the Spa invoice record could not be updated.",
          details: updateError.message,
          pdf_url: pdfUrl,
          pdf_path: pdfPath,
        },
        500
      );
    }

    // --------------------------------------------------
    // 14. Return result
    // --------------------------------------------------

    return jsonResponse({
      ok: true,
      invoice_id: invoice.id,
      reservation_id:
        reservation.id,
      invoice_no:
        finalInvoiceNo,
      pdf_url: pdfUrl,
      pdf_path: pdfPath,
      total_amount_usd:
        Number(formatMoney(total)),
      paid_total_usd:
        Number(formatMoney(paidTotal)),
      balance_due_usd:
        Number(formatMoney(balanceDue)),
      document_title:
        documentTitle,
    });
  } catch (error) {
    console.error(
      "generate-spa-invoices-pdf failed:",
      error
    );

    return jsonResponse(
      {
        error:
          error?.message ||
          "Unexpected Spa invoice PDF error.",
      },
      500
    );
  }
});