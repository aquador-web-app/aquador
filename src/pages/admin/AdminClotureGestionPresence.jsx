import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabaseClient";


const EVENT_CODE = "cloture-2026-08-29";

// =========================================================
// MANUAL EVENT OVERRIDES
// =========================================================

const FORCED_VISITOR_PROFILE_IDS = new Set([
  "beedd869-f57a-4234-9a62-6fad8437f95f", // Tamara Alexandre
]);

const EXTRA_GUEST_PRICE = 10;


// =========================================================
// HELPERS
// =========================================================

function money(value) {
  return `USD ${Number(value || 0).toFixed(2)}`;
}


function paymentBadge(status) {
  if (status === "free_pass") {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
        🎟️ Free-pass
      </span>
    );
  }

  if (status === "paid") {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
        ✅ Payé
      </span>
    );
  }

  if (status === "partial") {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">
        ⚠️ Partiel
      </span>
    );
  }

  if (status === "student") {
    return (
      <span className="inline-flex rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
        🏊 Élève
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
      💵 À payer
    </span>
  );
}


export default function GestionPresenceCloture() {
  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [students, setStudents] =
    useState([]);

  const [registrations, setRegistrations] =
    useState([]);

  const [visitors, setVisitors] =
    useState([]);

  const [
  cancelledStudents,
  setCancelledStudents,
] = useState([]);

  const [invoices, setInvoices] =
    useState([]);

  const [checkins, setCheckins] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [typeFilter, setTypeFilter] =
    useState("all");

  const [paymentFilter, setPaymentFilter] =
    useState("all");

  const [presenceFilter, setPresenceFilter] =
    useState("all");

  const [savingKey, setSavingKey] =
    useState(null);


  // =========================================================
  // LOAD EVERYTHING
  // =========================================================

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [
        studentResult,
        registrationResult,
        visitorResult,
        invoiceResult,
        checkinResult,
      ] = await Promise.all([

        // -----------------------------------------------------
        // SCHOOL STUDENTS WHO CONFIRMED
        // -----------------------------------------------------
        supabase
          .from("event_presence_confirmations")
          .select(`
            id,
            event_code,
            status,
            confirmed_at,
            participant_profile_id,

            participant:participant_profile_id (
              id,
              full_name,
              first_name,
              middle_name,
              last_name,
              phone,
              email,
              parent_id,
              is_active
            ),

            confirmer:confirmed_by_profile_id (
              id,
              full_name,
              phone,
              email
            )
          `)
          .eq("event_code", EVENT_CODE)
          .order("confirmed_at", {
            ascending: true,
          }),


        // -----------------------------------------------------
        // VISITOR REGISTRATIONS
        // -----------------------------------------------------
        supabase
          .from("event_visitor_registrations")
          .select(`
            id,
            event_code,
            full_name,
            email,
            phone,
            status,
            payment_status,
            amount_due,
            amount_paid,
            member_profile_id,

            member_profile:member_profile_id (
              id,
              full_name
            ),

            created_at
          `)
          .eq("event_code", EVENT_CODE)
          .neq("status", "cancelled")
          .order("created_at", {
            ascending: true,
          }),


        // -----------------------------------------------------
        // INDIVIDUAL VISITORS
        // -----------------------------------------------------
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


        // -----------------------------------------------------
        // VISITOR INVOICES
        // -----------------------------------------------------
        supabase
          .from("event_visitor_invoices")
          .select(`
            id,
            registration_id,
            invoice_no,
            event_code,
            total,
            paid_total,
            status,
            created_at
          `)
          .eq("event_code", EVENT_CODE),


        // -----------------------------------------------------
        // DOOR CHECK-INS
        // -----------------------------------------------------
        supabase
          .from("cloture_presence_checkins")
          .select(`
            id,
            event_code,
            source_type,
            source_id,
            full_name,
            came,
            checked_in_at,
            checked_in_by
          `)
          .eq("event_code", EVENT_CODE),
      ]);


      if (studentResult.error) {
        throw studentResult.error;
      }

      if (registrationResult.error) {
        throw registrationResult.error;
      }

      if (visitorResult.error) {
        throw visitorResult.error;
      }

      if (invoiceResult.error) {
        throw invoiceResult.error;
      }

      if (checkinResult.error) {
        throw checkinResult.error;
      }


      const allStudentConfirmations =
  studentResult.data || [];

setStudents(
  allStudentConfirmations.filter(
    (row) => row.status === "confirmed"
  )
);

setCancelledStudents(
  allStudentConfirmations.filter(
    (row) => row.status === "cancelled"
  )
);

      setRegistrations(
        registrationResult.data || []
      );

      setVisitors(
        visitorResult.data || []
      );

      setInvoices(
        invoiceResult.data || []
      );

      setCheckins(
        checkinResult.data || []
      );

    } catch (err) {
      console.error(
        "Gestion présence clôture error:",
        err
      );

      setError(
        err?.message ||
          "Impossible de charger la liste."
      );

    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadData();
  }, []);


  // =========================================================
  // REALTIME CHECKINS
  // =========================================================

  useEffect(() => {
    const channel = supabase
      .channel(
        "gestion-presence-cloture"
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "cloture_presence_checkins",
          filter:
            `event_code=eq.${EVENT_CODE}`,
        },
        () => {
          loadData();
        }
      )
      .subscribe();


    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  // =========================================================
  // CHECK-IN LOOKUP
  // =========================================================

  function getCheckin(
    sourceType,
    sourceId
  ) {
    return checkins.find(
      (row) =>
        row.source_type === sourceType &&
        row.source_id === sourceId
    );
  }


  // =========================================================
  // MERGE SCHOOL + VISITORS
  // =========================================================

  const rows = useMemo(() => {
    const output = [];


    // =======================================================
    // SCHOOL STUDENTS
    // =======================================================

    students.forEach((confirmation) => {
  const profile =
    confirmation.participant;

  if (!profile?.id) return;

  const isForcedVisitor =
    FORCED_VISITOR_PROFILE_IDS.has(
      profile.id
    );

  const checkin = getCheckin(
    "student",
    profile.id
  );

  output.push({
        row_key:
          `student-${profile.id}`,

        source_type: "student",
        source_id: profile.id,

        person_type: isForcedVisitor
  ? "visitor"
  : "student",

        full_name:
          profile.full_name || "—",

        phone:
          profile.phone ||
          confirmation.confirmer?.phone ||
          "—",

        email:
          profile.email ||
          confirmation.confirmer?.email ||
          "—",

        related_to:
          confirmation.confirmer?.full_name ||
          null,

        payment_status: isForcedVisitor
  ? "free_pass"
  : "student",

amount_due: 0,
amount_paid: 0,

        registration_id: null,
        invoice_no: null,

        came:
          !!checkin?.came,

        checked_in_at:
          checkin?.checked_in_at ||
          null,
      });
    });


    // =======================================================
    // VISITORS
    // =======================================================

    const cancelledStudentIdentities =
  cancelledStudents.map((row) => ({
    id:
      row.participant?.id || null,

    name:
      String(
        row.participant?.full_name || ""
      )
        .trim()
        .toLowerCase(),

    phone:
      String(
        row.participant?.phone || ""
      )
        .replace(/\D/g, ""),

    email:
      String(
        row.participant?.email || ""
      )
        .trim()
        .toLowerCase(),
  }));
    
    registrations.forEach(
      (registration) => {

        const registrationVisitors =
          visitors
            .filter(
              (visitor) =>
                visitor.registration_id ===
                registration.id
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


        const invoice =
          invoices.find(
            (row) =>
              row.registration_id ===
              registration.id
          ) || null;


        const paidExtras =
          registrationVisitors.filter(
            (visitor) =>
              !visitor.free_for_profile_id
          );


        const invoicePaid =
          Number(
            invoice?.paid_total ??
              registration.amount_paid ??
              0
          );


        registrationVisitors.forEach(
          (visitor) => {

            const visitorName =
  String(visitor.full_name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const visitorPhone =
  String(visitor.phone || "")
    .replace(/\D/g, "");


const isCancelledStudent =
  cancelledStudentIdentities.some(
    (student) => {

      const sameName =
        visitorName &&
        student.name &&
        visitorName ===
          student.name
            .replace(/\s+/g, " ");

      const samePhone =
        visitorPhone &&
        student.phone &&
        visitorPhone === student.phone;

      // If both sides have a phone,
      // require name + phone.
      if (
        visitorPhone &&
        student.phone
      ) {
        return sameName && samePhone;
      }

      // If no usable phone exists,
      // fall back to exact normalized name.
      return sameName;
    }
  );


if (isCancelledStudent) {
  return;
}


if (isCancelledStudent) {
  return;
}
            
            const isFreePass =
              !!visitor.free_for_profile_id;


            let amountDue = 0;
            let amountPaid = 0;
            let paymentStatus =
              "free_pass";


            if (!isFreePass) {

              const extraIndex =
                paidExtras.findIndex(
                  (extra) =>
                    extra.id ===
                    visitor.id
                );


              amountDue =
                EXTRA_GUEST_PRICE;


              amountPaid =
                Math.max(
                  0,
                  Math.min(
                    EXTRA_GUEST_PRICE,
                    invoicePaid -
                      extraIndex *
                        EXTRA_GUEST_PRICE
                  )
                );


              if (
                amountPaid >=
                EXTRA_GUEST_PRICE
              ) {
                paymentStatus =
                  "paid";

              } else if (
                amountPaid > 0
              ) {
                paymentStatus =
                  "partial";

              } else {
                paymentStatus =
                  "unpaid";
              }
            }


            const checkin =
              getCheckin(
                "visitor",
                visitor.id
              );


            output.push({
              row_key:
                `visitor-${visitor.id}`,

              source_type:
                "visitor",

              source_id:
                visitor.id,

              person_type:
                "visitor",

              full_name:
                visitor.full_name ||
                "—",

              phone:
                visitor.phone ||
                registration.phone ||
                "—",

              email:
                registration.email ||
                "—",

              related_to:
                visitor
                  .free_for_profile
                  ?.full_name ||
                registration
                  .member_profile
                  ?.full_name ||
                registration.full_name ||
                null,

              payment_status:
                paymentStatus,

              amount_due:
                amountDue,

              amount_paid:
                amountPaid,

              registration_id:
                registration.id,

              invoice_no:
                invoice?.invoice_no ||
                null,

              came:
                !!checkin?.came,

              checked_in_at:
                checkin?.checked_in_at ||
                null,
            });
          }
        );
      }
    );


    return output.sort(
      (a, b) =>
        String(a.full_name)
          .localeCompare(
            String(b.full_name),
            "fr",
            {
              sensitivity: "base",
            }
          )
    );

  }, [
    students,
    cancelledStudents,
    registrations,
    visitors,
    invoices,
    checkins,
  ]);


  // =========================================================
  // CHECK / UNCHECK PRESENCE
  // =========================================================

  async function togglePresence(row) {
    const key = row.row_key;

    setSavingKey(key);

    try {
      const nextCame =
        !row.came;

      const {
        data: { user },
      } =
        await supabase.auth.getUser();


      const payload = {
        event_code:
          EVENT_CODE,

        source_type:
          row.source_type,

        source_id:
          row.source_id,

        full_name:
          row.full_name,

        came:
          nextCame,

        checked_in_at:
          nextCame
            ? new Date().toISOString()
            : null,

        checked_in_by:
          nextCame
            ? user?.id || null
            : null,

        updated_at:
          new Date().toISOString(),
      };


      const {
        error: upsertError,
      } = await supabase
        .from(
          "cloture_presence_checkins"
        )
        .upsert(
          payload,
          {
            onConflict:
              "event_code,source_type,source_id",
          }
        );


      if (upsertError) {
        throw upsertError;
      }


      // optimistic local update
      setCheckins(
        (current) => {

          const existing =
            current.find(
              (item) =>
                item.source_type ===
                  row.source_type &&
                item.source_id ===
                  row.source_id
            );


          if (existing) {
            return current.map(
              (item) =>
                item.source_type ===
                    row.source_type &&
                item.source_id ===
                    row.source_id
                  ? {
                      ...item,
                      ...payload,
                    }
                  : item
            );
          }


          return [
            ...current,
            {
              id:
                `local-${key}`,
              ...payload,
            },
          ];
        }
      );

    } catch (err) {
      console.error(
        "Presence toggle error:",
        err
      );

      alert(
        err?.message ||
          "Impossible de modifier la présence."
      );

    } finally {
      setSavingKey(null);
    }
  }


  // =========================================================
  // FILTERS
  // =========================================================

  const filteredRows =
    useMemo(() => {

      const term =
        search
          .trim()
          .toLowerCase();


      return rows.filter(
        (row) => {

          if (
            typeFilter !== "all" &&
            row.person_type !==
              typeFilter
          ) {
            return false;
          }


          if (
            paymentFilter !== "all" &&
            row.payment_status !==
              paymentFilter
          ) {
            return false;
          }


          if (
            presenceFilter ===
              "present" &&
            !row.came
          ) {
            return false;
          }


          if (
            presenceFilter ===
              "absent" &&
            row.came
          ) {
            return false;
          }


          if (!term) {
            return true;
          }


          const searchable = [
            row.full_name,
            row.phone,
            row.email,
            row.related_to,
            row.invoice_no,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();


          return searchable.includes(
            term
          );
        }
      );

    }, [
      rows,
      search,
      typeFilter,
      paymentFilter,
      presenceFilter,
    ]);


  // =========================================================
  // STATS
  // =========================================================

  const totalExpected =
    rows.length;

  const totalCame =
    rows.filter(
      (row) => row.came
    ).length;

  const totalRemaining =
    totalExpected -
    totalCame;

  const studentCount =
    rows.filter(
      (row) =>
        row.person_type ===
        "student"
    ).length;

  const freePassCount =
    rows.filter(
      (row) =>
        row.payment_status ===
        "free_pass"
    ).length;

  const paidCount =
    rows.filter(
      (row) =>
        row.payment_status ===
        "paid"
    ).length;

  const mustPayCount =
    rows.filter(
      (row) =>
        row.payment_status ===
          "unpaid" ||
        row.payment_status ===
          "partial"
    ).length;


  const remainingMoney =
    rows.reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          Number(
            row.amount_due || 0
          ) -
            Number(
              row.amount_paid || 0
            )
        ),
      0
    );


  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* HEADER */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <h1 className="text-2xl font-bold text-aquaBlue">
            🚪 Gestion Présence — Clôture
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            29 août 2026 — Contrôle des entrées
          </p>
        </div>


        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">

        <StatCard
          label="Attendus"
          value={totalExpected}
        />

        <StatCard
          label="Arrivés"
          value={totalCame}
          className="text-green-700"
        />

        <StatCard
          label="Restants"
          value={totalRemaining}
          className="text-orange-600"
        />

        <StatCard
          label="Élèves"
          value={studentCount}
          className="text-purple-700"
        />

        <StatCard
          label="Free-pass"
          value={freePassCount}
          className="text-blue-700"
        />

        <StatCard
          label="À payer"
          value={mustPayCount}
          className="text-red-700"
        />

        <StatCard
          label="Solde à encaisser"
          value={money(
            remainingMoney
          )}
          className="text-red-700"
        />
      </div>


      {/* FILTERS */}

      <div className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-4">

        <input
          type="search"
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
          placeholder="Rechercher nom, téléphone..."
          className="input w-full"
        />


        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(
              e.target.value
            )
          }
          className="input w-full"
        >
          <option value="all">
            Tout le monde
          </option>

          <option value="student">
            Élèves
          </option>

          <option value="visitor">
            Invités / visiteurs
          </option>
        </select>


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
            Tous paiements
          </option>

          <option value="student">
            Élèves
          </option>

          <option value="free_pass">
            Free-pass
          </option>

          <option value="paid">
            Payés
          </option>

          <option value="partial">
            Partiels
          </option>

          <option value="unpaid">
            À payer
          </option>
        </select>


        <select
          value={presenceFilter}
          onChange={(e) =>
            setPresenceFilter(
              e.target.value
            )
          }
          className="input w-full"
        >
          <option value="all">
            Toutes présences
          </option>

          <option value="present">
            Déjà arrivés
          </option>

          <option value="absent">
            Pas encore arrivés
          </option>
        </select>
      </div>


    {/* DESKTOP TABLE */}

<div className="hidden md:block overflow-hidden rounded-xl border bg-white shadow-sm">

  <div className="overflow-x-auto">

    <table className="min-w-full text-sm">

      <thead className="bg-aquaBlue text-white">
        <tr>
          <th className="px-4 py-3 text-center">Présent</th>
          <th className="px-4 py-3 text-left">Nom</th>
          <th className="px-4 py-3 text-left">Type</th>
          <th className="px-4 py-3 text-left">Contact</th>
          <th className="px-4 py-3 text-left">Lié à</th>
          <th className="px-4 py-3 text-center">Paiement</th>
          <th className="px-4 py-3 text-right">À payer</th>
        </tr>
      </thead>

      <tbody>

        {filteredRows.map((row) => {
          const balance = Math.max(
            0,
            Number(row.amount_due || 0) -
              Number(row.amount_paid || 0)
          );

          return (
            <tr
              key={row.row_key}
              className={`border-t ${
                row.came
                  ? "bg-green-50"
                  : "hover:bg-gray-50"
              }`}
            >

              <td className="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={row.came}
                  disabled={savingKey === row.row_key}
                  onChange={() => togglePresence(row)}
                  className="h-6 w-6 cursor-pointer accent-green-600"
                />
              </td>

              <td className="px-4 py-3">
                <p className="font-bold text-gray-900">
                  {row.full_name}
                </p>

                {row.came && (
                  <p className="mt-1 text-xs font-semibold text-green-700">
                    ✅ Entré
                  </p>
                )}
              </td>

              <td className="px-4 py-3">
                {row.person_type === "student" ? (
                  <span className="font-semibold text-purple-700">
                    Élève
                  </span>
                ) : (
                  <span className="font-semibold text-gray-700">
                    Invité
                  </span>
                )}
              </td>

              <td className="px-4 py-3">
                <p>{row.phone}</p>

                <p className="text-xs text-gray-500">
                  {row.email}
                </p>
              </td>

              <td className="px-4 py-3">
                {row.related_to || "—"}
              </td>

              <td className="px-4 py-3 text-center">
                {paymentBadge(row.payment_status)}
              </td>

              <td className="px-4 py-3 text-right">
                {balance > 0 ? (
                  <span className="text-lg font-bold text-red-600">
                    {money(balance)}
                  </span>
                ) : (
                  <span className="font-bold text-green-700">
                    —
                  </span>
                )}
              </td>

            </tr>
          );
        })}

        {!loading && filteredRows.length === 0 && (
          <tr>
            <td
              colSpan={7}
              className="px-4 py-10 text-center text-gray-500"
            >
              Aucune personne trouvée.
            </td>
          </tr>
        )}

      </tbody>

    </table>

  </div>

  {loading && (
    <div className="p-8 text-center text-gray-500">
      Chargement de la liste…
    </div>
  )}

</div>


{/* MOBILE CARDS */}

<div className="md:hidden space-y-4">

  {loading ? (
    <p className="text-center text-gray-500">
      Chargement…
    </p>
  ) : filteredRows.length === 0 ? (
    <p className="text-center text-gray-500">
      Aucune personne trouvée.
    </p>
  ) : (
    filteredRows.map((row) => {

      const balance = Math.max(
        0,
        Number(row.amount_due || 0) -
          Number(row.amount_paid || 0)
      );

      return (
        <div
          key={row.row_key}
          className={`rounded-xl border p-4 shadow space-y-3 ${
            row.came
              ? "bg-green-50 border-green-200"
              : "bg-white"
          }`}
        >

          {/* HEADER */}

          <div className="flex justify-between items-start gap-3">

            <div>
              <p className="font-bold text-lg text-blue-700">
                {row.full_name}
              </p>

              <p className="text-xs text-gray-500 mt-1">
                {row.person_type === "student"
                  ? "Élève"
                  : "Invité"}
              </p>
            </div>

            <div className="flex flex-col items-center gap-1">

              <span className="text-xs text-gray-500">
                Présent
              </span>

              <input
                type="checkbox"
                checked={row.came}
                disabled={savingKey === row.row_key}
                onChange={() => togglePresence(row)}
                className="h-7 w-7 cursor-pointer accent-green-600"
              />

            </div>

          </div>


          {/* STATUS */}

          <div className="flex flex-wrap gap-2">

            {paymentBadge(row.payment_status)}

            {row.came && (
              <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                ✅ Entré
              </span>
            )}

          </div>


          {/* INFO */}

          <div className="text-sm space-y-2">

            <p>
              <b>Téléphone :</b>{" "}
              {row.phone || "—"}
            </p>

            <p className="break-all">
              <b>Email :</b>{" "}
              {row.email || "—"}
            </p>

            <p>
              <b>Lié à :</b>{" "}
              {row.related_to || "—"}
            </p>

          </div>


          {/* BALANCE */}

          <div className="border-t pt-3 flex justify-between items-center">

            <span className="text-sm font-semibold text-gray-600">
              À payer
            </span>

            {balance > 0 ? (
              <span className="text-lg font-bold text-red-600">
                {money(balance)}
              </span>
            ) : (
              <span className="font-bold text-green-700">
                —
              </span>
            )}

          </div>

        </div>
      );
    })
  )}

</div>

    </div>
  );
}


// =========================================================
// SMALL STAT CARD
// =========================================================

function StatCard({
  label,
  value,
  className = "text-gray-900",
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">

      <p className="text-xs text-gray-500">
        {label}
      </p>

      <p
        className={`mt-1 text-2xl font-bold ${className}`}
      >
        {value}
      </p>

    </div>
  );
}