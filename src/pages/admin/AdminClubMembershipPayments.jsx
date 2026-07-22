// src/pages/Admin/AdminClubMembershipPayments.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";

export default function AdminClubMembershipPayments() {
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

  // Filter profiles by name
  const filteredProfiles = profiles.filter((p) =>
    (p.main_full_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // INIT --------------------------------------------------------------
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

  // FETCH MEMBERSHIP INVOICES ------------------------------------------
  async function fetchInvoices() {
  const { data, error } = await supabase
    .from("club_invoices")
    .select(`
      id,
      invoice_no,
      customer_id,
      total,
      paid_total,
      status,
      created_at
    `)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(
      "fetch membership invoices error:",
      error
    );
    setInvoices([]);
    return;
  }

  const customerIds = [
    ...new Set(
      (data || [])
        .map((invoice) => invoice.customer_id)
        .filter(Boolean)
    ),
  ];

  let profileMap = {};

  if (customerIds.length > 0) {
    const {
      data: clubProfiles,
      error: profilesError,
    } = await supabase
      .from("club_profiles")
      .select("id, main_full_name")
      .in("id", customerIds);

    if (profilesError) {
      console.error(
        "fetch invoice member names error:",
        profilesError
      );
    } else {
      profileMap = Object.fromEntries(
        (clubProfiles || []).map((profile) => [
          profile.id,
          profile.main_full_name,
        ])
      );
    }
  }

  const rows = (data || []).map((invoice) => ({
    id: invoice.id,
    invoice_no: invoice.invoice_no || invoice.id,
    full_name:
      profileMap[invoice.customer_id] ||
      "Membre inconnu",
    total: Number(invoice.total || 0),
    paid: Number(invoice.paid_total || 0),
    status: invoice.status,
    created_at: invoice.created_at,
  }));

  setInvoices(rows);
}


  // FETCH PROFILES FOR FILTERING ---------------------------------------
  async function fetchProfiles() {
    const { data, error } = await supabase
      .from("club_profiles")
      .select("id, main_full_name")
      .order("main_full_name");

    if (!error) setProfiles(data || []);
  }

  // FETCH APPROVED PAYMENTS --------------------------------------------
  async function fetchPayments() {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("club_membership_payments")
    .select(
      `
        id,
        invoice_id,
        amount,
        method,
        notes,
        paid_at,
        approved,
        proof_url
      `,
      { count: "exact" }
    )
    .eq("approved", true)
    .order("paid_at", { ascending: false })
    .range(from, to);

  if (selectedProfileId) {
    const { data: profileInvoices, error: profileInvoicesError } =
      await supabase
        .from("club_invoices")
        .select("id")
        .eq("customer_id", selectedProfileId);

    if (profileInvoicesError) {
      console.error(
        "fetch filtered membership invoices error:",
        profileInvoicesError
      );
    }

    const invoiceIds = (profileInvoices || []).map(
      (invoice) => invoice.id
    );

    if (invoiceIds.length > 0) {
      query = query.in("invoice_id", invoiceIds);
    } else {
      query = query.eq(
        "invoice_id",
        "00000000-0000-0000-0000-000000000000"
      );
    }
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("fetch approved membership payments error:", error);
    setPayments([]);
    return;
  }

  const enriched = await Promise.all(
    (data || []).map(async (payment) => {
      const { data: invoice, error: invoiceError } = await supabase
        .from("club_invoices")
        .select(`
          id,
          invoice_no,
          customer_id
        `)
        .eq("id", payment.invoice_id)
        .maybeSingle();

      if (invoiceError) {
        console.error("fetch membership invoice error:", invoiceError);
      }

      let clientName = "—";

      if (invoice?.customer_id) {
        const { data: clubProfile, error: profileError } = await supabase
          .from("club_profiles")
          .select("main_full_name")
          .eq("id", invoice.customer_id)
          .maybeSingle();

        if (profileError) {
          console.error("fetch club profile error:", profileError);
        }

        clientName = clubProfile?.main_full_name || "—";
      }

      return {
        ...payment,
        invoice,
        client_name: clientName,
      };
    })
  );

  setPayments(enriched);
  setTotalPages(
    Math.max(1, Math.ceil((count || 0) / pageSize))
  );
}


  // FETCH PENDING PAYMENTS ---------------------------------------------
  async function fetchPendingPayments() {
  const { data, error } = await supabase
    .from("club_membership_payments")
    .select(`
      id,
      invoice_id,
      amount,
      method,
      notes,
      paid_at,
      approved,
      proof_url
    `)
    .in("method", ["cash", "transfer"])
    .eq("approved", false)
    .order("paid_at", { ascending: false });

  if (error) {
    console.error("fetch pending membership payments error:", error);
    setPendingPayments([]);
    return;
  }

  const enriched = await Promise.all(
    (data || []).map(async (payment) => {
      const { data: invoice, error: invoiceError } = await supabase
        .from("club_invoices")
        .select(`
          id,
          invoice_no,
          customer_id
        `)
        .eq("id", payment.invoice_id)
        .maybeSingle();

      if (invoiceError) {
        console.error("fetch membership invoice error:", invoiceError);
      }

      let clientName = "—";

      if (invoice?.customer_id) {
        const { data: clubProfile, error: profileError } = await supabase
          .from("club_profiles")
          .select("main_full_name")
          .eq("id", invoice.customer_id)
          .maybeSingle();

        if (profileError) {
          console.error("fetch club profile error:", profileError);
        }

        clientName = clubProfile?.main_full_name || "—";
      }

      return {
        ...payment,
        invoice,
        client_name: clientName,
      };
    })
  );

  setPendingPayments(enriched);
}


  // HANDLE NEW PAYMENT -------------------------------------------------
  async function handlePayment() {
    if (!selectedInvoiceId || !amount)
      return alert("Veuillez choisir une facture et entrer un montant.");

    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const createdById = userData?.user?.id || null;

    const isPending =
      (method === "cash" || method === "transfer") && role !== "admin";

    const { error } = await supabase.from("club_membership_payments").insert([
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

    if (error) {
      setLoading(false);
      return alert("Erreur paiement: " + error.message);
    }

    setLoading(false);

    if (isPending) {
      alert("💸 Paiement soumis pour approbation.");
    } else {
      alert("✅ Paiement enregistré !");
    }

    setAmount("");
    setNotes("");
    setSelectedInvoiceId("");
    fetchInvoices();
    fetchPayments();
    fetchPendingPayments();
  }

  // APPROVE PENDING PAYMENT --------------------------------------------
  async function approvePayment(id) {
    const confirmed = await showConfirm("Approuver ce paiement ?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("club_membership_payments")
      .update({ approved: true })
      .eq("id", id);

    if (error) return showAlert("❌ Erreur: " + error.message);

    await new Promise((res) => setTimeout(res, 300));

    await showAlert("✅ Paiement approuvé !");
    fetchPendingPayments();
    fetchPayments();
    fetchInvoices();
  }

  // REJECT PENDING ------------------------------------------------------
  async function rejectPayment(id) {
    const confirmed = await showConfirm("Rejeter ce paiement ?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("club_membership_payments")
      .delete()
      .eq("id", id);

    if (error) return showAlert("❌ Erreur: " + error.message);

    await showAlert("🗑️ Paiement rejeté.");
    fetchPendingPayments();
  }

  // REVERT APPROVED PAYMENT --------------------------------------------
  async function handleRevertPayment(id) {
    const confirmed = await showConfirm(
      "Voulez-vous annuler ce paiement approuvé ?"
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("club_membership_payments")
      .update({ approved: false })
      .eq("id", id);

    if (error) return showAlert("❌ Erreur: " + error.message);

    await showAlert("♻️ Paiement renvoyé en attente.");
    fetchPayments();
    fetchPendingPayments();
    fetchInvoices();
  }

  // --------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------
  return (
    <div className="p-4 bg-white border rounded shadow">
      <h2 className="text-lg font-bold mb-4">
        Enregistrer un Paiement – Abonnement Club
      </h2>

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
            {inv.full_name} | Facture: {inv.invoice_no} | Total: USD{" "}
            {inv.total.toFixed(2)} | Payé: USD {inv.paid.toFixed(2)}
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

      {/* Pending payments */}
      <h2 className="text-lg font-bold mt-8 mb-4 text-yellow-700">
        Paiements en attente
      </h2>
      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-6">
        {pendingPayments.length === 0 ? (
          <p className="text-gray-600 text-sm text-center">
            Aucun paiement en attente.
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
                <th className="px-3 py-2 text-left">
                  {role === "admin" ? "Actions" : "Statut"}
                </th>
              </tr>
            </thead>
            <tbody>
              {pendingPayments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">
                    {p.client_name || "—"}
                  </td>

                  <td className="px-3 py-2">
                    {p.invoice?.invoice_no || p.invoice_id}
                  </td>
                  <td className="px-3 py-2">
                    USD {Number(p.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 capitalize">{p.method}</td>
                  <td className="px-3 py-2">
                    {formatDateFrSafe(p.paid_at)}
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
                      En attente d’approbation
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment history */}
      <h2 className="text-lg font-bold mb-4">Historique des Paiements</h2>

      {/* Filter by client */}
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
              {p.main_full_name}
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
                  {p.client_name || "—"}
                </td>

                <td className="px-3 py-2">
                  {p.invoice?.invoice_no || p.invoice_id}
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
                      onClick={() => handleRevertPayment(p.id)}
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
                  Aucun paiement trouvé.
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
