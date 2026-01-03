import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useGlobalAlert } from "../../components/GlobalAlert";

export default function AdminCourses() {
  const [courses, setCourses] = useState([]);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [editingId, setEditingId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const { showAlert, showConfirm } = useGlobalAlert();


  useEffect(() => {
    fetchCourses();
  }, []);

  async function fetchCourses() {
    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
    } else {
      setCourses(data);
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
  if (!formData.name) {
    alert("Le nom du cours est obligatoire.");
    return;
  }

  try {
    if (editingId) {
      const { error } = await supabase
        .from("courses")
        .update({ name: formData.name, description: formData.description })
        .eq("id", editingId);
      if (error) throw error;
      alert("Cours mis à jour !");
    } else {
      const { error } = await supabase.from("courses").insert([formData]);
      if (error) throw error;
      alert("Cours créé !");
    }
    setFormData({ name: "", description: "" });
    setEditingId(null);
    fetchCourses();
  } catch (err) {
    console.error("Supabase error (courses):", err);
    alert("Erreur lors de la création/mise à jour du cours: " + (err?.message || "inconnue"));
  }

    if (editingId) {
      const { error } = await supabase
        .from("courses")
        .update({ name: formData.name, description: formData.description })
        .eq("id", editingId);

      if (error) {
        console.error(error);
        alert("Erreur lors de la mise à jour du cours.");
      } else {
        alert("Cours mis à jour !");
      }
    } else {
      const { error } = await supabase.from("courses").insert([formData]);
      if (error) {
        console.error(error);
        alert("Erreur lors de la création du cours.");
      } else {
        alert("Cours créé !");
      }
    }

    setFormData({ name: "", description: "" });
    setEditingId(null);
    fetchCourses();
  };

  const handleEdit = (course) => {
    setEditingId(course.id);
    setFormData({ name: course.name, description: course.description });
  };

  const handleDelete = async (id) => {
  const confirmed = await showConfirm("Supprimer ce cours ?");
  if (!confirmed) return;

  const { error } = await supabase.from("courses").delete().eq("id", id);

  if (error) {
    console.error(error);
    await showAlert("❌ Erreur lors de la suppression du cours.");
    return;
  }

  await showAlert("🗑️ Cours supprimé.");
  await fetchCourses();
};


  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Gestion des Cours</h1>

      {/* Course form */}
      <div className="bg-white border p-4 rounded shadow mb-6">
        <h3 className="font-semibold mb-2">
          {editingId ? "Modifier le cours" : "Créer un nouveau cours"}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <label>
            Nom
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="border p-1 rounded w-full"
            />
          </label>
          <label>
            Description
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="border p-1 rounded w-full"
            />
          </label>
        </div>
        <button
          onClick={handleSave}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {editingId ? "Mettre à jour" : "Créer"}
        </button>
      </div>

      {/* Courses list */}
      <table className="min-w-full bg-white border border-gray-200 shadow-sm rounded-lg">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-1 text-left">Nom</th>
            <th className="px-2 py-1 text-left">Description</th>
            <th className="px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="px-2 py-1">{c.name}</td>
              <td className="px-2 py-1">{c.description}</td>
              <td className="px-2 py-1 text-center">
                <button
                  onClick={() => handleEdit(c)}
                  className="text-blue-600 hover:underline mr-2"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-red-600 hover:underline"
                >
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
          {courses.length === 0 && (
            <tr>
              <td colSpan="3" className="text-center py-3 text-gray-500">
                Aucun cours trouvé.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
