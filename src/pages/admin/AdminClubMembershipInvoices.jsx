// src/pages/Admin/AdminClubMembershipInvoices.jsx
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";
import { FaSearch, FaFilePdf, FaChevronDown, FaChevronUp } from "react-icons/fa";

// 🔵 Extract invoice items from description1..description7 & amount1..amount7
function extractItems(inv) {
  const items = [];
  for (let i = 1; i <= 7; i++) {
    const desc = inv[`description${i}`];
    const amt = inv[`amount${i}`];
    if (desc && desc.trim() !== "") {
      items.push({
        description: desc,
        amount_usd: amt || 0,
      });
    }
  }
  return items;
}


export default function AdminClubMembershipInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);



  const loadInvoices = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("club_invoices")
      .select(`
  id,
  customer_id,
  membership_id,
  invoice_no,
  created_at,
  issued_at,
  due_date,
  status,
  total:total,
  paid_total:paid_total,
  discount:discount_cents,
  pdf_url,

  customer:customer_id (
    id,
    main_full_name,
    email
  ),

   description1,
  amount1,
  description2,
  amount2,
  description3,
  amount3,
  description4,
  amount4,
  description5,
  amount5,
  description6,
  amount6,
  description7,
  amount7
)

      `
      )
      .order("created_at", { ascending: false });

    if (!error && data) setInvoices(data);
    else console.error("Error loading membership invoices:", error);

    setLoading(false);
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return invoices;
    return invoices.filter((inv) => inv.status === statusFilter);
  }, [invoices, statusFilter]);

  const toggleExpand = (id) => {
    setExpanded(expanded === id ? null : id);
  };

  const statusColor = (status) => {
    switch (status) {
      case "paid":
        return "text-green-600 bg-green-100";
      case "partial":
        return "text-orange-600 bg-orange-100";
      default:
        return "text-red-600 bg-red-100";
    }
  };


  (async () => {
  const u = await supabase.auth.getUser();
  console.log("USER:", u);

  const test = await supabase
    .from("club_invoices")
    .select("*")
    .limit(5);

  console.log("INVOICES:", test);
})();


  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-aquaBlue mb-4">
        Factures Membership
      </h1>

      {/* FILTER BAR */}
      <div className="flex items-center gap-4 mb-4">
        <select
          className="border rounded px-3 py-1"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Tous</option>
          <option value="pending">En attente</option>
          <option value="partial">Partiel</option>
          <option value="paid">Payée</option>
        </select>

        <button
          onClick={loadInvoices}
          className="px-3 py-1 bg-aquaBlue text-white rounded flex items-center gap-2"
        >
          <FaSearch /> Recharger
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-200 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">Client</th>
              <th className="px-4 py-2 text-left">Facture</th>
              <th className="px-4 py-2 text-left">Plan</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Payé</th>
              <th className="px-4 py-2 text-right">Balance</th>
              <th className="px-4 py-2 text-center">Statut</th>
              <th className="px-4 py-2 text-center">PDF</th>
              <th className="px-4 py-2 text-center">Voir</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="9" className="text-center py-4">
                  Chargement...
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan="9" className="text-center py-4">
                  Aucune facture trouvée
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((inv) => {
                const fullName = inv.customer?.main_full_name || "—";
                const planLabel = "—"; // (no membership join yet)


                const balance =
                  Number(inv.total || 0) - Number(inv.paid_total || 0);

                return (
                  <>
                    <tr
                      key={inv.id}
                      className="border-t hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-2">{fullName}</td>
                      <td className="px-4 py-2">{inv.invoice_no || "—"}</td>
                      <td className="px-4 py-2">{planLabel}</td>

                      <td className="px-4 py-2 text-right">
                        {formatCurrencyUSD(inv.total)}
                      </td>

                      <td className="px-4 py-2 text-right">
                        {formatCurrencyUSD(inv.paid_total)}
                      </td>

                      <td className="px-4 py-2 text-right">
                        {formatCurrencyUSD(balance)}
                      </td>

                      <td className="px-4 py-2 text-center">
                        <span
                          className={`px-2 py-1 rounded text-sm ${statusColor(
                            inv.status
                          )}`}
                        >
                          {inv.status === "paid"
                            ? "Payée"
                            : inv.status === "partial"
                            ? "Partielle"
                            : "En attente"}
                        </span>
                      </td>

                      <td className="px-4 py-2 text-center">
                        {inv.pdf_url ? (
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-red-600 hover:text-red-800"
                          >
                            <FaFilePdf size={18} />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => toggleExpand(inv.id)}
                          className="text-aquaBlue hover:text-orange-600"
                        >
                          {expanded === inv.id ? (
                            <FaChevronUp />
                          ) : (
                            <FaChevronDown />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* EXPANDED DETAILS */}
                    {expanded === inv.id && (
                      <tr className="bg-blue-50 border-t">
                        <td colSpan="9" className="px-6 py-4">
                          <h3 className="font-bold text-aquaBlue mb-2">
                            Détails
                          </h3>

                          <p>
                            <b>Date d’émission:</b>{" "}
                            {formatDateFrSafe(inv.issued_at)}
                          </p>
                          <p>
                            <b>Date limite:</b>{" "}
                            {formatDateFrSafe(inv.due_date)}
                          </p>

                          {/* ITEMS */}
<div className="mt-4">
  <h4 className="font-semibold mb-2">Éléments facturés</h4>

  {(() => {
    const items = extractItems(inv);

    return (
      <table className="w-full bg-white rounded shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-3 py-1 text-left">Description</th>
            <th className="px-3 py-1 text-right">Montant USD</th>
          </tr>
        </thead>

        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan="2" className="text-center py-2">
                —
              </td>
            </tr>
          )}

          {items.map((it, index) => (
            <tr key={index}>
              <td className="px-3 py-1">{it.description}</td>
              <td className="px-3 py-1 text-right">
                {formatCurrencyUSD(it.amount_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  })()}
</div>

                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
