// src/pages/Admin/AdminClubInvoicePayment.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";

export default function AdminClubInvoicePayment() {
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const { showAlert, showConfirm } = useGlobalAlert();

  // payments
  const [payments, setPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  // filters
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [role, setRole] = useState(null);

  const filteredProfiles = profiles.filter((p) =>
    (p.full_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // INIT
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profile) setRole(profile.role);
      }

      fetchInvoices();
      fetchProfiles();
      fetchPendingPayments();
      fetchPayments();
    })();
  }, []);

  // FETCHES
  async function fetchInvoices() {
    // Join invoices with bookings for display
    const { data: invs, error } = await supabase
      .from("club_booking_invoices")
      .select(
        `
        id,
        booking_id,
        amount_cents,
        discount_cents,
        final_amount_cents,
        status,
        payment_status,
        invoice_no,
        created_at,
        venue_bookings:booking_id (
          full_name,
          title,
          date
        )
      `
      )
      .neq("payment_status", "paid")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("fetch club invoices error:", error);
      setInvoices([]);
      return;
    }

    const rows =
      invs?.map((inv) => {
        const total = (inv.final_amount_cents ?? inv.amount_cents ?? 0) / 100;
        return {
          id: inv.id,
          invoice_no: inv.invoice_no || inv.id,
          full_name:
            inv.venue_bookings?.full_name ||
            inv.venue_bookings?.title ||
            "Client Club",
          total,
          status: inv.status,
          payment_status: inv.payment_status,
          created_at: inv.created_at,
        };
      }) || [];

    setInvoices(rows);
  }

  async function fetchProfiles() {
    // Profiles used only for filtering payment history by client name
    const { data, error } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name")
      .order("full_name");

    if (!error) setProfiles(data || []);
  }

  async function fetchPayments() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("club_payments")
      .select(
        `
        id,
        invoice_id,
        amount,
        method,
        notes,
        paid_at,
        approved,
        proof_url,
        club_booking_invoices (
          invoice_no,
          booking_id,
          venue_bookings:booking_id ( full_name )
        )
      `,
        { count: "exact" }
      )
      .eq("approved", true)
      .order("paid_at", { ascending: false })
      .range(from, to);

    if (selectedProfileId) {
      // filter by profile full_name via subselect
      // first get bookings for that profile
      const { data: bookings } = await supabase
        .from("venue_bookings")
        .select("id, full_name, booked_by")
        .eq("booked_by", selectedProfileId);

      const bookingIds = (bookings || []).map((b) => b.id);
      if (bookingIds.length) {
        const { data: clubInvs } = await supabase
          .from("club_booking_invoices")
          .select("id, booking_id")
          .in("booking_id", bookingIds);

        const invoiceIds = (clubInvs || []).map((i) => i.id);
        if (invoiceIds.length) {
          query = query.in("invoice_id", invoiceIds);
        } else {
          query = query.eq("invoice_id", "00000000-0000-0000-0000-000000000000"); // no match
        }
      } else {
        query = query.eq("invoice_id", "00000000-0000-0000-0000-000000000000");
      }
    }

    const { data, error, count } = await query;
    if (!error) {
      setPayments(data || []);
      setTotalPages(Math.ceil((count || 0) / pageSize));
    }
  }

  async function fetchPendingPayments() {
    const { data, error } = await supabase
      .from("club_payments")
      .select(
        `
        id,
        invoice_id,
        amount,
        method,
        notes,
        paid_at,
        approved,
        proof_url,
        club_booking_invoices (
          invoice_no,
          booking_id,
          venue_bookings:booking_id ( full_name )
        )
      `
      )
      .in("method", ["cash", "transfer"])
      .eq("approved", false)
      .order("paid_at", { ascending: false });

    if (!error) setPendingPayments(data || []);
  }

  useEffect(() => {
    fetchPayments();
  }, [page, selectedProfileId]);

  // -------------- HANDLE PAYMENT --------------
  async function handlePayment() {
    if (!selectedInvoiceId || !amount)
      return alert("Veuillez choisir une facture club et entrer un montant.");

    setLoading(true);
    const invoice = invoices.find((inv) => inv.id === selectedInvoiceId);
    if (!invoice) {
      setLoading(false);
      return alert("Facture club introuvable.");
    }

    const { data: userData } = await supabase.auth.getUser();
    const createdById = userData?.user?.id || null;

    const isPending =
      (method === "cash" || method === "transfer") && role !== "admin";

    const { error: payError } = await supabase.from("club_payments").insert([
      {
        invoice_id: selectedInvoiceId,
        amount: Number(amount),
        method,
        notes,
        paid_at: new Date().toISOString(),
        approved: !isPending,
        created_by: createdById,
        role,
      },
    ]);

    if (payError) {
      setLoading(false);
      return alert("Erreur enregistrement paiement: " + payError.message);
    }

    if (!isPending) {
      // update payment_status based on all approved payments
      await recomputeClubInvoicePaymentStatus(selectedInvoiceId);
    }

    setLoading(false);

    if (isPending) {
      alert("💸 Paiement soumis pour approbation par l’administrateur.");
    } else {
      alert("✅ Paiement enregistré et approuvé automatiquement !");
    }

    setAmount("");
    setNotes("");
    setSelectedInvoiceId("");
    fetchInvoices();
    fetchPayments();
    fetchPendingPayments();
  }

  async function recomputeClubInvoicePaymentStatus(invoiceId) {
    // get invoice & its approved payments
    const { data: inv, error: invErr } = await supabase
      .from("club_booking_invoices")
      .select("id, booking_id, amount_cents, final_amount_cents")
      .eq("id", invoiceId)
      .single();

    if (invErr || !inv) return;

    const { data: pays, error: payErr } = await supabase
      .from("club_payments")
      .select("amount")
      .eq("invoice_id", invoiceId)
      .eq("approved", true);

    if (payErr) return;

    const total = (inv.final_amount_cents ?? inv.amount_cents ?? 0) / 100;
    const paid = (pays || []).reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    let newStatus = "unpaid";
  if (paid > 0 && paid < total) newStatus = "partial";
  else if (paid >= total) newStatus = "paid";

  // 3️⃣ Update invoice FIRST (source of truth)
  await supabase
    .from("club_booking_invoices")
    .update({ payment_status: newStatus })
    .eq("id", invoiceId);

  // 4️⃣ ONLY if fully paid → confirm booking
  if (newStatus === "paid" && inv.booking_id) {
    await supabase
      .from("venue_bookings")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.booking_id);
  }
}

  
  // -------------- APPROVE / REJECT PENDING --------------
