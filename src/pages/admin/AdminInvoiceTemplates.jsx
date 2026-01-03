// pages/admin/invoice-template.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe, formatMonth } from "../../lib/dateUtils";

const REQUIRED_TOKENS = [
  "{{client_name}}",
  "{{invoice_no}}",
  "{{issued_at}}",
  "{{due_date}}",
  "{{items}}",
  "{{total}}",
  "{{paid_total}}",
  "{{balance_due}}",
  "{{payment_status}}",
];

export default function InvoiceTemplateEditor() {
  const [templateId, setTemplateId] = useState(null);
  const [name, setName] = useState("Default Invoice Template");
  const [body, setBody] = useState(getStarterTemplate());
  const [status, setStatus] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [invoicePaymentsMap, setInvoicePaymentsMap] = useState({}); // keyed by invoice_id
  const [familyInvoices, setFamilyInvoices] = useState([]); // 🆕 NEW STATE

  // 🧾 Load sample invoices
  useEffect(() => {
    async function loadInvoices() {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          `id, user_id, full_name, address, invoice_no, issued_at, created_at, due_date, total, paid_total, month,
           description1, amount1,
           description2, amount2,
           description3, amount3,
           description4, amount4,
           description5, amount5,
           description6, amount6,
           description7, amount7`
        )
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data?.length) {
        setInvoices(data);
        setSelectedInvoice(data[0]);
      } else if (error) console.error("Invoices error:", error);
    }
    loadInvoices();
  }, []);

  // 💳 Load payments for selected invoice
  useEffect(() => {
  if (!selectedInvoice?.id) {
    setInvoicePaymentsMap({});
    return;
  }

  (async () => {
    try {
      // 🧩 Collect all relevant invoice IDs (family-aware)
      const familyIds = familyInvoices.length
        ? familyInvoices.map((f) => f.id)
        : [selectedInvoice.id];

      const { data, error } = await supabase
        .from("payments")
        .select("invoice_id, amount, method, created_at")
        .in("invoice_id", familyIds);

      if (error) throw error;

      // 🗂️ Organize payments by invoice_id
      const map = {};
      (data || []).forEach((p) => {
        if (!map[p.invoice_id]) map[p.invoice_id] = [];
        map[p.invoice_id].push(p);
      });

      setInvoicePaymentsMap(map);
    } catch (err) {
      console.error("Error loading family payments:", err);
      setInvoicePaymentsMap({});
    }
  })();
}, [selectedInvoice, familyInvoices]);


  // 👨‍👩‍👧 Fetch all family invoices (parent + children)
  useEffect(() => {
    if (!selectedInvoice?.id) {
      setFamilyInvoices([]);
      return;
    }

    (async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles_with_unpaid")
          .select("id, parent_id")
          .eq("id", selectedInvoice.user_id)
          .maybeSingle();

        if (!profile) {
          setFamilyInvoices([selectedInvoice]);
          return;
        }

        const familyRootId = profile.parent_id || profile.id;

        const { data: children } = await supabase
          .from("profiles_with_unpaid")
          .select("id")
          .eq("parent_id", familyRootId);

        const familyIds = [familyRootId, ...(children || []).map((c) => c.id)];

        const { data: allInvoices, error } = await supabase
          .from("invoices")
          .select(
            `id, user_id, full_name, address, invoice_no, issued_at, due_date, month,
             total, paid_total,
             description1, amount1,
             description2, amount2,
             description3, amount3,
             description4, amount4,
             description5, amount5,
             description6, amount6,
             description7, amount7`
          )
          .in("user_id", familyIds)
          .order("issued_at", { ascending: true });

        if (error) throw error;
        setFamilyInvoices(allInvoices || []);
      } catch (err) {
        console.error("Error fetching family invoices:", err);
        setFamilyInvoices([selectedInvoice]);
      }
    })();
  }, [selectedInvoice]);

  // 🧩 Load saved templates
  useEffect(() => {
    async function loadTemplates() {
      const { data, error } = await supabase
        .from("invoice_template")
        .select("id, name, body")
        .order("updated_at", { ascending: false });
      if (!error && data) {
        setTemplates(data);
        if (data.length > 0) {
          setSelectedTemplate(data[0]);
          setTemplateId(data[0].id);
          setName(data[0].name);
          setBody(data[0].body);
        }
      }
    }
    loadTemplates();
  }, []);

  // 🧮 Compile HTML (includes family invoices)
  const compiledHtml = useMemo(() => {
  if (!selectedInvoice) return body;

  if (familyInvoices.length > 1) {
    return familyInvoices
      .map((inv) => {
        const paymentsForThis = invoicePaymentsMap[inv.id] || [];
        const html = compileTemplate(body, inv, paymentsForThis);
        const header = `
          <div style="margin-top:50px;margin-bottom:20px;text-align:center;font-size:1.2em;font-weight:bold;color:#061144;">
            ${inv.full_name || "-"} - ${formatMonth(inv.month)  }
          </div>`;
        return `${header}${html}`;
      })
      .join('<hr style="margin:40px 0;border:2px dashed #ddd;" />');
  }

  const paymentsForSelected = invoicePaymentsMap[selectedInvoice.id] || [];
  return compileTemplate(body, selectedInvoice, paymentsForSelected);
}, [body, selectedInvoice, invoicePaymentsMap, familyInvoices]);


  // 🔍 Missing placeholders check
  const missingTokens = useMemo(() => {
    return REQUIRED_TOKENS.filter((t) => !body.includes(t));
  }, [body]);

  // 💾 Save template
  const onSave = async () => {
    setStatus("Saving...");
    if (templateId) {
      const { error } = await supabase
        .from("invoice_template")
        .update({ name, body })
        .eq("id", templateId);
      if (error) setStatus(`Error: ${error.message}`);
      else setStatus("Template updated ✅");
    } else {
      const { data, error } = await supabase
        .from("invoice_template")
        .insert({ name, body })
        .select()
        .single();
      if (error) setStatus(`Error: ${error.message}`);
      else {
        setTemplateId(data.id);
        setTemplates((prev) => [data, ...prev]);
        setStatus("Template saved ✅");
      }
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        padding: 24,
      }}
    >
      <div>
        <h1>Invoice Template Editor</h1>

        {/* 🔹 Template Selector */}
        <label style={{ display: "block", margin: "12px 0 6px" }}>
          Sélectionner un modèle enregistré
        </label>
        <select
          className="border rounded px-2 py-1 w-full"
          value={selectedTemplate?.id || ""}
          onChange={(e) => {
            const tmpl = templates.find((t) => t.id === e.target.value);
            if (tmpl) {
              setSelectedTemplate(tmpl);
              setTemplateId(tmpl.id);
              setName(tmpl.name);
              setBody(tmpl.body);
            }
          }}
        >
          {templates.map((tmpl) => (
            <option key={tmpl.id} value={tmpl.id}>
              {tmpl.name}
            </option>
          ))}
        </select>

        {/* 🧾 Invoice selector */}
        <label style={{ display: "block", margin: "12px 0 6px" }}>
          Choisir une facture pour aperçu
        </label>
        <select
          className="border rounded px-2 py-1 w-full"
          value={selectedInvoice?.id || ""}
          onChange={(e) => {
            const inv = invoices.find((inv) => inv.id === e.target.value);
            setSelectedInvoice(inv || null);
          }}
        >
          {invoices.length === 0 ? (
            <option disabled>Aucune facture trouvée</option>
          ) : (
            invoices.map((inv) => {
              let labelDate = "—";
              try {
                const rawDate = inv.month;
                if (rawDate) {
                  labelDate = new Date(rawDate + 1).toLocaleDateString(
                    "fr-FR",
                    { month: "long", year: "numeric" }
                  );
                }
              } catch (err) {
                console.warn("Date parse failed for", inv, err);
              }

              return (
                <option key={inv.id} value={inv.id}>
                  {inv.full_name || "-"} – Facture - {formatMonth(inv.month)}
                </option>
              );
            })
          )}
        </select>

        {familyInvoices.length > 1 && (
          <p style={{ marginTop: 8, color: "#555" }}>
            {familyInvoices.length} factures trouvées dans cette famille.
          </p>
        )}

        <label style={{ display: "block", margin: "12px 0 6px" }}>
          Template name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />

        <label style={{ display: "block", margin: "12px 0 6px" }}>
          HTML body (use placeholders like {"{{client_name}}"})
        </label>
        <textarea
          rows={24}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: "100%", fontFamily: "monospace", padding: 12 }}
        />

        {missingTokens.length > 0 && (
          <p style={{ color: "#b91c1c", marginTop: 8 }}>
            Missing required placeholders: {missingTokens.join(", ")}
          </p>
        )}

        <button
          onClick={onSave}
          style={{
            marginTop: 12,
            padding: "10px 16px",
            background: "#059669",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
          }}
          disabled={missingTokens.length > 0}
        >
          Save Template
        </button>

        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>

      <div>
        <h2>Live Preview</h2>
        <iframe
          title="invoice-preview"
          style={{
            width: "100%",
            height: "85vh",
            resize: "vertical",
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
          srcDoc={compiledHtml}
        />
      </div>
    </div>
  );
}

