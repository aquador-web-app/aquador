// src/pages/admin/AdminCompetition.jsx

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";
import CategoriesSection from "./Competition/CompetitionCategories";
import EventsSection from "./Competition/CompetitionEvents";
import ParticipantsSection from "./Competition/CompetitionParticipants";
import ResultsSection from "./Competition/CompetitionResults";


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
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(null);

  const [showCreateCompetition, setShowCreateCompetition] =
  useState(false);

const [creatingCompetition, setCreatingCompetition] =
  useState(false);

const [newCompetitionType, setNewCompetitionType] =
  useState("regular");

const [newCompetitionName, setNewCompetitionName] =
  useState("");

const [newCompetitionDate, setNewCompetitionDate] =
  useState("");

const [newCompetitionYear, setNewCompetitionYear] =
  useState("");

const [
  newCompetitionSessionSeriesId,
  setNewCompetitionSessionSeriesId,
] = useState("");

const [
  availableCompetitionClasses,
  setAvailableCompetitionClasses,
] = useState([]);

const [
  loadingCompetitionClasses,
  setLoadingCompetitionClasses,
] = useState(false);

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

const [
  selectedResultEventId,
  setSelectedResultEventId,
] = useState("");

const [
  resultEventData,
  setResultEventData,
] = useState(null);

const [
  resultEventLoading,
  setResultEventLoading,
] = useState(false);

async function loadCompetitionEventResults(
  eventId
) {
  if (!eventId) {
    setResultEventData(null);
    return;
  }

  try {
    setResultEventLoading(true);
    setErrorMessage("");

    const { data, error } =
      await supabase.rpc(
        "get_admin_competition_event_results",
        {
          p_competition_event_id:
            eventId,
        }
      );

    if (error) throw error;

    setResultEventData(
      data || null
    );
  } catch (error) {
    console.error(
      "Competition results load error:",
      error
    );

    setResultEventData(null);

    setErrorMessage(
      error?.message ||
        "Impossible de charger les résultats de cette épreuve."
    );
  } finally {
    setResultEventLoading(false);
  }
}

