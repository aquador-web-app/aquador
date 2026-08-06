// supabase/functions/create-user/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

// ---------- Supabase Client ----------
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ---------- CORS ----------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

console.log("🚀 create-user function invoked at", new Date().toISOString());

// ---------- Helpers ----------
function endOfThisMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString();
}
function firstOfNextMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}
function lastDashNumber(s: string | null): number {
  if (!s) return 0;
  const parts = s.split("-");
  const n = parseInt(parts[parts.length - 1], 10);
  return Number.isFinite(n) ? n : 0;
}
function sanitizeEmailPart(input: string) {
  return input
    .normalize("NFD")                 // split accents
    .replace(/[\u0300-\u036f]/g, "")  // remove accents
    .replace(/[^a-zA-Z0-9]/g, "")     // remove punctuation/spaces
    .toLowerCase();
}

const MINIMUM_MAIN_ACCOUNT_AGE = 18;

function getTodayInHaitiParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function calculateAgeInHaiti(birthDate: string | null): number | null {
  if (
    typeof birthDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)
  ) {
    return null;
  }

  const [birthYear, birthMonth, birthDay] = birthDate
    .split("-")
    .map(Number);

  const parsedDate = new Date(
    Date.UTC(birthYear, birthMonth - 1, birthDay)
  );

  // Reject impossible dates such as 2026-02-31
  if (
    parsedDate.getUTCFullYear() !== birthYear ||
    parsedDate.getUTCMonth() + 1 !== birthMonth ||
    parsedDate.getUTCDate() !== birthDay
  ) {
    return null;
  }

  const today = getTodayInHaitiParts();

  let age = today.year - birthYear;

  const birthdayHasNotOccurred =
    today.month < birthMonth ||
    (today.month === birthMonth && today.day < birthDay);

  if (birthdayHasNotOccurred) {
    age -= 1;
  }

  return age;
}

