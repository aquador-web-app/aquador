import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

const TABLE_NAME = "spa_invoice_template";

const TEMPLATE_TOKENS = [
  "{{logo_url}}",
  "{{signature_url}}",
  "{{doc_title}}",
  "{{invoice_no}}",
  "{{issued_at}}",
  "{{client_name}}",
  "{{client_phone}}",
  "{{client_email}}",
  "{{people_count}}",
  "{{payment_reference}}",
  "{{appointment_date}}",
  "{{appointment_time}}",
  "{{reservation_status}}",
  "{{items}}",
  "{{subtotal}}",
  "{{discount}}",
  "{{total}}",
  "{{paid_total}}",
  "{{balance_due}}",
  "{{payment_status}}",
  "{{payments_section}}",
];

const SAMPLE_VALUES = {
  "{{logo_url}}": "/logo/aquador.png",
  "{{signature_url}}": "/assets/signature.png",

  // The HTML already adds “– A'QUA D'OR SPA”.
  "{{doc_title}}": "Reçu",

  "{{invoice_no}}": "SPA-20260725-A1B2C3D4",
  "{{issued_at}}": "25 juillet 2026",
  "{{client_name}}": "David Emmanuel Adrien",
  "{{client_phone}}": "+509 3891-2429",
  "{{client_email}}": "david@example.com",
  "{{people_count}}": "2",
  "{{payment_reference}}": "MC-859743",
  "{{appointment_date}}": "27 juillet 2026",
  "{{appointment_time}}": "10:00",
  "{{reservation_status}}": "Confirmée",

  "{{subtotal}}": "150.00",
  "{{discount}}": "0.00",
  "{{total}}": "150.00",
  "{{paid_total}}": "50.00",
  "{{balance_due}}": "100.00",
  "{{payment_status}}": "Partiellement payée",

 "{{items}}": `
  <tr>
    <td>
      <div class="service-name">
        Massage suédois
      </div>
    </td>

    <td class="beneficiary">
      David Emmanuel Adrien
    </td>

    <td class="duration">
      60 minutes
    </td>

    <td class="amount">
      USD 75.00
    </td>
  </tr>

  <tr>
    <td>
      <div class="service-name">
        Massage aux pierres chaudes
      </div>
    </td>

    <td class="beneficiary">
      Ishida Mardelle Désir Adrien
    </td>

    <td class="duration">
      60 minutes
    </td>

    <td class="amount">
      USD 75.00
    </td>
  </tr>
`,

  "{{payments_section}}": `
    <div class="payments">
      <h3>Paiements enregistrés</h3>

      <table class="payments">
        <thead>
          <tr>
            <th>Date</th>
            <th>Méthode</th>
            <th>Référence</th>
            <th>Montant</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>25 juillet 2026</td>
            <td>MonCash</td>
            <td>MC-859743</td>
            <td>USD 50.00</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
};

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Port-au-Prince",
  }).format(date);
}

function compilePreview(template) {
  let result = String(template || "");

  for (const [token, value] of Object.entries(SAMPLE_VALUES)) {
    result = result.replaceAll(token, value);
  }

  result = result
    .replace(/{{#if[^}]*}}/g, "")
    .replace(/{{\/if}}/g, "")
    .replace(/{{[^{}]+}}/g, "");

  return result;
}

export default function AdminSpaInvoiceTemplates() {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");

  const [name, setName] = useState("");
  const [htmlTemplate, setHtmlTemplate] = useState("");
  const [isActive, setIsActive] = useState(false);

  const [activeView, setActiveView] = useState("editor");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedToken, setCopiedToken] = useState("");

  const selectedTemplate = useMemo(
    () =>
      templates.find(
        (template) => String(template.id) === String(selectedId)
      ) || null,
    [templates, selectedId]
  );

  const previewHtml = useMemo(
    () => compilePreview(htmlTemplate),
    [htmlTemplate]
  );

  const hasChanges = useMemo(() => {
    if (!selectedTemplate) {
      return Boolean(name.trim() || htmlTemplate.trim());
    }

    return (
      name !== (selectedTemplate.name || "") ||
      htmlTemplate !== (selectedTemplate.html_template || "") ||
      isActive !== Boolean(selectedTemplate.is_active)
    );
  }, [
    selectedTemplate,
    name,
    htmlTemplate,
    isActive,
  ]);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!selectedTemplate) return;

    setName(selectedTemplate.name || "");
    setHtmlTemplate(selectedTemplate.html_template || "");
    setIsActive(Boolean(selectedTemplate.is_active));
    setMessage("");
    setErrorMessage("");
  }, [selectedTemplate]);

  async function loadTemplates(preferredId = null) {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select(`
          id,
          name,
          html_template,
          is_active,
          created_at,
          updated_at
        `)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const rows = data || [];

      setTemplates(rows);

      const targetId =
        preferredId &&
        rows.some(
          (template) =>
            String(template.id) === String(preferredId)
        )
          ? preferredId
          : rows.find((template) => template.is_active)?.id ||
            rows[0]?.id ||
            "";

      setSelectedId(targetId);

      if (!rows.length) {
        resetEditor();
      }
    } catch (error) {
      console.error(
        "Erreur chargement templates Spa :",
        error
      );

      setTemplates([]);
      setErrorMessage(
        error?.message ||
          "Impossible de charger les templates Spa."
      );
    } finally {
      setLoading(false);
    }
  }

  function resetEditor() {
    setSelectedId("");
    setName("Nouveau template Spa");
    setHtmlTemplate("");
    setIsActive(false);
    setMessage("");
    setErrorMessage("");
  }

  function selectTemplate(id) {
    if (
      hasChanges &&
      !window.confirm(
        "Les modifications non enregistrées seront perdues. Continuer ?"
      )
    ) {
      return;
    }

    setSelectedId(id);
  }

  async function saveTemplate() {
    if (!name.trim()) {
      setErrorMessage(
        "Veuillez entrer un nom pour le template."
      );
      return;
    }

    if (!htmlTemplate.trim()) {
      setErrorMessage(
        "Le contenu HTML du template est vide."
      );
      return;
    }

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      let savedTemplate;

      if (selectedId) {
        const { data, error } = await supabase
          .from(TABLE_NAME)
          .update({
            name: name.trim(),
            html_template: htmlTemplate,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedId)
          .select()
          .single();

        if (error) throw error;

        savedTemplate = data;
      } else {
        const { data, error } = await supabase
          .from(TABLE_NAME)
          .insert({
            name: name.trim(),
            html_template: htmlTemplate,
            is_active: isActive,
          })
          .select()
          .single();

        if (error) throw error;

        savedTemplate = data;
      }

      if (isActive && savedTemplate?.id) {
        const { error: deactivateError } = await supabase
          .from(TABLE_NAME)
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .neq("id", savedTemplate.id)
          .eq("is_active", true);

        if (deactivateError) throw deactivateError;
      }

      await loadTemplates(savedTemplate.id);

      setMessage("Template Spa enregistré avec succès.");
    } catch (error) {
      console.error(
        "Erreur sauvegarde template Spa :",
        error
      );

      setErrorMessage(
        error?.message ||
          "Impossible d’enregistrer le template."
      );
    } finally {
      setSaving(false);
    }
  }

  async function activateTemplate(templateId) {
    if (!templateId) return;

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const now = new Date().toISOString();

      const { error: deactivateError } = await supabase
        .from(TABLE_NAME)
        .update({
          is_active: false,
          updated_at: now,
        })
        .neq("id", templateId)
        .eq("is_active", true);

      if (deactivateError) throw deactivateError;

      const { error: activateError } = await supabase
        .from(TABLE_NAME)
        .update({
          is_active: true,
          updated_at: now,
        })
        .eq("id", templateId);

      if (activateError) throw activateError;

      await loadTemplates(templateId);

      setMessage(
        "Ce template est maintenant le template actif."
      );
    } catch (error) {
      console.error(
        "Erreur activation template Spa :",
        error
      );

      setErrorMessage(
        error?.message ||
          "Impossible d’activer le template."
      );
    } finally {
      setSaving(false);
    }
  }

  async function duplicateTemplate() {
    if (!selectedTemplate) return;

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert({
          name: `${selectedTemplate.name || "Template Spa"} – Copie`,
          html_template:
            selectedTemplate.html_template || "",
          is_active: false,
        })
        .select()
        .single();

      if (error) throw error;

      await loadTemplates(data.id);

      setMessage("Template dupliqué.");
    } catch (error) {
      console.error(
        "Erreur duplication template Spa :",
        error
      );

      setErrorMessage(
        error?.message ||
          "Impossible de dupliquer le template."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate() {
    if (!selectedTemplate) return;

    if (selectedTemplate.is_active) {
      setErrorMessage(
        "Vous ne pouvez pas supprimer le template actif. Activez d’abord un autre template."
      );
      return;
    }

    const confirmed = window.confirm(
      `Supprimer définitivement « ${selectedTemplate.name} » ?`
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq("id", selectedTemplate.id);

      if (error) throw error;

      await loadTemplates();

      setMessage("Template supprimé.");
    } catch (error) {
      console.error(
        "Erreur suppression template Spa :",
        error
      );

      setErrorMessage(
        error?.message ||
          "Impossible de supprimer le template."
      );
    } finally {
      setSaving(false);
    }
  }

  function insertToken(token) {
    const textarea = document.getElementById(
      "spa-template-html-editor"
    );

    if (!textarea) {
      setHtmlTemplate(
        (current) => `${current}${token}`
      );
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const nextValue =
      htmlTemplate.slice(0, start) +
      token +
      htmlTemplate.slice(end);

    setHtmlTemplate(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();

      const nextPosition = start + token.length;

      textarea.setSelectionRange(
        nextPosition,
        nextPosition
      );
    });
  }

  async function copyToken(token) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);

      window.setTimeout(() => {
        setCopiedToken("");
      }, 1200);
    } catch {
      insertToken(token);
    }
  }

  return (
    <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-4 lg:px-6">
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 sm:text-2xl lg:text-3xl">
            Templates de factures Spa
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Modifiez le modèle HTML utilisé pour générer les
            factures et reçus Spa.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadTemplates(selectedId)}
            disabled={loading || saving}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Recharger
          </button>

          <button
            type="button"
            onClick={resetEditor}
            disabled={saving}
            className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            Nouveau template
          </button>

          <button
            type="button"
            onClick={saveTemplate}
            disabled={saving || !hasChanges}
            className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </header>

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border bg-white shadow-sm">
          <div className="border-b px-4 py-4">
            <h2 className="font-semibold text-gray-800">
              Templates enregistrés
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              {templates.length} template
              {templates.length !== 1 ? "s" : ""}
            </p>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-gray-500">
              Chargement...
            </div>
          ) : templates.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">
              Aucun template enregistré.
            </div>
          ) : (
            <div className="max-h-[680px] divide-y overflow-y-auto">
              {templates.map((template) => {
                const selected =
                  String(template.id) ===
                  String(selectedId);

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() =>
                      selectTemplate(template.id)
                    }
                    className={`w-full px-4 py-4 text-left transition ${
                      selected
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={`truncate font-medium ${
                            selected
                              ? "text-blue-800"
                              : "text-gray-800"
                          }`}
                        >
                          {template.name}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          Modifié le{" "}
                          {formatDateTime(
                            template.updated_at
                          )}
                        </p>
                      </div>

                      {template.is_active && (
                        <span className="shrink-0 rounded-full bg-green-100 px-2 py-1 text-[11px] font-semibold text-green-700">
                          Actif
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <main className="min-w-0">
          <section className="rounded-xl border bg-white shadow-sm">
            <div className="border-b p-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <label>
                  <span className="mb-1 block text-sm font-medium text-gray-700">
                    Nom du template
                  </span>

                  <input
                    type="text"
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    placeholder="Template Spa principal"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {selectedTemplate &&
                    !selectedTemplate.is_active && (
                      <button
                        type="button"
                        onClick={() =>
                          activateTemplate(
                            selectedTemplate.id
                          )
                        }
                        disabled={saving}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Activer
                      </button>
                    )}

                  {selectedTemplate?.is_active && (
                    <span className="inline-flex items-center rounded-lg bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                      Template actif
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={duplicateTemplate}
                    disabled={!selectedTemplate || saving}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Dupliquer
                  </button>

                  <button
                    type="button"
                    onClick={deleteTemplate}
                    disabled={
                      !selectedTemplate ||
                      selectedTemplate.is_active ||
                      saving
                    }
                    className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>

            <div className="flex overflow-x-auto border-b bg-gray-50 px-4">
              <TabButton
                active={activeView === "editor"}
                onClick={() => setActiveView("editor")}
              >
                Éditeur HTML
              </TabButton>

              <TabButton
                active={activeView === "preview"}
                onClick={() => setActiveView("preview")}
              >
                Aperçu
              </TabButton>

              <TabButton
                active={activeView === "tokens"}
                onClick={() => setActiveView("tokens")}
              >
                Variables
              </TabButton>
            </div>

            {activeView === "editor" && (
              <div className="p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-800">
                      Code HTML
                    </h2>

                    <p className="text-xs text-gray-500">
                      Les modifications affecteront les
                      prochains PDF générés.
                    </p>
                  </div>

                  <span
                    className={`text-xs font-medium ${
                      hasChanges
                        ? "text-orange-600"
                        : "text-green-700"
                    }`}
                  >
                    {hasChanges
                      ? "Modifications non enregistrées"
                      : "Toutes les modifications sont enregistrées"}
                  </span>
                </div>

                <textarea
                  id="spa-template-html-editor"
                  value={htmlTemplate}
                  onChange={(event) =>
                    setHtmlTemplate(event.target.value)
                  }
                  spellCheck={false}
                  placeholder="Collez ici le code HTML du template Spa..."
                  className="min-h-[680px] w-full resize-y rounded-lg border border-gray-300 bg-gray-950 p-4 font-mono text-[12px] leading-5 text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            )}

            {activeView === "preview" && (
              <div className="bg-gray-200 p-3 sm:p-5">
                {!htmlTemplate.trim() ? (
                  <div className="rounded-lg bg-white p-8 text-center text-gray-500">
                    Ajoutez du HTML pour afficher l’aperçu.
                  </div>
                ) : (
                  <div className="overflow-auto rounded-lg border bg-white shadow-inner">
                    <iframe
                      title="Aperçu du template de facture Spa"
                      srcDoc={previewHtml}
                      sandbox=""
                      className="h-[850px] min-w-[794px] w-full border-0 bg-white"
                    />
                  </div>
                )}
              </div>
            )}

            {activeView === "tokens" && (
              <div className="p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-800">
                  Variables disponibles
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Cliquez sur une variable pour l’insérer dans
                  le code HTML.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {TEMPLATE_TOKENS.map((token) => (
                    <div
                      key={token}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-gray-50 p-3"
                    >
                      <code className="break-all text-xs font-semibold text-blue-700">
                        {token}
                      </code>

                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => insertToken(token)}
                          className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          Insérer
                        </button>

                        <button
                          type="button"
                          onClick={() => copyToken(token)}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          {copiedToken === token
                            ? "Copié"
                            : "Copier"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                  <strong>Attention :</strong>{" "}
                  <code>{"{{items}}"}</code> génère les
                  lignes des massages sélectionnés et{" "}
                  <code>{"{{payments_section}}"}</code> génère
la section complète de l’historique des paiements.
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${
        active
          ? "border-blue-700 text-blue-700"
          : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}