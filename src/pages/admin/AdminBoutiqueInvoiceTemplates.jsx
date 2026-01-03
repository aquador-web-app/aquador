// pages/admin/boutique-invoice-template.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";

const REQUIRED_TOKENS = [
  "{{doc_title}}",
  "{{client_name}}",
  "{{client_address}}",
  "{{invoice_no}}",
  "{{issued_at}}",
  "{{items}}",
  "{{total}}",
  "{{paid_total}}",
  "{{balance_due}}",
  "{{payment_status}}",
  "{{payments}}",
];

export default function BoutiqueInvoiceTemplateEditor() {
  const [templateId, setTemplateId] = useState(null);
  const [name, setName] = useState("Facture Boutique");
  const [body, setBody] = useState(getStarterTemplate());
  const [status, setStatus] = useState("");

  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);

  // ------------------------------
  // Load boutique invoices + items
  // ------------------------------
  useEffect(() => {
    async function loadInvoices() {
      try {
        const { data, error } = await supabase
          .from("boutique_invoices")
          .select(
            `
            id,
            user_id,
            full_name,
            invoice_no,
            total,
            paid_total,
            status,
            payment_method,
            created_at,
            client_address,
            boutique_invoice_items (
              id,
              product_id,
              name,
              unit_price,
              qty,
              line_total
            )
          `
          )
          .order("created_at", { ascending: false })
          .limit(30);

        if (error) throw error;

        setInvoices(data || []);
        if (data && data.length > 0) {
          setSelectedInvoice(data[0]);
          setItems(data[0].boutique_invoice_items || []);
        }
      } catch (err) {
        console.error("Error loading boutique_invoices:", err);
        setInvoices([]);
        setSelectedInvoice(null);
        setItems([]);
      }
    }

    loadInvoices();
  }, []);

  // ------------------------------
  // Load templates (boutique-focused)
  // ------------------------------
  useEffect(() => {
    async function loadTemplates() {
      try {
        const { data, error } = await supabase
          .from("boutique_invoice_template")
          .select("id, name, body")
          .order("updated_at", { ascending: false });

        if (error) throw error;

        // Prefer templates that contain "Boutique" in name,
        // but still list everything so you can switch if needed
        const all = data || [];
        setTemplates(all);

        if (all.length > 0) {
          const preferred =
            all.find((t) =>
              (t.name || "").toLowerCase().includes("boutique")
            ) || all[0];

          setSelectedTemplate(preferred);
          setTemplateId(preferred.id);
          setName(preferred.name);
          setBody(preferred.body);
        }
      } catch (err) {
        console.error("Error loading templates:", err);
        setTemplates([]);
      }
    }

    loadTemplates();
  }, []);

  // ---------------------------------------------
  // Load payments + commission usages for invoice
  // ---------------------------------------------
  useEffect(() => {
    if (!selectedInvoice?.id) {
      setPayments([]);
      return;
    }

    (async () => {
      try {
        const invoiceId = selectedInvoice.id;

        // Normal payments
        const { data: payRows, error: payErr } = await supabase
          .from("boutique_payments")
          .select("invoice_id, method, amount, created_at, note")
          .eq("invoice_id", invoiceId)
          .order("created_at", { ascending: true });

        if (payErr) throw payErr;

        // Commission usages
        const { data: commRows, error: commErr } = await supabase
          .from("boutique_commission_usages")
          .select("invoice_id, amount_used, created_at")
          .eq("invoice_id", invoiceId)
          .order("created_at", { ascending: true });

        if (commErr) throw commErr;

        const paymentsCombined = [];

        (payRows || []).forEach((p) => {
          paymentsCombined.push({
            type: "payment",
            method: p.method,
            amount: p.amount,
            created_at: p.created_at,
            note: p.note || null,
          });
        });

        (commRows || []).forEach((c) => {
          paymentsCombined.push({
            type: "commission",
            method: "commissions",
            amount: c.amount_used,
            created_at: c.created_at,
            note: "Commission utilisée",
          });
        });

        // If nothing recorded, but invoice is paid, mimic edge-fn fallback:
        if (
          paymentsCombined.length === 0 &&
          (selectedInvoice.status || "").toLowerCase() === "paid" &&
          (selectedInvoice.paid_total || selectedInvoice.total)
        ) {
          paymentsCombined.push({
            type: "fallback",
            method: selectedInvoice.payment_method || "cash",
            amount:
              selectedInvoice.paid_total || selectedInvoice.total || 0,
            created_at:
              selectedInvoice.created_at || selectedInvoice.created_at,
            note: null,
          });
        }

        setPayments(paymentsCombined);
      } catch (err) {
        console.error("Error loading boutique payments/commissions:", err);
        setPayments([]);
      }
    })();
  }, [selectedInvoice]);

  // --------------------------------
  // Update items when invoice changes
  // --------------------------------
  useEffect(() => {
    if (!selectedInvoice) {
      setItems([]);
      return;
    }
    setItems(selectedInvoice.boutique_invoice_items || []);
  }, [selectedInvoice]);

  // ------------------------
  // Compile boutique HTML
  // ------------------------
  const compiledHtml = useMemo(() => {
    if (!selectedInvoice) return body;
    return compileTemplate(body, selectedInvoice, items, payments);
  }, [body, selectedInvoice, items, payments]);

  // ------------------------
  // Check missing tokens
  // ------------------------
  const missingTokens = useMemo(() => {
    return REQUIRED_TOKENS.filter((t) => !body.includes(t));
  }, [body]);

  // ------------------------
  // Save template
  // ------------------------
  const onSave = async () => {
    setStatus("Saving...");
    try {
      if (templateId) {
        const { error } = await supabase
          .from("boutique_invoice_template")
          .update({ name, body })
          .eq("id", templateId);

        if (error) throw error;
        setStatus("Template updated ✅");
      } else {
        const { data, error } = await supabase
          .from("boutique_invoice_template")
          .insert({ name, body })
          .select()
          .single();

        if (error) throw error;

        setTemplateId(data.id);
        setTemplates((prev) => [data, ...prev]);
        setSelectedTemplate(data);
        setStatus("Template saved ✅");
      }
    } catch (err) {
      console.error("Error saving template:", err);
      setStatus(`Error: ${err.message}`);
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
        <h1>Éditeur de modèle – Factures Boutique</h1>

        {/* Template Selector */}
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
          {templates.length === 0 && (
            <option value="">Aucun modèle enregistré</option>
          )}
          {templates.map((tmpl) => (
            <option key={tmpl.id} value={tmpl.id}>
              {tmpl.name}
            </option>
          ))}
        </select>

        {/* Invoice Selector */}
        <label style={{ display: "block", margin: "12px 0 6px" }}>
          Choisir une facture boutique pour aperçu
        </label>
        <select
          className="border rounded px-2 py-1 w-full"
          value={selectedInvoice?.id || ""}
          onChange={(e) => {
            const inv = invoices.find((i) => i.id === e.target.value);
            setSelectedInvoice(inv || null);
          }}
        >
          {invoices.length === 0 ? (
            <option value="">Aucune facture boutique trouvée</option>
          ) : (
            invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_no || "—"} –{" "}
                {inv.full_name || "Client"} –{" "}
                {formatDateFrSafe(inv.created_at)}
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
          Corps HTML (utilisez les placeholders comme {"{{client_name}}"})
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
            background: missingTokens.length ? "#9ca3af" : "#059669",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            cursor: missingTokens.length ? "not-allowed" : "pointer",
          }}
          disabled={missingTokens.length > 0}
        >
          Save Template
        </button>

        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>

      <div>
        <h2>Aperçu en direct</h2>
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

// ===============================
// Boutique compileTemplate helper
// ===============================
function compileTemplate(templateHtml, invoice, items = [], payments = []) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const fmtUSD = (v) => `${Number(v || 0).toFixed(2)} USD`;

  const fmtDateFR = (d) =>
    d
      ? new Date(d).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

  const total = Number(invoice?.total || 0);
  const paid = Number(invoice?.paid_total || 0);
  const balance = total - paid;

  const status = (invoice?.status || "").toLowerCase();
  const paymentStatus =
    status === "paid"
      ? "Payée"
      : status === "pending"
      ? "En attente"
      : "Annulée";

  const docTitle = paid >= total && total > 0 ? "Reçu Boutique" : "Facture Boutique";

  // ---- Items ----
  const itemRows =
    items && items.length
      ? items
          .map((it) => {
            const lineTotal =
              it.line_total != null
                ? Number(it.line_total)
                : Number(it.unit_price || 0) * Number(it.qty || 0);
            return `
              <tr>
                <td>${esc(it.name)} (x${it.qty})</td>
                <td style="text-align:right;">${fmtUSD(lineTotal)}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="2" style="text-align:center;">—</td></tr>`;

  // ---- Payments + commissions ----
  let hasPayments = false;
  const paymentsRows = (payments || [])
    .filter((p) => Number(p.amount) > 0)
    .map((p) => {
      hasPayments = true;
      const m = (p.method || "").toLowerCase();
      let label = "Stripe";
      if (["cash", "especes"].includes(m)) label = "Espèces";
      else if (["virement", "transfer"].includes(m)) label = "Virement";
      else if (["commission", "commissions"].includes(m)) label = "Commissions";

      return `
        <tr>
          <td>${esc(fmtDateFR(p.created_at))}</td>
          <td>${esc(label)}</td>
          <td style="text-align:right;">${fmtUSD(p.amount)}</td>
        </tr>
      `;
    })
    .join("");

  const clientAddress =
    invoice?.client_address?.trim() ||
    "—";

  let html = templateHtml
    .replaceAll("{{doc_title}}", esc(docTitle))
    .replaceAll("{{client_name}}", esc(invoice?.full_name || "Client"))
    .replaceAll("{{client_address}}", esc(clientAddress))
    .replaceAll("{{invoice_no}}", esc(invoice?.invoice_no || "—"))
    .replaceAll("{{issued_at}}", esc(fmtDateFR(invoice?.created_at)))
    .replaceAll("{{due_date}}", "—")
    .replaceAll("{{items}}", itemRows)
    .replaceAll("{{total}}", fmtUSD(total))
    .replaceAll("{{paid_total}}", fmtUSD(paid))
    .replaceAll("{{balance_due}}", fmtUSD(balance))
    .replaceAll("{{payment_status}}", esc(paymentStatus));

  // Logo & signature placeholders (for preview)
  html = html.replaceAll("{{logo_url}}", esc("/logo/aquador.png")
  );
  html = html.replaceAll(
    "{{signature_url}}",
    "/assets/signature.png"
  );

  // Payments block
  html = html.replaceAll("{{payments}}", paymentsRows || "");

  if (!hasPayments) {
    // Remove entire payments section if no payments at all
    html = html.replace(
      /<div[^>]*class=["']payments["'][^>]*>[\s\S]*?<\/div>/i,
      ""
    );
  }

  return html;
}

// ===============================
// Starter Boutique Template
// ===============================
function getStarterTemplate() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      background: #ffffff !important;
      zoom: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page__content {
      display: flex;
      justify-content: center;
    }

    .invoice-card {
      background: #ffffff !important;
      width: 880px;
      margin: 0 auto;
      padding: 28mm 20mm 38mm 20mm;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      font-size: 1.1em;
      page-break-inside: avoid;
      overflow: visible;
      border-radius: 8px;
    }

    h1, h2, h3 {
      color: #061144;
      text-align: center;
      margin: 0;
    }

    .header-logo {
      max-width: 180px;
      display: block;
      margin: 0 auto 10px auto;
    }

    .separator {
      border-top: 2px solid #061144;
      margin: 15px 0 20px 0;
    }

    .info-blocks {
      display: flex;
      justify-content: space-between;
      margin-top: 18px;
      font-size: 0.9em;
    }

    .school-info {
      width: 50%;
      line-height: 1.4;
    }

    .meta-info {
      width: 45%;
      text-align: right;
      line-height: 1.4;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 22px;
      font-size: 0.95em;
    }

    th {
      background: #061144;
      color: #ffffff;
      text-align: left;
      padding: 8px;
    }

    td {
      padding: 8px;
      border: 1px solid #ddd;
    }

    .summary table td {
      text-align: right;
      padding: 6px;
    }

    .status {
      margin-top: 16px;
      text-align: right;
      font-weight: bold;
      font-size: 1.05em;
    }

    .signature {
      text-align: center;
      margin-top: 26px;
      page-break-inside: avoid;
    }

    .signature img {
      width: 210px;
      height: auto;
      display: block;
      margin: 0 auto 0 auto;
    }

    .signature-line {
      border-top: 1px solid #000;
      width: 180px;
      margin: 0 auto 2px auto;
    }

    .signature p {
      font-weight: bold;
      margin-top: 1px;
    }
  </style>
</head>
<body>
  <section class="page">
    <div class="page__content">
      <div class="invoice-card">

        <img src="{{logo_url}}" class="header-logo" alt="Logo A'QUA D'OR" />

        <h1>{{doc_title}} – Boutique</h1>
        <div class="separator"></div>

        <div class="info-blocks">
          <div class="school-info">
            Imp Hall, Rue Beauvais, Faustin 1er<br/>
            Delmas 75, Port-au-Prince, Haïti<br/>
            Tel: +509 3891 2429<br/>
            Email: contact@clubaquador.com
          </div>

          <div class="meta-info">
            Client : {{client_name}}<br/>
            Adresse : {{client_address}}<br/>
            Facture # : {{invoice_no}}<br/>
            Date : {{issued_at}}<br/>
            Échéance : {{due_date}}
          </div>
        </div>

        <h2 style="margin-top:30px;">Détails des achats</h2>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align:right;">Montant</th>
            </tr>
          </thead>
          <tbody>
            {{items}}
          </tbody>
        </table>

        <div class="summary" style="margin-top:24px;">
          <table>
            <tr><td><strong>Total :</strong> {{total}}</td></tr>
            <tr><td><strong>Payé :</strong> {{paid_total}}</td></tr>
            <tr><td><strong>Solde :</strong> {{balance_due}}</td></tr>
          </table>
        </div>

        <div class="status">
          Statut : {{payment_status}}
        </div>

        <div class="payments">
          <h3 style="margin-top:30px;">Paiements enregistrés</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Méthode</th>
                <th style="text-align:right;">Montant</th>
              </tr>
            </thead>
            <tbody>
              {{payments}}
            </tbody>
          </table>
        </div>

        <div class="signature">
          <img src="{{signature_url}}" alt="Signature" />
          <div class="signature-line"></div>
          <p>Directeur</p>
        </div>

      </div>
    </div>
  </section>
</body>
</html>`;
}
