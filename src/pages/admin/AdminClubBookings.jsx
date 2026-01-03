// src/pages/Admin/AdminClubBookings.jsx
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useGlobalAlert } from "../../components/GlobalAlert";

function cleanTime(t) {
  if (!t) return "—";

  // Fix "10" → "10:00"
  if (!t.includes(":")) return t + ":00";

  let [hh, mm] = t.split(":");

  hh = hh.padStart(2, "0");
  mm = (mm || "00").padStart(2, "0");

  return `${hh}:${mm}`;
}

function toYMDLocal(d) {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // ← NO TIMEZONE SHIFT
}

function formatDateLocalFR(ymd) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d)); // LOCAL date
  return dt.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function AdminClubBookings() {
  const [bookings, setBookings] = useState([]);
  const [invoiceMap, setInvoiceMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const { showAlert } = useGlobalAlert();

  // 🔎 Filters
  const [statusFilter, setStatusFilter] = useState("pending");
  const [bookingTypeFilter, setBookingTypeFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("");
  const [search, setSearch] = useState("");

  // 💸 Discount by row
  const [discountType, setDiscountType] = useState({});
  const [discountValue, setDiscountValue] = useState({});

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, monthFilter, bookingTypeFilter]);

  async function loadBookings() {
    setLoading(true);
    setFeedback("");

    try {
      let query = supabase.from("venue_bookings").select("*");

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (bookingTypeFilter !== "all")
        query = query.eq("booking_type", bookingTypeFilter);

      if (monthFilter) {
        const [y, m] = monthFilter.split("-");
        const start = new Date(Number(y), Number(m) - 1, 1);
        const end = new Date(Number(y), Number(m), 1);

        const startStr = toYMDLocal(start);
        const endStr = toYMDLocal(end);

        query = query.gte("date", startStr).lt("date", endStr);
      }

      const { data, error } = await query.order("date", { ascending: true });
      if (error) throw error;

      const rows = data || [];
      setBookings(rows);

      const invoiceIds = [
        ...new Set(rows.map((b) => b.club_invoice_id).filter(Boolean)),
      ];


      if (invoiceIds.length) {
        const { data: invs, error: invErr } = await supabase
          .from("club_booking_invoices")
          .select("id, invoice_no, amount_cents, discount_cents, final_amount_cents, payment_status, status, pdf_url")
          .in("id", invoiceIds);

        if (invErr) {
          console.error("Invoice fetch error:", invErr.message);
          setInvoiceMap({});
        } else {
          const map = {};
          (invs || []).forEach((inv) => (map[inv.id] = inv));
          setInvoiceMap(map);
        }
      } else {
        setInvoiceMap({});
      }
    } catch (err) {
      console.error("loadBookings error:", err);
      setFeedback("❌ Erreur lors du chargement des réservations.");
    } finally {
      setLoading(false);
    }
  }

  async function approveBooking(b) {
  try {

    // 1️⃣ RELOAD latest booking from Supabase (CRITICAL)
    const { data: fresh, error: freshErr } = await supabase
      .from("venue_bookings")
      .select("*")
      .eq("id", b.id)
      .single();

    if (freshErr || !fresh) {
      showAlert("❌ Impossible de recharger la réservation.");
      return;
    }

    // Always use FRESH data
    const booking = fresh;

    // 2️⃣ Normalize discount input using booking.id (NOT b.id)
    const rawDisc = discountValue[booking.id];
    const discVal =
      rawDisc === "" || rawDisc === null || rawDisc === undefined
        ? 0
        : Number(rawDisc);

    const discType = discountType[booking.id] || "amount";

    // 3️⃣ Call the RPC with *fresh booking*
    const { data, error } = await supabase.rpc(
      "approve_booking_request",
      {
        p_booking_id: booking.id,
        p_discount_value: discVal,
        p_discount_type: discType,
      }
    );


      if (error) {
        console.error("approve_booking_request RPC error:", error);
        showAlert("❌ " + error.message);
        setFeedback("❌ " + error.message);
        return;
      }

      if (!data || data.error) {
        const msgErr =
          data?.error || "Réponse invalide depuis approve_booking_request.";
        console.error("approve_booking_request logic error:", data);
        showAlert("❌ " + msgErr);
        setFeedback("❌ " + msgErr);
        return;
      }

      const finalAmount = Number(
        data.final ?? data.amount ?? 0
      );

      const msg = `Réservation approuvée (${b.title}). Facture: $${finalAmount.toFixed(
        2
      )}`;
      showAlert("✅ " + msg);
      setFeedback("✅ " + msg);

      // 2️⃣ Generate FINAL PDF for this invoice
      if (data.invoice_id) {
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-club-invoice-pdf`;
        try {
          const pdfResponse = await fetch(fnUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invoice_id: data.invoice_id,
              trigger: "approval",
            }),
          });

          if (!pdfResponse.ok) {
            const txt = await pdfResponse.text().catch(() => "");
            console.error(
              "PDF generation failed:",
              pdfResponse.status,
              txt
            );
            showAlert(
              "⚠️ Réservation approuvée, mais la génération du PDF a échoué. Vous pourrez réessayer depuis les factures Club."
            );
          }
        } catch (err) {
          console.error("PDF generation network error:", err);
          showAlert(
            "⚠️ Réservation approuvée, mais erreur réseau lors de la génération du PDF."
          );
        }
      }

      // Refresh table
      loadBookings();
    } catch (err) {
      console.error("approveBooking fatal error:", err);
      showAlert(
        "❌ Erreur inattendue lors de l'approbation de la réservation."
      );
      setFeedback("❌ Erreur inattendue lors de l'approbation.");
    }
  }

  async function updateBookingStatus(id, newStatus, msg) {
    const { error } = await supabase
      .from("venue_bookings")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      console.error(error);
      showAlert("❌ " + error.message);
      setFeedback("❌ " + error.message);
      return;
    }

    showAlert(msg);
    setFeedback(msg);
    loadBookings();
  }

  async function rejectBooking(id) {
  try {
    // 1️⃣ Load booking with invoice id
    const { data: booking, error: loadErr } = await supabase
      .from("venue_bookings")
      .select("id, club_invoice_id, full_name")
      .eq("id", id)
      .single();

    if (loadErr || !booking) {
      showAlert("❌ Impossible de charger la réservation.");
      return;
    }

    const invoiceId = booking.club_invoice_id;

    // 2️⃣ If invoice exists → CASCADE DELETE
    if (invoiceId) {
      // 2a) Load invoice for file names
      const { data: invoice, error: invErr } = await supabase
        .from("club_booking_invoices")
        .select("id, invoice_no")
        .eq("id", invoiceId)
        .single();

      if (!invErr && invoice) {
        const rawName =
  booking.full_name ||
  booking.name ||
  booking.contact_name ||
  "booking";

const safeName = String(rawName)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "_")
  .replace(/[^\w\-./]/g, "");


        const rawInvNo =
  invoice.invoice_no ||
  invoice.id ||
  "invoice";

const safeInvNo = String(rawInvNo)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "_")
  .replace(/[^\w\-./]/g, "");


        const pdfPath = `${safeName}/${safeInvNo}.pdf`;
        const htmlPath = `${safeName}/${safeInvNo}.html`;

        // 2b) Delete storage files
        try {
  await supabase.storage
    .from("club_invoices")
    .remove([pdfPath, htmlPath]);
} catch (e) {
  console.warn("⚠️ Storage delete skipped:", e?.message);
}
      }

      const { error: payErr } = await supabase
  .from("club_payments")
  .delete()
  .eq("invoice_id", invoiceId);

if (payErr) {
  console.error("Payment delete error:", payErr);
  throw payErr;
}

const { error: invDelErr } = await supabase
  .from("club_booking_invoices")
  .delete()
  .eq("id", invoiceId);

if (invDelErr) {
  console.error("Invoice delete error:", invDelErr);
  throw invDelErr;
}
    }

    // 3️⃣ Delete booking itself
    const { error: delBookErr } = await supabase
      .from("venue_bookings")
      .delete()
      .eq("id", id);

    if (delBookErr) {
      console.error("Booking delete error:", delBookErr);
      showAlert("❌ Impossible de supprimer la réservation.");
      return;
    }

    // 4️⃣ Done
    showAlert("🚫 Réservation rejetée et supprimée entièrement.");
    loadBookings();

  } catch (err) {
  console.error("rejectBooking fatal error FULL:", err);
  showAlert("❌ " + (err?.message || JSON.stringify(err)));
}
}


  async function cancelBooking(id) {
  try {
    // 1️⃣ Load booking with invoice id
    const { data: booking, error: loadErr } = await supabase
      .from("venue_bookings")
      .select("id, club_invoice_id, full_name")
      .eq("id", id)
      .single();

    if (loadErr || !booking) {
      showAlert("❌ Impossible de charger la réservation.");
      return;
    }

    const invoiceId = booking.club_invoice_id;

    // 2️⃣ If invoice exists → prepare for deletion
    if (invoiceId) {

      // 2a) Load invoice to get invoice_no and file paths
      const { data: invoice, error: invErr } = await supabase
        .from("club_booking_invoices")
        .select("id, invoice_no")
        .eq("id", invoiceId)
        .single();

      if (invErr) {
        console.error("Invoice load error:", invErr);
      } else if (invoice) {
        const rawName =
  booking.full_name ||
  booking.name ||
  booking.contact_name ||
  "booking";

const safeName = String(rawName)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "_")
  .replace(/[^\w\-./]/g, "");


        const rawInvNo =
  invoice.invoice_no ||
  invoice.id ||
  "invoice";

const safeInvNo = String(rawInvNo)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "_")
  .replace(/[^\w\-./]/g, "");


        const pdfPath = `${safeName}/${safeInvNo}.pdf`;
        const htmlPath = `${safeName}/${safeInvNo}.html`;

        // 2b) Delete PDF & HTML from storage
        try {
  await supabase.storage
    .from("club_invoices")
    .remove([pdfPath, htmlPath]);
} catch (e) {
  console.warn("⚠️ Storage delete skipped:", e?.message);
}

      }

      // 2c) Delete linked payments
      await supabase
        .from("club_payments")
        .delete()
        .eq("invoice_id", invoiceId);

      // 2d) Delete invoice itself
      const { error: delInvErr } = await supabase
        .from("club_booking_invoices")
        .delete()
        .eq("id", invoiceId);

      if (delInvErr) {
        console.error("Invoice delete error:", delInvErr);
      }
    }

    // 3️⃣ Delete the booking row
    const { error: delBookErr } = await supabase
      .from("venue_bookings")
      .delete()
      .eq("id", id);

    if (delBookErr) {
      console.error("Booking delete error:", delBookErr);
      showAlert("❌ Erreur: la réservation n'a pas pu être supprimée.");
      return;
    }

    // 4️⃣ Done
    showAlert("🚫 Réservation et facture supprimées complètement.");
    loadBookings();

  } catch (err) {
    console.error("cancelBooking fatal error:", err);
    showAlert("❌ Erreur inattendue lors de la suppression.");
  }
}


  async function completeBooking(id) {
    await updateBookingStatus(id, "completed", "✅ Réservation complétée.");
  }

  async function handlePayNow(invoice_id) {
    try {
      const res = await fetch("/functions/v1/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        showAlert("Erreur: impossible de démarrer le paiement");
      }
    } catch (err) {
      console.error(err);
      showAlert("Erreur réseau lors de l'initialisation du paiement");
    }
  }

  function exportCsv() {
    if (!bookings.length) return;

    const headers = [
      "Titre",
      "Nom",
      "Date",
      "Début",
      "Fin",
      "Type",
      "Quantité",
      "Lieu",
      "Statut",
      "Invoice ID",
    ];

    const rows = bookings.map((b) => [
      b.title || "",
      b.name || b.full_name || "",
      b.date || "",
      cleanTime(b.start_time),
      cleanTime(b.end_time),
      b.booking_type || "",
      b.quantity ?? "",
      b.venue || "",
      b.status || "",
      b.club_invoice_id || "",
    ]);

    const csvContent =
      [headers, ...rows]
        .map((row) =>
          row
            .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\n") + "\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "club_reservations.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdfLike() {
    const win = window.open("", "_blank");
    if (!win) return;

    const title = "Réservations du Club A'QUA D'OR";

    const rowsHtml = bookings
      .map((b) => {
        const dateStr = formatDateLocalFR(b.date);
        return `
          <tr>
            <td>${b.title || ""}</td>
            <td>${b.name || b.full_name || ""}</td>
            <td>${dateStr}</td>
            <td>${cleanTime(b.start_time)}</td>
            <td>${cleanTime(b.end_time)}</td>
            <td>${b.booking_type || ""}</td>
            <td>${b.quantity ?? ""}</td>
            <td>${b.venue || ""}</td>
            <td>${b.status || ""}</td>
            <td>${b.club_invoice_id || ""}</td>
          </tr>
        `;
      })
      .join("");

    win.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 20px; margin-bottom: 10px; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
            th { background: #0f766e; color: white; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p>Période filtrée: ${
            monthFilter || "Toutes les dates"
          } — Statut: ${statusFilter}</p>
          <table>
            <thead>
              <tr>
                <th>Titre</th>
                <th>Nom</th>
                <th>Date</th>
                <th>Début</th>
                <th>Fin</th>
                <th>Type</th>
                <th>Qté</th>
                <th>Lieu</th>
                <th>Statut</th>
                <th>Invoice ID</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  }

  const filteredBookings = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return bookings;

    return bookings.filter((b) => {
      const fields = [
        b.title,
        b.name,
        b.full_name,
        b.venue,
        b.booking_type,
        b.status,
      ];
      return fields.some((f) =>
        String(f || "").toLowerCase().includes(term)
      );
    });
  }, [bookings, search]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-bold">Gérer les réservations du club</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={loadBookings}
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
          >
            🔄 Rafraîchir
          </button>
          <button
            onClick={exportCsv}
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
          >
            ⬇️ Export CSV
          </button>
          <button
            onClick={exportPdfLike}
            className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm"
          >
            🖨️ Imprimer / PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 mb-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Statut</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="pending">En attente</option>
            <option value="approved">Approuvée</option>
            <option value="completed">Complétée</option>
            <option value="rejected">Rejetée</option>
            <option value="cancelled">Annulée</option>
            <option value="all">Tous</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">
            Type de réservation
          </label>
          <select
            value={bookingTypeFilter}
            onChange={(e) => setBookingTypeFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="all">Tous</option>
            <option value="daypass">Day Pass</option>
            <option value="venue">Venue / Evénement</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">
            Mois (YYYY-MM)
          </label>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-gray-600 mb-1">
            Recherche (titre, nom, lieu…)
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-full"
            placeholder="Rechercher…"
          />
        </div>
      </div>

      {feedback && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 px-4 py-2 rounded mb-4">
          {feedback}
        </div>
      )}

      {loading ? (
        <p>Chargement...</p>
      ) : filteredBookings.length === 0 ? (
        <p className="text-gray-500 italic">
          Aucune réservation trouvée pour ces filtres.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border rounded-lg bg-white shadow text-sm">
            <thead className="bg-emerald-700 text-white text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Titre</th>
                <th className="px-3 py-2 text-left">Nom</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Heure</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Qté</th>
                <th className="px-3 py-2">Lieu</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Facture</th>
                <th className="px-3 py-2">Remise</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((b) => {
                // Base estimate: MUST match SQL logic
                const inv = b.club_invoice_id
  ? invoiceMap[b.club_invoice_id]
  : null;

const estimate = inv
  ? Number(inv.final_amount_cents ?? inv.amount_cents ?? 0) / 100
  : 0;

                const isPaid = inv?.payment_status === "paid";

                const isPending = b.status === "pending";
                const isApproved = b.status === "approved";

                let statusColor =
                  b.status === "pending"
                    ? "bg-yellow-100 text-yellow-800"
                    : b.status === "approved"
                    ? "bg-blue-100 text-blue-800"
                    : b.status === "completed"
                    ? "bg-emerald-100 text-emerald-800"
                    : b.status === "rejected" ||
                      b.status === "cancelled"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-200 text-gray-800";

                return (
                  <tr key={b.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">
                      <div>{b.title}</div>
                      {b.notes && (
                        <div className="text-xs text-gray-500">
                          {b.notes.length > 80
                            ? b.notes.slice(0, 80) + "…"
                            : b.notes}
                        </div>
                      )}
                    </td>

                    {/* Name + email */}
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {b.name ||
                          b.full_name ||
                          b.contact_name ||
                          "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {b.email || "—"}
                      </div>
                    </td>

                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {formatDateLocalFR(b.date)}
                    </td>

                    <td className="px-3 py-2 text-center text-xs">
                      {cleanTime(b.start_time)}{" "}
                      {b.end_time
                        ? `→ ${cleanTime(b.end_time)}`
                        : ""}
                    </td>

                    <td className="px-3 py-2 text-center">
                      {b.booking_type || "—"}
                    </td>

                    <td className="px-3 py-2 text-center">
                      {b.quantity}
                    </td>

                    <td className="px-3 py-2 text-center">
                      {b.venue || "—"}
                    </td>

                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}
                      >
                        {b.status || "—"}
                      </span>
                    </td>

                    {/* Facture */}
                    <td className="px-3 py-2 text-xs">
                      {!b.club_invoice_id ? (
                        <span className="text-gray-400 italic">
                          Aucune
                        </span>
                      ) : (
                        <div className="space-y-1">
                          <div>
                            <span className="font-semibold">
                              {inv?.invoice_no || "—"}
                            </span>
                          </div>
                          <div>
                            {inv
                              ? `$${(Number(inv.final_amount_cents ?? 0) / 100).toFixed(2)}`
                              : "Montant: —"}
                          </div>
                          <div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isPaid
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-orange-100 text-orange-800"
                              }`}
                            >
                              {isPaid ? "Payée" : "Non payée"}
                            </span>
                          </div>
                          {inv?.pdf_url && (
                            <button
                              type="button"
                              onClick={() =>
                                window.open(
                                  inv.pdf_url,
                                  "_blank"
                                )
                              }
                              className="text-[10px] underline text-sky-700"
                            >
                              Voir PDF
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Remise + live total */}
                    <td className="px-3 py-2 text-center">
                      {isPending ? (
                        <div className="flex items-center gap-2 justify-center">
                          <select
                            value={discountType[b.id] || "amount"}
                            onChange={(e) =>
                              setDiscountType((prev) => ({
                                ...prev,
                                [b.id]: e.target.value,
                              }))
                            }
                            className="border rounded px-2 py-1 text-xs"
                          >
                            <option value="amount">USD</option>
                            <option value="percent">%</option>
                          </select>

                          <input
                            type="number"
                            min="0"
                            className="border rounded px-2 py-1 w-20 text-xs text-center"
                            value={discountValue[b.id] || ""}
                            onChange={(e) =>
                              setDiscountValue((prev) => ({
                                ...prev,
                                [b.id]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">
                          —
                        </span>
                      )}

                      {/* LIVE PRICE DISPLAY */}
                      <div className="mt-1 text-[10px] text-gray-500">
                        <div>Base: ${estimate.toFixed(2)}</div>

                        {discountValue[b.id] > 0 ? (
                          <div className="text-emerald-700 font-semibold">
                            Total après remise: $
                            {(
                              discountType[b.id] ===
                              "percent"
                                ? estimate -
                                  (estimate *
                                    Number(
                                      discountValue[b.id] || 0
                                    )) /
                                    100
                                : estimate -
                                  Number(
                                    discountValue[b.id] || 0
                                  )
                            ).toFixed(2)}
                          </div>
                        ) : (
                          <div className="text-gray-400">
                            Aucune remise
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isPending && (
                        <>
                          <button
                            onClick={() => approveBooking(b)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded mr-2 text-xs"
                          >
                            Approuver
                          </button>
                          <button
                            onClick={() => rejectBooking(b.id)}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs"
                          >
                            Rejeter
                          </button>
                        </>
                      )}

                      {isApproved && (
                        <>
                          {!isPaid && b.club_invoice_id && (
                            <button
                              onClick={() =>
                                handlePayNow(b.club_invoice_id)
                              }
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded mr-2 text-xs"
                            >
                              Payer maintenant
                            </button>
                          )}
                          <button
                            onClick={() => completeBooking(b.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded mr-2 text-xs"
                          >
                            Marquer complétée
                          </button>
                          <button
                            onClick={() => cancelBooking(b.id)}
                            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs"
                          >
                            Annuler
                          </button>
                        </>
                      )}

                      {!isPending && !isApproved && (
                        <button
                          onClick={() => completeBooking(b.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-xs"
                        >
                          Forcer complétée
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
