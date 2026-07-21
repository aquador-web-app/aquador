// src/pages/Admin/AdminClubMembershipInvoices.jsx
import { useEffect, useMemo, useState } from "react";
import { Menu, Transition } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/24/solid";
import DatePicker from "react-datepicker";
import { supabase } from "../../lib/supabaseClient";
import {
  formatDateFrSafe,
  formatCurrencyUSD,
  formatMonth,
} from "../../lib/dateUtils";

const PAGE_SIZE = 20;
const STATUSES = ["all", "pending", "unpaid", "partial", "paid"];
const PDF_BUCKET = "club_invoices";
const PROOF_BUCKET = "club_invoices";

const monthKeyOf = (inv) => {
  if (!inv?.month) return "";
  const [year, month] = String(inv.month).split("-");
  return `${year}-${month}`;
};

const resolveStorageUrl = (value, bucket) => {
  if (!value) return null;
  if (String(value).startsWith("http")) return value;

  return supabase.storage.from(bucket).getPublicUrl(value).data.publicUrl;
};

const getPdfLink = (inv) => resolveStorageUrl(inv?.pdf_url, PDF_BUCKET);
const getProofLink = (inv) => resolveStorageUrl(inv?.proof_url, PROOF_BUCKET);

function extractItems(inv) {
  const items = [];

  for (let slot = 1; slot <= 7; slot += 1) {
    const description = inv?.[`description${slot}`];
    const amount = Number(inv?.[`amount${slot}`] || 0);

    if (String(description || "").trim()) {
      items.push({
        slot,
        description,
        amount,
      });
    }
  }

  return items;
}

