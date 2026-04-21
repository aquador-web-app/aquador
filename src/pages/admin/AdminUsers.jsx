import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminUsersForm from "./AdminUsersForm";
import { normalizeISODate, formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";
import { useNavigate } from "react-router-dom";
import AdminUserProfile from "./AdminUserProfile";
import { FaDollarSign } from "react-icons/fa";





export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [savingRow, setSavingRow] = useState(null); // row-level spinner
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortMode, setSortMode] = useState("az");
  const [formParentId, setFormParentId] = useState(null);

  const [role, setRole] = useState(null);

useEffect(() => {
  async function fetchRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (data) setRole(data.role);
  }
  fetchRole();
}, []);



  useEffect(() => {
  // Allow other pages to request opening a specific user profile
  const handler = (e) => {
    const id = e.detail?.id;
    if (id) setSelectedUser({ id });
  };
  window.addEventListener("openUserProfile", handler);
  window.addEventListener("openUserProfileGlobal", handler);


  // Also expose a convenience function
  window.openUserProfile = (id) => setSelectedUser({ id });

  return () => {
    window.removeEventListener("openUserProfile", handler);
    delete window.openUserProfile;
  };
}, []);



const handleAddChild = (parentId) => {
  setFormParentId(parentId);
  setShowForm(true);
};
  
  // Apply filters and search to the users list
  const filteredUsers = users
  .filter((u) =>
    `${u.first_name || ""} ${u.middle_name || ""} ${u.last_name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  .filter((u) => (roleFilter ? u.role === roleFilter : true))
  .filter((u) =>
    statusFilter === ""
      ? true
      : statusFilter === "active"
      ? u.is_active === true
      : u.is_active === false
  )
  .sort((a, b) => {
    if (sortMode === "newest") {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }

    if (sortMode === "oldest") {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    }

    const nameA = `${a.first_name || ""} ${a.middle_name || ""} ${a.last_name || ""}`.toLowerCase();
    const nameB = `${b.first_name || ""} ${b.middle_name || ""} ${b.last_name || ""}`.toLowerCase();

    if (sortMode === "az") return nameA.localeCompare(nameB);
    if (sortMode === "za") return nameB.localeCompare(nameA);

    return 0;
  });

  
  async function fetchUsers() {
  setLoading(true);

  const { data, error } = await supabase
    .from("profiles_with_unpaid")
    .select("id, first_name, middle_name, last_name, email, phone, role, is_active, signup_type, referral_code, address, sex, birth_date,has_unpaid, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Fetch users error:", error.message);
  } else {
    console.log("✅ Users loaded:", data?.length || 0, "users");
    setUsers(data || []);
  }

  setLoading(false);
}


  useEffect(() => {
    fetchUsers();
  }, []);

  async function updateSignupType(userId, newType) {
  setSavingRow(userId);
  const { error } = await supabase
    .from("profiles")
    .update({ signup_type: newType })
    .eq("id", userId);
  if (error) {
    console.error(error);
    alert("Erreur lors de la mise à jour du type d’inscription");
  }
  setSavingRow(null);
}

  async function handleDelete(id) {
  if (!confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ?")) return;
  
  // Delete from auth
  const { error: authError } = await supabase.auth.admin.deleteUser(id);
  if (authError) {
    console.error("Auth delete error:", authError.message);
    alert("Erreur Auth: " + authError.message);
    return;
  }

  // Delete profile
  const { error: deleteError } = await supabase.from("profiles").delete().eq("id", id);
  if (deleteError) {
    console.error("Delete error:", deleteError.message);
    alert("Erreur Profile: " + deleteError.message);
  } else {
    console.log("Delete success");
    fetchUsers();
  }
}


  async function updateRole(id, newRole) {
    setSavingRow(id);
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", id);
    setSavingRow(null);
    if (error) alert("Erreur mise à jour du rôle: " + error.message);
    else fetchUsers();
  }

  const toggleActive = async (id, current) => {
    setSavingRow(id);
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !current })
      .eq("id", id);
    setSavingRow(null);
    if (error) alert("Erreur mise à jour du statut: " + error.message);
    else fetchUsers();
  }

  function openCreate() {
  setEditUser(null);       // ✅ clear previous edit user
  setSelectedUser(null);   // ✅ make sure profile view isn’t active
  setFormParentId(null);   // ✅ clear parent link
  setShowForm(true);       // ✅ open fresh empty form
}


  function openEdit(u) {
    setEditUser(u);       // ✅ prefill form with user data
    setShowForm(true);
  }

  
// tiny helper to stop the row click when using controls
const stop = (e) => e.stopPropagation();

  return (
    <div className="p-6">   
     {!selectedUser ? (
      <>       
      <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
  <h2 className="text-xl font-bold">Utilisateurs</h2>

  <div className="flex flex-wrap gap-2 items-center">
    {/* Search Bar */}
    <input
      type="text"
      placeholder="Rechercher..."
      className="border rounded px-3 py-1"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />

    {/* Filter by Role */}
    <select
      value={roleFilter}
      onChange={(e) => setRoleFilter(e.target.value)}
      className="border rounded px-2 py-1"
    >
      <option value="">Tous rôles</option>
      <option value="student">Élève</option>
      <option value="teacher">Professeur</option>
      <option value="assistant">Assistante</option>
      <option value="influencer">Influenceur</option>
      <option value="admin">Admin</option>
    </select>

    {/* Filter by Status */}
    <select
      value={statusFilter}
      onChange={(e) => setStatusFilter(e.target.value)}
      className="border rounded px-2 py-1"
    >
      <option value="">Tous statuts</option>
      <option value="active">Actif</option>
      <option value="inactive">Inactif</option>
    </select>

    {/* Sort Button */}
    <select
  value={sortMode}
  onChange={(e) => setSortMode(e.target.value)}
  className="border rounded px-2 py-1"
>
  <option value="az">A → Z</option>
  <option value="za">Z → A</option>
  <option value="newest">Derniers inscrits</option>
  <option value="oldest">Premiers inscrits</option>
</select>

    {/* Create Button */}
    {role !== "assistant" && (
  <button
    onClick={openCreate}
    className="bg-aquaBlue text-white px-4 py-2 rounded hover:bg-blue-600"
  >
    + Créer un utilisateur
  </button>
)}
  </div>
</div>


      {loading ? (
        <p>Chargement...</p>
      ) : (
        <div className="hidden md:block overflow-x-auto bg-white border rounded shadow">
  <table
    className={`${
      role === "assistant" ? "min-w-[1000px]" : "min-w-[1400px]"
    } table-fixed`}
  >
    {/* === Dynamic colgroup === */}
    <colgroup>
  {[
    <col key="c1" className="w-[140px]" />,
    <col key="c2" className="w-[140px]" />,
    <col key="c3" className="w-[160px]" />,
    <col key="c4" className="w-[150px]" />,
    <col key="c5" className="w-[100px]" />,
    <col key="c6" className="w-[320px]" />,
    <col key="c7" className="w-[150px]" />,
    <col key="c8" className="w-[250px]" />,
    <col key="c9" className="w-[170px]" />,
    ...(role !== "assistant"
      ? [
          <col key="c10" className="w-[170px]" />,
          <col key="c11" className="w-[150px]" />,
          <col key="c12" className="w-[120px]" />,
          <col key="c13" className="w-[120px]" />,
        ]
      : []),
  ]}
</colgroup>


    <thead className="bg-aquaBlue text-white">
      <tr>
        <th className="px-4 py-2 text-left whitespace-nowrap">Prénom</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">2e Prénom</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Nom</th>
        <th className="px-4 py-2 text-left whitespace-nowrap"> Date de naissance</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Sexe</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Email</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Téléphone</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Adresse</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Code de Parrainage</th>

        {/* hide these columns for assistants */}
        {role !== "assistant" && (
          <>
            <th className="px-4 py-2 text-left whitespace-nowrap"> Type d’inscription</th>
            <th className="px-4 py-2 text-left whitespace-nowrap">Rôle</th>
            <th className="px-4 py-2 text-center whitespace-nowrap">Statut</th>
            <th className="px-4 py-2 text-center whitespace-nowrap">Actions</th>
          </>
        )}
      </tr>
    </thead>

    <tbody>
      {filteredUsers.map((u) => (
        <tr
          key={u.id}
          className="border-t hover:bg-blue-50"
          onClick={() => setSelectedUser(u)}
        >
          <td className="px-4 py-2 whitespace-nowrap">
            {u.first_name || "—"}
          </td>
          <td className="px-4 py-2 whitespace-nowrap">
            {u.middle_name || "—"}
          </td>
          <td className="px-4 py-2 whitespace-nowrap items-center gap-1">
            {u.last_name || "—"}
            {u.has_unpaid && (
              <FaDollarSign
                className="text-red-500"
                title="Facture impayée"
              />
            )}
          </td>

          <td className="px-4 py-2 whitespace-nowrap">
            {u.birth_date ? formatDateFrSafe(u.birth_date) : "—"}
          </td>
          <td className="px-4 py-2 whitespace-nowrap">{u.sex || "—"}</td>
          <td className="px-4 py-2 break-words whitespace-nowrap">{u.email || "—"}</td>
          <td className="px-4 py-2 whitespace-nowrap">
  {u.phone ? (
    <a
      href={`tel:${u.phone}`}
      className="text-blue-600 hover:underline"
      onClick={stop}
    >
      {u.phone}
    </a>
  ) : (
    "—"
  )}
</td>

          <td className="px-4 py-2 break-words whitespace-nowrap">{u.address || "—"}</td>
          <td className="px-4 py-2 text-center whitespace-nowrap">
            {u.referral_code || "—"}
          </td>

          {/* 👇 show these only for non-assistants */}
          {role !== "assistant" && (
            <>
              <td className="px-1 py-2 whitespace-nowrap">
                <select
                  className="border rounded px-1 py-1 w-full"
                  value={u.signup_type || "me"}
                  onClick={stop}
                  onChange={(e) =>
                    updateSignupType(u.id, e.target.value)
                  }
                  disabled={savingRow === u.id}
                >
                  <option value="me">Moi seulement</option>
                  <option value="me_student">Moi + enfants</option>
                  <option value="children_only">Enfants seulement</option>
                  <option value="child">Enfant</option>
                  <option value="teacher_only">Professeur (interne)</option>
                  <option value="assistant_only">Assistante (interne)</option>
                  <option value="admin_only">Admin (interne)</option>
                </select>
              </td>

              <td className="px-2 py-2 whitespace-nowrap">
                <div className="relative">
                  <select
                    className="border rounded px-1 py-1 w-full min-w-[140px] max-w-[140px] bg-white text-sm"
                    value={u.role || "student"}
                    onClick={stop}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    disabled={savingRow === u.id}
                  >
                    <option value="student">Élève</option>
                    <option value="teacher">Professeur</option>
                    <option value="assistant">Assistante</option>
                    <option value="influencer">Influenceur</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </td>

              <td className="px-4 py-2 whitespace-nowrap text-center">
                <div className="flex items-center justify-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!u.is_active}
                    onClick={stop}
                    onChange={() => toggleActive(u.id, !!u.is_active)}
                    disabled={savingRow === u.id}
                  />
                  <span
                    className={u.is_active ? "text-green-600" : "text-red-600"}
                  >
                    {u.is_active ? "Actif" : "Inactif"}
                  </span>
                </div>
              </td>


              <td className="px-4 py-2 space-x-2 text-center whitespace-nowrap">
                <button
                  className="px-2 py-0.5 border rounded"
                  onClick={(e) => {
                    stop(e);
                    openEdit(u);
                  }}
                >
                  ✏️
                </button>
                <button
                  className="px-2 py-0.5 border rounded text-red-600"
                  onClick={(e) => {
                    stop(e);
                    handleDelete(u.id);
                  }}
                >
                  🗑️
                </button>
              </td>
            </>
          )}
        </tr>
      ))}

      {users.length === 0 && (
        <tr>
          <td
            className="px-4 py-6 text-center text-gray-500"
            colSpan={role === "assistant" ? 9 : 13}
          >
            Aucun utilisateur
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>


        )}
        {/* 📱 Mobile user cards */}
<div className="md:hidden space-y-4">
  {loading ? (
    <p className="text-center text-gray-500">Chargement…</p>
  ) : filteredUsers.length === 0 ? (
    <p className="text-center text-gray-500">Aucun utilisateur</p>
  ) : (
    filteredUsers.map((u) => (
      <div
        key={u.id}
        className="bg-white rounded-xl shadow border p-4 space-y-3"
      >
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-lg text-blue-700">
              {u.first_name} {u.last_name}
            </p>
            <p className="text-xs text-gray-500">
              {u.role} · {u.signup_type}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {u.has_unpaid && (
              <FaDollarSign
                className="text-red-500"
                title="Facture impayée"
              />
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                u.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {u.is_active ? "Actif" : "Inactif"}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="text-sm space-y-1">
          <p>
            <b>Email:</b>{" "}
            {u.email ? (
              <a
                href={`mailto:${u.email}`}
                className="text-blue-600 underline"
              >
                {u.email}
              </a>
            ) : (
              "—"
            )}
          </p>

          <p>
            <b>Téléphone:</b>{" "}
            {u.phone ? (
              <a
                href={`tel:${u.phone}`}
                className="text-blue-600 underline"
              >
                {u.phone}
              </a>
            ) : (
              "—"
            )}
          </p>

          <p>
            <b>Code parrainage:</b> {u.referral_code || "—"}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => setSelectedUser(u)}
            className="w-full bg-blue-600 text-white py-2 rounded-lg"
          >
            Voir le profil
          </button>

          {role !== "assistant" && (
            <div className="flex gap-2">
              <button
                className="flex-1 border rounded py-2"
                onClick={() => openEdit(u)}
              >
                ✏️ Modifier
              </button>

              <button
                className="flex-1 border rounded py-2 text-red-600"
                onClick={() => handleDelete(u.id)}
              >
                🗑️ Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
    ))
  )}
</div>

      </>
    ) : (
      <AdminUserProfile
  profileId={selectedUser.id}
  onBack={() => setSelectedUser(null)}
  onAddChild={handleAddChild}
/>
    )}
  

      {showForm && (
  <AdminUsersForm
  user={editUser}
  onClose={() => {
    setEditUser(null);      // ✅ clear editUser when closing
    setShowForm(false);
  }}
  onSave={() => {
    setEditUser(null);      // ✅ clear editUser after save too
    setShowForm(false);
    fetchUsers();
  }}
  parentId={formParentId}
/>

)}

    </div>
  );
}
