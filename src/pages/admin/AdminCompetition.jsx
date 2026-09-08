// src/pages/admin/AdminCompetition.jsx

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";

const PARTICIPATION_MODES = [
  {
    value: "individual",
    label: "Individuelle",
  },
  {
    value: "team_same_category",
    label: "Équipe — même catégorie",
  },
  {
    value: "team_mixed_categories",
    label: "Équipe — catégories mixtes",
  },
];

const TEAM_SCORING_METHODS = [
  {
    value: "direct_time_lowest",
    label: "Temps d'équipe le plus court",
  },
  {
    value: "direct_time_highest",
    label: "Durée d'équipe la plus longue",
  },
  {
    value: "direct_quantity_highest",
    label: "Quantité d'équipe la plus élevée",
  },
  {
    value: "direct_technical_score",
    label: "Note technique d'équipe la plus élevée",
  },
  {
    value: "sum_member_points_highest",
    label: "Somme des points des membres — total le plus élevé",
  },
  {
    value: "sum_member_scores_highest",
    label: "Somme des notes des membres — total le plus élevé",
  },
  {
    value: "sum_member_times_lowest",
    label: "Somme des temps des membres — total le plus faible",
  },
];

const SCORING_TYPES = [
  {
    value: "completion",
    label: "Réalisation / Complétion",
  },
  {
    value: "time_lowest",
    label: "Temps le plus court",
  },
  {
    value: "time_highest",
    label: "Temps / durée la plus longue",
  },
  {
    value: "quantity_highest",
    label: "Quantité la plus élevée",
  },
  {
    value: "quantity_lowest",
    label: "Quantité la plus faible",
  },
  {
    value: "technical_score",
    label: "Note technique",
  },
  {
    value: "team",
    label: "Épreuve par équipe",
  },
];

function scoringTypeLabel(value) {
  return (
    SCORING_TYPES.find(
      (item) =>
        item.value === value
    )?.label ||
    value ||
    "—"
  );
}

const TABS = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "categories", label: "Catégories" },
  { id: "events", label: "Épreuves" },
  { id: "participants", label: "Participants" },
  { id: "results", label: "Résultats" },
];

export default function AdminCompetition() {
  const [activeSection, setActiveSection] = useState("overview");

  const [competitions, setCompetitions] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [levels, setLevels] = useState([]);
  const [categories, setCategories] = useState([]);
const [savingLevelId, setSavingLevelId] =
  useState(null);

  const [
  syncingParticipants,
  setSyncingParticipants,
] = useState(false);


  const [
  expandedAssignmentId,
  setExpandedAssignmentId,
] = useState(null);

const [
  assignmentEvents,
  setAssignmentEvents,
] = useState({});

const [
  assignmentEventsLoadingId,
  setAssignmentEventsLoadingId,
] = useState(null);

  async function loadLevels() {
  const { data, error } = await supabase
    .from("student_certificate_levels")
    .select(`
      id,
      code,
      name,
      sort_order,
      is_active
    `)
    .eq("is_active", true)
    .order("sort_order", {
      ascending: true,
    });

  if (error) throw error;

  setLevels(data || []);
}

const [competitionCourses, setCompetitionCourses] =
  useState([]);

const [categoryConfigLoading, setCategoryConfigLoading] =
  useState(false);

const [competitionPhases, setCompetitionPhases] =
  useState([]);

const [eventConfigLoading, setEventConfigLoading] =
  useState(false);

const [
  competitionEventGroups,
  setCompetitionEventGroups,
] = useState([]);

const [
  competitionEventEvaluation,
  setCompetitionEventEvaluation,
] = useState([]);

const [
  eventEvaluationLoading,
  setEventEvaluationLoading,
] = useState(false);

async function loadEventConfig(year) {
  if (!year) {
    setCompetitionPhases([]);
    return;
  }

  try {
    setEventConfigLoading(true);

    const { data, error } =
      await supabase.rpc(
        "get_admin_competition_event_config",
        {
          p_competition_year:
            Number(year),
        }
      );

    if (error) throw error;

    setCompetitionPhases(
      data?.phases || []
    );
  } finally {
    setEventConfigLoading(false);
  }
}

async function loadEventEvaluationConfig(year) {
  if (!year) {
    setCompetitionEventGroups([]);
    setCompetitionEventEvaluation([]);
    return;
  }

  try {
    setEventEvaluationLoading(true);

    const { data, error } =
      await supabase.rpc(
        "get_admin_competition_event_evaluation_config",
        {
          p_competition_year:
            Number(year),
        }
      );

    if (error) throw error;

    setCompetitionEventGroups(
      data?.event_groups || []
    );

    setCompetitionEventEvaluation(
      data?.events || []
    );
  } finally {
    setEventEvaluationLoading(false);
  }
}

async function loadCategories(year) {
  if (!year) {
    setCategories([]);
    setCompetitionCourses([]);
    return;
  }

  try {
    setCategoryConfigLoading(true);

    const { data, error } =
      await supabase.rpc(
        "get_admin_competition_category_config",
        {
          p_competition_year:
            Number(year),
        }
      );

    if (error) throw error;

    setCategories(
      data?.categories || []
    );

    setCompetitionCourses(
      data?.courses || []
    );
  } finally {
    setCategoryConfigLoading(false);
  }
}

  const selectedCompetition = useMemo(
    () =>
      competitions.find(
        (competition) =>
          Number(competition.competition_year) === Number(selectedYear)
      ) || null,
    [competitions, selectedYear]
  );

  const isHistorical = useMemo(() => {
    if (!selectedCompetition) return false;

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Port-au-Prince",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    return today > selectedCompetition.event_date;
  }, [selectedCompetition]);

  async function loadCompetitions() {
    const { data, error } = await supabase.rpc(
  "get_admin_competitions"
);

    if (error) throw error;

    const rows = data || [];

    setCompetitions(rows);

    if (!rows.length) {
      setSelectedYear(null);
      return;
    }

    /*
     * Pick the first competition whose event has not
     * already passed.
     *
     * Therefore, once the 2026 competition is finished,
     * 2027 automatically becomes the working competition.
     */
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Port-au-Prince",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const upcoming = [...rows]
      .filter(
        (competition) =>
          competition.event_date >= today
      )
      .sort(
        (a, b) =>
          Number(a.competition_year) -
          Number(b.competition_year)
      );

    const competitionToUse =
      upcoming[0] || rows[0];

    setSelectedYear(
      competitionToUse.competition_year
    );
  }

  async function handleLevelChange(
  assignment,
  newLevelId
) {
  if (
    isHistorical ||
    !assignment?.student_profile_id ||
    !newLevelId ||
    !selectedYear
  ) {
    return;
  }

  const currentLevelId =
    assignment.level_id || "";

  if (
    String(currentLevelId) ===
    String(newLevelId)
  ) {
    return;
  }

  try {
    setSavingLevelId(assignment.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } =
      await supabase.rpc(
        "set_student_swim_level_for_competition",
        {
          p_student_profile_id:
            assignment.student_profile_id,

          p_level_id:
            newLevelId,

          p_competition_year:
            Number(selectedYear),
        }
      );

    if (error) throw error;

    setAssignmentEvents((current) => {
  const next = { ...current };

  delete next[assignment.id];

  return next;
});

    /*
     * Reload the roster.
     *
     * The DB trigger also:
     * - updates the competition level snapshot
     * - removes event entries that are no longer eligible
     */
    await loadAssignments(
      selectedYear
    );

    if (
  expandedAssignmentId ===
  assignment.id
) {
  await loadAssignmentEvents(
    assignment.id,
    true
  );
}

    setSuccessMessage(
      `Niveau de ${
        assignment.student?.full_name ||
        "l'élève"
      } modifié : ${
        data?.level_name ||
        "niveau mis à jour"
      }.`
    );
  } catch (error) {
    console.error(
      "Competition level update error:",
      error
    );

    setErrorMessage(
      error?.message ||
        "Impossible de modifier le niveau."
    );
  } finally {
    setSavingLevelId(null);
  }
}

  async function loadAssignments(year) {
  if (!year) {
    setAssignments([]);
    return;
  }

  const { data, error } = await supabase.rpc(
    "get_admin_competition_participants",
    {
      p_competition_year: Number(year),
    }
  );

  if (error) throw error;

  const rows = (data || []).map((row) => ({
    id: row.assignment_id,

    student_profile_id:
      row.student_profile_id,

    source_enrollment_id:
      row.source_enrollment_id,

    source_course_id:
      row.source_course_id,

    assignment_source:
      row.assignment_source,

    participation_status:
      row.participation_status,

    enrolled_at:
      row.enrolled_at,

    declined_at:
      row.declined_at,

    withdrawn_at:
      row.withdrawn_at,

    level_id:
      row.level_id,

    student: {
      id:
        row.student_profile_id,

      full_name:
        row.student_name,

      is_active:
        row.student_is_active,
    },

    course: {
      id:
        row.source_course_id,

      name:
        row.source_course_name,
    },

    category: {
      id:
        row.category_id,

      code:
        row.category_code,

      name:
        row.category_name,

      sort_order:
        row.category_sort_order,
    },

    level: row.level_id
      ? {
          id:
            row.level_id,

          code:
            row.level_code,

          name:
            row.level_name,

          sort_order:
            row.level_sort_order,
        }
      : null,

    level_name_snapshot:
      row.level_name,

    selected_event_count:
      Number(
        row.selected_event_count || 0
      ),
  }));

  setAssignments(rows);
}

async function handleSyncParticipants() {
  if (
    !selectedYear ||
    isHistorical ||
    syncingParticipants
  ) {
    return;
  }

  try {
    setSyncingParticipants(true);

    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } =
  await supabase.rpc(
    "sync_competition_student_assignments",
    {
      p_year:
        Number(selectedYear),
    }
  );

    if (error) throw error;

    const result =
  Array.isArray(data)
    ? data[0]
    : data;

    /*
     * Any previously opened event details
     * may now be stale.
     */
    setExpandedAssignmentId(null);
    setAssignmentEvents({});

    /*
     * Reload the roster after synchronization.
     */
    await loadAssignments(
      selectedYear
    );

    const eligible =
      Number(
        result?.eligible_students ??
          0
      );

    const synced =
      Number(
        result?.synced_assignments ??
          0
      );

    const withLevel =
      Number(
        result?.students_with_level ??
          0
      );

    const withoutLevel =
      Number(
        result?.students_without_level ??
          0
      );

    const removed =
      Number(
        result?.stale_assignments_removed ??
          0
      );

    const conflicts =
      Number(
        result?.conflicts_found ??
          0
      );

    setSuccessMessage(
      `Participants synchronisés : ${eligible} admissible(s), ${synced} affectation(s) synchronisée(s), ${withLevel} avec niveau, ${withoutLevel} niveau(x) à déterminer, ${removed} ancienne(s) affectation(s) supprimée(s)${
        conflicts > 0
          ? `, ${conflicts} conflit(s) détecté(s)`
          : ""
      }.`
    );
  } catch (error) {
    console.error(
      "Competition participants sync error:",
      error
    );

    setErrorMessage(
      error?.message ||
        "Impossible de synchroniser les participants."
    );
  } finally {
    setSyncingParticipants(false);
  }
}

async function loadAssignmentEvents(
  assignmentId,
  force = false
) {
  if (!assignmentId) return;

  if (
    !force &&
    Object.prototype.hasOwnProperty.call(
      assignmentEvents,
      assignmentId
    )
  ) {
    return;
  }

  try {
    setAssignmentEventsLoadingId(
      assignmentId
    );

    const { data, error } =
      await supabase.rpc(
        "get_competition_assignment_events",
        {
          p_assignment_id:
            assignmentId,
        }
      );

    if (error) throw error;

    setAssignmentEvents((current) => ({
      ...current,
      [assignmentId]: data || [],
    }));
  } catch (error) {
    console.error(
      "Competition assignment events error:",
      error
    );

    setErrorMessage(
      error?.message ||
        "Impossible de charger les épreuves sélectionnées."
    );
  } finally {
    setAssignmentEventsLoadingId(null);
  }
}

