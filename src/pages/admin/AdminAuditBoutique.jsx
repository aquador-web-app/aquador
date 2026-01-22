import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";

export default function AdminAuditBoutique() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const productsMap = Object.fromEntries(
  products.map(p => [p.id, p.name])
);

  const [productId, setProductId] = useState("");
  const [source, setSource] = useState("all"); // all | registration | purchase

  // -----------------------------
  // Load products for dropdown
  // -----------------------------
  useEffect(() => {
    const loadProducts = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .order("name");

      if (!error) setProducts(data || []);
    };

    loadProducts();
  }, []);

  // -----------------------------
  // Load audit rows (GIFTS + PURCHASES)
  // -----------------------------
  useEffect(() => {
    if (!productId) {
      setRows([]);
      setLoading(false);
      return;
    }

    const loadAudit = async () => {
      setLoading(true);

      // =============================
      // 🎁 REGISTRATION GIFTS
      // =============================
      const { data: gifts, error: giftErr } = await supabase
      
        .from("invoice_items")
        .select(`
          id,
          created_at,
          type,
          product_id,
          invoices!invoice_items_invoice_id_fkey (
            invoice_no,
            user_id
          )
        `)
        .eq("product_id", productId)
        .eq("type", "registration");

      if (giftErr) {
        console.error("❌ Gift audit error:", giftErr);
      }

       console.log("RAW GIFTS", gifts); // ✅ now valid

       const userIds = [
    ...new Set(
      (gifts || [])
        .map(g => g.invoices?.user_id)
        .filter(Boolean)
    )
  ];

  let usersMap = {};

  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", userIds);

    usersMap = Object.fromEntries(
      (users || []).map(u => [u.id, u])
    );
  }

      const giftRows =
    (gifts || []).map((r) => ({
      id: `gift-${r.id}`,
      created_at: r.created_at,
      user: usersMap[r.invoices?.user_id] || null,
      product_name: productsMap[r.product_id] || "—",
      source: "registration",
      invoice_no: r.invoices?.invoice_no || "—",
      qty: 1,
    })) || [];

      // =============================
      // 🛒 BOUTIQUE PURCHASES
      // =============================
      const { data: purchases, error: purchaseErr } = await supabase
        .from("boutique_invoice_items")
        .select(`
          id,
          qty,
          boutique_invoice:boutique_invoices (
            created_at,
            invoice_no,
            user:profiles (
              id,
              full_name,
              role
            )
          ),
          product:products (
            id,
            name
          )
        `)
        .eq("product_id", productId);

      if (purchaseErr) {
        console.error("❌ Purchase audit error:", purchaseErr);
      }

      const purchaseRows =
        (purchases || []).map((r) => ({
          id: `purchase-${r.id}`,
          created_at: r.boutique_invoice?.created_at,
          user: r.boutique_invoice?.user || null,
          product_name: r.product?.name || "—",
          source: "purchase",
          invoice_no: r.boutique_invoice?.invoice_no || "—",
          qty: r.qty || 0,
        })) || [];

      // =============================
      // 🔀 MERGE + FILTER
      // =============================
      let merged = [...giftRows, ...purchaseRows];

      if (source !== "all") {
        merged = merged.filter((r) => r.source === source);
      }

      merged.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      setRows(merged);
      setLoading(false);
    };

    loadAudit();
  }, [productId, source]);

  // -----------------------------
  // Totals
  // -----------------------------
  const totals = useMemo(() => {
    const totalQty = rows.reduce((sum, r) => sum + (r.qty || 0), 0);

    const uniqueUsers = new Set(
      rows.map((r) => r.user?.id).filter(Boolean)
    ).size;

    return { totalQty, uniqueUsers };
  }, [rows]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Audit Boutique</h1>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <select
          className="border rounded px-3 py-2"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">— Select product —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          className="border rounded px-3 py-2"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="all">All sources</option>
          <option value="registration">🎁 Registration</option>
          <option value="purchase">🛒 Purchase</option>
        </select>
      </div>

      {/* Table */}
      <div className="hidden md:block overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-left">Invoice</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="7" className="px-3 py-4 text-center">
                  Loading…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan="7" className="px-3 py-4 text-center text-gray-500">
                  No data
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    {formatDateFrSafe(r.created_at)}
                  </td>

                  <td className="px-3 py-2">
                    {r.user?.full_name || "—"}
                  </td>

                  <td className="px-3 py-2">
                    {r.user?.role || "—"}
                  </td>

                  <td className="px-3 py-2">
                    {r.product_name}
                  </td>

                  <td className="px-3 py-2">
                    {r.source === "registration"
                      ? "🎁 Registration"
                      : "🛒 Purchase"}
                  </td>

                  <td className="px-3 py-2 text-right font-medium">
                    {r.qty}
                  </td>

                  <td className="px-3 py-2">
                    {r.invoice_no}
                  </td>
                </tr>
              ))}
          </tbody>

          {/* Totals */}
          {!loading && rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t">
              <tr>
                {/* Date */}
                <td className="px-3 py-2"></td>

                {/* User → UNIQUE USERS */}
                <td className="px-3 py-2 font-semibold">
                  {totals.uniqueUsers} user{totals.uniqueUsers > 1 ? "s" : ""}
                </td>

                {/* Role */}
                <td className="px-3 py-2"></td>

                {/* Product */}
                <td className="px-3 py-2 font-semibold text-right">
                  Totals
                </td>

                {/* Source */}
                <td className="px-3 py-2"></td>

                {/* Qty → TOTAL QTY */}
                <td className="px-3 py-2 text-right font-semibold">
                  {totals.totalQty}
                </td>

                {/* Invoice */}
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          )}

        </table>
      </div>
      {/* ================= MOBILE VIEW ================= */}
<div className="md:hidden space-y-3">
  {loading && (
    <div className="text-center text-gray-500 py-6">
      Loading…
    </div>
  )}

  {!loading && rows.length === 0 && (
    <div className="text-center text-gray-500 py-6">
      No data
    </div>
  )}

  {!loading &&
    rows.map((r) => (
      <div
        key={r.id}
        className="border rounded-lg p-3 bg-white shadow-sm space-y-2"
      >
        <div className="text-xs text-gray-500">
          {formatDateFrSafe(r.created_at)}
        </div>

        <div className="font-semibold text-gray-800">
          {r.user?.full_name || "—"}
        </div>

        <div className="text-sm text-gray-600">
          Role: {r.user?.role || "—"}
        </div>

        <div className="text-sm">
          <span className="font-medium">Product:</span>{" "}
          {r.product_name}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span>
            {r.source === "registration"
              ? "🎁 Registration"
              : "🛒 Purchase"}
          </span>

          <span className="font-semibold">
            Qty: {r.qty}
          </span>
        </div>

        <div className="text-xs text-gray-500">
          Invoice: {r.invoice_no}
        </div>
      </div>
    ))}
</div>
{/* Mobile totals */}
{!loading && rows.length > 0 && (
  <div className="md:hidden border rounded-lg bg-gray-50 p-3 flex justify-between text-sm font-semibold">
    <div>
      👥 {totals.uniqueUsers} user{totals.uniqueUsers > 1 ? "s" : ""}
    </div>
    <div>
      📦 {totals.totalQty}
    </div>
  </div>
)}

    </div>
  );
}
