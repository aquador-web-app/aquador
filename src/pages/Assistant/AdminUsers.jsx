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
  const [sortAZ, setSortAZ] = useState("asc");
  const [formParentId, setFormParentId] = useState(null);


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
    const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
    const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
    if (sortAZ === "asc") return nameA.localeCompare(nameB);
    else return nameB.localeCompare(nameA);
  });

  
  async function fetchUsers() {
  setLoading(true);

  const { data, error } = await supabase
    .from("profiles_with_unpaid")
    .select("id, first_name, middle_name, last_name, email, phone, role, is_active, signup_type, referral_code, address, sex, birth_date,has_unpaid")
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
    <button
      onClick={() => setSortAZ(sortAZ === "asc" ? "desc" : "asc")}
      className="bg-gray-200 px-3 py-1 rounded"
    >
      {sortAZ === "asc" ? "A → Z" : "Z → A"}
    </button>

    {/* Create Button */}
    <button
      onClick={openCreate}
      className="bg-aquaBlue text-white px-4 py-2 rounded hover:bg-blue-600"
    >
      + Créer un utilisateur
    </button>
  </div>
</div>


      {loading ? (
        <p>Chargement...</p>
      ) : (
        <div className="overflow-x-auto bg-white border rounded shadow">
  <table className="min-w-[1400px] table-fixed"> {/* force overall width + fixed layout */}
    {/* 1) Control widths here, once, for the whole table */}
    <colgroup>
      <col className="w-[140px]" /> {/* Prénom */}
      <col className="w-[120px]" /> {/* 2e Prénom */}
      <col className="w-[160px]" /> {/* Nom */}
      <col className="w-[150px]" /> {/* Date de naissance */}
      <col className="w-[100px]" /> {/* Sexe */}
      <col className="w-[240px]" /> {/* Email */}
      <col className="w-[150px]" /> {/* Téléphone */}
      <col className="w-[320px]" /> {/* Adresse */}
      <col className="w-[170px]" /> {/* Type d'Inscription */}
      <col className="w-[150px]" /> {/* Rôle */}
      <col className="w-[170px]" /> {/* Code de Parrainage */}
      <col className="w-[120px]" /> {/* Statut */}
      <col className="w-[120px]" /> {/* Actions */}
    </colgroup>

    <thead className="bg-aquaBlue text-white">
      <tr>
        <th className="px-4 py-2 text-left whitespace-nowrap">Prénom</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">2e Prénom</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Nom</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Date de naissance</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Sexe</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Email</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Téléphone</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Adresse</th>
        <th className="px-8 py-2 text-left whitespace-nowrap">Type d'Inscription</th>
        <th className="px-16 py-2 text-left whitespace-nowrap">Rôle</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Code de Parrainage</th>
        <th className="px-4 py-2 text-left whitespace-nowrap">Statut</th>
        <th className="px-4 py-2 text-center whitespace-nowrap">Actions</th>
      </tr>
    </thead>

    <tbody>
      {filteredUsers.map((u) => (
        <tr 
        key={u.id} 
        className="border-t hover:bg-blue-50"
        onClick={() => setSelectedUser(u)}  // 👈 add this
        >
          {/* 2) Control wrapping/truncation per cell if needed */}
          <td className="px-4 py-2 whitespace-nowrap">{u.first_name || "—"}</td>
          <td className="px-4 py-2 whitespace-nowrap">{u.middle_name || "—"}</td>
          <td className="px-4 py-2 whitespace-nowrap flex items-center gap-1">
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

          {/* Long strings: either wrap with break-words or enforce ellipsis */}
          <td className="px-4 py-2 break-words">{u.email || "—"}</td>
          {/* OR: truncate with ellipsis */}
          {/* <td className="px-4 py-2 truncate max-w-[220px]">{u.email || "—"}</td> */}

          <td className="px-4 py-2 whitespace-nowrap">{u.phone || "—"}</td>

          {/* Adresse: allow multi-line wrapping */}
          <td className="px-4 py-2 break-words whitespace-nowrap">{u.address || "—"}</td>

          <td className="px-4 py-2 whitespace-nowrap">
            <select
              className="border rounded px-2 py-1 w-full whitespace-nowrap"
              value={u.signup_type || "me "}
              onClick={stop}
              onChange={(e) => updateSignupType(u.id, e.target.value)}
              disabled={savingRow === u.id}
            >
              <option value="me">Moi seulement</option>
              <option value="me_student">Moi + enfants</option>
              <option value="children_only">Enfants seulement</option>
              <option value="child">Enfant</option>
            </select>
          </td>

          <td className="px-4 py-2">
            <select
              className="border rounded px-2 py-1 w-full whitespace-nowrap"
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
          </td>

          <td className="px-4 py-2 text-center whitespace-nowrap">{u.referral_code || "—"}</td>

          {/* Active toggle (manual) */} 
          <td className="px-4 py-2"> 
            <label className="inline-flex items-center gap-2 cursor-pointer"> 
              <input type="checkbox" className="h-4 w-4" 
              checked={!!u.is_active} 
              onClick={stop}
              onChange={() => toggleActive(u.id, !!u.is_active)} 
              disabled={savingRow === u.id} />
            <span className={u.is_active ? "text-green-600" : "text-red-600"}> {u.is_active ? "Actif" : "Inactif"} </span> </label> </td>

          <td className="px-4 py-2 space-x-2 whitespace-nowrap">
            <button className="px-2 py-0.5 border rounded" onClick={(e) => { stop(e); openEdit(u); }}>✏️</button>
            <button className="px-2 py-0.5 border rounded text-red-600" onClick={(e) => { stop(e); handleDelete(u.id); }}>🗑️</button>
          </td>
        </tr>
      ))}

      {users.length === 0 && (
        <tr>
          <td className="px-4 py-6 text-center text-gray-500" colSpan={13}>
            Aucun utilisateur
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
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
