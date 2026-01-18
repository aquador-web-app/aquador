// src/pages/Club/ClubMemberDashboard.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import useHardBackLock from "../../hooks/useHardBackLock"


function formatDateFR(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR");
}

function statusLabel(status) {
  if (!status) return "Inconnu";
  switch (status) {
    case "pending":
      return "En attente";
    case "active":
      return "Actif";
    case "paused":
      return "Suspendu";
    case "cancelled":
      return "Annulé";
    default:
      return status;
  }
}

export default function ClubMemberDashboard() {
  useHardBackLock()
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [family, setFamily] = useState([]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setErr("");
    setLoading(true);
    try {
      // 1) Get auth user
      const { data: userData, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        console.error(authErr);
        setErr("Erreur d’authentification. Veuillez vous reconnecter.");
        setLoading(false);
        return;
      }

      const uid = userData?.user?.id;
      if (!uid) {
        setErr("Vous devez être connecté pour voir votre profil.");
        setLoading(false);
        // Option: redirect to club login
        window.location.replace("/club/login");
        return;
      }

      // 2) Get club profile for this auth user
      const { data: profData, error: profErr } = await supabase
        .from("club_profiles")
        .select("*")
        .eq("auth_user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (profErr) {
        console.error(profErr);
        if (profErr.code === "PGRST116") {
          // no row
          setErr(
            "Aucun profil de club trouvé pour ce compte. Veuillez compléter l’inscription."
          );
        } else {
          setErr("Erreur lors du chargement de votre profil.");
        }
        setLoading(false);
        return;
      }

      setProfile(profData);

      // 3) Load plan info if plan_code exists
      let planData = null;
      if (profData.plan_code) {
        const { data: planRow, error: planErr } = await supabase
          .from("club_membership_plans")
          .select("*")
          .eq("code", profData.plan_code)
          .maybeSingle();

        if (planErr) {
          console.error(planErr);
        } else {
          planData = planRow;
        }
      }
      setPlan(planData);

      // 4) Load family members
      const { data: famRows, error: famErr } = await supabase
        .from("club_profile_families")
        .select("*")
        .eq("profile_id", profData.id)
        .order("created_at", { ascending: true });

      if (famErr) {
        console.error(famErr);
        // Non-blocking: we still show profile
      } else {
        setFamily(famRows || []);
      }

      setLoading(false);
    } catch (e) {
      console.error(e);
      setErr("Erreur inattendue lors du chargement des données.");
      setLoading(false);
    }
  }

  const spouseRow = family.find((f) => f.relation === "spouse");
  const childrenRows = family.filter((f) => f.relation === "child");

  function membershipTypeLabel() {
    if (!profile) return "";
    if (!profile.is_couple) return "Individuel";
    if (childrenRows.length) return "Famille";
    return "Couple";
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <button
          type="button"
          onClick={() => navigate("/club")}
          className="text-blue-600 underline mb-4"
        >
          ← Retour au Club A'QUA D'OR
        </button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Mon profil de membre</h1>
            <p className="text-sm text-gray-600">
              Consultez vos informations, votre plan et les documents associés.
            </p>
          </div>

          {profile && (
            <span
              className={
                "px-3 py-1 rounded-full text-xs font-semibold " +
                (profile.status === "active"
                  ? "bg-emerald-50 text-emerald-700"
                  : profile.status === "pending"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-gray-100 text-gray-600")
              }
            >
              Statut : {statusLabel(profile.status)}
            </span>
          )}
        </div>

        {loading && <p>Chargement...</p>}

        {err && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {err}
          </div>
        )}

        {!loading && !err && !profile && (
          <p className="text-sm text-gray-700">
            Aucun profil trouvé. Veuillez compléter votre inscription au club.
          </p>
        )}

        {!loading && profile && (
          <div className="space-y-6">
            {/* ---------------------- */}
            {/* Plan & Montants        */}
            {/* ---------------------- */}
            <section className="border rounded-xl p-4 bg-blue-50 border-blue-200">
              <h2 className="font-semibold text-lg mb-2">
                Plan d’adhésion & montant
              </h2>

              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Type d’adhésion
                  </div>
                  <div className="font-semibold">{membershipTypeLabel()}</div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Code du plan
                  </div>
                  <div className="font-mono">
                    {profile.plan_code || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Nom du plan
                  </div>
                  <div className="font-semibold">
                    {plan?.label || plan?.name || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Montant mensuel (total)
                  </div>
                  <div className="font-semibold text-blue-700">
                    {profile.total_monthly_fee_usd != null
                      ? `USD ${profile.total_monthly_fee_usd.toFixed(2)}`
                      : "—"}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Base (plan principal)
                  </div>
                  <div className="text-sm">
                    {profile.base_monthly_fee_usd != null
                      ? `USD ${profile.base_monthly_fee_usd.toFixed(2)}`
                      : "—"}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Date de création du profil
                  </div>
                  <div className="text-sm">
                    {formatDateFR(profile.created_at)}
                  </div>
                </div>
              </div>
            </section>

            {/* ---------------------- */}
            {/* Infos principales      */}
            {/* ---------------------- */}
            <section className="border rounded-xl p-4">
              <h2 className="font-semibold text-lg mb-2">
                Informations personnelles
              </h2>

              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Nom complet
                  </div>
                  <div className="font-semibold">
                    {profile.main_full_name}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Date de naissance
                  </div>
                  <div>{formatDateFR(profile.birth_date)}</div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Email
                  </div>
                  <div>{profile.email || "—"}</div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Téléphone
                  </div>
                  <div>{profile.phone || "—"}</div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-gray-500 text-xs uppercase">
                    Adresse
                  </div>
                  <div>{profile.address || "—"}</div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    NIF / CIN
                  </div>
                  <div>{profile.nif_cin || "—"}</div>
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Pièce d’identité
                  </div>
                  {profile.id_file_url ? (
                    <a
                      href={profile.id_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline text-sm"
                    >
                      Voir le document
                    </a>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>
            </section>

            {/* ---------------------- */}
            {/* Famille                */}
            {/* ---------------------- */}
            {(spouseRow || childrenRows.length > 0) && (
              <section className="border rounded-xl p-4 bg-gray-50">
                <h2 className="font-semibold text-lg mb-2">Famille</h2>

                {/* Spouse */}
                {spouseRow && (
                  <div className="mb-4 border rounded-lg p-3 bg-white">
                    <h3 className="font-semibold text-sm mb-2">
                      Conjoint(e)
                    </h3>
                    <div className="grid md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-gray-500 text-xs uppercase">
                          Nom complet
                        </div>
                        <div>{spouseRow.full_name || "—"}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs uppercase">
                          Date de naissance
                        </div>
                        <div>{formatDateFR(spouseRow.birth_date)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs uppercase">
                          Téléphone
                        </div>
                        <div>{spouseRow.phone || "—"}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs uppercase">
                          NIF / CIN
                        </div>
                        <div>{spouseRow.id_number || "—"}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs uppercase">
                          Pièce d’identité
                        </div>
                        {spouseRow.id_file_url ? (
                          <a
                            href={spouseRow.id_file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 underline text-sm"
                          >
                            Voir le document
                          </a>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Children */}
                {childrenRows.length > 0 && (
                  <div className="border rounded-lg p-3 bg-white">
                    <h3 className="font-semibold text-sm mb-2">Enfants</h3>
                    <div className="space-y-2">
                      {childrenRows.map((child) => (
                        <div
                          key={child.id}
                          className="border rounded-md px-3 py-2 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                        >
                          <div>
                            <div className="font-semibold">
                              {child.full_name}
                            </div>
                            <div className="text-gray-500 text-xs">
                              Date de naissance :{" "}
                              {formatDateFR(child.birth_date)}
                            </div>
                          </div>
                          <div className="text-xs">
                            <span className="text-gray-500 uppercase">
                              Pièce d’identité :{" "}
                            </span>
                            {child.id_file_url ? (
                              <a
                                href={child.id_file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 underline"
                              >
                                Voir le document
                              </a>
                            ) : (
                              <span>Non fournie</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ---------------------- */}
            {/* Documents signés       */}
            {/* ---------------------- */}
            <section className="border rounded-xl p-4">
              <h2 className="font-semibold text-lg mb-2">
                Documents signés
              </h2>

              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Règlements du club
                  </div>
                  {profile.rules_pdf_url ? (
                    <a
                      href={profile.rules_pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Voir le PDF
                    </a>
                  ) : (
                    <span>Non disponible</span>
                  )}
                </div>

                <div>
                  <div className="text-gray-500 text-xs uppercase">
                    Accord / Contrat
                  </div>
                  {profile.accord_pdf_url ? (
                    <a
                      href={profile.accord_pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Voir le PDF
                    </a>
                  ) : (
                    <span>Non disponible</span>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
