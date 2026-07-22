import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FaCalendarAlt,
  FaChevronDown,
  FaFileInvoiceDollar,
  FaFilePdf,
} from "react-icons/fa";

import { supabase } from "../../lib/supabaseClient";
import {
  formatCurrencyUSD,
  formatDateFrSafe,
  formatMonth,
} from "../../lib/dateUtils";
import PaymentPage from "../../components/payments/PaymentPage";
import { useGlobalAlert } from "../../components/GlobalAlert";

const frVariants = {
  collapse: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.25 },
  },
  expand: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.25 },
  },
};

function sanitizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function sumRemaining(invoice) {
  const total = Number(invoice?.total || 0);
  const paid = Number(invoice?.paid_total || 0);
  return Math.max(total - paid, 0);
}

function groupByMonth(rows) {
  const grouped = {};

  rows.forEach((row) => {
    const key = row.month || "Sans mois";

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(row);
  });

  return Object.entries(grouped)
    .sort(([monthA], [monthB]) => {
      if (monthA === "Sans mois") return 1;
      if (monthB === "Sans mois") return -1;
      return new Date(monthB) - new Date(monthA);
    })
    .map(([month, items]) => ({ month, items }));
}

function getInvoiceItems(invoice) {
  const items = [];

  for (let index = 1; index <= 7; index += 1) {
    const description = invoice[`description${index}`];
    const amount = Number(invoice[`amount${index}`] || 0);

    if (description && amount > 0) {
      items.push({ description, amount });
    }
  }

  return items;
}

function getStatusLabel(status) {
  if (status === "paid") return "Payée";
  if (status === "partial") return "Partielle";
  return "En attente";
}

function getStatusClasses(status) {
  if (status === "paid") {
    return "bg-green-100 text-green-700";
  }

  if (status === "partial") {
    return "bg-yellow-100 text-yellow-700";
  }

  return "bg-red-100 text-red-700";
}

