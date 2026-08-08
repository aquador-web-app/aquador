import { useEffect, useMemo, useState } from "react";
import {
  FaCheck,
  FaEdit,
  FaImage,
  FaPlus,
  FaPowerOff,
  FaSave,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { supabase } from "../../../lib/supabaseClient";

const EMPTY_SERVICE_FORM = {
  id: null,
  name: "",
  slug: "",
  short_description: "",
  full_description: "",
  image_url: "",
  benefits: "",
  recommended_for: "",
  icon: "💆",
  is_active: true,
  sort_order: 0,
};

const EMPTY_OPTION_FORM = {
  id: null,
  duration_minutes: "",
  price_usd: "",
  is_active: true,
  sort_order: 0,
};

function formatMoney(value) {
  return `USD ${Number(value || 0).toFixed(2)}`;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textToList(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminSpaServices() {
  const [services, setServices] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [serviceModalOpen, setServiceModalOpen] =
    useState(false);

  const [optionModalService, setOptionModalService] =
    useState(null);

  const [serviceForm, setServiceForm] = useState(
    EMPTY_SERVICE_FORM
  );

  const [optionForm, setOptionForm] = useState(
    EMPTY_OPTION_FORM
  );

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadServices();
  }, []);

  const summary = useMemo(() => {
    const active = services.filter(
      (service) => service.is_active
    ).length;

    const options = services.reduce(
      (total, service) =>
        total + Number(service.options?.length || 0),
      0
    );

    return {
      total: services.length,
      active,
      inactive: services.length - active,
      options,
    };
  }, [services]);

  async function loadServices() {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("massage_services")
        .select(`
          id,
          name,
          slug,
          short_description,
          full_description,
          image_url,
          benefits,
          recommended_for,
          icon,
          is_active,
          sort_order,
          created_at,
          updated_at,
          massage_service_options (
            id,
            service_id,
            duration_minutes,
            price_usd,
            is_active,
            sort_order,
            created_at,
            updated_at
          )
        `)
        .order("sort_order", {
          ascending: true,
        })
        .order("name", {
          ascending: true,
        });

      if (error) throw error;

      const formatted = (data || []).map((service) => ({
        ...service,
        options: (
          service.massage_service_options || []
        ).sort(
          (a, b) =>
            Number(a.sort_order || 0) -
              Number(b.sort_order || 0) ||
            Number(a.duration_minutes || 0) -
              Number(b.duration_minutes || 0)
        ),
      }));

      setServices(formatted);
    } catch (error) {
      console.error(
        "Erreur chargement services Spa :",
        error
      );

      setServices([]);

      setErrorMessage(
        error?.message ||
          "Impossible de charger les services Spa."
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreateService() {
    setServiceForm({
      ...EMPTY_SERVICE_FORM,
      sort_order: services.length + 1,
    });

    setServiceModalOpen(true);
    setErrorMessage("");
    setMessage("");
  }

  function openEditService(service) {
    setServiceForm({
      id: service.id,
      name: service.name || "",
      slug: service.slug || "",
      short_description:
        service.short_description || "",
      full_description:
        service.full_description || "",
      image_url: service.image_url || "",
      benefits: service.benefits || "",
      recommended_for:
        service.recommended_for || "",
      icon: service.icon || "💆",
      is_active: Boolean(service.is_active),
      sort_order: Number(service.sort_order || 0),
    });

    setServiceModalOpen(true);
    setErrorMessage("");
    setMessage("");
  }

  function updateServiceForm(field, value) {
    setServiceForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveService(event) {
    event.preventDefault();

    const name = serviceForm.name.trim();
    const slug =
      serviceForm.slug.trim() || slugify(name);

    if (!name) {
      setErrorMessage(
        "Veuillez entrer le nom du service."
      );
      return;
    }

    if (!slug) {
      setErrorMessage(
        "Impossible de générer le slug du service."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    const payload = {
      name,
      slug,
      short_description:
        serviceForm.short_description.trim() ||
        null,
      full_description:
        serviceForm.full_description.trim() ||
        null,
      image_url:
        serviceForm.image_url.trim() || null,
      benefits:
        serviceForm.benefits.trim() || null,
      recommended_for:
        serviceForm.recommended_for.trim() ||
        null,
      icon:
        serviceForm.icon.trim() || "💆",
      is_active: Boolean(
        serviceForm.is_active
      ),
      sort_order: Number(
        serviceForm.sort_order || 0
      ),
      updated_at: new Date().toISOString(),
    };

    try {
      if (serviceForm.id) {
        const { error } = await supabase
          .from("massage_services")
          .update(payload)
          .eq("id", serviceForm.id);

        if (error) throw error;

        setMessage(
          "Le service a été modifié avec succès."
        );
      } else {
        const { error } = await supabase
          .from("massage_services")
          .insert(payload);

        if (error) throw error;

        setMessage(
          "Le service a été ajouté avec succès."
        );
      }

      setServiceModalOpen(false);
      setServiceForm(EMPTY_SERVICE_FORM);

      await loadServices();
    } catch (error) {
      console.error(
        "Erreur sauvegarde service Spa :",
        error
      );

      setErrorMessage(
        error?.code === "23505"
          ? "Un service utilise déjà ce slug."
          : error?.message ||
              "Impossible d’enregistrer le service."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleService(service) {
    const nextActive = !service.is_active;

    const confirmation = window.confirm(
      nextActive
        ? `Réactiver le service « ${service.name} » ?`
        : `Désactiver le service « ${service.name} » ? Il ne sera plus proposé aux clients.`
    );

    if (!confirmation) return;

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("massage_services")
        .update({
          is_active: nextActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", service.id);

      if (error) throw error;

      setMessage(
        nextActive
          ? "Le service a été réactivé."
          : "Le service a été désactivé."
      );

      await loadServices();
    } catch (error) {
      console.error(
        "Erreur changement statut service :",
        error
      );

      setErrorMessage(
        error?.message ||
          "Impossible de modifier le statut du service."
      );
    } finally {
      setSaving(false);
    }
  }

  function openOptionsModal(service) {
    setOptionModalService(service);
    setOptionForm({
      ...EMPTY_OPTION_FORM,
      sort_order:
        Number(service.options?.length || 0) +
        1,
    });

    setErrorMessage("");
    setMessage("");
  }

  function openEditOption(option) {
    setOptionForm({
      id: option.id,
      duration_minutes:
        option.duration_minutes,
      price_usd: option.price_usd,
      is_active: Boolean(option.is_active),
      sort_order: Number(
        option.sort_order || 0
      ),
    });
  }

  function resetOptionForm() {
    setOptionForm({
      ...EMPTY_OPTION_FORM,
      sort_order:
        Number(
          optionModalService?.options?.length ||
            0
        ) + 1,
    });
  }

  async function saveOption(event) {
    event.preventDefault();

    if (!optionModalService?.id) return;

    const duration = Number(
      optionForm.duration_minutes
    );

    const price = Number(
      optionForm.price_usd
    );

    if (
      !Number.isInteger(duration) ||
      duration <= 0
    ) {
      setErrorMessage(
        "Veuillez entrer une durée valide."
      );
      return;
    }

    if (
      Number.isNaN(price) ||
      price < 0
    ) {
      setErrorMessage(
        "Veuillez entrer un prix valide."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    const payload = {
      service_id: optionModalService.id,
      duration_minutes: duration,
      price_usd: price,
      is_active: Boolean(
        optionForm.is_active
      ),
      sort_order: Number(
        optionForm.sort_order || 0
      ),
      updated_at: new Date().toISOString(),
    };

    try {
      if (optionForm.id) {
        const { error } = await supabase
          .from("massage_service_options")
          .update(payload)
          .eq("id", optionForm.id);

        if (error) throw error;

        setMessage(
          "La durée et le prix ont été modifiés."
        );
      } else {
        const { error } = await supabase
          .from("massage_service_options")
          .insert(payload);

        if (error) throw error;

        setMessage(
          "La durée et le prix ont été ajoutés."
        );
      }

      resetOptionForm();
      await loadServices();

      const { data, error } = await supabase
        .from("massage_services")
        .select(`
          id,
          name,
          slug,
          short_description,
          full_description,
          image_url,
          benefits,
          recommended_for,
          icon,
          is_active,
          sort_order,
          massage_service_options (
            id,
            service_id,
            duration_minutes,
            price_usd,
            is_active,
            sort_order
          )
        `)
        .eq("id", optionModalService.id)
        .single();

      if (error) throw error;

      setOptionModalService({
        ...data,
        options: (
          data.massage_service_options || []
        ).sort(
          (a, b) =>
            Number(a.sort_order || 0) -
              Number(b.sort_order || 0) ||
            Number(a.duration_minutes || 0) -
              Number(b.duration_minutes || 0)
        ),
      });
    } catch (error) {
      console.error(
        "Erreur sauvegarde option Spa :",
        error
      );

      setErrorMessage(
        error?.code === "23505"
          ? "Cette durée existe déjà pour ce service."
          : error?.message ||
              "Impossible d’enregistrer cette option."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleOption(option) {
    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("massage_service_options")
        .update({
          is_active: !option.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", option.id);

      if (error) throw error;

      setMessage(
        option.is_active
          ? "L’option a été désactivée."
          : "L’option a été réactivée."
      );

      await refreshOptionModal();
      await loadServices();
    } catch (error) {
      console.error(
        "Erreur statut option :",
        error
      );

      setErrorMessage(
        error?.message ||
          "Impossible de modifier cette option."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteOption(option) {
    const confirmation = window.confirm(
      `Supprimer définitivement l’option ${option.duration_minutes} minutes ?`
    );

    if (!confirmation) return;

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("massage_service_options")
        .delete()
        .eq("id", option.id);

      if (error) throw error;

      setMessage(
        "L’option a été supprimée."
      );

      await refreshOptionModal();
      await loadServices();
    } catch (error) {
      console.error(
        "Erreur suppression option :",
        error
      );

      setErrorMessage(
        error?.code === "23503"
          ? "Cette option est déjà utilisée dans une réservation. Désactivez-la au lieu de la supprimer."
          : error?.message ||
              "Impossible de supprimer cette option."
      );
    } finally {
      setSaving(false);
    }
  }

  async function refreshOptionModal() {
    if (!optionModalService?.id) return;

    const { data, error } = await supabase
      .from("massage_services")
      .select(`
        id,
        name,
        slug,
        short_description,
        full_description,
        image_url,
        benefits,
        recommended_for,
        icon,
        is_active,
        sort_order,
        massage_service_options (
          id,
          service_id,
          duration_minutes,
          price_usd,
          is_active,
          sort_order
        )
      `)
      .eq("id", optionModalService.id)
      .single();

    if (error) throw error;

    setOptionModalService({
      ...data,
      options: (
        data.massage_service_options || []
      ).sort(
        (a, b) =>
          Number(a.sort_order || 0) -
            Number(b.sort_order || 0) ||
          Number(a.duration_minutes || 0) -
            Number(b.duration_minutes || 0)
      ),
    });
  }

  return (
    <div className="mx-auto max-w-[1700px] px-3 py-4 sm:px-4 lg:px-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-500">
            A&apos;QUA D&apos;OR SPA
          </p>

          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            Services de massage
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Gérez les massages affichés sur le
            portail client, leurs descriptions,
            durées et tarifs.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateService}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-aquaBlue px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          <FaPlus />
          Ajouter un service
        </button>
      </div>

      {(message || errorMessage) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            errorMessage
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {errorMessage || message}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Services"
          value={summary.total}
        />

        <SummaryCard
          label="Actifs"
          value={summary.active}
        />

        <SummaryCard
          label="Inactifs"
          value={summary.inactive}
        />

        <SummaryCard
          label="Options tarifaires"
          value={summary.options}
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500 shadow-sm">
          Chargement des services...
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
          <div className="text-5xl">💆</div>

          <h2 className="mt-4 text-xl font-bold text-gray-900">
            Aucun service enregistré
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            Ajoutez votre premier massage pour
            qu’il apparaisse sur le portail client.
          </p>

          <button
            type="button"
            onClick={openCreateService}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-aquaBlue px-5 py-2.5 text-sm font-semibold text-white"
          >
            <FaPlus />
            Ajouter un service
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              saving={saving}
              onEdit={() =>
                openEditService(service)
              }
              onManageOptions={() =>
                openOptionsModal(service)
              }
              onToggle={() =>
                toggleService(service)
              }
            />
          ))}
        </div>
      )}

      {serviceModalOpen && (
        <ServiceModal
          form={serviceForm}
          saving={saving}
          onClose={() =>
            setServiceModalOpen(false)
          }
          onChange={updateServiceForm}
          onSubmit={saveService}
        />
      )}

      {optionModalService && (
        <OptionsModal
          service={optionModalService}
          form={optionForm}
          saving={saving}
          onClose={() => {
            setOptionModalService(null);
            setOptionForm(
              EMPTY_OPTION_FORM
            );
          }}
          onChange={(field, value) =>
            setOptionForm((current) => ({
              ...current,
              [field]: value,
            }))
          }
          onSubmit={saveOption}
          onEdit={openEditOption}
          onReset={resetOptionForm}
          onToggle={toggleOption}
          onDelete={deleteOption}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold text-gray-900">
        {value}
      </p>
    </div>
  );
}

function ServiceCard({
  service,
  saving,
  onEdit,
  onManageOptions,
  onToggle,
}) {
  const benefits = textToList(
    service.benefits
  );

  const recommendedFor = textToList(
    service.recommended_for
  );

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      {service.image_url ? (
        <img
          src={service.image_url}
          alt={service.name}
          className="h-52 w-full object-cover"
        />
      ) : (
        <div className="flex h-52 items-center justify-center bg-gradient-to-br from-stone-200 to-amber-100 text-6xl">
          {service.icon || "💆"}
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Ordre {service.sort_order}
            </p>

            <h2 className="mt-1 text-xl font-bold text-stone-900">
              {service.name}
            </h2>
          </div>

          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              service.is_active
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-gray-100 text-gray-600"
            }`}
          >
            {service.is_active
              ? "Actif"
              : "Inactif"}
          </span>
        </div>

        <p className="mt-3 min-h-[60px] text-sm leading-relaxed text-stone-600">
          {service.short_description ||
            "Aucune description courte."}
        </p>

        {benefits.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-bold text-stone-900">
              Bienfaits
            </p>

            <ul className="mt-2 space-y-1.5">
              {benefits
                .slice(0, 4)
                .map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-start gap-2 text-sm text-stone-600"
                  >
                    <FaCheck className="mt-1 shrink-0 text-emerald-600" />
                    <span>{benefit}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {recommendedFor.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-bold text-stone-900">
              Recommandé pour
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {recommendedFor.map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <p className="text-sm font-bold text-stone-900">
            Durées et tarifs
          </p>

          {service.options?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {service.options.map((option) => (
                <span
                  key={option.id}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    option.is_active
                      ? "border-stone-200 bg-stone-100 text-stone-700"
                      : "border-red-200 bg-red-50 text-red-600 line-through"
                  }`}
                >
                  {option.duration_minutes} min ·{" "}
                  {formatMoney(
                    option.price_usd
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-red-600">
              Aucun tarif configuré.
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={onEdit}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            <FaEdit />
            Modifier
          </button>

          <button
            type="button"
            onClick={onManageOptions}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
          >
            <FaPlus />
            Tarifs
          </button>

          <button
            type="button"
            onClick={onToggle}
            disabled={saving}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
              service.is_active
                ? "bg-red-700 hover:bg-red-800"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            <FaPowerOff />
            {service.is_active
              ? "Désactiver"
              : "Activer"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ServiceModal({
  form,
  saving,
  onClose,
  onChange,
  onSubmit,
}) {
  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/60 p-3 sm:p-5">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 bg-gray-50 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
              Service Spa
            </p>

            <h2 className="mt-1 text-xl font-bold text-gray-900">
              {form.id
                ? "Modifier le service"
                : "Ajouter un service"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-xl text-gray-500 hover:bg-gray-200"
          >
            <FaTimes />
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-6 p-5 sm:p-6"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Nom du service *"
              value={form.name}
              onChange={(event) => {
                const name =
                  event.target.value;

                onChange("name", name);

                if (!form.id) {
                  onChange(
                    "slug",
                    slugify(name)
                  );
                }
              }}
              placeholder="Massage relaxant"
              required
            />

            <TextField
              label="Slug *"
              value={form.slug}
              onChange={(event) =>
                onChange(
                  "slug",
                  slugify(
                    event.target.value
                  )
                )
              }
              placeholder="massage-relaxant"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-[140px_1fr_160px]">
            <TextField
              label="Icône"
              value={form.icon}
              onChange={(event) =>
                onChange(
                  "icon",
                  event.target.value
                )
              }
              placeholder="💆"
            />

            <TextField
              label="URL de l’image"
              value={form.image_url}
              onChange={(event) =>
                onChange(
                  "image_url",
                  event.target.value
                )
              }
              placeholder="https://..."
            />

            <TextField
              label="Ordre d’affichage"
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(event) =>
                onChange(
                  "sort_order",
                  event.target.value
                )
              }
            />
          </div>

          {form.image_url ? (
            <img
              src={form.image_url}
              alt="Aperçu"
              className="h-52 w-full rounded-2xl border border-gray-200 object-cover"
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-5xl">
              {form.icon || (
                <FaImage />
              )}
            </div>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700">
              Description courte
            </span>

            <textarea
              rows={3}
              value={form.short_description}
              onChange={(event) =>
                onChange(
                  "short_description",
                  event.target.value
                )
              }
              placeholder="Description affichée directement sur la carte du service."
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700">
              Description complète
            </span>

            <textarea
              rows={6}
              value={form.full_description}
              onChange={(event) =>
                onChange(
                  "full_description",
                  event.target.value
                )
              }
              placeholder="Expliquez le déroulement du massage, la pression utilisée et l’expérience proposée."
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">
                Bienfaits
              </span>

              <textarea
                rows={6}
                value={form.benefits}
                onChange={(event) =>
                  onChange(
                    "benefits",
                    event.target.value
                  )
                }
                placeholder={`Réduit le stress
Soulage les tensions musculaires
Favorise la relaxation`}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
              />

              <p className="mt-1 text-xs text-gray-500">
                Un bienfait par ligne.
              </p>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">
                Recommandé pour
              </span>

              <textarea
                rows={6}
                value={form.recommended_for}
                onChange={(event) =>
                  onChange(
                    "recommended_for",
                    event.target.value
                  )
                }
                placeholder={`Stress
Fatigue
Débutants
Travailleurs de bureau`}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
              />

              <p className="mt-1 text-xs text-gray-500">
                Une catégorie par ligne.
              </p>
            </label>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) =>
                onChange(
                  "is_active",
                  event.target.checked
                )
              }
              className="h-4 w-4"
            />

            <span>
              <span className="block font-semibold text-gray-900">
                Service actif
              </span>

              <span className="block text-sm text-gray-500">
                Le service sera visible et
                sélectionnable sur le portail
                client.
              </span>
            </span>
          </label>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-aquaBlue px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <FaSave />
              {saving
                ? "Enregistrement..."
                : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OptionsModal({
  service,
  form,
  saving,
  onClose,
  onChange,
  onSubmit,
  onEdit,
  onReset,
  onToggle,
  onDelete,
}) {
  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/60 p-3 sm:p-5">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 bg-gray-50 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
              Durées et tarifs
            </p>

            <h2 className="mt-1 text-xl font-bold text-gray-900">
              {service.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-xl text-gray-500 hover:bg-gray-200"
          >
            <FaTimes />
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-blue-100 bg-blue-50 p-4"
          >
            <h3 className="font-bold text-blue-900">
              {form.id
                ? "Modifier l’option"
                : "Ajouter une option"}
            </h3>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TextField
                label="Durée (minutes)"
                type="number"
                min="1"
                step="1"
                value={form.duration_minutes}
                onChange={(event) =>
                  onChange(
                    "duration_minutes",
                    event.target.value
                  )
                }
                required
              />

              <TextField
                label="Prix USD"
                type="number"
                min="0"
                step="0.01"
                value={form.price_usd}
                onChange={(event) =>
                  onChange(
                    "price_usd",
                    event.target.value
                  )
                }
                required
              />

              <TextField
                label="Ordre"
                type="number"
                min="0"
                value={form.sort_order}
                onChange={(event) =>
                  onChange(
                    "sort_order",
                    event.target.value
                  )
                }
              />

              <label className="flex items-end">
                <span className="flex w-full items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) =>
                      onChange(
                        "is_active",
                        event.target.checked
                      )
                    }
                  />

                  <span className="text-sm font-semibold text-gray-700">
                    Active
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <FaSave />
                {form.id
                  ? "Enregistrer les changements"
                  : "Ajouter l’option"}
              </button>

              {form.id && (
                <button
                  type="button"
                  onClick={onReset}
                  disabled={saving}
                  className="rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700"
                >
                  Annuler la modification
                </button>
              )}
            </div>
          </form>

          <div>
            <h3 className="mb-3 text-lg font-bold text-gray-900">
              Options existantes
            </h3>

            {!service.options?.length ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
                Aucune durée configurée.
              </div>
            ) : (
              <div className="space-y-3">
                {service.options.map((option) => (
                  <div
                    key={option.id}
                    className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-bold text-gray-900">
                        {option.duration_minutes}{" "}
                        minutes
                      </p>

                      <p className="mt-1 text-sm font-semibold text-amber-700">
                        {formatMoney(
                          option.price_usd
                        )}
                      </p>

                      <span
                        className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          option.is_active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 bg-gray-100 text-gray-600"
                        }`}
                      >
                        {option.is_active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onEdit(option)
                        }
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <FaEdit />
                        Modifier
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onToggle(option)
                        }
                        disabled={saving}
                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white ${
                          option.is_active
                            ? "bg-orange-600"
                            : "bg-emerald-600"
                        }`}
                      >
                        <FaPowerOff />
                        {option.is_active
                          ? "Désactiver"
                          : "Activer"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onDelete(option)
                        }
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white"
                      >
                        <FaTrash />
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  type = "text",
  ...props
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-700">
        {label}
      </span>

      <input
        type={type}
        {...props}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-aquaBlue focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}