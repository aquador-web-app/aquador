import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrencyUSD } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);

  // form state
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(""); // keep as string in input; coerce on save
  const [durationHours, setDurationHours] = useState(2);
  const [isPublic, setIsPublic] = useState(true);
  const { showAlert, showConfirm } = useGlobalAlert();

  async function loadPlans() {
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Load plans error:", error);
      alert("Erreur lors du chargement des plans: " + (error.message || ""));
      return;
    }
    setPlans(data || []);
  }

  useEffect(() => {
    loadPlans();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setPrice("");
    setDurationHours(2);
    setIsPublic(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    // coerce types safely
    const priceNum = Number(price);
    const durationNum = Number(durationHours);

    if (!name.trim()) {
      alert("Le nom est obligatoire.");
      setLoading(false);
      return;
    }
    if (Number.isNaN(priceNum)) {
      alert("Le prix doit être un nombre.");
      setLoading(false);
      return;
    }

    const payload = {
      name: name.trim(),
      description: description?.trim() || null,
      price: Number(priceNum.toFixed(2)), // stored as numeric(…)
      duration_hours: Number.isNaN(durationNum) ? 2 : durationNum,
      is_public: !!isPublic,
    };

    try {
      let resp;
      if (editingId) {
        resp = await supabase.from("plans").update(payload).eq("id", editingId).select();
      } else {
        resp = await supabase.from("plans").insert([payload]).select();
      }

      const { data, error } = resp || {};
      // Forcefully surface supabase errors
      if (error) {
        console.error("Supabase error object:", error);
        alert(
          "Erreur lors de la création/mise à jour du plan:\n" +
            (error.message || "No message") +
            (error.details ? "\nDétails: " + error.details : "") +
            (error.hint ? "\nHint: " + error.hint : "")
        );
        setLoading(false);
        return;
      }

      // success
      if (editingId) {
        alert("✅ Plan mis à jour !");
      } else {
        alert("✅ Plan créé avec succès !");
      }
      await loadPlans();
      resetForm();
    } catch (err) {
      console.error("Unexpected error:", err);
      alert("❌ Erreur inattendue: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  function onEdit(p) {
    setEditingId(p.id);
    setName(p.name || "");
    setDescription(p.description || "");
    setPrice(p.price != null ? String(p.price) : "");
    setDurationHours(p.duration_hours ?? 2);
    setIsPublic(!!p.is_public);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onDelete(id) {
  const confirmed = await showConfirm("Supprimer ce plan ?");
  if (!confirmed) return;

  const { error } = await supabase
    .from("plans")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete error:", error);
    await showAlert("❌ Erreur lors de la suppression : " + (error.message || ""));
    return;
  }

  await showAlert("🗑️ Plan supprimé avec succès.");
  await loadPlans();
}


  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Plans</h2>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="mb-6 space-y-3 bg-white border p-4 rounded shadow"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Nom *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border p-2 rounded w-full"
              placeholder="Ex: 1h Session"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Prix (USD) *</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="border p-2 rounded w-full"
              placeholder="Ex: 60.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Durée (heures)</label>
            <input
              type="number"
              min={1}
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>

          <div className="flex items-center gap-2 mt-6">
            <input
              id="is_public"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <label htmlFor="is_public" className="text-sm">
              Visible aux utilisateurs
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border p-2 rounded w-full"
            placeholder="Note interne ou description publique…"
            rows={3}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {editingId ? "Mettre à jour" : "Créer le plan"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-100 px-4 py-2 rounded hover:bg-gray-200"
            >
              Annuler
            </button>
          )}
        </div>
      </form>

      {/* Table */}
      <div className="bg-white border shadow rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Nom</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Prix</th>
              <th className="px-3 py-2 text-left">Durée (h)</th>
              <th className="px-3 py-2 text-left">Visible</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">{p.description || "—"}</td>
                <td className="px-3 py-2">{formatCurrencyUSD(p.price)}</td>
                <td className="px-3 py-2">{p.duration_hours ?? "—"}</td>
                <td className="px-3 py-2">{p.is_public ? "Oui" : "Non"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => onEdit(p)}
                      className="px-2 py-1 bg-yellow-500 text-white rounded"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => onDelete(p.id)}
                      className="px-2 py-1 bg-red-600 text-white rounded"
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-4 text-gray-500">
                  Aucun plan disponible.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
