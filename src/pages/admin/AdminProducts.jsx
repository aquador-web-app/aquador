import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { motion } from "framer-motion";
import { FaPlus, FaTrash, FaEdit, FaBoxOpen, FaSave, FaImage } from "react-icons/fa";
import { formatCurrencyUSD } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const { showAlert, showConfirm } = useGlobalAlert();
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    image_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const [role, setRole] = useState(null); // ✅ track logged-in role

  // 🔹 Fetch current user role
  useEffect(() => {
    async function fetchRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (data) setRole(data.role);
    }
    fetchRole();
  }, []);

  // 🔹 Load products
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setProducts(data || []);
    else console.error("❌ Load error:", error);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // 🔹 Handle input changes
  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageUpload = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setUploading(true);

  try {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    // 1️⃣ Upload to your public bucket
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // 2️⃣ Get a permanent public URL
    const { data: publicData } = supabase.storage
      .from("product-images")
      .getPublicUrl(filePath);

    if (!publicData?.publicUrl) {
      throw new Error("No public URL returned");
    }

    // 3️⃣ Save it in formData for preview + DB
    setFormData((prev) => ({ ...prev, image_url: publicData.publicUrl }));
    console.log("✅ Uploaded to:", publicData.publicUrl);
  } catch (err) {
    console.error("❌ Upload failed:", err.message);
    alert("Erreur de téléchargement : " + err.message);
  } finally {
    setUploading(false);
  }
};



  // 🔹 Save product
  const saveProduct = async () => {
    if (!formData.name || !formData.price) {
      alert("Veuillez remplir le nom et le prix.");
      return;
    }

    const payload = {
      name: formData.name,
      price: Number(formData.price),
      stock: Number(formData.stock || 0),
      image_url: formData.image_url || null,
    };

    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert([payload]);

    if (error) {
      alert("Erreur: " + error.message);
      return;
    }

    alert(editing ? "Produit mis à jour ✅" : "Produit ajouté ✅");
    setFormData({ name: "", price: "", stock: "", image_url: "" });
    setEditing(null);
    load();
  };

  // 🔹 Delete product
  const deleteProduct = async (id) => {
  const confirmed = await showConfirm("Supprimer ce produit ?");
  if (!confirmed) return;

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    await showAlert("❌ Erreur : " + error.message);
  } else {
    await showAlert("🗑️ Produit supprimé avec succès.");
    load();
  }
};


  // 🔹 Edit product
  const editProduct = (p) => {
    setEditing(p);
    setFormData({
      name: p.name,
      price: p.price,
      stock: p.stock,
      image_url: p.image_url || "",
    });
  };

  return (
    <motion.div
      className="bg-white p-6 rounded-2xl shadow-lg space-y-6"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FaBoxOpen className="text-aquaBlue" /> Gestion des Produits
        </h1>

        {/* ✅ Hide add button for assistants */}
        {role !== "assistant" && (
          <button
            onClick={() => {
              setEditing(null);
              setFormData({ name: "", price: "", stock: "", image_url: "" });
            }}
            className="flex items-center gap-2 bg-aquaBlue text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow"
          >
            <FaPlus /> Nouveau Produit
          </button>
        )}
      </div>

      {/* ✅ Hide form for assistants */}
      {role !== "assistant" && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-inner">
          <h2 className="text-lg font-semibold mb-3 text-gray-700">
            {editing ? "Modifier le produit" : "Ajouter un produit"}
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <input
              name="name"
              placeholder="Nom du produit"
              value={formData.name}
              onChange={handleChange}
              className="border rounded-lg p-2 focus:ring-2 focus:ring-aquaBlue"
            />
            <input
              name="price"
              type="number"
              placeholder="Prix"
              value={formData.price}
              onChange={handleChange}
              className="border rounded-lg p-2 focus:ring-2 focus:ring-aquaBlue"
            />
            <input
              name="stock"
              type="number"
              placeholder="Stock"
              value={formData.stock}
              onChange={handleChange}
              className="border rounded-lg p-2 focus:ring-2 focus:ring-aquaBlue"
            />

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Image du produit
              </label>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg border">
                  <FaImage />
                  <span>{uploading ? "Téléchargement..." : "Choisir une image"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {formData.image_url && (
                  <img
                    src={formData.image_url}
                    alt="preview"
                    className="h-14 w-14 object-cover rounded-lg border"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4 gap-3">
            <button
              onClick={() => {
                setFormData({ name: "", price: "", stock: "", image_url: "" });
                setEditing(null);
              }}
              className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
            >
              Annuler
            </button>
            <button
              onClick={saveProduct}
              className="px-3 py-2 bg-aquaBlue text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <FaSave /> {editing ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>
        </div>
      )}

      {/* Product Grid */}
      {loading ? (
        <p className="text-center text-gray-500 py-6">Chargement...</p>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
          {products.map((p) => (
            <motion.div
              key={p.id}
              className="p-4 bg-white border border-gray-200 rounded-xl shadow hover:shadow-lg transition-all"
              whileHover={{ scale: 1.03 }}
            >
              <div className="relative w-full aspect-square mb-3">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="absolute inset-0 w-full h-full object-contain rounded-lg border bg-white"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gray-100 flex items-center justify-center rounded-lg border text-gray-400">
                    <FaImage className="text-3xl" />
                  </div>
                )}
              </div>

              <h3 className="text-lg font-bold text-gray-800">{p.name}</h3>
              <p className="text-sm text-gray-600 mb-1">
                Prix:{" "}
                <span className="font-semibold text-blue-700">
                  {formatCurrencyUSD(p.price)}
                </span>
              </p>
              <p className="text-sm text-gray-500">
                Stock: <span className="font-semibold">{p.stock}</span>
              </p>

              {/* ✅ Hide edit/delete buttons for assistants */}
              {role !== "assistant" && (
                <div className="flex justify-end mt-3 gap-2">
                  <button
                    onClick={() => editProduct(p)}
                    className="px-3 py-1 bg-yellow-400 hover:bg-yellow-500 text-gray-800 rounded-lg text-sm flex items-center gap-1"
                  >
                    <FaEdit /> Modifier
                  </button>
                  <button
                    onClick={() => deleteProduct(p.id)}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm flex items-center gap-1"
                  >
                    <FaTrash /> Supprimer
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}