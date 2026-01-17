// src/pages/Club/ClubGuestDashboard.jsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";
import ClubSignupDocsModal from "../../components/ClubSignupDocsModal";
import { useNavigate } from "react-router-dom";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { detectCountryISO } from "../../lib/detectCountry";




function formatTime(t) {
  if (!t) return "—";
  if (!t.includes(":")) return t.padStart(2, "0") + ":00";
  let [hh, mm] = t.split(":");
  hh = hh.padStart(2, "0");
  mm = (mm || "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

function sanitizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export default function ClubGuestDashboard() {
  const [sp] = useSearchParams();
  const invoiceId = sp.get("invoice_id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [booking, setBooking] = useState(null);
  const [payments, setPayments] = useState([]);
  const navigate = useNavigate();
  const [showPostPaymentAlert, setShowPostPaymentAlert] = useState(false);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [country, setCountry] = useState("HT");




  // steps: summary -> signup -> payment
  const [step, setStep] = useState("summary");

  // Open/close modal for documents
  const [showDocsModal, setShowDocsModal] = useState(false);

  // Guest mini-profile (no password)
  const [guest, setGuest] = useState({
    full_name: "",
    email: "",
    phone: "",
  });

  // (kept in case you re-use a checkbox later)
  const [rulesAccepted, setRulesAccepted] = useState(false);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState("");

  useEffect(() => {
  try {
    const c = detectCountryISO();
    setCountry(c || "HT");
  } catch {
    setCountry("HT");
  }
}, []);



  // -------- LOAD DATA --------
  useEffect(() => {
    if (!invoiceId) {
      setError("Lien invalide : identifiant de facture manquant.");
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError("");

      try {
        // 1) Charger la facture
        const { data: inv, error: invErr } = await supabase
          .from("club_booking_invoices")
          .select(
            `
            id,
            booking_id,
            invoice_no,
            amount_cents,
            discount_cents,
            final_amount_cents,
            payment_status,
            pdf_url,
            client_email,
            created_at
          `
          )
          .eq("id", invoiceId)
          .single();

        if (invErr || !inv) {
          console.error("Invoice load error:", invErr);
          setError("Facture introuvable ou lien expiré.");
          setLoading(false);
          return;
        }

        // 2) Charger la réservation associée
        const { data: book, error: bookErr } = await supabase
          .from("venue_bookings")
          .select(
            "id, full_name, email, phone, title, date, start_time, end_time, booking_type"
          )
          .eq("id", inv.booking_id)
          .single();

        if (bookErr || !book) {
          console.error("Booking load error:", bookErr);
          setError("Réservation associée introuvable.");
          setLoading(false);
          return;
        }

        // 3) Charger les paiements (approuvés + en attente)
        const { data: pays, error: payErr } = await supabase
          .from("club_payments")
          .select("amount, approved")
          .eq("invoice_id", inv.id);

        if (payErr) console.warn("Payments load warning:", payErr);

        setInvoice(inv);
        setBooking(book);
        setPayments(pays || []);

        // Prefill guest info
        setGuest({
          full_name: book.full_name || "",
          email: inv.client_email || book.email || "",
          phone: book.phone || "",
        });

        setLoading(false);
      } catch (e) {
        console.error("ClubGuestDashboard fatal load:", e);
        setError("Erreur inattendue lors du chargement de la facture.");
        setLoading(false);
      }
    })();
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center text-gray-600">
        Chargement de votre réservation...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center text-red-600">
        {error}
      </div>
    );
  }

  if (!invoice || !booking) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center text-red-600">
        Données de réservation incomplètes.
      </div>
    );
  }

  // ----- Montants -----
  const baseAmount =
    typeof invoice.amount_cents === "number" ? invoice.amount_cents / 100 : 0;
  const discountAmount =
    typeof invoice.discount_cents === "number"
      ? invoice.discount_cents / 100
      : 0;
  const finalAmount =
    typeof invoice.final_amount_cents === "number"
      ? invoice.final_amount_cents / 100
      : baseAmount - discountAmount;

  const approvedPaid = (payments || [])
    .filter((p) => p.approved)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const pendingPaid = (payments || [])
    .filter((p) => !p.approved)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const remaining = Math.max(finalAmount - approvedPaid, 0);

  // ---------- STEP SIGNUP: mini "guest access" ----------
  async function handleSignupSubmit(e) {
    e.preventDefault();

    if (!guest.full_name.trim() || !guest.email.trim()) {
      alert("Veuillez saisir au minimum votre nom complet et votre email.");
      return;
    }

    // 2️⃣ Phone validation (ONLY if phone is provided)
  if (guest.phone && !isValidPhoneNumber(guest.phone)) {
    alert("Numéro de téléphone invalide.");
    return;
  }

    try {
      // Save the guest info
      await supabase
        .from("venue_bookings")
        .update({
          full_name: guest.full_name.trim(),
          email: guest.email.trim(),
          phone: guest.phone || null,
        })
        .eq("id", booking.id);

      await supabase
        .from("club_booking_invoices")
        .update({
          client_email: guest.email.trim(),
        })
        .eq("id", invoice.id);
    } catch (e) {
      console.warn("Guest info sync warning:", e);
    }

    // Open documents modal (règlement + accord)
    setShowDocsModal(true);
  }

  // (kept if you want to reintroduce a checkbox flow later)
  function handleRulesConfirm() {
    if (!rulesAccepted) {
      alert("Veuillez lire et accepter le règlement du club.");
      return;
    }
    setStep("payment");
  }

  // ---------- Paiement par carte ----------
  async function handleCardPayment() {
    if (remaining <= 0) {
      alert("Cette facture ne semble plus avoir de solde à régler.");
      return;
    }

    try {
      setSubmitting(true);

      const endpoint = `${
        import.meta.env.VITE_SUPABASE_FUNCTIONS_URL
      }/create-checkout-session`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          kind: "club",
          email: guest.email,
          success_path: `/club/guest-dashboard?invoice_id=${invoice.id}`,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.checkout_url) {
        console.error("Checkout error:", data);
        alert(
          "Impossible de démarrer le paiement par carte. Veuillez réessayer plus tard."
        );
        setSubmitting(false);
        return;
      }

      window.location.href = data.checkout_url;
    } catch (e) {
      console.error("Card payment error:", e);
      alert("Erreur réseau lors du paiement par carte.");
      setSubmitting(false);
    }
  }

  // ---------- Paiement cash / virement ----------
  async function handleOfflinePayment() {
    if (!["cash", "virement"].includes(paymentMethod)) return;

    if (remaining <= 0) {
      alert("Cette facture ne semble plus avoir de solde à régler.");
      return;
    }

    const amountToPay =
      Number(customAmount) > 0
        ? Math.min(Number(customAmount), remaining)
        : remaining;

    if (!amountToPay || amountToPay <= 0) {
      alert("Veuillez entrer un montant valide à régler.");
      return;
    }

    setSubmitting(true);

    try {
      let proofUrl = null;

      if (paymentMethod === "virement" && file) {
        try {
          const ext = file.name.split(".").pop();
          const cleanName = sanitizeName(guest.full_name || "client");
          const path = `proofs/${cleanName}_${Date.now()}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from("payment-proofs")
            .upload(path, file, { upsert: true });

          if (uploadErr) throw uploadErr;

          const { data: pub } = await supabase.storage
            .from("payment-proofs")
            .getPublicUrl(path);

          proofUrl = pub?.publicUrl || null;
        } catch (e) {
          console.error("Erreur téléversement preuve:", e);
          alert("Erreur lors du téléversement de la preuve de virement.");
          setSubmitting(false);
          return;
        }
      }

      const { error: payErr } = await supabase.from("club_payments").insert([
        {
          invoice_id: invoice.id,
          amount: amountToPay,
          method: paymentMethod === "cash" ? "cash" : "transfer",
          paid_at: new Date().toISOString(),
          approved: false,
          proof_url: proofUrl,
        },
      ]);

      if (payErr) {
        console.error("club_payments insert error:", payErr);
        alert("Erreur lors de l'enregistrement du paiement.");
        setSubmitting(false);
        return;
      }

      setNotification(
        paymentMethod === "cash"
          ? "Votre paiement en espèces a été enregistré et sera vérifié par l'administration 💵."
          : "Votre virement et la preuve ont été soumis. 🏦 Un responsable vérifiera votre paiement."
      );

      setSubmitting(false);
      setPaymentSubmitted(true); // 🔒 LOCK UI
      
  // ⏱️ Show post-payment alert after 5 seconds
setTimeout(() => {
  setShowPostPaymentAlert(true);
}, 5000);

    } catch (e) {
      console.error("Offline payment error:", e);
      alert("Erreur inattendue lors de la soumission du paiement.");
      setSubmitting(false);
    }
  }

  // ===== UI BLOCKS =====
  const cardPaymentBlock = (
    <div className="bg-white rounded-2xl shadow-md p-6 mt-4">
      <h3 className="text-xl font-bold mb-2 text-gray-800">
        Paiement par carte 💳
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Montant à payer :{" "}
        <span className="font-semibold text-blue-700">
          {formatCurrencyUSD(remaining)}
        </span>
      </p>
      <button
  disabled={submitting || paymentSubmitted}
  onClick={handleCardPayment}
  className="px-6 py-3 rounded-lg font-semibold shadow text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
>
  {paymentSubmitted
    ? "Paiement en attente de validation"
    : submitting
    ? "Redirection en cours..."
    : "Payer maintenant"}
</button>

    </div>
  );

  const offlinePaymentBlock = (
    <div className="bg-white rounded-2xl shadow-md p-6 mt-4">
      <h3 className="text-xl font-bold mb-4 text-gray-800">
        Paiement{" "}
        {paymentMethod === "cash" ? "en espèces 💵" : "par virement 🏦"}
      </h3>

      <p className="text-sm text-gray-600 mb-2">
        Montant total de la facture :{" "}
        <span className="font-semibold">
          {formatCurrencyUSD(finalAmount)}
        </span>
      </p>
      <p className="text-sm text-gray-600 mb-2">
        Paiements approuvés :{" "}
        <span className="font-semibold">
          {formatCurrencyUSD(approvedPaid)}
        </span>
      </p>
      {pendingPaid > 0 && (
        <p className="text-xs text-orange-600 mb-2">
          {formatCurrencyUSD(pendingPaid)} en attente de validation.
        </p>
      )}
      <p className="text-sm text-gray-800 mb-4">
        Reste dû :{" "}
        <span className="font-semibold text-blue-700">
          {formatCurrencyUSD(remaining)}
        </span>
      </p>

      <div className="flex flex-col items-start gap-2 mb-4">
        <label className="block text-sm font-medium text-gray-700">
          Montant à payer (USD) :
        </label>
        <input
  type="number"
  step="0.01"
  min="0"
  disabled={paymentSubmitted}
  value={customAmount}
  onChange={(e) => setCustomAmount(e.target.value)}
  placeholder={remaining.toFixed(2)}
  className={`w-40 border rounded-lg px-3 py-2 text-sm ${
    paymentSubmitted ? "bg-gray-100 cursor-not-allowed" : "border-gray-300"
  }`}
/>

        <p className="text-xs text-gray-500">
          Vous pouvez payer un montant partiel. Le reste restera dû.
        </p>
      </div>

      {paymentMethod === "virement" && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Téléversez votre preuve (PDF ou image) :
          </label>
          <input
  type="file"
  accept=".pdf,.jpg,.jpeg,.png"
  disabled={paymentSubmitted}
  onChange={(e) =>
    e?.target?.files?.[0] && setFile(e.target.files[0])
  }
  className={`text-sm ${
    paymentSubmitted ? "opacity-60 cursor-not-allowed" : "text-gray-600"
  }`}
/>

        </div>
      )}

      <button
  disabled={submitting || paymentSubmitted}
  onClick={handleOfflinePayment}
  className="px-6 py-3 rounded-lg font-semibold shadow text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
>
  {paymentSubmitted
    ? "Paiement soumis"
    : submitting
    ? "Envoi en cours..."
    : "Soumettre le paiement"}
</button>

    </div>
  );

  function handleDocumentsSigned() {
    setShowDocsModal(false);
    // Après signature des documents → directement au paiement
    setStep("payment");
  }

  // ===== REUSABLE HEADER =====
  const Header = (
    <div className="bg-gradient-to-r from-blue-700 to-emerald-500 text-white rounded-2xl shadow-lg py-5 px-6 mb-6">
      <h1 className="text-2xl font-bold mb-1">
        Tableau de bord – Club A’QUA D’OR
      </h1>
      <p className="text-sm text-blue-100">
        Facture #{invoice.invoice_no || invoice.id.slice(0, 8)}
      </p>
    </div>
  );

  // ===== FULL PAGE: SUMMARY =====
  if (step === "summary") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        {Header}

        <div className="bg-white rounded-2xl shadow-md p-5 mb-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-800">
            Détails de votre réservation
          </h2>
          <p className="text-sm text-gray-700">
            <strong>Nom :</strong> {booking.full_name || "—"}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Événement :</strong> {booking.title || "—"}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Date :</strong>{" "}
            {booking.date ? formatDateFrSafe(booking.date) : "—"}
          </p>
          <p className="text-sm text-gray-700 mb-2">
            <strong>Heure :</strong>{" "}
            {formatTime(booking.start_time)} → {formatTime(booking.end_time)}
          </p>

          <div className="mt-3 border-t pt-3 text-sm text-gray-700">
            <p>
              <strong>Montant initial :</strong>{" "}
              {formatCurrencyUSD(baseAmount)}
            </p>
            {discountAmount > 0 && (
              <p>
                <strong>Remise :</strong>{" "}
                {formatCurrencyUSD(discountAmount)}
              </p>
            )}
            <p>
              <strong>Montant final :</strong>{" "}
              {formatCurrencyUSD(finalAmount)}
            </p>
            <p>
              <strong>Reste dû :</strong>{" "}
              <span className="font-semibold text-blue-700">
                {formatCurrencyUSD(remaining)}
              </span>
            </p>
          </div>

          {invoice.pdf_url && (
            <div className="mt-4 text-sm">
              <a
                href={invoice.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                📄 Ouvrir ma facture PDF
              </a>
            </div>
          )}
        </div>

        <div className="text-center">
          <button
            onClick={() => setStep("signup")}
            className="px-8 py-3 bg-emerald-600 text-white font-semibold text-lg rounded-xl shadow hover:bg-emerald-700"
          >
            Continuer
          </button>
        </div>
      </div>
    );
  }

  // ===== FULL PAGE: SIGNUP =====
  if (step === "signup") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        {Header}

        <form
          onSubmit={handleSignupSubmit}
          className="bg-white rounded-2xl shadow-md p-5 mb-6"
        >
          <h2 className="text-lg font-semibold mb-3 text-gray-800">
            1️⃣ Créez votre accès invité
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Aucun mot de passe n’est requis. Ces informations servent à
            sécuriser votre réservation et à vous envoyer les confirmations.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom complet *
              </label>
              <input
                type="text"
                value={guest.full_name}
                onChange={(e) =>
                  setGuest((g) => ({ ...g, full_name: e.target.value }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={guest.email}
                onChange={(e) =>
                  setGuest((g) => ({ ...g, email: e.target.value }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Téléphone (optionnel)
              </label>
              <PhoneInput
  international
  defaultCountry={country}
  countryCallingCodeEditable={false}
  value={guest.phone}
  onChange={(value) =>
    setGuest((g) => ({ ...g, phone: value || "" }))
  }
  placeholder="Numéro de téléphone"
/>

            </div>
            
          </div>

          <button
            type="submit"
            className="mt-5 px-6 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            Continuer
          </button>
        </form>

        {showDocsModal && (
          <ClubSignupDocsModal
            fullName={guest.full_name}
            email={guest.email}
            onClose={() => setShowDocsModal(false)}
            onDone={(docs) => handleDocumentsSigned(docs)}
          />
        )}
      </div>
    );
  }

  // ===== FULL PAGE: PAYMENT =====
  return (
    <div className="max-w-2xl mx-auto p-6">
      {Header}

      <div className="bg-white rounded-2xl shadow-md p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-gray-800">
          3️⃣ Choisissez votre mode de paiement
        </h2>

        {remaining <= 0 ? (
          <p className="text-sm text-green-700">
            Cette facture ne présente plus de solde à régler. Merci 🙏
          </p>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mode de paiement :
              </label>
              <select
                value={paymentMethod}
                disabled={paymentSubmitted}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  setNotification("");
                }}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Choisissez —</option>
                <option value="card">💳 Carte de crédit / débit</option>
                <option value="cash">💵 Espèces (à la caisse)</option>
                <option value="virement">🏦 Virement bancaire</option>
              </select>
            </div>

            {paymentMethod === "card" && cardPaymentBlock}
            {["cash", "virement"].includes(paymentMethod) &&
              offlinePaymentBlock}
          </>
        )}

        {notification && (
          <div className="mt-5 bg-green-50 border border-green-200 text-green-700 py-3 px-4 rounded-lg text-sm">
            {notification}
          </div>
        )}
        {paymentSubmitted && (
  <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
    ⏳ Paiement soumis. En attente de validation par l’administration.
  </div>
)}
      </div>
      {showPostPaymentAlert && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
      <h3 className="text-lg font-bold text-gray-800 mb-3">
        Paiement soumis ⏳
      </h3>

      <p className="text-sm text-gray-600 mb-6">
        Restez en attente de l’approbation du paiement et vérifiez votre email
        afin de recevoir le message de confirmation.
      </p>

      <button
        onClick={() => {
          setShowPostPaymentAlert(false);
          navigate("/club"); // 👈 Club landing
        }}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
      >
        Fermer
      </button>
    </div>
  </div>
)}

    </div>
  );
}
