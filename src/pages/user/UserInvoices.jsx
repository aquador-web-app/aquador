import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";
import {
  formatCurrencyUSD,
  formatDateFrSafe,
  formatMonth,
} from "../../lib/dateUtils";
import {
  FaFileInvoiceDollar,
  FaFilePdf,
  FaCalendarAlt,
  FaChevronDown,
} from "react-icons/fa";
import PaymentPage from "../../components/payments/PaymentPage";
import { useGlobalAlert } from "../../components/GlobalAlert";

// ---------- Helpers ----------
const frVariants = {
  collapse: { height: 0, opacity: 0, transition: { duration: 0.25 } },
  expand: { height: "auto", opacity: 1, transition: { duration: 0.25 } },
};

function sanitizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}


function sumRemaining(inv) {
  const t = Number(inv?.total || 0);
  const p = Number(inv?.paid_total || 0);
  return Math.max(t - p, 0);
}

function buildOwnerMap(profile, children) {
  const map = new Map();
  if (profile) map.set(profile.id, profile.full_name || "—");
  (children || []).forEach((c) => map.set(c.id, c.full_name || "—"));
  return map;
}

function groupByMonth(rows) {
  const grouped = {};
  rows.forEach((r) => {
    const key = r.month || "Sans mois";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });
  // sort months desc by date value when possible
  return Object.entries(grouped)
    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
    .map(([month, items]) => ({ month, items }));
}

// =====================================================

