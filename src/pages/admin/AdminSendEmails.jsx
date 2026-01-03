import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion } from "framer-motion";
import {
  formatMonth,
  formatDateFrSafe,
  formatCurrencyUSD,
} from "../../lib/dateUtils";

function applyPlaceholders(text, variables) {
  if (!text) return "";

  let out = text;

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp("\\{\\{\\s*" + key + "\\s*\\}\\}", "giu");
    out = out.replace(regex, value ?? "");
  });

  return out;
}

function detectTemplateNeeds(subject, body) {
  const text = `${subject || ""}\n${body || ""}`;

  const ws = "\\s*";

  const make = (keys) =>
    new RegExp("\\{\\{" + ws + "(" + keys.join("|") + ")" + ws + "\\}\\}", "iu");

  return {
    needsInvoice: make([
      "invoice_no",
      "total",
      "due_date",
      "pdf_url",
      "balance",
      "month",
    ]).test(text),
    needsSession: make([
      "session_phrase",
      "session_date",
      "session_time",
    ]).test(text),
    needsEnrollment: make(["course", "start_date"]).test(text),
    needsClub: make([
      "membership_type_label",
      "plan_label",
      "group_names_block",
      "monthly_fee",
    ]).test(text),
  };
}

// --- Utility: safe month formatting from string/date/yyy-mm ---
function safeFormatMonth(maybeDateish) {
  try {
    if (!maybeDateish) return formatMonth(new Date());
    return formatMonth(maybeDateish);
  } catch {
    return formatMonth(new Date());
  }
}

