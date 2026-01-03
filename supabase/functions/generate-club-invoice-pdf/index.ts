  // supabase/functions/generate-club-invoice-pdf/index.ts
  // @ts-nocheck

  import "jsr:@supabase/functions-js/edge-runtime.d.ts";
  import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
  import { createClient } from "npm:@supabase/supabase-js";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseService, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  function parseLocalYMD(ymd) {
    if (!ymd) return null;

    // If it's full timestamp: "2025-11-25T00:00:00+00:00"
    const pure = String(ymd).split("T")[0];

    const [y, m, d] = pure.split("-").map(Number);

    return new Date(y, m - 1, d); // PERFECT LOCAL DATE
  }


  // --------------------------------------------
  // TIME FORMATTER (removes seconds)
  // --------------------------------------------
  function formatTime(t) {
    if (!t) return "—";

    if (!t.includes(":")) {
      // "10" → "10:00"
      return t.padStart(2, "0") + ":00";
    }

    let [hh, mm] = t.split(":");
    hh = hh.padStart(2, "0");
    mm = (mm || "00").padStart(2, "0");

    return `${hh}:${mm}`;
  }


  // --------------------------------------------
  // French date formatter — SAFE LOCAL (no UTC shift)
  // --------------------------------------------
  function formatDateFrSafe(input) {
    if (!input) return "—";

    let date;

    // If it's already a Date → DO NOT wrap again
    if (input instanceof Date) {
      date = input;
    } 
    // If YYYY-MM-DD → build LOCAL date
    else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const [y, m, d] = input.split("-");
      date = new Date(Number(y), Number(m) - 1, Number(d));
    } 
    // Fallback for full timestamps
    else {
      date = new Date(
        new Date(input).toLocaleString("en-US", {
          timeZone: "America/Port-au-Prince",
        })
      );
    }

    const str = date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    return str.charAt(0).toUpperCase() + str.slice(1);
  }



  // Puppeteer HTML → PDF server
  const PDF_SERVER = "https://puppeteer-server-bxx4.onrender.com/pdf";

  // CORS
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  function nowHT() {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
    );
  }

  function todayHTYMD() {
    const d = nowHT();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}${mm}${dd}`;
  }


  // Cleaning filename safely
  function sanitizeFileName(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^\w\-./]/g, "");
  }

  function initials(fullName) {
    return fullName
      .split(" ")
      .map((w) => w[0]?.toUpperCase())
      .join("");
  }

  // Formatters
  const fmtMoney = (n) => Number(n || 0).toFixed(2);
  const fmtDateFR = (d) =>
    d
      ? new Date(d).toLocaleDateString("fr-FR", {
          timeZone: "America/Port-au-Prince",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";


  serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
      const { invoice_id, trigger } = await req.json();

      if (!invoice_id) {
        return new Response(JSON.stringify({ error: "Missing invoice_id" }), {
          status: 400,
          headers: cors,
        });
      }

      console.log("🧾 generate-club-invoice-pdf for:", invoice_id);

      // --------------------------------------
      // 1) Load invoice
      // --------------------------------------
      const { data: invoice } = await supabase
        .from("club_booking_invoices")
        .select(
          `
          id,
          booking_id,
          amount_cents,
          discount_cents,
          final_amount_cents,
          invoice_no,
          client_email,
          created_at,
          updated_at
        `
        )
        .eq("id", invoice_id)
        .single();

        // 🔎 Fetch related booking to get correct date, time, quantity
  // --------------------------------------
  // 1b) Fetch booking and merge fields
  // --------------------------------------
  let booking = null;

  if (invoice?.booking_id) {
    const { data: b, error: bErr } = await supabase
      .from("venue_bookings")
      .select(
        "id, date, quantity, start_time, end_time, booking_type, full_name, email, title, venue"
      )
      .eq("id", invoice.booking_id)
      .single();

    if (!bErr && b) booking = b;
  }

  if (!booking) {
    return new Response(JSON.stringify({ error: "Booking not found" }), {
      status: 404,
      headers: cors,
    });
  }

  // Merge booking data into invoice so template sees correct info
  invoice.booking_date = booking.date;
  invoice.booking_quantity = booking.quantity;
  invoice.booking_start_time = booking.start_time;
  invoice.booking_end_time = booking.end_time;
  invoice.booking_type = booking.booking_type;
  invoice.booking_venue = booking.venue;
  invoice.full_name = booking.full_name || booking.title;

  // BEST POSSIBLE EMAIL FALLBACK (covers all DB variants)
  const bestEmail =
    invoice.client_email ||
    booking.email ||
    booking.contact_email ||
    booking.contact_email_text ||
    null;

  invoice.client_email = bestEmail;

  // Persist client_email back to DB if missing
  if (!invoice.client_email && bestEmail) {
    console.log("📧 Fixing missing client_email:", bestEmail);
    await supabase
      .from("club_booking_invoices")
      .update({ client_email: bestEmail })
      .eq("id", invoice.id);

    invoice.client_email = bestEmail;
  }


      if (!invoice)
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404,
          headers: cors,
        });

  


      // Compute invoice_no = initials_YYYYMMDD
      const invInitials = initials(booking.full_name);
      const invDate = todayHTYMD();
      const finalInvoiceNo = `${invInitials}_${invDate}`;

      // --------------------------------------
      // 3) Payments
      // --------------------------------------
      const { data: payments } = await supabase
        .from("club_payments")
        .select("amount, method, paid_at")
        .eq("invoice_id", invoice_id)
        .eq("approved", true)
        .order("paid_at", { ascending: true });

      const paid = (payments || []).reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );

      const total = Number(invoice.final_amount_cents || invoice.amount_cents) / 100;
      const balance = total - paid;

      // --------------------------------------
      // Due date = 15 days before booking.date
      // --------------------------------------
      const eventDate = parseLocalYMD(booking.date);
      let dueDate = new Date(eventDate.getTime() - 15 * 86400000);
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
  );


  // If due date already passed → set to today
  if (dueDate < today) {
    dueDate = today;
  }


      // --------------------------------------
      // Payment status
      // --------------------------------------
      let paymentStatus = "En attente de paiement";
      let docTitle = "Facture Club";

      if (paid >= total && total > 0) {
        paymentStatus = "Payée";
        docTitle = "Reçu Club";
      } else if (paid > 0 && paid < total) {
        paymentStatus = "Partiellement payée";
        docTitle = "Reçu Club (partiel)";
      }

      // --------------------------------------
      // 4) Load template
      // --------------------------------------
      const { data: template } = await supabase
        .from("club_invoice_template")
        .select("body")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (!template)
        return new Response(JSON.stringify({ error: "Template missing" }), {
          status: 500,
          headers: cors,
        });

      // --------------------------------------
      // Logo & signature URLs
      // --------------------------------------
      const { data: logoData } = await supabase.storage
        .from("assets")
        .getPublicUrl("aquador.png");
      const { data: sigData } = await supabase.storage
        .from("assets")
        .getPublicUrl("signature.png");

      const LOGO_URL = logoData?.publicUrl || "";
      const SIGN_URL = sigData?.publicUrl || "";

      // --------------------------------------
      // 5) Build special booking tokens
      // --------------------------------------
      const booking_type_label =
    booking.booking_type === "full"
      ? "Réservation complète"
      : booking.booking_type === "daypass"
      ? "Day pass"
      : booking.booking_type || "—";
      const quantity = Number(booking.quantity ?? 0);
      const booking_date = formatDateFrSafe(parseLocalYMD(booking.date));
      const booking_time = `${formatTime(booking.start_time)} → ${formatTime(booking.end_time)}`;


    
// --------------------------------------
// Amounts
// --------------------------------------

// base amount BEFORE discount (always original price)
const base_amount = fmtMoney(Number(invoice.amount_cents || 0) / 100);

// discount values
const hasDiscount =
  invoice.discount_cents && Number(invoice.discount_cents) > 0;

const discount = hasDiscount
  ? fmtMoney(Number(invoice.discount_cents) / 100)
  : "";

const discount_type = hasDiscount ? "Montant" : "";

// final amount AFTER discount
const final_amount = fmtMoney(Number(invoice.final_amount_cents || 0) / 100);


      // --------------------------------------
  // 6) Compile HTML (replace ALL tokens)
  // --------------------------------------
  let html = template.body
    .replaceAll("{{doc_title}}", docTitle)
    .replaceAll("{{client_name}}", booking.full_name)
    .replaceAll("{{client_email}}", invoice.client_email || booking.email)
    .replaceAll("{{invoice_no}}", finalInvoiceNo)
    .replaceAll("{{issued_at}}", fmtDateFR(nowHT()))
    .replaceAll("{{due_date}}", fmtDateFR(dueDate))

    // Booking tokens
    .replaceAll("{{booking_type_label}}", booking_type_label)
    .replaceAll("{{quantity}}", quantity)
    .replaceAll("{{booking_date}}", booking_date)
    .replaceAll("{{booking_time}}", booking_time)
    .replaceAll("{{base_amount}}", base_amount)
    .replaceAll("{{discount}}", discount)
    .replaceAll("{{discount_type}}", discount_type)
    .replaceAll("{{final_amount}}", final_amount)
    .replaceAll("{{booking_quantity}}", quantity)
    .replaceAll("{{booking_start_time}}", formatTime(booking.start_time))
    .replaceAll("{{booking_end_time}}", formatTime(booking.end_time))
    .replaceAll("{{booking_type}}", booking.booking_type)


      // 🔥 Additional date/time tokens fixes (in case template uses variants)
    .replaceAll("{{booking_date_local}}", booking_date)
    .replaceAll("{{date}}", booking_date)
    .replaceAll("{{booking.date}}", booking_date)
    .replaceAll("{{event_date}}", booking_date)
    .replaceAll("{{reservation_date}}", booking_date)
    .replaceAll("{{start_time}}", formatTime(booking.start_time))
    .replaceAll("{{end_time}}", formatTime(booking.end_time))


    // Summary tokens
    .replaceAll("{{total}}", fmtMoney(total))
    .replaceAll("{{paid_total}}", fmtMoney(paid))
    .replaceAll("{{balance_due}}", fmtMoney(balance))
    .replaceAll("{{payment_status}}", paymentStatus)

    // Payments table
    .replaceAll(
      "{{payments}}",
      payments
        .map(
          (p) => `
  <tr>
    <td>${fmtDateFR(p.paid_at)}</td>
    <td>${p.method}</td>
    <td>USD ${fmtMoney(p.amount)}</td>
  </tr>`
        )
        .join("")
    )

    // Logo + signature
    .replaceAll("{{logo_url}}", LOGO_URL)
    .replaceAll("{{signature_url}}", SIGN_URL);


      // Hide payments block if zero payments
  if (!payments || payments.length === 0) {
    html = html.replace(/<div class="payments">[\s\S]*?<\/div>/, "");
  }

  // --- CLEANUP BLOCK FIXED ---

  // Remove discount row ENTIRELY if no discount
  if (!hasDiscount) {
    html = html.replace(
      /<tr[^>]*discount-row[^>]*>[\s\S]*?<\/tr>/gi,
      ""
    );
  }

  // Remove Handlebars-style blocks
  html = html.replace(/{{#if[^}]*}}/g, "");
  html = html.replace(/{{\/if}}/g, "");


  // Replace {{items}} with empty string LAST
  html = html.replace("{{items}}", "");


  // Insert notice ONLY if unpaid (no payments)
if (!payments || payments.length === 0) {
  html = html.replace(
    "</div>\n  </div>",
    `<p style="font-size:0.85em; margin-top:6px;">Cette facture est valable pour 7 jours.</p>\n</div>\n  </div>`
  );
}

      // --------------------------------------
      // 7) Convert HTML → PDF
      // --------------------------------------
      const pdfResponse = await fetch(PDF_SERVER, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    html, // ✔ inline HTML, no URL needed
    options: {
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  }),
});

      if (!pdfResponse.ok) {
        const t = await pdfResponse.text();
        console.error("❌ PDF server error:", t);
        return new Response(JSON.stringify({ error: "PDF failed", details: t }), {
          status: 500,
          headers: cors,
        });
      }

      const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());

      console.log("PDF DEBUG:", {
    quantity,
    raw_quantity: booking.quantity,
    date: booking.date,
    booking_date,
  });

// --------------------------------------
// SAFE PATH COMPONENTS (REQUIRED)
// --------------------------------------
const safeName = sanitizeFileName(booking.full_name || "client");
const safeInvNo = sanitizeFileName(finalInvoiceNo);

      // --------------------------------------
      // 8) Upload PDF
      // --------------------------------------
      const pdfPath = `${safeName}/${safeInvNo}.pdf`;

      const { error: pdfErr } = await supabase.storage
        .from("club_invoices")
        .upload(pdfPath, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (pdfErr)
        return new Response(JSON.stringify({ error: pdfErr.message }), {
          status: 500,
          headers: cors,
        });

      // --------------------------------------
      // 9) Get PDF URL & save to DB
      // --------------------------------------
      const { data: pdfUrlData } = await supabase.storage
        .from("club_invoices")
        .getPublicUrl(pdfPath);

      const pdfUrl = pdfUrlData?.publicUrl;

      await supabase
        .from("club_booking_invoices")
        .update({
          invoice_no: finalInvoiceNo,
          pdf_url: pdfUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);


      // --------------------------------------
// 10) Trigger correct email based on trigger type
// --------------------------------------
try {
  if (trigger === "draft") {
    await fetch(`${supabaseUrl}/functions/v1/club-send-draft-invoice-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booking_id: booking.id,
        invoice_id: invoice.id,
        email: invoice.client_email || booking.email,
        full_name: booking.full_name,
      }),
    });
  }

  if (trigger === "approval") {
  await fetch(`${supabaseUrl}/functions/v1/club-send-approval-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseService}` // REQUIRED for RLS bypass
    },
    body: JSON.stringify({
      booking_id: booking.id,
      invoice_id: invoice.id,
      email: invoice.client_email || booking.email,
      full_name: booking.full_name,
    }),
  });
}
} catch (e) {
  console.error("⚠️ Email error:", e);
}


      // --------------------------------------
      // 11) DONE
      // --------------------------------------
      return new Response(
        JSON.stringify({ ok: true, pdf_url: pdfUrl }),
        { status: 200, headers: cors }
      );
    } catch (e) {
      console.error("🔥 generate-club-invoice-pdf failed:", e);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: cors,
      });
    }
  });
