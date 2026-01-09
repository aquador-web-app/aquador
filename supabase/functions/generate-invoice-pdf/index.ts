// supabase/functions/generate-invoice-pdf/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeFileName } from "../shared/sanitize.ts";
import { formatMonth } from "../../../src/lib/dateUtils.js";


/** Safely delete a file before writing to avoid ETXTBSY */
async function safeRemove(path) {
  try {
    await supabase.storage.from("invoices").remove([path]);
  } catch (_) {}
  // tiny delay to let storage release lock
  await new Promise((r) => setTimeout(r, 150));
}

/** Safe upload wrapper to avoid ETXTBSY file locking */
async function safeUpload(path, data, contentType) {
  await safeRemove(path);
  await new Promise((r) => setTimeout(r, 120)); // additional buffer

  const { error } = await supabase.storage.from("invoices").upload(path, data, {
    contentType,
    upsert: true,
  });

  if (error) throw error;

  // let storage settle before next read/write
  await new Promise((r) => setTimeout(r, 120));
}

const LOCAL_PDF_SERVER = "https://puppeteer-server-bxx4.onrender.com/pdf";


/** Small wait helper */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 
 * Retry PDF generation 3 times to avoid spawn ETXTBSY 
 */
async function fetchPdfBufferWithRetry(compiledHtml, maxAttempts = 5) {
  const options = {
    format: "A4",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🚀 [PDF] Attempt ${attempt}/${maxAttempts}`);

      const res = await fetch(LOCAL_PDF_SERVER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: compiledHtml, options }),
      });

      if (res.status === 429) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, 16s…
        console.warn(`⏳ Puppeteer 429 — waiting ${delay}ms`);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const buffer = new Uint8Array(await res.arrayBuffer());
      console.log("✅ [PDF] Buffer received");
      return buffer;

    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;

      const delay = attempt * 1000;
      console.warn(`⚠️ PDF error — retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError || new Error("PDF generation failed");
}



const supabaseUrl =
  Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, opts = {}) =>
      fetch(url, { ...opts, cache: "no-store" }), // 🔥 FORCE no-cache
  },
});


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const fmtUSD = (v) => `${Number(v || 0).toFixed(2)} USD`;
const fmtDate = (d) =>
  d
    ? new Date(
        new Date(d).toLocaleString("en-US", {
          timeZone: "America/Port-au-Prince",
        })
      ).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";


function sanitizeFileNameLocal(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w\-./]/g, "");
}

