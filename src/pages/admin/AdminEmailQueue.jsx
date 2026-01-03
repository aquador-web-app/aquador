import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const PAGE_SIZE = 20;

// ================================
// 🔐 Supabase Edge Function config (VITE ONLY)
// ================================
const FUNCTION_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!FUNCTION_URL) {
  throw new Error("❌ VITE_SUPABASE_FUNCTION_URL is not defined");
}

if (!ANON_KEY) {
  throw new Error("❌ VITE_SUPABASE_ANON_KEY is not defined");
}


export default function AdminEmailQueue() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  

  // filters
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");

  // selection
  const [selected, setSelected] = useState([]);
  const allSelected = rows.length > 0 && selected.length === rows.length;

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(count / PAGE_SIZE)),
    [count]
  );

  async function sendNow(row) {
  try {
    const res = await fetch(
      `${FUNCTION_URL}/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          emailQueueId: row.id,     // still useful
          email: row.email,         // 🔥 REQUIRED
          subject: row.subject,     // 🔥 REQUIRED
          body: row.body,           // 🔥 REQUIRED
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Échec envoi");
    }

    await loadEmails();
  } catch (err) {
    alert("Erreur lors de l’envoi : " + err.message);
  }
}




  async function loadEmails(currentPage = page) {
    setLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("email_queue")
      .select(
        "id, invoice_id, user_id, email, subject, body, status, kind, created_at, sent_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) query = query.eq("status", status);
    if (kind) query = query.eq("kind", kind);
    if (q)
      query = query.or(`email.ilike.%${q}%,subject.ilike.%${q}%`);

    const { data, error, count: total } = await query;
    setLoading(false);

    if (error) {
      alert("Erreur chargement emails: " + error.message);
      return;
    }

    setRows(data || []);
    setCount(total || 0);
    setSelected([]); // reset selection on reload
  }

  useEffect(() => {
    loadEmails();
  }, [page, status, kind]);

  async function onSearch(e) {
    e.preventDefault();
    setPage(1);
    await loadEmails(1);
  }

  // === Bulk / Individual Actions ===
  async function bulkUpdate(ids, update) {
    if (!ids?.length) return alert("Aucune sélection.");
    const { error } = await supabase.from("email_queue").update(update).in("id", ids);
    if (error) return alert("Erreur de mise à jour: " + error.message);
    await loadEmails();
  }

  async function bulkDelete(ids) {
    if (!ids?.length) return alert("Aucune sélection.");
    if (!confirm("Supprimer les emails sélectionnés ?")) return;
    const { error } = await supabase.from("email_queue").delete().in("id", ids);
    if (error) return alert("Erreur suppression: " + error.message);
    await loadEmails();
  }

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    alert("Copié dans le presse-papier.");
  };

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(rows.map((r) => r.id));
  };

  return (
    <div className="p-4 bg-white border rounded shadow">
      <h2 className="text-lg font-bold mb-4">Gestion des Emails (file d’attente)</h2>

      {/* Filters */}
      <form
        onSubmit={onSearch}
        className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3"
      >
        <input
          className="border rounded px-2 py-1"
          placeholder="Rechercher (email / objet)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="border rounded px-2 py-1"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous statuts</option>
          <option value="pending">En attente</option>
          <option value="sent">Envoyé</option>
          <option value="failed">Échec</option>
        </select>
        <select
          className="border rounded px-2 py-1"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous types</option>
          <option value="initial">Initial</option>
          <option value="reminder_2nd">Rappel 2</option>
          <option value="reminder_7th">Rappel 7 (final)</option>
          <option value="manual">Manuel</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className="border rounded px-3">
            Rechercher
          </button>
          <button
            type="button"
            className="border rounded px-3"
            onClick={() => {
              setQ("");
              setStatus("");
              setKind("");
              setPage(1);
              loadEmails(1);
            }}
          >
            Réinitialiser
          </button>
        </div>
      </form>

      {/* Bulk Toolbar */}
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 items-center text-sm">
          <span className="font-semibold text-blue-600">
            {selected.length} sélectionné(s)
          </span>
          <button
            className="border rounded px-2 py-1"
            onClick={() =>
              bulkUpdate(selected, {
                status: "sent",
                sent_at: new Date().toISOString(),
              })
            }
          >
            ✅ Marquer envoyé
          </button>
          <button
            className="border rounded px-2 py-1"
            onClick={() => bulkUpdate(selected, { status: "failed" })}
          >
            ❌ Marquer échec
          </button>
          <button
            className="border rounded px-2 py-1"
            onClick={() =>
              bulkUpdate(selected, { status: "pending", sent_at: null })
            }
          >
            📤 Remettre en attente
          </button>
          <button
            className="border rounded px-2 py-1 text-red-700"
            onClick={() => bulkDelete(selected)}
          >
            🗑️ Supprimer
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-50 border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-3 py-2 text-left">Créé</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Destinataire</th>
              <th className="px-3 py-2 text-left">Objet</th>
              <th className="px-3 py-2 text-left">Facture</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-t align-top ${
                  selected.includes(r.id) ? "bg-blue-50" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  <div>{new Date(r.created_at).toLocaleString("fr-FR")}</div>
                  {r.sent_at && (
                    <div className="text-xs text-green-700">
                      Envoyé: {new Date(r.sent_at).toLocaleString("fr-FR")}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">{r.kind || "initial"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      r.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : r.status === "sent"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.email}</div>
                  <button
                    className="text-xs underline"
                    onClick={() => copy(r.email)}
                  >
                    copier
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.subject || "—"}</div>
                  <details className="text-xs mt-1">
                    <summary className="cursor-pointer text-gray-600">
                      Voir le message
                    </summary>
                    <pre className="whitespace-pre-wrap bg-white border rounded p-2 mt-1">
                      {r.body || "—"}
                    </pre>
                    <div className="mt-1">
                      <button
                        className="text-xs underline"
                        onClick={() => copy(r.body || "")}
                      >
                        copier le corps
                      </button>
                    </div>
                  </details>
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs">{r.invoice_id}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
  className="border rounded px-2 py-1 text-xs"
  onClick={() => sendNow(r)}
>
  Envoyer maintenant
</button>

                    <button
                      className="border rounded px-2 py-1 text-xs"
                      onClick={() =>
                        bulkUpdate([r.id], {
                          status: "sent",
                          sent_at: new Date().toISOString(),
                        })
                      }
                    >
                      Marquer envoyé
                    </button>
                    <button
                      className="border rounded px-2 py-1 text-xs"
                      onClick={() => bulkUpdate([r.id], { status: "failed" })}
                    >
                      Marquer échec
                    </button>
                    <button
                      className="border rounded px-2 py-1 text-xs text-red-700"
                      onClick={() => bulkDelete([r.id])}
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="text-center py-6 text-gray-500">
                  Aucun email.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-3 text-sm text-gray-600">Chargement…</div>}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between p-3">
        <span className="text-xs text-gray-600">
          Page {page} / {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            className="px-2 py-1 border rounded disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Précédent
          </button>
          <button
            className="px-2 py-1 border rounded disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