async function generateUniqueChildEmail(first: string, last: string) {
  const base = `${first}${last}`.replace(/\s+/g, "").toLowerCase();
  let candidate = `${base}@child.local`;
  let i = 1;
  while (true) {
    const { data } = await supabaseAdmin
      .from("profiles_with_unpaid")
      .select("email")
      .eq("email", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${base}${i}@child.local`;
    i++;
  }
}

async function applyRegistrationGifts(invoiceId) {
  if (!invoiceId) return;

  const { error } = await supabaseAdmin.rpc("add_registration_gifts", {
    p_invoice_id: invoiceId,
  });

  if (error) {
    console.error("❌ add_registration_gifts failed:", error);
    throw new Error(error.message);
  }
}

async function findRegistrationInvoiceId(userId) {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id")
    .eq("user_id", userId)
    .ilike("description1", "%inscription%")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("❌ findRegistrationInvoiceId failed:", error);
    return null;
  }

  return data?.id || null;
}


async function createChild({
  parent_id,
  first_name,
  middle_name,
  last_name,
  birth_date,
  sex,
  referral_code = null, // ✅ ADD THIS
}) {
  // 1) Try view first (to get same address / referral as UI)
      let { data: parent, error: parentErr } = await supabaseAdmin
        .from("profiles_with_unpaid")
        .select("id, signup_type, phone, address, referral_code, household_sequence")
        .eq("id", parent_id)
        .maybeSingle();

      if (parentErr) {
        console.error("❌ Error loading parent from view:", parentErr);
      }

      // 2) Fallback to real table if needed
      if (!parent) {
        const { data: parent2, error: parentErr2 } = await supabaseAdmin
          .from("profiles")
          .select("id, signup_type, phone, address, referral_code, household_sequence")
          .eq("id", parent_id)
          .maybeSingle();

        if (parentErr2) {
          console.error("❌ Error loading parent from base table:", parentErr2);
        }

        parent = parent2;
      }

      if (!parent) throw new Error("Parent not found");

      console.log("👨‍👩‍👧 Parent snapshot:", {
        id: parent.id,
        signup_type: parent.signup_type,
        address: parent.address,
        referral_code: parent.referral_code,
        household_sequence: parent.household_sequence,
      });

      // upgrade parent type if necessary
      if (parent.signup_type === "me") {
        await supabaseAdmin
          .from("profiles")
          .update({ signup_type: "me_student" })
          .eq("id", parent_id);
      }

      // generate unique dummy email
      const safeFirst = sanitizeEmailPart(first_name || "child");
      const safeLast  = sanitizeEmailPart(last_name || "");
      const fakeEmail = await generateUniqueChildEmail(safeFirst, safeLast);
      const fakePassword = crypto.randomUUID();

      // ✅ create auth user for child
      const { data: authChild, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: fakeEmail,
        password: fakePassword,
        email_confirm: true,
      });
      if (authErr) throw new Error(`Child auth creation error: ${authErr.message}`);
      const childId = authChild.user?.id;
      if (!childId) throw new Error("Missing userId from child auth creation");

      // ✅ create profile linked to auth user
      const { error: profileErr } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: childId,
            parent_id,
            first_name,
            middle_name,
            last_name,
            referral_code, // you can keep child's own code in profile
            role: "student",
            signup_type: "child",
            is_active: true,
            email: fakeEmail,
            phone: parent.phone,
            address: parent.address,
            sex: sex || null,
            birth_date: birth_date || null,
            created_by: "parent",
          },
          { onConflict: "id" }
        );
      if (profileErr) throw new Error(`Child profile upsert error: ${profileErr.message}`);

      // recalc household + referral
      await supabaseAdmin.rpc("assign_household_sequence_for_user", { user_id: childId });

      // retrieve updated values for child (mainly sequence)
      const { data: childRow } = await supabaseAdmin
        .from("profiles")
        .select("household_sequence")
        .eq("id", childId)
        .single();

      const householdSeq =
        childRow?.household_sequence || parent.household_sequence || 1;
      const refCode = parent.referral_code || "XX00";
      const parentAddress = parent.address || null;

      // ALWAYS first invoice for child = householdSeq + parentRefCode + "-1"
const invoiceNo = `${householdSeq}-${refCode}-1`;


      const regAmount = 60;
      const childFullName = [first_name, middle_name, last_name]
        .filter(Boolean)
        .join(" ");

      // For the "registration" month
      const monthValue = firstOfNextMonth();

      const { data: existingInv } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_no, address")
        .eq("user_id", childId)
        .eq("month", monthValue)
        .maybeSingle();

      console.log("📌 CHILD INVOICE DEBUG:", {
        childId,
        parentId: parent_id,
        parentAddress,
        householdSeq,
        refCode,
        invoiceNo,
        hasExistingInvoice: !!existingInv,
        existingInvoiceId: existingInv?.id || null,
        existingInvoiceNo: existingInv?.invoice_no || null,
      });

      // The registration invoice was created by the trigger.
// We always UPDATE it (never insert)
const { error: updErr } = await supabaseAdmin
  .from("invoices")
  .update({
    invoice_no: invoiceNo,
    full_name: childFullName,
    description1: "Frais d'inscription (enfant)",
    amount1: regAmount,
    total: regAmount,
    signup_type: "child",
    household_sequence: householdSeq,
    address: parentAddress,
  })
  .eq("user_id", childId)
  .eq("month", monthValue);

if (updErr) {
  throw new Error(`Child invoice update error: ${updErr.message}`);
}

console.log("♻️ Child invoice UPDATED (trigger invoice reused):", {
  invoiceNo,
  address: parentAddress,
});

const { data: childInvoice } = await supabaseAdmin
  .from("invoices")
  .select("id")
  .eq("user_id", childId)
  .eq("month", monthValue)
  .maybeSingle();

if (childInvoice?.id) {
  await applyRegistrationGifts(childInvoice.id);
}


return childId;
}


// ---------- Main Handler ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ✅ Parse & normalize body
    const clone = req.clone();
    const raw = await clone.text();
    console.log("🧾 Raw body text:", raw);
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch (err) {
      console.error("❌ Failed to parse JSON:", err);
    }
    console.log("🧾 SIGNUP PAYLOAD RECEIVED", {
  referrer_code: body.referrer_code,
  referrer_user_id: body.referrer_user_id,
  signup_type: body.signup_type,
  email: body.email,
});

const hasChildrenAtSignup =
  Array.isArray(body.children) && body.children.length > 0;

    // ensure full structure
    const expectedKeys = [
      "user_id", "email", "password", "first_name", "middle_name", "last_name",
      "birth_date", "sex", "phone", "address", "role", "signup_type",
      "parent_id", "referral_code", "referrer_code", "referrer_user_id",
      "first_lesson", "medical_note", "is_active", "children",
    ];
    for (const key of expectedKeys) if (!(key in body)) body[key] = null;

    // defaults
    if (!body.role) body.role = "student";
    if (!body.signup_type) body.signup_type = "me";
    if (body.is_active === undefined || body.is_active === null) body.is_active = true;
    if (!body.password) body.password = "Temp1234!";

    console.log("📥 Keys received:", Object.keys(body));

    const {
      email,
      password,
      role,
      signup_type,
      parent_id,
      first_name,
      middle_name,
      last_name,
      referral_code,
      referrer_code,
      referrer_user_id,
      birth_date,
      sex,
      phone,
      address,
      first_lesson,
      medical_note,
      user_id
    } = body;

    // ---------- Flow Detection ----------
    const flow = {
      isChild: Boolean(parent_id),
      hasReferrer: Boolean(referrer_code && referrer_code.trim() !== ""),
      isAdmin: !parent_id && !referrer_code && !!password && !user_id,
      isSelf: !parent_id && !referrer_code && !!user_id
    };
    console.log("🧭 FLOW DETECTION RESULT", {
  isChild: flow.isChild,
  hasReferrer: flow.hasReferrer,
  referrer_code,
  referrer_user_id,
});


    // ===============================================================
    // 1️⃣ CHILD FLOW — parent adds child (with auth & invoice)
    // ===============================================================
    if (flow.isChild) {
      console.log("👶 Creating child profile for parent:", parent_id);
      const childId = await createChild({
  parent_id,
  first_name,
  middle_name,
  last_name,
  birth_date,
  sex,
});

console.log("✅ Child setup complete:", childId);

return new Response(
  JSON.stringify({ success: true, child: childId }),
  { status: 200, headers: corsHeaders }
);
    }

    // ===============================================================
// 🔞 MAIN ACCOUNT HOLDER MUST BE AT LEAST 18
// Children created through createChild() are not affected.
// ===============================================================
const mainUserAge = calculateAgeInHaiti(birth_date);

if (mainUserAge === null) {
  return new Response(
    JSON.stringify({
      error: "La date de naissance du titulaire est invalide.",
    }),
    {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

if (mainUserAge < MINIMUM_MAIN_ACCOUNT_AGE) {
  console.warn("🚫 Minor attempted to create a main account:", {
    user_id,
    email,
    birth_date,
    calculated_age: mainUserAge,
  });

  return new Response(
    JSON.stringify({
      error:
        "Le titulaire du compte doit avoir au moins 18 ans. Si vous êtes le parent ou le tuteur, veuillez créer le compte à votre nom, puis sélectionner « Moi + enfants » ou « Enfants seulement » pour ajouter l’enfant. Si vous êtes mineur, demandez à votre parent ou tuteur d’effectuer l’inscription.",
    }),
    {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

    // ===============================================================
    // 2️⃣ MAIN USER FLOW (self / admin / referral)
    // ===============================================================
    let userId = user_id;
    if (!userId) {
      console.log("⚠️ No existing user_id — creating Auth user...");
      const { data: authRes, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authErr) throw new Error(`Auth creation error: ${authErr.message}`);
      userId = authRes.user.id;
      console.log("✅ Auth user created:", userId);
    }

    const fullName = [first_name, middle_name, last_name]
      .filter(Boolean)
      .join(" ");

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          role,
          signup_type,
          first_name,
          middle_name,
          last_name,
          referral_code: referral_code || null,
          is_active: true,
          phone: phone || null,
          address: address || null,
          sex: sex || null,
          birth_date: birth_date || null,
          first_lesson: first_lesson || null,
          medical_note: medical_note || null,
          created_by: flow.isAdmin
            ? "admin"
            : flow.hasReferrer
            ? "referral"
            : "self",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    if (profErr) throw new Error(`Profile upsert error: ${profErr.message}`);

    // ---------- Referral linking (robust) ----------
if (!flow.isChild && referrer_code && referrer_code.trim() !== "") {
  console.log("🔗 STEP 3 — ABOUT TO CALL link_referral", {
    userId,
    referrer_code: referrer_code.trim(),
    flow_hasReferrer: flow.hasReferrer,
  });
  const { data, error } = await supabaseAdmin.rpc("link_referral", {
    p_user_id: userId,
    p_code: referrer_code.trim(),
  });

  if (error) {
    console.error("❌ link_referral RPC error:", error);
  } else {
    console.log("✅ Referral linked:", data);
  }
}

// ===============================================================
// 3️⃣ FLOW 2 — children added at signup
// ===============================================================
if (hasChildrenAtSignup) {
  console.log("👶 FLOW 2 — adding children at signup for parent:", userId);

  for (const child of body.children) {
    if (!child.first_name || !child.last_name) continue;

    await createChild({
      parent_id: userId,
      first_name: child.first_name,
      middle_name: child.middle_name || null,
      last_name: child.last_name,
      birth_date: child.birth_date || null,
      sex: child.sex || null,
    });
  }
}




    // ---------- Invoice for main user (unchanged for now) ----------
    const { data: myInvoices } = await supabaseAdmin
      .from("invoices")
      .select("invoice_no")
      .eq("user_id", userId);

    let maxCounterMain = 0;
    for (const row of myInvoices || [])
      maxCounterMain = Math.max(maxCounterMain, lastDashNumber(row.invoice_no));
    const nextCounterMain = maxCounterMain + 1;
    const invoiceNoMain = `0-XX00-${nextCounterMain}`;

    const monthMain = firstOfNextMonth();

// 🚫 children_only → NO registration invoice for parent
if (signup_type !== "children_only") {

  const { data: existingRegistration } = await supabaseAdmin
    .from("invoices")
    .select("id")
    .eq("user_id", userId)
    .ilike("description1", "%inscription%")
    .maybeSingle();

  if (!existingRegistration) {
    const { data: newInvoice, error: invErr } = await supabaseAdmin
  .from("invoices")
  .insert([
    {
      user_id: userId,
      full_name: fullName,
      invoice_no: invoiceNoMain,
      description1: "Frais d'inscription",
      amount1: 60,
      total: 60,
      paid_total: 0,
      status: "pending",
      due_date: endOfThisMonth(),
      issued_at: new Date().toISOString(),
      signup_type,
      household_sequence: 0,
      address: address || null,
    },
  ])
  .select("id")
  .single();

  if (newInvoice?.id) {
  await applyRegistrationGifts(newInvoice.id);
}


    if (invErr) throw new Error(`Invoice creation error: ${invErr.message}`);
    console.log("✅ ONE-TIME registration invoice created");
  } else {
    console.log("⏭️ Registration fee already exists — skipping");
  }

} else {
  console.log("🚫 children_only → skipping parent registration invoice");
}


    console.log("✅ User setup complete for:", userId);
    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("❌ Error in create-user function:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
