import { useState } from "react"
import { supabase } from "../lib/supabaseClient"

export default function CreateAssistantForm() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    can_manage_users: false,
    can_manage_courses: false,
    can_manage_invoices: false,
    can_view_general_reports: false,
    can_view_bulletins: false,
  })

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Étape 1 - Créer un utilisateur dans Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email: form.email,
      password: form.password,
      email_confirm: true,
    })

    if (error) {
      console.error("Erreur création assistante:", error.message)
      alert("❌ Impossible de créer l’assistante")
      return
    }

    const userId = data.user.id

    // Étape 2 - Créer un profil avec rôle assistant et permissions
    const { error: insertError } = await supabase.from("profiles_with_unpaid").insert([
      {
        id: userId,
        role: "assistant",
        first_name: form.first_name,
        last_name: form.last_name,
        can_manage_users: form.can_manage_users,
        can_manage_courses: form.can_manage_courses,
        can_manage_invoices: form.can_manage_invoices,
        can_view_general_reports: form.can_view_general_reports,
        can_view_bulletins: form.can_view_bulletins,
      },
    ])

    if (insertError) {
      console.error("Erreur insertion profil:", insertError.message)
      alert("❌ Profil non créé")
    } else {
      alert("✅ Assistante créée avec succès !")
      setForm({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        can_manage_users: false,
        can_manage_courses: false,
        can_manage_invoices: false,
        can_view_general_reports: false,
        can_view_bulletins: false,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow p-6 rounded space-y-4">
      <h2 className="text-xl font-bold text-aquaBlue">Créer une Assistante</h2>

      <input
        type="text"
        name="first_name"
        placeholder="Prénom"
        value={form.first_name}
        onChange={handleChange}
        className="input w-full"
      />
      <input
        type="text"
        name="last_name"
        placeholder="Nom"
        value={form.last_name}
        onChange={handleChange}
        className="input w-full"
      />
      <input
        type="email"
        name="email"
        placeholder="Email"
        value={form.email}
        onChange={handleChange}
        className="input w-full"
      />
      <input
        type="password"
        name="password"
        placeholder="Mot de passe"
        value={form.password}
        onChange={handleChange}
        className="input w-full"
      />

      <h3 className="font-semibold mt-4">Permissions</h3>
      <label className="block"><input type="checkbox" name="can_manage_users" checked={form.can_manage_users} onChange={handleChange} /> 👥 Gérer utilisateurs</label>
      <label className="block"><input type="checkbox" name="can_manage_courses" checked={form.can_manage_courses} onChange={handleChange} /> 📚 Gérer cours</label>
      <label className="block"><input type="checkbox" name="can_manage_invoices" checked={form.can_manage_invoices} onChange={handleChange} /> 💳 Gérer factures</label>
      <label className="block"><input type="checkbox" name="can_view_general_reports" checked={form.can_view_general_reports} onChange={handleChange} /> 📊 Voir rapports généraux</label>
      <label className="block"><input type="checkbox" name="can_view_bulletins" checked={form.can_view_bulletins} onChange={handleChange} /> 📝 Voir bulletins & fiches</label>

      <button type="submit" className="bg-aquaBlue text-white px-4 py-2 rounded hover:bg-blue-600">
        Créer l’Assistante
      </button>
    </form>
  )
}