async function approvePayment(id) {
  const confirmed = await showConfirm("Confirmer ce paiement club ?");
  if (!confirmed) return;

  try {
    const { data: payment, error: fetchErr } = await supabase
      .from("club_payments")
      .select(
        `
        id,
        amount,
        invoice_id
      `
      )
      .eq("id", id)
      .single();

    if (fetchErr) throw fetchErr;
    if (!payment) throw new Error("Paiement introuvable.");

    const { error: payErr } = await supabase
      .from("club_payments")
      .update({ approved: true })
      .eq("id", id);

    if (payErr) throw payErr;

    // 🔥 WAIT for Supabase to commit update
    await new Promise((res) => setTimeout(res, 300));

    // 1️⃣ Recompute payment_status on the invoice
    await recomputeClubInvoicePaymentStatus(payment.invoice_id);

    // We'll store the latest invoice + QR URL here
    let latestInvoice = null;
    let qrUrl = null;

    // 2️⃣ Regenerate the Club Invoice PDF immediately
    try {
      const endpoint = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/generate-club-invoice-pdf`;
      const pdfRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: payment.invoice_id }),
      });

      const pdfData = await pdfRes.json().catch(() => ({}));
      console.log("📄 Club PDF regenerate result:", pdfData);

      if (!pdfRes.ok) {
        console.error("❌ Failed to regenerate club PDF:", pdfData);
      }

      // 🔁 Refetch invoice to get fresh pdf_url + client_email + full_name
      const { data: inv, error: invErr } = await supabase
        .from("club_booking_invoices")
        .select(
          `
          id,
          pdf_url,
          client_email,
          venue_bookings:booking_id ( full_name )
        `
        )
        .eq("id", payment.invoice_id)
        .single();

      if (!invErr && inv) {
        latestInvoice = inv;
      } else {
        console.warn("⚠️ Unable to refetch updated club invoice:", invErr);
      }
    } catch (pdfErr) {
      console.error("🔥 Error regenerating club PDF:", pdfErr);
    }

    // 3️⃣ Generate QR code for the approved payment and capture its URL
    try {
      const qrEndpoint = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/generate-club-qr-code`;
      const qrRes = await fetch(qrEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: payment.invoice_id,
        }),
      });

      const qrData = await qrRes.json().catch(() => ({}));
      console.log("🎟️ Club QR code generation result:", qrData);

      if (!qrRes.ok) {
        console.error("❌ Failed to generate QR code:", qrData);
      } else if (qrData?.qr_url) {
        qrUrl = qrData.qr_url;
      }
    } catch (qrErr) {
      console.error("🔥 Error generating QR code:", qrErr);
    }

    // 4️⃣ Send receipt email if we have all needed info
    try {
      if (latestInvoice?.client_email && latestInvoice?.pdf_url && qrUrl) {
        const fullName =
          latestInvoice.venue_bookings?.full_name || "Client Club";

        const emailEndpoint = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/send-club-receipt-email`;

        const emailRes = await fetch(emailEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName,
            email: latestInvoice.client_email,
            invoice_pdf_url: latestInvoice.pdf_url,
            qr_url: qrUrl,
            invoice_id: payment.invoice_id,
          }),
        });

        const emailData = await emailRes.json().catch(() => ({}));
        console.log("📧 Club receipt email result:", emailData);

        if (!emailRes.ok) {
          console.error("❌ Failed to send club receipt email:", emailData);
        }
      } else {
        console.warn("⚠️ Not sending receipt email – missing data:", {
          latestInvoice,
          qrUrl,
        });
      }
    } catch (mailErr) {
      console.error("🔥 Error sending club receipt email:", mailErr);
    }

    await showAlert("✅ Paiement club approuvé et facture mise à jour !");
    await fetchPendingPayments();
    await fetchPayments();
    await fetchInvoices();
  } catch (err) {
    await showAlert("❌ Erreur lors de l’approbation : " + err.message);
  }
}


  async function rejectPayment(id) {
    const confirmed = await showConfirm("Rejeter ce paiement club ?");
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("club_payments")
        .delete()
        .eq("id", id);
      if (error) throw error;

      await showAlert("🗑️ Paiement club rejeté.");
      fetchPendingPayments();
    } catch (err) {
      await showAlert("❌ Erreur rejet : " + err.message);
    }
  }

  // -------------- REVERT PAYMENT --------------
  async function handleRevertPayment(paymentId, invoiceId) {
  const confirmed = await showConfirm(
    "Voulez-vous vraiment annuler ce paiement club ?"
  );
  if (!confirmed) return;

  try {
    // 1️⃣ Move payment back to pending (NOT DELETE)
    const { error: updErr } = await supabase
      .from("club_payments")
      .update({
        approved: false,     // <--- BACK TO PENDING
      })
      .eq("id", paymentId);

    if (updErr) throw updErr;

    // 2️⃣ Reset invoice status
    await supabase
      .from("club_booking_invoices")
      .update({
        status: "sent",
        payment_status: "unpaid",
        payment_method: null,
        pdf_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    // 3️⃣ Invalidate QR codes
    await supabase
      .from("club_qr_validations")
      .delete()
      .eq("invoice_id", invoiceId);

    // 4️⃣ Regenerate the CLEAN invoice PDF (no receipt)
    try {
      const regen = await fetch(
        `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/generate-club-invoice-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice_id: invoiceId,
            trigger: "draft-reset",
          }),
        }
      );

      console.log("♻️ Revert regenerate result:", await regen.json());
    } catch (e) {
      console.error("PDF regenerate after revert failed:", e);
    }

    // 5️⃣ Refresh UI
    await showAlert("♻️ Paiement renvoyé en attente d’approbation.");
    await fetchPayments();
    await fetchInvoices();
    await fetchPendingPayments();

  } catch (err) {
    console.error("Erreur revert club:", err);
    await showAlert("❌ Erreur lors de l’annulation : " + err.message);
  }
}



  // -------------- RENDER --------------
  return (
    <div className="p-4 bg-white border rounded shadow">
      <h2 className="text-lg font-bold mb-4">
        Enregistrer un Paiement – Club
      </h2>

      {/* Select invoice */}
      <label className="block mb-2 font-medium">Choisir une facture club</label>
      <select
        value={selectedInvoiceId}
        onChange={(e) => setSelectedInvoiceId(e.target.value)}
        className="w-full border px-2 py-1 rounded mb-4"
      >
        <option value="">-- Sélectionner une facture club --</option>
        {invoices.map((inv) => (
          <option key={inv.id} value={inv.id}>
            {inv.full_name} | Facture: {inv.invoice_no} | Total: USD{" "}
            {inv.total.toFixed(2)} | Payment status: {inv.payment_status || "unpaid"}
          </option>
        ))}
      </select>

      {/* Amount */}
      <label className="block mb-2 font-medium">Montant payé</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full border px-2 py-1 rounded mb-4"
      />

      {/* Method */}
      <label className="block mb-2 font-medium">Méthode de paiement</label>
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value)}
        className="w-full border px-2 py-1 rounded mb-4"
      >
        <option value="cash">Espèces</option>
        <option value="card">Carte</option>
        <option value="transfer">Virement</option>
        <option value="other">Autre</option>
      </select>

      {/* Notes */}
      <label className="block mb-2 font-medium">Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full border px-2 py-1 rounded mb-4"
      ></textarea>

      {/* Submit */}
      <button
        onClick={handlePayment}
        disabled={loading}
        className="bg-aquaBlue text-white px-4 py-2 rounded hover:bg-orange-600"
      >
        {loading ? "Enregistrement..." : "Enregistrer Paiement Club"}
      </button>

      {/* Pending payments */}
      <h2 className="text-lg font-bold mt-8 mb-4 text-yellow-700">
        Paiements club en attente
      </h2>
      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-6">
        {pendingPayments.length === 0 ? (
          <p className="text-gray-600 text-sm text-center">
            Aucun paiement club en attente.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-yellow-100">
              <tr>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-left">Facture</th>
                <th className="px-3 py-2 text-left">Montant</th>
                <th className="px-3 py-2 text-left">Méthode</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Preuve</th>
                <th className="px-3 py-2 text-left">
                  {role === "admin" ? "Actions" : "Statut"}
                </th>
              </tr>
            </thead>
            <tbody>
              {pendingPayments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">
                    {p.club_booking_invoices?.venue_bookings?.full_name ||
                      "—"}
                  </td>
                  <td className="px-3 py-2">
                    {p.club_booking_invoices?.invoice_no || p.invoice_id}
                  </td>
                  <td className="px-3 py-2">
                    USD {Number(p.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 capitalize">{p.method}</td>
                  <td className="px-3 py-2">
                    {formatDateFrSafe(p.paid_at)}
                  </td>
                  <td className="px-3 py-2">
  {p.proof_url ? (
    <a
      href={p.proof_url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-800"
    >
      Voir
    </a>
  ) : (
    "—"
  )}
</td>


                  {role === "admin" ? (
                    <td className="px-3 py-2 flex gap-2">
                      <button
                        onClick={() => approvePayment(p.id)}
                        className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                      >
                        Approuver
                      </button>
                      <button
                        onClick={() => rejectPayment(p.id)}
                        className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600"
                      >
                        Rejeter
                      </button>
                    </td>
                  ) : (
                    <td className="px-3 py-2 text-yellow-700 font-medium">
                      Paiement en attente d’approbation
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment history */}
      <h2 className="text-lg font-bold mb-4">Historique des Paiements Club</h2>

      {/* Filter by client */}
      <div className="mb-4">
        <label className="block mb-2 font-medium">
          Filtrer par client (club)
        </label>
        <input
          type="text"
          placeholder="Rechercher un client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full border px-2 py-1 rounded mb-2"
        />
        <select
          value={selectedProfileId}
          onChange={(e) => {
            setSelectedProfileId(e.target.value);
            setPage(1);
          }}
          className="w-full border px-2 py-1 rounded"
        >
          <option value="">-- Tous les clients --</option>
          {filteredProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* Payments table */}
      <div className="bg-gray-50 border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="px-3 py-2 text-left">Nom</th>
              <th className="px-3 py-2 text-left">Facture</th>
              <th className="px-3 py-2 text-left">Montant</th>
              <th className="px-3 py-2 text-left">Méthode</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Notes</th>
              {role === "admin" && (
                <th className="px-3 py-2 text-left">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">
                  {p.club_booking_invoices?.venue_bookings?.full_name || "—"}
                </td>
                <td className="px-3 py-2">
                  {p.club_booking_invoices?.invoice_no || p.invoice_id}
                </td>
                <td className="px-3 py-2">
                  USD {Number(p.amount).toFixed(2)}
                </td>
                <td className="px-3 py-2">{p.method}</td>
                <td className="px-3 py-2">
                  {formatDateFrSafe(p.paid_at)}
                </td>
                <td className="px-3 py-2">{p.notes || "—"}</td>
                {role === "admin" && (
                  <td className="px-3 py-2">
                    <button
                      onClick={() =>
                        handleRevertPayment(p.id, p.invoice_id)
                      }
                      className="bg-red-100 text-red-700 border border-red-300 px-2 py-1 text-xs rounded hover:bg-red-200"
                    >
                      Annuler
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-4 text-gray-500">
                  Aucun paiement club trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between p-3">
        <span className="text-xs text-gray-600">
          Page {page} / {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            className="px-2 py-1 border rounded disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Précédent
          </button>
          <button
            className="px-2 py-1 border rounded disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