// --- Build variables per recipient based on needs ---
async function buildVariablesForRecipient(
  recipientId,
  recipientName,
  recipientEmail,
  needs,
  origin
) {
  const base = {
    name: recipientName || "",
    full_name: recipientName || "",
    email: recipientEmail || "",
    course: "",
    start_date: "",
    session_time: "",
    session_phrase: "",
    session_date: "",
    invoice_no: "",
    month: safeFormatMonth(new Date()),
    total: "",
    due_date: "",
    pdf_url: "",
    balance: "",
  };

  // --- GET SCHOOL PROFILE (to detect club-only vs mixed) ---
const { data: profileRow, error: profileErr } = await supabase
  .from("profiles_with_unpaid")
  .select("id, full_name, email, parent_id")
  .eq("id", recipientId)
  .maybeSingle();

if (profileErr) {
  console.error("❌ profiles_with_unpaid lookup error:", profileErr);
}

const trueUserId = profileRow?.id || null;

// Detect club-only users (not present in school profiles)
const isClubOnly = !profileRow;


  // --- Determine Club Profile (school users + club-only users) ---
  let club = null;

  if (needs.needsClub) {
    // 1️⃣ Try match via auth_user_id (for users that share Auth)
    if (trueUserId) {
      const { data: cp, error: cpErr } = await supabase
        .from("club_profiles")
        .select(
          "id, membership_type, plan_code, total_monthly_fee_usd, main_full_name, auth_user_id"
        )
        .eq("auth_user_id", trueUserId)
        .maybeSingle();

      if (cpErr) {
        console.error("❌ club_profiles by auth_user_id error:", cpErr);
      }

      if (cp) club = cp;
    }

    // 2️⃣ If not found, try matching directly with profile ID (club-only users)
    if (!club) {
      const { data: cp2, error: cp2Err } = await supabase
        .from("club_profiles")
        .select(
          "id, membership_type, plan_code, total_monthly_fee_usd, main_full_name"
        )
        .eq("id", recipientId)
        .maybeSingle();

      if (cp2Err) {
        console.error("❌ club_profiles by id error:", cp2Err);
      }

      if (cp2) club = cp2;
    }
  }

  // --- CLUB PROFILE MATCHING LOGIC ---
  if (club) {
    console.log("DEBUG CLUB PROFILE:", club);

    base.full_name = base.full_name || club.main_full_name || "";

    // Membership label
    const membershipLabel =
      club.membership_type === "solo"
        ? "Adhésion Solo"
        : club.membership_type === "couple"
        ? "Adhésion Couple"
        : "Adhésion Famille";

    // 🔥 Robust plan lookup: try code THEN plan_code
    // 🔥 FIXED — NORMALIZE plan_code BEFORE QUERY
let plan = null;

const normalizedCode = (club.plan_code || "").trim().toUpperCase();
console.log("DEBUG - NORMALIZED PLAN CODE:", normalizedCode);

const { data: planResult, error: planErr } = await supabase
  .from("club_membership_plans")
  .select("label")
  .eq("code", normalizedCode) // DB stores uppercase codes: SILVER, GOLD, etc.
  .maybeSingle();

console.log("DEBUG PLAN LOOKUP:", { planResult, planErr });

plan = planResult || null;


    console.log("DEBUG - FINAL PLAN USED:", plan);

    // Fetch linked members
    const { data: family, error: famErr } = await supabase
      .from("club_profile_families")
      .select("full_name, relation")
      .eq("club_profile_id", club.id)
      .order("full_name", { ascending: true });

    if (famErr) {
      console.error("❌ club_profile_families error:", famErr);
    }

    let groupBlock = "";

    // ONLY show member block for couple + family
    if (club.membership_type === "couple" || club.membership_type === "family") {
      const title =
        club.membership_type === "couple"
          ? "Membre principal + conjoint(e)"
          : "Membre principal + famille";

      const main = `• ${base.full_name} — membre principal`;

      const others = (family || [])
        .map((f) => `• ${f.full_name} — ${f.relation}`)
        .join("<br>");

      groupBlock = `
        <br><b>${title} :</b><br>
        ${main}${others ? "<br>" + others : ""}
      `.trim();
    }

    base.membership_type_label = membershipLabel;
    base.plan_label = plan?.label || "(Aucun plan trouvé)";
    base.monthly_fee = formatCurrencyUSD(club.total_monthly_fee_usd || 0);
    base.group_names_block = groupBlock;
    base.login_url = "https://clubaquador.com/login";
  }

  const reqs = [];

  // ✅ Enrollment now only identifies IDs, then fetches course + session info
  if (!isClubOnly && needs.needsEnrollment) {
    reqs.push(
      (async () => {
        const { data: enrollment, error: eErr } = await supabase
          .from("enrollments")
          .select("course_id, session_group, start_date")
          .eq("profile_id", recipientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (eErr) {
          console.error("❌ Enrollment fetch error:", eErr);
          return { key: "enrollment", data: null };
        }
        if (!enrollment) {
          console.warn("⚠️ No enrollment found for:", recipientEmail);
          return { key: "enrollment", data: null };
        }

        // Step 2️⃣ — Get course name
        let courseData = null;
        if (enrollment.course_id) {
          const { data: c, error: cErr } = await supabase
            .from("courses")
            .select("name")
            .eq("id", enrollment.course_id)
            .maybeSingle();
          if (cErr) console.error("❌ Course fetch error:", cErr);
          courseData = c;
        }

        // Step 3️⃣ — Get session time (from the series)
        let sessionData = null;
        if (enrollment.session_group) {
          const { data: s, error: sErr } = await supabase
            .from("session_series")
            .select("start_time, start_date, days_of_week")
            .eq("id", enrollment.session_group)
            .maybeSingle();

          if (sErr) {
            console.error("❌ Session_series fetch error:", sErr);
          } else {
            sessionData = s;
          }
        }

        // Step 4️⃣ — Smart fallback if session_group is null OR missing start_time
        if (
          (!enrollment.session_group || !sessionData?.start_time) &&
          enrollment.course_id &&
          enrollment.start_date
        ) {
          const [yy, mm, dd] = String(enrollment.start_date)
            .split("-")
            .map(Number);
          const jsDay = new Date(yy, mm - 1, dd).getDay(); // 0=Sun … 6=Sat (LOCAL)

          const weekdayMap = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
          const weekdayNum = weekdayMap[jsDay];

          const { data: s2, error: s2Err } = await supabase
            .from("session_series")
            .select("start_time, start_date, days_of_week")
            .eq("course_id", enrollment.course_id)
            .contains("days_of_week", [weekdayNum])
            .limit(1)
            .maybeSingle();

          if (s2Err) {
            console.error(
              "❌ Smart fallback session_series fetch error:",
              s2Err
            );
          } else if (s2) {
            sessionData = s2;
            console.log("🧩 Used weekday-based fallback for:", recipientEmail, s2);
          } else {
            console.warn(
              "⚠️ No matching session_series found for weekday:",
              weekdayNum
            );
          }
        }

        return {
          key: "enrollment",
          data: {
            course: courseData,
            start_date: enrollment.start_date,
            session: sessionData,
          },
        };
      })()
    );
  }

  // ✅ Latest session (unchanged)
  if (!isClubOnly && needs.needsSession) {
    reqs.push(
      supabase
        .from("sessions")
        .select("course_name, date, start_time")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) console.error("❌ Latest session fetch error:", error);
          return { key: "session", data };
        })
    );
  }



  if (reqs.length === 0) return base;

  const results = await Promise.all(reqs);
  const byKey = Object.fromEntries(
    results.map((r) => [r.key, r.data || null])
  );

  console.log("🧠 Enrollment data for", recipientEmail, byKey.enrollment);

  if (needs.needsEnrollment) {
    const e = byKey.enrollment;
    if (e) {
      base.course = e?.course?.name || base.course;

      base.start_date = e?.start_date
        ? formatDateFrSafe(e.start_date)
        : base.start_date;

      base.session_time = e?.session?.start_time || base.session_time;
    }
  }

  if (needs.needsSession) {
    const s = byKey.session;
    if (!base.course) base.course = s?.course_name || base.course;
    base.session_phrase = s?.course_name
      ? `votre séance de ${s.course_name}`
      : base.session_phrase || "votre séance de natation";
    base.session_date = s?.date ? formatDateFrSafe(s.date) : base.session_date;
    if (!base.session_time && s?.start_time) base.session_time = s.start_time;
  }


  console.log("✅ Placeholders ready:", {
    course: base.course,
    start_date: base.start_date,
    session_time: base.session_time,
    membership_type_label: base.membership_type_label,
    plan_label: base.plan_label,
    monthly_fee: base.monthly_fee,
  });

  if (base.session_time && base.session_time.includes(":")) {
    base.session_time = base.session_time.slice(0, 5);
  }

  return base;
}

