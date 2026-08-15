import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabaseClient";

const EVENT_CODE =
  "cloture-2026-08-29";

function money(value) {
  return `USD ${Number(
    value || 0
  ).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat(
      "fr-FR",
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone:
          "America/Port-au-Prince",
      }
    ).format(new Date(value));
  } catch {
    return value;
  }
}

function methodLabel(method) {
  const value =
    String(method || "")
      .toLowerCase();

  if (value === "card") {
    return "Carte";
  }

  if (value === "cash") {
    return "Espèces";
  }

  if (value === "transfer") {
    return "Virement";
  }

  return method || "—";
}

function methodBadge(method) {
  const value =
    String(method || "")
      .toLowerCase();

  if (value === "card") {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
        💳 Carte
      </span>
    );
  }

  if (value === "cash") {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
        💵 Espèces
      </span>
    );
  }

  if (value === "transfer") {
    return (
      <span className="inline-flex rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
        🏦 Virement
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
      {methodLabel(method)}
    </span>
  );
}

function paymentStatusBadge(
  status
) {
  const value =
    String(status || "")
      .toLowerCase();

  if (
    value === "paid" ||
    value === "approved"
  ) {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
        Payé
      </span>
    );
  }

  if (value === "partial") {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-700">
        Partiel
      </span>
    );
  }

  if (value === "failed") {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        Échoué
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">
      En attente
    </span>
  );
}

export default function AdminCloturePayment() {
  const [activeTab, setActiveTab] =
    useState("registrations");

  const [
    visitorPayments,
    setVisitorPayments,
  ] = useState([]);

  const [
    registrations,
    setRegistrations,
  ] = useState([]);

  const [invoices, setInvoices] =
    useState([]);

  const [
    tombolaPayments,
    setTombolaPayments,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [
    methodFilter,
    setMethodFilter,
  ] = useState("all");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("all");

  const [
  approvingPaymentId,
  setApprovingPaymentId,
] = useState(null);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [
        visitorPaymentResult,
        registrationResult,
        invoiceResult,
        tombolaResult,
      ] = await Promise.all([
        supabase
          .from(
            "event_visitor_payments"
          )
          .select("*")
          .order("paid_at", {
            ascending: false,
          }),

        supabase
          .from(
            "event_visitor_registrations"
          )
          .select("*")
          .eq(
            "event_code",
            EVENT_CODE
          ),

        supabase
          .from(
            "event_visitor_invoices"
          )
          .select("*")
          .eq(
            "event_code",
            EVENT_CODE
          ),

        supabase
          .from(
            "cloture_tombola_payments"
          )
          .select("*")
          .eq(
            "event_code",
            EVENT_CODE
          )
          .order("created_at", {
            ascending: false,
          }),
      ]);

      if (
        visitorPaymentResult.error
      ) {
        throw visitorPaymentResult.error;
      }

      if (
        registrationResult.error
      ) {
        throw registrationResult.error;
      }

      if (invoiceResult.error) {
        throw invoiceResult.error;
      }

      if (tombolaResult.error) {
        throw tombolaResult.error;
      }

      setVisitorPayments(
        visitorPaymentResult.data ||
          []
      );

      setRegistrations(
        registrationResult.data ||
          []
      );

      setInvoices(
        invoiceResult.data || []
      );

      setTombolaPayments(
        tombolaResult.data || []
      );
    } catch (err) {
      console.error(
        "AdminCloturePayment load error:",
        err
      );

      setError(
        err?.message ||
          "Impossible de charger les paiements."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // =========================================================
  // REALTIME
  // =========================================================

  useEffect(() => {
    const channel = supabase
      .channel(
        "admin-cloture-payment-realtime"
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "event_visitor_payments",
        },
        loadData
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "event_visitor_invoices",
        },
        loadData
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "event_visitor_registrations",
        },
        loadData
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "cloture_tombola_payments",
        },
        loadData
      )

      .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, []);

  // =========================================================
  // REGISTRATION PAYMENT ROWS
  // =========================================================

  const registrationPaymentRows =
    useMemo(() => {
      return visitorPayments
        .map((payment) => {
          const registration =
            registrations.find(
              (row) =>
                row.id ===
                payment.registration_id
            ) || null;

          const invoice =
            invoices.find(
              (row) =>
                row.id ===
                  payment.invoice_id ||
                row.registration_id ===
                  payment.registration_id
            ) || null;

          // Card payments are confirmed
          // directly by Stripe webhook.
          //
          // Manual cash/transfer payments
          // may have an approved boolean.
          let displayStatus =
            "pending";

          if (
            payment.method ===
            "card"
          ) {
            displayStatus =
              "paid";
          } else if (
            payment.approved ===
            true
          ) {
            displayStatus =
              "paid";
          } else if (
            payment.approved ===
            false
          ) {
            displayStatus =
              "pending";
          } else if (
            invoice?.status ===
            "paid"
          ) {
            displayStatus =
              "paid";
          }

          return {
            ...payment,

            source:
              "registration",

            registration,

            invoice,

            full_name:
              registration
                ?.full_name ||
              invoice?.full_name ||
              "—",

            phone:
              registration?.phone ||
              invoice?.phone ||
              "—",

            email:
              registration?.email ||
              invoice?.email ||
              null,

            invoice_no:
              invoice?.invoice_no ||
              "—",

            display_status:
              displayStatus,

            display_date:
              payment.paid_at ||
              payment.created_at,
          };
        })
        .filter(
          (row) =>
            row.registration
              ?.event_code ===
              EVENT_CODE ||
            row.invoice
              ?.event_code ===
              EVENT_CODE
        );
    }, [
      visitorPayments,
      registrations,
      invoices,
    ]);

  // =========================================================
  // STATS
  // =========================================================

  // Registration collection is based on invoices,
  // because paid_total is the source of truth for
  // how much has actually been credited.
  const registrationCollected =
    invoices.reduce(
      (sum, invoice) =>
        sum +
        Number(
          invoice.paid_total || 0
        ),
      0
    );

  const tombolaCollected =
    tombolaPayments
      .filter(
        (payment) =>
          payment.status ===
          "paid"
      )
      .reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount_usd ||
              0
          ),
        0
      );

  const totalCollected =
    registrationCollected +
    tombolaCollected;

  const cardCollected =
    registrationPaymentRows
      .filter(
        (payment) =>
          payment.method ===
            "card" &&
          payment.display_status ===
            "paid"
      )
      .reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount || 0
          ),
        0
      ) +
    tombolaCollected;

  const cashCollected =
    registrationPaymentRows
      .filter(
        (payment) =>
          payment.method ===
            "cash" &&
          payment.display_status ===
            "paid"
      )
      .reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount || 0
          ),
        0
      );

  const transferCollected =
    registrationPaymentRows
      .filter(
        (payment) =>
          payment.method ===
            "transfer" &&
          payment.display_status ===
            "paid"
      )
      .reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount || 0
          ),
        0
      );

  const pendingCount =
    registrationPaymentRows.filter(
      (payment) =>
        payment.display_status ===
        "pending"
    ).length +
    tombolaPayments.filter(
      (payment) =>
        payment.status ===
        "pending"
    ).length;

  // =========================================================
  // FILTER REGISTRATION PAYMENTS
  // =========================================================

  const filteredRegistrationPayments =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return registrationPaymentRows.filter(
        (row) => {
          if (
            methodFilter !==
              "all" &&
            row.method !==
              methodFilter
          ) {
            return false;
          }

          if (
            statusFilter !==
              "all" &&
            row.display_status !==
              statusFilter
          ) {
            return false;
          }

          if (!term) {
            return true;
          }

          return [
            row.full_name,
            row.phone,
            row.email,
            row.invoice_no,
            row.reference,
            row.stripe_payment_intent_id,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(term)
          );
        }
      );
    }, [
      registrationPaymentRows,
      search,
      methodFilter,
      statusFilter,
    ]);

  // =========================================================
  // FILTER TOMBOLA
  // =========================================================

  const filteredTombolaPayments =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return tombolaPayments.filter(
        (row) => {
          if (
            methodFilter !==
              "all" &&
            methodFilter !==
              "card"
          ) {
            return false;
          }

          if (
            statusFilter !==
              "all" &&
            row.status !==
              statusFilter
          ) {
            return false;
          }

          if (!term) {
            return true;
          }

          return [
            row.full_name,
            row.phone,
            row.email,
            row
              .stripe_payment_intent_id,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(term)
          );
        }
      );
    }, [
      tombolaPayments,
      search,
      methodFilter,
      statusFilter,
    ]);

    async function approvePayment(
  payment
) {
  if (
    !payment?.id ||
    payment.approved === true
  ) {
    return;
  }

  const methodName =
    payment.method === "cash"
      ? "paiement en espèces"
      : "virement";

  const confirmed =
    window.confirm(
      `Confirmer le ${methodName} de ${money(
        payment.amount
      )} pour ${payment.full_name} ?\n\nCette opération créditera immédiatement la facture.`
    );

  if (!confirmed) {
    return;
  }

  try {
    setApprovingPaymentId(
      payment.id
    );

    const {
      data,
      error,
    } = await supabase.rpc(
      "approve_event_visitor_payment",
      {
        p_payment_id:
          payment.id,
      }
    );

    if (error) {
      throw error;
    }

    await loadData();

    alert(
      data?.status === "paid"
        ? "✅ Paiement approuvé. La facture est maintenant entièrement payée."
        : `✅ Paiement approuvé. Nouveau solde : ${money(
            data?.balance
          )}.`
    );
  } catch (err) {
    console.error(
      "Approve event visitor payment error:",
      err
    );

    alert(
      err?.message ||
        "Impossible d'approuver ce paiement."
    );
  } finally {
    setApprovingPaymentId(
      null
    );
  }
}

  if (loading) {
    return (
      <div className="py-10 text-center text-gray-500">
        Chargement des paiements…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-aquaBlue">
            💳 Paiements — Clôture
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Paiements des invités et
            paiements Tombola — 29 août
            2026.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          🔄 Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">

        <StatCard
          label="Total encaissé"
          value={money(
            totalCollected
          )}
          valueClass="text-green-700"
        />

        <StatCard
          label="Invités"
          value={money(
            registrationCollected
          )}
          valueClass="text-blue-700"
        />

        <StatCard
          label="Tombola"
          value={money(
            tombolaCollected
          )}
          valueClass="text-purple-700"
        />

        <StatCard
          label="Carte"
          value={money(
            cardCollected
          )}
          valueClass="text-blue-700"
        />

        <StatCard
          label="Espèces / Virement"
          value={money(
            cashCollected +
              transferCollected
          )}
          valueClass="text-gray-800"
        />

        <StatCard
          label="En attente"
          value={pendingCount}
          valueClass="text-orange-600"
        />
      </div>

      {/* SOURCE TABS */}
      <div className="flex overflow-hidden rounded-xl border bg-white shadow-sm">
        <button
          type="button"
          onClick={() =>
            setActiveTab(
              "registrations"
            )
          }
          className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
            activeTab ===
            "registrations"
              ? "bg-blue-600 text-white"
              : "text-gray-600 hover:bg-blue-50"
          }`}
        >
          👥 Inscriptions & invités
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab(
              "tombola"
            )
          }
          className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
            activeTab ===
            "tombola"
              ? "bg-purple-600 text-white"
              : "text-gray-600 hover:bg-purple-50"
          }`}
        >
          🎟️ Tombola
        </button>
      </div>

      {/* FILTERS */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-3">

        <input
          type="text"
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Nom, téléphone, e-mail, facture ou Stripe PI..."
          className="input w-full"
        />

        <select
          value={methodFilter}
          onChange={(event) =>
            setMethodFilter(
              event.target.value
            )
          }
          className="input w-full"
        >
          <option value="all">
            Tous les modes
          </option>

          <option value="card">
            Carte
          </option>

          {activeTab ===
            "registrations" && (
            <>
              <option value="cash">
                Espèces
              </option>

              <option value="transfer">
                Virement
              </option>
            </>
          )}
        </select>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value
            )
          }
          className="input w-full"
        >
          <option value="all">
            Tous les statuts
          </option>

          <option value="paid">
            Payés
          </option>

          {activeTab ===
            "registrations" && (
            <option value="partial">
              Partiels
            </option>
          )}

          <option value="pending">
            En attente
          </option>

          {activeTab ===
            "tombola" && (
            <option value="failed">
              Échoués
            </option>
          )}
        </select>
      </div>

      {activeTab ===
      "registrations" ? (
        <RegistrationPaymentsTable
  rows={
    filteredRegistrationPayments
  }
  onApprove={
    approvePayment
  }
  approvingPaymentId={
    approvingPaymentId
  }
/>
      ) : (
        <TombolaPaymentsTable
          rows={
            filteredTombolaPayments
          }
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass =
    "text-gray-900",
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">
        {label}
      </p>

      <p
        className={`mt-1 text-xl font-bold ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function RegistrationPaymentsTable({
  rows,
  onApprove,
  approvingPaymentId,
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">

          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                Contact
              </th>

              <th className="px-4 py-3 text-left">
                Facture
              </th>

              <th className="px-4 py-3 text-right">
                Montant
              </th>

              <th className="px-4 py-3 text-center">
                Mode
              </th>

              <th className="px-4 py-3 text-center">
                Statut
              </th>

              <th className="px-4 py-3 text-left">
                Référence
              </th>

              <th className="px-4 py-3 text-left">
                Date
              </th>

              <th className="px-4 py-3 text-center">
  Actions
</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-gray-500"
                >
                  Aucun paiement trouvé.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-blue-50/40"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">
                      {row.full_name}
                    </p>

                    <p className="text-xs text-gray-500">
                      {row.phone}
                    </p>

                    {row.email && (
                      <p className="text-xs text-gray-400">
                        {row.email}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3 font-medium">
                    {
                      row.invoice_no
                    }
                  </td>

                  <td className="px-4 py-3 text-right font-bold">
                    {money(
                      row.amount
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    {methodBadge(
                      row.method
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    {paymentStatusBadge(
                      row.display_status
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <p className="max-w-[220px] break-all text-xs text-gray-600">
                      {row.reference ||
                        row
                          .stripe_payment_intent_id ||
                        "—"}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {formatDateTime(
                      row.display_date
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
  <div className="flex items-center justify-center gap-2">

    {row.method ===
      "transfer" &&
      row.proof_url && (
        <a
          href={row.proof_url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-purple-300 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50"
        >
          📎 Preuve
        </a>
      )}

    {row.approved !== true &&
      (
        row.method === "cash" ||
        row.method ===
          "transfer"
      ) && (
        <button
          type="button"
          disabled={
            approvingPaymentId ===
            row.id
          }
          onClick={() =>
            onApprove(row)
          }
          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approvingPaymentId ===
          row.id
            ? "Validation..."
            : "✓ Approuver"}
        </button>
      )}

    {row.approved === true && (
      <span className="text-xs font-semibold text-green-700">
        ✓ Validé
      </span>
    )}
  </div>
</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TombolaPaymentsTable({
  rows,
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">

          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                Acheteur
              </th>

              <th className="px-4 py-3 text-center">
                Billets
              </th>

              <th className="px-4 py-3 text-right">
                Montant
              </th>

              <th className="px-4 py-3 text-center">
                Mode
              </th>

              <th className="px-4 py-3 text-center">
                Statut
              </th>

              <th className="px-4 py-3 text-left">
                Stripe
              </th>

              <th className="px-4 py-3 text-left">
                Date
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-gray-500"
                >
                  Aucun paiement Tombola.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-purple-50/40"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">
                      {
                        row.full_name
                      }
                    </p>

                    <p className="text-xs text-gray-500">
                      {row.phone}
                    </p>

                    <p className="text-xs text-gray-400">
                      {row.email}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                      {
                        row.ticket_count
                      }{" "}
                      billet
                      {Number(
                        row.ticket_count
                      ) > 1
                        ? "s"
                        : ""}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right font-bold">
                    {money(
                      row.amount_usd
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    {methodBadge(
                      "card"
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    {paymentStatusBadge(
                      row.status
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <p className="max-w-[230px] break-all font-mono text-xs text-gray-500">
                      {row
                        .stripe_payment_intent_id ||
                        "—"}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {formatDateTime(
                      row.paid_at ||
                        row.created_at
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}