async function handleToggleAssignment(
  assignmentId
) {
  if (
    expandedAssignmentId ===
    assignmentId
  ) {
    setExpandedAssignmentId(null);
    return;
  }

  setExpandedAssignmentId(
    assignmentId
  );

  await loadAssignmentEvents(
    assignmentId
  );
}

  async function loadPage() {
    try {
      setLoading(true);
      setErrorMessage("");

      await Promise.all([
  loadCompetitions(),
  loadLevels(),
]);
    } catch (error) {
      console.error(
        "AdminCompetition load error:",
        error
      );

      setErrorMessage(
        error?.message ||
          "Impossible de charger la mini-compétition."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
  if (!selectedYear) return;

  setErrorMessage("");
  setSuccessMessage("");

  Promise.all([
    loadAssignments(selectedYear),
    loadCategories(selectedYear),
    loadEventConfig(selectedYear),
    loadEventEvaluationConfig(selectedYear),
  ]).catch((error) => {
    console.error(
      "Competition data error:",
      error
    );

    setErrorMessage(
      error?.message ||
        "Impossible de charger les données de la compétition."
    );
  });
}, [selectedYear]);

  const stats = useMemo(() => {
    const total = assignments.length;

    const enrolled = assignments.filter(
      (row) =>
        row.participation_status === "enrolled"
    ).length;

    const noResponse = assignments.filter(
      (row) =>
        row.participation_status === "no_response"
    ).length;

    const declined = assignments.filter(
      (row) =>
        row.participation_status === "declined"
    ).length;

    const withdrawn = assignments.filter(
      (row) =>
        row.participation_status === "withdrawn"
    ).length;

    const withoutLevel = assignments.filter(
      (row) => !row.level_id
    ).length;

    return {
      total,
      enrolled,
      noResponse,
      declined,
      withdrawn,
      withoutLevel,
    };
  }, [assignments]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-500">
          Chargement de la mini-compétition…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-cyan-600 px-6 py-5 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Mini-compétition
              </h2>

              {selectedCompetition && (
                <p className="mt-1 text-sm text-white/90">
                  {selectedCompetition.name} —{" "}
                  {formatDateFrSafe(
                    selectedCompetition.event_date
                  )}
                </p>
              )}
            </div>

            {competitions.length > 0 && (
              <select
                value={selectedYear || ""}
                onChange={(event) =>
                  setSelectedYear(
                    Number(event.target.value)
                  )
                }
                className="rounded-xl border border-white/30 bg-white px-4 py-2 font-semibold text-gray-800"
              >
                {competitions.map((competition) => (
                  <option
                    key={competition.id}
                    value={
                      competition.competition_year
                    }
                  >
                    {competition.competition_year}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {selectedCompetition && (
          <div className="grid grid-cols-1 gap-3 p-5 text-sm sm:grid-cols-3">
            <div>
              <p className="text-gray-500">
                Date
              </p>
              <p className="font-semibold">
                {formatDateFrSafe(
                  selectedCompetition.event_date
                )}
              </p>
            </div>

            <div>
              <p className="text-gray-500">
                Ouverture des inscriptions
              </p>
              <p className="font-semibold">
                {formatDateFrSafe(
                  selectedCompetition.enrollment_open_date
                )}
              </p>
            </div>

            <div>
              <p className="text-gray-500">
                Statut
              </p>

              {isHistorical ? (
                <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">
                  Historique
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-green-100 px-3 py-1 font-semibold text-green-700">
                  Compétition courante
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
    {successMessage}
  </div>
)}

      {/* INTERNAL TABS */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveSection(tab.id)
              }
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeSection === tab.id
                  ? "bg-aquaBlue text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* OVERVIEW */}
      {activeSection === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Admissibles"
              value={stats.total}
            />

            <StatCard
              label="Confirmés"
              value={stats.enrolled}
            />

            <StatCard
              label="Sans réponse"
              value={stats.noResponse}
            />

            <StatCard
              label="Ne participent pas"
              value={stats.declined}
            />

            <StatCard
              label="Retirés"
              value={stats.withdrawn}
            />

            <StatCard
              label="Niveau à déterminer"
              value={stats.withoutLevel}
            />
          </div>
        </div>
      )}

      {/* CATEGORIES */}
      {activeSection === "categories" && (
  <CategoriesSection
    categories={categories}
    courses={competitionCourses}
    competitionYear={selectedYear}
    isHistorical={isHistorical}
    loading={categoryConfigLoading}
    onReload={() =>
      loadCategories(selectedYear)
    }
    onSuccess={setSuccessMessage}
    onError={setErrorMessage}
  />
)}

      {/* EVENTS */}
      {activeSection === "events" && (
  <EventsSection
  phases={competitionPhases}
  categories={categories}
  levels={levels}
  eventGroups={competitionEventGroups}
  eventEvaluation={competitionEventEvaluation}
  competitionYear={selectedYear}
  isHistorical={isHistorical}
  loading={
    eventConfigLoading ||
    eventEvaluationLoading
  }
  onReload={async () => {
    await Promise.all([
      loadEventConfig(
        selectedYear
      ),

      loadEventEvaluationConfig(
        selectedYear
      ),

      loadAssignments(
        selectedYear
      ),
    ]);

    setAssignmentEvents({});
  }}
  onSuccess={setSuccessMessage}
  onError={setErrorMessage}
/>
)}

      

      {/* PARTICIPANTS */}
      {activeSection === "participants" && (
        <ParticipantsSection
  assignments={assignments}
  levels={levels}
  savingLevelId={savingLevelId}
  onLevelChange={handleLevelChange}

  isHistorical={isHistorical}

  syncingParticipants={
    syncingParticipants
  }
  onSyncParticipants={
    handleSyncParticipants
  }

  expandedAssignmentId={
    expandedAssignmentId
  }
  assignmentEvents={
    assignmentEvents
  }
  assignmentEventsLoadingId={
    assignmentEventsLoadingId
  }
  onToggleAssignment={
    handleToggleAssignment
  }
/>
      )}

      {/* RESULTS */}
      {activeSection === "results" && (
        <Placeholder
          title="Résultats"
          text="La saisie et le classement des résultats seront ajoutés ici."
        />
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">
        {label}
      </p>

      <p className="mt-1 text-3xl font-bold text-aquaBlue">
        {value}
      </p>
    </div>
  );
}

function Placeholder({ title, text }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-aquaBlue">
        {title}
      </h3>

      <p className="mt-2 text-sm text-gray-600">
        {text}
      </p>
    </div>
  );
}

function CategoriesSection({
  categories,
  courses,
  competitionYear,
  isHistorical,
  loading,
  onReload,
  onSuccess,
  onError,
}) {
  const emptyForm = {
    id: null,
    code: "",
    name: "",
    description: "",
    min_age: "",
    max_age: "",
    sort_order:
      categories.length + 1,
    course_ids: [],
  };

  const [editing, setEditing] =
    useState(null);

  const [form, setForm] =
    useState(emptyForm);

  const [saving, setSaving] =
    useState(false);

  const [savingAgeCourses, setSavingAgeCourses] =
    useState(false);

  const ageBasedCourseIds = useMemo(
    () =>
      courses
        .filter(
          (course) =>
            course.mode === "age_based"
        )
        .map((course) => course.id),
    [courses]
  );

  function startNew() {
    setEditing("new");

    setForm({
      id: null,
      code: "",
      name: "",
      description: "",
      min_age: "",
      max_age: "",
      sort_order:
        categories.length + 1,
      course_ids: [],
    });
  }

  function startEdit(category) {
    setEditing(category.id);

    setForm({
      id: category.id,
      code: category.code || "",
      name: category.name || "",
      description:
        category.description || "",

      min_age:
        category.min_age ??
        "",

      max_age:
        category.max_age ??
        "",

      sort_order:
        category.sort_order ?? 0,

      course_ids:
        category.course_ids || [],
    });
  }

  function cancelEdit() {
    setEditing(null);
  }

  function toggleCourse(courseId) {
    setForm((current) => {
      const selected =
        current.course_ids.includes(
          courseId
        );

      return {
        ...current,

        course_ids: selected
          ? current.course_ids.filter(
              (id) =>
                id !== courseId
            )
          : [
              ...current.course_ids,
              courseId,
            ],
      };
    });
  }

  async function saveCategory() {
    if (!form.name.trim()) {
      onError(
        "Le nom de la catégorie est obligatoire."
      );
      return;
    }

    try {
      setSaving(true);
      onError("");
      onSuccess("");

      const { data, error } =
        await supabase.rpc(
          "admin_save_competition_category",
          {
            p_competition_year:
              Number(
                competitionYear
              ),

            p_category_id:
              form.id || null,

            p_code:
              form.code || null,

            p_name:
              form.name,

            p_description:
              form.description || null,

            p_min_age:
              form.min_age === ""
                ? null
                : Number(
                    form.min_age
                  ),

            p_max_age:
              form.max_age === ""
                ? null
                : Number(
                    form.max_age
                  ),

            p_sort_order:
              Number(
                form.sort_order || 0
              ),

            p_course_ids:
              form.course_ids,
          }
        );

      if (error) throw error;

      await onReload();

      setEditing(null);

      onSuccess(
        `${data?.category_name || "Catégorie"} enregistrée avec succès.`
      );
    } catch (error) {
      console.error(
        "Competition category save error:",
        error
      );

      onError(
        error?.message ||
          "Impossible d'enregistrer la catégorie."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleAgeBasedCourse(
    courseId
  ) {
    const current =
      ageBasedCourseIds;

    const next =
      current.includes(courseId)
        ? current.filter(
            (id) =>
              id !== courseId
          )
        : [
            ...current,
            courseId,
          ];

    try {
      setSavingAgeCourses(true);
      onError("");
      onSuccess("");

      const { error } =
        await supabase.rpc(
          "admin_set_competition_age_based_courses",
          {
            p_competition_year:
              Number(
                competitionYear
              ),

            p_course_ids:
              next,
          }
        );

      if (error) throw error;

      await onReload();

      onSuccess(
        "Configuration des cours selon l’âge mise à jour."
      );
    } catch (error) {
      console.error(
        "Age based competition courses error:",
        error
      );

      onError(
        error?.message ||
          "Impossible de modifier cette configuration."
      );
    } finally {
      setSavingAgeCourses(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">
          Chargement des catégories…
        </p>
      </div>
    );
  }

  

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-aquaBlue">
            Catégories
          </h3>

          <p className="mt-1 text-sm text-gray-500">
            Configuration des catégories,
            des cours associés et des
            règles d’âge pour{" "}
            {competitionYear}.
          </p>
        </div>

        {!isHistorical && (
          <button
            type="button"
            onClick={startNew}
            className="rounded-xl bg-aquaBlue px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            + Ajouter une catégorie
          </button>
        )}
      </div>

      {isHistorical && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Cette compétition est
          historique. La configuration
          est en lecture seule.
        </div>
      )}

      {/* AGE-BASED COURSES */}
      <div className="rounded-2xl border border-purple-100 bg-white shadow-sm">
        <div className="border-b border-purple-100 bg-purple-50 px-5 py-4">
          <h4 className="font-bold text-purple-800">
            Cours classés selon l’âge
          </h4>

          <p className="mt-1 text-sm text-purple-700">
            Pour ces cours, la catégorie
            est déterminée par l’âge de
            l’élève le jour de la
            compétition.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => {
            const checked =
              ageBasedCourseIds.includes(
                course.id
              );

            return (
              <label
                key={course.id}
                className={`flex items-center gap-3 rounded-xl border p-4 ${
                  checked
                    ? "border-purple-300 bg-purple-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    isHistorical ||
                    savingAgeCourses
                  }
                  onChange={() =>
                    toggleAgeBasedCourse(
                      course.id
                    )
                  }
                />

                <div>
                  <p className="font-semibold text-gray-800">
                    {course.name}
                  </p>

                  {checked && (
                    <p className="text-xs font-medium text-purple-600">
                      Catégorie selon
                      l’âge
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* CATEGORY CARDS */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {categories.map(
          (category) => (
            <div
              key={category.id}
              className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
            >
              <div className="flex items-start justify-between gap-4 border-b border-blue-100 bg-blue-50 p-5">
                <div>
                  <h4 className="text-lg font-bold text-aquaBlue">
                    {category.code
                      ? `${category.code} — `
                      : ""}
                    {category.name}
                  </h4>

                  {category.description && (
                    <p className="mt-1 text-sm text-gray-600">
                      {
                        category.description
                      }
                    </p>
                  )}
                </div>

                {!isHistorical && (
                  <button
                    type="button"
                    onClick={() =>
                      startEdit(
                        category
                      )
                    }
                    className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-aquaBlue hover:bg-blue-50"
                  >
                    Modifier
                  </button>
                )}
              </div>

              <div className="space-y-5 p-5">
                {/* NORMAL COURSES */}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                    Cours associés
                  </p>

                  {category.courses
                    ?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {category.courses.map(
                        (course) => (
                          <span
                            key={
                              course.id
                            }
                            className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700"
                          >
                            {
                              course.name
                            }
                          </span>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-sm italic text-gray-400">
                      Aucun cours
                      associé directement.
                    </p>
                  )}
                </div>

                {/* AGE RANGE */}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                    Plage d’âge
                  </p>

                  <AgeRangeText
                    minAge={
                      category.min_age
                    }
                    maxAge={
                      category.max_age
                    }
                  />
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* EDITOR */}
      {editing && !isHistorical && (
        <div className="rounded-2xl border-2 border-aquaBlue bg-white p-6 shadow-lg">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h4 className="text-lg font-bold text-aquaBlue">
                {editing === "new"
                  ? "Nouvelle catégorie"
                  : "Modifier la catégorie"}
              </h4>

              <p className="text-sm text-gray-500">
                Les plages d’âge sont
                utilisées uniquement
                pour les cours configurés
                selon l’âge.
              </p>
            </div>

            <button
              type="button"
              onClick={cancelEdit}
              className="text-sm font-semibold text-gray-500 hover:text-gray-800"
            >
              Fermer ✕
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm font-semibold text-gray-700">
                Code
              </span>

              <input
                value={form.code}
                onChange={(event) =>
                  setForm({
                    ...form,
                    code:
                      event.target
                        .value,
                  })
                }
                placeholder="CAT1"
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-semibold text-gray-700">
                Nom *
              </span>

              <input
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name:
                      event.target
                        .value,
                  })
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-semibold text-gray-700">
                Âge minimum
              </span>

              <input
                type="number"
                min="0"
                value={form.min_age}
                onChange={(event) =>
                  setForm({
                    ...form,
                    min_age:
                      event.target
                        .value,
                  })
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-semibold text-gray-700">
                Âge maximum
              </span>

              <input
                type="number"
                min="0"
                value={form.max_age}
                onChange={(event) =>
                  setForm({
                    ...form,
                    max_age:
                      event.target
                        .value,
                  })
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-semibold text-gray-700">
                Ordre
              </span>

              <input
                type="number"
                value={
                  form.sort_order
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    sort_order:
                      event.target
                        .value,
                  })
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="md:col-span-2">
              <span className="mb-1 block text-sm font-semibold text-gray-700">
                Description
              </span>

              <textarea
                value={
                  form.description
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    description:
                      event.target
                        .value,
                  })
                }
                rows={3}
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          {/* NORMAL COURSE MAPPINGS */}
          <div className="mt-6">
            <p className="font-bold text-gray-800">
              Cours associés
            </p>

            <p className="mb-3 text-xs text-gray-500">
              Les cours classés selon
              l’âge ne peuvent pas être
              associés directement ici.
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {courses
                .filter(
                  (course) =>
                    course.mode !==
                    "age_based"
                )
                .map((course) => {
                  const checked =
                    form.course_ids.includes(
                      course.id
                    );

                  return (
                    <label
                      key={course.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 ${
                        checked
                          ? "border-blue-300 bg-blue-50"
                          : "border-gray-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={
                          checked
                        }
                        onChange={() =>
                          toggleCourse(
                            course.id
                          )
                        }
                      />

                      <span className="text-sm font-medium">
                        {course.name}
                      </span>
                    </label>
                  );
                })}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={saveCategory}
              disabled={saving}
              className="rounded-xl bg-aquaBlue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving
                ? "Enregistrement…"
                : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AgeRangeText({
  minAge,
  maxAge,
}) {
  if (
    minAge == null &&
    maxAge == null
  ) {
    return (
      <span className="text-sm text-gray-400">
        Non définie
      </span>
    );
  }

  if (
    minAge != null &&
    maxAge != null
  ) {
    return (
      <span className="text-sm font-semibold text-gray-700">
        {minAge} à {maxAge} ans
      </span>
    );
  }

  if (minAge != null) {
    return (
      <span className="text-sm font-semibold text-gray-700">
        {minAge} ans et +
      </span>
    );
  }

  return (
    <span className="text-sm font-semibold text-gray-700">
      Jusqu'à {maxAge} ans
    </span>
  );
}

function EventsSection({
  phases,
  categories,
  levels,

  eventGroups,
  eventEvaluation,

  competitionYear,
  isHistorical,
  loading,
  onReload,
  onSuccess,
  onError,
}) {
  const [phaseEditor, setPhaseEditor] =
    useState(null);

  const [eventEditor, setEventEditor] =
    useState(null);

  const [
  collapsedPhases,
  setCollapsedPhases,
] = useState({});

function togglePhaseCollapsed(
  phaseId
) {
  setCollapsedPhases(
    (current) => ({
      ...current,
      [phaseId]:
        !current[phaseId],
    })
  );
}

  const [savingPhase, setSavingPhase] =
    useState(false);

  const [savingEvent, setSavingEvent] =
    useState(false);

  const [
  eventGroupEditor,
  setEventGroupEditor,
] = useState(null);

const [
  savingEventGroup,
  setSavingEventGroup,
] = useState(false);

const emptyEventGroup = {
  id: null,
  name: "",
  description: "",
  sort_order:
    (eventGroups?.length || 0) + 1,
  is_active: true,
};

  const [
  generatingTeamEventId,
  setGeneratingTeamEventId,
] = useState(null);

const [
  eventTeams,
  setEventTeams,
] = useState({});

const [
  loadingTeamEventId,
  setLoadingTeamEventId,
] = useState(null);

  const emptyPhase = {
    id: null,
    name: "",
    description: "",
    sort_order:
      phases.length + 1,
    is_active: true,
  };

  const emptyEvent = {
  id: null,
  phase_id: "",
  event_group_id: "",

  name: "",
  description: "",
  instructions: "",

  scoring_type: "completion",

  max_participants: "",
  sort_order: 1,
  is_active: true,

  participation_mode:
    "individual",

  team_size: "",

  team_scoring_method:
    "",

  team_requirements: [],

  category_ids: [],
  level_ids: [],

  criteria: [],
};

function newEventGroup() {
  setEventGroupEditor({
    ...emptyEventGroup,
    sort_order:
      (eventGroups?.length || 0) + 1,
  });
}

function editEventGroup(group) {
  setEventGroupEditor({
    id: group.id,
    name: group.name || "",
    description:
      group.description || "",
    sort_order:
      group.sort_order ?? 0,
    is_active:
      group.is_active !== false,
  });
}

async function saveEventGroup() {
  if (
    !eventGroupEditor?.name?.trim()
  ) {
    onError(
      "Le nom de la catégorie d'épreuve est obligatoire."
    );
    return;
  }

  try {
    setSavingEventGroup(true);

    onError("");
    onSuccess("");

    const { data, error } =
      await supabase.rpc(
        "admin_save_competition_event_group",
        {
          p_competition_year:
            Number(
              competitionYear
            ),

          p_event_group_id:
            eventGroupEditor.id ||
            null,

          p_name:
            eventGroupEditor.name,

          p_description:
            eventGroupEditor.description ||
            null,

          p_sort_order:
            Number(
              eventGroupEditor.sort_order ||
                0
            ),

          p_is_active:
            eventGroupEditor.is_active,
        }
      );

    if (error) throw error;

    await onReload();

    setEventGroupEditor(null);

    onSuccess(
      `${data?.event_group_name || "Catégorie d'épreuve"} enregistrée avec succès.`
    );
  } catch (error) {
    console.error(
      "Competition event group save error:",
      error
    );

    onError(
      error?.message ||
        "Impossible d'enregistrer la catégorie d'épreuve."
    );
  } finally {
    setSavingEventGroup(false);
  }
}

async function toggleEventGroupActive(
  group
) {
  if (!group?.id) return;

  const action =
    group.is_active === false
      ? "admin_restore_competition_event_group"
      : "admin_deactivate_competition_event_group";

  try {
    onError("");
    onSuccess("");

    const { error } =
      await supabase.rpc(
        action,
        {
          p_event_group_id:
            group.id,
        }
      );

    if (error) throw error;

    await onReload();

    onSuccess(
      group.is_active === false
        ? `${group.name} restaurée.`
        : `${group.name} désactivée.`
    );
  } catch (error) {
    console.error(
      "Competition event group status error:",
      error
    );

    onError(
      error?.message ||
        "Impossible de modifier cette catégorie d'épreuve."
    );
  }
}

  function newPhase() {
    setEventEditor(null);

    setPhaseEditor({
      ...emptyPhase,
      sort_order:
        phases.length + 1,
    });
  }

  function editPhase(phase) {
    setEventEditor(null);

    setPhaseEditor({
      id: phase.id,
      name: phase.name || "",
      description:
        phase.description || "",
      sort_order:
        phase.sort_order ?? 0,
      is_active:
        phase.is_active !== false,
    });
  }

  function newEvent(phase) {
  setPhaseEditor(null);

  setCollapsedPhases(
    (current) => ({
      ...current,
      [phase.id]: false,
    })
  );

  setEventEditor({
      ...emptyEvent,

      phase_id:
        phase?.id || "",

      sort_order:
        (phase?.events?.length ||
          0) + 1,

      /*
       * New events default to all
       * currently active categories
       * and levels.
       *
       * Admin can uncheck any of them
       * before saving.
       */
      category_ids:
        categories
          .filter(
            (category) =>
              category.is_active !==
              false
          )
          .map(
            (category) =>
              category.id
          ),

      level_ids:
        levels.map(
          (level) => level.id
        ),
    });
  }

  function editEvent(event) {
  setPhaseEditor(null);

  setCollapsedPhases(
    (current) => ({
      ...current,
      [event.phase_id]: false,
    })
  );

  const evaluation =
    (eventEvaluation || []).find(
      (item) =>
        item.event_id === event.id
    );

  setEventEditor({
    id: event.id,

    phase_id:
      event.phase_id,

    event_group_id:
      evaluation?.event_group_id ||
      "",

    name:
      event.name || "",

    description:
      event.description || "",

    instructions:
      event.instructions || "",

    scoring_type:
      event.scoring_type ||
      "completion",

    max_participants:
      event.max_participants ??
      "",

    sort_order:
      event.sort_order ?? 0,

    is_active:
      event.is_active !== false,

    participation_mode:
      event.participation_mode ||
      "individual",

    team_size:
      event.team_size ?? "",

    team_scoring_method:
      event.team_scoring_method ||
      "",

    team_requirements:
      event.team_requirements || [],

    category_ids:
      event.category_ids || [],

    level_ids:
      event.level_ids || [],

    criteria:
      evaluation?.criteria || [],
  });
}

  async function savePhase() {
    if (
      !phaseEditor?.name?.trim()
    ) {
      onError(
        "Le nom de la phase est obligatoire."
      );
      return;
    }

    try {
      setSavingPhase(true);
      onError("");
      onSuccess("");

      const { data, error } =
        await supabase.rpc(
          "admin_save_competition_phase",
          {
            p_competition_year:
              Number(
                competitionYear
              ),

            p_phase_id:
              phaseEditor.id ||
              null,

            p_name:
              phaseEditor.name,

            p_description:
              phaseEditor.description ||
              null,

            p_sort_order:
              Number(
                phaseEditor.sort_order ||
                  0
              ),

            p_is_active:
              phaseEditor.is_active,
          }
        );

      if (error) throw error;

      await onReload();

      setPhaseEditor(null);

      onSuccess(
        `${data?.phase_name || "Phase"} enregistrée avec succès.`
      );
    } catch (error) {
      console.error(
        "Competition phase save error:",
        error
      );

      onError(
        error?.message ||
          "Impossible d'enregistrer la phase."
      );
    } finally {
      setSavingPhase(false);
    }
  }

  function buildAutomaticTeamRequirements(
  categoryIds,
  teamSize
) {
  const selectedCategories = categories
    .filter((category) =>
      categoryIds.includes(category.id)
    )
    .sort(
      (a, b) =>
        Number(a.sort_order || 0) -
        Number(b.sort_order || 0)
    );

  const size = Number(teamSize || 0);

  if (
    !selectedCategories.length ||
    size < selectedCategories.length
  ) {
    return [];
  }

  /*
   * Every category gets at least 1 member.
   * Any remaining members are distributed
   * starting from the first category.
   *
   * Examples:
   * 3 categories / team of 4 => 2,1,1
   * 4 categories / team of 4 => 1,1,1,1
   * 4 categories / team of 5 => 2,1,1,1
   */
  const requirements =
    selectedCategories.map(
      (category) => ({
        category_id: category.id,
        members_required: 1,
      })
    );

  let remaining =
    size - selectedCategories.length;

  let index = 0;

  while (remaining > 0) {
    requirements[index].members_required += 1;

    remaining -= 1;

    index =
      (index + 1) %
      requirements.length;
  }

  return requirements;
}

  function toggleEventCategory(
  categoryId
) {
  setEventEditor((current) => {
    const selected =
      current.category_ids.includes(
        categoryId
      );

    const nextCategoryIds = selected
      ? current.category_ids.filter(
          (id) => id !== categoryId
        )
      : [
          ...current.category_ids,
          categoryId,
        ];

    return {
      ...current,

      category_ids:
        nextCategoryIds,

      team_requirements:
        current.participation_mode ===
        "team_mixed_categories"
          ? buildAutomaticTeamRequirements(
              nextCategoryIds,
              current.team_size
            )
          : [],
    };
  });
}

  function toggleEventLevel(
    levelId
  ) {
    setEventEditor((current) => {
      const selected =
        current.level_ids.includes(
          levelId
        );

      return {
        ...current,

        level_ids: selected
          ? current.level_ids.filter(
              (id) =>
                id !== levelId
            )
          : [
              ...current.level_ids,
              levelId,
            ],
      };
    });
  }

  async function saveEvent() {
    if (
      !eventEditor?.name?.trim()
    ) {
      onError(
        "Le nom de l'épreuve est obligatoire."
      );
      return;
    }

    if (!eventEditor.phase_id) {
      onError(
        "Sélectionnez une phase."
      );
      return;
    }

    if (
      !eventEditor.category_ids
        .length
    ) {
      onError(
        "Sélectionnez au moins une catégorie."
      );
      return;
    }

    if (
  !eventEditor.level_ids.length
) {
  onError(
    "Sélectionnez au moins un niveau."
  );
  return;
}

/*
 * TEAM VALIDATION
 */
if (
  eventEditor.participation_mode !==
  "individual"
) {
  if (
    !eventEditor.team_size ||
    Number(eventEditor.team_size) < 2
  ) {
    onError(
      "Indiquez le nombre de membres par équipe (minimum 2)."
    );
    return;
  }

  if (
    !eventEditor.team_scoring_method
  ) {
    onError(
      "Sélectionnez la méthode de classement par équipe."
    );
    return;
  }
}

/*
 * MIXED-CATEGORY TEAM VALIDATION
 */
if (
  eventEditor.participation_mode ===
  "team_mixed_categories"
) {
  const requirements =
    eventEditor.team_requirements || [];

  const total =
    requirements.reduce(
      (sum, item) =>
        sum +
        Number(
          item.members_required || 0
        ),
      0
    );

  if (!requirements.length) {
    onError(
      "Définissez la composition de l'équipe mixte."
    );
    return;
  }

  if (
    total !==
    Number(eventEditor.team_size)
  ) {
    onError(
      `La composition prévoit ${total} membre(s), mais la taille de l'équipe est ${eventEditor.team_size}.`
    );
    return;
  }
}

try {
      setSavingEvent(true);
      onError("");
      onSuccess("");

      const { data, error } =
        await supabase.rpc(
          "admin_save_competition_event",
          {
            p_competition_year:
              Number(
                competitionYear
              ),

            p_event_id:
              eventEditor.id ||
              null,

            p_phase_id:
              eventEditor.phase_id,

            p_name:
              eventEditor.name,

            p_description:
              eventEditor.description ||
              null,

            p_instructions:
              eventEditor.instructions ||
              null,

            p_scoring_type:
              eventEditor.scoring_type,

            p_max_participants:
              eventEditor
                .max_participants ===
              ""
                ? null
                : Number(
                    eventEditor
                      .max_participants
                  ),

            p_sort_order:
              Number(
                eventEditor.sort_order ||
                  0
              ),

            p_is_active:
              eventEditor.is_active,

            p_category_ids:
              eventEditor.category_ids,

            p_level_ids:
              eventEditor.level_ids,

            p_participation_mode:
              eventEditor.participation_mode,

            p_team_size:
              eventEditor.participation_mode ===
              "individual"
                ? null
                : Number(
                    eventEditor.team_size
                  ),

            p_team_scoring_method:
              eventEditor.participation_mode ===
              "individual"
                ? null
                : eventEditor.team_scoring_method,

            p_team_requirements:
              eventEditor.participation_mode ===
              "team_mixed_categories"
                ? eventEditor.team_requirements
                : [],
          }
        );

      if (error) throw error;

const savedEventId =
  data?.event_id ||
  eventEditor.id;

if (!savedEventId) {
  throw new Error(
    "L'identifiant de l'épreuve enregistrée est introuvable."
  );
}

const {
  error: groupError,
} = await supabase.rpc(
  "admin_set_competition_event_group",
  {
    p_event_id:
      savedEventId,

    p_event_group_id:
      eventEditor.event_group_id ||
      null,
  }
);

if (groupError) {
  throw groupError;
}

await onReload();

setEventEditor(null);

      onSuccess(
        `${data?.event_name || "Épreuve"} enregistrée avec succès.`
      );
    } catch (error) {
      console.error(
        "Competition event save error:",
        error
      );

      onError(
        error?.message ||
          "Impossible d'enregistrer l'épreuve."
      );
    } finally {
      setSavingEvent(false);
    }
  }

  async function loadEventTeams(
  eventId,
  silent = false
) {
  if (!eventId) return null;

  try {
    if (!silent) {
      setLoadingTeamEventId(eventId);
    }

    const { data, error } =
      await supabase.rpc(
        "get_admin_competition_event_teams",
        {
          p_competition_event_id:
            eventId,
        }
      );

    if (error) throw error;

    const result =
      data || {
        teams: [],
        challengers: [],
      };

    setEventTeams((current) => ({
      ...current,
      [eventId]: result,
    }));

    return result;
  } catch (error) {
    console.error(
      "Competition teams load error:",
      error
    );

    if (!silent) {
      onError(
        error?.message ||
          "Impossible de charger les équipes."
      );
    }

    return null;
  } finally {
    if (!silent) {
      setLoadingTeamEventId(null);
    }
  }
}


async function generateTeams(event) {
  if (
    !event?.id ||
    isHistorical ||
    generatingTeamEventId
  ) {
    return;
  }

  if (
    event.participation_mode ===
    "individual"
  ) {
    onError(
      "Cette épreuve n'est pas une épreuve par équipe."
    );
    return;
  }

  if (
    !event.team_size ||
    Number(event.team_size) < 2
  ) {
    onError(
      "Configurez d'abord la taille souhaitée de la formation."
    );
    return;
  }

  const alreadyGenerated =
    (eventTeams[event.id]?.teams?.length ||
      0) > 0;

  const confirmed = window.confirm(
    alreadyGenerated
      ? `Les équipes de « ${event.name} » existent déjà. Voulez-vous les régénérer ? La composition actuelle sera remplacée.`
      : `Générer automatiquement les équipes pour « ${event.name} » ?`
  );

  if (!confirmed) return;

  try {
    setGeneratingTeamEventId(event.id);

    onError("");
    onSuccess("");

    const { data, error } =
      await supabase.rpc(
        "generate_competition_event_teams",
        {
          p_competition_event_id:
            event.id,
        }
      );

    if (error) throw error;

    const result =
      Array.isArray(data)
        ? data[0]
        : data;

    await loadEventTeams(
      event.id,
      true
    );

    onSuccess(
      `${event.name} : ${Number(
        result?.teams_created || 0
      )} équipe(s) générée(s), ${Number(
        result?.core_members_assigned || 0
      )} participant(s) dans les formations initiales, ${Number(
        result?.challengers || 0
      )} challenger(s).`
    );
  } catch (error) {
    console.error(
      "Competition team generation error:",
      error
    );

    onError(
      error?.message ||
        "Impossible de générer les équipes."
    );
  } finally {
    setGeneratingTeamEventId(null);
  }
}

async function generateChallengerTeams(event) {
  if (
    !event?.id ||
    isHistorical ||
    generatingTeamEventId
  ) {
    return;
  }

  const waitingChallengers =
    (eventTeams[event.id]?.challengers || []).filter(
      (challenger) =>
        challenger.status === "waiting"
    );

  if (!waitingChallengers.length) {
    onError(
      "Aucun Challenger en attente pour cette épreuve."
    );
    return;
  }

  const confirmed = window.confirm(
    `Former les équipes Challenger pour « ${event.name} » ?\n\n` +
      `${waitingChallengers.length} Challenger${
        waitingChallengers.length > 1 ? "s" : ""
      } en attente.\n\n` +
      "Les équipes originales resteront inchangées."
  );

  if (!confirmed) return;

  try {
    setGeneratingTeamEventId(event.id);

    onError("");
    onSuccess("");

    const { data, error } =
      await supabase.rpc(
        "generate_competition_challenger_teams",
        {
          p_competition_event_id:
            event.id,
        }
      );

    if (error) throw error;

    const result =
      Array.isArray(data)
        ? data[0]
        : data;

    await loadEventTeams(
      event.id,
      true
    );

    onSuccess(
      `${event.name} : ${Number(
        result?.created_teams || 0
      )} équipe(s) Challenger créée(s), ${Number(
        result?.assigned_challengers || 0
      )} Challenger(s) assigné(s).`
    );
  } catch (error) {
    console.error(
      "Competition challenger team generation error:",
      error
    );

    onError(
      error?.message ||
        "Impossible de former les équipes Challenger."
    );
  } finally {
    setGeneratingTeamEventId(null);
  }
}


useEffect(() => {
  let cancelled = false;

  const teamEvents =
    phases.flatMap((phase) =>
      (phase.events || []).filter(
        (event) =>
          event.participation_mode !==
          "individual"
      )
    );

  if (!teamEvents.length) {
    setEventTeams({});
    return undefined;
  }

  async function loadAllTeams() {
    const results =
      await Promise.all(
        teamEvents.map(async (event) => {
          try {
            const { data, error } =
              await supabase.rpc(
                "get_admin_competition_event_teams",
                {
                  p_competition_event_id:
                    event.id,
                }
              );

            if (error) throw error;

            return [
              event.id,
              data || {
                teams: [],
                challengers: [],
              },
            ];
          } catch (error) {
            console.error(
              `Unable to load teams for event ${event.id}:`,
              error
            );

            return [
              event.id,
              {
                teams: [],
                challengers: [],
              },
            ];
          }
        })
      );

    if (cancelled) return;

    setEventTeams(
      Object.fromEntries(results)
    );
  }

  loadAllTeams();

  return () => {
    cancelled = true;
  };
}, [phases]);


if (loading) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">
        Chargement des épreuves…
      </p>
    </div>
  );
}

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-aquaBlue">
            Épreuves
          </h3>

          <p className="mt-1 text-sm text-gray-500">
            Configuration des phases,
            des épreuves et des critères
            d'admissibilité pour{" "}
            {competitionYear}.
          </p>
        </div>

        {!isHistorical && (
          <button
            type="button"
            onClick={newPhase}
            className="rounded-xl bg-aquaBlue px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            + Ajouter une phase
          </button>
        )}
      </div>

      {isHistorical && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Cette compétition est
          historique. La configuration
          est en lecture seule.
        </div>
      )}

      {/* EVENT GROUPS */}
<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h4 className="font-bold text-gray-900">
        Catégories d'épreuves
      </h4>

      <p className="mt-1 text-sm text-gray-500">
        Classez les épreuves par type :
        respiration, flottaison,
        déplacement, relais, etc.
      </p>
    </div>

    {!isHistorical && (
      <button
        type="button"
        onClick={newEventGroup}
        className="rounded-xl bg-aquaBlue px-4 py-2 text-sm font-semibold text-white"
      >
        + Catégorie d'épreuve
      </button>
    )}
  </div>

  <div className="mt-4 flex flex-wrap gap-2">
    {(eventGroups || []).map(
      (group) => (
        <div
          key={group.id}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
            group.is_active
              ? "border-blue-200 bg-blue-50"
              : "border-gray-200 bg-gray-50 opacity-60"
          }`}
        >
          <div>
            <p className="text-sm font-bold text-gray-800">
              {group.name}
            </p>

            {!group.is_active && (
              <p className="text-[10px] font-bold uppercase text-gray-400">
                Inactive
              </p>
            )}
          </div>

          {!isHistorical && (
            <>
              <button
                type="button"
                onClick={() =>
                  editEventGroup(
                    group
                  )
                }
                className="text-xs font-semibold text-aquaBlue"
              >
                Modifier
              </button>

              <button
                type="button"
                onClick={() =>
                  toggleEventGroupActive(
                    group
                  )
                }
                className={`text-xs font-semibold ${
                  group.is_active
                    ? "text-red-600"
                    : "text-green-600"
                }`}
              >
                {group.is_active
                  ? "Supprimer"
                  : "Restaurer"}
              </button>
            </>
          )}
        </div>
      )
    )}
  </div>
</div>

{eventGroupEditor &&
  !isHistorical && (
    <EventGroupEditor
      group={eventGroupEditor}
      setGroup={
        setEventGroupEditor
      }
      saving={
        savingEventGroup
      }
      onSave={
        saveEventGroup
      }
      onCancel={() =>
        setEventGroupEditor(
          null
        )
      }
    />
  )}

      {/* PHASES */}
{!phases.length ? (
  <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm italic text-gray-500 shadow-sm">
    Aucune phase configurée.
  </div>
) : (
  <div className="space-y-4">
    {phases.map((phase) => {
      const isCollapsed =
        collapsedPhases[
          phase.id
        ] === true;

      const phaseEventEditor =
        eventEditor &&
        eventEditor.phase_id ===
          phase.id
          ? eventEditor
          : null;

      return (
        <section
          key={phase.id}
          className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
            phase.is_active
              ? "border-blue-100"
              : "border-gray-200 opacity-70"
          }`}
        >
          {/* PHASE HEADER */}
          <div
            className={`flex items-center gap-3 px-5 py-4 ${
              !isCollapsed
                ? "border-b"
                : ""
            } ${
              phase.is_active
                ? "border-blue-100 bg-blue-50"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            {/* COLLAPSE BUTTON */}
            <button
              type="button"
              onClick={() =>
                togglePhaseCollapsed(
                  phase.id
                )
              }
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                  isCollapsed
                    ? "border-gray-200 bg-white text-gray-500"
                    : "border-blue-200 bg-white text-aquaBlue"
                }`}
              >
                {isCollapsed
                  ? "▾"
                  : "▴"}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-bold text-aquaBlue">
                    {phase.name}
                  </h4>

                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-blue-700 shadow-sm">
                    {phase.events?.length ||
                      0}{" "}
                    épreuve
                    {(phase.events
                      ?.length ||
                      0) > 1
                      ? "s"
                      : ""}
                  </span>

                  {!phase.is_active && (
                    <span className="rounded-full bg-gray-200 px-2 py-1 text-[10px] font-bold uppercase text-gray-600">
                      Inactive
                    </span>
                  )}
                </div>

                {phase.description && (
                  <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                    {
                      phase.description
                    }
                  </p>
                )}
              </div>
            </button>

            {/* ACTIONS */}
            {!isHistorical && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    editPhase(phase)
                  }
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-aquaBlue hover:bg-blue-50"
                >
                  Modifier
                </button>

                <button
                  type="button"
                  onClick={() =>
                    newEvent(phase)
                  }
                  className="rounded-lg bg-aquaBlue px-3 py-2 text-xs font-semibold text-white"
                >
                  + Épreuve
                </button>
              </div>
            )}
          </div>

          {/* PHASE CONTENT */}
          {!isCollapsed && (
            <div className="p-4">
              {!phase.events?.length &&
              !phaseEventEditor ? (
                <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm italic text-gray-400">
                  Aucune épreuve dans
                  cette phase.
                </p>
              ) : (
                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {phase.events?.map(
                    (event) => {
                      const isEditing =
                        eventEditor?.id ===
                        event.id;

                      /*
                       * Replace the clicked
                       * card by its editor.
                       */
                      if (isEditing) {
                        return (
                          <div
                            key={
                              event.id
                            }
                            className="md:col-span-2 xl:col-span-3 2xl:col-span-4"
                          >
                            <EventEditor
                              event={
                                eventEditor
                              }
                              setEvent={
                                setEventEditor
                              }
                              phases={
                                phases
                              }
                              categories={
                                categories
                              }
                              levels={
                                levels
                              }
                              eventGroups={
                                eventGroups
                              }
                              saving={
                                savingEvent
                              }
                              onToggleCategory={
                                toggleEventCategory
                              }
                              onToggleLevel={
                                toggleEventLevel
                              }
                              onSave={
                                saveEvent
                              }
                              onCancel={() =>
                                setEventEditor(
                                  null
                                )
                              }
                            />
                          </div>
                        );
                      }

                      return (
                        <EventConfigCard
                          key={
                            event.id
                          }
                          event={
                            event
                          }
                          categories={
                            categories
                          }
                          levels={
                            levels
                          }
                          isHistorical={
                            isHistorical
                          }
                          onEdit={() =>
                            editEvent(
                              event
                            )
                          }
                          onGenerateTeams={() =>
                            generateTeams(
                              event
                            )
                          }
                          onGenerateChallengerTeams={() =>
                            generateChallengerTeams(
                              event
                            )
                          }
                          generatingTeams={
                            generatingTeamEventId ===
                            event.id
                          }
                          loadingTeams={
                            loadingTeamEventId ===
                            event.id
                          }
                          teamData={
                            eventTeams[
                              event.id
                            ] ||
                            null
                          }
                        />
                      );
                    }
                  )}

                  {/* NEW EVENT */}
                  {phaseEventEditor &&
                    !phaseEventEditor.id && (
                      <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
                        <EventEditor
                          event={
                            phaseEventEditor
                          }
                          setEvent={
                            setEventEditor
                          }
                          phases={
                            phases
                          }
                          categories={
                            categories
                          }
                          levels={
                            levels
                          }
                          eventGroups={
                            eventGroups
                          }
                          saving={
                            savingEvent
                          }
                          onToggleCategory={
                            toggleEventCategory
                          }
                          onToggleLevel={
                            toggleEventLevel
                          }
                          onSave={
                            saveEvent
                          }
                          onCancel={() =>
                            setEventEditor(
                              null
                            )
                          }
                        />
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </section>
      );
    })}
  </div>
)}

      {/* PHASE EDITOR */}
      {phaseEditor &&
        !isHistorical && (
          <div className="rounded-2xl border-2 border-aquaBlue bg-white p-6 shadow-lg">
            <div className="mb-5 flex items-center justify-between">
              <h4 className="text-lg font-bold text-aquaBlue">
                {phaseEditor.id
                  ? "Modifier la phase"
                  : "Nouvelle phase"}
              </h4>

              <button
                type="button"
                onClick={() =>
                  setPhaseEditor(
                    null
                  )
                }
                className="text-sm font-semibold text-gray-500"
              >
                Fermer ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700">
                  Nom *
                </span>

                <input
                  value={
                    phaseEditor.name
                  }
                  onChange={(e) =>
                    setPhaseEditor({
                      ...phaseEditor,
                      name:
                        e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </label>

              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700">
                  Ordre
                </span>

                <input
                  type="number"
                  value={
                    phaseEditor.sort_order
                  }
                  onChange={(e) =>
                    setPhaseEditor({
                      ...phaseEditor,
                      sort_order:
                        e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="md:col-span-2">
                <span className="mb-1 block text-sm font-semibold text-gray-700">
                  Description
                </span>

                <textarea
                  rows={3}
                  value={
                    phaseEditor.description
                  }
                  onChange={(e) =>
                    setPhaseEditor({
                      ...phaseEditor,
                      description:
                        e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={
                    phaseEditor.is_active
                  }
                  onChange={(e) =>
                    setPhaseEditor({
                      ...phaseEditor,
                      is_active:
                        e.target.checked,
                    })
                  }
                />

                <span className="text-sm font-semibold text-gray-700">
                  Phase active
                </span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() =>
                  setPhaseEditor(null)
                }
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={savePhase}
                disabled={savingPhase}
                className="rounded-xl bg-aquaBlue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingPhase
                  ? "Enregistrement…"
                  : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

function EventConfigCard({
  event,
  categories,
  levels,
  isHistorical,
  onEdit,
  onGenerateTeams,
  onGenerateChallengerTeams,
  generatingTeams,
  loadingTeams,
  teamData,
}) {
  const hasGeneratedTeams =
    (teamData?.teams?.length || 0) > 0;

  const waitingChallengerCount =
    (teamData?.challengers || []).filter(
      (challenger) =>
        challenger.status === "waiting"
    ).length;

  const [
  showTeamDetails,
  setShowTeamDetails,
] = useState(false);
  
  const eventCategories =
    categories.filter(
      (category) =>
        event.category_ids?.includes(
          category.id
        )
    );

  const eventLevels =
    levels.filter(
      (level) =>
        event.level_ids?.includes(
          level.id
        )
    );

  const participationModeLabel =
  PARTICIPATION_MODES.find(
    (mode) =>
      mode.value ===
      event.participation_mode
  )?.label || "Individuelle";

const teamScoringLabel =
  TEAM_SCORING_METHODS.find(
    (method) =>
      method.value ===
      event.team_scoring_method
  )?.label || null;

  return (
    <div
  className={`flex h-full min-w-0 flex-col rounded-xl border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
    event.is_active
      ? "border-gray-200"
      : "border-gray-200 bg-gray-50 opacity-70"
  }`}
>
      <div className="flex h-full flex-col gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="font-bold text-gray-900">
              {event.name}
            </h5>

            {!event.is_active && (
              <span className="rounded-full bg-gray-200 px-2 py-1 text-[10px] font-bold uppercase text-gray-600">
                Inactive
              </span>
            )}

            {event.participation_mode ===
"individual" ? (
  <span className="rounded-full bg-cyan-100 px-2 py-1 text-[10px] font-semibold text-cyan-700">
    {scoringTypeLabel(
      event.scoring_type
    )}
  </span>
) : (
  <span className="rounded-full bg-purple-100 px-2 py-1 text-[10px] font-semibold text-purple-700">
    {participationModeLabel}
  </span>
)}
          </div>

          {event.description && (
            <p className="mt-2 text-sm text-gray-600">
              {event.description}
            </p>
          )}

          {event.instructions && (
            <p className="mt-2 text-xs text-gray-500">
              <span className="font-semibold">
                Instructions :
              </span>{" "}
              {event.instructions}
            </p>
          )}

          {event.participation_mode !==
  "individual" && (
  <div className="mt-3 rounded-lg border border-purple-100 bg-purple-50 p-3">
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
      <div>
        <span className="font-semibold text-purple-800">
  Formation souhaitée :
</span>{" "}
<span className="text-purple-700">
  {event.team_size || "—"} membres
</span>
      </div>
      <div>
        <span className="font-semibold text-purple-800">
          Classement :
        </span>{" "}
        <span className="text-purple-700">
          {teamScoringLabel || "—"}
        </span>
      </div>
    </div>

    {event.participation_mode ===
      "team_mixed_categories" &&
      event.team_requirements
        ?.length > 0 && (
        <div className="mt-3 border-t border-purple-200 pt-2">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-purple-600">
            Composition
          </p>

          <div className="flex flex-wrap gap-2">
            {event.team_requirements.map(
              (requirement) => {
                const category =
                  categories.find(
                    (item) =>
                      item.id ===
                      requirement.category_id
                  );

                return (
                  <span
                    key={
                      requirement.category_id
                    }
                    className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-purple-700"
                  >
                    {category?.code ||
                      category?.name ||
                      "Catégorie"}
                    {" × "}
                    {
                      requirement.members_required
                    }
                  </span>
                );
              }
            )}
          </div>
        </div>
      )}
  </div>
)}

{event.participation_mode !==
  "individual" && (
  <div className="mt-4">
    {loadingTeams ? (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
        Chargement des équipes…
      </div>
    ) : hasGeneratedTeams ? (
      <div>
        {/* COMPACT SUMMARY */}
        <button
          type="button"
          onClick={() =>
            setShowTeamDetails(
              (current) => !current
            )
          }
          className={`w-full rounded-xl border px-3 py-3 text-left transition ${
            showTeamDetails
              ? "border-purple-300 bg-purple-50"
              : "border-purple-100 bg-purple-50/50 hover:border-purple-200"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-purple-800">
                Équipes générées
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-purple-700">
                  {teamData.teams.length} équipe
                  {teamData.teams.length > 1
                    ? "s"
                    : ""}
                </span>

                <span className="text-gray-300">
                  •
                </span>

                <span
                  className={`text-xs ${
                    teamData.challengers?.length
                      ? "font-semibold text-orange-700"
                      : "text-green-700"
                  }`}
                >
                  {teamData.challengers?.length ||
                    0}{" "}
                  challenger
                  {(teamData.challengers?.length ||
                    0) > 1
                    ? "s"
                    : ""}
                </span>
              </div>
            </div>

            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-purple-200 bg-white text-xs font-bold text-purple-600">
              {showTeamDetails
                ? "▲"
                : "▼"}
            </span>
          </div>

          <p className="mt-2 text-[11px] font-semibold text-purple-600">
            {showTeamDetails
              ? "Masquer les équipes"
              : "Voir les équipes"}
          </p>
        </button>

        {/* DETAILS */}
        {showTeamDetails && (
          <div className="mt-3 space-y-4">
            {/* TEAMS */}
            <div className="grid grid-cols-1 gap-3">
              {teamData.teams.map(
                (team) => (
                  <div
                    key={team.id}
                    className="overflow-hidden rounded-xl border border-purple-200 bg-white"
                  >
                    <div className="flex items-center justify-between bg-purple-50 px-4 py-3">
                      <div>
                        <h6 className="font-bold text-purple-900">
                          {team.name}
                        </h6>

                        {team.category && (
                          <p className="text-xs text-purple-600">
                            {team.category.code
                              ? `${team.category.code} — `
                              : ""}
                            {team.category.name}
                          </p>
                        )}
                      </div>

                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-purple-700">
                        {team.members?.length ||
                          0}{" "}
                        membre
                        {(team.members?.length ||
                          0) > 1
                          ? "s"
                          : ""}
                      </span>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {(team.members || []).map(
                        (member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between gap-3 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-gray-900">
                                  {
                                    member.student_name
                                  }
                                </p>

                                {member.is_leader && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                                    Leader
                                  </span>
                                )}
                              </div>

                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                                {(member.category_code ||
                                  member.category_name) && (
                                  <span>
                                    {member.category_code ||
                                      member.category_name}
                                  </span>
                                )}

                                {member.level_name && (
                                  <>
                                    <span>
                                      •
                                    </span>

                                    <span>
                                      {
                                        member.level_name
                                      }
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* CHALLENGERS */}
            {(teamData.challengers?.length ||
              0) > 0 && (
              <div className="overflow-hidden rounded-xl border border-orange-200 bg-white">
                <div className="bg-orange-50 px-4 py-3">
                  <h6 className="font-bold text-orange-800">
                    Groupe Challenger
                  </h6>

                  <p className="mt-1 text-xs text-orange-600">
                    Ces élèves participeront
                    dans une formation
                    Challenger après la première
                    manche.
                  </p>
                </div>

                <div className="divide-y divide-orange-100">
                  {teamData.challengers.map(
                    (challenger) => (
                      <div
                        key={
                          challenger.id
                        }
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {
                              challenger.student_name
                            }
                          </p>

                          <p className="text-xs text-gray-500">
                            {challenger.category_code ||
                              challenger.category_name}

                            {challenger.level_name
                              ? ` • ${challenger.level_name}`
                              : ""}
                          </p>
                        </div>

                        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold uppercase text-orange-700">
                          En attente
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    ) : (
      <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50/50 p-3 text-xs text-purple-700">
        Les équipes n'ont pas encore été
        générées.
      </div>
    )}
  </div>
)}

          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                Catégories
              </p>

              <div className="flex flex-wrap gap-2">
                {eventCategories.map(
                  (category) => (
                    <span
                      key={
                        category.id
                      }
                      className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700"
                    >
                      {category.code ||
                        category.name}
                    </span>
                  )
                )}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                Niveaux
              </p>

              <div className="flex flex-wrap gap-2">
                {eventLevels.map(
                  (level) => (
                    <span
                      key={level.id}
                      className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700"
                    >
                      {level.name}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {!isHistorical && (
  <div className="mt-auto flex flex-wrap gap-2 border-t border-gray-100 pt-3">
    {event.participation_mode !==
      "individual" && (
      <button
        type="button"
        onClick={
          onGenerateTeams
        }
        disabled={
          generatingTeams ||
          !event.is_active
        }
        className="min-w-[140px] flex-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-purple-700 disabled:cursor-wait disabled:opacity-50"
      >
        {generatingTeams
          ? "Génération…"
          : hasGeneratedTeams
            ? "Régénérer les équipes"
            : "Générer les équipes"}
      </button>
    )}

    {event.participation_mode !==
      "individual" &&
      hasGeneratedTeams &&
      waitingChallengerCount > 0 && (
        <button
          type="button"
          onClick={
            onGenerateChallengerTeams
          }
          disabled={
            generatingTeams ||
            !event.is_active
          }
          className="min-w-[140px] flex-1 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-50"
        >
          {generatingTeams
            ? "Formation…"
            : `Former Challenger${
                waitingChallengerCount > 1
                  ? "s"
                  : ""
              } (${waitingChallengerCount})`}
        </button>
      )}

    <button
      type="button"
      onClick={onEdit}
      className="min-w-[100px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-aquaBlue hover:bg-blue-50"
    >
      Modifier
    </button>
  </div>
)}
      </div>
    </div>
  );
}

function EventEditor({
  event,
  setEvent,
  phases,
  categories,
  levels,
  eventGroups,
  saving,
  onToggleCategory,
  onToggleLevel,
  onSave,
  onCancel,
}) {
  const [
    criterionEditor,
    setCriterionEditor,
  ] = useState(null);

  const [
    savingCriterion,
    setSavingCriterion,
  ] = useState(false);

  function newCriterion() {
    setCriterionEditor({
      id: null,
      name: "",
      description: "",
      max_points: 5,
      sort_order:
        (event.criteria?.length || 0) +
        1,
      is_required: true,
      is_active: true,
    });
  }

  function editCriterion(
    criterion
  ) {
    setCriterionEditor({
      id: criterion.id,
      name:
        criterion.name || "",
      description:
        criterion.description || "",
      max_points:
        criterion.max_points ?? 5,
      sort_order:
        criterion.sort_order ?? 0,
      is_required:
        criterion.is_required !==
        false,
      is_active:
        criterion.is_active !==
        false,
    });
  }

  async function saveCriterion() {
    if (
      !event.id ||
      !criterionEditor?.name?.trim()
    ) {
      return;
    }

    try {
      setSavingCriterion(true);

      const { error } =
        await supabase.rpc(
          "admin_save_competition_event_criterion",
          {
            p_event_id:
              event.id,

            p_criterion_id:
              criterionEditor.id ||
              null,

            p_name:
              criterionEditor.name,

            p_description:
              criterionEditor.description ||
              null,

            p_max_points:
              Number(
                criterionEditor.max_points
              ),

            p_sort_order:
              Number(
                criterionEditor.sort_order ||
                  0
              ),

            p_is_required:
              criterionEditor.is_required,

            p_is_active:
              criterionEditor.is_active,
          }
        );

      if (error) throw error;

      window.location.reload();
    } catch (error) {
      console.error(
        "Criterion save error:",
        error
      );

      window.alert(
        error?.message ||
          "Impossible d'enregistrer le critère."
      );
    } finally {
      setSavingCriterion(false);
    }
  }

  async function deactivateCriterion(
    criterion
  ) {
    if (!criterion?.id) return;

    const confirmed =
      window.confirm(
        `Supprimer le critère « ${criterion.name} » ?`
      );

    if (!confirmed) return;

    const { error } =
      await supabase.rpc(
        "admin_deactivate_competition_event_criterion",
        {
          p_criterion_id:
            criterion.id,
        }
      );

    if (error) {
      window.alert(
        error.message
      );
      return;
    }

    window.location.reload();
  }

  return (
    <div className="rounded-2xl border-2 border-aquaBlue bg-white p-6 shadow-lg">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h4 className="text-lg font-bold text-aquaBlue">
            {event.id
              ? "Modifier l'épreuve"
              : "Nouvelle épreuve"}
          </h4>

          <p className="text-sm text-gray-500">
            Définissez l'épreuve et les
            élèves qui pourront la
            sélectionner.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-gray-500"
        >
          Fermer ✕
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Phase *
          </span>

          <select
            value={event.phase_id}
            onChange={(e) =>
              setEvent({
                ...event,
                phase_id:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          >
            <option value="">
              Sélectionner
            </option>

            {phases.map((phase) => (
              <option
                key={phase.id}
                value={phase.id}
              >
                {phase.name}
              </option>
            ))}
          </select>
        </label>

        <label>
  <span className="mb-1 block text-sm font-semibold text-gray-700">
    Catégorie d'épreuve
  </span>

  <select
    value={
      event.event_group_id ||
      ""
    }
    onChange={(e) =>
      setEvent({
        ...event,
        event_group_id:
          e.target.value,
      })
    }
    className="w-full rounded-xl border border-gray-300 px-3 py-2"
  >
    <option value="">
      Non classée
    </option>

    {(eventGroups || [])
      .filter(
        (group) =>
          group.is_active !== false ||
          group.id ===
            event.event_group_id
      )
      .sort(
        (a, b) =>
          Number(a.sort_order || 0) -
          Number(b.sort_order || 0)
      )
      .map((group) => (
        <option
          key={group.id}
          value={group.id}
        >
          {group.name}
          {group.is_active === false
            ? " — inactive"
            : ""}
        </option>
      ))}
  </select>
</label>

        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Nom *
          </span>

          <input
            value={event.name}
            onChange={(e) =>
              setEvent({
                ...event,
                name:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label>
  <span className="mb-1 block text-sm font-semibold text-gray-700">
    Mode de participation *
  </span>

  <select
    value={
      event.participation_mode
    }
    onChange={(e) => {
      const mode =
        e.target.value;

      setEvent({
        ...event,

        participation_mode:
          mode,

        scoring_type:
          mode === "individual"
            ? event.scoring_type ===
              "team"
              ? "completion"
              : event.scoring_type
            : "team",

        team_size:
          mode === "individual"
            ? ""
            : event.team_size,

        team_scoring_method:
          mode === "individual"
            ? ""
            : event.team_scoring_method,

        team_requirements:
  mode ===
  "team_mixed_categories"
    ? buildAutomaticTeamRequirements(
        event.category_ids,
        event.team_size
      )
    : [],
      });
    }}
    className="w-full rounded-xl border border-gray-300 px-3 py-2"
  >
    {PARTICIPATION_MODES.map(
      (mode) => (
        <option
          key={mode.value}
          value={mode.value}
        >
          {mode.label}
        </option>
      )
    )}
  </select>
</label>

{event.participation_mode ===
  "individual" && (
  <label>
    <span className="mb-1 block text-sm font-semibold text-gray-700">
      Type de résultat *
    </span>

    <select
      value={
        event.scoring_type
      }
      onChange={(e) =>
        setEvent({
          ...event,
          scoring_type:
            e.target.value,
        })
      }
      className="w-full rounded-xl border border-gray-300 px-3 py-2"
    >
      {SCORING_TYPES
        .filter(
          (type) =>
            type.value !== "team"
        )
        .map((type) => (
          <option
            key={type.value}
            value={type.value}
          >
            {type.label}
          </option>
        ))}
    </select>
  </label>
)}

        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Ordre
          </span>

          <input
            type="number"
            value={
              event.sort_order
            }
            onChange={(e) =>
              setEvent({
                ...event,
                sort_order:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Nombre maximum de participants
          </span>

          <input
            type="number"
            min="1"
            value={
              event.max_participants
            }
            onChange={(e) =>
              setEvent({
                ...event,
                max_participants:
                  e.target.value,
              })
            }
            placeholder="Sans limite"
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex items-end gap-3 pb-2">
          <input
            type="checkbox"
            checked={
              event.is_active
            }
            onChange={(e) =>
              setEvent({
                ...event,
                is_active:
                  e.target.checked,
              })
            }
          />

          <span className="text-sm font-semibold text-gray-700">
            Épreuve active
          </span>
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Description
          </span>

          <textarea
            rows={3}
            value={
              event.description
            }
            onChange={(e) =>
              setEvent({
                ...event,
                description:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Instructions
          </span>

          <textarea
            rows={3}
            value={
              event.instructions
            }
            onChange={(e) =>
              setEvent({
                ...event,
                instructions:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>
      </div>

      {event.scoring_type ===
  "technical_score" && (
  <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h5 className="font-bold text-emerald-900">
          Critères d'évaluation
        </h5>

        <p className="mt-1 text-xs text-emerald-700">
          Définissez les éléments
          évalués et le maximum de
          points accordé à chacun.
        </p>
      </div>

      {event.id && (
        <button
          type="button"
          onClick={newCriterion}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
        >
          + Critère
        </button>
      )}
    </div>

    {!event.id && (
      <p className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 text-sm text-emerald-800">
        Enregistrez d'abord
        l'épreuve avant d'ajouter
        ses critères.
      </p>
    )}

    {event.id && (
      <>
        <div className="mt-4 space-y-2">
          {(event.criteria || [])
            .filter(
              (criterion) =>
                criterion.is_active !==
                false
            )
            .sort(
              (a, b) =>
                Number(
                  a.sort_order || 0
                ) -
                Number(
                  b.sort_order || 0
                )
            )
            .map(
              (criterion) => (
                <div
                  key={
                    criterion.id
                  }
                  className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      {
                        criterion.name
                      }
                    </p>

                    {criterion.description && (
                      <p className="mt-1 text-xs text-gray-500">
                        {
                          criterion.description
                        }
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
                      /
                      {
                        criterion.max_points
                      }
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        editCriterion(
                          criterion
                        )
                      }
                      className="text-xs font-semibold text-aquaBlue"
                    >
                      Modifier
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        deactivateCriterion(
                          criterion
                        )
                      }
                      className="text-xs font-semibold text-red-600"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              )
            )}
        </div>

        <div className="mt-4 flex justify-end border-t border-emerald-200 pt-3">
          <span className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white">
            Total /{" "}
            {(
              event.criteria || []
            )
              .filter(
                (criterion) =>
                  criterion.is_active !==
                  false
              )
              .reduce(
                (sum, criterion) =>
                  sum +
                  Number(
                    criterion.max_points ||
                      0
                  ),
                0
              )}
          </span>
        </div>
      </>
    )}

    {criterionEditor && (
      <CriterionEditor
        criterion={
          criterionEditor
        }
        setCriterion={
          setCriterionEditor
        }
        saving={
          savingCriterion
        }
        onSave={
          saveCriterion
        }
        onCancel={() =>
          setCriterionEditor(
            null
          )
        }
      />
    )}
  </div>
)}

      {event.participation_mode !==
  "individual" && (
  <div className="mt-6 rounded-xl border border-purple-200 bg-purple-50 p-4">
    <h5 className="font-bold text-purple-800">
      Configuration de l'équipe
    </h5>

    <p className="mt-1 text-xs text-purple-700">
      Définissez la taille des équipes
      et la méthode utilisée pour les
      classer.
    </p>

    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <label>
        <span className="mb-1 block text-sm font-semibold text-gray-700">
          Membres par équipe *
        </span>

        <input
          type="number"
          min="2"
          value={
            event.team_size
          }
          onChange={(e) => {
  const teamSize =
    e.target.value;

  setEvent({
    ...event,

    team_size: teamSize,

    team_requirements:
      event.participation_mode ===
      "team_mixed_categories"
        ? buildAutomaticTeamRequirements(
            event.category_ids,
            teamSize
          )
        : [],
  });
}}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2"
        />
      </label>

      <label>
        <span className="mb-1 block text-sm font-semibold text-gray-700">
          Méthode de classement *
        </span>

        <select
          value={
            event.team_scoring_method
          }
          onChange={(e) =>
            setEvent({
              ...event,
              team_scoring_method:
                e.target.value,
            })
          }
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2"
        >
          <option value="">
            Sélectionner
          </option>

          {TEAM_SCORING_METHODS.map(
            (method) => (
              <option
                key={method.value}
                value={method.value}
              >
                {method.label}
              </option>
            )
          )}
        </select>
      </label>
    </div>
  </div>
)}

      {/* CATEGORIES */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800">
  Groupes de participants admissibles
</p>

          <button
            type="button"
            onClick={() =>
              setEvent({
                ...event,

                category_ids:
                  event
                    .category_ids
                    .length ===
                  categories.length
                    ? []
                    : categories.map(
                        (category) =>
                          category.id
                      ),
              })
            }
            className="text-xs font-semibold text-aquaBlue"
          >
            {event.category_ids
              .length ===
            categories.length
              ? "Tout décocher"
              : "Tout sélectionner"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categories.map(
            (category) => {
              const checked =
                event.category_ids.includes(
                  category.id
                );

              return (
                <label
                  key={
                    category.id
                  }
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    checked
                      ? "border-blue-300 bg-blue-50"
                      : "border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={
                      checked
                    }
                    onChange={() =>
                      onToggleCategory(
                        category.id
                      )
                    }
                  />

                  <span className="text-sm font-semibold">
                    {category.code
                      ? `${category.code} — `
                      : ""}
                    {category.name}
                  </span>
                </label>
              );
            }
          )}
        </div>
      </div>

      {/* MIXED TEAM COMPOSITION */}
{event.participation_mode ===
  "team_mixed_categories" && (
  <div className="mt-6 rounded-xl border border-purple-200 bg-purple-50 p-4">
    <h5 className="font-bold text-purple-800">
      Composition de chaque équipe
    </h5>

    <p className="mt-1 text-xs text-purple-700">
      La composition est calculée
      automatiquement selon les catégories
      admissibles et le nombre de membres
      par équipe.
    </p>

    <div className="mt-4 space-y-3">
      {event.team_requirements?.map(
        (requirement) => {
          const category =
            categories.find(
              (item) =>
                item.id ===
                requirement.category_id
            );

          return (
            <div
              key={
                requirement.category_id
              }
              className="flex items-center justify-between gap-4 rounded-lg border border-purple-100 bg-white p-3"
            >
              <span className="font-semibold text-gray-800">
                {category?.code
                  ? `${category.code} — `
                  : ""}
                {category?.name ||
                  "Catégorie"}
              </span>

              <span className="rounded-lg bg-purple-100 px-4 py-2 text-sm font-bold text-purple-800">
                {
                  requirement.members_required
                }{" "}
                membre
                {Number(
                  requirement.members_required
                ) > 1
                  ? "s"
                  : ""}
              </span>
            </div>
          );
        }
      )}
    </div>

    <div className="mt-4 flex items-center justify-between border-t border-purple-200 pt-3">
      <span className="text-sm font-semibold text-purple-800">
        Total prévu
      </span>

      <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
        {(
          event.team_requirements ||
          []
        ).reduce(
          (sum, item) =>
            sum +
            Number(
              item.members_required || 0
            ),
          0
        )}{" "}
        / {event.team_size || 0}
      </span>
    </div>
  </div>
)}

      {/* LEVELS */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800">
            Niveaux admissibles
          </p>

          <button
            type="button"
            onClick={() =>
              setEvent({
                ...event,

                level_ids:
                  event.level_ids
                    .length ===
                  levels.length
                    ? []
                    : levels.map(
                        (level) =>
                          level.id
                      ),
              })
            }
            className="text-xs font-semibold text-aquaBlue"
          >
            {event.level_ids
              .length ===
            levels.length
              ? "Tout décocher"
              : "Tout sélectionner"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {levels.map((level) => {
            const checked =
              event.level_ids.includes(
                level.id
              );

            return (
              <label
                key={level.id}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  checked
                    ? "border-green-300 bg-green-50"
                    : "border-gray-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={
                    checked
                  }
                  onChange={() =>
                    onToggleLevel(
                      level.id
                    )
                  }
                />

                <span className="text-sm font-semibold">
                  {level.name}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
        >
          Annuler
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-aquaBlue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving
            ? "Enregistrement…"
            : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function EventGroupEditor({
  group,
  setGroup,
  saving,
  onSave,
  onCancel,
}) {
  return (
    <div className="rounded-2xl border-2 border-aquaBlue bg-white p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-aquaBlue">
          {group.id
            ? "Modifier la catégorie d'épreuve"
            : "Nouvelle catégorie d'épreuve"}
        </h4>

        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-gray-500"
        >
          Fermer ✕
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Nom *
          </span>

          <input
            value={group.name}
            onChange={(e) =>
              setGroup({
                ...group,
                name:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Ordre
          </span>

          <input
            type="number"
            value={
              group.sort_order
            }
            onChange={(e) =>
              setGroup({
                ...group,
                sort_order:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Description
          </span>

          <textarea
            rows={3}
            value={
              group.description
            }
            onChange={(e) =>
              setGroup({
                ...group,
                description:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold"
        >
          Annuler
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-aquaBlue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving
            ? "Enregistrement…"
            : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function CriterionEditor({
  criterion,
  setCriterion,
  saving,
  onSave,
  onCancel,
}) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-300 bg-white p-4">
      <h6 className="font-bold text-emerald-900">
        {criterion.id
          ? "Modifier le critère"
          : "Nouveau critère"}
      </h6>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Critère *
          </span>

          <input
            value={
              criterion.name
            }
            onChange={(e) =>
              setCriterion({
                ...criterion,
                name:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Points maximum *
          </span>

          <input
            type="number"
            min="0.01"
            step="0.5"
            value={
              criterion.max_points
            }
            onChange={(e) =>
              setCriterion({
                ...criterion,
                max_points:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Ordre
          </span>

          <input
            type="number"
            value={
              criterion.sort_order
            }
            onChange={(e) =>
              setCriterion({
                ...criterion,
                sort_order:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex items-center gap-3 pt-6">
          <input
            type="checkbox"
            checked={
              criterion.is_required
            }
            onChange={(e) =>
              setCriterion({
                ...criterion,
                is_required:
                  e.target.checked,
              })
            }
          />

          <span className="text-sm font-semibold text-gray-700">
            Critère obligatoire
          </span>
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-gray-700">
            Description
          </span>

          <textarea
            rows={3}
            value={
              criterion.description
            }
            onChange={(e) =>
              setCriterion({
                ...criterion,
                description:
                  e.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold"
        >
          Annuler
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving
            ? "Enregistrement…"
            : "Enregistrer le critère"}
        </button>
      </div>
    </div>
  );
}

function ParticipantsSection({
  assignments,
  levels,
  savingLevelId,
  onLevelChange,

  isHistorical,

  syncingParticipants,
  onSyncParticipants,

  expandedAssignmentId,
  assignmentEvents,
  assignmentEventsLoadingId,
  onToggleAssignment,
}) {
  const sorted = [...assignments].sort(
    (a, b) => {
      const categoryA =
        a.category?.sort_order ?? 999;

      const categoryB =
        b.category?.sort_order ?? 999;

      if (categoryA !== categoryB) {
        return categoryA - categoryB;
      }

      const levelA =
        a.level?.sort_order ?? 999;

      const levelB =
        b.level?.sort_order ?? 999;

      if (levelA !== levelB) {
        return levelA - levelB;
      }

      return String(
        a.student?.full_name || ""
      ).localeCompare(
        String(
          b.student?.full_name || ""
        ),
        "fr",
        {
          sensitivity: "base",
        }
      );
    }
  );

  /*
   * Structure:
   *
   * Category
   *   -> Level
   *       -> Students
   */
  const grouped = [];

  sorted.forEach((row) => {
    const categoryId =
      row.category?.id || "unknown";

    let categoryGroup =
      grouped.find(
        (group) =>
          group.id === categoryId
      );

    if (!categoryGroup) {
      categoryGroup = {
        id: categoryId,

        code:
          row.category?.code || "",

        name:
          row.category?.name ||
          "Catégorie inconnue",

        sortOrder:
          row.category?.sort_order ??
          999,

        rows: [],
        levels: [],
      };

      grouped.push(
        categoryGroup
      );
    }

    categoryGroup.rows.push(row);

    const levelKey =
      row.level_id ||
      "__no_level__";

    let levelGroup =
      categoryGroup.levels.find(
        (group) =>
          group.id === levelKey
      );

    if (!levelGroup) {
      levelGroup = {
        id: levelKey,

        name:
          row.level?.name ||
          row.level_name_snapshot ||
          "Niveau à déterminer",

        sortOrder:
          row.level?.sort_order ??
          999,

        rows: [],
      };

      categoryGroup.levels.push(
        levelGroup
      );
    }

    levelGroup.rows.push(row);
  });

  return (
    <div className="space-y-6">
      {isHistorical && (
  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
    Cette compétition est historique.
    Les participants et leurs niveaux
    sont en lecture seule.
  </div>
)}
      {/* HEADER */}
<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h3 className="text-lg font-bold text-aquaBlue">
        Participants
      </h3>

      <p className="mt-1 text-sm text-gray-500">
        {assignments.length} élève
        {assignments.length > 1
          ? "s"
          : ""}{" "}
        admissible
        {assignments.length > 1
          ? "s"
          : ""}
      </p>
    </div>

    {!isHistorical && (
      <button
        type="button"
        onClick={
          onSyncParticipants
        }
        disabled={
          syncingParticipants
        }
        className="rounded-xl bg-aquaBlue px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
      >
        {syncingParticipants
          ? "Synchronisation…"
          : "Synchroniser les participants"}
      </button>
    )}
  </div>

  {!isHistorical && (
    <p className="mt-3 max-w-3xl text-xs text-gray-500">
      Recalcule les élèves admissibles
      selon les inscriptions, les cours,
      les catégories et les règles
      d’âge de cette compétition.
      Les réponses déjà enregistrées
      sont conservées.
    </p>
  )}
</div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm italic text-gray-500">
            Aucun élève admissible.
          </p>
        </div>
      ) : (
        grouped.map(
          (categoryGroup) => (
            <section
              key={categoryGroup.id}
              className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
            >
              {/* CATEGORY HEADER */}
              <div className="flex flex-col gap-2 border-b border-blue-100 bg-blue-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-aquaBlue">
                    {categoryGroup.code
                      ? `${categoryGroup.code} — `
                      : ""}
                    {
                      categoryGroup.name
                    }
                  </h3>
                </div>

                <span className="inline-flex w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm">
                  {
                    categoryGroup.rows
                      .length
                  }{" "}
                  élève
                  {categoryGroup.rows
                    .length > 1
                    ? "s"
                    : ""}
                </span>
              </div>

              {/* LEVEL GROUPS */}
              <div className="space-y-6 p-4">
                {categoryGroup.levels.map(
                  (levelGroup) => (
                    <div
                      key={
                        levelGroup.id
                      }
                      className="overflow-hidden rounded-xl border border-gray-200"
                    >
                      {/* LEVEL HEADER */}
                      <div
                        className={`flex items-center justify-between px-4 py-3 ${
                          levelGroup.id ===
                          "__no_level__"
                            ? "bg-orange-50"
                            : "bg-gray-50"
                        }`}
                      >
                        <h4
                          className={`font-semibold ${
                            levelGroup.id ===
                            "__no_level__"
                              ? "text-orange-700"
                              : "text-gray-800"
                          }`}
                        >
                          {
                            levelGroup.name
                          }
                        </h4>

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600">
                          {
                            levelGroup.rows
                              .length
                          }
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-[1000px] w-full text-sm">
                          <thead className="border-t border-gray-200 bg-white">
                            <tr>
                              <th className="px-4 py-3 text-left">
                                Élève
                              </th>

                              <th className="px-4 py-3 text-left">
                                Cours
                              </th>

                              <th className="px-4 py-3 text-left">
                                Niveau
                              </th>

                              <th className="px-4 py-3 text-left">
                                Participation
                              </th>

                              <th className="px-4 py-3 text-center">
                                Épreuves
                              </th>

                              <th className="px-4 py-3 text-right">
                                Détails
                              </th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-gray-100">
                            {levelGroup.rows.map(
                              (row) => {
                                const isExpanded =
                                  expandedAssignmentId ===
                                  row.id;

                                const events =
                                  assignmentEvents[
                                    row.id
                                  ] || [];

                                const eventsLoading =
                                  assignmentEventsLoadingId ===
                                  row.id;

                                return (
                                  <Fragment
                                    key={
                                      row.id
                                    }
                                  >
                                    {/* STUDENT */}
                                    <tr className="hover:bg-gray-50">
                                      <td className="px-4 py-3">
                                        <div className="font-semibold text-gray-900">
                                          {row
                                            .student
                                            ?.full_name ||
                                            "Élève inconnu"}
                                        </div>

                                        {row
                                          .student
                                          ?.is_active ===
                                          false && (
                                          <span className="mt-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                            Profil
                                            inactif
                                          </span>
                                        )}
                                      </td>

                                      {/* SOURCE COURSE */}
                                      <td className="px-4 py-3 text-gray-700">
                                        {row
                                          .course
                                          ?.name ||
                                          "—"}
                                      </td>

                                      {/* EDITABLE LEVEL */}
                                      <td className="px-4 py-3">
                                        <div className="min-w-[190px]">
                                          <select
                                            value={
                                              row.level_id ||
                                              ""
                                            }
                                            disabled={
                                              isHistorical ||
                                              savingLevelId ===
                                              row.id
                                            }
                                            onChange={(
                                              event
                                            ) =>
                                              onLevelChange(
                                                row,
                                                event
                                                  .target
                                                  .value
                                              )
                                            }
                                            className={`w-full rounded-lg border px-3 py-2 text-sm font-medium outline-none transition ${
                                              row.level_id
                                                ? "border-gray-300 bg-white text-gray-800 focus:border-aquaBlue"
                                                : "border-orange-300 bg-orange-50 text-orange-700 focus:border-orange-500"
                                            } ${
                                                isHistorical
                                                  ? "cursor-not-allowed opacity-60"
                                                  : savingLevelId ===
                                                    row.id
                                                  ? "cursor-wait opacity-60"
                                                  : ""
                                              }`}
                                          >
                                            <option
                                              value=""
                                              disabled
                                            >
                                              Niveau
                                              à
                                              déterminer
                                            </option>

                                            {levels.map(
                                              (
                                                level
                                              ) => (
                                                <option
                                                  key={
                                                    level.id
                                                  }
                                                  value={
                                                    level.id
                                                  }
                                                >
                                                  {
                                                    level.name
                                                  }
                                                </option>
                                              )
                                            )}
                                          </select>

                                          {savingLevelId ===
                                            row.id && (
                                            <p className="mt-1 text-xs text-gray-500">
                                              Enregistrement…
                                            </p>
                                          )}
                                        </div>
                                      </td>

                                      {/* PARTICIPATION */}
                                      <td className="px-4 py-3">
                                        <ParticipationBadge
                                          status={
                                            row.participation_status
                                          }
                                        />
                                      </td>

                                      {/* EVENT COUNT */}
                                      <td className="px-4 py-3 text-center">
                                        {row.selected_event_count >
                                        0 ? (
                                          <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                                            {
                                              row.selected_event_count
                                            }{" "}
                                            épreuve
                                            {row.selected_event_count >
                                            1
                                              ? "s"
                                              : ""}
                                          </span>
                                        ) : (
                                          <span className="text-gray-400">
                                            —
                                          </span>
                                        )}
                                      </td>

                                      {/* DETAILS */}
                                      <td className="px-4 py-3 text-right">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onToggleAssignment(
                                              row.id
                                            )
                                          }
                                          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-aquaBlue hover:bg-blue-50"
                                        >
                                          {isExpanded
                                            ? "Fermer ▲"
                                            : "Voir ▼"}
                                        </button>
                                      </td>
                                    </tr>

                                    {/* EXPANDED EVENTS */}
                                    {isExpanded && (
                                      <tr>
                                        <td
                                          colSpan={
                                            6
                                          }
                                          className="bg-gray-50 px-5 py-5"
                                        >
                                          <AssignmentEventsPanel
                                            events={
                                              events
                                            }
                                            loading={
                                              eventsLoading
                                            }
                                            participationStatus={
                                              row.participation_status
                                            }
                                          />
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              }
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>
          )
        )
      )}
    </div>
  );
}

function AssignmentEventsPanel({
  events,
  loading,
  participationStatus,
}) {
  if (loading) {
    return (
      <div className="py-4 text-sm text-gray-500">
        Chargement des épreuves…
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="font-semibold text-gray-700">
          Épreuves sélectionnées
        </p>

        <p className="mt-1 text-sm text-gray-500">
          {participationStatus ===
          "enrolled"
            ? "Aucune épreuve sélectionnée."
            : "L’élève n’a pas encore confirmé sa participation aux épreuves."}
        </p>
      </div>
    );
  }

  const phases = [];

  events.forEach((event) => {
    let phase =
      phases.find(
        (item) =>
          item.id ===
          event.phase_id
      );

    if (!phase) {
      phase = {
        id: event.phase_id,
        name:
          event.phase_name ||
          "Phase",
        sortOrder:
          event.phase_sort_order ??
          999,
        events: [],
      };

      phases.push(phase);
    }

    phase.events.push(event);
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold text-gray-800">
          Épreuves sélectionnées
        </p>

        <p className="text-xs text-gray-500">
          {events.length} épreuve
          {events.length > 1
            ? "s"
            : ""}{" "}
          enregistrée
          {events.length > 1
            ? "s"
            : ""}
        </p>
      </div>

      {phases.map((phase) => (
        <div
          key={phase.id}
          className="rounded-xl border border-gray-200 bg-white p-4"
        >
          <h5 className="mb-3 font-semibold text-aquaBlue">
            {phase.name}
          </h5>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {phase.events.map(
              (event) => (
                <div
                  key={event.event_id}
                  className="rounded-lg border border-green-100 bg-green-50 px-3 py-3"
                >
                  <div className="flex gap-2">
                    <span className="text-green-600">
                      ✓
                    </span>

                    <div>
                      <p className="font-semibold text-gray-800">
                        {
                          event.event_name
                        }
                      </p>

                      {event.event_description && (
                        <p className="mt-1 text-xs text-gray-500">
                          {
                            event.event_description
                          }
                        </p>
                      )}

                      <p className="mt-2 text-[11px] uppercase tracking-wide text-gray-400">
                        {
                          event.scoring_type
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ParticipationBadge({ status }) {
  const config = {
    enrolled: {
      label: "Confirmé",
      classes:
        "bg-green-100 text-green-700",
    },
    no_response: {
      label: "Sans réponse",
      classes:
        "bg-orange-100 text-orange-700",
    },
    declined: {
      label: "Ne participe pas",
      classes:
        "bg-red-100 text-red-700",
    },
    withdrawn: {
      label: "Retiré",
      classes:
        "bg-gray-100 text-gray-700",
    },
  };

  const item =
    config[status] || {
      label: status || "—",
      classes:
        "bg-gray-100 text-gray-700",
    };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.classes}`}
    >
      {item.label}
    </span>
  );
}