export default function AdminSendEmails() {
  const [recipientType, setRecipientType] = useState("all");
  const [customEmail, setCustomEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCustomRecipients, setSelectedCustomRecipients] = useState([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("id, name, subject, body")
        .order("created_at", { ascending: false });
      if (!error && data) setTemplates(data);
      if (error) console.error("❌ email_templates load error:", error);
    })();
  }, []);

  const handleTemplateChange = (id) => {
    setSelectedTemplate(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setSubject(tpl.subject || "");
      setMessage(tpl.body || "");
    }
  };

  const handleSearch = async (term) => {
    setCustomEmail(term);
    if (term.length < 2) return setSearchResults([]);

    const { data: school, error: schoolErr } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(8);

    if (schoolErr) {
      console.error("❌ profiles_with_unpaid search error:", schoolErr);
    }

    const { data: club, error: clubErr } = await supabase
      .from("club_profiles")
      .select("id, main_full_name, email")
      .or(`main_full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(8);

    if (clubErr) {
      console.error("❌ club_profiles search error:", clubErr);
    }

    const clubUsers = (club || []).map((c) => ({
  id: c.id,
  full_name: c.main_full_name,
  email: c.email,
  origin: "club",
}));

const schoolUsers = (school || []).map((s) => ({
  id: s.id,
  full_name: s.full_name,
  email: s.email,
  origin: "school",
}));

const merged = [...schoolUsers, ...clubUsers];

    const unique = Array.from(
      new Map(merged.map((u) => [u.email, u])).values()
    );

    setSearchResults(unique);
  };

  const addCustomRecipient = (user) => {
    if (!selectedCustomRecipients.some((r) => r.email === user.email)) {
      setSelectedCustomRecipients([...selectedCustomRecipients, user]);
    }
    setSearchResults([]);
    setCustomEmail("");
  };

  const removeCustomRecipient = (email) => {
    setSelectedCustomRecipients((prev) =>
      prev.filter((r) => r.email !== email)
    );
  };

  const sendEmail = async () => {
    setFeedback("");
    if (!subject.trim() || !message.trim()) {
      setFeedback("⚠️ Veuillez saisir un sujet et un message.");
      return;
    }

    setIsSending(true);
    try {
      let recipients = [];

      if (recipientType === "all") {
        const { data, error } = await supabase
          .from("profiles_with_unpaid")
          .select("id, email, full_name")
          .not("email", "is", null)
          .eq("is_active", true);
        if (error) console.error("❌ recipients all error:", error);
        recipients = (data || []).map((p) => ({
  id: p.id,
  email: p.email,
  full_name: p.full_name,
  origin: "school",   // 🔥 school users ALWAYS tagged
}));

      } else if (recipientType === "parents") {
        const { data, error } = await supabase
          .from("profiles_with_unpaid")
          .select("id, email, full_name")
          .is("parent_id", null)
          .not("email", "is", null)
          .eq("is_active", true);
        if (error) console.error("❌ recipients parents error:", error);
        recipients = (data || []).map((p) => ({
  id: p.id,
  email: p.email,
  full_name: p.full_name,
  origin: "school",   // 🔥 school users ALWAYS tagged
}));

      } else if (recipientType === "teachers") {
        const { data, error } = await supabase
          .from("profiles_with_unpaid")
          .select("id, email, full_name")
          .eq("role", "teacher")
          .not("email", "is", null)
          .eq("is_active", true);
        if (error) console.error("❌ recipients teachers error:", error);
        recipients = (data || []).map((p) => ({
  id: p.id,
  email: p.email,
  full_name: p.full_name,
  origin: "school",   // 🔥 school users ALWAYS tagged
}));

      } else if (recipientType === "influencers") {
        const { data, error } = await supabase
          .from("profiles_with_unpaid")
          .select("id, email, full_name")
          .eq("role", "influencer")
          .not("email", "is", null)
          .eq("is_active", true);
        if (error) console.error("❌ recipients influencers error:", error);
        recipients = (data || []).map((p) => ({
  id: p.id,
  email: p.email,
  full_name: p.full_name,
  origin: "school",   // 🔥 school users ALWAYS tagged
}));

      } else if (recipientType === "custom") {
        recipients = selectedCustomRecipients.map((r) => ({
          id: r.id,
          email: r.email,
          full_name: r.full_name,
          origin: r.origin || "school", 
        }));
      }

      if (recipients.length === 0) {
        setFeedback("⚠️ Aucun destinataire trouvé pour cette sélection.");
        setIsSending(false);
        return;
      }

      for (const r of recipients) {
        const needs = detectTemplateNeeds(subject, message);

        const vars = await buildVariablesForRecipient(
  r.id,
  r.full_name || "",
  r.email || "",
  needs,
  r.origin || "school"   // default to school
);


        const finalSubject = applyPlaceholders(subject, vars);
const finalBody     = applyPlaceholders(message, vars);


        console.log("📨 FINAL EMAIL SENT:", {
          to: r.email,
          finalSubject,
          finalBody,
          vars,
        });

        const { error } = await supabase.functions.invoke("send-email", {
  body: {
    to: r.email,
    subject: finalSubject,
    body: finalBody,
    variables: vars,   // 🔥 CRITICAL FIX
    recipient_name: r.full_name,
  },
});


        if (error) console.error("❌ Email error:", error);

        await new Promise((res) => setTimeout(res, 250));
      }

      setFeedback(`✅ Email envoyé à ${recipients.length} destinataire(s).`);
      setSubject("");
      setMessage("");
      setSelectedCustomRecipients([]);
      setSelectedTemplate("");
    } catch (err) {
      console.error(err);
      setFeedback("❌ Erreur lors de l'envoi de l'email.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-8 shadow border border-gray-100">
      <h2 className="text-2xl font-bold text-aquaBlue mb-6">
        ✉️ Envoyer un Email
      </h2>

      {/* Template selection */}
      <div className="mb-4">
        <label className="block text-gray-700 font-medium mb-2">
          Sélectionner un modèle
        </label>
        <select
          value={selectedTemplate}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-aquaBlue"
        >
          <option value="">Aucun modèle sélectionné</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
      </div>

      {/* Recipient Selection */}
      <div className="mb-4">
        <label className="block text-gray-700 font-medium mb-2">
          Destinataires
        </label>
        <select
          value={recipientType}
          onChange={(e) => setRecipientType(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-aquaBlue"
        >
          <option value="all">Tous les utilisateurs</option>
          <option value="parents">Parents / Utilisateurs principaux</option>
          <option value="teachers">Instructeurs</option>
          <option value="influencers">Influenceurs</option>
          <option value="custom">Email personnalisé</option>
        </select>

        {recipientType === "custom" && (
          <div className="mt-2 relative">
            <input
              type="text"
              value={customEmail}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Rechercher un nom ou une adresse email..."
              className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-aquaBlue"
            />

            {searchResults.length > 0 && (
              <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow mt-1 w-full max-h-48 overflow-y-auto">
                {searchResults.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => addCustomRecipient(u)}
                    className="p-2 hover:bg-blue-50 cursor-pointer"
                  >
                    <b>{u.full_name}</b>
                    <br />
                    <span className="text-sm text-gray-500">{u.email}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedCustomRecipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedCustomRecipients.map((r) => (
                  <div
                    key={r.email}
                    className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full flex items-center gap-2"
                  >
                    {r.full_name || r.email}
                    <button
                      onClick={() => removeCustomRecipient(r.email)}
                      className="text-xs text-red-600 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subject */}
      <div className="mb-4">
        <label className="block text-gray-700 font-medium mb-2">Sujet</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Sujet de l'email"
          className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-aquaBlue"
        />
      </div>

      {/* Message */}
      <div className="mb-6">
        <label className="block text-gray-700 font-medium mb-2">
          Message (HTML autorisé)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          placeholder="Rédigez le contenu de votre email ici..."
          className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-aquaBlue"
        />
      </div>

      {/* Feedback */}
      {feedback && (
        <p
          className={`mb-4 text-sm font-medium ${
            feedback.startsWith("✅")
              ? "text-green-600"
              : feedback.startsWith("⚠️")
              ? "text-yellow-600"
              : "text-red-600"
          }`}
        >
          {feedback}
        </p>
      )}

      {/* Send button */}
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={sendEmail}
        disabled={isSending}
        className={`px-6 py-3 rounded-lg text-white font-semibold ${
          isSending ? "bg-gray-400 cursor-not-allowed" : "bg-aquaBlue hover:bg-blue-600"
        }`}
      >
        {isSending ? "Envoi en cours..." : "📨 Envoyer"}
      </motion.button>
    </div>
  );
}