function PaymentOptions({
  profile,
  invoices,
  selectedInvoice,
  setSelectedInvoice,
  selectedMethod,
  setSelectedMethod,
  setActiveTab,
  setShowCardModal,
}) {
  const { showAlert } = useGlobalAlert();

  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [proofUrl, setProofUrl] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  useEffect(() => {
    const savedProof = localStorage.getItem(
      "club_membership_payment_proof_url"
    );

    if (savedProof) {
      setProofUrl(savedProof);
    }
  }, []);

  useEffect(() => {
    if (proofUrl) {
      localStorage.setItem(
        "club_membership_payment_proof_url",
        proofUrl
      );
    } else {
      localStorage.removeItem(
        "club_membership_payment_proof_url"
      );
    }
  }, [proofUrl]);

  if (!profile) {
    return (
      <div className="py-10 text-center text-gray-500">
        Chargement des informations de paiement...
      </div>
    );
  }

  const unpaidInvoices = invoices.filter(
    (invoice) =>
      invoice.status !== "paid" &&
      (Number(invoice.total) > 0 ||
        Number(invoice.paid_total) > 0)
  );

  async function handleProofPick(file) {
    if (!file) return;

    setUploadingProof(true);
    setProofUrl(null);

    try {
      const extension =
        file.name.split(".").pop()?.toLowerCase() || "file";
      const cleanName = sanitizeName(
        profile.main_full_name || "club_member"
      );
      const path = `club-membership-proofs/${cleanName}_${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file, {
          upsert: true,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = supabase.storage
        .from("documents")
        .getPublicUrl(path);

      setProofUrl(publicData?.publicUrl || null);
    } catch (error) {
      console.error(
        "Club membership proof upload error:",
        error
      );
      showAlert(
        "Erreur lors du téléversement de la preuve."
      );
    } finally {
      setUploadingProof(false);
    }
  }

  async function handleSubmit() {
    if (
      selectedMethod !== "cash" &&
      selectedMethod !== "virement"
    ) {
      return;
    }

    if (!selectedInvoice?.length) {
      showAlert(
        "Veuillez sélectionner au moins une facture."
      );
      return;
    }

    if (
      selectedMethod === "virement" &&
      uploadingProof
    ) {
      showAlert(
        "Veuillez patienter pendant le téléversement de la preuve."
      );
      return;
    }

    if (
      selectedMethod === "virement" &&
      !proofUrl
    ) {
      showAlert(
        "Veuillez joindre une preuve de virement."
      );
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData?.session?.user
      ) {
        throw new Error(
          "Session expirée. Veuillez vous reconnecter."
        );
      }

      const authUser = sessionData.session.user;

      const selectedUnpaidInvoices = invoices.filter(
        (invoice) =>
          selectedInvoice.includes(invoice.id) &&
          invoice.status !== "paid"
      );

      if (!selectedUnpaidInvoices.length) {
        throw new Error(
          "Aucune facture valide n’a été sélectionnée."
        );
      }

      const totalRemaining =
        selectedUnpaidInvoices.reduce(
          (sum, invoice) =>
            sum + sumRemaining(invoice),
          0
        );

      const enteredAmount = Number(customAmount);
      const totalToPay =
        enteredAmount > 0
          ? enteredAmount
          : totalRemaining;

      if (
        !Number.isFinite(totalToPay) ||
        totalToPay <= 0
      ) {
        throw new Error(
          "Veuillez saisir un montant valide."
        );
      }

      if (totalToPay > totalRemaining) {
        throw new Error(
          `Le montant total (${formatCurrencyUSD(
            totalToPay
          )}) ne peut pas dépasser le total restant (${formatCurrencyUSD(
            totalRemaining
          )}).`
        );
      }

      const {
  data: existingPending,
  error: pendingError,
} = await supabase
  .from("club_membership_payments")
  .select("id, invoice_id")
  .in(
    "invoice_id",
    selectedUnpaidInvoices.map(
      (invoice) => invoice.id
    )
  )
  .eq("approved", false);

      if (pendingError) {
        throw new Error(
          "Erreur de vérification des paiements existants."
        );
      }

      if (existingPending?.length) {
        throw new Error(
          "⛔ Vous avez déjà une demande de paiement en cours pour au moins une facture sélectionnée. Veuillez attendre sa validation."
        );
      }

      let remainingToDistribute = totalToPay;

      for (const invoice of selectedUnpaidInvoices) {
        if (remainingToDistribute <= 0) break;

        const invoiceRemaining =
          sumRemaining(invoice);
        const paymentAmount = Math.min(
          invoiceRemaining,
          remainingToDistribute
        );

        if (paymentAmount <= 0) continue;

        const { error: paymentError } = await supabase
  .from("club_membership_payments")
  .insert({
    invoice_id: invoice.id,
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
    created_by: authUser.id,
    role: "member",
  });

        if (paymentError) {
          throw new Error(
            `Erreur d’enregistrement du paiement : ${paymentError.message}`
          );
        }

        if (
          proofUrl &&
          selectedMethod === "virement"
        ) {
          const { error: invoiceUpdateError } =
            await supabase
              .from("club_invoices")
              .update({ proof_url: proofUrl })
              .eq("id", invoice.id);

          if (invoiceUpdateError) {
            console.error(
              "Unable to attach proof to club invoice:",
              invoiceUpdateError
            );
          }
        }

        remainingToDistribute -= paymentAmount;
      }

      const { error: emailError } = await supabase
        .from("email_queue")
        .insert({
          to: "deadrien@clubaquador.com",
          subject:
            selectedMethod === "cash"
              ? "Nouveau paiement de cotisation en espèces en attente"
              : "Nouvelle preuve de paiement de cotisation",
          body: `${
            profile.main_full_name
          } a soumis un paiement de cotisation par ${
            selectedMethod === "cash"
              ? "espèces"
              : "virement"
          } pour ${
            selectedUnpaidInvoices.length
          } facture(s), pour un total de ${formatCurrencyUSD(
            totalToPay
          )}.`,
          status: "pending",
          kind: "club_membership_payment_notice",
          user_id: null,
        });

      if (emailError) {
        console.error(
          "Unable to queue membership payment email:",
          emailError
        );
      }

      setNotification(
        selectedMethod === "cash"
          ? "Votre paiement en espèces a été soumis pour approbation par l’administrateur 💵."
          : "Votre paiement a été soumis. 🏦 Un responsable validera la preuve prochainement."
      );

      setSelectedInvoice([]);
      setSelectedMethod(null);
      setCustomAmount("");
      setProofUrl(null);
      setActiveTab("factures");

      localStorage.removeItem(
        "club_membership_payment_proof_url"
      );
    } catch (error) {
      console.error(
        "Club membership payment submission error:",
        error
      );
      showAlert(
        error?.message ||
          "Une erreur est survenue pendant le paiement."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="py-8 text-center text-gray-700">
      <h3 className="mb-4 text-2xl font-bold text-gray-800">
        Paiements 💰
      </h3>

      <p className="mb-8 text-sm text-gray-500">
        Cochez une ou plusieurs factures puis choisissez
        votre mode de paiement :
      </p>

      <div className="mb-6 flex justify-center">
        <div
          className="w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm"
          style={{ maxHeight: "380px" }}
        >
          {unpaidInvoices.length === 0 ? (
            <p className="text-center italic text-gray-400">
              Aucune facture à payer
            </p>
          ) : (
            unpaidInvoices.map((invoice) => {
              const isSelected =
                selectedInvoice?.includes(invoice.id);
              const label = `${
                invoice.invoice_no || "Sans numéro"
              } — ${formatCurrencyUSD(
                sumRemaining(invoice)
              )} restant`;

              return (
                <label
                  key={invoice.id}
                  className={`mb-2 flex cursor-pointer items-center justify-between gap-4 rounded-xl px-4 py-3 transition ${
                    isSelected
                      ? "border border-blue-300 bg-blue-50"
                      : "border border-transparent bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          setSelectedInvoice(
                            selectedInvoice.filter(
                              (id) => id !== invoice.id
                            )
                          );
                        } else {
                          setSelectedInvoice([
                            ...(selectedInvoice || []),
                            invoice.id,
                          ]);
                        }
                      }}
                      className="h-5 w-5 rounded accent-blue-600"
                    />

                    <span className="font-medium text-gray-700">
                      {label}
                    </span>
                  </div>

                  <span className="font-semibold text-blue-700">
                    {formatCurrencyUSD(
                      sumRemaining(invoice)
                    )}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {selectedInvoice.length > 0 && (
        <div className="mb-4 text-center text-lg font-semibold text-gray-800">
          Total sélectionné :{" "}
          <span className="text-xl text-blue-700">
            {formatCurrencyUSD(
              selectedInvoice.reduce(
                (sum, id) => {
                  const invoice = invoices.find(
                    (item) => item.id === id
                  );

                  return (
                    sum +
                    (invoice
                      ? sumRemaining(invoice)
                      : 0)
                  );
                },
                0
              )
            )}
          </span>
        </div>
      )}

      <div className="mb-6 flex justify-center">
        <select
          value={selectedMethod || ""}
          onChange={(event) => {
            const method =
              event.target.value || null;

            setSelectedMethod(method);

            if (method === "card") {
              if (!selectedInvoice.length) {
                showAlert(
                  "Veuillez sélectionner au moins une facture avant de continuer."
                );
                setSelectedMethod(null);
                return;
              }

              setShowCardModal(true);
            }
          }}
          className="w-72 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow transition focus:ring-4 focus:ring-blue-200"
        >
          <option value="">
            — Choisissez un mode de paiement —
          </option>
          <option value="card">
            💳 Carte de crédit / débit
          </option>
          <option value="cash">💵 Espèces</option>
          <option value="virement">
            🏦 Virement bancaire, Chèque ou Dépôt
          </option>
        </select>
      </div>

      {["cash", "virement"].includes(
        selectedMethod
      ) &&
        selectedInvoice.length > 0 && (
          <div className="mt-8 flex flex-col items-center gap-4">
            {selectedMethod === "virement" && (
              <div className="flex flex-col items-center">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Téléversez votre preuve (PDF ou image) :
                </label>

                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) =>
                    handleProofPick(
                      event.target.files?.[0]
                    )
                  }
                  className="text-sm text-gray-600"
                />
              </div>
            )}

            <div className="mt-4 flex flex-col items-center">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Montant à payer (USD) :
              </label>

              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex. 45.00"
                value={customAmount}
                onChange={(event) =>
                  setCustomAmount(event.target.value)
                }
                className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-center text-gray-700 focus:ring-2 focus:ring-blue-200"
              />

              <p className="mt-1 text-xs text-gray-500">
                Vous pouvez payer un montant partiel. Le
                reste demeurera dû.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                submitting || uploadingProof
              }
              className={`rounded-lg px-6 py-3 font-semibold text-white shadow transition ${
                submitting || uploadingProof
                  ? "cursor-not-allowed bg-gray-400"
                  : "bg-aquaBlue hover:bg-blue-700"
              }`}
            >
              {uploadingProof
                ? "Téléversement..."
                : submitting
                ? "Traitement..."
                : "Soumettre"}
            </button>
          </div>
        )}

      {notification && (
        <div className="mx-auto mt-8 max-w-md rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700 shadow-sm">
          {notification}
        </div>
      )}
    </div>
  );
}