// Payment UI (unchanged logic; still supports family multi-select)
  function PaymentOptions({
    profile,
    children,
    invoices,
    selectedInvoice,
    setSelectedInvoice,
    selectedMethod,
    setSelectedMethod,
    userId,
    setActiveTab,
    setShowCardModal,
  }) {
    const [submitting, setSubmitting] = useState(false);
    const [notification, setNotification] = useState("");
    const [customAmount, setCustomAmount] = useState("");
    const { showAlert } = useGlobalAlert();
    const [proofUrl, setProofUrl] = useState(null);
    const [uploadingProof, setUploadingProof] = useState(false);
    const [hasAdvancePayment, setHasAdvancePayment] = useState(false);

const [advanceAllocations, setAdvanceAllocations] = useState([
  {
    targetMonth: "",
    amount: "",
  },
]);

    useEffect(() => {
  const saved = localStorage.getItem("payment_proof_url");
  if (saved) setProofUrl(saved);
}, []);

useEffect(() => {
  if (proofUrl) localStorage.setItem("payment_proof_url", proofUrl);
  else localStorage.removeItem("payment_proof_url");
}, [proofUrl]);

  
    const allProfiles = [profile, ...(children || [])].filter((p) => p && p.id);
const allIds = allProfiles.map((p) => p.id);

if (!profile) {
  return (
    <div className="py-10 text-center text-gray-500">
      Chargement des informations de paiement...
    </div>
  );
}
    const unpaidInvoices = invoices.filter(
      (inv) =>
        inv.status !== "paid" &&
        allIds.includes(inv.user_id) &&
        (
          Number(inv.total) > 0 ||
          Number(inv.paid_total) > 0
        )
    );

    const ownerOf = (uid) => allProfiles.find((p) => p.id === uid)?.full_name || "Inconnu";


    const formatInvoiceLabel = (inv) =>
      `${ownerOf(inv.user_id)} — ${inv.invoice_no} (${formatCurrencyUSD(sumRemaining(inv))} restant)`;

    async function handleProofPick(f) {
  if (!f) return;

  setUploadingProof(true);
  setProofUrl(null);

  try {
    const ext = f.name.split(".").pop();
    const cleanName = sanitizeName(profile?.full_name || "unknown_user");
    const path = `proofs/${cleanName}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(path, f, { upsert: true });

    if (uploadErr) throw uploadErr;

    const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
    setProofUrl(pub?.publicUrl || null);
  } catch (err) {
    console.error("Proof upload error:", err);
    showAlert("Erreur lors du téléversement de la preuve.");
  } finally {
    setUploadingProof(false);
  }
}

// ---------- Advance payment helpers ----------

const advanceTotal = advanceAllocations.reduce(
  (sum, row) => sum + Number(row.amount || 0),
  0
);

const currentInvoiceAllocation = Math.max(
  0,
  Number(customAmount || 0) - advanceTotal
);

function updateAdvanceAllocation(index, field, value) {
  setAdvanceAllocations((prev) =>
    prev.map((row, i) =>
      i === index
        ? {
            ...row,
            [field]: value,
          }
        : row
    )
  );
}

function addAdvanceAllocation() {
  setAdvanceAllocations((prev) => [
    ...prev,
    {
      targetMonth: "",
      amount: "",
    },
  ]);
}

function removeAdvanceAllocation(index) {
  setAdvanceAllocations((prev) => {
    if (prev.length === 1) {
      return [
        {
          targetMonth: "",
          amount: "",
        },
      ];
    }

    return prev.filter((_, i) => i !== index);
  });
}

function resetAdvancePaymentForm() {
  setHasAdvancePayment(false);
  setAdvanceAllocations([
    {
      targetMonth: "",
      amount: "",
    },
  ]);
}

    
    const handleSubmit = async () => {
  if (selectedMethod !== "cash" && selectedMethod !== "virement") {
    return;
  }

  if (!selectedInvoice?.length) {
    showAlert("Veuillez sélectionner au moins une facture.");
    return;
  }

  if (selectedMethod === "virement" && uploadingProof) {
    showAlert(
      "Veuillez patienter pendant le téléversement de la preuve."
    );
    return;
  }

  if (selectedMethod === "virement" && !proofUrl) {
    showAlert("Veuillez joindre une preuve de virement.");
    return;
  }

  /*
   * Advance payments must belong to ONE source invoice.
   *
   * Normal payments can still use the existing
   * multi-invoice FIFO distribution.
   */
  if (hasAdvancePayment && selectedInvoice.length !== 1) {
    showAlert(
      "Pour effectuer un paiement anticipé, veuillez sélectionner une seule facture."
    );
    return;
  }

  const selectedUnpaidInvoices = invoices.filter((inv) =>
    selectedInvoice.includes(inv.id)
  );

  if (selectedUnpaidInvoices.length === 0) {
    showAlert("Aucune facture valide sélectionnée.");
    return;
  }

  const totalRemaining = selectedUnpaidInvoices.reduce(
    (sum, inv) =>
      sum +
      Math.max(
        Number(inv.total || 0) -
          Number(inv.paid_total || 0),
        0
      ),
    0
  );

  if (
  hasAdvancePayment &&
  (!customAmount || Number(customAmount) <= 0)
) {
  showAlert(
    "Veuillez entrer le montant total du paiement reçu avant d’ajouter un paiement anticipé."
  );
  return;
}

  const totalToPay =
    Number(customAmount) > 0
      ? Number(customAmount)
      : totalRemaining;

  if (!Number.isFinite(totalToPay) || totalToPay <= 0) {
    showAlert("Veuillez entrer un montant valide.");
    return;
  }

  /*
   * Validate future allocations.
   */
  const validAdvanceAllocations = hasAdvancePayment
    ? advanceAllocations.filter(
        (row) =>
          row.targetMonth &&
          Number(row.amount || 0) > 0
      )
    : [];

  if (hasAdvancePayment) {
    if (validAdvanceAllocations.length === 0) {
      showAlert(
        "Veuillez ajouter au moins un mois de paiement anticipé."
      );
      return;
    }

    if (
      validAdvanceAllocations.length !==
      advanceAllocations.length
    ) {
      showAlert(
        "Veuillez compléter le mois et le montant de chaque paiement anticipé."
      );
      return;
    }

    const sourceInvoice = selectedUnpaidInvoices[0];
    const sourceMonth = String(
      sourceInvoice.month || ""
    ).slice(0, 7);

    if (!sourceMonth) {
      showAlert(
        "Le mois de la facture sélectionnée est introuvable."
      );
      return;
    }

    for (const allocation of validAdvanceAllocations) {
      if (allocation.targetMonth <= sourceMonth) {
        showAlert(
          "Chaque paiement anticipé doit viser un mois postérieur à celui de la facture sélectionnée."
        );
        return;
      }
    }

    if (advanceTotal > totalToPay) {
      showAlert(
        "Le total des paiements anticipés ne peut pas dépasser le montant payé."
      );
      return;
    }

    /*
     * The portion left for the current invoice cannot exceed
     * its actual outstanding balance.
     */
    const sourceRemaining = Math.max(
      Number(sourceInvoice.total || 0) -
        Number(sourceInvoice.paid_total || 0),
      0
    );

    const amountForCurrentInvoice =
      totalToPay - advanceTotal;

    if (amountForCurrentInvoice > sourceRemaining) {
      showAlert(
        `La part affectée à la facture actuelle (${formatCurrencyUSD(
          amountForCurrentInvoice
        )}) dépasse son solde restant (${formatCurrencyUSD(
          sourceRemaining
        )}).`
      );
      return;
    }

    const duplicateMonths = validAdvanceAllocations.map(
  (row) => row.targetMonth
);

if (
  new Set(duplicateMonths).size !==
  duplicateMonths.length
) {
  showAlert(
    "Le même mois ne peut pas être ajouté deux fois."
  );
  return;
}
  } else {
    /*
     * Preserve the original rule for ordinary payments.
     */
    if (totalToPay > totalRemaining) {
      showAlert(
        `Le montant total (${formatCurrencyUSD(
          totalToPay
        )}) ne peut pas dépasser le total restant (${formatCurrencyUSD(
          totalRemaining
        )}).`
      );
      return;
    }
  }

  setSubmitting(true);

  try {
    const {
      data: sessionData,
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session) {
      throw new Error(
        "Session expirée. Veuillez vous reconnecter."
      );
    }

    const user = sessionData.session.user;
    const proofUrlToSave = proofUrl;

    /*
     * Prevent another pending payment for the selected
     * source invoice(s).
     */
    const {
      data: existingPending,
      error: pendingErr,
    } = await supabase
      .from("payments")
      .select("id, invoice_id")
      .in("invoice_id", selectedInvoice)
      .eq("approved", false);

    if (pendingErr) {
      throw new Error(
        "Erreur de vérification des paiements existants."
      );
    }

    if (existingPending?.length > 0) {
      showAlert(
        "⛔ Vous avez déjà une demande de paiement en cours pour cette facture. Veuillez attendre sa validation."
      );
      return;
    }

    /*
     * =====================================================
     * ADVANCE PAYMENT
     * =====================================================
     *
     * One real payment is created for the entire amount.
     * Future portions are stored as pending allocation
     * instructions until admin approval.
     */
    if (hasAdvancePayment) {
      const sourceInvoice = selectedUnpaidInvoices[0];

      const {
        data: insertedPayment,
        error: payErr,
      } = await supabase
        .from("payments")
        .insert([
          {
            invoice_id: sourceInvoice.id,
            amount: totalToPay,
            method:
              selectedMethod === "cash"
                ? "cash"
                : "transfer",
            notes:
              selectedMethod === "virement"
                ? `Preuve de virement envoyée (${formatCurrencyUSD(
                    totalToPay
                  )}) - paiement anticipé inclus`
                : `Paiement en espèces soumis (${formatCurrencyUSD(
                    totalToPay
                  )}) - paiement anticipé inclus`,
            paid_at: new Date().toISOString(),
            approved: false,
            created_by: user.id,
            role: "assistant",
          },
        ])
        .select("id")
        .single();

      if (payErr) throw payErr;

      if (!insertedPayment?.id) {
        throw new Error(
          "Le paiement a été créé mais son identifiant est introuvable."
        );
      }

      /*
       * Store every future allocation as pending.
       */
      for (const allocation of validAdvanceAllocations) {
        const { error: allocationErr } =
          await supabase.rpc(
            "create_pending_advance_allocation",
            {
              p_payment_id: insertedPayment.id,
              p_target_month:
                `${allocation.targetMonth}-01`,
              p_amount: Number(allocation.amount),
              p_category: "natation",
            }
          );

        if (allocationErr) throw allocationErr;
      }

      if (
        proofUrlToSave &&
        selectedMethod === "virement"
      ) {
        const { error: proofErr } = await supabase
          .from("invoices")
          .update({ proof_url: proofUrlToSave })
          .eq("id", sourceInvoice.id);

        if (proofErr) throw proofErr;
      }
    } else {
      /*
       * =====================================================
       * NORMAL PAYMENT
       * =====================================================
       *
       * Preserve the existing multi-invoice FIFO behavior.
       */
      let remainingToDistribute = totalToPay;

      for (const inv of selectedUnpaidInvoices) {
        if (remainingToDistribute <= 0) break;

        const invRemaining = Math.max(
          Number(inv.total || 0) -
            Number(inv.paid_total || 0),
          0
        );

        const paymentAmount = Math.min(
          invRemaining,
          remainingToDistribute
        );

        if (paymentAmount <= 0) continue;

        const { error: payErr } = await supabase
          .from("payments")
          .insert([
            {
              invoice_id: inv.id,
              amount: paymentAmount,
              method:
                selectedMethod === "cash"
                  ? "cash"
                  : "transfer",
              notes:
                selectedMethod === "virement"
                  ? `Preuve de virement envoyée (${formatCurrencyUSD(
                      paymentAmount
                    )})`
                  : `Paiement en espèces soumis (${formatCurrencyUSD(
                      paymentAmount
                    )})`,
              paid_at: new Date().toISOString(),
              approved: false,
              created_by: user.id,
              role: "assistant",
            },
          ]);

        if (payErr) throw payErr;

        remainingToDistribute -= paymentAmount;

        if (
          proofUrlToSave &&
          selectedMethod === "virement"
        ) {
          const { error: proofErr } = await supabase
            .from("invoices")
            .update({
              proof_url: proofUrlToSave,
            })
            .eq("id", inv.id);

          if (proofErr) throw proofErr;
        }
      }
    }

    /*
     * Notify admin.
     */
    const { error: emailErr } = await supabase
      .from("email_queue")
      .insert({
        to: "deadrien@clubaquador.com",
        subject:
          selectedMethod === "cash"
            ? hasAdvancePayment
              ? "Nouveau paiement en espèces avec paiement anticipé"
              : "Nouveau paiement en espèces en attente d’approbation"
            : hasAdvancePayment
            ? "Virement avec paiement anticipé soumis"
            : "Preuve de virement soumise",
        body: hasAdvancePayment
          ? `${profile?.full_name} a soumis un paiement de ${formatCurrencyUSD(
              totalToPay
            )}, dont ${formatCurrencyUSD(
              advanceTotal
            )} destiné à un ou plusieurs mois futurs.`
          : `${profile?.full_name} a soumis un paiement ${selectedMethod} pour ${selectedInvoice.length} facture(s).`,
        status: "pending",
        kind: "payment_notice",
        user_id: userId,
      });

    if (emailErr) {
      console.error(
        "Erreur notification paiement:",
        emailErr
      );
    }

    setNotification(
      hasAdvancePayment
        ? `Votre paiement de ${formatCurrencyUSD(
            totalToPay
          )} a été soumis. ${formatCurrencyUSD(
            advanceTotal
          )} sera réservé pour le(s) mois futur(s) indiqué(s) après validation par l’administrateur.`
        : selectedMethod === "cash"
        ? "Votre paiement en espèces a été soumis pour approbation par l’administrateur 💵."
        : "Votre virement a été soumis. 🏦 Un responsable validera la preuve prochainement."
    );

    setActiveTab("factures");
    setSelectedInvoice([]);
    setSelectedMethod(null);
    setCustomAmount("");
    setProofUrl(null);
    resetAdvancePaymentForm();

    localStorage.removeItem(
      "payment_proof_url"
    );
  } catch (err) {
    console.error(
      "Erreur soumission paiement:",
      err
    );

    showAlert(
      "Erreur enregistrement paiement: " +
        err.message
    );
  } finally {
    setSubmitting(false);
  }
};


    return (
      <div className="py-8 text-center text-gray-700">
        <h3 className="text-2xl font-bold mb-4 text-gray-800">Paiements 💰</h3>
        <p className="text-sm text-gray-500 mb-8">
          Cochez une ou plusieurs factures puis choisissez votre mode de paiement :
        </p>

        {/* Multi-invoice list */}
        <div className="flex justify-center mb-6">
          <div
            className="w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-sm p-4 text-left overflow-y-auto"
            style={{ maxHeight: "380px" }}
          >
            {unpaidInvoices.length === 0 ? (
              <p className="text-center text-gray-400 italic">Aucune facture à payer</p>
            ) : (
              unpaidInvoices.map((inv) => {
                const label = `${ownerOf(inv.user_id)} — ${inv.invoice_no} (${formatCurrencyUSD(
                  sumRemaining(inv)
                )} restant)`;
                const isSelected = selectedInvoice?.includes(inv.id);
                return (
                  <label
                    key={inv.id}
                    className={`flex justify-between items-center gap-4 px-4 py-3 mb-2 rounded-xl cursor-pointer transition ${
                      isSelected
                        ? "bg-blue-50 border border-blue-300"
                        : "bg-gray-50 hover:bg-gray-100 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (isSelected) {
                            setSelectedInvoice(selectedInvoice.filter((id) => id !== inv.id));
                          } else {
                            setSelectedInvoice([...(selectedInvoice || []), inv.id]);
                          }
                        }}
                        className="w-5 h-5 accent-blue-600 rounded"
                      />
                      <span className="font-medium text-gray-700">{label}</span>
                    </div>
                    <span className="text-blue-700 font-semibold">
                      {formatCurrencyUSD(sumRemaining(inv))}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
        {/* 🧾 Total of selected invoices */}
{selectedInvoice.length > 0 && (
  <div className="text-lg font-semibold text-gray-800 text-center mb-4">
    Total sélectionné :{" "}
    <span className="text-blue-700 text-xl">
      {formatCurrencyUSD(
        selectedInvoice.reduce((sum, id) => {
          const inv = invoices.find((i) => i.id === id);
          return sum + (inv ? sumRemaining(inv) : 0);
        }, 0)
      )}
    </span>
  </div>
)}


        {/* Method selector */}
        <div className="flex justify-center mb-6">
          <select
            value={selectedMethod || ""}
            onChange={(e) => {
  const method = e.target.value || null;

  setSelectedMethod(method);

  if (method === "card") {
    // Card payments use one invoice at a time.
    setSelectedInvoice([]);
  }
}}
            className="w-72 bg-white text-gray-700 border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium shadow focus:ring-4 focus:ring-blue-200 transition"
          >
            <option value="">— Choisissez un mode de paiement —</option>
            <option value="card">💳 Carte de crédit / débit</option>
            <option value="cash">💵 Espèces</option>
            <option value="virement">🏦 Virement bancaire, Chèques, Dépôt à la banque</option>
          </select>
        </div>

        {/* Cash/Virement submit */}
        {["cash", "virement"].includes(selectedMethod) && selectedInvoice?.length > 0 && (
          <div className="mt-8 flex flex-col items-center gap-4">
            {selectedMethod === "virement" && (
              <div className="flex flex-col items-center">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Téléversez votre preuve (PDF ou JPG) :
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => handleProofPick(e?.target?.files?.[0])}
                  className="text-sm text-gray-600"
                />
              </div>
            )}
            {/* Payment amount field */}
<div className="flex flex-col items-center mt-4">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Montant à payer (USD) :
  </label>
  <input
    type="number"
    step="0.01"
    min="0"
    placeholder="Ex: 45.00"
    value={customAmount || ""}
    onChange={(e) => setCustomAmount(e.target.value)}
    className="w-48 text-center border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:ring-2 focus:ring-blue-200"
  />
</div>

{/* Advance payment */}
<div className="w-full max-w-2xl">
  <label className="flex items-center justify-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={hasAdvancePayment}
      onChange={(e) => {
        const checked = e.target.checked;

        if (checked && selectedInvoice.length !== 1) {
          showAlert(
            "Veuillez sélectionner une seule facture pour effectuer un paiement anticipé."
          );
          return;
        }

        setHasAdvancePayment(checked);

        if (!checked) {
          resetAdvancePaymentForm();
        }
      }}
      className="w-4 h-4"
    />

    <span className="text-sm font-medium text-gray-700">
      Une partie de ce paiement concerne un mois futur
    </span>
  </label>

  {hasAdvancePayment && (
    <div className="mt-4 border border-blue-200 bg-blue-50 rounded-xl p-4 text-left">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-blue-900">
            Paiement anticipé
          </p>

          <p className="text-xs text-blue-700">
            Indiquez le montant à réserver pour un ou plusieurs mois futurs.
          </p>
        </div>

        <button
          type="button"
          onClick={addAdvanceAllocation}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
        >
          + Ajouter un mois
        </button>
      </div>

      <div className="space-y-3">
        {advanceAllocations.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end bg-white border rounded-lg p-3"
          >
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Mois
              </label>

              <input
                type="month"
                value={row.targetMonth}
                onChange={(e) =>
                  updateAdvanceAllocation(
                    index,
                    "targetMonth",
                    e.target.value
                  )
                }
                className="w-full border rounded px-2 py-1"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Montant
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={row.amount}
                onChange={(e) =>
                  updateAdvanceAllocation(
                    index,
                    "amount",
                    e.target.value
                  )
                }
                className="w-full border rounded px-2 py-1"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                removeAdvanceAllocation(index)
              }
              className="bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200"
            >
              Retirer
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-blue-200 pt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Paiement soumis</span>
          <b>
            {formatCurrencyUSD(
              Number(customAmount || 0)
            )}
          </b>
        </div>

        <div className="flex justify-between">
          <span>Montant anticipé</span>
          <b>
            {formatCurrencyUSD(advanceTotal)}
          </b>
        </div>

        <div className="flex justify-between">
          <span>Affecté à la facture actuelle</span>
          <b>
            {formatCurrencyUSD(
              currentInvoiceAllocation
            )}
          </b>
        </div>

        {advanceTotal >
          Number(customAmount || 0) && (
          <p className="text-red-600 font-semibold mt-2">
            Le montant anticipé dépasse le paiement soumis.
          </p>
        )}
      </div>
    </div>
  )}
</div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || uploadingProof}
              className={`px-6 py-3 rounded-lg font-semibold shadow text-white transition ${
                submitting
                  ? "bg-gray-400 cursor-not-allowed"
                  : uploadingProof
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-aquaBlue hover:bg-blue-700"
              }`}
            >
              {uploadingProof ? "Téléversement..." : submitting ? "Traitement..." : "Soumettre"}
            </button>
          </div>
        )}

        {notification && (
          <div className="mt-8 bg-green-50 border border-green-200 text-green-700 py-3 px-4 rounded-lg max-w-md mx-auto shadow-sm">
            {notification}
          </div>
        )}
      </div>
    );
  }

