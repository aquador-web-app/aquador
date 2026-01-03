// src/pages/Admin/AdminClubInvoiceTemplates.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";

const REQUIRED_TOKENS = [
  "{{client_name}}",
  "{{invoice_no}}",
  "{{issued_at}}",
  "{{total}}",
  "{{paid_total}}",
  "{{balance_due}}",
  "{{payment_status}}",
];

export default function ClubInvoiceTemplateEditor() {
  const [templateId, setTemplateId] = useState(null);
  const [name, setName] = useState("Club Invoice Template");
  const [body, setBody] = useState(getStarterTemplate());
  const [status, setStatus] = useState("");

  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [invoicePaymentsMap, setInvoicePaymentsMap] = useState({}); // invoice_id -> club_payments[]

  // 🔹 Load sample club invoices
  useEffect(() => {
    async function loadInvoices() {
      // 1) Get latest club invoices
      const { data: clubInvs, error } = await supabase
        .from("club_booking_invoices")
        .select(
          `
          id,
          booking_id,
          amount_cents,
          discount_cents,
          final_amount_cents,
          currency,
          status,
          payment_status,
          client_email,
          invoice_no,
          created_at,
          updated_at
        `
        )
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Club invoices error:", error);
        return;
      }

      const invs = clubInvs || [];
      if (!invs.length) return;

      // 2) Fetch their bookings to get name + date
      const bookingIds = [...new Set(invs.map((i) => i.booking_id).filter(Boolean))];

      let bookingsMap = {};
      if (bookingIds.length) {
        const { data: bookings, error: bErr } = await supabase
          .from("venue_bookings")
          .select(
            `
            id,
            title,
            full_name,
            email,
            date,
            start_time,
            end_time,
            booking_type,
            venue,
            quantity
          `
          )
          .in("id", bookingIds);

        if (bErr) {
          console.error("Club bookings error:", bErr);
        } else {
          bookingsMap = Object.fromEntries((bookings || []).map((b) => [b.id, b]));
        }
      }

      // 3) Attach booking info & computed total fields
      const enriched = invs.map((inv) => {
        const booking = bookingsMap[inv.booking_id] || {};
        const total = (inv.final_amount_cents ?? inv.amount_cents ?? 0) / 100;
        return {
          ...inv,
          club_total: total,
          club_discount: (inv.discount_cents || 0) / 100,
          // keep compatibility with template engine:
          full_name: booking.full_name || booking.title || "Client Club",
          client_email: inv.client_email || booking.email || null,
          booking_title: booking.title || null,
          booking_date: booking.date || null,
          booking_start_time: booking.start_time || null,
          booking_end_time: booking.end_time || null,
          booking_type: booking.booking_type || null,
          booking_venue: booking.venue || null,
          booking_quantity: booking.quantity || null,
        };
      });

      setInvoices(enriched);
      setSelectedInvoice(enriched[0]);
    }

    loadInvoices();
  }, []);

  // 🔹 Load payments for selected invoice
  useEffect(() => {
    if (!selectedInvoice?.id) {
      setInvoicePaymentsMap({});
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("club_payments")
          .select("invoice_id, amount, method, paid_at")
          .eq("invoice_id", selectedInvoice.id)
          .eq("approved", true)
          .order("paid_at", { ascending: true });

        if (error) throw error;

        const map = {};
        (data || []).forEach((p) => {
          if (!map[p.invoice_id]) map[p.invoice_id] = [];
          map[p.invoice_id].push(p);
        });

        setInvoicePaymentsMap(map);
      } catch (err) {
        console.error("Error loading club payments:", err);
        setInvoicePaymentsMap({});
      }
    })();
  }, [selectedInvoice]);

  // 🔹 Load saved club templates
  useEffect(() => {
    async function loadTemplates() {
      const { data, error } = await supabase
        .from("club_invoice_template")
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
      } else if (error) {
        console.error("club_invoice_template error:", error);
      }
    }

    loadTemplates();
  }, []);

  // 🔧 Compile HTML
  const compiledHtml = useMemo(() => {
    if (!selectedInvoice) return body;
    const payments = invoicePaymentsMap[selectedInvoice.id] || [];
    return compileClubTemplate(body, selectedInvoice, payments);
  }, [body, selectedInvoice, invoicePaymentsMap]);

  // 🔍 Missing placeholders
  const missingTokens = useMemo(
    () => REQUIRED_TOKENS.filter((t) => !body.includes(t)),
    [body]
  );

  // 💾 Save template
  const onSave = async () => {
    setStatus("Saving...");
    if (templateId) {
      const { error } = await supabase
        .from("club_invoice_template")
        .update({ name, body })
        .eq("id", templateId);

      if (error) setStatus(`Error: ${error.message}`);
      else setStatus("Template updated ✅");
    } else {
      const { data, error } = await supabase
        .from("club_invoice_template")
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
        <h1>Club Invoice Template Editor</h1>

        {/* Template selector */}
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
          {templates.length === 0 && <option>Aucun modèle</option>}
          {templates.map((tmpl) => (
            <option key={tmpl.id} value={tmpl.id}>
              {tmpl.name}
            </option>
          ))}
        </select>

        {/* Invoice selector */}
        <label style={{ display: "block", margin: "12px 0 6px" }}>
          Choisir une facture club pour aperçu
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
            <option disabled>Aucune facture club trouvée</option>
          ) : (
            invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.full_name || "Client"} –{" "}
                {inv.booking_title || "Réservation Club"} –{" "}
                {inv.invoice_no || inv.id}
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
          HTML (utiliser les placeholders comme {"{{client_name}}"})
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
          title="club-invoice-preview"
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

/* ---------- Template compiler for CLUB ---------- */

function compileClubTemplate(templateHtml, invoice, payments = []) {
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
        timeZone: "America/Port-au-Prince",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

  const todayHT = new Date(
  new Date().toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
);


  const total = Number(invoice.club_total || 0);
  const paid = (payments || []).reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );
  const balance = total - paid;

  let paymentStatus = "En attente de paiement";
  let docTitle = "Facture Club";
  if (paid >= total && total > 0) {
    paymentStatus = "Payée";
    docTitle = "Reçu Club";
  } else if (paid > 0 && paid < total) {
    paymentStatus = "Partiellement payée";
    docTitle = "Reçu Club (partiel)";
  }

  // Items: for club, we use a single line describing the booking
  const desc =
    invoice.booking_title ||
    `Réservation Club A'QUA D'OR - ${invoice.booking_type || ""}`;
  const itemLine = `<tr><td>${esc(desc)}</td><td style="text-align:right">USD ${fmtMoney(
    total
  )}</td></tr>`;
  const itemsHTML = itemLine;

  // Payments table
  const paymentsRows = (payments || [])
    .filter((p) => Number(p.amount) > 0)
    .map(
      (p) => `<tr>
        <td>${esc(fmtDateFR(p.paid_at))}</td>
        <td>${esc(p.method || "—")}</td>
        <td>USD ${fmtMoney(p.amount)}</td>
      </tr>`
    )
    .join("");

  let out = templateHtml
    .replaceAll("{{doc_title}}", esc(docTitle))
    .replaceAll(
      "{{client_name}}",
      esc(invoice.full_name || "Client Club A'QUA D'OR")
    )
    .replaceAll(
      "{{client_address}}",
      esc(invoice.client_address || "—")
    )
    .replaceAll("{{invoice_no}}", esc(invoice.invoice_no || invoice.id))
    .replaceAll("{{issued_at}}", esc(fmtDateFR(invoice.created_at)))
    .replaceAll("{{due_date}}", esc(fmtDateFR(invoice.due_date)))
    .replaceAll("{{total}}", fmtMoney(total))
    .replaceAll("{{paid_total}}", fmtMoney(paid))
    .replaceAll("{{balance_due}}", fmtMoney(balance))
    .replaceAll("{{payment_status}}", esc(paymentStatus))
    .replaceAll("{{logo_url}}", esc("/logo/aquador.png"))
    .replaceAll("{{school_email}}", esc("contact@clubaquador.com"))
    // --- FIXED BOOKING PLACEHOLDERS FOR PREVIEW (use invoice.* instead of booking.*) ---
out = out
  .replaceAll("{{quantity}}", esc(invoice.booking_quantity ?? "—"))
  .replaceAll("{{booking_quantity}}", esc(invoice.booking_quantity ?? "—"))

  .replaceAll("{{booking_date}}", esc(fmtDateFR(invoice.booking_date)))
  .replaceAll(
    "{{booking_time}}",
    `${invoice.booking_start_time || "—"} → ${invoice.booking_end_time || "—"}`
  )

  .replaceAll("{{booking_start_time}}", esc(invoice.booking_start_time || "—"))
  .replaceAll("{{booking_end_time}}", esc(invoice.booking_end_time || "—"))

  .replaceAll("{{booking_type}}", esc(invoice.booking_type || "—"))
  .replaceAll(
    "{{booking_type_label}}",
    esc(
      invoice.booking_type === "full"
        ? "Réservation complète"
        : invoice.booking_type === "daypass"
        ? "Day pass"
        : invoice.booking_type || "—"
    )
  )

  .replaceAll("{{base_amount}}", fmtMoney(invoice.club_total))
  .replaceAll("{{final_amount}}", fmtMoney(invoice.club_total))

  .replaceAll("{{discount}}", fmtMoney(invoice.club_discount))
  .replaceAll("{{discount_type}}", invoice.club_discount > 0 ? "Montant" : "");



  out = out.replaceAll("{{payments}}", paymentsRows);
  if (!paymentsRows) {
    out = out.replace(/<div class="payments">[\s\S]*?<\/div>/i, "");
  }

  // Keep signature placeholder as-is (for PDF side)
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
        Facture #: {{invoice_no}}<br/>
        Date: {{issued_at}}<br/>
        Échéance: {{due_date}}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Montant (USD)</th>
        </tr>
      </thead>
<!-- Invisible required placeholder -->
{{items}}
      <tbody>

        <tr>
          <td>
            <strong>Type :</strong> {{booking_type_label}}<br/>
            <strong>Quantité :</strong> {{quantity}}<br/>
            <strong>Date :</strong> {{booking_date}}<br/>
            <strong>Heure :</strong> {{booking_time}}
          </td>
          <td style="text-align:right;">{{base_amount}}</td>
        </tr>

        <!-- The discount row will be removed automatically by the function -->
        <tr class="discount-row">
          <td><strong>Remise</strong> ({{discount_type}})</td>
          <td style="text-align:right;">-{{discount}}</td>
        </tr>

      </tbody>
    </table>

    <div class="summary">
      <table>
        <tr><td><strong>Total Final :</strong> USD {{final_amount}}</td></tr>
        <tr><td><strong>Total :</strong> USD {{total}}</td></tr>
        <tr><td><strong>Payé :</strong> USD {{paid_total}}</td></tr>
        <tr><td><strong>Solde :</strong> USD {{balance_due}}</td></tr>
      </table>
    </div>

    <div class="status">
      Statut : {{payment_status}}
    </div>

    <div class="payments">
      <h3>Paiements enregistrés</h3>
      <table class="payments">
        <thead><tr><th>Date</th><th>Méthode</th><th>Montant</th></tr></thead>
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
</html>
`;
}
