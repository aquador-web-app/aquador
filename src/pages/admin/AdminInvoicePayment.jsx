  import React, { useEffect, useState } from "react";
  import { supabase } from "../../lib/supabaseClient";
  import { formatDateFrSafe, formatMonth } from "../../lib/dateUtils";
  import { useGlobalAlert } from "../../components/GlobalAlert";

  export default function AdminInvoicePayment() {
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

    // role of logged user
    const [role, setRole] = useState(null);

    const filteredProfiles = profiles.filter((p) =>
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ----------------- INIT -----------------
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

    // ----------------- FETCHES -----------------
    async function fetchInvoices() {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, full_name, total, paid_total, status, due_date, month")
        .neq("status", "paid")
        .order("due_date", { ascending: true });
      if (!error) setInvoices(data);
    }

    async function fetchProfiles() {
      const { data, error } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name")
        .order("full_name");
      if (!error) setProfiles(data);
    }

    async function fetchPayments() {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("payments")
    .select(
      "id, invoice_id, amount, method, notes, paid_at, invoices(full_name, invoice_no)",
      { count: "exact" }
    )
    .eq("approved", true) // ✅ ONLY approved payments
    .order("paid_at", { ascending: false })
    .range(from, to);

  if (selectedProfileId) {
    query = query.eq("invoices.user_id", selectedProfileId);
  }

  const { data, error, count } = await query;

  if (!error) {
    setPayments(data || []);
    setTotalPages(Math.ceil((count || 0) / pageSize));
  }
}


    async function fetchPendingPayments() {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, invoice_id, amount, method, notes, paid_at, approved, invoices(full_name, invoice_no, proof_url)"
        )
        .in("method", ["cash", "transfer"])
        .eq("approved", false)
        .order("paid_at", { ascending: false });
      if (!error) setPendingPayments(data || []);
    }

    useEffect(() => {
      fetchPayments();
    }, [page, selectedProfileId]);

    // ----------------- HANDLE PAYMENT -----------------
    async function handlePayment() {
    if (!selectedInvoiceId || !amount)
      return alert("Veuillez choisir une facture et entrer un montant.");

    setLoading(true);
    const invoice = invoices.find((inv) => inv.id === selectedInvoiceId);
    if (!invoice) {
      setLoading(false);
      return alert("Facture introuvable.");
    }

    // Determine if payment should be pending approval
    const isPending =
      (method === "cash" || method === "transfer") && role !== "admin";

    // Insert the payment
    const { error: payError } = await supabase.from("payments").insert([
      {
        invoice_id: selectedInvoiceId,
        amount: Number(amount),
        method,
        notes,
        paid_at: new Date().toISOString(),
        approved: !isPending, // true if admin, false if assistant cash/transfer
        created_by: (await supabase.auth.getUser()).data.user.id,
        role: role,
      },
    ]);

    if (payError) {
      setLoading(false);
      return alert("Erreur enregistrement paiement: " + payError.message);
    }

    // Only update invoice totals immediately if payment is auto-approved
    if (!isPending) {
      const newPaidTotal = Number(invoice.paid_total) + Number(amount);
      const newStatus =
    newPaidTotal === 0
      ? "pending"
      : newPaidTotal < invoice.total
      ? "partial"
      : "paid";


      const { error: invError } = await supabase
        .from("invoices")
        .update({
          paid_total: newPaidTotal,
          status: newStatus,
        })
        .eq("id", selectedInvoiceId);

      if (invError) {
        setLoading(false);
        return alert("Erreur mise à jour facture: " + invError.message);
      }
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


    // ----------------- APPROVE / REJECT -----------------
    async function approvePayment(id) {
    const confirmed = await showConfirm("Confirmer ce paiement ?");
    if (!confirmed) return;

    try {
      // 1️⃣ Get payment + its invoice
      const { data: payment, error: fetchErr } = await supabase
        .from("payments")
        .select("id, amount, invoice_id, invoices(paid_total, total, status)")
        .eq("id", id)
        .single();

      if (fetchErr) throw fetchErr;
      if (!payment) throw new Error("Paiement introuvable.");

      // 2️⃣ Update invoice totals
      const invoice = payment.invoices;
      const newPaidTotal = (invoice.paid_total || 0) + payment.amount;

      const newStatus =
        newPaidTotal <= 0
          ? "pending"
          : newPaidTotal < invoice.total
          ? "partial"
          : "paid";

      const { error: invError } = await supabase
        .from("invoices")
        .update({
          paid_total: newPaidTotal,
          status: newStatus,
        })
        .eq("id", payment.invoice_id);

      if (invError) throw invError;

      // 3️⃣ Mark payment as approved
      const { error: payErr } = await supabase
        .from("payments")
        .update({ approved: true })
        .eq("id", id);

      if (payErr) throw payErr;

      await showAlert("✅ Paiement approuvé et facture mise à jour !");
      await fetchPendingPayments();
      await fetchPayments();
      await fetchInvoices();

    } catch (err) {
      await showAlert("❌ Erreur lors de l’approbation : " + err.message);
    }
  }



    async function rejectPayment(id) {
    const confirmed = await showConfirm("Rejeter ce paiement ?");
    if (!confirmed) return;

    try {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;

      await showAlert("🗑️ Paiement rejeté.");
      fetchPendingPayments();
    } catch (err) {
      await showAlert("❌ Erreur rejet : " + err.message);
    }
  }


      // ----------------- REVERT PAYMENT -----------------
    async function handleRevertPayment(paymentId, invoiceId) {
  const confirmed = await showConfirm(
    "Annuler ce paiement et le remettre en attente d’approbation ?"
  );
  if (!confirmed) return;

  try {
    // 1️⃣ Set payment back to pending
    const { error: revertErr } = await supabase
      .from("payments")
      .update({ approved: false })
      .eq("id", paymentId);

    if (revertErr) throw revertErr;

    // 2️⃣ Recalculate approved total
    const { data: approvedPayments, error: payErr } = await supabase
      .from("payments")
      .select("amount")
      .eq("invoice_id", invoiceId)
      .eq("approved", true);

    if (payErr) throw payErr;

    const newPaidTotal = (approvedPayments || []).reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    // 3️⃣ Fetch invoice total
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("total")
      .eq("id", invoiceId)
      .single();

    if (invErr) throw invErr;

    const newStatus =
      newPaidTotal === 0
        ? "pending"
        : newPaidTotal < invoice.total
        ? "partial"
        : "paid";

    // 4️⃣ Update invoice
    await supabase
      .from("invoices")
      .update({
        paid_total: newPaidTotal,
        status: newStatus,
      })
      .eq("id", invoiceId);

    await showAlert("🔄 Paiement remis en attente d’approbation.");
    fetchPayments();
    fetchPendingPayments();
    fetchInvoices();

  } catch (err) {
    console.error(err);
    await showAlert("❌ Erreur : " + err.message);
  }
}


    // ----------------- RENDER -----------------
    return (
      <div className="p-4 bg-white border rounded shadow">
        <h2 className="text-lg font-bold mb-4">Enregistrer un Paiement</h2>

        {/* Select invoice */}
        <label className="block mb-2 font-medium">Choisir une facture</label>
        <select
          value={selectedInvoiceId}
          onChange={(e) => setSelectedInvoiceId(e.target.value)}
          className="w-full border px-2 py-1 rounded mb-4"
        >
          <option value="">-- Sélectionner une facture --</option>
          {invoices.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.full_name} | Total: USD {inv.total} | Payé: USD{" "}
              {inv.paid_total} | Restant: USD {inv.total - inv.paid_total} | {formatMonth(inv.month)}
              
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
          {loading ? "Enregistrement..." : "Enregistrer Paiement"}
        </button>

        {/* 🔹 Pending Payments Section */}
<h2 className="text-lg font-bold mt-8 mb-4 text-yellow-700">
  Paiements en attente
</h2>

<div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-6">

  {/* EMPTY STATE */}
  {pendingPayments.length === 0 && (
    <p className="text-gray-600 text-sm text-center">
      Aucun paiement en attente.
    </p>
  )}

  {pendingPayments.length > 0 && (
    <>
      {/* ================= DESKTOP TABLE ================= */}
      <div className="hidden md:block">
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
                  {p.invoices?.full_name || "—"}
                </td>

                <td className="px-3 py-2">
                  {p.invoices?.invoice_no || "—"}
                </td>

                <td className="px-3 py-2">
                  USD {Number(p.amount).toFixed(2)}
                </td>

                <td className="px-3 py-2 capitalize">
                  {p.method}
                </td>

                <td className="px-3 py-2">
                  {formatDateFrSafe(p.paid_at)}
                </td>

                <td className="px-3 py-2">
                  {p.method === "transfer" && p.invoices?.proof_url ? (
                    <a
                      href={p.invoices.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Voir preuve
                    </a>
                  ) : (
                    "—"
                  )}
                </td>

                {role === "admin" ? (
                  <td className="px-3 py-2 flex gap-2">
                    <button
                      onClick={() => approvePayment(p.id)}
                      className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                    >
                      Approuver
                    </button>
                    <button
                      onClick={() => rejectPayment(p.id)}
                      className="bg-red-500 text-white px-2 py-1 rounded text-xs"
                    >
                      Rejeter
                    </button>
                  </td>
                ) : (
                  <td className="px-3 py-2 text-yellow-700 font-medium">
                    En attente d’approbation
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ================= MOBILE CARDS ================= */}
      <div className="md:hidden space-y-3">
        {pendingPayments.map((p) => (
          <div
            key={p.id}
            className="bg-white border rounded-lg p-3 shadow-sm"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-gray-800">
                  {p.invoices?.full_name || "—"}
                </p>
                <p className="text-xs text-gray-500">
                  Facture: {p.invoices?.invoice_no || "—"}
                </p>
              </div>

              <span className="text-sm font-bold text-yellow-700">
                USD {Number(p.amount).toFixed(2)}
              </span>
            </div>

            <div className="mt-2 text-sm space-y-1">
              <p><b>Méthode:</b> {p.method}</p>
              <p><b>Date:</b> {formatDateFrSafe(p.paid_at)}</p>

              {p.method === "transfer" && p.invoices?.proof_url && (
                <a
                  href={p.invoices.proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline text-sm"
                >
                  Voir preuve
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="mt-3">
              {role === "admin" ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => approvePayment(p.id)}
                    className="flex-1 bg-green-600 text-white px-3 py-2 rounded text-sm"
                  >
                    Approuver
                  </button>
                  <button
                    onClick={() => rejectPayment(p.id)}
                    className="flex-1 bg-red-500 text-white px-3 py-2 rounded text-sm"
                  >
                    Rejeter
                  </button>
                </div>
              ) : (
                <p className="text-yellow-700 text-sm font-medium">
                  Paiement en attente d’approbation
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )}
</div>


        {/* Payment History */}
        <h2 className="text-lg font-bold mb-4">Historique des Paiements</h2>

        {/* Filter section */}
        <div className="mb-4">
          <label className="block mb-2 font-medium">Filtrer par client</label>
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

        {/* Payments Table */}
        <div className="bg-gray-50 border rounded p-2">

  {/* DESKTOP TABLE */}
  <div className="hidden md:block">
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
                  <td className="px-3 py-2">{p.invoices?.full_name || "—"}</td>
                  <td className="px-3 py-2">{p.invoices?.invoice_no}</td>
                  <td className="px-3 py-2">
                    USD {Number(p.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">{p.method}</td>
                  <td className="px-3 py-2">{formatDateFrSafe(p.paid_at)}</td>
                  <td className="px-3 py-2">{p.notes || "—"}</td>
                {/* 🔁 Action column */}
                    {role === "admin" && (
                      <td className="px-3 py-2">
                        <button
                          onClick={() =>
                            handleRevertPayment(p.id, p.invoice_id, p.amount)
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
                  <td colSpan="6" className="text-center py-4 text-gray-500">
                    Aucun paiement trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
         {/* MOBILE CARDS */}
  <div className="md:hidden space-y-3">
    {payments.map((p) => (
      <div key={p.id} className="bg-white border rounded-lg p-3 shadow-sm">
        <div className="flex justify-between">
          <div>
            <p className="font-semibold">{p.invoices?.full_name}</p>
            <p className="text-xs text-gray-500">
              Facture: {p.invoices?.invoice_no}
            </p>
          </div>
          <span className="font-bold text-blue-700">
            USD {Number(p.amount).toFixed(2)}
          </span>
        </div>

        <div className="mt-2 text-sm space-y-1">
          <p><b>Méthode:</b> {p.method}</p>
          <p><b>Date:</b> {formatDateFrSafe(p.paid_at)}</p>
          {p.notes && <p><b>Notes:</b> {p.notes}</p>}
        </div>

        {role === "admin" && (
          <button
            onClick={() => handleRevertPayment(p.id, p.invoice_id)}
            className="mt-3 w-full bg-red-100 text-red-700 border px-3 py-2 rounded text-sm"
          >
            Annuler
          </button>
        )}
      </div>
    ))}
  </div>

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