export default function UserInvoices({ userId, initialTab = "factures" }) {
  const [profile, setProfile] = useState(null);
  const [children, setChildren] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [activeTab, setActiveTab] = useState(initialTab);
  useEffect(() => {
  setActiveTab(initialTab || "factures");
}, [initialTab]);
  const [monthFilter, setMonthFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const { showAlert} = useGlobalAlert();

  // payment states (unchanged behavior)
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState([]); // keep array for checkboxes
  const [showCardModal, setShowCardModal] = useState(false);

  // UI state: month sections + row details collapses
  const [openMonths, setOpenMonths] = useState(() => new Set());
  const [openRows, setOpenRows] = useState(() => new Set()); // invoice.id

  // ───────────────────────────────────────────────────
  // Load parent and children
  useEffect(() => {
    (async () => {
      const { data: parent } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name, email, signup_type")
        .eq("id", userId)
        .maybeSingle();

      const { data: kids } = await supabase
        .from("profiles_with_unpaid")
        .select("id, full_name")
        .eq("parent_id", userId);

      setProfile(parent || null);
      setChildren(kids || []);
    })();
  }, [userId]);

  // Fetch invoices for ALL family (parent + children)
  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      const familyIds = [userId, ...(children || []).map((c) => c.id)];
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id, invoice_no, user_id, month,
          description1, amount1, description2, amount2,
          description3, amount3, description4, amount4,
          description5, amount5, description6, amount6,
          description7, amount7, total, paid_total, status,
          due_date, issued_at, pdf_url
        `)
        .in("user_id", familyIds)
        .order("issued_at", { ascending: false });

      if (error) console.error("Erreur chargement factures:", error);
      setInvoices(data || []);
      setLoading(false);
    })();
  }, [profile, children, userId]);

  // ───────────────────────────────────────────────────
  // Month options (from all invoices we show in current tab)
  const monthsAvailable = useMemo(() => {
    const months = Array.from(new Set(invoices.map((i) => i.month))).filter(Boolean);
    return months.sort((a, b) => new Date(b) - new Date(a));
  }, [invoices]);

  const ownerMap = useMemo(() => buildOwnerMap(profile, children), [profile, children]);

  // Filter by month
  const monthFiltered = useMemo(
    () => (monthFilter ? invoices.filter((i) => i.month === monthFilter) : invoices),
    [monthFilter, invoices]
  );

  // Split by status + ensure FAMILY scope for both tabs
  const familyIds = useMemo(
    () => [profile?.id, ...(children || []).map((c) => c.id)].filter(Boolean),
    [profile, children]
  );

  const factures = useMemo(
  () =>
    monthFiltered.filter(
      (i) =>
        familyIds.includes(i.user_id) &&
        i.status !== "paid" &&
        (
          Number(i.total) > 0 ||
          Number(i.paid_total) > 0
        )
    ),
  [monthFiltered, familyIds]
);


  // Avoid obvious dummies in Reçus: keep paid/partial and hide totally empty lines
  const recus = useMemo(
    () =>
      monthFiltered.filter(
        (i) =>
          familyIds.includes(i.user_id) &&
          (i.status === "paid" || i.status === "partial") &&
          ((Number(i.total) || 0) > 0 || (Number(i.paid_total) || 0) > 0)
      ),
    [monthFiltered, familyIds]
  );

  // Group by month (collapsed by default)
  const factureMonths = useMemo(() => groupByMonth(factures), [factures]);
  const recuMonths = useMemo(() => groupByMonth(recus), [recus]);

  // Toggle helpers
  const toggleMonth = (key) =>
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleRow = (id) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

   // ───────────────────────────────────────────────────
    const renderCardPayment = () => {
    const allProfiles = [profile, ...(children || [])].filter(Boolean);
    const allIds = allProfiles.map((p) => p.id);
    const unpaidInvoices = invoices.filter(
  (inv) =>
    inv.status !== "paid" &&
    allIds.includes(inv.user_id) &&
    (
      Number(inv.total) > 0 ||
      Number(inv.paid_total) > 0
    )
);


    const selectedCardInvoice =
  unpaidInvoices.find(
    (inv) =>
      inv.id === selectedInvoice?.[0]
  ) || null;

const totalAmount =
  selectedCardInvoice
    ? sumRemaining(selectedCardInvoice)
    : 0;

    return (
      <div className="py-8 text-center text-gray-700">
        <button
          onClick={() => {
            setSelectedMethod(null);
            setSelectedInvoice([]);
          }}
          className="text-sm text-blue-600 mb-6 hover:underline"
        >
          ← Retour aux options
        </button>

        <h3 className="text-2xl font-bold mb-4 text-gray-800">Paiement par carte 💳</h3>
        <p className="text-sm text-gray-500 mb-8">
  Sélectionnez la facture que vous souhaitez régler :
</p>

        <div className="flex justify-center mb-6">
          <div
            className="w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-sm p-4 text-left overflow-y-auto"
            style={{ maxHeight: "380px" }}
          >
            {unpaidInvoices.length === 0 ? (
              <p className="text-center text-gray-400 italic">Aucune facture à payer</p>
            ) : (
              unpaidInvoices.map((inv) => {
                const owner =
                  allProfiles.find((p) => p.id === inv.user_id)?.full_name || "Inconnu";
                const isSelected = selectedInvoice?.includes(inv.id);
                return (
                  <label
                    key={inv.id}
                    className={`flex justify-between items-center gap-4 px-4 py-3 mb-2 rounded-xl cursor-pointer transition ${
                      isSelected
                        ? "bg-blue-50 border border-blue-300"
                        : "bg-gray-50 hover:bg-gray-100 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
  type="radio"
  name="stripe_invoice"
  checked={
    selectedInvoice?.[0] === inv.id
  }
  onChange={() => {
    setSelectedInvoice([inv.id]);
  }}
  className="w-5 h-5 accent-blue-600"
/>
                      <span className="font-medium text-gray-700">
                        {owner} — {inv.invoice_no}
                      </span>
                    </div>
                    <span className="text-blue-700 font-semibold">
                      {formatCurrencyUSD(sumRemaining(inv))}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {selectedInvoice?.length > 0 && (
          <p className="text-lg font-semibold text-gray-800 mb-6">
            Total à payer :{" "}
            <span className="text-blue-700 text-xl">{formatCurrencyUSD(totalAmount)}</span>
          </p>
        )}

        {selectedCardInvoice ? (
  <button
    type="button"
    onClick={() =>
      setShowCardModal(true)
    }
    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold shadow"
  >
    Continuer vers le paiement 💳
  </button>
) : (
  <p className="text-sm text-gray-500 mt-8">
    Veuillez sélectionner une facture pour continuer.
  </p>
)}
      </div>
    );
  };

  // Render a single month section (solid blue-700 header, animated)
  const MonthSection = ({ monthKey, rows, initiallyOpen = false }) => {
    const isOpen = openMonths.has(monthKey);
    const monthLabel = monthKey && monthKey !== "Sans mois" ? formatMonth(monthKey) : "Sans mois";
    const count = rows.length;
    const total = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const restant = rows.reduce((s, r) => s + sumRemaining(r), 0);

    return (
      <div className="mb-3 rounded-xl overflow-hidden border border-gray-200 bg-white">
        {/* Header bar (solid blue-700) */}
        <button
          onClick={() => toggleMonth(monthKey)}
          className="w-full flex items-center justify-between px-4 py-3 bg-blue-700 text-white"
        >
          <span className="font-semibold">
            {monthLabel} — {count} {count > 1 ? "factures" : "facture"} — Total{" "}
            {formatCurrencyUSD(total)} — Restant {formatCurrencyUSD(restant)}
          </span>
          <FaChevronDown
            className={`transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`}
          />
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key={`${monthKey}-content`}
              initial="collapse"
              animate="expand"
              exit="collapse"
              variants={frVariants}
              className="px-3 py-3"
            >
              {/* Mini table with owner column + collapsible rows */}
              <div className="hidden md:block overflow-x-auto bg-white rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Nom</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap"># Facture</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Échéance</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Total</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Payé</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Restant</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Statut</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">PDF</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => {
                      const owner = ownerMap.get(f.user_id) || "—";
                      const r = sumRemaining(f);
                      const statusColor =
                        f.status === "paid"
                          ? "bg-green-100 text-green-700"
                          : f.status === "partial"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700";
                      const rowOpen = openRows.has(f.id);

                      const items = [];
                      for (let i = 1; i <= 7; i++) {
                        const desc = f[`description${i}`];
                        const amt = Number(f[`amount${i}`]);
                        if (desc && amt > 0) items.push({ desc, amt });
                      }

                      return (
                        <FragmentRow
                          key={f.id}
                          f={f}
                          owner={owner}
                          restant={r}
                          statusColor={statusColor}
                          items={items}
                          rowOpen={rowOpen}
                          toggleRow={toggleRow}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-4">
  {rows.map((f) => {
    const owner = ownerMap.get(f.user_id) || "—";
    const restant = sumRemaining(f);

    return (
      <div
        key={f.id}
        className="bg-white rounded-xl shadow p-4 border space-y-3"
      >
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <p className="font-semibold text-blue-700">{owner}</p>
            <p className="text-xs text-gray-500">
              #{f.invoice_no}
            </p>
            <p className="text-xs text-gray-500">
              Échéance : {formatDateFrSafe(f.due_date)}
            </p>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              f.status === "paid"
                ? "bg-green-100 text-green-700"
                : f.status === "partial"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {f.status === "paid"
              ? "Payée"
              : f.status === "partial"
              ? "Partielle"
              : "En attente"}
          </span>
        </div>

        {/* Amounts */}
        <div className="text-sm text-gray-700 space-y-1">
          <div className="flex justify-between">
            <span>Total</span>
            <b>{formatCurrencyUSD(f.total)}</b>
          </div>
          <div className="flex justify-between">
            <span>Payé</span>
            <b>{formatCurrencyUSD(f.paid_total)}</b>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Restant</span>
            <b className="text-red-600">
              {formatCurrencyUSD(restant)}
            </b>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {f.pdf_url && (
            <button
              onClick={() =>
                window.open(`${f.pdf_url}?m=${Date.now()}`, "_blank")
              }
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm flex items-center justify-center gap-2"
            >
              <FaFilePdf /> PDF
            </button>
          )}

          <button
            onClick={() => toggleRow(f.id)}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm"
          >
            Détails
          </button>
        </div>

        {/* Collapsible details */}
        <AnimatePresence initial={false}>
          {openRows.has(f.id) && (
            <motion.div
              initial="collapse"
              animate="expand"
              exit="collapse"
              variants={frVariants}
              className="bg-gray-50 rounded-lg p-3 text-sm"
            >
              {[1,2,3,4,5,6,7]
                .map(i => ({
                  desc: f[`description${i}`],
                  amt: Number(f[`amount${i}`])
                }))
                .filter(it => it.desc && it.amt > 0)
                .map((it, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{it.desc}</span>
                    <b>{formatCurrencyUSD(it.amt)}</b>
                  </div>
                ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  })}
</div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const FragmentRow = ({
    f,
    owner,
    restant,
    statusColor,
    items,
    rowOpen,
    toggleRow,
  }) => {
    return (
      <>
        <tr className="border-b">
          <td className="px-3 py-2 whitespace-nowrap">{owner}</td>
          <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">
            {f.invoice_no}
          </td>
          <td className="px-3 py-2 whitespace-nowrap">{formatDateFrSafe(f.due_date)}</td>
          <td className="px-3 py-2 whitespace-nowrap">{formatCurrencyUSD(f.total)}</td>
          <td className="px-3 py-2 whitespace-nowrap">{formatCurrencyUSD(f.paid_total)}</td>
          <td className="px-3 py-2 whitespace-nowrap">{formatCurrencyUSD(restant)}</td>
          <td className="px-3 py-2 whitespace-nowrap">
            <span className={`px-2 py-1 rounded text-xs ${statusColor}`}>
              {f.status === "paid" ? "Payée" : f.status === "partial" ? "Partielle" : "En attente"}
            </span>
          </td>
          <td className="px-3 py-2 whitespace-nowrap">
            {f.pdf_url ? (
              <button
  onClick={async () => {
    if (!f.pdf_url) return;

    // Force revalidation on mobile
    try {
      await fetch(f.pdf_url, { method: "HEAD", cache: "no-store" });
    } catch (_) {}

    // Cache-busted open (same file, same name)
    window.open(`${f.pdf_url}?refresh=${Date.now()}`, "_blank");
  }}
  className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
>
  <FaFilePdf /> Ouvrir
</button>

            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
          <td className="px-3 py-2 whitespace-nowrap">
            <button
              onClick={() => toggleRow(f.id)}
              className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
              aria-label="Details"
            >
              <FaChevronDown className={`transition-transform ${rowOpen ? "rotate-180" : ""}`} />
            </button>
          </td>
        </tr>

        <tr className="border-b">
          <td colSpan={9} className="p-0">
            <AnimatePresence initial={false}>
              {rowOpen && (
                <motion.div
                  initial="collapse"
                  animate="expand"
                  exit="collapse"
                  variants={frVariants}
                  className="bg-gray-50 px-4 py-3"
                >
                  {items.length ? (
                    <ul className="text-sm">
                      {items.map((it, i) => (
                        <li key={i} className="flex justify-between">
                          <span className="text-gray-700">{it.desc}</span>
                          <span className="font-medium">{formatCurrencyUSD(it.amt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-sm text-gray-500">Aucun détail</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </td>
        </tr>
      </>
    );
  };

  // ============== RENDER =================
  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header (UNCHANGED gradient) */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-700 to-orange-500 text-white rounded-2xl shadow-lg py-6 px-6 text-center mb-6"
      >
        <h2 className="text-3xl font-bold mb-2 flex justify-center items-center gap-2">
          <FaFileInvoiceDollar /> Mes Factures
        </h2>
        {/* ⛔️ No name / no dropdown here anymore */}
      </motion.div>

      {/* Tabs (unchanged behavior) */}
      <div className="flex justify-center mb-6 space-x-2">
        <button
          onClick={() => setActiveTab("factures")}
          className={`px-4 py-2 rounded-lg font-semibold ${
            activeTab === "factures"
              ? "bg-aquaBlue text-white hover:bg-blue-600"
              : "bg-gray-100 text-gray-600 hover:bg-orange-500"
          }`}
        >
          Factures
        </button>

        <button
          onClick={() => setActiveTab("paiements")}
          className={`px-4 py-2 rounded-lg font-semibold ${
            activeTab === "paiements"
              ? "bg-aquaBlue text-white hover:bg-blue-600"
              : "bg-gray-100 text-gray-600 hover:bg-orange-500"
          }`}
        >
          Paiements
        </button>

        <button
          onClick={() => setActiveTab("recus")}
          className={`px-4 py-2 rounded-lg font-semibold ${
            activeTab === "recus"
              ? "bg-aquaBlue text-white hover:bg-blue-600"
              : "bg-gray-100 text-gray-600 hover:bg-orange-500"
          }`}
        >
          Reçus
        </button>
      </div>

      {/* Month Filter */}
      <div className="flex justify-end mb-4 items-center gap-2">
        <FaCalendarAlt className="text-gray-500" />
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="border rounded-lg px-3 py-1 text-sm"
        >
          <option value="">Tous les mois</option>
          {monthsAvailable.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-md p-4">
        {loading ? (
          <p className="text-center text-gray-500 py-6">Chargement des factures...</p>
          
        ) : activeTab === "paiements" ? (
          
          selectedMethod === "card" ? (
            renderCardPayment()
          ) : (
            <PaymentOptions
              profile={profile}
              children={children}
              invoices={invoices}
              selectedInvoice={selectedInvoice}
              setSelectedInvoice={setSelectedInvoice}
              selectedMethod={selectedMethod}
              setSelectedMethod={setSelectedMethod}
              userId={userId}
              setActiveTab={setActiveTab}
              setShowCardModal={setShowCardModal}
            />
          )
        ) : activeTab === "factures" ? (
          factureMonths.length === 0 ? (
            <div className="text-center text-gray-500 py-10 italic">Aucune facture</div>
          ) : (
            factureMonths.map(({ month, items }) => (
              <MonthSection key={`fac-${month}`} monthKey={month} rows={items} />
            ))
          )
        ) : (
          // Reçus
          (recuMonths.length === 0 ? (
            <div className="text-center text-gray-500 py-10 italic">Aucun reçu</div>
          ) : (
            recuMonths.map(({ month, items }) => (
              <MonthSection key={`rec-${month}`} monthKey={month} rows={items} />
            ))
          ))
        )}
      </div>
      

      {/* Floating Stripe Modal */}
{showCardModal && selectedInvoice?.[0] && (
  <div className="fixed inset-0 z-[9999] overflow-y-auto">

    {/* Dark background */}
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-md"
      onClick={() => {
        setShowCardModal(false);
        setSelectedMethod(null);
      }}
    />

    {/* Scrollable modal positioning */}
    <div className="relative min-h-full flex items-start sm:items-center justify-center p-3 sm:p-6">

      {/* Modal */}
      <div
        className="
          relative
          bg-white
          rounded-2xl
          shadow-2xl
          w-full
          max-w-lg
          max-h-[90vh]
          overflow-y-auto
          p-4
          sm:p-6
          my-4
        "
      >
        <button
          type="button"
          onClick={() => {
            setShowCardModal(false);
            setSelectedMethod(null);
          }}
          className="absolute top-3 right-3 z-20 text-gray-400 hover:text-gray-700 text-xl"
        >
          ✕
        </button>

        <h3 className="text-xl sm:text-2xl font-bold mb-4 pr-8 text-gray-800 text-center">
          Paiement par carte 💳
        </h3>

        <div className="border-t border-gray-200 my-4"></div>

        <PaymentPage
          invoiceId={selectedInvoice[0]}
          user={profile}
          invoiceType="school"
        />
      </div>
    </div>
  </div>
)}
    </div>
  );
}