function formatMonthYearFrCap(value) {
  if (!value) return "Inconnu";

  // Handle YYYY-MM-DD or date-only fields WITHOUT time
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-");
    const months = [
      "Janvier","Février","Mars","Avril","Mai","Juin",
      "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
    ];
    return `${months[Number(m) - 1]} ${y}`;
  }

  // Full timestamp case (with time)
  const d = new Date(
    new Date(value).toLocaleString("en-US", {
      timeZone: "America/Port-au-Prince"
    })
  );

  const months = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
  ];

  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function compileTemplate(templateHtml, invoice, payments = [], LOGO_URL, SIGN_URL) {
  const total = Number(invoice.total || 0);
  const paid = Number(invoice.paid_total || 0);
  const balance = total - paid;
  const docTitle = paid > 0 ? "Reçu" : "Facture";
  

  // Items
  let itemsHTML = "";
  for (let i = 1; i <= 7; i++) {
    const desc = invoice[`description${i}`];
    const amt = invoice[`amount${i}`];
    if (desc && Number(amt) > 0)
      itemsHTML += `<tr><td>${desc}</td><td style="text-align:right;">${fmtUSD(amt)}</td></tr>`;
  }
  if (!itemsHTML) itemsHTML = `<tr><td colspan="2" style="text-align:center;">—</td></tr>`;

  // Payments
  const hasPayments = Array.isArray(payments) && payments.some(p => Number(p.amount) > 0);
  const paymentsRows = hasPayments
    ? payments.map(
        (p) => `
        <tr>
          <td>${fmtDate(p.created_at)}</td>
          <td>${p.notes || p.method || "Crédit appliqué"}</td>
          <td style="text-align:right;">${fmtUSD(p.amount)}</td>
        </tr>`
      ).join("")
    : "";

  const clientAddress =
    (invoice.address?.trim()) ||
    (invoice.client_address?.trim()) ||
    (invoice.billing_address?.trim()) || "—";

  let html = templateHtml
    .replaceAll("{{doc_title}}", docTitle)
    .replaceAll("{{client_name}}", invoice.full_name || invoice.child_full_name || "—")
    .replace(/\{\{\s*address\s*\}\}/gi, clientAddress)
    .replace(/\{\{\s*client_address\s*\}\}/gi, clientAddress)
    .replaceAll("{{invoice_no}}", invoice.invoice_no || "—")
    .replaceAll("{{issued_at}}", fmtDate(invoice.issued_at))
    .replaceAll("{{due_date}}", fmtDate(invoice.due_date))
    .replaceAll("{{month}}", formatMonth(invoice.month))
    .replaceAll("{{items}}", itemsHTML)
    .replaceAll("{{total}}", fmtUSD(total))
    .replaceAll("{{paid_total}}", fmtUSD(paid))
    .replaceAll("{{balance_due}}", fmtUSD(balance))
    .replaceAll(
      "{{payment_status}}",
      paid >= total && total > 0 ? "Payée" :
      paid > 0 ? "Partiellement payée" : "En attente"
    )
    .replaceAll("{{payments}}", paymentsRows);

  // logo + signature
  html = html.replace(
    /<img[^>]*alt=["']Logo A'?QUA D'?OR["'][^>]*>/i,
    `<img src="${LOGO_URL}" alt="Logo A'QUA D'OR" style="max-width:160px;margin:0 auto;display:block;">`
  );
  html = html.replaceAll("{{logo_url}}", LOGO_URL);
  html = html.replaceAll("{{signature_url}}", SIGN_URL || "");

  // Hide empty payments section
  if (!hasPayments) {
    html = html.replace(
      /\s*<h3[^>]*>\s*Paiements enregistr[ée]s\s*<\/h3>\s*<table[\s\S]*?<\/table>/i,
      ""
    );
  }

  const styleFix = `
    <style>
      @page {
        margin: 0;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff !important;
      }
      .invoice-card {
        background: transparent !important;
        width: 100%;
        max-width: 880px;
        margin: 25.4mm auto 0 auto;
        padding: 0 20mm 38mm 20mm;
        font-size: 1.08em;
        page-break-inside: avoid;
        overflow: visible;
        border-radius: 0;
        transform: none;
      }
      table, h1, h2, h3, p, div { page-break-inside: avoid; }
    </style>
  `;

  return styleFix + html;
}

serve(async (req) => {
  let invoice_id: string | null = null;

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ✅ Parse request ONCE
    const body = await req.json();
    invoice_id = body.invoice_id;
    const source = body.source || "on_demand";

    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "Missing invoice_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    console.log("🧾 Generating unified invoice PDF for:", invoice_id, "source:", source);

    // === Fetch invoice ===
    const { data: mainInvoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .maybeSingle();

    if (invErr || !mainInvoice) {
      throw new Error("Invoice not found");
    }

    // ✅ Monthly-only rule (THIS IS NOW PERFECT)
    if (
      source === "monthly" &&
      Number(mainInvoice.paid_total || 0) > 0
    ) {
      console.log(
        "⛔ Monthly run: invoice already has payments — skipping:",
        mainInvoice.invoice_no
      );

      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "invoice_has_payments",
          source,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

// 🚫 Do not generate a NEW invoice PDF if the invoice total (solde) is zero
if (Number(mainInvoice.total || 0) <= 0) {
  console.log(
    "⛔ Invoice has zero total — aborting generation:",
    mainInvoice.invoice_no
  );

  return new Response(
    JSON.stringify({ skipped: true, reason: "zero_total_invoice" }),
    { status: 200, headers: corsHeaders }
  );
}

    // 🚦 FIX 3 — GLOBAL PDF LOCK CHECK (CORRECTED)
const { data: busy } = await supabase
  .from("invoices")
  .select("id")
  .eq("pdf_generating", true)
  .neq("id", invoice_id) // 🔥 DO NOT BLOCK YOURSELF
  .limit(1);

if (busy && busy.length > 0) {
  console.log("⏸️ Another PDF generation already running — aborting");
  return new Response(
    JSON.stringify({ error: "PDF generator busy, retry later" }),
    { status: 429, headers: corsHeaders }
  );
}

// 🔐 FIX 3 — ACQUIRE GLOBAL PDF LOCK (ATOMIC + VERIFIED)
const { data: lockRows } = await supabase
  .from("invoices")
  .update({
    pdf_url: null,
    pdf_generating: true,
  })
  .eq("id", invoice_id)
  .is("pdf_generating", false)
  .select("id");

if (!lockRows || lockRows.length === 0) {
  console.log("⏸️ Invoice already locked — aborting");
  return new Response(
    JSON.stringify({ error: "PDF generator busy, retry later" }),
    { status: 429, headers: corsHeaders }
  );
}

    // === Determine if this invoice belongs to a child or parent ===
    const { data: profile } = await supabase
      .from("profiles_with_unpaid")
      .select("id, parent_id, full_name")
      .eq("id", mainInvoice.user_id)
      .maybeSingle();

    let familyIds = [];

    // CHILD → generate ONLY child's invoice
    if (profile?.parent_id) {
      console.log("👶 Child invoice → generate SINGLE invoice only");
      familyIds = [mainInvoice.user_id];
    }
    // PARENT → generate full family invoice
    else {
      console.log("👨 Parent invoice → generate FAMILY invoices");
      const rootUserId = mainInvoice.user_id;

      const { data: childrenProfiles } = await supabase
        .from("profiles_with_unpaid")
        .select("id")
        .eq("parent_id", rootUserId);

      familyIds = [
        rootUserId,
        ...(childrenProfiles?.map((c) => c.id) || []),
      ];
    }

    // Fetch invoices fresh from DB, parent + all children (or child only)
    const { data: familyInvoicesRaw, error: famErr } = await supabase
      .from("invoices")
      .select("*")
      .in("user_id", familyIds);
    if (famErr) throw famErr;

    // === Fetch template ===
    const { data: tmpl } = await supabase
      .from("invoice_template")
      .select("body")
      .eq("name", "Facture")
      .maybeSingle();
    if (!tmpl) throw new Error("Template 'Facture' not found");

    let enrichedInvoices = [];

    for (const raw of familyInvoicesRaw || []) {
      const { data: latestInv } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", raw.id)
        .maybeSingle();

      enrichedInvoices.push(latestInv || raw);
    }

    let familyInvoices = [];

    if (profile?.parent_id) {
      // For child: keep as-is (only child user_id)
      familyInvoices = enrichedInvoices;
    } else {
      const rootUserId = mainInvoice.user_id;

      familyInvoices = enrichedInvoices.sort((a, b) => {
        if (a.user_id === rootUserId && b.user_id !== rootUserId) return -1;
        if (b.user_id === rootUserId && a.user_id !== rootUserId) return 1;
        return new Date(a.issued_at) - new Date(b.issued_at);
      });
    }

    // === Build HTML for the whole family (or child only) ===
    let compiledHtml = "";

    for (const inv of familyInvoices) {
  // 🚫 Skip PAID invoices ONLY during MONTHLY runs
  if (
    source === "monthly" &&
    Number(inv.paid_total || 0) > 0
  ) {
    console.log(
      "⏭️ Monthly run: skipping paid invoice:",
      inv.invoice_no
    );
    continue;
  }

  // 🚫 Always skip zero-total invoices
  if (Number(inv.total || 0) <= 0) {
    console.log(
      "⏭️ Skipping zero-total invoice:",
      inv.invoice_no
    );
    continue;
  }

// ========================================================================

      const invoiceIdForPayments = inv.id; // ALWAYS use DB original row, not enriched copy

const { data: payments } = await supabase
  .from("payments")
  .select("amount, method, notes, created_at")
  .eq("invoice_id", invoiceIdForPayments)
  .order("created_at", { ascending: true });


      const { data: latestInv } = await supabase.rpc("get_invoice_uncached", {
        p_id: inv.id,
      });

      // === Assets ===
      const { data: logoData } = await supabase.storage
        .from("assets").getPublicUrl("aquador.png");
      const { data: sigData } = await supabase.storage
        .from("assets").getPublicUrl("signature.png");
      const LOGO_URL = logoData?.publicUrl || "";
      const SIGN_URL = sigData?.publicUrl || "";

      // --- Fetch fresh profile data (full_name, address, etc.) ---
      const { data: prof } = await supabase
        .from("profiles_with_unpaid")
        .select("full_name, address, sex, parent_id, child_full_name")
        .eq("id", inv.user_id)
        .maybeSingle();

      // Merge profile fields into invoice object
      const freshInvoice = {
  ...inv,                // 🔥 KEEP ORIGINAL INVOICE (descriptions & amounts)
  ...(latestInv || {}),  // only overlay computed fields that exist
  full_name: prof?.full_name || inv.full_name,
  child_full_name: prof?.child_full_name || inv.child_full_name,
  address: prof?.address || inv.address,
};


      compiledHtml += compileTemplate(
        tmpl.body,
        freshInvoice,
        payments || [],
        LOGO_URL,
        SIGN_URL
      );

      compiledHtml += `<div style="page-break-after: always;"></div>`;
    }

    if (!compiledHtml || compiledHtml.trim().length < 100) {
      throw new Error(`❌ Empty HTML detected for invoice ${invoice_id}`);
    }

    console.log("🧾 Family invoices compiled:", familyInvoices.length);

    const safeClientName = sanitizeFileNameLocal(mainInvoice.full_name || "Client");
    const safeInvNo = sanitizeFileNameLocal(mainInvoice.invoice_no);
    const safeMonthYear = sanitizeFileNameLocal(
      formatMonthYearFrCap(mainInvoice.month || mainInvoice.issued_at)
    );

    const pdfName = `${safeClientName}/${safeInvNo}_${safeMonthYear}.pdf`;

  
    // === Convert to PDF ===
    console.log("🚀 Sending HTML to Puppeteer (with retry)");
await sleep(1500); // 🔥 critical throttle
const pdfBuffer = await fetchPdfBufferWithRetry(compiledHtml);



    await supabase.storage
      .from("invoices")
      .upload(pdfName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    console.log("✅ PDF uploaded as:", pdfName);

    const { data: pdfUrlData } = await supabase.storage
      .from("invoices")
      .getPublicUrl(pdfName);
    const pdfUrl = pdfUrlData?.publicUrl;
    if (!pdfUrl) throw new Error("Failed to get public PDF URL");

    // === Update PDF URL for this call's invoices
    if (profile?.parent_id) {
      // 👶 CHILD FLOW: update only this child's invoice for this first PDF
      await supabase
        .from("invoices")
        .update({ pdf_url: pdfUrl })
        .eq("id", mainInvoice.id);

        console.log(
  "🔁 PDF regenerated — overwriting pdf_url for invoice:",
  mainInvoice.id,
  "→",
  pdfUrl
);


      console.log("👶 Child PDF done. Regenerating parent PDF INLINE...");



      // === INLINE PARENT REGENERATION (no HTTP self-call) ===

      // Determine the month of the child invoice
      const childMonth = mainInvoice.month || mainInvoice.issued_at;

      // FIRST: try to find matching parent invoice (same month)
      let { data: parentInv } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", profile.parent_id)
        .eq("month", childMonth)
        .maybeSingle();

      // FALLBACK: use latest parent invoice
      if (!parentInv) {
        const { data: parentLatest } = await supabase
          .from("invoices")
          .select("*")
          .eq("user_id", profile.parent_id)
          .order("issued_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        parentInv = parentLatest;
      }

      if (parentInv) {
        console.log("👨 Parent invoice found for regen:", parentInv.id);

        // Rebuild full family for the parent
        const rootUserId = parentInv.user_id;

        const { data: childrenProfilesParent } = await supabase
          .from("profiles_with_unpaid")
          .select("id")
          .eq("parent_id", rootUserId);

        const parentFamilyIds = [
          rootUserId,
          ...(childrenProfilesParent?.map((c) => c.id) || []),
        ];


        const { data: familyInvoicesRawParent, error: famErrParent } = await supabase
          .from("invoices")
          .select("*")
          .in("user_id", parentFamilyIds);

        if (famErrParent) throw famErrParent;

        let enrichedParentInvoices = [];
        for (const raw of familyInvoicesRawParent || []) {
          const { data: latestInvParent } = await supabase
            .from("invoices")
            .select("*")
            .eq("id", raw.id)
            .maybeSingle();
          enrichedParentInvoices.push(latestInvParent || raw);
        }

        const familyInvoicesParent = enrichedParentInvoices.sort((a, b) => {
          if (a.user_id === rootUserId && b.user_id !== rootUserId) return -1;
          if (b.user_id === rootUserId && a.user_id !== rootUserId) return 1;
          return new Date(a.issued_at) - new Date(b.issued_at);
        });

        let compiledHtmlParent = "";

        // Fetch assets once for parent block
        const { data: logoDataParent } = await supabase.storage
          .from("assets").getPublicUrl("aquador.png");
        const { data: sigDataParent } = await supabase.storage
          .from("assets").getPublicUrl("signature.png");
        const LOGO_URL_PARENT = logoDataParent?.publicUrl || "";
        const SIGN_URL_PARENT = sigDataParent?.publicUrl || "";

        for (const inv of familyInvoicesParent) {
  // 🚫 Skip PAID invoices ONLY during MONTHLY runs
  if (
    source === "monthly" &&
    Number(inv.paid_total || 0) > 0
  ) {
    console.log(
      "⏭️ Monthly run: skipping paid invoice:",
      inv.invoice_no
    );
    continue;
  }

  // 🚫 Always skip zero-total invoices
  if (Number(inv.total || 0) <= 0) {
    console.log(
      "⏭️ Skipping zero-total invoice:",
      inv.invoice_no
    );
    continue;
  }


          const { data: payments } = await supabase
            .from("payments")
            .select("amount, method, created_at")
            .eq("invoice_id", inv.id)
            .order("created_at", { ascending: true });

          const { data: latestInvParentRpc } = await supabase.rpc("get_invoice_uncached", {
            p_id: inv.id,
          });

          const { data: profParent } = await supabase
            .from("profiles_with_unpaid")
            .select("full_name, address, sex, parent_id, child_full_name")
            .eq("id", inv.user_id)
            .maybeSingle();

          const freshInvoiceParent = {
            ...inv,                          // 🔥 KEEP ORIGINAL INVOICE
            ...(latestInvParentRpc || {}),   // overlay computed fields only
            full_name: profParent?.full_name || inv.full_name,
            child_full_name: profParent?.child_full_name || inv.child_full_name,
            address: profParent?.address || inv.address,
          };

          compiledHtmlParent += compileTemplate(
            tmpl.body,
            freshInvoiceParent,
            payments || [],
            LOGO_URL_PARENT,
            SIGN_URL_PARENT
          );

          compiledHtmlParent += `<div style="page-break-after: always;"></div>`;
        }

        if (!compiledHtmlParent || compiledHtmlParent.trim().length < 100) {
          throw new Error(`❌ Empty HTML for parent invoice ${parentInv.id}`);
        }

        const safeParentName = sanitizeFileNameLocal(parentInv.full_name || "Client");
        const safeParentInvNo = sanitizeFileNameLocal(parentInv.invoice_no);
        const safeParentMonthYear = sanitizeFileNameLocal(
          formatMonthYearFrCap(parentInv.month || parentInv.issued_at)
        );

        const parentPdfName = `${safeParentName}/${safeParentInvNo}_${safeParentMonthYear}.pdf`;


        console.log("🚀 Sending PARENT HTML to Puppeteer (with retry)");
await sleep(2000); // 🔥 parent is heavier → longer delay
const parentPdfBuffer = await fetchPdfBufferWithRetry(compiledHtmlParent);



        await supabase.storage
          .from("invoices")
          .upload(parentPdfName, parentPdfBuffer, {
            contentType: "application/pdf",
            upsert: true,
          });

        console.log("✅ Parent PDF uploaded as:", parentPdfName);

    

        const { data: parentPdfUrlData } = await supabase.storage
          .from("invoices")
          .getPublicUrl(parentPdfName);
        const parentPdfUrl = parentPdfUrlData?.publicUrl;
        if (!parentPdfUrl) throw new Error("Failed to get parent PDF URL");


        // Update pdf_url for ALL parent family invoices
        await supabase
          .from("invoices")
          .update({ pdf_url: parentPdfUrl })
          .in("id", familyInvoicesParent.map((inv) => inv.id));

          console.log(
  "🔁 PDF regenerated — overwriting pdf_url for parent family invoices:",
  familyInvoicesParent.map(inv => inv.id),
  "→",
  parentPdfUrl
);


        console.log("✅ Parent PDF URL updated on family invoices");
      }

      
      return new Response(
        JSON.stringify({ success: true, pdf_url: pdfUrl }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // === PARENT FLOW (called directly with parent invoice_id)
    await supabase
      .from("invoices")
      .update({ pdf_url: pdfUrl })
      .in("id", familyInvoices.map((inv) => inv.id));

      console.log(
  "🔁 PDF regenerated — overwriting pdf_url for parent invoices:",
  familyInvoices.map(inv => inv.id),
  "→",
  pdfUrl
);


    return new Response(
      JSON.stringify({ success: true, pdf_url: pdfUrl }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

    } catch (err) {
    console.error("🔥 Unified invoice PDF generation failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  } finally {
    // 🔓 FIX 3 — ALWAYS RELEASE PDF LOCK (SUCCESS OR FAILURE)
    try {
await supabase
  .from("invoices")
  .update({ pdf_generating: false })
  .eq("id", invoice_id);
    } catch (e) {
      console.error("⚠️ Failed to release pdf_generating lock:", e);
    }
  }
});

