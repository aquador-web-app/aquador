import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";

function money(value) {
  return `USD ${Number(value || 0).toFixed(2)}`;
}

function normalizePaymentStatus(status) {
  const value =
    String(status || "").toLowerCase();

  if (
    value === "pending" ||
    value === "unpaid"
  ) {
    return "unpaid";
  }

  if (value === "partial") {
    return "partial";
  }

  if (value === "paid") {
  return "paid";
}

if (value === "free_pass") {
  return "free_pass";
}

return "unpaid";
}

function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Port-au-Prince",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function paymentBadge(status) {
  const normalized =
    String(status || "").toLowerCase();

    if (normalized === "free_pass") {
  return (
    <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
      🎟️ Free-pass
    </span>
  );
}
  
    if (normalized === "paid") {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
        Payé
      </span>
    );
  }

  if (normalized === "partial") {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-700">
        Partiel
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
      Non payé
    </span>
  );
}

function registrationBadge(status) {
  if (status === "cancelled") {
    return (
      <span className="inline-flex rounded-full bg-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700">
        Annulée
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
      Confirmée
    </span>
  );
}

export default function AdminCloture() {
  const [registrations, setRegistrations] =
    useState([]);

  const [participants, setParticipants] =
    useState([]);

  const [invoices, setInvoices] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [paymentFilter, setPaymentFilter] =
    useState("all");

  const [statusFilter, setStatusFilter] =
    useState("confirmed");

  const [expandedId, setExpandedId] =
    useState(null);

  const [savingId, setSavingId] =
    useState(null);

    const [paymentModal, setPaymentModal] =
  useState(null);

const [paymentAmount, setPaymentAmount] =
  useState("");

const [paymentMethod, setPaymentMethod] =
  useState("cash");

const [paymentReference, setPaymentReference] =
  useState("");

const [paymentNotes, setPaymentNotes] =
  useState("");

const [paymentSaving, setPaymentSaving] =
  useState(false);

    const [scannerOpen, setScannerOpen] =
  useState(false);

const [scanError, setScanError] =
  useState("");

const [scanResult, setScanResult] =
  useState(null);

const [scanLoading, setScanLoading] =
  useState(false);

const lastScanTime = useRef(0);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [
        registrationResult,
        participantResult,
        invoiceResult,
      ] = await Promise.all([
        supabase
          .from("event_visitor_registrations")
          .select(`
  id,
  event_code,
  event_name,
  event_date,
  full_name,
  email,
  phone,
  guest_count,
  status,
  payment_status,
  amount_due,
  amount_paid,
  stripe_payment_intent_id,
  member_profile_id,
  member_profile:member_profile_id (
    id,
    full_name
  ),
  created_at,
  updated_at
`)
          .eq(
            "event_code",
            "cloture-2026-08-29"
          )
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("event_visitor_participants")
          .select(`
  id,
  registration_id,
  full_name,
  phone,
  free_for_profile_id,
  created_at,
  free_for_profile:free_for_profile_id (
    id,
    full_name
  )
`)
          .order("created_at", {
            ascending: true,
          }),

        supabase
          .from("event_visitor_invoices")
          .select(`
            id,
            registration_id,
            invoice_no,
            event_code,
            full_name,
            email,
            phone,
            participant_count,
            total,
            paid_total,
            status,
            currency,
            stripe_payment_intent_id,
            issued_at,
            due_date,
            created_at,
            updated_at
          `)
          .eq(
            "event_code",
            "cloture-2026-08-29"
          )
          .order("created_at", {
            ascending: false,
          }),
      ]);

      if (registrationResult.error) {
        throw registrationResult.error;
      }

      if (participantResult.error) {
        throw participantResult.error;
      }

      if (invoiceResult.error) {
        throw invoiceResult.error;
      }

      setRegistrations(
        registrationResult.data || []
      );

      setParticipants(
        participantResult.data || []
      );

      setInvoices(
        invoiceResult.data || []
      );
    } catch (err) {
      console.error(
        "AdminCloture load error:",
        err
      );

      setError(
        err?.message ||
          "Impossible de charger les inscriptions."
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
      .channel("admin-cloture-realtime")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "event_visitor_registrations",
        },
        () => loadData()
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "event_visitor_participants",
        },
        () => loadData()
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "event_visitor_invoices",
        },
        () => loadData()
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // =========================================================
  // MERGE DATA
  // =========================================================

  const rows = useMemo(() => {
  const flattened = [];

  registrations.forEach(
    (registration) => {
      const registrationParticipants =
        participants.filter(
          (participant) =>
            participant.registration_id ===
            registration.id
        );

      const invoice =
        invoices.find(
          (invoiceRow) =>
            invoiceRow.registration_id ===
            registration.id
        ) || null;

      /*
       * If somehow an old registration has no participant row,
       * keep it visible for administration.
       */
      if (
        registrationParticipants.length ===
        0
      ) {
        flattened.push({
          ...registration,

          row_key:
            `registration-${registration.id}`,

          participant_id:
            null,

          participant_name:
            registration.full_name,

          participant_phone:
            registration.phone,

          participant:
            null,

          is_free_pass:
            false,

          extra_index:
            null,

          participant_total:
            Number(
              invoice?.total ??
                registration.amount_due ??
                0
            ),

          participant_paid:
            Number(
              invoice?.paid_total ??
                registration.amount_paid ??
                0
            ),

          participant_payment_status:
            normalizePaymentStatus(
              invoice?.status ||
                registration.payment_status
            ),

          participants:
            registrationParticipants,

          invoice,
        });

        return;
      }

      /*
       * Paid extras in creation order.
       * This lets us allocate invoice payments oldest-first.
       */
      const paidExtras =
        registrationParticipants
          .filter(
            (participant) =>
              !participant
                .free_for_profile_id
          )
          .sort(
            (a, b) =>
              new Date(
                a.created_at || 0
              ) -
              new Date(
                b.created_at || 0
              )
          );

      const invoicePaidTotal =
        Number(
          invoice?.paid_total ??
            registration.amount_paid ??
            0
        );

      registrationParticipants.forEach(
        (participant) => {
          const isFreePass =
            !!participant
              .free_for_profile_id;

          let participantTotal = 0;
          let participantPaid = 0;
          let participantPaymentStatus =
            "free_pass";
          let extraIndex = null;

          if (!isFreePass) {
            extraIndex =
              paidExtras.findIndex(
                (extra) =>
                  extra.id ===
                  participant.id
              );

            participantTotal = 10;

            participantPaid =
              Math.max(
                0,
                Math.min(
                  10,
                  invoicePaidTotal -
                    extraIndex * 10
                )
              );

            if (
              participantPaid >= 10
            ) {
              participantPaymentStatus =
                "paid";
            } else if (
              participantPaid > 0
            ) {
              participantPaymentStatus =
                "partial";
            } else {
              participantPaymentStatus =
                "unpaid";
            }
          }

          flattened.push({
            ...registration,

            row_key:
              `participant-${participant.id}`,

            participant_id:
              participant.id,

            participant_name:
              participant.full_name,

            participant_phone:
              participant.phone,

            participant,

            is_free_pass:
              isFreePass,

            extra_index:
              extraIndex,

            participant_total:
              participantTotal,

            participant_paid:
              participantPaid,

            participant_payment_status:
              participantPaymentStatus,

            participants:
              [participant],

            invoice,
          });
        }
      );
    }
  );

  return flattened;
}, [
  registrations,
  participants,
  invoices,
]);

  // =========================================================
  // STATS
  // =========================================================

  const activeRows = rows.filter(
    (row) =>
      row.status !== "cancelled"
  );

  const totalRegistrations =
  new Set(
    activeRows.map(
      (row) => row.id
    )
  ).size;

