// src/pages/admin/AdminNotificationTemplates.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { FaSave, FaPlus, FaTrash } from "react-icons/fa";
import { motion } from "framer-motion";
import { useGlobalAlert } from "../../components/GlobalAlert";

export default function AdminNotificationTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const { showAlert, showConfirm } = useGlobalAlert();
  const [newTemplate, setNewTemplate] = useState({
    code: "",
    category: "",
    template: "",
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notification_templates")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) console.error("❌ Fetch error:", error);
    setTemplates(data || []);
    setLoading(false);
  }

  async function saveTemplate(t) {
    if (!t.code || !t.template || !t.category) return alert("All fields required");

    const { error } = await supabase
      .from("notification_templates")
      .update({
        code: t.code,
        category: t.category,
        template: t.template,
      })
      .eq("id", t.id);

    if (error) {
      console.error("Save failed:", error);
      alert("Error saving template.");
    } else {
      setEditing(null);
      fetchTemplates();
    }
  }

  async function addTemplate() {
    if (!newTemplate.code || !newTemplate.category || !newTemplate.template)
      return alert("All fields required");

    const { error } = await supabase.from("notification_templates").insert([newTemplate]);

    if (error) {
      console.error("Insert failed:", error);
      alert("Error adding new template.");
    } else {
      setNewTemplate({ code: "", category: "", template: "" });
      fetchTemplates();
    }
  }

  async function deleteTemplate(id) {
  const confirmed = await showConfirm("Delete this template ?");
  if (!confirmed) return;

  const { error } = await supabase
    .from("notification_templates")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete failed:", error);
    await showAlert("❌ Error deleting template.");
    return;
  }

  await showAlert("🗑️ Template deleted successfully.");
  fetchTemplates();
}


  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-aquaBlue mb-4">
        🔔 Gestion des Modèles de Notifications
      </h2>

      <div className="bg-white shadow rounded-xl border border-gray-200 p-4 mb-6">
        <h3 className="font-semibold text-gray-700 mb-3">➕ Ajouter un modèle</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <input
            type="text"
            placeholder="Code"
            value={newTemplate.code}
            onChange={(e) => setNewTemplate({ ...newTemplate, code: e.target.value })}
            className="border p-2 rounded-md w-full"
          />
          <input
            type="text"
            placeholder="Catégorie"
            value={newTemplate.category}
            onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
            className="border p-2 rounded-md w-full"
          />
          <textarea
            placeholder="Texte du modèle"
            value={newTemplate.template}
            onChange={(e) => setNewTemplate({ ...newTemplate, template: e.target.value })}
            className="border p-2 rounded-md w-full md:col-span-3"
          />
        </div>
        <button
          onClick={addTemplate}
          className="bg-aquaBlue text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <FaPlus /> Ajouter
        </button>
      </div>

      <div className="bg-white shadow rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-700 mb-3">
          📜 Liste des modèles existants
        </h3>

        {loading ? (
          <p>Chargement...</p>
        ) : templates.length === 0 ? (
          <p className="italic text-gray-500">Aucun modèle trouvé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border">
              <thead className="bg-aquaBlue text-white">
                <tr>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Catégorie</th>
                  <th className="px-4 py-2 text-left">Modèle</th>
                  <th className="px-4 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-semibold text-gray-700">
                      {editing === t.id ? (
                        <input
                          value={t.code}
                          onChange={(e) =>
                            setTemplates((prev) =>
                              prev.map((x) => (x.id === t.id ? { ...x, code: e.target.value } : x))
                            )
                          }
                          className="border p-1 rounded w-full"
                        />
                      ) : (
                        t.code
                      )}
                    </td>

                    <td className="px-4 py-2">
                      {editing === t.id ? (
                        <input
                          value={t.category}
                          onChange={(e) =>
                            setTemplates((prev) =>
                              prev.map((x) =>
                                x.id === t.id ? { ...x, category: e.target.value } : x
                              )
                            )
                          }
                          className="border p-1 rounded w-full"
                        />
                      ) : (
                        t.category
                      )}
                    </td>

                    <td className="px-4 py-2 w-[40%]">
                      {editing === t.id ? (
                        <textarea
                          value={t.template}
                          onChange={(e) =>
                            setTemplates((prev) =>
                              prev.map((x) =>
                                x.id === t.id ? { ...x, template: e.target.value } : x
                              )
                            )
                          }
                          className="border p-1 rounded w-full"
                        />
                      ) : (
                        <span className="text-gray-700">{t.template}</span>
                      )}
                    </td>

                    <td className="px-4 py-2 text-center">
                      {editing === t.id ? (
                        <button
                          onClick={() => saveTemplate(t)}
                          className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 flex items-center gap-1 justify-center mx-auto"
                        >
                          <FaSave /> Enregistrer
                        </button>
                      ) : (
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => setEditing(t.id)}
                            className="text-blue-600 hover:underline"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => deleteTemplate(t.id)}
                            className="text-red-600 hover:underline"
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