export default function ClubMembershipInvoices({
  clubProfileId,
  initialTab = "factures",
}) {
  const { showAlert } = useGlobalAlert();

  const [profile, setProfile] = useState(null);
  const [familyMembers, setFamilyMembers] =
    useState([]);
  const [invoices, setInvoices] = useState([]);
  const [activeTab, setActiveTab] =
    useState(initialTab);
  const [monthFilter, setMonthFilter] =
    useState("");
  const [loading, setLoading] = useState(false);

  const [selectedMethod, setSelectedMethod] =
    useState(null);
  const [selectedInvoice, setSelectedInvoice] =
    useState([]);
  const [showCardModal, setShowCardModal] =
    useState(false);

  const [openMonths, setOpenMonths] = useState(
    () => new Set()
  );
  const [openRows, setOpenRows] = useState(
    () => new Set()
  );

  useEffect(() => {
    setActiveTab(initialTab || "factures");
  }, [initialTab]);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      if (!clubProfileId) {
        if (isMounted) {
          setProfile(null);
          setFamilyMembers([]);
        }
        return;
      }

      const [
        { data: profileData, error: profileError },
        { data: familyData, error: familyError },
      ] = await Promise.all([
        supabase
          .from("club_profiles")
          .select(
            `
              id,
              auth_user_id,
              main_full_name,
              email,
              phone,
              plan_code,
              is_couple,
              base_monthly_fee_usd,
              total_monthly_fee_usd,
              pay_full_year
            `
          )
          .eq("id", clubProfileId)
          .maybeSingle(),

        supabase
          .from("club_profile_families")
          .select(
            `
              id,
              club_profile_id,
              full_name,
              relation,
              monthly_fee_usd
            `
          )
          .eq("club_profile_id", clubProfileId)
          .order("created_at", {
            ascending: true,
          }),
      ]);

      if (!isMounted) return;

      if (profileError) {
        console.error(
          "Error loading club profile:",
          profileError
        );
        showAlert(
          "Erreur lors du chargement du profil club."
        );
      }

      if (familyError) {
        console.error(
          "Error loading club family:",
          familyError
        );
      }

      setProfile(profileData || null);
      setFamilyMembers(familyData || []);
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [clubProfileId, showAlert]);

  useEffect(() => {
    let isMounted = true;

    async function loadInvoices() {
      if (!clubProfileId) {
        if (isMounted) {
          setInvoices([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      const { data, error } = await supabase
        .from("club_invoices")
        .select(
          `
            id,
            customer_id,
            membership_id,
            invoice_no,
            category,
            month,
            due_date,
            issued_at,
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
            amount7,
            amount_cents,
            discount_cents,
            final_amount_cents,
            currency,
            total,
            paid_total,
            status,
            payment_method,
            payment_url,
            pdf_url,
            proof_url,
            created_at,
            updated_at
          `
        )
        .eq("customer_id", clubProfileId)
        .eq("category", "membership")
        .order("issued_at", {
          ascending: false,
        });

      if (!isMounted) return;

      if (error) {
        console.error(
          "Error loading club membership invoices:",
          error
        );
        showAlert(
          "Erreur lors du chargement des factures du club."
        );
        setInvoices([]);
      } else {
        setInvoices(data || []);
      }

      setLoading(false);
    }

    loadInvoices();

    return () => {
      isMounted = false;
    };
  }, [clubProfileId, showAlert]);

  const monthsAvailable = useMemo(() => {
    const months = Array.from(
      new Set(
        invoices
          .map((invoice) => invoice.month)
          .filter(Boolean)
      )
    );

    return months.sort(
      (monthA, monthB) =>
        new Date(monthB) - new Date(monthA)
    );
  }, [invoices]);

  const monthFiltered = useMemo(
    () =>
      monthFilter
        ? invoices.filter(
            (invoice) =>
              invoice.month === monthFilter
          )
        : invoices,
    [invoices, monthFilter]
  );

  const factures = useMemo(
    () =>
      monthFiltered.filter(
        (invoice) =>
          invoice.status !== "paid" &&
          (Number(invoice.total) > 0 ||
            Number(invoice.paid_total) > 0)
      ),
    [monthFiltered]
  );

  const recus = useMemo(
    () =>
      monthFiltered.filter(
        (invoice) =>
          (invoice.status === "paid" ||
            invoice.status === "partial") &&
          (Number(invoice.total) > 0 ||
            Number(invoice.paid_total) > 0)
      ),
    [monthFiltered]
  );

  const factureMonths = useMemo(
    () => groupByMonth(factures),
    [factures]
  );

  const recuMonths = useMemo(
    () => groupByMonth(recus),
    [recus]
  );

  function toggleMonth(monthKey) {
    setOpenMonths((previous) => {
      const next = new Set(previous);

      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }

      return next;
    });
  }

  function toggleRow(invoiceId) {
    setOpenRows((previous) => {
      const next = new Set(previous);

      if (next.has(invoiceId)) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
      }

      return next;
    });
  }

  async function openPdf(pdfUrl) {
    if (!pdfUrl) return;

    try {
      await fetch(pdfUrl, {
        method: "HEAD",
        cache: "no-store",
      });
    } catch {
      // Opening the PDF should still be attempted.
    }

    window.open(
      `${pdfUrl}${
        pdfUrl.includes("?") ? "&" : "?"
      }refresh=${Date.now()}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function FragmentRow({ invoice }) {
    const remaining = sumRemaining(invoice);
    const items = getInvoiceItems(invoice);
    const rowOpen = openRows.has(invoice.id);

    return (
      <>
        <tr className="border-b">
          <td className="whitespace-nowrap px-3 py-2">
            {profile?.main_full_name || "—"}
          </td>

          <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-800">
            {invoice.invoice_no || "—"}
          </td>

          <td className="whitespace-nowrap px-3 py-2">
            {formatDateFrSafe(invoice.due_date)}
          </td>

          <td className="whitespace-nowrap px-3 py-2">
            {formatCurrencyUSD(invoice.total)}
          </td>

          <td className="whitespace-nowrap px-3 py-2">
            {formatCurrencyUSD(
              invoice.paid_total
            )}
          </td>

          <td className="whitespace-nowrap px-3 py-2">
            {formatCurrencyUSD(remaining)}
          </td>

          <td className="whitespace-nowrap px-3 py-2">
            <span
              className={`rounded px-2 py-1 text-xs ${getStatusClasses(
                invoice.status
              )}`}
            >
              {getStatusLabel(invoice.status)}
            </span>
          </td>

          <td className="whitespace-nowrap px-3 py-2">
            {invoice.pdf_url ? (
              <button
                type="button"
                onClick={() =>
                  openPdf(invoice.pdf_url)
                }
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
              >
                <FaFilePdf /> Ouvrir
              </button>
            ) : (
              <span className="text-gray-400">
                —
              </span>
            )}
          </td>

          <td className="whitespace-nowrap px-3 py-2">
            <button
              type="button"
              onClick={() =>
                toggleRow(invoice.id)
              }
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
              aria-label="Afficher les détails"
            >
              <FaChevronDown
                className={`transition-transform ${
                  rowOpen ? "rotate-180" : ""
                }`}
              />
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
                      {items.map((item, index) => (
                        <li
                          key={`${invoice.id}-${index}`}
                          className="flex justify-between gap-4"
                        >
                          <span className="text-gray-700">
                            {item.description}
                          </span>

                          <span className="font-medium">
                            {formatCurrencyUSD(
                              item.amount
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-sm text-gray-500">
                      Aucun détail
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </td>
        </tr>
      </>
    );
  }

  function MonthSection({ monthKey, rows }) {
    const isOpen = openMonths.has(monthKey);
    const monthLabel =
      monthKey && monthKey !== "Sans mois"
        ? formatMonth(monthKey)
        : "Sans mois";

    const total = rows.reduce(
      (sum, invoice) =>
        sum + Number(invoice.total || 0),
      0
    );

    const remaining = rows.reduce(
      (sum, invoice) =>
        sum + sumRemaining(invoice),
      0
    );

    return (
      <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => toggleMonth(monthKey)}
          className="flex w-full items-center justify-between bg-blue-700 px-4 py-3 text-left text-white"
        >
          <span className="font-semibold">
            {monthLabel} — {rows.length}{" "}
            {rows.length > 1
              ? "factures"
              : "facture"}{" "}
            — Total {formatCurrencyUSD(total)} —
            Restant{" "}
            {formatCurrencyUSD(remaining)}
          </span>

          <FaChevronDown
            className={`shrink-0 transition-transform ${
              isOpen ? "rotate-180" : "rotate-0"
            }`}
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
              <div className="hidden overflow-x-auto rounded-lg border border-gray-100 bg-white md:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 text-left">
                        Nom
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">
                        # Facture
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">
                        Échéance
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">
                        Total
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">
                        Payé
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">
                        Restant
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">
                        Statut
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">
                        PDF
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-left" />
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((invoice) => (
                      <FragmentRow
                        key={invoice.id}
                        invoice={invoice}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-4 md:hidden">
                {rows.map((invoice) => {
                  const remainingAmount =
                    sumRemaining(invoice);
                  const items =
                    getInvoiceItems(invoice);
                  const rowOpen = openRows.has(
                    invoice.id
                  );

                  return (
                    <div
                      key={invoice.id}
                      className="space-y-3 rounded-xl border bg-white p-4 shadow"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-blue-700">
                            {profile?.main_full_name ||
                              "—"}
                          </p>

                          <p className="text-xs text-gray-500">
                            #
                            {invoice.invoice_no ||
                              "Sans numéro"}
                          </p>

                          <p className="text-xs text-gray-500">
                            Échéance :{" "}
                            {formatDateFrSafe(
                              invoice.due_date
                            )}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClasses(
                            invoice.status
                          )}`}
                        >
                          {getStatusLabel(
                            invoice.status
                          )}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm text-gray-700">
                        <div className="flex justify-between">
                          <span>Total</span>
                          <b>
                            {formatCurrencyUSD(
                              invoice.total
                            )}
                          </b>
                        </div>

                        <div className="flex justify-between">
                          <span>Payé</span>
                          <b>
                            {formatCurrencyUSD(
                              invoice.paid_total
                            )}
                          </b>
                        </div>

                        <div className="flex justify-between font-semibold">
                          <span>Restant</span>
                          <b className="text-red-600">
                            {formatCurrencyUSD(
                              remainingAmount
                            )}
                          </b>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        {invoice.pdf_url && (
                          <button
                            type="button"
                            onClick={() =>
                              openPdf(
                                invoice.pdf_url
                              )
                            }
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700"
                          >
                            <FaFilePdf /> PDF
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            toggleRow(invoice.id)
                          }
                          className="flex-1 rounded-lg bg-gray-100 py-2 text-sm text-gray-700 hover:bg-gray-200"
                        >
                          Détails
                        </button>
                      </div>

                      <AnimatePresence
                        initial={false}
                      >
                        {rowOpen && (
                          <motion.div
                            initial="collapse"
                            animate="expand"
                            exit="collapse"
                            variants={frVariants}
                            className="rounded-lg bg-gray-50 p-3 text-sm"
                          >
                            {items.length ? (
                              items.map(
                                (item, index) => (
                                  <div
                                    key={`${invoice.id}-mobile-${index}`}
                                    className="flex justify-between gap-4"
                                  >
                                    <span>
                                      {
                                        item.description
                                      }
                                    </span>

                                    <b>
                                      {formatCurrencyUSD(
                                        item.amount
                                      )}
                                    </b>
                                  </div>
                                )
                              )
                            ) : (
                              <span className="text-gray-500">
                                Aucun détail
                              </span>
                            )}
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
  }

  const selectedTotal = useMemo(
    () =>
      selectedInvoice.reduce((sum, id) => {
        const invoice = invoices.find(
          (item) => item.id === id
        );

        return (
          sum +
          (invoice ? sumRemaining(invoice) : 0)
        );
      }, 0),
    [invoices, selectedInvoice]
  );

  return (
    <div className="mx-auto max-w-5xl p-6">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 rounded-2xl bg-gradient-to-r from-blue-700 to-orange-500 px-6 py-6 text-center text-white shadow-lg"
      >
        <h2 className="flex items-center justify-center gap-2 text-3xl font-bold">
          <FaFileInvoiceDollar />
          Mes Factures du Club
        </h2>

        {familyMembers.length > 0 && (
          <p className="mt-2 text-sm text-white/90">
            Cotisation familiale :{" "}
            {familyMembers.length + 1} membres
          </p>
        )}
      </motion.div>

      <div className="mb-6 flex justify-center space-x-2">
        <button
          type="button"
          onClick={() => setActiveTab("factures")}
          className={`rounded-lg px-4 py-2 font-semibold ${
            activeTab === "factures"
              ? "bg-aquaBlue text-white hover:bg-blue-600"
              : "bg-gray-100 text-gray-600 hover:bg-orange-500"
          }`}
        >
          Factures
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("paiements")}
          className={`rounded-lg px-4 py-2 font-semibold ${
            activeTab === "paiements"
              ? "bg-aquaBlue text-white hover:bg-blue-600"
              : "bg-gray-100 text-gray-600 hover:bg-orange-500"
          }`}
        >
          Paiements
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("recus")}
          className={`rounded-lg px-4 py-2 font-semibold ${
            activeTab === "recus"
              ? "bg-aquaBlue text-white hover:bg-blue-600"
              : "bg-gray-100 text-gray-600 hover:bg-orange-500"
          }`}
        >
          Reçus
        </button>
      </div>

      <div className="mb-4 flex items-center justify-end gap-2">
        <FaCalendarAlt className="text-gray-500" />

        <select
          value={monthFilter}
          onChange={(event) =>
            setMonthFilter(event.target.value)
          }
          className="rounded-lg border px-3 py-1 text-sm"
        >
          <option value="">Tous les mois</option>

          {monthsAvailable.map((month) => (
            <option key={month} value={month}>
              {formatMonth(month)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-md">
        {loading ? (
          <p className="py-6 text-center text-gray-500">
            Chargement des factures...
          </p>
        ) : activeTab === "paiements" ? (
          <PaymentOptions
            profile={profile}
            invoices={invoices}
            selectedInvoice={selectedInvoice}
            setSelectedInvoice={setSelectedInvoice}
            selectedMethod={selectedMethod}
            setSelectedMethod={setSelectedMethod}
            setActiveTab={setActiveTab}
            setShowCardModal={setShowCardModal}
          />
        ) : activeTab === "factures" ? (
          factureMonths.length === 0 ? (
            <div className="py-10 text-center italic text-gray-500">
              Aucune facture
            </div>
          ) : (
            factureMonths.map(
              ({ month, items }) => (
                <MonthSection
                  key={`club-membership-invoice-${month}`}
                  monthKey={month}
                  rows={items}
                />
              )
            )
          )
        ) : recuMonths.length === 0 ? (
          <div className="py-10 text-center italic text-gray-500">
            Aucun reçu
          </div>
        ) : (
          recuMonths.map(({ month, items }) => (
            <MonthSection
              key={`club-membership-receipt-${month}`}
              monthKey={month}
              rows={items}
            />
          ))
        )}
      </div>

      {showCardModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />

          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setShowCardModal(false);
                setSelectedMethod(null);
              }}
              className="absolute right-3 top-3 text-xl text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>

            <h3 className="mb-4 text-center text-2xl font-bold text-gray-800">
              Paiement par carte 💳
            </h3>

            <p className="mb-4 text-center text-gray-500">
              Montant total :{" "}
              <span className="text-xl font-semibold text-blue-700">
                {formatCurrencyUSD(
                  selectedTotal
                )}
              </span>
            </p>

            <div className="my-4 border-t border-gray-200" />

            {selectedInvoice.length > 0 ? (
              <PaymentPage
                invoiceIds={selectedInvoice}
                user={profile}
                origin="club_membership"
                total={selectedTotal}
              />
            ) : (
              <p className="text-center text-sm text-gray-500">
                Veuillez sélectionner au moins une
                facture.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}