export default function AdminClubMembershipInvoices() {
  const [activeTab, setActiveTab] = useState("invoices");

  const [allInvoices, setAllInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paidDates, setPaidDates] = useState({});

  const [expandingInvoice, setExpandingInvoice] = useState({});
  const [expandingMember, setExpandingMember] = useState({});

  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEverything();
  }, []);

  async function loadEverything() {
    setLoading(true);
    await Promise.all([loadInvoices(), loadPayments()]);
    setLoading(false);
  }

  async function loadInvoices() {
    const { data, error } = await supabase
      .from("club_invoices")
      .select(`
        id,
        customer_id,
        membership_id,
        invoice_no,
        month,
        created_at,
        issued_at,
        due_date,
        status,
        payment_method,
        client_email,
        total,
        paid_total,
        amount_cents,
        discount_cents,
        final_amount_cents,
        pdf_url,
        proof_url,
        category,
        description1, amount1,
        description2, amount2,
        description3, amount3,
        description4, amount4,
        description5, amount5,
        description6, amount6,
        description7, amount7
      `)
      .eq("category", "membership")
      .order("month", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("load membership invoices error:", error);
      setAllInvoices([]);
      return;
    }

    const rows = data || [];
    const customerIds = [
      ...new Set(
        rows
          .map((row) => row.customer_id || row.membership_id)
          .filter(Boolean)
      ),
    ];

    let profileMap = {};

    if (customerIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from("club_profiles")
        .select(`
          id,
          main_full_name,
          email,
          phone,
          address,
          plan_code,
          membership_type,
          status,
          docs_approved
        `)
        .in("id", customerIds);

      if (profileError) {
        console.error("load Club profiles error:", profileError);
      }

      profileMap = Object.fromEntries(
        (profiles || []).map((profile) => [profile.id, profile])
      );
    }

    const enriched = rows.map((row) => {
      const profile =
        profileMap[row.customer_id] ||
        profileMap[row.membership_id] ||
        {};

      const fallbackTotal =
        Number(row.final_amount_cents ?? row.amount_cents ?? 0) / 100;

      return {
        ...row,
        invoice_id: row.id,
        client_name:
          profile.main_full_name ||
          row.client_email ||
          "Membre Club",
        client_email: profile.email || row.client_email || "",
        client_phone: profile.phone || "",
        client_address: profile.address || "",
        plan_code: profile.plan_code || "—",
        membership_type: profile.membership_type || "—",
        membership_status: profile.status || "",
        total: Number(row.total ?? fallbackTotal),
        paid_total: Number(row.paid_total || 0),
      };
    });

    setAllInvoices(enriched);
    await attachPaidDates(enriched);
  }

  async function attachPaidDates(invoiceList) {
    const ids = [
      ...new Set(invoiceList.map((invoice) => invoice.id).filter(Boolean)),
    ];

    if (!ids.length) {
      setPaidDates({});
      return;
    }

    const { data, error } = await supabase
      .from("club_membership_payments")
      .select("invoice_id, paid_at, created_at, approved")
      .in("invoice_id", ids)
      .eq("approved", true)
      .order("paid_at", { ascending: false });

    if (error) {
      console.error("load Club payment dates error:", error);
      setPaidDates({});
      return;
    }

    const latest = {};

    for (const payment of data || []) {
      if (!latest[payment.invoice_id]) {
        latest[payment.invoice_id] =
          payment.paid_at || payment.created_at;
      }
    }

    setPaidDates(latest);
  }

  async function loadPayments() {
    const { data, error } = await supabase
      .from("club_membership_payments")
      .select(`
        id,
        invoice_id,
        amount,
        method,
        paid_at,
        created_at,
        approved
      `)
      .eq("approved", true)
      .order("paid_at", { ascending: false });

    if (error) {
      console.error("load Club membership payments error:", error);
      setPayments([]);
      return;
    }

    const rows = data || [];
    const invoiceIds = [
      ...new Set(rows.map((payment) => payment.invoice_id).filter(Boolean)),
    ];

    let invoiceMap = {};

    if (invoiceIds.length) {
      const { data: invoices, error: invoiceError } = await supabase
        .from("club_invoices")
        .select("id, invoice_no, customer_id, client_email")
        .in("id", invoiceIds);

      if (invoiceError) {
        console.error("load invoices for payments error:", invoiceError);
      }

      invoiceMap = Object.fromEntries(
        (invoices || []).map((invoice) => [invoice.id, invoice])
      );
    }

    const customerIds = [
      ...new Set(
        Object.values(invoiceMap)
          .map((invoice) => invoice.customer_id)
          .filter(Boolean)
      ),
    ];

    let profileMap = {};

    if (customerIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from("club_profiles")
        .select("id, main_full_name")
        .in("id", customerIds);

      if (profileError) {
        console.error("load member names for payments error:", profileError);
      }

      profileMap = Object.fromEntries(
        (profiles || []).map((profile) => [profile.id, profile])
      );
    }

    const enriched = rows.map((payment) => {
      const invoice = invoiceMap[payment.invoice_id] || {};
      const profile = profileMap[invoice.customer_id] || {};

      return {
        ...payment,
        invoice_no: invoice.invoice_no || null,
        full_name:
          profile.main_full_name ||
          invoice.client_email ||
          "Membre Club",
        payment_date: payment.paid_at || payment.created_at,
      };
    });

    setPayments(enriched);
  }

  const nameOptions = useMemo(() => {
    const names = new Set();

    for (const invoice of allInvoices) {
      if (invoice.client_name) names.add(invoice.client_name);
    }

    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
  }, [allInvoices]);

  const monthOptions = useMemo(() => {
    const months = new Map();

    for (const invoice of allInvoices) {
      const key = monthKeyOf(invoice);
      if (!key) continue;

      months.set(key, formatMonth(invoice.month));
    }

    return Array.from(months.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
  }, [allInvoices]);

  const filteredInvoices = useMemo(() => {
    return allInvoices.filter((invoice) => {
      if (
        statusFilter !== "all" &&
        String(invoice.status || "").toLowerCase() !== statusFilter
      ) {
        return false;
      }

      if (nameFilter && invoice.client_name !== nameFilter) {
        return false;
      }

      if (monthFilter && monthKeyOf(invoice) !== monthFilter) {
        return false;
      }

      const dateToCheck = invoice.due_date || invoice.issued_at;

      if (startDate && dateToCheck) {
        const minimum = new Date(startDate);
        minimum.setHours(0, 0, 0, 0);

        if (new Date(dateToCheck) < minimum) return false;
      }

      if (endDate && dateToCheck) {
        const maximum = new Date(endDate);
        maximum.setHours(23, 59, 59, 999);

        if (new Date(dateToCheck) > maximum) return false;
      }

      return true;
    });
  }, [
    allInvoices,
    statusFilter,
    nameFilter,
    monthFilter,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, nameFilter, monthFilter, startDate, endDate]);

  const memberGroups = useMemo(() => {
    const grouped = {};

    for (const invoice of filteredInvoices) {
      const memberId = invoice.customer_id || invoice.membership_id;
      const key = `${memberId}-${monthKeyOf(invoice)}`;

      if (!grouped[key]) {
        grouped[key] = {
          memberId: key,
          memberName: `${invoice.client_name} - ${formatMonth(invoice.month)}`,
          invoices: [],
        };
      }

      grouped[key].invoices.push(invoice);
    }

    return Object.values(grouped)
      .map((group) => ({
        ...group,
        invoices: [...group.invoices].sort((a, b) =>
          a.client_name.localeCompare(b.client_name, "fr", {
            sensitivity: "base",
          })
        ),
      }))
      .sort((a, b) => {
        const monthA = a.invoices[0]?.month || "";
        const monthB = b.invoices[0]?.month || "";

        if (monthA !== monthB) return monthA < monthB ? 1 : -1;

        return a.memberName.localeCompare(b.memberName, "fr", {
          sensitivity: "base",
        });
      });
  }, [filteredInvoices]);

  const totalMembers = memberGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalMembers / PAGE_SIZE));

  const paginatedMembers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return memberGroups.slice(start, start + PAGE_SIZE);
  }, [memberGroups, page]);

  const firstRow =
    totalMembers === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, totalMembers);

  const toggleInvoice = (invoiceId) => {
    setExpandingInvoice((current) => ({
      ...current,
      [invoiceId]: !current[invoiceId],
    }));
  };

  return (
    <div className="px-3 py-4 sm:px-4 lg:px-6 max-w-[1600px] mx-auto">
      <header className="flex flex-col gap-3 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800">
            Finance Management — Club
          </h1>

          <button
            onClick={loadEverything}
            className="px-3 py-2 rounded-md border border-gray-300 text-gray-700"
          >
            Recharger
          </button>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: "invoices", label: "Factures" },
            { key: "payments", label: "Paiements" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-sm whitespace-nowrap rounded-md border ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "invoices" && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
            <StatusDropdown
              value={statusFilter}
              onChange={setStatusFilter}
            />

            <div className="flex flex-col gap-3 w-full">
              <DateField
                label="Date de début"
                date={startDate}
                onChange={setStartDate}
              />
              <DateField
                label="Date de fin"
                date={endDate}
                onChange={setEndDate}
              />
            </div>

            <div>
              <label className="text-sm block mb-1">
                Filtrer par mois
              </label>
              <select
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
                className="border rounded px-2 py-2 text-sm w-full"
              >
                <option value="">Tous</option>
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm block mb-1">
                Filtrer par nom
              </label>
              <select
                value={nameFilter}
                onChange={(event) => setNameFilter(event.target.value)}
                className="border rounded px-2 py-2 text-sm w-full"
              >
                <option value="">Tous</option>
                {nameOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-gray-700"
              onClick={() => {
                setStatusFilter("all");
                setMonthFilter("");
                setNameFilter("");
                setStartDate(null);
                setEndDate(null);
              }}
            >
              Reset filters
            </button>
          </div>

          {loading ? (
            <p className="text-gray-500">Chargement...</p>
          ) : paginatedMembers.length === 0 ? (
            <p className="text-gray-500">
              Aucune facture ne correspond aux filtres.
            </p>
          ) : (
            <div className="space-y-4">
              {paginatedMembers.map((member) => (
                <MemberBlock
                  key={member.memberId}
                  member={member}
                  expandingMember={expandingMember}
                  setExpandingMember={setExpandingMember}
                  expandingInvoice={expandingInvoice}
                  toggleInvoice={toggleInvoice}
                  paidDates={paidDates}
                />
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3">
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages} • Showing {firstRow}–{lastRow} of{" "}
              {totalMembers}
            </span>

            <div className="flex justify-between sm:justify-end gap-2">
              <button
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>

              <button
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
                disabled={page === totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "payments" && (
        <section className="space-y-4">
          <div className="hidden md:block overflow-x-auto">
            <Table
              headers={["Name", "Amount", "Method", "Invoice", "Date"]}
              rows={payments.map((payment) => [
                payment.full_name || "—",
                formatCurrencyUSD(payment.amount),
                payment.method || "—",
                payment.invoice_no || "—",
                formatDateFrSafe(payment.payment_date),
              ])}
            />
          </div>

          <div className="md:hidden space-y-4">
            {payments.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MemberBlock({
  member,
  expandingMember,
  setExpandingMember,
  expandingInvoice,
  toggleInvoice,
  paidDates,
}) {
  const open = Boolean(expandingMember[member.memberId]);

  const totals = member.invoices.reduce(
    (accumulator, invoice) => {
      accumulator.total += Number(invoice.total || 0);
      accumulator.paid += Number(invoice.paid_total || 0);
      return accumulator;
    },
    { total: 0, paid: 0 }
  );

  totals.remaining = totals.total - totals.paid;

  return (
    <div className="border rounded-lg shadow-sm">
      <div
        className="flex justify-between items-center px-4 py-4 bg-blue-900 cursor-pointer select-none rounded-xl"
        onClick={() =>
          setExpandingMember((current) => ({
            ...current,
            [member.memberId]: !current[member.memberId],
          }))
        }
      >
        <span className="font-semibold text-white">
          {member.memberName}
        </span>
        <span className="text-white">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="p-3 bg-white">
          <div className="hidden md:block overflow-x-auto -mx-3 md:mx-0">
            <table className="w-full text-sm relative">
              <thead>
                <tr className="border-b">
                  <Th>Name</Th>
                  <Th>Plan</Th>
                  <Th>Description</Th>
                  <Th right>Total</Th>
                  <Th right>Paid</Th>
                  <Th right>Remaining</Th>
                  <Th>Status</Th>
                  <Th>Due Date</Th>
                  <Th>Paid Date</Th>
                  <Th>PDF</Th>
                  <Th>Preuve de paiement</Th>
                  <Th>Items</Th>
                </tr>
              </thead>

              <tbody>
                {member.invoices.map((invoice) => {
                  const balance =
                    Number(invoice.total || 0) -
                    Number(invoice.paid_total || 0);
                  const items = extractItems(invoice);

                  return (
                    <tr key={invoice.id} className="border-b align-top">
                      <Td>
                        <div className="font-medium">
                          {invoice.client_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {invoice.invoice_no || "—"}
                        </div>
                      </Td>

                      <Td>
                        <div>{invoice.plan_code || "—"}</div>
                        <div className="text-xs text-gray-500">
                          {invoice.membership_type || "—"}
                        </div>
                      </Td>

                      <Td>
                        {items.length ? (
                          <div className="space-y-1 max-h-28 overflow-auto pr-1">
                            {items.map((item) => (
                              <div
                                key={item.slot}
                                className="flex justify-between gap-3"
                              >
                                <span className="text-gray-700">
                                  {item.description}
                                </span>
                                <span className="font-medium">
                                  {formatCurrencyUSD(item.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </Td>

                      <Td right>{formatCurrencyUSD(invoice.total)}</Td>
                      <Td right>
                        {invoice.paid_total > 0
                          ? formatCurrencyUSD(invoice.paid_total)
                          : "—"}
                      </Td>
                      <Td right>
                        {balance > 0
                          ? formatCurrencyUSD(balance)
                          : balance === 0
                          ? "Paid"
                          : `Overpaid (${formatCurrencyUSD(
                              Math.abs(balance)
                            )})`}
                      </Td>
                      <Td>
                        <StatusBadge status={invoice.status} />
                      </Td>
                      <Td>{formatDateFrSafe(invoice.due_date)}</Td>
                      <Td>{formatDateFrSafe(paidDates[invoice.id])}</Td>
                      <Td>
                        <DocumentButton
                          url={getPdfLink(invoice)}
                          label="PDF"
                        />
                      </Td>
                      <Td>
                        <DocumentButton
                          url={getProofLink(invoice)}
                          label="Proof"
                        />
                      </Td>
                      <Td>
                        <button
                          onClick={() => toggleInvoice(invoice.id)}
                          className="text-blue-600 hover:underline"
                        >
                          {expandingInvoice[invoice.id] ? "Hide" : "Show"}
                        </button>

                        {expandingInvoice[invoice.id] && (
                          <div className="mt-2">
                            {items.length ? (
                              <ul className="text-sm text-gray-700 list-disc pl-5">
                                {items.map((item) => (
                                  <li key={item.slot}>
                                    {item.description} —{" "}
                                    {formatCurrencyUSD(item.amount)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-gray-500">
                                Aucun item.
                              </p>
                            )}
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot className="sticky bottom-0 bg-gray-100 font-semibold">
                <tr>
                  <td colSpan="3" className="p-2 text-right">
                    Member Total:
                  </td>
                  <td className="p-2 text-right text-red-600">
                    {formatCurrencyUSD(totals.total)}
                  </td>
                  <td className="p-2 text-right text-green-600">
                    {formatCurrencyUSD(totals.paid)}
                  </td>
                  <td className="p-2 text-right text-red-600">
                    {formatCurrencyUSD(totals.remaining)}
                  </td>
                  <td colSpan="6" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="md:hidden space-y-4">
            {member.invoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                paidDate={paidDates[invoice.id]}
                expanded={Boolean(expandingInvoice[invoice.id])}
                onToggle={() => toggleInvoice(invoice.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceCard({ invoice, paidDate, expanded, onToggle }) {
  const balance =
    Number(invoice.total || 0) - Number(invoice.paid_total || 0);
  const items = extractItems(invoice);

  return (
    <div className="bg-white rounded-xl border shadow p-4 space-y-3">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="font-semibold text-blue-700">
            {invoice.client_name}
          </p>
          <p className="text-xs text-gray-500">
            {invoice.invoice_no || "—"}
          </p>
          <p className="text-xs text-gray-500">
            Plan : {invoice.plan_code || "—"}
          </p>
          <p className="text-xs text-gray-500">
            Échéance : {formatDateFrSafe(invoice.due_date)}
          </p>
          {paidDate && (
            <p className="text-xs text-gray-500">
              Paiement : {formatDateFrSafe(paidDate)}
            </p>
          )}
        </div>

        <StatusBadge status={invoice.status} />
      </div>

      <div className="text-sm space-y-1">
        <AmountRow label="Total" value={invoice.total} />
        <AmountRow label="Payé" value={invoice.paid_total} />
        <AmountRow label="Restant" value={balance} emphasized />
      </div>

      <div className="flex gap-2 pt-2">
        <DocumentButton url={getPdfLink(invoice)} label="PDF" mobile />
        <DocumentButton url={getProofLink(invoice)} label="Preuve" mobile />

        <button
          onClick={onToggle}
          className="flex-1 bg-gray-100 py-2.5 rounded-lg text-sm"
        >
          {expanded ? "Masquer" : "Détails"}
        </button>
      </div>

      {expanded && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
          {items.length ? (
            items.map((item) => (
              <div
                key={item.slot}
                className="flex justify-between gap-3"
              >
                <span>{item.description}</span>
                <b>{formatCurrencyUSD(item.amount)}</b>
              </div>
            ))
          ) : (
            <p className="text-gray-500">Aucun item.</p>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentCard({ payment }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-blue-700">
            {payment.full_name || "—"}
          </p>
          <p className="text-xs text-gray-500">
            {formatDateFrSafe(payment.payment_date)}
          </p>
        </div>

        <span className="font-semibold text-sm text-green-700">
          {formatCurrencyUSD(payment.amount)}
        </span>
      </div>

      <div className="text-sm text-gray-700 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <span className="text-gray-500">Méthode</span>
          <span className="col-span-2 text-right font-medium">
            {payment.method || "—"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <span className="text-gray-500">Facture</span>
          <span className="col-span-2 text-right break-all text-xs">
            {payment.invoice_no || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusDropdown({ value, onChange }) {
  const labels = {
    all: "All",
    pending: "Pending",
    unpaid: "Unpaid",
    partial: "Partial",
    paid: "Paid",
  };

  return (
    <div className="w-full">
      <label className="text-sm block mb-1">Status</label>

      <Menu as="div" className="relative inline-block text-left w-full">
        <Menu.Button className="inline-flex w-full justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {labels[value] || value}
          <ChevronDownIcon className="h-4 w-4 text-gray-500" />
        </Menu.Button>

        <Transition
          enter="transition duration-100"
          enterFrom="transform scale-95 opacity-0"
          enterTo="transform scale-100 opacity-100"
          leave="transition duration-75"
          leaveFrom="transform scale-100 opacity-100"
          leaveTo="transform scale-95 opacity-0"
        >
          <Menu.Items className="absolute z-20 mt-2 w-full rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            {STATUSES.map((status) => (
              <Menu.Item key={status}>
                {({ active }) => (
                  <button
                    onClick={() => onChange(status)}
                    className={`${
                      active ? "bg-gray-50" : ""
                    } block w-full text-left px-3 py-2 text-sm text-gray-700`}
                  >
                    {labels[status] || status}
                  </button>
                )}
              </Menu.Item>
            ))}
          </Menu.Items>
        </Transition>
      </Menu>
    </div>
  );
}

function DateField({ label, date, onChange }) {
  return (
    <div className="flex flex-col">
      <label className="text-xs text-gray-600 mb-1">{label}</label>
      <DatePicker
        selected={date ? new Date(date) : null}
        onChange={onChange}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full"
        placeholderText="Select date"
        isClearable
      />
    </div>
  );
}

function DocumentButton({ url, label, mobile = false }) {
  if (!url) return mobile ? null : "—";

  const openDocument = async () => {
    try {
      await fetch(url, { method: "HEAD", cache: "no-store" });
    } catch {
      // Continue: the public URL can still be opened.
    }

    const separator = url.includes("?") ? "&" : "?";
    const finalUrl = `${url}${separator}refresh=${Date.now()}`;

    if (window.matchMedia("(display-mode: standalone)").matches) {
      window.location.href = finalUrl;
    } else {
      window.open(finalUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      onClick={openDocument}
      className={
        mobile
          ? "flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm"
          : "text-blue-600 underline"
      }
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();

  const classes =
    normalized === "paid"
      ? "bg-green-100 text-green-700"
      : normalized === "partial"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-red-100 text-red-700";

  return (
    <span
      className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${classes}`}
    >
      {status || "—"}
    </span>
  );
}

function AmountRow({ label, value, emphasized = false }) {
  return (
    <div
      className={`flex justify-between ${
        emphasized ? "font-semibold" : ""
      }`}
    >
      <span>{label}</span>
      <b className={emphasized ? "text-red-600" : ""}>
        {formatCurrencyUSD(value)}
      </b>
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div className="overflow-x-auto rounded-lg shadow border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((header) => (
              <Th key={header}>{header}</Th>
            ))}
          </tr>
        </thead>

        <tbody className="bg-white divide-y divide-gray-100">
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <Td key={cellIndex}>{cell}</Td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={headers.length}
                className="p-3 text-center text-gray-500"
              >
                No records
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right = false }) {
  return (
    <th
      className={`px-4 py-2 text-sm font-medium text-gray-600 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right = false }) {
  return (
    <td
      className={`px-3 py-2 text-sm ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}