/* --- Keep compileTemplate() and getStarterTemplate() unchanged --- */


// ... keep compileTemplate, escapeHtml, getStarterTemplate as before

// Compile placeholders
// Compile placeholders
function compileTemplate(templateHtml, invoice, payments = []) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const fmtMoney = (n) =>
    (n == null || isNaN(Number(n)) ? 0 : Number(n)).toFixed(2);

  const fmtDateFR = (d) =>
    d
      ? new Date(d).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

  // Status & doc title
  const total = Number(invoice?.total || 0);
  const paid = Number(invoice?.paid_total || 0);
  let paymentStatus = "En attente";
  let docTitle = "Facture";
  if (paid >= total && total > 0) {
    paymentStatus = "Payée";
    docTitle = "Reçu";
  } else if (paid > 0 && paid < total) {
    paymentStatus = "Partiellement payée";
    docTitle = "Reçu";
  }

  // Items
  const itemRows = [];
  for (let i = 1; i <= 7; i++) {
    const desc = invoice?.[`description${i}`];
    const amt = Number(invoice?.[`amount${i}`] || 0);
    if (desc && amt > 0) {
      itemRows.push(
        `<tr><td>${esc(desc)}</td><td style="text-align:right">USD ${fmtMoney(
          amt
        )}</td></tr>`
      );
    }
  }
  const itemsHTML = itemRows.length
    ? itemRows.join("")
    : `<tr><td colspan="2">—</td></tr>`;

  // Payments
  const paymentsRows = (payments || [])
    .filter((p) => Number(p.amount) > 0)
    .map(
      (p) =>
        `<tr><td>${esc(
          fmtDateFR(p.created_at || p.date)
        )}</td><td>${esc(p.method || "—")}</td><td>USD ${fmtMoney(
          p.amount
        )}</td></tr>`
    )
    .join("");

  // Base replacements
  let out = templateHtml
    .replaceAll("{{doc_title}}", esc(docTitle))
    .replaceAll(
      "{{client_name}}",
      esc(invoice?.full_name || invoice?.child_full_name || "—")
    )

    // ✅ FIXED: ADDRESS NOW ACTUALLY SHOWS
    .replaceAll(
      "{{address}}",
      esc(
        invoice?.address ||
          invoice?.billing_address ||
          invoice?.address ||
          "—"
      )
    )

    // ✅ FIXED: INVOICE NUMBER NOW SHOWS
    .replaceAll("{{invoice_no}}", esc(invoice?.invoice_no || "—"))

    .replaceAll("{{issued_at}}", esc(formatDateFrSafe(invoice?.issued_at)))
    .replaceAll("{{due_date}}", esc(formatDateFrSafe(invoice?.due_date)))
    .replaceAll("{{month}}", esc(formatMonth(invoice?.month)))
    .replaceAll("{{items}}", itemsHTML)
    .replaceAll("{{total}}", fmtMoney(invoice?.total))
    .replaceAll("{{paid_total}}", fmtMoney(invoice?.paid_total))
    .replaceAll(
      "{{balance_due}}",
      fmtMoney(Number(invoice?.total || 0) - Number(invoice?.paid_total || 0))
    )
    .replaceAll("{{payment_status}}", esc(paymentStatus))
    .replaceAll("{{logo_url}}", esc("/logo/aquador.png"))
    .replaceAll("{{school_email}}", esc("contact@clubaquador.com"));

  // Payments block
  out = out.replaceAll("{{payments}}", paymentsRows);
  if (!paymentsRows) {
    out = out.replace(/<div class="payments">[\s\S]*?<\/div>/i, "");
  }

  // Signature
  out = out.replaceAll("{{signature_url}}", "/assets/signature.png");

  return out;
}


  

