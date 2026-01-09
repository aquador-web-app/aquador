import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe, formatMonth, formatCurrencyUSD } from "../../lib/dateUtils"; // ✅ Always included
import { useGlobalAlert } from "../../components/GlobalAlert";

function extractPlaceholders(html) {
  const regex = /{{\s*([\w.]+)\s*}}/g;
  const found = new Set();
  let match;

  while ((match = regex.exec(html))) {
    found.add(match[1]);
  }

  return [...found];
}


export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    body: "",
  });
  const [previewHtml, setPreviewHtml] = useState("");
  const [users, setUsers] = useState([]); // 🔹 list of profiles (users)
  const [selectedUser, setSelectedUser] = useState(null); // 🔹 selected profile
  const { showAlert, showConfirm } = useGlobalAlert();
  const [placeholders, setPlaceholders] = useState([]);


  useEffect(() => {
    loadTemplates();
    loadUsers();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) alert("Erreur chargement: " + error.message);
    else setTemplates(data);
    setLoading(false);
  }

  // ✅ Dropdown = users only
  async function loadUsers() {
  try {
    // 1️⃣ School users
    const { data: school, error: schoolErr } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, email")
      .order("full_name", { ascending: true });

    if (schoolErr) console.error("❌ school load error:", schoolErr.message);

    // 2️⃣ Club users
    const { data: club, error: clubErr } = await supabase
  .from("club_profiles")
  .select("id, main_full_name, email, membership_type, plan_code, total_monthly_fee_usd")
  .order("main_full_name", { ascending: true });

    if (clubErr) console.error("❌ club load error:", clubErr.message);

    // Normalize
    const schoolUsers = (school || []).map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      source: "school",
    }));

    const { data: plans } = await supabase
  .from("club_membership_plans")
  .select("code, label, base_price_usd, couple_price_usd");

const planMap = {};
(plans || []).forEach(p => {
  if (p.code) {
    planMap[p.code.trim().toLowerCase()] = p;
  }
});

const clubUsers = (club || []).map((u) => {
  const planKey = (u.plan_code || "").trim().toLowerCase();
  const plan = planMap[planKey];

  return {
    id: u.id,
    full_name: u.main_full_name,
    email: u.email,
    source: "club",
    membership_type: u.membership_type,
    plan_code: u.plan_code,
    monthly_fee: u.total_monthly_fee_usd,
    plan_label: plan?.label || "",  // SHOULD NOW POPULATE
  };
});


    const combined = [
      { header: "— École —" },
      ...schoolUsers,
      { header: "— Club —" },
      ...clubUsers,
    ];

    setUsers(combined);

// pick FIRST REAL user (not header)
const firstRealUser = [...schoolUsers, ...clubUsers][0];
if (firstRealUser) setSelectedUser(firstRealUser);
  } catch (err) {
    console.error("❌ loadUsers fatal error:", err.message);
  }
}

