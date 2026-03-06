// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// === Resilience constants ===
const QUERY_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const CIRCUIT_BREAKER_THRESHOLD = 3;

function formatDateFrSafe(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatMonth(date) {
  if (!date) return "";
  const s = new Date(date).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatCurrencyUSD(value) {
  if (value == null || isNaN(value)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
  }).format(Number(value));
}


// === Environment setup ===
const supabaseUrl =
  Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
const supabaseKey =
  Deno.env.get("FUNCTION_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const resendApiKey = Deno.env.get("RESEND_API_KEY");

const sender = "A'QUA D'OR <contact@clubaquador.com>";
const ALERT_EMAIL = "deadrien@clubaquador.com";

const supabase = createClient(supabaseUrl, supabaseKey);

// === Utility: race a promise against a timeout ===
function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      )
    ),
  ]);
}

// === Utility: retry with exponential backoff ===
async function withRetry(fn, maxRetries = MAX_RETRIES, baseDelayMs = 300) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `⚠️ Retry ${attempt + 1}/${maxRetries} in ${delay}ms — ${err.message}`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// === Utility: Supabase query with timeout + retry ===
// Throws on network-level errors; returns { data, error } for Supabase-level results.
// Retries automatically when the query itself times out or throws.
async function safeQuery(queryFn, label = "query") {
  return withRetry(
    async () => {
      const result = await withTimeout(queryFn(), QUERY_TIMEOUT_MS, label);
      // If Supabase returned a transient error, throw so withRetry can retry it
      if (result?.error) {
        const msg =
          result.error.message || JSON.stringify(result.error) || "";
        const isTransient =
          msg.toLowerCase().includes("timeout") ||
          msg.includes("522") ||
          msg.toLowerCase().includes("connection") ||
          msg.toLowerCase().includes("econnrefused") ||
          msg.toLowerCase().includes("network");
        if (isTransient) {
          throw new Error(`${label} transient error: ${msg}`);
        }
      }
      return result;
    },
    MAX_RETRIES
  );
}

// === Custom error: Resend daily quota exceeded ===
class ResendQuotaError extends Error {
  constructor() {
    super("Resend daily email quota exceeded (429)");
    this.name = "ResendQuotaError";
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// === Utility: System log to email_queue (fallback) ===
async function queueSystemEmail(subject, body) {
  try {
    await supabase.from("email_queue").insert({
      email: "deadrien@clubaquador.com",
      subject,
      body: `<pre>${body}</pre>`,
      status: "pending",
      kind: "system",
      created_at: new Date().toISOString(),
    });
    console.log("📨 System alert queued → deadrien@clubaquador.com");
  } catch (err) {
    console.error("❌ Failed to queue system email:", err);
  }
}


function applyVars(template, vars = {}) {
  if (!template || typeof template !== "string") return template;

  let out = template;

  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi");
    out = out.replace(regex, (value ?? "").toString());
  }

  return out;
}


// === Utility: Send an email via Resend (with optional attachment) ===
async function sendWithResend(toInput, subject, html, attachmentUrl = null) {
  // ✅ Normalize recipients: accept single email, array, or undefined
  let recipients = [];

  if (Array.isArray(toInput)) {
    recipients = toInput.filter(
      (addr) => typeof addr === "string" && addr.includes("@")
    );
  } else if (typeof toInput === "string" && toInput.includes("@")) {
    recipients = [toInput];
  } else if (
    typeof toInput === "object" &&
    toInput?.email &&
    typeof toInput.email === "string"
  ) {
    recipients = [toInput.email];
  }

  if (recipients.length === 0) {
    throw new Error("Missing or invalid recipient email address");
  }

  const payload = {
    from: sender,
    to: recipients,
    subject,
    html,
  };

  // ✅ Attachment handling
  if (attachmentUrl) {
    try {
      console.log(`📎 Fetching attachment from ${attachmentUrl}`);
      const fileRes = await fetch(attachmentUrl);
      if (!fileRes.ok) throw new Error(`Failed to fetch PDF: ${fileRes.status}`);
      const arrayBuf = await fileRes.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      const fileName =
        attachmentUrl.split("/").pop()?.split("?")[0] || "attachment.pdf";

      payload.attachments = [
        {
          filename: fileName,
          content: base64,
          type: "application/pdf",
        },
      ];
    } catch (err) {
      console.error("⚠️ Could not attach file:", err.message);
    }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      throw new ResendQuotaError();
    }
    throw new Error(`Resend API error: ${errText}`);
  }