const totalParticipants =
  activeRows.length;

const totalExpected =
  activeRows.reduce(
    (sum, row) =>
      sum +
      Number(
        row.participant_total || 0
      ),
    0
  );

const totalCollected =
  activeRows.reduce(
    (sum, row) =>
      sum +
      Number(
        row.participant_paid || 0
      ),
    0
  );

  const paidCount =
  activeRows.filter(
    (row) =>
      row.participant_payment_status ===
      "paid"
  ).length;

  const freePassCount =
  activeRows.filter(
    (row) =>
      row.participant_payment_status ===
      "free_pass"
  ).length;

  const unpaidCount =
  activeRows.filter(
    (row) =>
      row.participant_payment_status ===
        "unpaid" ||
      row.participant_payment_status ===
        "partial"
  ).length;

  // =========================================================
  // FILTERS
  // =========================================================

  const filteredRows =
    useMemo(() => {
      const term =
        search.trim().toLowerCase();

      return rows.filter((row) => {
        const paymentStatus =
  row.participant_payment_status;

        if (
          paymentFilter !== "all" &&
          paymentStatus !==
            paymentFilter
        ) {
          return false;
        }

        if (
          statusFilter !== "all" &&
          row.status !== statusFilter
        ) {
          return false;
        }

        if (!term) return true;

        const participantMatch =
          row.participants.some(
            (participant) =>
              String(
                participant.full_name || ""
              )
                .toLowerCase()
                .includes(term) ||
              String(
                participant.phone || ""
              )
                .toLowerCase()
                .includes(term)
          );

        return (
          String(row.full_name || "")
            .toLowerCase()
            .includes(term) ||
          String(row.phone || "")
            .toLowerCase()
            .includes(term) ||
          String(row.email || "")
            .toLowerCase()
            .includes(term) ||
          String(
            row.invoice?.invoice_no || ""
          )
            .toLowerCase()
            .includes(term) ||
          participantMatch
        );
      });
    }, [
      rows,
      search,
      paymentFilter,
      statusFilter,
    ]);

  // =========================================================
  // CANCEL / RESTORE
  // =========================================================

  async function toggleRegistrationStatus(
    registration
  ) {
    const nextStatus =
      registration.status ===
      "cancelled"
        ? "confirmed"
        : "cancelled";

    const question =
      nextStatus === "cancelled"
        ? `Annuler l'inscription de ${registration.full_name} ?`
        : `Restaurer l'inscription de ${registration.full_name} ?`;

    if (!window.confirm(question)) {
      return;
    }

    setSavingId(registration.id);

    try {
      const { error } =
        await supabase
          .from(
            "event_visitor_registrations"
          )
          .update({
            status: nextStatus,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            registration.id
          );

      if (error) {
        throw error;
      }

      await loadData();
    } catch (err) {
      console.error(
        "Registration status error:",
        err
      );

      alert(
        err?.message ||
          "Impossible de modifier l'inscription."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function handleManualPayment() {
  if (!paymentModal?.invoice?.id) return;

  const amount = Number(paymentAmount);

  if (!amount || amount <= 0) {
    alert("Veuillez entrer un montant valide.");
    return;
  }

  const balance = Math.max(
    0,
    Number(paymentModal.invoice.total || 0) -
      Number(paymentModal.invoice.paid_total || 0)
  );

  if (amount > balance) {
    alert(
      `Le paiement ne peut pas dépasser le solde de ${money(balance)}.`
    );
    return;
  }

  setPaymentSaving(true);

  try {
    const { data, error } = await supabase.rpc(
      "record_event_visitor_payment",
      {
        p_invoice_id: paymentModal.invoice.id,
        p_amount: amount,
        p_method: paymentMethod,
        p_reference:
          paymentReference.trim() || null,
        p_notes:
          paymentNotes.trim() || null,
      }
    );

    if (error) throw error;

// If this payment completed the invoice,
// generate the QR and send confirmation email.
if (data?.became_fully_paid) {
  const { error: qrError } =
    await supabase.functions.invoke(
      "generate-qr-codes",
      {
        body: {
          registration_id:
            data.registration_id,
        },
      }
    );

  if (qrError) {
    console.error(
      "Manual payment QR generation error:",
      qrError
    );
  } else {
    const {
      error: emailError,
    } = await supabase.rpc(
      "queue_event_visitor_confirmation",
      {
        p_registration_id:
          data.registration_id,
      }
    );

    if (emailError) {
      console.error(
        "Manual payment confirmation email error:",
        emailError
      );
    }
  }
}

setPaymentModal(null);
    setPaymentAmount("");
    setPaymentMethod("cash");
    setPaymentReference("");
    setPaymentNotes("");

    await loadData();

    alert("Paiement enregistré avec succès.");
  } catch (err) {
    console.error(
      "Manual event payment error:",
      err
    );

    alert(
      err?.message ||
        "Impossible d'enregistrer le paiement."
    );
  } finally {
    setPaymentSaving(false);
  }
}

  async function handleClotureScan(text) {
  console.log("📸 CLOTURE SCAN RAW:", text);

  if (
    typeof text !== "string" ||
    !text.trim()
  ) {
    return;
  }

  const nowMs = Date.now();

  // Same protection as global attendance scanner
  if (
    nowMs - lastScanTime.current <
    3000
  ) {
    return;
  }

  lastScanTime.current = nowMs;

  setScanError("");
  setScanResult(null);
  setScanLoading(true);

  // Extract UUID from:
  // AQUADOR-CLOTURE:<uuid>
  const match = String(text).match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/
  );

  if (!match) {
    setScanError(
      "⚠️ QR code invalide."
    );

    setScanLoading(false);
    return;
  }

  const qrToken = match[0];

  try {
    const {
      data,
      error,
    } = await supabase.rpc(
      "scan_event_visitor_qr",
      {
        p_qr_token: qrToken,
      }
    );

    if (error) {
      throw error;
    }

    if (!data?.registration) {
      throw new Error(
        "Inscription introuvable."
      );
    }

    setScanResult(data);
  } catch (err) {
    console.error(
      "CLOTURE SCAN ERROR:",
      err
    );

    setScanError(
      err?.message ||
        "Impossible de retrouver cette inscription."
    );
  } finally {
    setScanLoading(false);
  }
}

  // =========================================================
  // UI
  // =========================================================

  if (loading) {
    return (
      <div className="py-10 text-center text-gray-500">
        Chargement des inscriptions…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-aquaBlue">
            🏅 Clôture — 29 août 2026
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Gestion des visiteurs,
            participants et paiements.
          </p>
        </div>

        <div className="flex gap-2">
  <button
    type="button"
    onClick={() => {
      setScanError("");
      setScanResult(null);
      lastScanTime.current = 0;
      setScannerOpen(true);
    }}
    className="rounded-lg bg-aquaBlue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
  >
    📷 Scanner un QR
  </button>

  <button
    type="button"
    onClick={loadData}
    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
  >
    🔄 Actualiser
  </button>
</div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">
            Inscriptions
          </p>

          <p className="mt-1 text-2xl font-bold text-blue-600">
            {totalRegistrations}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">
            Participants
          </p>

          <p className="mt-1 text-2xl font-bold text-purple-600">
            {totalParticipants}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">
            Payées
          </p>

          <p className="mt-1 text-2xl font-bold text-green-600">
            {paidCount}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
  <p className="text-xs text-gray-500">
    Free-pass
  </p>

  <p className="mt-1 text-2xl font-bold text-blue-600">
    {freePassCount}
  </p>
</div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">
            Non payées
          </p>

          <p className="mt-1 text-2xl font-bold text-red-600">
            {unpaidCount}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">
            Total attendu
          </p>

          <p className="mt-1 text-lg font-bold text-gray-800">
            {money(totalExpected)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">
            Encaissé
          </p>

          <p className="mt-1 text-lg font-bold text-green-700">
            {money(totalCollected)}
          </p>
        </div>
      </div>

      {/* FILTERS */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-3">
        <input
          type="text"
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          placeholder="Rechercher nom, téléphone, email, participant..."
          className="input w-full"
        />

        <select
          value={paymentFilter}
          onChange={(e) =>
            setPaymentFilter(
              e.target.value
            )
          }
          className="input w-full"
        >
          <option value="all">
            Tous les paiements
          </option>

          <option value="paid">
            Payés
          </option>

          <option value="free_pass">
  Free-pass
</option>

          <option value="partial">
            Partiels
          </option>

          <option value="unpaid">
            Non payés
          </option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value
            )
          }
          className="input w-full"
        >
          <option value="confirmed">
            Confirmées
          </option>

          <option value="cancelled">
            Annulées
          </option>

          <option value="all">
            Toutes
          </option>
        </select>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  Contact
                </th>

                <th className="px-4 py-3 text-center">
                  Participants
                </th>

                <th className="px-4 py-3 text-left">
                  Facture
                </th>

                <th className="px-4 py-3 text-right">
                  Total
                </th>

                <th className="px-4 py-3 text-right">
                  Payé
                </th>

                <th className="px-4 py-3 text-center">
                  Paiement
                </th>

                <th className="px-4 py-3 text-center">
                  Statut
                </th>

                <th className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredRows.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    Aucune inscription.
                  </td>
                </tr>
              ) : (
                filteredRows.map(
                  (row) => {
                    const isExpanded =
  expandedId ===
  row.row_key;

                    const paymentStatus =
  row.participant_payment_status;

                    return (
                      <Fragment key={row.row_key}>
                        <tr
                          className={
                            row.status ===
                            "cancelled"
                              ? "bg-gray-50 opacity-70"
                              : "hover:bg-blue-50/40"
                          }
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900">
  {row.participant_name}
</p>

<p className="text-xs text-gray-500">
  {row.participant_phone}
</p>

                            {row.email && (
                              <p className="text-xs text-gray-500">
                                {row.email}
                              </p>
                            )}

                           {row.member_profile?.full_name && (
  <p className="mt-1 text-xs font-semibold text-blue-700">
    Invité de :{" "}
    {row.member_profile.full_name}
  </p>
)}

{!row.is_free_pass &&
  row.member_profile_id && (
    <p className="mt-1 text-xs font-semibold text-purple-700">
      Personne supplémentaire
    </p>
)}

                            <p className="mt-1 text-[11px] text-gray-400">
                              {formatDateTime(
                                row.created_at
                              )}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-center font-semibold">
                            1
                          </td>

                          <td className="px-4 py-3">
                            {row.invoice
                              ?.invoice_no ||
                              "—"}
                          </td>

                          <td className="px-4 py-3 text-right font-semibold">
                            {money(
  row.participant_total
)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {money(
  row.participant_paid
)}
                          </td>

                          <td className="px-4 py-3 text-center">
                            {paymentBadge(
                              paymentStatus
                            )}
                          </td>

                          <td className="px-4 py-3 text-center">
                            {registrationBadge(
                              row.status
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
  setExpandedId(
    isExpanded
      ? null
      : row.row_key
  )
}
                                className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                              >
                                {isExpanded
                                  ? "Fermer"
                                  : "Détails"}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  savingId ===
                                  row.row_key
                                }
                                onClick={() =>
                                  toggleRegistrationStatus(
                                    row
                                  )
                                }
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                  row.status ===
                                  "cancelled"
                                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                                    : "bg-red-100 text-red-700 hover:bg-red-200"
                                }`}
                              >
                                {savingId ===
                                row.row_key
                                  ? "..."
                                  : row.status ===
                                    "cancelled"
                                  ? "Restaurer"
                                  : "Annuler"}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr
                            key={`${row.row_key}-details`}
                          >
                            <td
                              colSpan={8}
                              className="bg-gray-50 px-5 py-5"
                            >
                              <div className="grid gap-5 lg:grid-cols-2">
                                {/* PARTICIPANTS */}
                                <div>
                                  <h4 className="mb-3 font-bold text-gray-800">
                                    Participants
                                  </h4>

                                  <div className="space-y-2">
                                    {row
                                      .participants
                                      .length ===
                                    0 ? (
                                      <p className="text-sm text-gray-500">
                                        Aucun participant trouvé.
                                      </p>
                                    ) : (
                                      row.participants.map(
                                        (
                                          participant,
                                          index
                                        ) => (
                                          <div
                                            key={
                                              participant.id
                                            }
                                            className="rounded-lg border bg-white p-3"
                                          >
                                            <p className="font-semibold">
                                              {index +
                                                1}
                                              .{" "}
                                              {
                                                participant.full_name
                                              }
                                            </p>

                                            <p className="text-sm text-gray-500">
                                              {
                                                participant.phone
                                              }
                                            </p>
                                          </div>
                                        )
                                      )
                                    )}
                                  </div>
                                </div>

                                {/* PAYMENT */}
                                <div>
                                  <h4 className="mb-3 font-bold text-gray-800">
                                    Facturation
                                  </h4>

                                  <div className="space-y-2 rounded-lg border bg-white p-4 text-sm">
                                    <div className="flex justify-between">
                                      <span>
                                        Facture
                                      </span>

                                      <strong>
                                        {row
                                          .invoice
                                          ?.invoice_no ||
                                          "—"}
                                      </strong>
                                    </div>

                                    <div className="flex justify-between">
                                      <span>
                                        Total
                                      </span>

                                      <strong>
                                        <strong>
  {money(
    row.participant_total
  )}
</strong>
                                      </strong>
                                    </div>

                                    <div className="flex justify-between">
                                      <span>
                                        Payé
                                      </span>

                                      <strong>
                                        <strong>
  {money(
    row.participant_paid
  )}
</strong>
                                      </strong>
                                    </div>

                                    <div className="flex justify-between">
                                      <span>
                                        Solde
                                      </span>

                                      <strong>
                                        <strong>
  {money(
    Math.max(
      0,
      Number(
        row.participant_total ||
          0
      ) -
        Number(
          row.participant_paid ||
            0
        )
    )
  )}
</strong>
                                      </strong>
                                    </div>

                                    {row.invoice
                                      ?.stripe_payment_intent_id && (
                                      <div className="border-t pt-2">
                                        <span className="text-xs text-gray-500">
                                          Stripe PaymentIntent
                                        </span>

                                        <p className="mt-1 break-all font-mono text-xs">
                                          {
                                            row
                                              .invoice
                                              .stripe_payment_intent_id
                                          }
                                        </p>
                                      </div>
                                    )}
                                    {row.invoice &&
  paymentStatus !== "paid" &&
  paymentStatus !== "free_pass" &&
  Number(row.participant_total || 0) >
    Number(row.participant_paid || 0) &&
  row.status !== "cancelled" && (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => {
          const balance = Math.max(
  0,
  Number(
    row.participant_total || 0
  ) -
    Number(
      row.participant_paid || 0
    )
);

          setPaymentModal(row);
          setPaymentAmount(
            balance.toFixed(2)
          );
          setPaymentMethod("cash");
          setPaymentReference("");
          setPaymentNotes("");
        }}
        className="w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
      >
        💵 Enregistrer un paiement
      </button>
    </div>
)}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
      {paymentModal && (
  <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <button
        type="button"
        onClick={() => {
          if (paymentSaving) return;

          setPaymentModal(null);
          setPaymentAmount("");
          setPaymentMethod("cash");
          setPaymentReference("");
          setPaymentNotes("");
        }}
        className="absolute right-4 top-3 text-2xl font-bold text-gray-500 hover:text-gray-800"
      >
        ×
      </button>

      <h3 className="text-xl font-bold text-aquaBlue">
        Enregistrer un paiement
      </h3>

      <p className="mt-1 text-sm text-gray-500">
        {paymentModal.full_name}
      </p>

      <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
        <div className="flex justify-between">
          <span>Facture</span>
          <strong>
            {paymentModal.invoice?.invoice_no || "—"}
          </strong>
        </div>

        <div className="mt-1 flex justify-between">
          <span>Solde</span>
          <strong>
            {money(
              Math.max(
                0,
                Number(paymentModal.invoice?.total || 0) -
                  Number(paymentModal.invoice?.paid_total || 0)
              )
            )}
          </strong>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">
            Mode de paiement
          </label>

          <select
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);

              if (e.target.value === "cash") {
                setPaymentReference("");
              }
            }}
            className="input w-full"
          >
            <option value="cash">
              Espèces
            </option>

            <option value="transfer">
              Virement
            </option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">
            Montant
          </label>

          <input
            type="number"
            min="0.01"
            step="0.01"
            value={paymentAmount}
            onChange={(e) =>
              setPaymentAmount(e.target.value)
            }
            className="input w-full"
          />
        </div>

        {paymentMethod === "transfer" && (
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Référence du virement
            </label>

            <input
              type="text"
              value={paymentReference}
              onChange={(e) =>
                setPaymentReference(e.target.value)
              }
              placeholder="Ex. référence bancaire"
              className="input w-full"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">
            Notes
          </label>

          <textarea
            value={paymentNotes}
            onChange={(e) =>
              setPaymentNotes(e.target.value)
            }
            rows={3}
            placeholder="Notes facultatives"
            className="input w-full resize-none"
          />
        </div>

        <button
          type="button"
          disabled={paymentSaving}
          onClick={handleManualPayment}
          className="w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {paymentSaving
            ? "Enregistrement..."
            : "Enregistrer le paiement"}
        </button>
      </div>
    </div>
  </div>
)}
      {scannerOpen && (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div className="relative max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">

      <button
        type="button"
        onClick={() => {
          setScannerOpen(false);
          setScanError("");
          setScanResult(null);
          lastScanTime.current = 0;
        }}
        className="absolute right-4 top-3 text-2xl font-bold text-gray-500 hover:text-gray-800"
      >
        ×
      </button>

      <h4 className="mb-2 text-center text-xl font-semibold text-gray-800">
        Scan global — Cérémonie de clôture
      </h4>

      {!scanResult && (
        <>
          {scanError && (
            <div className="mb-4 rounded-lg bg-red-100 p-3 text-center font-medium text-red-800">
              {scanError}
            </div>
          )}

          <div className="mx-auto h-[280px] w-[280px] overflow-hidden rounded-lg border-2 border-aquaBlue shadow-inner">
            <Scanner
              onScan={(result) => {
                if (!result) return;

                const value =
                  Array.isArray(result)
                    ? result[0]?.rawValue ||
                      result[0]?.text
                    : result.rawValue ||
                      result.text;

                if (!value) return;

                handleClotureScan(value);
              }}
              onError={(err) =>
                console.error(
                  "CLOTURE SCANNER ERROR:",
                  err
                )
              }
              constraints={{
                facingMode:
                  "environment",
              }}
              scanDelay={300}
              style={{
                width: "100%",
                height: "100%",
              }}
            />
          </div>

          {scanLoading && (
            <p className="mt-4 text-center text-sm text-gray-500">
              Recherche de l'inscription…
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setScannerOpen(false);
              setScanError("");
              setScanResult(null);
              lastScanTime.current = 0;
            }}
            className="mx-auto mt-5 block rounded-lg bg-red-600 px-6 py-2 font-medium text-white hover:bg-red-700"
          >
            Fermer le scanner
          </button>
        </>
      )}

      {scanResult && (
        <ClotureScanResult
          data={scanResult}
          onScanAnother={() => {
            setScanResult(null);
            setScanError("");
            lastScanTime.current = 0;
          }}
        />
      )}
    </div>
  </div>
)}
    </div>
  );
}

function ClotureScanResult({
  data,
  onScanAnother,
}) {
  const registration =
    data?.registration || {};

  const invoice =
    data?.invoice || {};

  const participants =
    data?.participants || [];

  const total = Number(
    invoice.total ??
      registration.amount_due ??
      0
  );

  const paid = Number(
    invoice.paid_total ??
      registration.amount_paid ??
      0
  );

  const balance =
    Math.max(0, total - paid);

  const isPaid =
    total > 0 && paid >= total;

  const isFreePass =
  String(
    invoice.status ||
      registration.payment_status ||
      ""
  ).toLowerCase() === "free_pass";

  const isCancelled =
    registration.status ===
    "cancelled";

  return (
    <div className="mt-5 space-y-4">
      <div
        className={`rounded-xl border p-5 text-center ${
  isCancelled
    ? "border-red-300 bg-red-50"
    : isFreePass
    ? "border-blue-300 bg-blue-50"
    : isPaid
    ? "border-green-300 bg-green-50"
    : "border-yellow-300 bg-yellow-50"
}`}
      >
        <div className="text-4xl">
          {isCancelled
  ? "⛔"
  : isFreePass
  ? "🎟️"
  : isPaid
  ? "✅"
  : "⚠️"}
        </div>

        <h3 className="mt-2 text-xl font-bold text-gray-900">
          {registration.full_name}
        </h3>

        <p className="mt-1 font-semibold">
          {isCancelled
  ? "Inscription annulée"
  : isFreePass
  ? "Inscription confirmée — Free-pass"
  : isPaid
  ? "Inscription confirmée — Payée"
  : "Inscription confirmée — Paiement incomplet"}
        </p>
      </div>

      <div className="rounded-xl border bg-gray-50 p-4 text-sm">
        <p>
          <b>Téléphone :</b>{" "}
          {registration.phone || "—"}
        </p>

        <p>
          <b>E-mail :</b>{" "}
          {registration.email || "—"}
        </p>

        <p>
          <b>Facture :</b>{" "}
          {invoice.invoice_no || "—"}
        </p>

        <p>
          <b>Participants :</b>{" "}
          {participants.length}
        </p>

        <p>
          <b>Total :</b>{" "}
          {money(total)}
        </p>

        <p>
          <b>Payé :</b>{" "}
          {money(paid)}
        </p>

        <p>
          <b>Solde :</b>{" "}
          {money(balance)}
        </p>
      </div>

      <div>
        <h4 className="mb-2 font-bold text-gray-800">
          Personnes inscrites
        </h4>

        <div className="space-y-2">
          {participants.map(
            (participant, index) => (
              <div
                key={
                  participant.id ||
                  index
                }
                className="rounded-lg border bg-white p-3"
              >
                <p className="font-semibold">
                  {index + 1}.{" "}
                  {
                    participant.full_name
                  }
                </p>

                <p className="text-sm text-gray-500">
                  {participant.phone}
                </p>
                {participant.free_for_profile?.full_name && (
  <p className="mt-1 text-xs font-semibold text-blue-700">
    🎟️ Invité de :{" "}
    {participant.free_for_profile.full_name}
  </p>
)}
              </div>
            )
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onScanAnother}
        className="w-full rounded-lg bg-aquaBlue px-6 py-3 font-semibold text-white hover:bg-blue-700"
      >
        Scanner une autre inscription
      </button>
    </div>
  );
}