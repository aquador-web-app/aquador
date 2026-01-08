import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Menu, Transition } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/24/solid";
import DatePicker from "react-datepicker";
import { formatDateFrSafe, formatCurrencyUSD, formatMonth } from "../../lib/dateUtils";

// Formatters
const fmtUSD = (v) => `$${Number(v || 0).toFixed(2)}`;

const getInvoiceDate = (inv) => {
  return inv.month
    ? new Date(inv.month) // ✅ use month column directly
    : inv.due_date
    ? new Date(inv.due_date)
    : inv.issued_at
    ? new Date(inv.issued_at)
    : null;
};


const monthKeyOf = (inv) => {
  if (!inv?.month) return "";
  const [year, month] = inv.month.split("-");
  return `${year}-${month}`; // e.g. "2025-11"
};




const monthLabelFR = (inv) => {
  if (!inv?.month) return "";
  const d = new Date(inv.month);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};


// Month label from *start date* if available; else fall back.
function monthLabelFromStart (inv) {
  if (!inv?.month) return null;
  return formatMonth(inv.month);
};

// Resolve pdf url whether it's a full URL or a storage path
const getPdfLink = (inv, supabase) => {
  if (!inv?.pdf_url) return null;
  if (inv.pdf_url.startsWith("http")) return inv.pdf_url;
  // storage path case: "USER_UUID/REF-12.pdf" in public "invoices" bucket
  return supabase.storage.from("invoices").getPublicUrl(inv.pdf_url).data.publicUrl;
};


const fmt = (v) => `$${Number(v || 0).toFixed(2)}`;

function invoiceItems(inv) {
  const items = [
    { d: inv.description1, a: inv.amount1 },
    { d: inv.description2, a: inv.amount2 },
    { d: inv.description3, a: inv.amount3 },
    { d: inv.description4, a: inv.amount4 },
    { d: inv.description5, a: inv.amount5 },
    { d: inv.description6, a: inv.amount6 },
    { d: inv.description7, a: inv.amount7 },
  ];
  return items.filter(({ d, a }) => (d ?? "").trim().length > 0 && Number(a) > 0);
}

 const STATUSES = ["all", "pending", "partial", "paid"];


/**
 * Global Admin Financial Dashboard
 * - Tabs: Invoices (grouped by family + sticky family totals), Payments, Fees, Credits
 * - Only shows students & influencers
 */
