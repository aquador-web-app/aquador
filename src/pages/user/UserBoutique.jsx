import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion } from "framer-motion";
import {
  FaShoppingBag,
  FaCheckCircle,
  FaTimes,
  FaMoneyBillWave,
  FaCreditCard,
  FaCashRegister,
  FaUpload,
  FaExclamationTriangle,
  FaTrash,
  FaPlus,
  FaMinus,
} from "react-icons/fa";
import { formatCurrencyUSD } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";

export default function UserBoutique() {
  // ---------------- State ----------------
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [commissionBalance, setCommissionBalance] = useState(0);
  const { showConfirm, showInput, showAlert } = useGlobalAlert();

  const [q, setQ] = useState("");

  // Cart & checkout
  const [cart, setCart] = useState([]); // [{id,name,price,stock,image_url, qty}]
  const [openCart, setOpenCart] = useState(false);
  const [method, setMethod] = useState("commission");
  const [submitting, setSubmitting] = useState(false);

  // Virement proof
  const [proofUploading, setProofUploading] = useState(false);
  const [proofUrl, setProofUrl] = useState("");

  // ---------------- Load user and commission balance ----------------
  useEffect(() => {
    (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error) {
        console.error("❌ getUser error:", error);
        return;
      }
      setUser(user || null);
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles_with_unpaid")
        .select("full_name")
        .eq("id", user.id)
        .single();
      setProfile(prof || null);

      await refreshCommissionBalance(user.id);
    })();
  }, []);

  async function refreshCommissionBalance(userId) {
    const { data, error } = await supabase
      .from("commissions")
      .select("remaining_amount")
      .eq("referrer_user_id", userId);

    if (error) {
      console.error("❌ Commissions error:", error);
      return;
    }

    const total = (data || []).reduce(
      (acc, c) => acc + Number(c.remaining_amount || 0),
      0
    );

    setCommissionBalance(total);
  }

  // ---------------- Load products ----------------
  const loadProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("❌ Products error:", error);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return products;
    return products.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(qq) ||
        (p.description || "").toLowerCase().includes(qq)
    );
  }, [q, products]);

  // ---------------- Cart helpers ----------------
  function addToCart(p, addQty = 1) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      const max = Number(p.stock || 0);
      if (max <= 0) return prev;

      if (existing) {
        const nextQty = Math.min(existing.qty + addQty, max);
        if (nextQty === existing.qty) {
          alert("Stock insuffisant pour ajouter plus de cet article.");
          return prev;
        }
        return prev.map((i) => (i.id === p.id ? { ...i, qty: nextQty } : i));
      }
      return [...prev, { ...p, qty: Math.min(addQty, max) }];
    });
  }

  function updateQty(id, newQty) {
    setCart((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const max = Number(i.stock || 0);
        const qty = Math.max(1, Math.min(Number(newQty || 1), max));
        return { ...i, qty };
      })
    );
  }

  function removeFromCart(id) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  function clearCart() {
    setCart([]);
  }

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, i) => sum + Number(i.price || 0) * Number(i.qty || 0),
        0
      ),
    [cart]
  );

  const canPayWithCommissions = cartTotal > 0 && commissionBalance >= cartTotal;

  // If commissions no longer sufficient for total, auto-switch away from commission
  useEffect(() => {
    if (method === "commission" && !canPayWithCommissions && cartTotal > 0) {
      setMethod("cash");
    }
    if (method !== "virement" && proofUrl) {
      setProofUrl("");
    }
  }, [method, canPayWithCommissions, cartTotal, proofUrl]);

  // ---------------- Proof upload (virement) ----------------
  const handleProofUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setProofUploading(true);

    try {
      const clientName = (profile?.full_name || user.email || user.id)
        .toString()
        .replace(/[^a-z0-9]/gi, "_");
      const stamp = Date.now();
      const ext = (file.name.split(".").pop() || "dat").toLowerCase();
      const fileName = `${clientName}_Cart_${stamp}.${ext}`;
      const path = `proofs/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: signed, error: signedErr } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(path, 60 * 60 * 24 * 30);
      if (signedErr) throw signedErr;

      setProofUrl(signed?.signedUrl || "");
      alert("✅ Fichier de preuve téléchargé avec succès.");
    } catch (err) {
      alert("Erreur de téléchargement : " + err.message);
    } finally {
      setProofUploading(false);
    }
  };

  // ---------------- Submit order (multi-item) ----------------
  const submitOrder = async () => {
    if (!user) return alert("Utilisateur introuvable.");
    if (!cart.length) return alert("Votre panier est vide.");
    if (cart.some((i) => i.qty < 1)) return alert("Quantité invalide.");
    if (cart.some((i) => i.qty > (i.stock ?? 0)))
      return alert("Stock insuffisant pour un ou plusieurs articles.");

    if (method === "virement" && !proofUrl)
      return alert("Veuillez joindre une preuve de virement (pdf/jpg/png).");

    if (method === "commission" && !canPayWithCommissions)
      return alert("Solde de commissions insuffisant.");

    if (method === "commission") {
      const confirmUse = showConfirm(
        `Êtes-vous sûr de vouloir utiliser vos commissions pour effectuer cet achat ?\n\nSolde de commissions restant : ${formatCurrencyUSD(
          commissionBalance
        )}\nTotal de l'achat : ${formatCurrencyUSD(cartTotal)}`
      );
      if (!confirmUse) return;
    }

    setSubmitting(true);
    try {
      const p_items = cart.map((i) => ({
        product_id: i.id,
        name: i.name,
        price: i.price,
        qty: i.qty,
      }));

      const { data: inv, error } = await supabase.rpc(
        "create_boutique_invoice_from_cart",
        {
          p_user_id: user.id,
          p_full_name: profile?.full_name || "Client",
          p_items,
          p_payment_method: method,
        }
      );
      if (error) throw error;

      const invoiceId = inv?.id || inv;

      if (method === "virement" && proofUrl && invoiceId) {
        try {
          await supabase
            .from("boutique_invoices")
            .update({ proof_url: proofUrl })
            .eq("id", invoiceId);
        } catch (e) {
          console.warn("Could not save proof_url on invoice:", e?.message);
        }
      }

      showAlert(
        method === "commission"
          ? "Achat effectué avec vos commissions ✅"
          : "Commande enregistrée. En attente de validation."
      );

      setOpenCart(false);
      clearCart();
      setMethod("commission");
      setProofUrl("");

      waitForPdf(invoiceId);
      loadProducts();
      refreshCommissionBalance(user.id);
    } catch (err) {
      alert("Erreur lors de la commande : " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------- Poll until PDF generated ----------------
  async function waitForPdf(invoiceId) {
    if (!invoiceId) return;
    const maxTries = 10;
    for (let i = 0; i < maxTries; i++) {
      const { data, error } = await supabase
        .from("boutique_invoices")
        .select("pdf_url")
        .eq("id", invoiceId)
        .maybeSingle();

      if (!error && data?.pdf_url) {
        try {
          window.open(data.pdf_url, "_blank");
        } catch {}
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    console.warn("⚠️ PDF not ready after waiting — skipping auto-open");
  }

  // ---------------- UI ----------------
  return (
    <motion.div
      className="bg-white p-4 sm:p-6 rounded-2xl shadow-lg"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FaShoppingBag className="text-aquaBlue text-2xl" />
          <h1 className="text-2xl font-bold text-gray-800">Boutique</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="text-sm bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg w-full sm:w-auto text-center sm:text-left">
            Solde commissions:&nbsp;
            <span
              className={
                commissionBalance > 0
                  ? "text-green-700 font-semibold"
                  : "text-gray-600"
              }
            >
              {formatCurrencyUSD(commissionBalance)}
            </span>
          </div>

          <div className="text-sm bg-gray-50 border border-gray-200 px-3 py-1 rounded-lg w-full sm:w-auto text-center sm:text-left">
            Total panier:&nbsp;
            <span className="text-blue-700 font-semibold">
              {formatCurrencyUSD(cartTotal)}
            </span>
          </div>

          <button
            onClick={() => setOpenCart(true)}
            className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 w-full sm:w-auto"
          >
            <FaShoppingBag /> Panier ({cart.length})
          </button>

          <input
            placeholder="Rechercher un article…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-aquaBlue outline-none w-full sm:w-auto"
          />
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="text-center text-gray-500 py-10">Chargement…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 mt-6">
          {filtered.map((p) => {
            const out = (p.stock || 0) <= 0;
            const low = !out && (p.stock || 0) <= 5;

            return (
              <motion.div
                key={p.id}
                className={`border border-gray-200 rounded-2xl shadow-sm p-3 hover:shadow-md transition relative ${
                  out ? "opacity-60" : ""
                }`}
                whileHover={{ scale: 1.01 }}
              >
                <div className="w-full aspect-square bg-white rounded-xl border overflow-hidden mb-3">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <span className="text-5xl">🖼️</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
                  {p.description && (
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  <div className="text-sm text-gray-700">
                    Prix:&nbsp;
                    <span className="text-blue-700 font-semibold">
                      {formatCurrencyUSD(p.price)}
                    </span>
                  </div>
                  <div className="text-xs">
                    {out ? (
                      <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        <FaExclamationTriangle /> Rupture de stock
                      </span>
                    ) : low ? (
                      <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        <FaExclamationTriangle /> Stock faible ({p.stock})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <FaCheckCircle /> Stock&nbsp;{p.stock}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    disabled={out}
                    onClick={() => addToCart(p, 1)}
                    className={`px-4 py-2 rounded-lg text-white font-semibold shadow w-full sm:w-auto ${
                      out
                        ? "bg-gray-300 cursor-not-allowed"
                        : "bg-aquaBlue hover:bg-blue-700"
                    }`}
                  >
                    Ajouter au panier
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Cart & Checkout Modal */}
      {openCart && (
        <motion.div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-2 sm:px-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
          >
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">
                Panier & Paiement
              </h3>
              <button
                onClick={() => setOpenCart(false)}
                className="text-gray-500 hover:text-gray-700"
                title="Fermer"
              >
                <FaTimes />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="text-gray-600 py-6 text-center">
                Votre panier est vide.
              </div>
            ) : (
              <>
                {/* Cart Items */}
                <div className="max-h-[45vh] overflow-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3 py-3 border-b"
                    >
                      <div className="sm:col-span-2 flex justify-center">
                        <div className="w-24 sm:w-full aspect-square bg-white rounded-xl border overflow-hidden">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <span className="text-3xl">🖼️</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="sm:col-span-4 text-center sm:text-left">
                        <div className="font-semibold text-gray-900">
                          {item.name}
                        </div>
                        <div className="text-sm text-gray-600">
                          Prix: {formatCurrencyUSD(item.price)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Stock: {item.stock ?? 0}
                        </div>
                      </div>

                      <div className="sm:col-span-3 flex items-center justify-center sm:justify-start gap-2">
                        <button
                          onClick={() => updateQty(item.id, item.qty - 1)}
                          className="px-2 py-1 bg-gray-100 border rounded hover:bg-gray-200"
                          title="Diminuer"
                        >
                          <FaMinus />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={item.stock || 0}
                          value={item.qty}
                          onChange={(e) =>
                            updateQty(item.id, Number(e.target.value || 1))
                          }
                          className="w-20 border rounded px-2 py-1 text-center"
                        />
                        <button
                          onClick={() => updateQty(item.id, item.qty + 1)}
                          className="px-2 py-1 bg-gray-100 border rounded hover:bg-gray-200"
                          title="Augmenter"
                        >
                          <FaPlus />
                        </button>
                      </div>

                      <div className="sm:col-span-2 text-center sm:text-right font-semibold">
                        {formatCurrencyUSD(
                          Number(item.price || 0) * Number(item.qty || 0)
                        )}
                      </div>

                      <div className="sm:col-span-1 flex justify-center sm:justify-end">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-600 hover:text-red-700"
                          title="Retirer"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Payment Section */}
<div className="mt-6 space-y-4">
  {/* Payment Method */}
  <div>
    <div className="text-sm font-medium mb-2">Méthode de paiement</div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[
        {
          key: "commission",
          label: "Commissions",
          icon: <FaMoneyBillWave />,
          disabled: !canPayWithCommissions,
        },
        {
          key: "stripe",
          label: "Carte (Stripe)",
          icon: <FaCreditCard />,
        },
        {
          key: "cash",
          label: "Espèces",
          icon: <FaCashRegister />,
        },
        { key: "virement", label: "Virement", icon: <FaUpload /> },
      ].map(({ key, label, icon, disabled }) => (
        <label
          key={key}
          className={`flex items-center justify-center sm:justify-start gap-2 border rounded-lg px-3 py-3 h-[52px] sm:h-[56px] cursor-pointer transition-all duration-150
            ${method === key ? "ring-2 ring-aquaBlue bg-blue-50 border-aquaBlue" : "border-gray-200"}
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <div className="flex items-center justify-center gap-2 w-full text-gray-800 leading-none">
            <input
              type="radio"
              name="pay"
              checked={method === key}
              onChange={() => !disabled && setMethod(key)}
              disabled={disabled}
              className="w-4 h-4 accent-aquaBlue shrink-0"
              style={{ transform: "translateY(1px)" }}
            />
            <span className="flex items-center gap-2 text-sm font-medium select-none">
              <span className="text-base flex items-center justify-center">{icon}</span>
              <span className="whitespace-nowrap">{label}</span>
            </span>
          </div>
        </label>
      ))}
    </div>

    {method === "virement" && (
      <div className="mt-3">
        <label className="text-sm font-medium block mb-1">
          Preuve de virement (PDF/JPG/PNG)
        </label>
        <label className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg border cursor-pointer w-full sm:w-auto">
          <FaUpload />
          <span>
            {proofUploading ? "Téléchargement…" : "Choisir un fichier"}
          </span>
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={handleProofUpload}
            className="hidden"
          />
        </label>
        {proofUrl && (
          <div className="text-xs text-green-700 mt-1">
            Fichier chargé ✓
          </div>
        )}
      </div>
    )}
  </div>

  {/* Summary Box BELOW */}
  <div className="border rounded-xl p-4 bg-gray-50">
    <div className="flex items-center justify-between text-sm text-gray-600">
      <span>Solde commissions</span>
      <span
        className={
          commissionBalance > 0
            ? "text-green-700 font-semibold"
            : "text-gray-700"
        }
      >
        {formatCurrencyUSD(commissionBalance)}
      </span>
    </div>
    <div className="mt-2 flex items-center justify-between text-base font-semibold">
      <span>Total</span>
      <span className="text-blue-700">
        {formatCurrencyUSD(cartTotal)}
      </span>
    </div>
    {!canPayWithCommissions && method === "commission" && (
      <div className="mt-2 text-xs text-red-600">
        Solde insuffisant pour payer avec les commissions.
      </div>
    )}
    <div className="mt-4 flex flex-col sm:flex-row gap-2">
      <button
        onClick={clearCart}
        className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 w-full sm:w-auto"
      >
        Vider
      </button>
      <button
        onClick={submitOrder}
        disabled={submitting || cart.length === 0}
        className="flex-1 px-3 py-2 bg-aquaBlue text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
      >
        {submitting ? "Traitement…" : "Confirmer l’achat"}
      </button>
    </div>
  </div>
</div>

              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
