// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const sender = "A'QUA D'OR <contact@clubaquador.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// === Utility: Send via Resend ===
async function sendWithResend(to: string, subject: string, html: string) {
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const payload = { from: sender, to: [to], subject, html };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error: ${text}`);
  }
  return await res.json();
}

// === Utility: Extract "MM-DD" from a date or date string ===
function getMonthDay(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    // Expecting "YYYY-MM-DD" or ISO
    return d.slice(5, 10);
  }
  try {
    return d.toISOString().slice(5, 10);
  } catch {
    return null;
  }
}

// === Utility: Render {{placeholders}} ===
function renderTemplate(template: string | null | undefined, vars: Record<string, string> = {}): string {
  if (!template || typeof template !== "string") return "";
  return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const trimmed = key.trim();
    return (vars[trimmed] ?? `{{${trimmed}}}`);
  });
}

// === Utility: Wrap with A'QUA D'OR style ===
function wrapWithBrand(innerHtml: string, recipientName: string = ""): string {
  const greeting = "Bonjour";
  const salutation = recipientName
    ? `<p style="margin-bottom:15px;">${greeting} ${recipientName},</p>`
    : `<p style="margin-bottom:15px;">${greeting},</p>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;padding:20px;background:#f9fafc;border-radius:10px;">
    <div style="text-align:center;margin-bottom:20px;">
      <img 
        src="https://jrwsxeiueezuiueglfpv.supabase.co/storage/v1/object/public/assets/aquador.png"
        alt="A'QUA D'OR"
        style="max-height:60px;margin-bottom:10px;"
      />
      <h2 style="color:#0077b6;">A'QUA D'OR</h2>
      <hr style="border:none;height:1px;background:#d0e7ff;width:80%;margin:auto;">
    </div>
    <div style="color:#333;font-size:15px;line-height:1.6;">
      ${salutation}
      ${innerHtml}
    </div>
    <hr style="border:none;height:1px;background:#d0e7ff;width:80%;margin:20px auto;">
    <p style="text-align:center;color:#666;font-size:12px;">
      © ${new Date().getFullYear()} A'QUA D'OR — Delmas 75<br/>
      💧 Ensemble, faisons de la natation une passion !
    </p>
  </div>`;
}

// === Main handler ===
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1️⃣ Today (Haiti timezone) as "MM-DD"
    const todayMD = new Date()
      .toLocaleDateString("fr-CA", { timeZone: "America/Port-au-Prince" })
      .slice(5); // "MM-DD"

    // ----------------------------------------------------
    // 2️⃣ EMAIL TEMPLATES: birthday & birthday_child
    // ----------------------------------------------------
    const { data: templates, error: tplErr } = await supabase
      .from("email_templates")
      .select("name, subject, body")
      .in("name", ["birthday", "birthday_child"]);

    if (tplErr) throw tplErr;

    const tplMap: Record<string, { subject: string; body: string }> = {};
    (templates || []).forEach((t) => {
      tplMap[t.name] = {
        subject: t.subject || "",
        body: t.body || "",
      };
    });

    if (!tplMap["birthday"] && !tplMap["birthday_child"]) {
      throw new Error("Required templates 'birthday' and/or 'birthday_child' not found");
    }

    // ----------------------------------------------------
    // 3️⃣ SCHOOL SIDE
    // ----------------------------------------------------

    // 3.a Parents (main users) from profiles_with_unpaid
    const { data: schoolProfiles, error: schoolErr } = await supabase
      .from("profiles_with_unpaid")
      .select("id, parent_id, full_name, email, birth_date, is_active");

    if (schoolErr) throw schoolErr;

    const schoolParents = (schoolProfiles || []).filter((p) => {
      if (!p || !p.is_active) return false;
      if (p.parent_id) return false; // only main parents
      const md = getMonthDay(p.birth_date);
      return md === todayMD && !!p.email;
    });

    // 3.b Children from "profiles" whose birthday is today
    const { data: schoolKidsAll, error: kidsErr } = await supabase
      .from("profiles")
      .select("id, parent_id, full_name, birth_date, is_active");

    if (kidsErr) throw kidsErr;

    const schoolKidsToday = (schoolKidsAll || []).filter((c) => {
      if (!c || !c.is_active) return false;
      if (!c.parent_id) return false; // only children
      const md = getMonthDay(c.birth_date);
      return md === todayMD;
    });

    // Parent lookup (profiles_with_unpaid has email + full_name)
    const parentIds = Array.from(
      new Set(schoolKidsToday.map((c) => c.parent_id).filter(Boolean))
    );

    let schoolParentsForKidsMap: Record<string, any> = {};
    if (parentIds.length > 0) {
      const { data: parentsForKids, error: pErr } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name, email")
        .in("id", parentIds);

      if (pErr) throw pErr;
      schoolParentsForKidsMap = (parentsForKids || []).reduce(
        (acc, p) => ({ ...acc, [p.id]: p }),
        {}
      );
    }

    // ----------------------------------------------------
    // 4️⃣ CLUB SIDE
    // ----------------------------------------------------

    // 4.a Main club members (only active status)
    const { data: clubProfiles, error: clubErr } = await supabase
      .from("club_profiles")
      .select("id, email, main_full_name, birth_date, status");

    if (clubErr) throw clubErr;

    const clubMainBirthdays = (clubProfiles || []).filter((m) => {
      if (!m) return false;
      if (m.status !== "active") return false;
      const md = getMonthDay(m.birth_date);
      return md === todayMD && !!m.email;
    });

    const clubProfileMap: Record<string, any> = {};
    (clubProfiles || []).forEach((m) => {
      if (m?.id) {
        clubProfileMap[m.id] = m;
      }
    });

    // 4.b Club family members (children + spouse, etc.)
    const { data: clubFamiliesAll, error: famErr } = await supabase
      .from("club_profile_families")
      .select("id, club_profile_id, full_name, birth_date");

    if (famErr) throw famErr;

    const clubFamiliesToday = (clubFamiliesAll || []).filter((f) => {
      const md = getMonthDay(f.birth_date);
      return !!md && md === todayMD && !!f.club_profile_id;
    });

    // ----------------------------------------------------
    // 5️⃣ Build unified messages list
    // ----------------------------------------------------

    type MessageDef = {
      send_to_email: string;
      send_to_name: string;
      birthday_person_name: string;
      template: "birthday" | "birthday_child";
      context: "school-parent" | "school-child" | "club-main" | "club-family";
    };

    const messages: MessageDef[] = [];

    // 5.a SCHOOL PARENTS (own birthday → template "birthday")
    for (const p of schoolParents) {
      messages.push({
        send_to_email: p.email,
        send_to_name: p.full_name || "",
        birthday_person_name: p.full_name || "",
        template: "birthday",
        context: "school-parent",
      });
    }

    // 5.b SCHOOL CHILDREN (birthday → email to parent → template "birthday_child")
    for (const child of schoolKidsToday) {
      const parent = schoolParentsForKidsMap[child.parent_id];
      if (!parent || !parent.email) continue;

      messages.push({
        send_to_email: parent.email,
        send_to_name: parent.full_name || "",
        birthday_person_name: child.full_name || "",
        template: "birthday_child",
        context: "school-child",
      });
    }

    // 5.c CLUB MAIN MEMBERS (own birthday → template "birthday")
    for (const m of clubMainBirthdays) {
      messages.push({
        send_to_email: m.email,
        send_to_name: m.main_full_name || "",
        birthday_person_name: m.main_full_name || "",
        template: "birthday",
        context: "club-main",
      });
    }

    // 5.d CLUB FAMILY (child + spouse, etc. → email to main member → template "birthday_child")
    for (const f of clubFamiliesToday) {
      const main = clubProfileMap[f.club_profile_id];
      if (!main) continue;
      if (main.status !== "active") continue;
      if (!main.email) continue;

      messages.push({
        send_to_email: main.email,
        send_to_name: main.main_full_name || "",
        birthday_person_name: f.full_name || "",
        template: "birthday_child",
        context: "club-family",
      });
    }

    // ----------------------------------------------------
    // 6️⃣ Deduplicate messages (same email + template + birthday_person_name)
    // ----------------------------------------------------
    const uniqueMap: Record<string, MessageDef> = {};
    for (const m of messages) {
      const key = `${m.send_to_email}::${m.template}::${m.birthday_person_name}`;
      if (!uniqueMap[key]) {
        uniqueMap[key] = m;
      }
    }
    const uniqueMessages = Object.values(uniqueMap);

    console.log(
      `🎂 Today=${todayMD} | total candidates=${messages.length} | unique=${uniqueMessages.length}`
    );

    if (uniqueMessages.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No birthdays today" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ----------------------------------------------------
    // 7️⃣ Send emails
    // ----------------------------------------------------
    let sentCount = 0;

    for (const m of uniqueMessages) {
      const tplName = m.template;
      const tpl = tplMap[tplName];

      if (!tpl) {
        console.warn(`⚠️ Missing template '${tplName}' – skipping`, m);
        continue;
      }

      const vars: Record<string, string> = {
        // generic
        full_name: m.send_to_name,
        name: m.send_to_name,
        email: m.send_to_email,

        // birthday-specific
        birthday_name: m.birthday_person_name,
        birthday_person: m.birthday_person_name,
        child_name: tplName === "birthday_child" ? m.birthday_person_name : "",
        parent_name: tplName === "birthday_child" ? m.send_to_name : "",

        // club-friendly generic
        member_name: m.send_to_name,
      };

      const subject =
        renderTemplate(tpl.subject || "Joyeux Anniversaire 🎉", vars) ||
        "Joyeux Anniversaire 🎉";

      const bodyHtml = renderTemplate(tpl.body || "", vars);
      const htmlWrapped = wrapWithBrand(bodyHtml, m.send_to_name);

      try {
        await sendWithResend(m.send_to_email, subject, htmlWrapped);
        console.log(
          `✅ Sent '${tplName}' (${m.context}) → ${m.send_to_email} for ${m.birthday_person_name}`
        );
        sentCount++;
        // Throttle a bit to avoid rate-limits
        await new Promise((r) => setTimeout(r, 400));
      } catch (e) {
        console.error(
          `🔥 Error sending to ${m.send_to_email} for ${m.birthday_person_name}:`,
          e
        );
      }
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        total_unique: uniqueMessages.length,
        total_candidates: messages.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (err: any) {
    console.error("🔥 birthday-email unified error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
