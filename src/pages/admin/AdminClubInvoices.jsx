// src/pages/Admin/AdminClubInvoices.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";

const fmtUSD = (v) => `$${Number(v || 0).toFixed(2)}`;

const STATUS_FILTERS = ["all", "sent", "awaiting_payment", "paid", "cancelled"];

export default function AdminClubInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [paymentsMap, setPaymentsMap] = useState({}); // invoice_id -> totalPaid
  const [statusFilter, setStatusFilter] = useState("all");
  const [nameFilter, setNameFilter] = useState("");
  const [startDate, setStartDate] = useState(""); // booking date
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    // 1) load invoices
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
        updated_at,
        payment_portal_url,
        pdf_url
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadClubInvoices error:", error);
      setInvoices([]);
      return;
    }

    const invs = clubInvs || [];
    if (!invs.length) {
      setInvoices([]);
      return;
    }

    // 2) load bookings to attach name + date
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

      if (!bErr && bookings) {
        bookingsMap = Object.fromEntries(bookings.map((b) => [b.id, b]));
      } else if (bErr) {
        console.error("load bookings for club invoices error:", bErr);
      }
    }

    const enriched = invs.map((inv) => {
      const b = bookingsMap[inv.booking_id] || {};
      return {
        ...inv,
        client_name: b.full_name || b.title || "Client Club",
        booking_title: b.title || "",
        booking_date: b.date || null,
        booking_start_time: b.start_time || null,
        booking_end_time: b.end_time || null,
        booking_type: b.booking_type || null,
        booking_venue: b.venue || null,
        booking_quantity: b.quantity || null,
        total: (inv.final_amount_cents ?? inv.amount_cents ?? 0) / 100,
        discount: (inv.discount_cents || 0) / 100,
      };
    });

    setInvoices(enriched);
    attachPayments(enriched);
  }

  async function attachPayments(invList) {
    const ids = [...new Set(invList.map((i) => i.id))].filter(Boolean);
    if (!ids.length) {
      setPaymentsMap({});
      return;
    }

    const { data, error } = await supabase
      .from("club_payments")
      .select("invoice_id, amount")
      .in("invoice_id", ids)
      .eq("approved", true);

    if (error) {
      console.error("load club payments error:", error);
      setPaymentsMap({});
      return;
    }

    const map = {};
    (data || []).forEach((p) => {
      map[p.invoice_id] = (map[p.invoice_id] || 0) + Number(p.amount || 0);
    });

    setPaymentsMap(map);
  }

  const nameOptions = useMemo(() => {
    const set = new Set();
    for (const inv of invoices) {
      if (inv.client_name) set.add(inv.client_name);
    }
    return Array.from(set).sort();
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return (invoices || []).filter((inv) => {
      if (statusFilter !== "all") {
        if ((inv.status || "").toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      if (nameFilter) {
        if (inv.client_name !== nameFilter) return false;
      }

      if (startDate && inv.booking_date) {
        if (new Date(inv.booking_date) < new Date(startDate)) return false;
      }

      if (endDate && inv.booking_date) {
        if (new Date(inv.booking_date) > new Date(endDate)) return false;
      }

      return true;
    });
  }, [invoices, statusFilter, nameFilter, startDate, endDate]);

  return (
    <div className="p-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Club Invoices</h1>

        <div className="flex flex-wrap gap-2 items-end">
          {/* Status */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Name filter */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Client</label>
            <select
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">Tous</option>
              {nameOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">
              Date min (réservation)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">
              Date max (réservation)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>

          <button
            className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setStatusFilter("all");
              setNameFilter("");
              setStartDate("");
              setEndDate("");
            }}
          >
            Reset filters
          </button>
        </div>
      </header>

      {filteredInvoices.length === 0 ? (
        <p className="text-gray-500">Aucune facture club ne correspond aux filtres.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Client</Th>
                <Th>Titre / Lieu</Th>
                <Th>Date</Th>
                <Th>Heure</Th>
                <Th right>Total</Th>
                <Th right>Remise</Th>
                <Th right>Payé</Th>
                <Th right>Reste</Th>
                <Th>Status</Th>
                <Th>Payment Status</Th>
                <Th>Portail</Th>
                <Th>PDF</Th>
                <Th>Créée le</Th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredInvoices.map((inv) => {
                const paid = paymentsMap[inv.id] || 0;
                const remaining = (inv.total || 0) - paid;
                return (
                  <tr key={inv.id} className="align-top">
                    <Td>{inv.client_name}</Td>
                    <Td>
                      <div className="font-medium">
                        {inv.booking_title || "Réservation Club"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {inv.booking_venue || "—"}
                      </div>
                    </Td>
                    <Td>{formatDateFrSafe(inv.booking_date)}</Td>
                    <Td>
                      {inv.booking_start_time || "—"}
                      {inv.booking_end_time ? ` → ${inv.booking_end_time}` : ""}
                    </Td>
                    <Td right>{fmtUSD(inv.total)}</Td>
                    <Td right>
                      {inv.discount > 0 ? fmtUSD(inv.discount) : "—"}
                    </Td>
                    <Td right>
                      {paid > 0 ? formatCurrencyUSD(paid) : "—"}
                    </Td>
                    <Td right>
                      {remaining > 0
                        ? formatCurrencyUSD(remaining)
                        : remaining === 0
                        ? "Paid"
                        : `Overpaid (${fmtUSD(Math.abs(remaining))})`}
                    </Td>
                    <Td>{inv.status}</Td>
                    <Td>{inv.payment_status || "unpaid"}</Td>
                    <Td>
                      {inv.payment_portal_url ? (
                        <a
                          href={inv.payment_portal_url}
                          className="text-blue-600 underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Lien
                        </a>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
  {inv.pdf_url ? (
    <a
      href={inv.pdf_url}
      target="_blank"
      rel="noreferrer"
      className="text-blue-600 underline"
    >
      Voir PDF
    </a>
  ) : (
    "—"
  )}
</Td>

                    <Td>{formatDateFrSafe(inv.created_at)}</Td>
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

function Th({ children, right }) {
  return (
    <th
      className={`px-4 py-2 text-xs font-medium text-gray-600 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
function Td({ children, right }) {
  return (
    <td className={`px-4 py-2 ${right ? "text-right" : "text-left"}`}>
      {children}
    </td>
  );
}
