import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const EVENT_CODE = "cloture-2026-08-29";

function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString("fr-FR", {
      timeZone: "America/Port-au-Prince",
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export default function AdminEventPresence() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");

  async function fetchConfirmations() {
    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("event_presence_confirmations")
        .select(`
          id,
          event_code,
          event_name,
          event_date,
          status,
          confirmed_at,
          cancelled_at,
          cancellation_reason,
          participant_profile_id,
          confirmed_by_profile_id,
          participant:participant_profile_id (
            id,
            full_name,
            first_name,
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
        .order("confirmed_at", { ascending: false });

      if (queryError) throw queryError;

      setRows(data || []);
    } catch (queryError) {
      console.error(
        "Event confirmations loading error:",
        queryError
      );

      setError(
        queryError?.message ||
          "Impossible de charger les confirmations."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchConfirmations();
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (
        statusFilter !== "all" &&
        row.status !== statusFilter
      ) {
        return false;
      }

      if (!term) return true;

      const searchable = [
        row.participant?.full_name,
        row.participant?.phone,
        row.participant?.email,
        row.confirmer?.full_name,
        row.confirmer?.phone,
        row.confirmer?.email,
        row.cancellation_reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [rows, search, statusFilter]);

  const confirmedCount = rows.filter(
    (row) => row.status === "confirmed"
  ).length;

  const cancelledCount = rows.filter(
    (row) => row.status === "cancelled"
  ).length;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-aquaBlue">
            Présences — Clôture du 29 août 2026
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Liste des élèves ayant confirmé leur présence.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchConfirmations}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
        >
          Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow p-5">
          <p className="text-sm text-gray-500">
            Confirmés
          </p>

          <p className="text-3xl font-bold text-green-600">
            {confirmedCount}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <p className="text-sm text-gray-500">
            Annulés
          </p>

          <p className="text-3xl font-bold text-red-600">
            {cancelledCount}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <p className="text-sm text-gray-500">
            Total des réponses
          </p>

          <p className="text-3xl font-bold text-blue-600">
            {rows.length}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Rechercher un élève, téléphone ou e-mail…"
            className="border rounded-lg px-3 py-2"
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
            className="border rounded-lg px-3 py-2"
          >
            <option value="all">Tous les statuts</option>
            <option value="confirmed">Confirmés</option>
            <option value="cancelled">Annulés</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-aquaBlue text-white">
              <tr>
                <th className="px-4 py-3 text-left">
                  Élève
                </th>

                <th className="px-4 py-3 text-left">
                  Confirmé par
                </th>

                <th className="px-4 py-3 text-left">
                  Contact
                </th>

                <th className="px-4 py-3 text-left">
  Statut
</th>

<th className="px-4 py-3 text-left">
  Motif
</th>

<th className="px-4 py-3 text-left">
  Date de réponse
</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-semibold">
                    {row.participant?.full_name || "—"}
                  </td>

                  <td className="px-4 py-3">
                    {row.confirmer?.full_name || "—"}
                  </td>

                  <td className="px-4 py-3">
                    <div>
                      {row.confirmer?.phone ||
                        row.participant?.phone ||
                        "—"}
                    </div>

                    <div className="text-xs text-gray-500">
                      {row.confirmer?.email ||
                        row.participant?.email ||
                        "—"}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                        row.status === "confirmed"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {row.status === "confirmed"
                        ? "Confirmé"
                        : "Annulé"}
                    </span>
                  </td>
                        
                 <td className="px-4 py-3">
  {row.status === "cancelled" ? (
    <div className="max-w-[320px]">
      <p className="text-sm text-gray-700 whitespace-pre-wrap">
        {row.cancellation_reason || "—"}
      </p>
    </div>
  ) : (
    <span className="text-gray-400">—</span>
  )}
</td>

                  <td className="px-4 py-3">
  {formatDateTime(
    row.status === "cancelled"
      ? row.cancelled_at
      : row.confirmed_at
  )}
</td>
                </tr>
              ))}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500 italic"
                  >
                    Aucune confirmation trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="p-8 text-center text-gray-500">
            Chargement des confirmations…
          </div>
        )}
      </div>
    </div>
  );
}