// src/pages/admin/AdminMembershipInvoicesTemplates.jsx
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

export default function AdminMembershipInvoicesTemplates() {
  const [templateId, setTemplateId] = useState(null);
  const [name, setName] = useState("Modèle facture Club (adhésion)");
  const [body, setBody] = useState(getStarterMembershipTemplate());
  const [status, setStatus] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [invoicePaymentsMap, setInvoicePaymentsMap] = useState({}); // keyed by invoice_id

  // 🧾 Load sample membership invoices (from club_invoices)
  useEffect(() => {
    async function loadInvoices() {
      const { data, error } = await supabase
        .from("club_invoices")
        .select(
          `
          id,
          customer_id,
          client_email,
          invoice_no,
          issued_at,
          created_at,
          due_date,
          month,
          total,
          paid_total,
          description1, amount1,
          description2, amount2,
          description3, amount3,
          description4, amount4,
          description5, amount5,
          description6, amount6,
          description7, amount7
        `
        )
        .eq("category", "membership")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Membership invoices error:", error);
        return;
      }

      const withClientName = (data || []).map((inv) => ({
        ...inv,
        // fallback: later you can store real name; for now use email as label if needed
        client_name: inv.client_name || inv.full_name || inv.client_email || "—",
      }));

      setInvoices(withClientName);
      if (withClientName.length > 0) {
        setSelectedInvoice(withClientName[0]);
      }
    }

    loadInvoices();
  }, []);

  // 💳 Load membership payments for selected invoice
  useEffect(() => {
    if (!selectedInvoice?.id) {
      setInvoicePaymentsMap({});
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("club_membership_payments")
          .select("invoice_id, amount, method, created_at, paid_at")
          .eq("invoice_id", selectedInvoice.id);

        if (error) throw error;

        const map = {};
        (data || []).forEach((p) => {
          if (!map[p.invoice_id]) map[p.invoice_id] = [];
          map[p.invoice_id].push(p);
        });

        setInvoicePaymentsMap(map);
      } catch (err) {
        console.error("Error loading membership payments:", err);
        setInvoicePaymentsMap({});
      }
    })();
  }, [selectedInvoice]);

  // 🧩 Load saved membership templates
  useEffect(() => {
    async function loadTemplates() {
      const { data, error } = await supabase
        .from("membership_invoice_template")
        .select("id, body, created_at, updated_at")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("membership_invoice_template error:", error);
        return;
      }

      if (data && data.length > 0) {
        setTemplates(data);
        const tmpl = data[0];
        setSelectedTemplate(tmpl);
        setTemplateId(tmpl.id);
        setBody(tmpl.body);
        setName("Modèle facture Club (adhésion)");
      } else {
        setTemplates([]);
      }
    }

    loadTemplates();
  }, []);

  // 🧮 Compile HTML for preview
  const compiledHtml = useMemo(() => {
    if (!selectedInvoice) return body;
    const paymentsForSelected = invoicePaymentsMap[selectedInvoice.id] || [];
    return compileMembershipTemplate(body, selectedInvoice, paymentsForSelected);
  }, [body, selectedInvoice, invoicePaymentsMap]);

  // 🔍 Missing placeholders check
  const missingTokens = useMemo(() => {
    return REQUIRED_TOKENS.filter((t) => !body.includes(t));
  }, [body]);

  // 💾 Save membership template
  const onSave = async () => {
    setStatus("Saving...");

    try {
      if (templateId) {
        const { error } = await supabase
          .from("membership_invoice_template")
          .update({ body })
          .eq("id", templateId);

        if (error) {
          console.error(error);
          setStatus(`Error: ${error.message}`);
        } else {
          setStatus("Template updated ✅");
        }
      } else {
        const { data, error } = await supabase
          .from("membership_invoice_template")
          .insert({ body })
          .select()
          .single();

        if (error) {
          console.error(error);
          setStatus(`Error: ${error.message}`);
        } else {
          setTemplateId(data.id);
          setTemplates((prev) => [data, ...prev]);
          setStatus("Template saved ✅");
        }
      }
    } catch (e) {
      console.error(e);
      setStatus("Unexpected error while saving.");
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
      {/* LEFT SIDE: Editor */}
      <div>
        <h1>Modèle facture Club – Adhésion</h1>

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
              setBody(tmpl.body);
            }
          }}
        >
          {templates.length === 0 ? (
            <option value="">Aucun modèle enregistré</option>
          ) : (
            templates.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                Modèle du {formatDateFrSafe(tmpl.updated_at || tmpl.created_at)}
              </option>
            ))
          )}
        </select>

        {/* 🧾 Invoice selector */}
        <label style={{ display: "block", margin: "12px 0 6px" }}>
          Choisir une facture d’adhésion pour aperçu
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
            <option disabled>Aucune facture Club (adhésion) trouvée</option>
          ) : (
            invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {(inv.client_name || inv.client_email || "Membre") +
                  " – " +
                  (inv.month ? formatMonth(inv.month) : "Facture Club")}
              </option>
            ))
          )}
        </select>

        <label style={{ display: "block", margin: "12px 0 6px" }}>
          Nom du modèle
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />

        <label style={{ display: "block", margin: "12px 0 6px" }}>
          Corps HTML (utiliser les placeholders comme {"{{client_name}}"})
        </label>
        <textarea
          rows={24}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: "100%", fontFamily: "monospace", padding: 12 }}
        />

        {missingTokens.length > 0 && (
          <p style={{ color: "#b91c1c", marginTop: 8 }}>
            Placeholders obligatoires manquants: {missingTokens.join(", ")}
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
          Enregistrer le modèle
        </button>

        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>

      {/* RIGHT SIDE: Live preview */}
      <div>
        <h2>Aperçu en direct</h2>
        <iframe
          title="membership-invoice-preview"
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

/* ------------------------------------------------------------------
   Membership-specific compile function and starter template
-------------------------------------------------------------------*/

// Compile placeholders for MEMBERSHIP invoices
function compileMembershipTemplate(templateHtml, invoice, payments = []) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const fmtMoney = (n) =>
    n == null || isNaN(Number(n)) ? "0.00" : Number(n).toFixed(2);

  const fmtDateFR = (d) =>
    d
      ? new Date(d).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

  // Totals
  const total = Number(invoice?.total || 0);
  const paid = Number(invoice?.paid_total || 0);
  const balance = total - paid;

  // Status & doc title
  let paymentStatus = "En attente";
  let docTitle = "Facture Club";

  if (paid >= total && total > 0) {
    paymentStatus = "Payée";
    docTitle = "Reçu Club";
  } else if (paid > 0 && paid < total) {
    paymentStatus = "Partiellement payée";
    docTitle = "Reçu Club (partiel)";
  }

  // Items (description1..7 / amount1..7)
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

  // Payments for this invoice
  const paymentsRows = (payments || [])
    .filter((p) => Number(p.amount) > 0)
    .map(
      (p) => `
  <tr>
    <td>${esc(fmtDateFR(p.paid_at || p.created_at || p.date))}</td>
    <td>${esc(p.method || "—")}</td>
    <td>USD ${fmtMoney(p.amount)}</td>
  </tr>`
    )
    .join("");

  const clientName =
    invoice.client_name ||
    invoice.full_name ||
    invoice.child_full_name ||
    invoice.client_email ||
    "—";

  let out = templateHtml
    .replaceAll("{{doc_title}}", esc(docTitle))
    .replaceAll("{{client_name}}", esc(clientName))
    .replaceAll(
      "{{client_address}}",
      esc(invoice.client_address || invoice.address || "—")
    )
    .replaceAll("{{invoice_no}}", esc(invoice.invoice_no || "—"))
    .replaceAll("{{issued_at}}", esc(formatDateFrSafe(invoice.issued_at)))
    .replaceAll("{{due_date}}", esc(formatDateFrSafe(invoice.due_date)))
    .replaceAll("{{items}}", itemsHTML)
    .replaceAll("{{total}}", fmtMoney(total))
    .replaceAll("{{paid_total}}", fmtMoney(paid))
    .replaceAll("{{balance_due}}", fmtMoney(balance))
    .replaceAll("{{payment_status}}", esc(paymentStatus))
    .replaceAll("{{logo_url}}", esc("/logo/aquador.png"))
    .replaceAll("{{school_email}}", esc("contact@clubaquador.com"));

  // Fill payments or remove block if empty
  out = out.replaceAll("{{payments}}", paymentsRows);
  if (!paymentsRows) {
    out = out.replace(/<div class="payments">[\s\S]*?<\/div>/i, "");
  }

  // Signature placeholder – keep as-is in preview
  out = out.replaceAll("{{signature_url}}", "/assets/signature.png");

  return out;
}

function getStarterMembershipTemplate() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f8f9fa; color: #222; }
    .invoice-box { max-width: 900px; margin: auto; padding: 30px; border: 1px solid #eee; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.10); }
    
    .main-header { text-align: center; margin-bottom: 10px; }
    .main-header img { max-height: 80px; margin-bottom: 10px; }
    .main-header h1 { font-size: 1.8em; color: #001f5c; }

    .separator { border-top: 2px solid #001f5c; margin: 12px 0 20px 0; }

    .sub-header { display: flex; justify-content: space-between; margin-bottom: 20px; }

    .club-info { font-size: 0.85em; font-weight: bold; line-height: 1.3; width: 55%; }
    .meta { font-size: 0.85em; width: 45%; }

    table.items { width: 100%; border-collapse: collapse; margin-top: 20px; }
    table.items th, table.items td { border: 1px solid #ddd; padding: 10px; }
    table.items th { background: #001f5c; color: #fff; }

    .summary { margin-top: 20px; }
    .summary table { width: 100%; border-collapse: collapse; }
    .summary td { padding: 6px; text-align: right; }

    .status { margin-top: 20px; font-weight: bold; text-align: right; }

    .payments { margin-top: 30px; }
    table.payments { width: 100%; border-collapse: collapse; }
    table.payments th, table.payments td { border: 1px solid #ccc; padding: 8px; }
    table.payments th { background: #001f5c; color: white; }

    .signature { margin-top: 60px; text-align: center; }
    .signature-line { border-top: 1px solid #000; width: 200px; margin: 0 auto 5px auto; }
  </style>
</head>

<body>
  <div class="invoice-box">
    
    <div class="main-header">
      <img src="{{logo_url}}" alt="Logo A'QUA D'OR" style="height:100px; width:auto; display:block; margin:0 auto;" />
      <h1>{{doc_title}} – Club A'QUA D'OR</h1>
    </div>

    <div class="separator"></div>

    <div class="sub-header">
      <div class="club-info">
        Imp Hall, Rue Beauvais, Faustin 1er<br/>
        Delmas 75, Port-au-Prince, Haïti<br/>
        Tel: +509 3891 2429<br/>
        Email: contact@clubaquador.com
      </div>

      <div class="meta">
        Client: {{client_name}}<br/>
        Email: {{client_email}}<br/>
        Plan: {{membership_label}}<br/>
        Facture #: {{invoice_no}}<br/>
        Date: {{issued_at}}<br/>
        Échéance: {{due_date}}
      </div>
    </div>

    <!-- Items Table (Dynamic: membership base + dependents + discounts) -->
    <table class="items">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Montant (USD)</th>
        </tr>
      </thead>

      <tbody>
        {{items}}
      </tbody>
    </table>

    <!-- Summary -->
    <div class="summary">
      <table>
        <tr><td><strong>Total :</strong> USD {{total}}</td></tr>
        <tr><td><strong>Payé :</strong> USD {{paid_total}}</td></tr>
        <tr><td><strong>Solde :</strong> USD {{balance_due}}</td></tr>
      </table>
    </div>

    <div class="status">
      Statut : {{payment_status}}
    </div>

    <!-- Payments Table -->
    <div class="payments">
      <h3>Paiements enregistrés</h3>
      <table class="payments">
        <thead>
          <tr><th>Date</th><th>Méthode</th><th>Montant</th></tr>
        </thead>
        <tbody>
          {{payments}}
        </tbody>
      </table>
    </div>

    <div class="signature">
      <img src="{{signature_url}}" alt="Signature" style="width:220px;" />
      <div class="signature-line"></div>
      <p>Directeur</p>
    </div>

  </div>
</body>
</html>`;
}
