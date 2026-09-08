import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useGlobalAlert } from "../../components/GlobalAlert";
import { formatDateFrSafe } from "../../lib/dateUtils";

export default function UserMiniCompetition({ competitionYear, eventCode, eventDate,  testMode = false,}) {
  const { showAlert, showConfirm } = useGlobalAlert();

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventsByStudent, setEventsByStudent] = useState({});
  const [selectedByStudent, setSelectedByStudent] = useState({});
  const [eventsLoadingId, setEventsLoadingId] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const confirmedStudents = useMemo(
    () => students.filter((student) => student.presence_confirmed === true),
    [students]
  );

  async function loadStudents() {
    if (!competitionYear || !eventCode) {
      setStudents([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: assignments, error: assignmentError } = await supabase.rpc(
        "get_my_competition_students",
        { p_competition_year: competitionYear }
      );

      if (assignmentError) throw assignmentError;

      const rows = assignments || [];

      if (!rows.length) {
        setStudents([]);
        return;
      }

      const profileIds = rows.map((row) => row.student_profile_id).filter(Boolean);

      let confirmedIds = new Set();

if (testMode) {
  // TEMP TEST MODE:
  // allow all competition-eligible students to appear
  confirmedIds = new Set(
    profileIds.map(String)
  );
} else {
  const {
    data: presenceRows,
    error: presenceError,
  } = await supabase
    .from("event_presence_confirmations")
    .select("participant_profile_id, status")
    .eq("event_code", eventCode)
    .in("participant_profile_id", profileIds);

  if (presenceError) {
    throw presenceError;
  }

  confirmedIds = new Set(
    (presenceRows || [])
      .filter(
        (row) =>
          row.status === "confirmed"
      )
      .map(
        (row) =>
          String(
            row.participant_profile_id
          )
      )
  );
}

      setStudents(
        rows.map((row) => ({
          ...row,
          presence_confirmed: confirmedIds.has(String(row.student_profile_id)),
        }))
      );
    } catch (error) {
      console.error("Mini competition students loading error:", error);
      setStudents([]);
      await showAlert(
        error?.message ||
          "Impossible de charger les informations de la mini-compétition."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentEvents(student, { force = false } = {}) {
    const studentId = student?.student_profile_id;
    if (!studentId || !competitionYear) return [];

    if (!force && eventsByStudent[studentId]) {
      return eventsByStudent[studentId];
    }

    try {
      setEventsLoadingId(studentId);

      const { data, error } = await supabase.rpc(
        "get_competition_student_eligible_events",
        {
          p_competition_year: competitionYear,
          p_student_profile_id: studentId,
        }
      );

      if (error) throw error;

      const events = data || [];

      setEventsByStudent((current) => ({
        ...current,
        [studentId]: events,
      }));

      const selected =
        student.participation_status === "enrolled"
          ? events
              .filter((event) => event.already_entered === true)
              .map((event) => event.event_id)
          : events.map((event) => event.event_id);

      setSelectedByStudent((current) => ({
        ...current,
        [studentId]: selected,
      }));

      return events;
    } catch (error) {
      console.error("Mini competition events loading error:", error);
      await showAlert(
        error?.message ||
          `Impossible de charger les épreuves de ${student.student_name}.`
      );
      return [];
    } finally {
      setEventsLoadingId(null);
    }
  }

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
  competitionYear,
  eventCode,
  testMode,
]);

  useEffect(() => {
    if (!confirmedStudents.length) return;

    confirmedStudents.forEach((student) => {
      if (student.level_id && !eventsByStudent[student.student_profile_id]) {
        loadStudentEvents(student);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedStudents]);

  function toggleEvent(studentId, eventId) {
    setSelectedByStudent((current) => {
      const selected = current[studentId] || [];
      return {
        ...current,
        [studentId]: selected.includes(eventId)
          ? selected.filter((id) => id !== eventId)
          : [...selected, eventId],
      };
    });
  }

  function selectAllEvents(studentId) {
    const events = eventsByStudent[studentId] || [];
    setSelectedByStudent((current) => ({
      ...current,
      [studentId]: events.map((event) => event.event_id),
    }));
  }

  function clearAllEvents(studentId) {
    setSelectedByStudent((current) => ({
      ...current,
      [studentId]: [],
    }));
  }

  async function saveParticipation(student) {
    const studentId = student.student_profile_id;
    const selected = selectedByStudent[studentId] || [];

    if (!selected.length) {
      await showAlert(
        "Veuillez conserver au moins une épreuve. Si l'élève ne souhaite pas participer à la mini-compétition, utilisez « Ne pas participer »."
      );
      return;
    }

    try {
      setSavingId(studentId);

      const { error } = await supabase.rpc("submit_competition_participation", {
        p_competition_year: competitionYear,
        p_student_profile_id: studentId,
        p_participates: true,
        p_event_ids: selected,
      });

      if (error) throw error;

      await loadStudents();
      await loadStudentEvents(
        { ...student, participation_status: "enrolled" },
        { force: true }
      );

      await showAlert(
        `✅ Les épreuves de ${student.student_name} ont été confirmées.`
      );
    } catch (error) {
      console.error("Mini competition save error:", error);
      await showAlert(
        error?.message || "Impossible d'enregistrer les épreuves sélectionnées."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function declineParticipation(student) {
    const ok = await showConfirm(
      `Confirmer que ${student.student_name} ne participera pas à la mini-compétition ?`
    );
    if (!ok) return;

    const studentId = student.student_profile_id;

    try {
      setSavingId(studentId);

      const { error } = await supabase.rpc("submit_competition_participation", {
        p_competition_year: competitionYear,
        p_student_profile_id: studentId,
        p_participates: false,
        p_event_ids: [],
      });

      if (error) throw error;

      setSelectedByStudent((current) => ({ ...current, [studentId]: [] }));
      setEventsByStudent((current) => {
        const next = { ...current };
        delete next[studentId];
        return next;
      });

      await loadStudents();
      await showAlert(
        `La non-participation de ${student.student_name} a été enregistrée.`
      );
    } catch (error) {
      console.error("Mini competition decline error:", error);
      await showAlert(
        error?.message || "Impossible d'enregistrer la non-participation."
      );
    } finally {
      setSavingId(null);
    }
  }

  function phaseGroupsFor(studentId) {
    const events = eventsByStudent[studentId] || [];
    const groups = new Map();

    events.forEach((event) => {
      const phaseId = event.phase_id || "sans-phase";

      if (!groups.has(phaseId)) {
        groups.set(phaseId, {
          id: phaseId,
          name: event.phase_name || "Épreuves",
          sortOrder: Number(event.phase_sort_order || 0),
          events: [],
        });
      }

      groups.get(phaseId).events.push(event);
    });

    return [...groups.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((group) => ({
        ...group,
        events: [...group.events].sort(
          (a, b) =>
            Number(a.event_sort_order || 0) - Number(b.event_sort_order || 0)
        ),
      }));
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">Chargement de la mini-compétition…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-blue-700 to-cyan-600 px-5 py-5 text-white">
          <h2 className="text-2xl font-bold">Mini-compétition</h2>
          <p className="mt-1 text-sm text-white/90">
            Cérémonie de clôture
            {eventDate ? ` — ${formatDateFrSafe(eventDate)}` : ""}
          </p>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-sm text-gray-700">
            Les épreuves admissibles sont déterminées automatiquement selon la
            catégorie et le niveau de chaque élève.
          </p>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">
              Toutes les épreuves admissibles sont sélectionnées par défaut.
            </p>
            <p className="mt-1 text-sm text-blue-700">
              Décochez simplement les épreuves auxquelles l'élève ne souhaite
              pas participer, puis confirmez la sélection.
            </p>
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">
            Aucun élève admissible à la mini-compétition n'a été trouvé sur ce
            compte.
          </p>
        </div>
      ) : confirmedStudents.length === 0 ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6">
          <h3 className="font-bold text-orange-900">
            Présence à la cérémonie non confirmée
          </h3>
          <p className="mt-2 text-sm text-orange-800">
            Confirmez d'abord la présence de l'élève à la cérémonie de clôture
            depuis l'Aperçu. Les épreuves de la mini-compétition seront ensuite
            disponibles ici.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {confirmedStudents.map((student) => {
            const studentId = student.student_profile_id;
            const events = eventsByStudent[studentId] || [];
            const selected = selectedByStudent[studentId] || [];
            const phases = phaseGroupsFor(studentId);
            const isSaving = savingId === studentId;
            const isLoadingEvents = eventsLoadingId === studentId;
            const isEnrolled = student.participation_status === "enrolled";
            const isDeclined = student.participation_status === "declined";

            return (
              <div
                key={student.assignment_id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="border-b border-gray-100 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {student.student_name}
                      </h3>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                          {student.category_name}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            student.level_id
                              ? "bg-purple-100 text-purple-700"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {student.level_name || "Niveau à déterminer"}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            isEnrolled
                              ? "bg-green-100 text-green-700"
                              : isDeclined
                              ? "bg-red-100 text-red-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {isEnrolled
                            ? "Participation confirmée"
                            : isDeclined
                            ? "Ne participe pas"
                            : "À confirmer"}
                        </span>
                      </div>
                    </div>

                    {student.level_id && !isDeclined && events.length > 0 && (
                      <div className="text-sm text-gray-600">
                        <strong>{selected.length}</strong> / {events.length} épreuve
                        {events.length > 1 ? "s" : ""} sélectionnée
                        {selected.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-5">
                  {!student.level_id ? (
                    <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                      <p className="font-semibold text-yellow-900">
                        Niveau à déterminer
                      </p>
                      <p className="mt-1 text-sm text-yellow-800">
                        Les épreuves seront disponibles dès que le niveau de
                        natation de cet élève aura été enregistré.
                      </p>
                    </div>
                  ) : isLoadingEvents && !events.length ? (
                    <p className="text-sm text-gray-500">Chargement des épreuves…</p>
                  ) : isDeclined && !events.length ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <p className="font-semibold text-red-800">
                          Vous avez indiqué que cet élève ne participera pas à la
                          mini-compétition.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => loadStudentEvents(student, { force: true })}
                        className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
                      >
                        Participer finalement
                      </button>
                    </div>
                  ) : events.length === 0 ? (
                    <p className="text-sm italic text-gray-500">
                      Aucune épreuve n'est actuellement disponible pour cette
                      catégorie et ce niveau.
                    </p>
                  ) : (
                    <div className="space-y-6">
                      {phases.map((phase) => (
                        <section key={phase.id}>
                          <h4 className="mb-3 font-bold text-blue-800">
                            {phase.name}
                          </h4>

                          <div className="space-y-2">
                            {phase.events.map((event) => {
                              const checked = selected.includes(event.event_id);

                              return (
                                <label
                                  key={event.event_id}
                                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                                    checked
                                      ? "border-blue-400 bg-blue-50"
                                      : "border-gray-200 bg-white hover:bg-gray-50"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleEvent(studentId, event.event_id)
                                    }
                                    className="mt-1 h-5 w-5 rounded text-blue-600"
                                  />

                                  <div className="min-w-0">
                                    <p className="font-semibold text-gray-900">
                                      {event.event_name}
                                    </p>
                                    {event.event_description && (
                                      <p className="mt-1 text-sm text-gray-600">
                                        {event.event_description}
                                      </p>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </section>
                      ))}

                      <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                        <button
                          type="button"
                          onClick={() => selectAllEvents(studentId)}
                          disabled={isSaving}
                          className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          Tout sélectionner
                        </button>
                        <button
                          type="button"
                          onClick={() => clearAllEvents(studentId)}
                          disabled={isSaving}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Tout décocher
                        </button>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => saveParticipation(student)}
                          disabled={isSaving || selected.length === 0}
                          className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white shadow hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSaving
                            ? "Enregistrement…"
                            : isEnrolled
                            ? "Enregistrer les modifications"
                            : "Confirmer mes épreuves"}
                        </button>

                        <button
                          type="button"
                          onClick={() => declineParticipation(student)}
                          disabled={isSaving}
                          className="rounded-xl border border-red-300 bg-white px-5 py-3 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Ne pas participer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}