function getStarterTemplate() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f8f9fa; color: #222; }
    .invoice-box { max-width: 900px; margin: auto; padding: 30px; border: 1px solid #eee; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.10); }
    
    .main-header { text-align: center; margin-bottom: 10px; }
    .main-header img { max-height: 70px; margin-bottom: 8px; }
    .main-header h1 { font-size: 1.8em; color: #061144ff; }
    
    .separator { border-top: 2px solid #061144ff; margin: 12px 0 20px 0; }

    .sub-header { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .school-info { 
      font-size: 0.8em; /* smaller text */
      font-weight: bold; 
      line-height: 1.3; 
      width: 55%; 
      text-align: left; /* flush left */
    }
    .meta { 
      text-align: left; 
      font-size: 0.8em; /* smaller text */
      width: 45%; 
    }

    table.items, table.payments { width: 100%; border-collapse: collapse; margin-top: 20px; }
    table.items th, table.items td, table.payments th, table.payments td { border: 1px solid #ddd; padding: 8px; }
    table.items th, table.payments th { background: #061144ff; color: #fff; text-align: left; }

    .summary { margin-top: 20px; }
    .summary table { width: 100%; border-collapse: collapse; }
    .summary td { padding: 6px; text-align: right; }

    .status { margin-top: 16px; font-weight: bold; text-align: right; }

    .signature { margin-top: 60px; text-align: center; }
    .signature-line { border-top: 1px solid #000; width: 200px; margin: 0 auto 5px auto; }
    .signature p { font-weight: bold; text-align: center; }
  </style>
</head>
<body>
  <div class="invoice-box">
    <div class="main-header">
      <img src="{{logo_url}}" alt="Logo A'QUA D'OR" style="height:100px; width:auto;  display:block; margin:0 auto;" />
      <h1>{{doc_title}} – A'QUA D'OR</h1>
    </div>
    <div class="separator"></div>

    <div class="sub-header">
      <div class="school-info">
        Imp Hall, Rue Beauvais, Faustin 1er<br/>
        Delmas 75, Port-au-Prince, Haïti<br/>
        Tel: +509 3891 2429<br/>
        Email: contact@clubaquador.com
      </div>
      <div class="meta">
        Client: {{client_name}}<br/>
        Adresse: {{address}}<br/>
        No Facture: {{invoice_no}}<br/>
        Date : {{issued_at}}<br/>
        Échéance: {{due_date}}
      </div>
    </div>

    <table class="items">
      <thead><tr><th>Description</th><th style="text-align:right">Montant</th></tr></thead>
      <tbody>{{items}}</tbody>
    </table>

    <div class="summary">
      <table>
        <tr><td><strong>Total:</strong> USD {{total}}</td></tr>
        <tr><td><strong>Payé:</strong> USD {{paid_total}}</td></tr>
        <tr><td><strong>Solde:</strong> USD {{balance_due}}</td></tr>
      </table>
    </div>

    <div class="status">Status: {{payment_status}}</div>

    <div class="payments">
      <h3>Paiements enregistrés</h3>
      <table class="payments">
        <thead><tr><th>Date</th><th>Méthode</th><th>Montant</th></tr></thead>
        <tbody>{{payments}}</tbody>
      </table>
    </div>

    <div class="signature" style="text-align:center;margin-top:28px;">
  <img src="{{signature_url}}" alt="Signature"
       style="width:220px;height:auto;margin:0 auto 0 auto;display:block;" />
  <div class="signature-line"
       style="border-top:1px solid #000;width:180px;margin:0 auto 2px auto;"></div>
  <p style="font-weight:bold;margin-top:1px;">Directeur</p>
</div>
  </div>
</body>
</html>
`;
}
