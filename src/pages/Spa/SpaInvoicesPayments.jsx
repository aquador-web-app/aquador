import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useGlobalAlert } from "../../components/GlobalAlert";
import {
  FaCheckCircle,
  FaClock,
  FaCreditCard,
  FaFileInvoiceDollar,
  FaFilePdf,
  FaMoneyBillWave,
  FaTimesCircle,
  FaUniversity,
  FaUpload,
} from "react-icons/fa";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(date);
}

function sanitizeFilePart(value) {
  return String(value || "spa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function getInvoiceStatusLabel(status) {
  switch (status) {
    case "paid":
      return "Payée";

    case "partial":
      return "Partiellement payée";

    default:
      return "En attente";
  }
}

function getInvoiceStatusClasses(status) {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-700";

    case "partial":
      return "bg-yellow-100 text-yellow-700";

    default:
      return "bg-red-100 text-red-700";
  }
}

function getPaymentStatusInfo(status) {
  switch (status) {
    case "approved":
      return {
        label: "Approuvé",
        classes: "bg-green-100 text-green-700",
        icon: FaCheckCircle,
      };

    case "rejected":
      return {
        label: "Rejeté",
        classes: "bg-red-100 text-red-700",
        icon: FaTimesCircle,
      };

    default:
      return {
        label: "En attente",
        classes: "bg-yellow-100 text-yellow-700",
        icon: FaClock,
      };
  }
}

function getMethodLabel(method) {
  switch (method) {
    case "cash":
      return "Espèces";

    case "transfer":
      return "Virement / dépôt / chèque";

    case "card":
      return "Carte";

    default:
      return method || "—";
  }
}

/**
 * Customer-facing spa invoice and payment page.
 *
 * Required props:
 * - phone
 * - birthDate: YYYY-MM-DD
 * - email
 *
 * These values should come from the customer dashboard verification flow.
 */
