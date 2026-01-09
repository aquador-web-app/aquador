// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { data: pending, error } = await supabase
  .from("email_queue")
  .select("id, email, subject, body, attachment_url, invoice_id")
  .eq("status", "pending")
  .limit(10);


    if (error) {
      console.error("❌ Error fetching pending emails:", error);
      return new Response(JSON.stringify({ error }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    let sentCount = 0;
    for (const e of pending) {
      try {
        let profileCheck = null;

if (e.invoice_id) {
  const { data: invUser } = await supabase
    .from("invoices")
    .select("user_id")
    .eq("id", e.invoice_id)
    .maybeSingle();


  if (invUser?.user_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, parent_id, full_name")
      .eq("id", invUser.user_id)
      .maybeSingle();

    profileCheck = prof;
  }
}


        if (profileCheck?.parent_id) {
          console.log(`⏩ Skipped child profile: ${e.email}`);
          continue;
        }

        if (!e.email || typeof e.email !== "string" || !e.email.includes("@")) {
          console.warn(`⚠️ Skipped invalid email: ${e.email}`);
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 600)); // throttle

// ==========================
// 🔥 FETCH INVOICE FOR TEMPLATE VARIABLES
// ==========================
let invoice = null;

if (e.invoice_id) {
  const { data: invoiceRow, error: invErr } = await supabase
    .from("invoices")
    .select("invoice_no, total, due_date, pdf_url, paid_total, month")
    .eq("id", e.invoice_id)
    .maybeSingle();

  if (invErr) {
    console.error("❌ Invoice fetch error:", invErr);
  } else {
    invoice = invoiceRow;
  }
}

// ✅ Resolve attachment dynamically:
// 1) prefer attachment_url stored in queue (manual/system cases)
// 2) otherwise use invoice.pdf_url (monthly async case)
const resolvedAttachmentUrl = e.attachment_url || invoice?.pdf_url || null;

// ✅ If PDF is still not ready, DO NOT send yet.
// Leave it as pending so the next cron run will try again.
if (!resolvedAttachmentUrl) {
  console.warn("⏳ PDF not ready yet — keeping email pending:", e.id);
  await supabase
    .from("email_queue")
    .update({
      // optional: record why it’s waiting
      last_error: "PDF not ready yet (pdf_url is null)",
    })
    .eq("id", e.id);

  continue;
}

// ==========================
// 🧩 BUILD MERGE VARIABLES
// ==========================
const mergeVars = {
  name: profileCheck?.full_name || "",
  full_name: profileCheck?.full_name || "",

  invoice_no: invoice?.invoice_no || "",
  total: invoice?.total != null ? formatCurrencyUSD(invoice.total) : "",
  due_date: invoice?.due_date ? formatDateFrSafe(invoice.due_date) : "",
  month: invoice?.month ? formatMonth(invoice.month) : "",
  start_date: enrollment?.start_date
    ? formatDateFrSafe(enrollment.start_date)
    : "",

  session_time: enrollment?.sessions?.start_time
    ? enrollment.sessions.start_time.slice(0, 5)
    : "",

  balance:
    invoice && invoice.total != null && invoice.paid_total != null
      ? formatCurrencyUSD(Number(invoice.total) - Number(invoice.paid_total))
      : "",

  email: e.email,
};

// ==========================
// 🔥 APPLY TEMPLATE VARIABLES
// ==========================
const subjectFinal = applyVars(e.subject || "(no subject)", mergeVars);
let interpolatedBody = applyVars(e.body || "(no content)", mergeVars);

let wrappedHtml = renderEmailTemplate(interpolatedBody, mergeVars.full_name);
wrappedHtml = applyVars(wrappedHtml, mergeVars);

// ==========================
// 📤 SEND EMAIL (WITH RESOLVED ATTACHMENT)
// ==========================
await sendWithResend(
  e.email,
  subjectFinal,
  wrappedHtml,
  resolvedAttachmentUrl
);



        await supabase
          .from("email_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", e.id);

        console.log(`✅ Sent → ${e.email}`);
        sentCount++;
      } catch (err) {
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

    // ✅ 3️⃣ For each recipient
    for (const addr of recipients) {
      // 🔍 ALWAYS fetch full_name from profiles (not profiles_with_unpaid)
const { data: profileRow, error: profileErr } = await supabase
  .from("profiles")
  .select("id, parent_id, full_name")
  .eq("email", addr)
  .maybeSingle();

if (profileErr) console.error("❌ profile lookup error:", profileErr);

// Build correct full name
let recipientNameFinal =
  recipient_name || profileRow?.full_name || "";

// 🔥 fallback to club profiles
if (!recipientNameFinal) {
  const { data: clubRow, error: clubErr } = await supabase
    .from("club_profiles")
    .select("main_full_name")
    .eq("email", addr)
    .maybeSingle();

  if (clubErr) console.error("❌ club profile lookup error:", clubErr);

  if (clubRow?.main_full_name) {
    recipientNameFinal = clubRow.main_full_name;
  }
}
// 🔥 FINAL GUARANTEED FALLBACK (prevents blank greeting)
if (!recipientNameFinal || recipientNameFinal.trim() === "") {
  console.log("⚠️ No name found — forcing fallback");
  recipientNameFinal = addr.split("@")[0].replace(/[._]/g, " ");
}



      if (profileRow?.parent_id) {
        console.log(`⏩ Skipped child profile: ${addr}`);
        continue;
      }

  // ==========================
// 🔍 FETCH MOST RECENT INVOICE (school + club)
// ==========================
let invoice = null;

// 🎓 1) SCHOOL INVOICE — uses invoices.user_id
const { data: schoolInv, error: schoolInvErr } = await supabase
  .from("invoices")
  .select("invoice_no, total, due_date, pdf_url, paid_total, month, created_at")
  .eq("user_id", profileRow?.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (schoolInvErr) console.error("❌ School invoice fetch error:", schoolInvErr);


// 🏊 2) FIND CLUB PROFILE VIA auth_user_id
let clubProfileId = null;

const { data: clubProf, error: cpErr } = await supabase
  .from("club_profiles")
  .select("id")
  .eq("auth_user_id", profileRow?.id)
  .maybeSingle();

if (cpErr) console.error("❌ club_profiles lookup error:", cpErr);

if (clubProf?.id) clubProfileId = clubProf.id;


// 🏛️ 3) CLUB INVOICE — uses club_invoices.customer_id
let clubInv = null;

if (clubProfileId) {
  const { data: ci, error: ciErr } = await supabase
    .from("club_invoices")
    .select("invoice_no, total, due_date, pdf_url, paid_total, month, created_at")
    .eq("customer_id", clubProfileId)     // 🔥 FIXED COLUMN
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ciErr) console.error("❌ Club invoice fetch error:", ciErr);

  clubInv = ci;
}


// 🧠 4) PICK MOST RECENT
if (schoolInv && !clubInv) invoice = schoolInv;
if (clubInv && !schoolInv) invoice = clubInv;

if (schoolInv && clubInv) {
  invoice =
    new Date(clubInv.created_at) > new Date(schoolInv.created_at)
      ? clubInv
      : schoolInv;
}



      const mergeVars = {
  ...(typeof vars === "object" ? vars : {}),

  // Name
  name: recipientNameFinal,
  full_name: recipientNameFinal,

  // Session / course
  course: vars.course || "",
  session_phrase: vars.session_phrase || "",
  session_date: vars.session_date || "",
  start_date: vars.start_date || "",
  session_time: vars.session_time || "",

  // 🔥 INVOICE MERGE LOGIC (FORMATTED ONCE HERE)
invoice_no: invoice?.invoice_no || "",
total: invoice?.total != null ? formatCurrencyUSD(invoice.total) : "",
due_date: invoice?.due_date
  ? formatDateFrSafe(invoice.due_date)
  : "",
pdf_url: attachment_url || invoice?.pdf_url || "",
balance:
  invoice && invoice.total != null && invoice.paid_total != null
    ? formatCurrencyUSD(
        Number(invoice.total) - Number(invoice.paid_total)
      )
    : "",
month: invoice?.month
  ? formatMonth(invoice.month)
  : (vars.month || ""),


  // Email
  email: addr,
};



      console.log("🧩 Final mergeVars:", mergeVars);

      // ✅ Interpolate subject and body
      // 1️⃣ Apply vars to the raw template
let interpolatedBody = applyVars(body || html || "(no content)", mergeVars);

// 2️⃣ Wrap inside branded template
let wrapped = renderEmailTemplate(interpolatedBody, recipientNameFinal);

// 3️⃣ Apply placeholders AGAIN (because wrapper may contain placeholders)
wrapped = applyVars(wrapped, mergeVars);

// 4️⃣ Subject replacement
const subjectFinal = applyVars(subject || "(no subject)", mergeVars);

// 5️⃣ Send
await sendWithResend(addr, subjectFinal, wrapped, attachment_url || null);

      await new Promise((r) => setTimeout(r, 400));
      console.log(`✅ Sent → ${addr}`);
    }

    // ✅ 4️⃣ Mark queue as sent
    if (emailQueueId) {
      await supabase
        .from("email_queue")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", emailQueueId);
      console.log(`✅ Email_queue ${emailQueueId} marked as sent`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email(s) sent successfully" }),
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
