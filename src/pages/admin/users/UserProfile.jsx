import { useRouter } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function UserProfile() {
  const router = useRouter();
  const { id } = router.query;
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!id) return;
    async function loadUser() {
      const { data, error } = await supabase
        .from("profiles_with_unpaid")
        .select("*, invoices(*), enrollments(*), children:profiles!parent_id(*)")
        .eq("id", id)
        .single();
      if (!error) setUser(data);
    }
    loadUser();
  }, [id]);

  if (!user) return <p>Chargement...</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        Profil de {user.first_name} {user.last_name}
      </h1>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="font-bold">Infos personnelles</h2>
          <p>Email: {user.email}</p>
          <p>Téléphone: {user.phone}</p>
          <p>Adresse: {user.address}</p>
          <p>Sexe: {user.sex}</p>
        </div>

        <div>
          <h2 className="font-bold">Statut</h2>
          <p>{user.is_active ? "Actif" : "Inactif"}</p>
          <p>Code parrainage: {user.referral_code}</p>
        </div>
      </div>

      <h2 className="font-bold mt-6">Factures</h2>
      <ul>
        {user.invoices?.map((inv) => (
          <li key={inv.id}>
            {inv.invoice_no} – {inv.total} USD – {inv.status}
          </li>
        ))}
      </ul>

      <h2 className="font-bold mt-6">Élèves liés</h2>
      <ul>
        {user.children?.map((c) => (
          <li key={c.id}>
            {c.first_name} {c.last_name}
          </li>
        ))}
      </ul>
    </div>
  );
}