async function loadEventConfig(competitionId) {
  if (!competitionId) {
    setCompetitionPhases([]);
    return;
  }

  try {
    setEventConfigLoading(true);

    const { data, error } =
      await supabase.rpc(
  "get_admin_competition_event_config",
  {
    p_competition_id: competitionId,
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

async function loadEventEvaluationConfig(competitionId) {
  if (!competitionId) {
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
    p_competition_id: competitionId,
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

async function loadCategories(competitionId) {
  if (!competitionId) {
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
    p_competition_id: competitionId,
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
        competition.id === selectedCompetitionId
    ) || null,
  [competitions, selectedCompetitionId]
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
  setSelectedCompetitionId(null);
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
      String(a.event_date).localeCompare(
        String(b.event_date)
      )
  );

    const competitionToUse =
  upcoming[0] || rows[0];

setSelectedCompetitionId(
  competitionToUse.id
);
  }

  async function handleLevelChange(
  assignment,
  newLevelId
) {
  if (
    isHistorical ||
    !assignment?.student_profile_id ||
    !newLevelId
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
    "set_student_swim_level",
    {
      p_student_profile_id:
        assignment.student_profile_id,

      p_level_id:
        newLevelId,
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
      selectedCompetitionId
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

  async function loadAssignments(competitionId) {
  if (!competitionId) {
    setAssignments([]);
    return;
  }

  const { data, error } = await supabase.rpc(
  "get_admin_competition_participants",
  {
    p_competition_id: competitionId,
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

async function loadCompetitionClassesForDate(
  eventDate
) {
  if (!eventDate) {
    setAvailableCompetitionClasses([]);
    setNewCompetitionSessionSeriesId("");
    return;
  }

  try {
    setLoadingCompetitionClasses(true);

    const { data, error } = await supabase.rpc(
      "get_admin_competition_classes_for_date",
      {
        p_event_date: eventDate,
      }
    );

    if (error) throw error;

    setAvailableCompetitionClasses(data || []);

    setNewCompetitionSessionSeriesId("");
  } catch (error) {
    console.error(
      "Competition classes load error:",
      error
    );

    setAvailableCompetitionClasses([]);
    setNewCompetitionSessionSeriesId("");

    setErrorMessage(
      error?.message ||
        "Impossible de charger les classes disponibles."
    );
  } finally {
    setLoadingCompetitionClasses(false);
  }
}

async function handleCreateCompetition(event) {
  event.preventDefault();

  setErrorMessage("");
  setSuccessMessage("");

  const competitionYear =
    Number(newCompetitionYear);

  if (!Number.isInteger(competitionYear)) {
    setErrorMessage(
      "L’année académique est requise."
    );
    return;
  }

  /*
   * ANNUAL CLOSURE
   */
  if (newCompetitionType === "closure") {
    try {
      setCreatingCompetition(true);

      const { data, error } = await supabase.rpc(
        "ensure_competition_for_year",
        {
          p_year: competitionYear,
        }
      );

      if (error) throw error;

      if (!data?.id) {
        throw new Error(
          "La clôture annuelle n’a pas retourné d’identifiant."
        );
      }

      await loadCompetitions();

      setSelectedCompetitionId(data.id);

      setNewCompetitionType("regular");
      setNewCompetitionName("");
      setNewCompetitionDate("");
      setNewCompetitionYear("");
      setNewCompetitionSessionSeriesId("");
      setAvailableCompetitionClasses([]);
      setShowCreateCompetition(false);

      setSuccessMessage(
        "La compétition de clôture annuelle est prête."
      );
    } catch (error) {
      console.error(
        "Erreur création clôture:",
        error
      );

      setErrorMessage(
        error?.message ||
          "Impossible de créer la clôture annuelle."
      );
    } finally {
      setCreatingCompetition(false);
    }

    return;
  }

  /*
   * CLASS COMPETITION
   */
  const name = newCompetitionName.trim();
  const eventDate = newCompetitionDate;

  if (!name) {
    setErrorMessage(
      "Le nom de la compétition est requis."
    );
    return;
  }

  if (!eventDate) {
    setErrorMessage(
      "La date de la compétition est requise."
    );
    return;
  }

  if (!newCompetitionSessionSeriesId) {
    setErrorMessage(
      "La classe est requise."
    );
    return;
  }

  try {
    setCreatingCompetition(true);

    const { data, error } = await supabase.rpc(
      "admin_create_competition",
      {
        p_name: name,
        p_event_date: eventDate,
        p_competition_year:
          competitionYear,
        p_session_series_id:
          newCompetitionSessionSeriesId,
      }
    );

    if (error) throw error;

    if (!data?.id) {
      throw new Error(
        "La compétition a été créée, mais son identifiant n’a pas été retourné."
      );
    }

    await loadCompetitions();

    setSelectedCompetitionId(data.id);

    setNewCompetitionType("regular");
    setNewCompetitionName("");
    setNewCompetitionDate("");
    setNewCompetitionYear("");
    setNewCompetitionSessionSeriesId("");
    setAvailableCompetitionClasses([]);
    setShowCreateCompetition(false);

    setSuccessMessage(
      "La compétition de classe a été créée avec succès."
    );
  } catch (error) {
    console.error(
      "Erreur création compétition:",
      error
    );

    setErrorMessage(
      error?.message ||
        "Impossible de créer la compétition."
    );
  } finally {
    setCreatingCompetition(false);
  }
}

async function handleSyncParticipants() {
  if (
  !selectedCompetitionId ||
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
      p_competition_id: selectedCompetitionId,
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
      selectedCompetitionId
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
          "Impossible de charger les compétitions."
      );
    } finally {
      setLoading(false);
    }
  }

    useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
  if (!selectedCompetitionId) return;

  setErrorMessage("");
  setSuccessMessage("");

  setSelectedResultEventId("");
  setResultEventData(null);

  Promise.all([
    loadAssignments(selectedCompetitionId),
    loadCategories(selectedCompetitionId),
    loadEventConfig(selectedCompetitionId),
    loadEventEvaluationConfig(
      selectedCompetitionId
    ),
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
}, [selectedCompetitionId]);

useEffect(() => {
  if (!selectedResultEventId) {
    setResultEventData(null);
    return;
  }

  loadCompetitionEventResults(
    selectedResultEventId
  );
}, [selectedResultEventId]);

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
          Chargement des compétitions
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
              <div className="flex flex-wrap items-center justify-between gap-3">
  <h2 className="text-2xl font-bold">
    Compétitions
  </h2>

  <button
    type="button"
    onClick={() =>
      setShowCreateCompetition((current) => !current)
    }
    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
  >
    {showCreateCompetition
      ? "Annuler"
      : "+ Créer une compétition"}
  </button>
</div>

{showCreateCompetition && (
  <form
    onSubmit={handleCreateCompetition}
    className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-gray-900"
  >
    <h3 className="mb-4 text-lg font-semibold">
      Créer une compétition
    </h3>

    {/* TYPE */}
    <div className="mb-5">
      <label className="mb-2 block text-sm font-medium text-gray-700">
        Type de compétition
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setNewCompetitionType("regular");
            setNewCompetitionSessionSeriesId("");
          }}
          disabled={creatingCompetition}
          className={`rounded-xl border p-4 text-left transition ${
            newCompetitionType === "regular"
              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <p className="font-semibold">
            Compétition de classe
          </p>

          <p className="mt-1 text-sm text-gray-500">
            Compétition organisée pour une seule
            classe à une date précise.
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setNewCompetitionType("closure");
            setNewCompetitionName("");
            setNewCompetitionDate("");
            setNewCompetitionSessionSeriesId("");
            setAvailableCompetitionClasses([]);
          }}
          disabled={creatingCompetition}
          className={`rounded-xl border p-4 text-left transition ${
            newCompetitionType === "closure"
              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <p className="font-semibold">
            Clôture annuelle
          </p>

          <p className="mt-1 text-sm text-gray-500">
            Grande compétition annuelle avec
            confirmation préalable et présence
            spécifique à la clôture.
          </p>
        </button>
      </div>
    </div>

    {newCompetitionType === "regular" ? (
      <>
        <div className="grid gap-4 md:grid-cols-3">
          {/* NAME */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nom de la compétition
            </label>

            <input
              type="text"
              value={newCompetitionName}
              onChange={(event) =>
                setNewCompetitionName(
                  event.target.value
                )
              }
              placeholder="Ex. Compétition de septembre"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              disabled={creatingCompetition}
            />
          </div>

          {/* DATE */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Date
            </label>

            <input
              type="date"
              value={newCompetitionDate}
              onChange={(event) => {
                const value =
                  event.target.value;

                setNewCompetitionDate(value);

                loadCompetitionClassesForDate(
                  value
                );
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              disabled={creatingCompetition}
            />
          </div>

          {/* YEAR */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Année académique
            </label>

            <input
              type="number"
              value={newCompetitionYear}
              onChange={(event) =>
                setNewCompetitionYear(
                  event.target.value
                )
              }
              placeholder="Ex. 2027"
              min="2020"
              max="2100"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              disabled={creatingCompetition}
            />
          </div>
        </div>

        {/* CLASS */}
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Classe
          </label>

          {!newCompetitionDate ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500">
              Sélectionnez d’abord la date de la
              compétition.
            </p>
          ) : loadingCompetitionClasses ? (
            <p className="text-sm text-gray-500">
              Chargement des classes...
            </p>
          ) : availableCompetitionClasses.length ===
            0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
              Aucune classe active n’est prévue à
              cette date.
            </p>
          ) : (
            <select
              value={
                newCompetitionSessionSeriesId
              }
              onChange={(event) =>
                setNewCompetitionSessionSeriesId(
                  event.target.value
                )
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              disabled={creatingCompetition}
            >
              <option value="">
                Sélectionner une classe
              </option>

              {availableCompetitionClasses.map(
                (classItem) => (
                  <option
                    key={
                      classItem.session_series_id
                    }
                    value={
                      classItem.session_series_id
                    }
                  >
                    {classItem.course_name} —{" "}
                    {String(
                      classItem.start_time
                    ).slice(0, 5)} à{" "}
                    {String(
                      classItem.end_time
                    ).slice(0, 5)}
                  </option>
                )
              )}
            </select>
          )}
        </div>
      </>
    ) : (
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Année académique
        </label>

        <input
          type="number"
          value={newCompetitionYear}
          onChange={(event) =>
            setNewCompetitionYear(
              event.target.value
            )
          }
          placeholder="Ex. 2027"
          min="2020"
          max="2100"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 md:max-w-xs"
          disabled={creatingCompetition}
        />

        <p className="mt-2 text-sm text-gray-500">
          La date officielle de clôture sera
          déterminée automatiquement par le système.
        </p>
      </div>
    )}

    <div className="mt-5 flex justify-end">
      <button
        type="submit"
        disabled={
          creatingCompetition ||
          (
            newCompetitionType === "regular" &&
            loadingCompetitionClasses
          )
        }
        className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {creatingCompetition
          ? "Création..."
          : newCompetitionType === "closure"
          ? "Préparer la clôture annuelle"
          : "Créer la compétition de classe"}
      </button>
    </div>
  </form>
)}

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
  value={selectedCompetitionId || ""}
  onChange={(event) =>
    setSelectedCompetitionId(event.target.value)
  }
>
  {competitions.map((competition) => (
    <option
      key={competition.id}
      value={competition.id}
    >
      {competition.name} — {competition.event_date}
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
    Type
  </p>

  <p className="font-semibold">
    {selectedCompetition.competition_type ===
    "closure"
      ? "Clôture annuelle"
      : "Compétition de classe"}
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
    {selectedCompetition?.competition_type ===
    "closure" ? (
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
    ) : (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Admissibles"
          value={stats.total}
        />

        <StatCard
          label="Avec niveau"
          value={
            stats.total -
            stats.withoutLevel
          }
        />

        <StatCard
          label="Niveau à déterminer"
          value={stats.withoutLevel}
        />
      </div>
    )}
  </div>
)}

      {/* CATEGORIES */}
      {activeSection === "categories" && (
  <CategoriesSection
  categories={categories}
  courses={competitionCourses}
  competitionId={selectedCompetitionId}
  isHistorical={isHistorical}
  loading={categoryConfigLoading}
  onReload={() =>
    loadCategories(selectedCompetitionId)
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
  competitionId={selectedCompetitionId}
  isHistorical={isHistorical}
  loading={
    eventConfigLoading ||
    eventEvaluationLoading
  }
  onReload={async () => {
    await Promise.all([
      loadEventConfig(
        selectedCompetitionId
      ),

      loadEventEvaluationConfig(
        selectedCompetitionId
      ),

      loadAssignments(
        selectedCompetitionId
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
  <ResultsSection
    phases={competitionPhases}
    selectedEventId={
      selectedResultEventId
    }
    onSelectEvent={
      setSelectedResultEventId
    }
    resultData={
      resultEventData
    }
    loading={
      resultEventLoading
    }
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