export default function SpaPayments({
  phone,
  birthDate,
  email,
  onBillingChange,
}) {
  const { showAlert, showConfirm } = useGlobalAlert();

  const proofInputRef = useRef(null);

  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);

  const [activeTab, setActiveTab] = useState("invoices");

  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [proofUrl, setProofUrl] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedInvoice = useMemo(
    () =>
      invoices.find((invoice) => invoice.id === selectedInvoiceId) ||
      null,
    [invoices, selectedInvoiceId]
  );

  const unpaidInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        const remaining = Number(invoice.remaining_usd || 0);

        return invoice.status !== "paid" && remaining > 0;
      }),
    [invoices]
  );

  const existingPendingPayment = useMemo(
    () =>
      payments.find(
        (payment) =>
          payment.invoice_id === selectedInvoiceId &&
          payment.status === "pending"
      ) || null,
    [payments, selectedInvoiceId]
  );

  async function fetchBilling() {
    if (!phone || !birthDate || !email) {
      setInvoices([]);
      setPayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        "get_spa_customer_billing",
        {
          p_phone: phone,
          p_birth_date: birthDate,
          p_email: email,
        }
      );

      if (error) throw error;

      const nextInvoices = Array.isArray(data?.invoices)
        ? data.invoices
        : [];

      const nextPayments = Array.isArray(data?.payments)
        ? data.payments
        : [];

      setInvoices(nextInvoices);
      setPayments(nextPayments);

      if (
        selectedInvoiceId &&
        !nextInvoices.some(
          (invoice) => invoice.id === selectedInvoiceId
        )
      ) {
        setSelectedInvoiceId("");
      }
    } catch (error) {
      console.error("Spa billing fetch error:", error);

      showAlert(
        error?.message ||
          "Impossible de charger vos factures et paiements."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, birthDate, email]);

  useEffect(() => {
    if (!selectedInvoice) {
      setAmount("");
      return;
    }

    setAmount(
      Number(selectedInvoice.remaining_usd || 0).toFixed(2)
    );
  }, [selectedInvoice]);

  useEffect(() => {
    if (method !== "transfer") {
      setProofUrl("");

      if (proofInputRef.current) {
        proofInputRef.current.value = "";
      }
    }
  }, [method]);

  async function handleProofUpload(file) {
    if (!file) return;

    if (!selectedInvoice) {
      showAlert("Veuillez d’abord sélectionner une facture.");
      return;
    }

    const acceptedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    if (!acceptedTypes.includes(file.type)) {
      showAlert(
        "La preuve doit être un fichier PDF, JPG, JPEG ou PNG."
      );
      return;
    }

    const maximumSize = 10 * 1024 * 1024;

    if (file.size > maximumSize) {
      showAlert(
        "La taille maximale autorisée pour la preuve est de 10 Mo."
      );
      return;
    }

    setUploadingProof(true);
    setProofUrl("");

    try {
      const extension =
        file.name.split(".").pop()?.toLowerCase() || "pdf";

      const invoicePart = sanitizeFilePart(
        selectedInvoice.invoice_no || selectedInvoice.id
      );

      const path =
        `spa-payment-proofs/${invoicePart}/` +
        `${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("payment-proofs")
        .getPublicUrl(path);

      const uploadedUrl = publicData?.publicUrl || "";

      if (!uploadedUrl) {
        throw new Error(
          "L’adresse de la preuve n’a pas pu être obtenue."
        );
      }

      setProofUrl(uploadedUrl);
    } catch (error) {
      console.error("Spa proof upload error:", error);

      showAlert(
        error?.message ||
          "Erreur lors du téléversement de la preuve."
      );
    } finally {
      setUploadingProof(false);
    }
  }

  function resetPaymentForm() {
    setSelectedInvoiceId("");
    setAmount("");
    setMethod("");
    setReference("");
    setNotes("");
    setProofUrl("");

    if (proofInputRef.current) {
      proofInputRef.current.value = "";
    }
  }

  async function submitPayment(event) {
    event.preventDefault();

    if (!selectedInvoice) {
      showAlert("Veuillez sélectionner une facture.");
      return;
    }

    if (existingPendingPayment) {
      showAlert(
        "Un paiement est déjà en attente de validation pour cette facture."
      );
      return;
    }

    const numericAmount = Number(amount);
    const remaining = Number(
      selectedInvoice.remaining_usd || 0
    );

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showAlert("Veuillez entrer un montant valide.");
      return;
    }

    if (numericAmount > remaining) {
      showAlert(
        `Le montant ne peut pas dépasser le solde restant de ${formatCurrency(
          remaining
        )}.`
      );
      return;
    }

    if (!["cash", "transfer", "card"].includes(method)) {
      showAlert("Veuillez choisir un mode de paiement.");
      return;
    }

    if (method === "transfer" && uploadingProof) {
      showAlert(
        "Veuillez patienter pendant le téléversement de la preuve."
      );
      return;
    }

    if (method === "transfer" && !proofUrl) {
      showAlert(
        "Veuillez joindre une preuve de virement, de dépôt ou de chèque."
      );
      return;
    }

    const confirmed = await showConfirm(
      `Soumettre un paiement de ${formatCurrency(
        numericAmount
      )} pour la facture ${
        selectedInvoice.invoice_no || "sélectionnée"
      } ?`
    );

    if (!confirmed) return;

    setSubmitting(true);

    try {
      const { data, error } = await supabase.rpc(
        "submit_spa_payment",
        {
          p_invoice_id: selectedInvoice.id,
          p_phone: phone,
          p_birth_date: birthDate,
          p_email: email,
          p_amount: numericAmount,
          p_method: method,
          p_reference: reference.trim() || null,
          p_proof_url:
            method === "transfer" ? proofUrl : null,
          p_notes: notes.trim() || null,
        }
      );

      if (error) throw error;

      if (!data?.success) {
        throw new Error(
          "La demande de paiement n’a pas pu être enregistrée."
        );
      }

      await fetchBilling();

      resetPaymentForm();
      setActiveTab("payments");

      showAlert(
        "Votre paiement a été soumis. Il sera pris en compte après validation par l’administration."
      );

      if (onBillingChange) {
        onBillingChange();
      }
    } catch (error) {
      console.error("Spa payment submission error:", error);

      const message = String(error?.message || "");

      if (
        message.includes(
          "already awaiting approval"
        )
      ) {
        showAlert(
          "Un paiement est déjà en attente de validation pour cette facture."
        );
      } else if (
        message.includes("Customer verification failed")
      ) {
        showAlert(
          "Les informations de vérification du client ne correspondent pas."
        );
      } else if (
        message.includes(
          "cannot exceed the remaining balance"
        )
      ) {
        showAlert(
          "Le montant saisi dépasse le solde restant de la facture."
        );
      } else {
        showAlert(
          message ||
            "Erreur lors de la soumission du paiement."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!phone || !birthDate || !email) {
    return (
      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6 text-center text-yellow-800">
        Les informations de vérification du client sont
        manquantes. Veuillez retourner à l’accès aux
        réservations.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">
        Chargement des factures et paiements...
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6">
        <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900">
          <FaFileInvoiceDollar className="text-aquaBlue" />
          Factures et paiements
        </h2>

        <p className="mt-2 text-sm text-gray-500">
          Consultez vos factures, soumettez un paiement et
          suivez son statut.
        </p>
      </div>

      <div className="mb-6 flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
            activeTab === "invoices"
              ? "bg-aquaBlue text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Factures ({invoices.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
            activeTab === "payments"
              ? "bg-aquaBlue text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Paiements ({payments.length})
        </button>
      </div>

      {activeTab === "invoices" && (
        <div className="space-y-5">
          {invoices.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">
              Aucune facture trouvée.
            </div>
          ) : (
            invoices.map((invoice) => {
              const remaining = Number(
                invoice.remaining_usd || 0
              );

              const invoicePendingPayment = payments.find(
                (payment) =>
                  payment.invoice_id === invoice.id &&
                  payment.status === "pending"
              );

              return (
                <div
                  key={invoice.id}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-4 border-b border-gray-100 p-5 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Facture
                      </p>

                      <h3 className="mt-1 text-xl font-bold text-gray-900">
                        {invoice.invoice_no || "En préparation"}
                      </h3>

                      <p className="mt-1 text-sm text-gray-500">
                        Rendez-vous :{" "}
                        {formatDateTime(
                          invoice.appointment_start
                        )}
                      </p>

                      <p className="text-sm text-gray-500">
                        Émise le :{" "}
                        {formatDate(invoice.issued_at)}
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-2 md:items-end">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getInvoiceStatusClasses(
                          invoice.status
                        )}`}
                      >
                        {getInvoiceStatusLabel(invoice.status)}
                      </span>

                      {invoicePendingPayment && (
                        <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
                          Paiement soumis
                        </span>
                      )}
                    </div>
                  </div>

                  {Array.isArray(invoice.appointments) &&
                    invoice.appointments.length > 0 && (
                      <div className="border-b border-gray-100 p-5">
                        <p className="mb-3 text-sm font-semibold text-gray-700">
                          Services
                        </p>

                        <div className="space-y-3">
                          {invoice.appointments.map(
                            (appointment) => (
                              <div
                                key={appointment.id}
                                className="flex flex-col justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center"
                              >
                                <div>
                                  <p className="font-medium text-gray-800">
                                    {appointment.service_name ||
                                      "Massage"}
                                  </p>

                                  <p className="text-xs text-gray-500">
                                    {appointment.customer_name}
                                    {appointment.duration_minutes
                                      ? ` — ${appointment.duration_minutes} minutes`
                                      : ""}
                                  </p>
                                </div>

                                <span className="font-semibold text-gray-800">
                                  {formatCurrency(
                                    appointment.price_usd
                                  )}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                  <div className="grid gap-5 p-5 md:grid-cols-2">
                    <div className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">
                          Sous-total
                        </span>

                        <span className="font-medium">
                          {formatCurrency(
                            invoice.subtotal_usd
                          )}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-gray-500">
                          Réduction
                        </span>

                        <span className="font-medium">
                          {formatCurrency(
                            invoice.discount_usd
                          )}
                        </span>
                      </div>

                      <div className="flex justify-between border-t border-gray-200 pt-2">
                        <span className="font-semibold">
                          Total
                        </span>

                        <span className="font-bold">
                          {formatCurrency(
                            invoice.total_amount_usd
                          )}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-gray-500">
                          Déjà payé
                        </span>

                        <span className="font-medium text-green-700">
                          {formatCurrency(
                            invoice.paid_total_usd
                          )}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="font-semibold">
                          Restant
                        </span>

                        <span className="text-lg font-bold text-red-600">
                          {formatCurrency(remaining)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col justify-center gap-3">
                      {invoice.pdf_url && (
                        <button
                          type="button"
                          onClick={() =>
                            window.open(
                              `${invoice.pdf_url}${
                                invoice.pdf_url.includes("?")
                                  ? "&"
                                  : "?"
                              }t=${Date.now()}`,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                          className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 font-semibold text-blue-700 transition hover:bg-blue-100"
                        >
                          <FaFilePdf />
                          Voir la facture PDF
                        </button>
                      )}

                      {remaining > 0 &&
                        !invoicePendingPayment && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoiceId(
                                invoice.id
                              );
                              setMethod("");
                              setReference("");
                              setNotes("");
                              setProofUrl("");
                            }}
                            className="flex items-center justify-center gap-2 rounded-xl bg-aquaBlue px-4 py-3 font-semibold text-white shadow transition hover:opacity-90"
                          >
                            <FaMoneyBillWave />
                            Effectuer un paiement
                          </button>
                        )}

                      {invoicePendingPayment && (
                        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-center text-sm text-yellow-800">
                          Un paiement est actuellement en
                          attente de validation pour cette
                          facture.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {selectedInvoice && (
            <form
              onSubmit={submitPayment}
              className="rounded-2xl border border-blue-200 bg-white p-5 shadow-md"
            >
              <div className="mb-5">
                <h3 className="text-lg font-bold text-gray-900">
                  Soumettre un paiement
                </h3>

                <p className="mt-1 text-sm text-gray-500">
                  Facture :{" "}
                  <strong>
                    {selectedInvoice.invoice_no || "—"}
                  </strong>
                </p>

                <p className="text-sm text-gray-500">
                  Solde restant :{" "}
                  <strong className="text-red-600">
                    {formatCurrency(
                      selectedInvoice.remaining_usd
                    )}
                  </strong>
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Montant
                  </label>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={Number(
                      selectedInvoice.remaining_usd || 0
                    )}
                    value={amount}
                    onChange={(event) =>
                      setAmount(event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Mode de paiement
                  </label>

                  <select
                    value={method}
                    onChange={(event) =>
                      setMethod(event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
                    required
                  >
                    <option value="">
                      — Choisissez —
                    </option>

                    <option value="cash">
                      Espèces
                    </option>

                    <option value="transfer">
                      Virement, dépôt ou chèque
                    </option>

                    <option value="card">
                      Carte
                    </option>
                  </select>
                </div>
              </div>

              {method && (
                <div className="mt-5 rounded-xl bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    {method === "cash" && (
                      <FaMoneyBillWave className="text-green-600" />
                    )}

                    {method === "transfer" && (
                      <FaUniversity className="text-blue-600" />
                    )}

                    {method === "card" && (
                      <FaCreditCard className="text-purple-600" />
                    )}

                    <p className="text-sm text-gray-700">
                      {method === "cash" &&
                        "Soumettez la déclaration du paiement en espèces. L’administration la validera après réception."}

                      {method === "transfer" &&
                        "Téléversez une preuve du virement, du dépôt bancaire ou du chèque."}

                      {method === "card" &&
                        "Le paiement par carte sera soumis pour validation. L’intégration du processeur de carte pourra être branchée ici."}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-5">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Référence du paiement
                </label>

                <input
                  type="text"
                  value={reference}
                  onChange={(event) =>
                    setReference(event.target.value)
                  }
                  placeholder="Numéro de transaction, référence du dépôt..."
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {method === "transfer" && (
                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Preuve du paiement
                  </label>

                  <input
                    ref={proofInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(event) =>
                      handleProofUpload(
                        event.target.files?.[0]
                      )
                    }
                    className="block w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm"
                  />

                  <div className="mt-2 flex items-center gap-2 text-xs">
                    {uploadingProof ? (
                      <span className="text-blue-600">
                        Téléversement en cours...
                      </span>
                    ) : proofUrl ? (
                      <span className="flex items-center gap-1 text-green-700">
                        <FaUpload />
                        Preuve téléversée
                      </span>
                    ) : (
                      <span className="text-gray-500">
                        PDF, JPG ou PNG — maximum 10 Mo
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-5">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Note
                </label>

                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                  placeholder="Informations complémentaires..."
                  className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetPaymentForm}
                  disabled={submitting}
                  className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    uploadingProof ||
                    Boolean(existingPendingPayment)
                  }
                  className="rounded-xl bg-aquaBlue px-6 py-3 font-semibold text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {submitting
                    ? "Soumission..."
                    : "Soumettre le paiement"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-4">
          {payments.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">
              Aucun paiement soumis.
            </div>
          ) : (
            payments.map((payment) => {
              const statusInfo = getPaymentStatusInfo(
                payment.status
              );

              const StatusIcon = statusInfo.icon;

              return (
                <div
                  key={payment.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        Facture
                      </p>

                      <h3 className="text-lg font-bold text-gray-900">
                        {payment.invoice_no || "—"}
                      </h3>

                      <p className="mt-2 text-2xl font-bold text-aquaBlue">
                        {formatCurrency(payment.amount)}
                      </p>

                      <p className="mt-1 text-sm text-gray-500">
                        {getMethodLabel(payment.method)} —{" "}
                        {formatDateTime(payment.paid_at)}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.classes}`}
                    >
                      <StatusIcon />
                      {statusInfo.label}
                    </span>
                  </div>

                  {(payment.reference ||
                    payment.notes ||
                    payment.rejection_reason ||
                    payment.proof_url) && (
                    <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
                      {payment.reference && (
                        <p>
                          <span className="font-medium text-gray-600">
                            Référence :
                          </span>{" "}
                          {payment.reference}
                        </p>
                      )}

                      {payment.notes && (
                        <p>
                          <span className="font-medium text-gray-600">
                            Note :
                          </span>{" "}
                          {payment.notes}
                        </p>
                      )}

                      {payment.rejection_reason && (
                        <p className="rounded-lg bg-red-50 p-3 text-red-700">
                          <strong>Motif du rejet :</strong>{" "}
                          {payment.rejection_reason}
                        </p>
                      )}

                      {payment.proof_url && (
                        <button
                          type="button"
                          onClick={() =>
                            window.open(
                              payment.proof_url,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          Voir la preuve
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}