  return await res.json();
}


// === Helper: Greeting based on local time in Haiti ===
function getGreeting() {
  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/Port-au-Prince",
    hour12: false,
    hour: "2-digit",
  });
  const hour = parseInt(now, 10);
  return hour < 12 ? "Bonjour" : "Bonsoir";
}

// === Helper: render A'QUA D'OR branded wrapper ===
function renderEmailTemplate(innerHtml, recipientName = "") {
  const greeting = getGreeting();
  const salutation =
    recipientName && recipientName.trim() !== ""
      ? `${greeting} ${recipientName},`
      : `${greeting},`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;padding:20px;background:#f9fafc;border-radius:10px;">
    
    <div style="text-align:center;margin-bottom:20px;">
      <img 
        src="https://jrwsxeiueezuiueglfpv.supabase.co/storage/v1/object/public/assets/aquador.png"
        alt="A'QUA D'OR"
        height="60"
        style="width:160px; max-width:160px; height:auto; display:block; margin:auto; margin-bottom:10px;"
      />
      <hr style="border:none;height:1px;background:#d0e7ff;width:80%;margin:15px auto 0;">
    </div>

    <div style="color:#333333;font-size:15px;line-height:1.6;">
      <p style="margin-bottom:15px;">${salutation}</p>

      <!-- DO NOT WRAP innerHtml in a <p>. Gmail strips button styles inside <p>. -->
      <div style="margin-bottom:20px;">
        ${innerHtml}
      </div>
    </div>

    <hr style="border:none;height:1px;background:#d0e7ff;width:80%;margin:20px auto;">
    <p style="text-align:center;color:#666;font-size:12px;margin-top:10px;">
      © ${new Date().getFullYear()} A'QUA D'OR — 8, Imp Hall, Rue Beauvais, Faustin 1er, Delmas 75<br/>
      💧 Ensemble, faisons de la natation une passion !
    </p>
  </div>`;
}


// === Main handler ===
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 🕐 1️⃣ GET: batch process pending emails (for scheduler/cron)
  if (req.method === "GET") {
    console.log("🔄 Checking for pending emails...");

    const { data: pending, error } = await safeQuery(
      () =>
        supabase
          .from("email_queue")
          .select(
            "id, email, subject, body, attachment_url, invoice_id, variables, kind, user_id"
          )
          .eq("status", "pending")
          .limit(10),
      "fetch pending emails"
    );

    if (error) {
      console.error("❌ Error fetching pending emails:", error);
      return new Response(JSON.stringify({ error }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // ===================================================
    // 🚀 BATCH PRE-FETCH: invoices, profiles upfront
    // ===================================================
    const invoiceIds = (pending || [])
      .map((e) => e.invoice_id)
      .filter(Boolean);
    const emailAddrs = (pending || []).map((e) => e.email).filter(Boolean);

    // Fetch all needed invoices in one query
    let batchInvoiceMap = {}; // keyed by invoice id
    if (invoiceIds.length > 0) {
      const { data: batchInvoices } = await safeQuery(
        () =>
          supabase
            .from("invoices")
            .select(
              "id, user_id, invoice_no, total, due_date, pdf_url, paid_total, month"
            )
            .in("id", invoiceIds),
        "batch invoices fetch"
      );
      for (const inv of batchInvoices || []) {
        batchInvoiceMap[inv.id] = inv;
      }
    }

    // Collect all user_ids from those invoices, plus any directly on queue items
    const userIds = [
      ...new Set(
        Object.values(batchInvoiceMap)
          .map((inv) => inv.user_id)
          .filter(Boolean)
      ),
    ];

    // Fetch all needed profiles in one query (by user_id OR by email)
    // Use separate .in() queries to avoid building raw filter strings with user data
    let profileByIdMap = {};
    let profileByEmailMap = {};
    if (userIds.length > 0) {
      const { data: byId } = await safeQuery(
        () =>
          supabase
            .from("profiles")
            .select("id, parent_id, full_name, email")
            .in("id", userIds),
        "batch profiles by id"
      );
      for (const p of byId || []) {
        profileByIdMap[p.id] = p;
        if (p.email) profileByEmailMap[p.email] = p;
      }
    }
    if (emailAddrs.length > 0) {
      const { data: byEmail } = await safeQuery(
        () =>
          supabase
            .from("profiles")
            .select("id, parent_id, full_name, email")
            .in("email", emailAddrs),
        "batch profiles by email"
      );
      for (const p of byEmail || []) {
        profileByIdMap[p.id] = p;
        if (p.email) profileByEmailMap[p.email] = p;
      }
    }

    let sentCount = 0;
    let consecutiveFailures = 0;

    for (const e of pending || []) {
      // 🔴 Circuit breaker: stop if too many consecutive failures
      if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        console.error(
          `🔴 Circuit breaker tripped after ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures. Stopping batch.`
        );
        break;
      }

      let varsFromQueue = {};
      try {
        if (typeof e.variables === "string") {
          varsFromQueue = JSON.parse(e.variables);
        } else if (typeof e.variables === "object" && e.variables !== null) {
          varsFromQueue = e.variables;
        }
      } catch (err) {
        console.warn("⚠️ Failed to parse queue variables:", err);
      }

      try {
        // Resolve profile from batch-fetched data
        let profileCheck = null;

        if (e.invoice_id) {
          const inv = batchInvoiceMap[e.invoice_id];
          if (inv?.user_id) {
            profileCheck = profileByIdMap[inv.user_id] || null;
          }
        }

        // Fallback: resolve profile from email
        if (!profileCheck && e.email) {
          profileCheck = profileByEmailMap[e.email] || null;

          // If not in batch cache, do a targeted query with timeout + retry
          if (!profileCheck) {
            const { data: profByEmail } = await safeQuery(
              () =>
                supabase
                  .from("profiles")
                  .select("id, parent_id, full_name")
                  .eq("email", e.email)
                  .maybeSingle(),
              "profile lookup by email"
            );
            profileCheck = profByEmail || null;
          }
        }

        if (profileCheck?.parent_id) {
          console.log(`⏩ Skipped child profile: ${e.email}`);
          consecutiveFailures = 0;
          continue;
        }

        if (!e.email || typeof e.email !== "string" || !e.email.includes("@")) {
          console.warn(`⚠️ Skipped invalid email: ${e.email}`);
          consecutiveFailures = 0;
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 600)); // throttle

        // Resolve invoice for template variables (from batch cache first)
        let invoice = e.invoice_id ? batchInvoiceMap[e.invoice_id] || null : null;

        // If invoice was not in the batch (edge case), fetch individually
        if (e.invoice_id && !invoice) {
          const { data: invoiceRow, error: invErr } = await safeQuery(
            () =>
              supabase
                .from("invoices")
                .select(
                  "invoice_no, total, due_date, pdf_url, paid_total, month"
                )
                .eq("id", e.invoice_id)
                .maybeSingle(),
            "invoice fetch"
          );
          if (invErr) {
            console.error("❌ Invoice fetch error:", invErr);
          } else {
            invoice = invoiceRow;
          }
        }

        // Resolve attachment
        const needsPdf = ["InvoiceIssued", "InvoiceReminder"].includes(e.kind);
        const resolvedAttachmentUrl =
          e.attachment_url || invoice?.pdf_url || null;

        if (needsPdf && !resolvedAttachmentUrl) {
          console.warn("⏳ Waiting for PDF for email:", e.id);
          await safeQuery(
            () =>
              supabase
                .from("email_queue")
                .update({ last_error: "Waiting for PDF" })
                .eq("id", e.id),
            "update email_queue waiting for PDF"
          );
          consecutiveFailures = 0;
          continue;
        }

        // Build merge variables
        const mergeVars = {
          ...(varsFromQueue || {}),
          name: varsFromQueue?.full_name || profileCheck?.full_name || "",
          full_name: varsFromQueue?.full_name || profileCheck?.full_name || "",
          email: e.email,
          invoice_no: invoice?.invoice_no || "",
          total:
            invoice?.total != null ? formatCurrencyUSD(invoice.total) : "",
          due_date: invoice?.due_date
            ? formatDateFrSafe(invoice.due_date)
            : "",
          month: invoice?.month ? formatMonth(invoice.month) : "",
        };

        const bodyWithVars = applyVars(e.body || "(no content)", mergeVars);
        let wrappedHtml = renderEmailTemplate(bodyWithVars, mergeVars.full_name);
        const subjectFinal = applyVars(e.subject || "(no subject)", mergeVars);

        console.log("🧪 BODY BEFORE SEND:", bodyWithVars);

        await sendWithResend(
          e.email,
          subjectFinal,
          wrappedHtml,
          needsPdf ? resolvedAttachmentUrl : null
        );

        await safeQuery(
          () =>
            supabase
              .from("email_queue")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
              })
              .eq("id", e.id),
          "mark email sent"
        );

        console.log(`✅ Sent → ${e.email}`);
        sentCount++;
        consecutiveFailures = 0; // reset on success
      } catch (err) {
        if (err instanceof ResendQuotaError) {
          console.error(
            "🚫 Resend quota exceeded — stopping batch email processing."
          );
          await queueSystemEmail(
            "🚫 Resend quota exceeded",
            "Daily email sending quota reached. Remaining emails will be retried next cycle."
          );
          break;
        }
        consecutiveFailures++;
        console.error("⚠️ Error sending email to:", e.email, err.message);
      }
    }

    return new Response(
      JSON.stringify({ processed: sentCount }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

// 📤 2️⃣ POST: direct email send (manual trigger)
if (req.method === "POST") {
  try {
    const {
      emailQueueId,
      email,
      to,
      subject,
      body,
      html,
      variables,
      recipient_name,
      attachment_url,
    } = await req.json();

    // ✅ 1️⃣ Safely parse variables no matter what format
    let vars = {};
    try {
      if (typeof variables === "string") vars = JSON.parse(variables);
      else if (typeof variables === "object" && variables !== null) vars = variables;
    } catch (e) {
      console.warn("⚠️ Could not parse variables; fallback to empty object", e);
      vars = {};
    }

    console.log("📦 Variables received:", vars);

    // ✅ 2️⃣ Normalize recipients
    let recipients = [];
    if (Array.isArray(to)) recipients = to.filter((a) => a && a.includes("@"));
    else if (typeof to === "string" && to.includes("@")) recipients = [to];
    if (typeof email === "string" && email.includes("@")) recipients.push(email);
    recipients = [...new Set(recipients)];
    if (recipients.length === 0) throw new Error("Missing or invalid recipient email address");

    console.log(`📧 Sending "${subject}" to ${recipients.join(", ")}`);

    // ===================================================
    // 🚀 BATCH PRE-FETCH: profiles, club_profiles, invoices
    // ===================================================

    // Batch fetch all profiles by email
    let profileMap = {}; // email -> profile
    {
      const { data: batchProfiles } = await safeQuery(
        () =>
          supabase
            .from("profiles")
            .select("id, parent_id, full_name, email")
            .in("email", recipients),
        "batch profiles lookup"
      );
      for (const p of batchProfiles || []) {
        if (p.email) profileMap[p.email] = p;
      }
    }

    // Batch fetch club_profiles for name fallback (by email)
    let clubProfileByEmailMap = {}; // email -> club_profile
    {
      const { data: cpByEmail } = await safeQuery(
        () =>
          supabase
            .from("club_profiles")
            .select("email, main_full_name, id, auth_user_id")
            .in("email", recipients),
        "batch club_profiles by email"
      );
      for (const cp of cpByEmail || []) {
        if (cp.email) clubProfileByEmailMap[cp.email] = cp;
      }
    }

    // Batch fetch club_profiles by auth_user_id (for invoice resolution)
    const profileIds = Object.values(profileMap)
      .map((p) => p.id)
      .filter(Boolean);
    let clubProfileByAuthMap = {}; // auth_user_id -> club_profile
    if (profileIds.length > 0) {
      const { data: cpByAuth } = await safeQuery(
        () =>
          supabase
            .from("club_profiles")
            .select("id, auth_user_id, main_full_name")
            .in("auth_user_id", profileIds),
        "batch club_profiles by auth_user_id"
      );
      for (const cp of cpByAuth || []) {
        if (cp.auth_user_id) clubProfileByAuthMap[cp.auth_user_id] = cp;
      }
    }

    // Batch fetch school invoices for all profile ids
    let schoolInvoiceByUserMap = {}; // user_id -> most recent invoice
    if (profileIds.length > 0) {
      const { data: schoolInvs } = await safeQuery(
        () =>
          supabase
            .from("invoices")
            .select(
              "user_id, invoice_no, total, due_date, pdf_url, paid_total, month, created_at"
            )
            .in("user_id", profileIds)
            .order("created_at", { ascending: false }),
        "batch school invoices"
      );
      for (const inv of schoolInvs || []) {
        if (
          !schoolInvoiceByUserMap[inv.user_id] ||
          new Date(inv.created_at) >
            new Date(schoolInvoiceByUserMap[inv.user_id].created_at)
        ) {
          schoolInvoiceByUserMap[inv.user_id] = inv;
        }
      }
    }

    // Batch fetch club invoices for all club profile ids
    const clubProfileIds = Object.values(clubProfileByAuthMap)
      .map((cp) => cp.id)
      .filter(Boolean);
    let clubInvoiceByCustomerMap = {}; // customer_id -> most recent invoice
    if (clubProfileIds.length > 0) {
      const { data: clubInvs } = await safeQuery(
        () =>
          supabase
            .from("club_invoices")
            .select(
              "customer_id, invoice_no, total, due_date, pdf_url, paid_total, month, created_at"
            )
            .in("customer_id", clubProfileIds)
            .order("created_at", { ascending: false }),
        "batch club invoices"
      );
      for (const inv of clubInvs || []) {
        if (
          !clubInvoiceByCustomerMap[inv.customer_id] ||
          new Date(inv.created_at) >
            new Date(clubInvoiceByCustomerMap[inv.customer_id].created_at)
        ) {
          clubInvoiceByCustomerMap[inv.customer_id] = inv;
        }
      }
    }

    // ✅ 3️⃣ For each recipient — errors are isolated per-recipient
    let sentCount = 0;
    let failedCount = 0;
    for (const addr of recipients) {
      try {
        // Resolve profile from batch cache
        const profileRow = profileMap[addr] || null;

        if (profileRow?.parent_id) {
          console.log(`⏩ Skipped child profile: ${addr}`);
          continue;
        }

        // Resolve full name
        let recipientNameFinal =
          recipient_name || profileRow?.full_name || "";

        // Fallback to club profile name
        if (!recipientNameFinal) {
          const clubRow =
            clubProfileByEmailMap[addr] ||
            (profileRow?.id ? clubProfileByAuthMap[profileRow.id] : null);
          if (clubRow?.main_full_name) {
            recipientNameFinal = clubRow.main_full_name;
          }
        }

        // Final fallback: derive from email address
        if (!recipientNameFinal || recipientNameFinal.trim() === "") {
          console.log("⚠️ No name found — forcing fallback");
          recipientNameFinal = addr.split("@")[0].replace(/[._]/g, " ");
        }

        // Resolve invoice: pick most recent between school and club
        const schoolInv = profileRow?.id
          ? schoolInvoiceByUserMap[profileRow.id] || null
          : null;
        const clubProfileForAddr = profileRow?.id
          ? clubProfileByAuthMap[profileRow.id] || null
          : null;
        const clubInv = clubProfileForAddr?.id
          ? clubInvoiceByCustomerMap[clubProfileForAddr.id] || null
          : null;

        let invoice = null;
        if (schoolInv && !clubInv) invoice = schoolInv;
        else if (clubInv && !schoolInv) invoice = clubInv;
        else if (schoolInv && clubInv) {
          invoice =
            new Date(clubInv.created_at) > new Date(schoolInv.created_at)
              ? clubInv
              : schoolInv;
        }

        const mergeVars = {
          ...(typeof vars === "object" ? vars : {}),
          name: recipientNameFinal,
          full_name: recipientNameFinal,
          course: vars.course || "",
          session_phrase: vars.session_phrase || "",
          session_date: vars.session_date || "",
          start_date: vars.start_date || "",
          session_time: vars.session_time || "",
          invoice_no: invoice?.invoice_no || "",
          total:
            invoice?.total != null ? formatCurrencyUSD(invoice.total) : "",
          due_date: invoice?.due_date
            ? formatDateFrSafe(invoice.due_date)
            : "",
          pdf_url: attachment_url || invoice?.pdf_url || "",
          balance:
            invoice &&
            invoice.total != null &&
            invoice.paid_total != null
              ? formatCurrencyUSD(
                  Number(invoice.total) - Number(invoice.paid_total)
                )
              : "",
          month: invoice?.month
            ? formatMonth(invoice.month)
            : vars.month || "",
          email: addr,
        };

        console.log("🧩 Final mergeVars:", mergeVars);

        // Interpolate and wrap
        let interpolatedBody = applyVars(
          body || html || "(no content)",
          mergeVars
        );
        let wrapped = renderEmailTemplate(interpolatedBody, recipientNameFinal);
        wrapped = applyVars(wrapped, mergeVars);
        const subjectFinal = applyVars(subject || "(no subject)", mergeVars);

        await sendWithResend(addr, subjectFinal, wrapped, attachment_url || null);

        await new Promise((r) => setTimeout(r, 400));
        console.log(`✅ Sent → ${addr}`);
        sentCount++;
      } catch (err) {
        if (err instanceof ResendQuotaError) {
          console.error(
            "🚫 Resend quota exceeded — stopping further sends."
          );
          await queueSystemEmail(
            "🚫 Resend quota exceeded",
            "Daily email sending quota reached. Remaining emails were not sent."
          );
          // Return 429 so the caller knows to retry later
          return new Response(
            JSON.stringify({
              error: err.message,
              sent: sentCount,
              quota_exceeded: true,
            }),
            {
              status: 429,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
        // Log and continue with remaining recipients
        failedCount++;
        console.error(`⚠️ Failed to send to ${addr}:`, err.message);
      }
    }

    // ✅ 4️⃣ Mark queue as sent
    if (emailQueueId) {
      await safeQuery(
        () =>
          supabase
            .from("email_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", emailQueueId),
        "mark email_queue sent"
      );
      console.log(`✅ Email_queue ${emailQueueId} marked as sent`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email(s) sent successfully", sent: sentCount, failed: failedCount }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("🔥 send-email function error:", err);
    await queueSystemEmail("🔥 send-email function error", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

  return new Response("Method not allowed", {
    status: 405,
    headers: corsHeaders,
  });
});