function resetForm() {
  setFormData({ name: "", subject: "", body: "" });
  setEditingTemplate(null);
  setShowForm(false);
  setPreviewHtml("");
}


  async function handleSave(e) {
    e.preventDefault();
    const query = editingTemplate
      ? supabase.from("email_templates").update(formData).eq("id", editingTemplate.id)
      : supabase.from("email_templates").insert([formData]);

    const { error } = await query;
    if (error) return alert("Erreur: " + error.message);
    resetForm();
    await loadTemplates();
  }

  async function handleDelete(id) {
  const confirmed = await showConfirm("Supprimer ce modèle ?");
  if (!confirmed) return;

  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("id", id);

  if (error) {
    await showAlert("❌ Erreur suppression : " + error.message);
    return;
  }

  await showAlert("🗑️ Modèle supprimé.");
  await loadTemplates();
}


  async function handleSendMass(templateId) {
  const confirmed = await showConfirm(
    "Envoyer ce modèle à tous les utilisateurs principaux ?"
  );
  if (!confirmed) return;

  const { error } = await supabase.rpc("queue_mass_email", {
    template_id: templateId,
  });

  if (error) {
    await showAlert("❌ Erreur lors de l’envoi : " + error.message);
    return;
  }

  await showAlert("📨 Emails placés en file d’attente !");
}


  // ✅ Fetch placeholders from related tables
  async function generatePreview(body, user = selectedUser) {
    if (!user) return;

    // 🔍 If user is a club member, fetch their family members
let familyList = [];

if (user.source === "club") {
  const { data: fam } = await supabase
    .from("club_profile_families")
    .select("full_name, relation, monthly_fee_usd")
    .eq("club_profile_id", user.id);

  familyList = fam || [];
}


    // fetch invoice info
    let invoice = null;

if (user.source === "school") {
  // SCHOOL INVOICE TABLE
  const { data } = await supabase
    .from("invoices")
    .select("invoice_no, total, month, due_date")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  invoice = data;
}

if (user.source === "club") {
  // CLUB INVOICE TABLE
  const { data } = await supabase
    .from("club_invoices")
    .select("invoice_no, total, month, due_date, description1, amount1")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  invoice = data;
}


    // fetch enrollment info
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select(`
        id,
        status,
        start_date,
        enrolled_at,
        profile_id,
        session_id,
        session_group,
        course_id,
        plan_id,
        override_price,
        type,
        profiles:profile_id ( full_name ),
        courses:course_id ( name ),
        plans:plan_id ( id, name, price, duration_hours ),
        sessions:session_id ( id, day_of_week, start_time )
      `)
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const course = enrollment?.courses || {};
    const session = enrollment?.sessions || {};

    const sample = {
  full_name: user.full_name || "Nom Inconnu",
  email: user.email || "client@example.com",
  invoice_no: invoice?.invoice_no || "Aucune Facture",
total: user.source === "club"
  ? formatCurrencyUSD(invoice?.total || user.monthly_fee || 0)
  : formatCurrencyUSD(invoice?.total || 0),

due_date: formatDateFrSafe(invoice?.due_date || new Date()),
month: formatMonth(invoice?.month || new Date()),
  course: course?.name || "N/A",
  start_date: formatDateFrSafe(enrollment?.start_date),
  session_time: session?.start_time?.slice(0, 5),
  session_date: session?.day_of_week
    ? ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"][session.day_of_week - 1]
    : "",
  membership_type_label:
  user.source === "club"
    ? (user.membership_type === "solo"
        ? "Adhésion Solo"
        : user.membership_type === "couple"
        ? "Adhésion Couple"
        : "Adhésion Famille")
    : "",

plan_label: user.source === "club" ? user.plan_label || "" : "",

monthly_fee: user.source === "club"
  ? formatCurrencyUSD(user.monthly_fee || 0)
  : "",
// === CLUB FAMILY PLACEHOLDERS ===
group_names_block:
  user.source === "club"
    ? (() => {
        if (!familyList || familyList.length === 0) {
          // No family → return empty block (nothing appears in template)
          return "";
        }

        // Family exists → show principal + members
        const lines = [];

        lines.push(`<b>Membre principal :</b> ${user.full_name}`);

        lines.push(`<b>Membres associés :</b>`);
        lines.push(
          familyList
            .map(
              (f) =>
                `• ${f.full_name} (${f.relation || "Membre"})`
            )
            .join("<br>")
        );

        return lines.join("<br>");
      })()
    : "",


group_names:
  user.source === "club"
    ? [user.full_name, ...familyList.map((f) => f.full_name)].join(", ")
    : "",

};




    let html = body || "";

const livePlaceholders = extractPlaceholders(body);

livePlaceholders.forEach((ph) => {
  const regex = new RegExp(`{{\\s*${ph}\\s*}}`, "g");
  html = html.replace(regex, sample[ph] ?? "");
});



    setPreviewHtml(html);
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">📧 Gestion des Modèles d'Email</h2>

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded mb-4">
          ➕ Nouveau modèle
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSave} className="bg-white border p-4 rounded mb-4 shadow">
          <div className="mb-2">
            <label className="block text-sm font-medium">Nom du modèle</label>
            <input
              type="text"
              className="border rounded px-2 py-1 w-full"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium">Sujet</label>
            <input
              type="text"
              className="border rounded px-2 py-1 w-full"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              required
            />
          </div>

          <div className="mb-2">
            <label className="block text-sm font-medium">Corps</label>
            <textarea
              className="border rounded px-2 py-1 w-full h-32"
              value={formData.body}
              onChange={(e) => {
                const newBody = e.target.value;
                setFormData({ ...formData, body: newBody });
                setPlaceholders(extractPlaceholders(newBody));
                generatePreview(newBody, selectedUser);
              }}
              required
            />
            {placeholders.length > 0 && (
  <p className="text-xs text-gray-500 mt-1">
    Variables disponibles:{" "}
    {placeholders.map((ph, idx) => (
      <code key={idx} className="mr-2">{`{{${ph}}}`}</code>
    ))}
  </p>
)}
          </div>

          {/* 🔹 User Selector */}
          <div className="mb-3">
            <label className="block text-sm font-medium">Choisir un utilisateur pour aperçu</label>
            <select
  className="border rounded px-2 py-1 w-full"
  value={selectedUser?.id || ""}
  onChange={(e) => {
    const user = users.find(
  (u) => !u.header && u.id === e.target.value
);
    setSelectedUser(user);
    generatePreview(formData.body, user);
  }}
>
  {users.map((u, idx) =>
    u.header ? (
      <option
        key={`header-${idx}-${u.header}`}
        disabled
        style={{ fontWeight: "bold" }}
      >
        {u.header}
      </option>
    ) : (
      <option key={`user-${u.id}`} value={u.id}>
        {u.full_name} {u.source === "club" ? "(Club)" : ""}
      </option>
    )
  )}
</select>

          </div>

          {/* 🔹 Preview Pane */}
          <div className="border rounded p-3 bg-gray-50 mb-3">
            <h3 className="font-bold mb-2">Aperçu de l'email :</h3>
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="bg-green-600 text-white px-3 py-1 rounded">
              💾 Sauvegarder
            </button>
            <button type="button" onClick={resetForm} className="bg-gray-300 text-black px-3 py-1 rounded">
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Existing templates */}
      {!loading && templates.length > 0 && (
        <div className="bg-white border rounded shadow mt-4">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Nom</th>
                <th className="px-3 py-2 text-left">Sujet</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="px-3 py-2">{t.subject}</td>
                  <td className="px-3 py-2 flex gap-2">
                    <button
                      onClick={() => {
                        setEditingTemplate(t);
                        setFormData({
                          name: t.name,
                          subject: t.subject,
                          body: t.body,
                        });
                        setShowForm(true);
                        setPlaceholders(extractPlaceholders(t.body));
                        generatePreview(t.body);
                      }}
                      className="bg-yellow-500 text-white px-2 py-1 rounded"
                    >
                      ✏️ Modifier
                    </button>
                    <button onClick={() => handleSendMass(t.id)} className="bg-blue-600 text-white px-2 py-1 rounded">
                      📢 Envoyer
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="bg-red-600 text-white px-2 py-1 rounded">
                      🗑️ Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