export default function AdminInvoices() {
    /** Build latest paid date per invoice (from payments) */
  const attachPaidDates = async (invList) => {
    const ids = Array.from(new Set(invList.map((i) => i.invoice_id))).filter(Boolean);
    if (!ids.length) return;

    const { data, error } = await supabase
      .from("payments")
      .select("invoice_id, created_at")
      .in("invoice_id", ids)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const latest = {};
      for (const p of data) {
        if (!latest[p.invoice_id]) latest[p.invoice_id] = p.created_at;
      }
      setPaidDates(latest);
    }
  };
  // ---- INVOICES (base table + manual join to profiles) ----
  const loadInvoices = async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_no,
        user_id,
        month,
        description1, amount1,
        description2, amount2,
        description3, amount3,
        description4, amount4,
        description5, amount5,
        description6, amount6,
        description7, amount7,
        total,
        paid_total,
        status,
        due_date,
        issued_at,
        pdf_url,
        proof_url
      `)
      .order("month", { ascending: false });

    if (error) {
      console.error("loadInvoices error:", error);
      setAllInvoices([]);
      return;
    }

    // profiles for names/roles/parent_id
    const userIds = [...new Set((data || []).map((r) => r.user_id))];
    const { data: profs, error: pErr } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, role, parent_id")
      .in("id", userIds);

    if (pErr) {
      console.error("load profiles for invoices error:", pErr);
    }
    const profMap = Object.fromEntries((profs || []).map((p) => [p.id, p]));

    // map rows to the shape the UI expects
    const rows = (data || []).map((r) => {
      const p = profMap[r.user_id] || {};
      return {
        invoice_id: r.id,
        invoice_no: r.invoice_no,
        user_id: r.user_id,
        month: r.month,
        parent_id_explicit: p.parent_id || null,
        parent_full_name: p.parent_id ? (profMap[p.parent_id]?.full_name || null) : null,
        child_full_name: p.full_name || "—",
        child_role: (p.role || "").toLowerCase(),
        description1: r.description1, amount1: r.amount1,
        description2: r.description2, amount2: r.amount2,
        description3: r.description3, amount3: r.amount3,
        description4: r.description4, amount4: r.amount4,
        description5: r.description5, amount5: r.amount5,
        description6: r.description6, amount6: r.amount6,
        description7: r.description7, amount7: r.amount7,
        total: r.total,
        paid_total: r.paid_total,
        status: r.status,
        due_date: r.due_date,
        issued_at: r.issued_at,
        pdf_url: r.pdf_url,
        proof_url: r.proof_url, // ✅ keep this
      };
    });

    // keep filter if you want, but include 'user'
    const filtered = rows.filter((r) =>
      ["student", "influencer", "user"].includes(r.child_role)
    );

    setAllInvoices(filtered);
    attachPaidDates(filtered);
  };

  
  const [activeTab, setActiveTab] = useState("invoices");

  // Month filter (state + options built from current data)
const [monthFilter, setMonthFilter] = useState("");


  /** INVOICES STATE */
  const [allInvoices, setAllInvoices] = useState([]);
  const [paidDates, setPaidDates] = useState({});
  const [invoiceItemsById, setInvoiceItemsById] = useState({});
  const [expandingInvoice, setExpandingInvoice] = useState({});
  const [expandingFamily, setExpandingFamily] = useState({});
  const [nameFilter, setNameFilter] = useState("");


  const nameOptions = useMemo(() => {
  const set = new Set();
  for (const inv of allInvoices) {
    if (inv.child_full_name) set.add(inv.child_full_name);
  }
  return Array.from(set).sort();
}, [allInvoices]);

  
  const monthOptions = useMemo(() => {
  if (!allInvoices?.length) return [];

  const map = new Map();

  for (const inv of allInvoices) {
    const raw = inv.month;
    if (!raw) continue;

    // Raw like "2025-11-01" → take year and month directly
    const [year, month] = raw.split("-");
    const key = `${year}-${month}`;

    // Month names in French, manually mapped (no Date constructor)
    const monthNames = [
      "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
      "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];
    const label = `${monthNames[parseInt(month, 10) - 1]} ${year}`;

    map.set(key, label);
  }

  // sort newest first
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([value, label]) => ({ value, label }));
}, [allInvoices]);




  // Filters (client-side)
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  // Pagination (families)
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);

  /** PAYMENTS / FEES / CREDITS STATE */
  const [payments, setPayments] = useState([]);
  const [fees, setFees] = useState([]);
  const [credits, setCredits] = useState([]);

  /** Load everything on mount (global view) */
  useEffect(() => {
  loadInvoices();   // ✅ ADD THIS LINE
  // ---- PAYMENTS (drop inexistent columns, handle errors) ----
  const loadPayments = async () => {
    const { data, error } = await supabase
      .from("payments")
      .select("id, full_name, invoice_id, amount, method, reversed, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadPayments error:", error);
      setPayments([]);
      return;
    }
    setPayments(data || []);
  };

  // ---- FEES (table may not exist yet; guard it) ----
  const loadFees = async () => {
    const { data, error } = await supabase
      .from("fees")
      .select("id, user_id, full_name, description, amount, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      // Likely 404 if 'fees' table doesn't exist. Just show none.
      console.warn("loadFees warning:", error.message);
      setFees([]);
      return;
    }
    setFees(data || []);
  };

  // ---- CREDITS (don’t select full_name unless you actually have it) ----
  const loadCredits = async () => {
    const { data, error } = await supabase
      .from("credits")
      .select("id, user_id, amount, reason, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("loadCredits error:", error);
      setCredits([]);
      return;
    }
    setCredits(data || []);
  };

  loadPayments();
  loadFees();
  loadCredits();
}, []);




  /** Client-side filters for invoices */
const filteredInvoices = useMemo(() => {
  // start from all invoices
  let base = [...allInvoices];

  // 🧍 filter by name (show *all months* for that name)
if (nameFilter) {
  base = allInvoices.filter((inv) => inv.child_full_name === nameFilter);
} else {
  base = [...allInvoices];
}

// 🗓️ filter by month (only apply if user also chose one)
if (monthFilter) {
  base = base.filter((inv) => monthKeyOf(inv) === monthFilter);
}
base.sort((a, b) => (a.month < b.month ? 1 : -1));


  // 💰 apply status + date range filters
  return base.filter((inv) => {
    // status
    if (statusFilter !== "all") {
      if ((inv.status || "").toLowerCase() !== statusFilter) return false;
    }

    // date range (prefer due_date, else issued_at)
    const checkDate = inv.due_date || inv.issued_at;
    if (startDate && checkDate) {
      if (new Date(checkDate) < new Date(startDate).setHours(0, 0, 0, 0)) {
        return false;
      }
    }
    if (endDate && checkDate) {
      if (new Date(checkDate) > new Date(endDate).setHours(23, 59, 59, 999)) {
        return false;
      }
    }

    return true;
  });
}, [allInvoices, nameFilter, monthFilter, statusFilter, startDate, endDate]);

// Reset pagination when filters change
useEffect(() => {
  setPage(1);
}, [nameFilter, monthFilter, statusFilter, startDate, endDate]);


  /** Group invoices by (parent_id_explicit || user_id) + month */
const families = useMemo(() => {
  // If user filters by name, show all their invoices grouped by month
  if (nameFilter) {
    const groupedByMonth = filteredInvoices.reduce((acc, inv) => {
      const key = `${nameFilter}-${monthKeyOf(inv)}`;
      if (!acc[key]) {
        acc[key] = {
          familyId: key,
          familyName: `${nameFilter} — ${formatMonth(inv.month)}`,
          invoices: [],
        };
      }
      acc[key].invoices.push(inv);
      return acc;
    }, {});
    return Object.values(groupedByMonth);
  }

  // Otherwise group by family + month (e.g., "PARENT_ID–2025-12")
  const grouped = filteredInvoices.reduce((acc, row) => {
    const parent = row.parent_id_explicit || row.user_id;
    const key = `${parent}-${monthKeyOf(row)}`;
    if (!acc[key]) {
      acc[key] = {
        familyId: key,
        familyName:
          (row.parent_full_name || row.child_full_name) +
          ` - ${formatMonth(row.month)}`,
        invoices: [],
      };
    }
    acc[key].invoices.push(row);
    return acc;
  }, {});
  return Object.values(grouped);
}, [filteredInvoices, nameFilter]);


/** ✅ Sort families by latest invoice month (descending) */
const sortedFamilies = useMemo(() => {
  if (!families.length) return [];
  return [...families].sort((a, b) => {
    const latestA = a.invoices.reduce(
      (max, inv) => (inv.month > max ? inv.month : max),
      ""
    );
    const latestB = b.invoices.reduce(
      (max, inv) => (inv.month > max ? inv.month : max),
      ""
    );
    return latestA < latestB ? 1 : -1; // newest first
  });
}, [families]);

/** ✅ Count total families */
const totalFamilies = sortedFamilies.length;

/** ✅ Compute page count (20 families per page) */
const totalPages = Math.max(1, Math.ceil(totalFamilies / PAGE_SIZE));

/** ✅ Slice families directly by page (20 per page) */
const paginatedFamilies = useMemo(() => {
  if (!sortedFamilies.length) return [];
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return sortedFamilies.slice(start, end);
}, [sortedFamilies, page]);

/** ✅ Footer values (based on families) */
const firstRow = totalFamilies === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
const lastRow = Math.min(page * PAGE_SIZE, totalFamilies);




  /** Toggle invoice items expansion & fetch items on demand */
  const toggleExpandInvoice = async (invoiceId) => {
    setExpandingInvoice((prev) => ({ ...prev, [invoiceId]: !prev[invoiceId] }));
    if (invoiceItemsById[invoiceId]) return;
    const { data } = await supabase
      .from("invoice_items")
      .select("id, description, amount, paid, reverted, type, created_at")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });
    if (data) {
      setInvoiceItemsById((prev) => ({ ...prev, [invoiceId]: data }));
    }
  };

  /** Render */
  return (
    <div className="p-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Finance Management</h1>
        <nav className="flex gap-2">
          {["invoices", "payments", "fees", "credits"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md border ${
                activeTab === tab
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "invoices" && (
        <section className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end">
            <StatusDropdown
              value={statusFilter}
              onChange={setStatusFilter}
            />
            <div className="flex items-end gap-3">
              <DateField label="Start date" date={startDate} onChange={setStartDate} />
              <DateField label="End date" date={endDate} onChange={setEndDate} />
            </div>
            <label className="text-sm">Filtrer par mois</label>
<select
  value={monthFilter}
  onChange={(e) => setMonthFilter(e.target.value)}
  className="border rounded px-2 py-1 text-sm"
>
  <option value="">Tous</option>
  {monthOptions.map((opt) => (
    <option key={opt.value} value={opt.value}>
      {opt.label}
    </option>
  ))}
</select>
<label className="text-sm">Filtrer par nom</label>
<select
  value={nameFilter}
  onChange={(e) => setNameFilter(e.target.value)}
  className="border rounded px-2 py-1 text-sm"
>
  <option value="">Tous</option>
  {nameOptions.map((name) => (
    <option key={name} value={name}>
      {name}
    </option>
  ))}
</select>

            <button
              className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setStatusFilter("all");
                setStartDate(null);
                setEndDate(null);
                setMonthFilter("");
                setNameFilter("");
              }}
            >
              Reset filters
            </button>
          </div>

          {/* Families (paginated) */}
          {paginatedFamilies.length === 0 ? (
            <p className="text-gray-500">No invoices match your filters.</p>
          ) : (
            <div className="space-y-4">
              {paginatedFamilies.map((fam) => (
                <FamilyBlock
                  key={fam.familyId}
                  family={fam}
                  expandingFamily={expandingFamily}
                  setExpandingFamily={setExpandingFamily}
                  expandingInvoice={expandingInvoice}
                  toggleExpandInvoice={toggleExpandInvoice}
                  invoiceItemsById={invoiceItemsById}
                  paidDates={paidDates}
                  reloadInvoices={loadInvoices}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-gray-600">
  Page {page} of {totalPages} • Showing {firstRow}–{lastRow} of {totalFamilies}
</span>

            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded border border-gray-300 text-gray-700 disabled:opacity-50"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="px-3 py-1 rounded border border-gray-300 text-gray-700 disabled:opacity-50"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "payments" && (
        <section className="space-y-3">
          <Table
            headers={["Name", "Amount", "Method", "Invoice", "Date"]}
            rows={(payments || [])
              .filter((p) => !!p) // safe
              .map((p) => [
                p.full_name || "—",
                formatCurrencyUSD(p.amount),
                p.method,
                p.invoice_id,
                formatDateFrSafe(p.created_at),
              ])}
          />
        </section>
      )}

      {activeTab === "fees" && (
        <section className="space-y-3">
          <Table
            headers={["Name", "Description", "Amount", "Applied"]}
            rows={(fees || []).map((f) => [
              f.full_name || "—",
              f.description,
              formatCurrencyUSD(f.amount),
              formatDateFrSafe(f.created_at),
            ])}
          />
        </section>
      )}

      {activeTab === "credits" && (
        <section className="space-y-3">
          <Table
            headers={["Name", "Amount", "Reason", "Updated"]}
            rows={(credits || []).map((c) => [
              c.full_name || "—",
              formatCurrencyUSD(c.amount),
              c.reason || "—",
              formatDateFrSafe(c.updated_at || c.created_at),
            ])}
          />
        </section>
      )}
    </div>
  );
}

/** Family Block (expandable) with sticky totals */
function FamilyBlock({
  family,
  expandingFamily,
  setExpandingFamily,
  expandingInvoice,
  toggleExpandInvoice,
  invoiceItemsById,
  paidDates,
  reloadInvoices,
}) {
  const open = !!expandingFamily[family.familyId];

  // Totals must reflect *current visible* invoices (already filtered upstream)
  const totals = family.invoices.reduce(
    (acc, inv) => {
      acc.total += inv.total || 0;
      acc.paid += inv.paid_total || 0;
      return acc;
    },
    { total: 0, paid: 0 }
  );
  totals.remaining = totals.total - totals.paid;

  return (
    <div className="border rounded-lg shadow-sm">
      <div
        className="flex justify-between items-center p-3 bg-blue-900 cursor-pointer"
        onClick={() =>
          setExpandingFamily((prev) => ({
            ...prev,
            [family.familyId]: !prev[family.familyId],
          }))
        }
      >
        <span className="font-semibold text-white">
  {family.familyName}
</span>

        <span>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="p-3 bg-white overflow-x-auto">
          <table className="w-full text-sm relative">
            <thead>
              <tr className="border-b">
                <Th>Name</Th>
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
              {family.invoices.map((inv) => {
                const balance = (inv.total || 0) - (inv.paid_total || 0);
                return (
                  <tr key={inv.invoice_id} className="border-b align-top">
                    <Td>
                      <div className="font-medium">{inv.child_full_name}</div>                      
                    </Td>
                    <Td>
                      {invoiceItems(inv).length ? (
                        <div className="space-y-1 max-h-28 overflow-auto pr-1">
                          {invoiceItems(inv).map((it, idx) => (
  <div key={idx} className="flex justify-between gap-3 items-center">
    <span className="text-gray-700">
      {it.d}
    </span>

    <div className="flex items-center gap-3">
      <span className="font-medium">
        {formatCurrencyUSD(it.a)}
      </span>

      <button
        onClick={async () => {
          if (!confirm(`Revert "${it.d}" ?`)) return;

          const { error } = await supabase.rpc(
            "revert_invoice_slot",
            {
              p_invoice_id: inv.invoice_id,
              p_slot: idx + 1,              // 🔑 THIS IS CRITICAL
              p_description: it.d,
              p_amount: it.a,
            }
          );

          if (!error) {
            await reloadInvoices();
          } else {
            alert(error.message);
          }
        }}
        className="text-xs text-red-600 hover:underline"
      >
        Revert
      </button>
    </div>
  </div>
))}

                        </div>
                      ) : (
                        "—"
                      )}
                    </Td>

                    <Td right>{formatCurrencyUSD(inv.total || 0)}</Td>
                    <Td right>
                      {inv.paid_total > 0 ? formatCurrencyUSD(inv.paid_total) : "—"}
                    </Td>
                    <Td right>
                      {balance > 0
                        ? formatCurrencyUSD(balance)
                        : balance === 0
                        ? "Paid"
                        : `Overpaid (${Math.abs(balance)})`}
                    </Td>
                    <Td>{inv.status}</Td>
                    <Td>{formatDateFrSafe(inv.due_date)}</Td>
                    <Td>{formatDateFrSafe(paidDates[inv.invoice_id])}</Td>
                    <Td>
  {(() => {
    const url = getPdfLink(inv, supabase);
    if (!url) return "—";

    return (
      <button
        onClick={async () => {
          try {
            // Force revalidation on mobile browsers
            await fetch(url, { method: "HEAD", cache: "no-store" });
          } catch (_) {}

          // Open same file, same name, but bypass cache
          window.open(`${url}?refresh=${Date.now()}`, "_blank");
        }}
        className="text-blue-600 underline"
      >
        PDF
      </button>
    );
  })()}
</Td>

                    <Td>
  {inv.proof_url ? (
    inv.proof_url.match(/\.(jpg|jpeg|png)$/i) ? (
      <a
        href={inv.proof_url}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 underline"
      >
        Image
      </a>
    ) : (
      <a
        href={inv.proof_url}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 underline"
      >
        Proof
      </a>
    )
  ) : (
    "—"
  )}
</Td>

                    <Td>
                      <button
                        onClick={() => toggleExpandInvoice(inv.invoice_id)}
                        className="text-blue-600 hover:underline"
                      >
                        {expandingInvoice[inv.invoice_id] ? "Hide" : "Show"}
                      </button>
                      {expandingInvoice[inv.invoice_id] && (
  <div className="mt-2">
    {invoiceItemsById[inv.invoice_id]?.length ? (
      <ul className="text-sm text-gray-700 list-disc pl-5">
        {invoiceItemsById[inv.invoice_id].map((it) => (
  <li
    key={it.id}
    className={`flex justify-between items-center ${
      it.reverted ? "line-through text-gray-400" : ""
    }`}
  >
    <span>
      {it.description} — {fmtUSD(it.amount)}
      {it.paid ? " ✅" : ""}
    </span>

    {!it.reverted && (
      <button
        onClick={async () => {
          if (!confirm("Revert this invoice item?")) return;

          const { error } = await supabase.rpc(
            "revert_invoice_item",
            { p_item_id: it.id }
          );

          if (!error) {
            // refresh items
            const { data } = await supabase
              .from("invoice_items")
              .select("id, description, amount, paid, reverted, created_at")
              .eq("invoice_id", inv.invoice_id)
              .order("created_at");

            setInvoiceItemsById((prev) => ({
              ...prev,
              [inv.invoice_id]: data || [],
            }));

            // refresh invoice row
            await reloadInvoices();
          } else {
            alert(error.message);
          }
        }}
        className="text-xs text-red-600 hover:underline"
      >
        Revert
      </button>
    )}
  </li>
))}

      </ul>
    ) : invoiceItems(inv).length ? (
      <ul className="text-sm text-gray-700 list-disc pl-5">
        {invoiceItems(inv).map((it, idx) => (
          <li key={idx}>
            {it.d} — {fmtUSD(it.a)}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-gray-500">Aucun item.</p>
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
                <td colSpan="2" className="p-2 text-right">
                  Family Total:
                </td>
                <td className="p-2 text-right text-red-600">{formatCurrencyUSD(totals.total)}</td>
                <td className="p-2 text-right text-green-600">{formatCurrencyUSD(totals.paid)}</td>
                <td className="p-2 text-right text-red-600">{formatCurrencyUSD(totals.remaining)}</td>
                <td colSpan="4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/** Small components */
function StatusDropdown({ value, onChange }) {
  const label = `Status: ${value[0].toUpperCase() + value.slice(1)}`;
  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button className="inline-flex w-full justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        {label}
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
        <Menu.Items className="absolute z-10 mt-2 w-40 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {STATUSES.map((s) => (
            <Menu.Item key={s}>
              {({ active }) => (
                <button
                  onClick={() => onChange(s)}
                  className={`${
                    active ? "bg-gray-50" : ""
                  } block w-full text-left px-3 py-2 text-sm text-gray-700`}
                >
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              )}
            </Menu.Item>
          ))}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

function DateField({ label, date, onChange }) {
  return (
    <div className="flex flex-col">
      <label className="text-xs text-gray-600 mb-1">{label}</label>
      <DatePicker
        selected={date ? new Date(date) : null}
        onChange={(d) => onChange(d)}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm w-48"
        placeholderText="Select date"
        isClearable
      />
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div className="overflow-x-auto rounded-lg shadow border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h, i) => (
              <Th key={i}>{h}</Th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <Td key={j}>{c}</Td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="p-3 text-center text-gray-500">
                No records
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** UI table helpers */
function Th({ children, right }) {
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
function Td({ children, right }) {
  return (
    <td className={`px-4 py-2 text-sm ${right ? "text-right" : "text-left"}`}>
      {children}
    </td>
  );
}
