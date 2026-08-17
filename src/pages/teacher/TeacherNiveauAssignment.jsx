import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabaseClient";

const ACADEMIC_YEAR = "2025-2026";

function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat(
      "fr-FR",
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone:
          "America/Port-au-Prince",
      }
    ).format(new Date(value));
  } catch {
    return value;
  }
}

function levelBadge(levelName) {
  if (!levelName) {
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
        Aucun niveau
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
      {levelName}
    </span>
  );
}

export default function TeacherNiveauAssignment() {
  const [students, setStudents] =
    useState([]);

  const [levels, setLevels] =
    useState([]);

  const [assignments, setAssignments] =
    useState([]);

  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);

  const [role, setRole] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [savingId, setSavingId] =
    useState(null);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [
    levelFilter,
    setLevelFilter,
  ] = useState("all");

  const [
    selectedLevels,
    setSelectedLevels,
  ] = useState({});

  const [notes, setNotes] =
    useState({});

  const [expandedId, setExpandedId] =
    useState(null);

  // =========================================================
  // PERMISSIONS
  // =========================================================

  const canAssign =
    role === "teacher" ||
    role === "admin";

  // =========================================================
  // LOAD CURRENT USER
  // =========================================================

  async function loadCurrentUser() {
    const {
      data: authData,
      error: authError,
    } =
      await supabase.auth.getUser();

    if (authError) {
      throw authError;
    }

    const authUser =
      authData?.user;

    if (!authUser) {
      throw new Error(
        "Utilisateur non authentifié."
      );
    }

    setCurrentUser(authUser);

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    setRole(
      String(
        profile?.role || ""
      ).toLowerCase()
    );
  }

  // =========================================================
  // LOAD LEVELS
  // =========================================================

  async function loadLevels() {
    const {
      data,
      error: levelsError,
    } = await supabase
      .from(
        "student_certificate_levels"
      )
      .select(`
        id,
        code,
        name,
        description,
        sort_order,
        is_active
      `)
      .eq("is_active", true)
      .order("sort_order", {
        ascending: true,
      });

    if (levelsError) {
      throw levelsError;
    }

    setLevels(data || []);
  }

  // =========================================================
  // LOAD ACTIVE STUDENTS
  // =========================================================

  async function loadStudents() {
    /*
      First get active enrollments.

      We use enrollments as the source of truth so
      students without an active enrollment do not
      appear on the evaluation page.
    */

    const {
      data: enrollmentRows,
      error: enrollmentError,
    } = await supabase
      .from("enrollments")
      .select("profile_id")
      .eq("status", "active");

    if (enrollmentError) {
      throw enrollmentError;
    }

    const profileIds = [
      ...new Set(
        (enrollmentRows || [])
          .map(
            (row) =>
              row.profile_id
          )
          .filter(Boolean)
      ),
    ];

    if (
      profileIds.length === 0
    ) {
      setStudents([]);
      return;
    }

    const {
      data: profileRows,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        first_name,
        last_name,
        parent_id,
        role,
        signup_type,
        is_active
      `)
      .in("id", profileIds)
      .eq("is_active", true)
      .order("full_name", {
        ascending: true,
      });

    if (profileError) {
      throw profileError;
    }

    setStudents(
      profileRows || []
    );
  }

  // =========================================================
  // LOAD ASSIGNMENT HISTORY
  // =========================================================

  async function loadAssignments() {
    const {
      data,
      error: assignmentError,
    } = await supabase
      .from("student_swim_levels")
      .select(`
        id,
        profile_id,
        level_id,
        academic_year,
        assigned_by,
        assigned_at,
        notes,
        created_at
      `)
      .eq(
        "academic_year",
        ACADEMIC_YEAR
      )
      .order("assigned_at", {
        ascending: false,
      });

    if (assignmentError) {
      throw assignmentError;
    }

    /*
      We separately load assigner names because
      assigned_by references profiles.id.
    */

    const assignerIds = [
      ...new Set(
        (data || [])
          .map(
            (row) =>
              row.assigned_by
          )
          .filter(Boolean)
      ),
    ];

    let assignerMap = {};

    if (
      assignerIds.length > 0
    ) {
      const {
        data: assigners,
        error: assignerError,
      } = await supabase
        .from("profiles")
        .select(
          "id, full_name"
        )
        .in(
          "id",
          assignerIds
        );

      if (assignerError) {
        throw assignerError;
      }

      assignerMap =
        Object.fromEntries(
          (assigners || []).map(
            (profile) => [
              String(
                profile.id
              ),
              profile.full_name,
            ]
          )
        );
    }

    setAssignments(
      (data || []).map(
        (row) => ({
          ...row,

          assigned_by_name:
            assignerMap[
              String(
                row.assigned_by
              )
            ] || "—",
        })
      )
    );
  }

  // =========================================================
  // LOAD EVERYTHING
  // =========================================================

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      await Promise.all([
        loadCurrentUser(),
        loadLevels(),
        loadStudents(),
        loadAssignments(),
      ]);
    } catch (err) {
      console.error(
        "TeacherNiveauAssignment load error:",
        err
      );

      setError(
        err?.message ||
          "Impossible de charger les niveaux des élèves."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // =========================================================
  // LEVEL LOOKUPS
  // =========================================================

  const levelMap =
    useMemo(() => {
      return Object.fromEntries(
        levels.map(
          (level) => [
            String(level.id),
            level,
          ]
        )
      );
    }, [levels]);

  // =========================================================
  // ASSIGNMENTS BY STUDENT
  // newest first because query is already DESC
  // =========================================================

  const assignmentsByStudent =
    useMemo(() => {
      const map = {};

      for (
        const assignment
        of assignments
      ) {
        const key =
          String(
            assignment.profile_id
          );

        if (!map[key]) {
          map[key] = [];
        }

        map[key].push(
          assignment
        );
      }

      return map;
    }, [assignments]);

  // =========================================================
  // CURRENT / LATEST LEVEL
  // =========================================================

  function getLatestAssignment(
    profileId
  ) {
    return (
      assignmentsByStudent[
        String(profileId)
      ]?.[0] || null
    );
  }

  // =========================================================
  // STUDENT ROWS
  // =========================================================

  const studentRows =
    useMemo(() => {
      return students.map(
        (student) => {
          const history =
            assignmentsByStudent[
              String(student.id)
            ] || [];

          const latest =
            history[0] ||
            null;

          const latestLevel =
            latest
              ? levelMap[
                  String(
                    latest.level_id
                  )
                ] || null
              : null;

          return {
            ...student,

            history,

            latestAssignment:
              latest,

            latestLevel,
          };
        }
      );
    }, [
      students,
      assignmentsByStudent,
      levelMap,
    ]);

  // =========================================================
  // FILTERS
  // =========================================================

  const filteredRows =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return studentRows.filter(
        (student) => {
          const currentLevelId =
            student
              .latestAssignment
              ?.level_id
              ? String(
                  student
                    .latestAssignment
                    .level_id
                )
              : null;

          if (
            levelFilter ===
              "none" &&
            currentLevelId
          ) {
            return false;
          }

          if (
            levelFilter !==
              "all" &&
            levelFilter !==
              "none" &&
            currentLevelId !==
              levelFilter
          ) {
            return false;
          }

          if (!term) {
            return true;
          }

          return [
            student.full_name,
            student.first_name,
            student.last_name,
            student.latestLevel
              ?.name,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(term)
          );
        }
      );
    }, [
      studentRows,
      search,
      levelFilter,
    ]);

  // =========================================================
  // ASSIGN NEW LEVEL
  // =========================================================

  async function assignLevel(
    student
  ) {
    if (!canAssign) {
      alert(
        "Vous n'êtes pas autorisé à attribuer un niveau."
      );
      return;
    }

    const levelId =
      selectedLevels[
        String(student.id)
      ];

    if (!levelId) {
      alert(
        "Veuillez sélectionner un niveau."
      );
      return;
    }

    const level =
      levelMap[
        String(levelId)
      ];

    if (!level) {
      alert(
        "Niveau invalide."
      );
      return;
    }

    const current =
      getLatestAssignment(
        student.id
      );

    const currentLevel =
      current
        ? levelMap[
            String(
              current.level_id
            )
          ]
        : null;

    let message =
      `Attribuer le niveau « ${level.name} » à ${student.full_name} ?`;

    if (currentLevel) {
      message +=
        `\n\nNiveau actuel : ${currentLevel.name}`;

      if (
        String(
          currentLevel.id
        ) ===
        String(level.id)
      ) {
        message +=
          "\n\n⚠️ Ce niveau est identique au niveau actuel. Une nouvelle évaluation sera tout de même enregistrée.";
      }
    }

    if (
      !window.confirm(message)
    ) {
      return;
    }

    setSavingId(
      student.id
    );

    setError("");
    setSuccess("");

    try {
      const {
        error: insertError,
      } = await supabase
        .from(
          "student_swim_levels"
        )
        .insert({
          profile_id:
            student.id,

          level_id:
            levelId,

          academic_year:
            ACADEMIC_YEAR,

          assigned_by:
            currentUser?.id,

          assigned_at:
            new Date().toISOString(),

          notes:
            notes[
              String(
                student.id
              )
            ]?.trim() ||
            null,
        });

      if (insertError) {
        throw insertError;
      }

      setSelectedLevels(
        (currentSelections) => ({
          ...currentSelections,

          [String(
            student.id
          )]: "",
        })
      );

      setNotes(
        (currentNotes) => ({
          ...currentNotes,

          [String(
            student.id
          )]: "",
        })
      );

      setSuccess(
        `Niveau « ${level.name} » attribué à ${student.full_name}.`
      );

      await loadAssignments();
    } catch (err) {
      console.error(
        "Assign swim level error:",
        err
      );

      setError(
        err?.message ||
          "Impossible d'attribuer ce niveau."
      );
    } finally {
      setSavingId(null);
    }
  }

  // =========================================================
  // STATS
  // =========================================================

  const studentsWithLevel =
    studentRows.filter(
      (student) =>
        !!student
          .latestAssignment
    ).length;

  const studentsWithoutLevel =
    studentRows.length -
    studentsWithLevel;

  const levelCounts =
    levels.map(
      (level) => ({
        ...level,

        count:
          studentRows.filter(
            (student) =>
              String(
                student
                  .latestAssignment
                  ?.level_id ||
                  ""
              ) ===
              String(level.id)
          ).length,
      })
    );

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <div className="py-10 text-center text-gray-500">
        Chargement des niveaux…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold text-aquaBlue">
          🏊 Niveaux des élèves
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Évaluation des niveaux de
          natation — année académique{" "}
          {ACADEMIC_YEAR}.
        </p>
      </div>

      {/* MESSAGES */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          ✅ {success}
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">

        <StatCard
          label="Élèves actifs"
          value={
            studentRows.length
          }
        />

        <StatCard
          label="Évalués"
          value={
            studentsWithLevel
          }
          valueClass="text-green-700"
        />

        <StatCard
          label="Sans niveau"
          value={
            studentsWithoutLevel
          }
          valueClass="text-red-600"
        />

        {levelCounts.map(
          (level) => (
            <StatCard
              key={level.id}
              label={level.name}
              value={level.count}
              valueClass="text-blue-700"
            />
          )
        )}
      </div>

      {/* FILTERS */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-3">

        <input
          type="text"
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Rechercher un élève..."
          className="input w-full"
        />

        <select
          value={levelFilter}
          onChange={(event) =>
            setLevelFilter(
              event.target.value
            )
          }
          className="input w-full"
        >
          <option value="all">
            Tous les niveaux
          </option>

          <option value="none">
            Sans niveau
          </option>

          {levels.map(
            (level) => (
              <option
                key={level.id}
                value={level.id}
              >
                {level.name}
              </option>
            )
          )}
        </select>

        <button
          type="button"
          onClick={loadData}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50"
        >
          🔄 Actualiser
        </button>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">

        <div className="overflow-x-auto">

          <table className="min-w-full divide-y divide-gray-200 text-sm">

            <thead className="bg-gray-50">
              <tr>

                <th className="px-4 py-3 text-left">
                  Élève
                </th>

                <th className="px-4 py-3 text-center">
                  Niveau actuel
                </th>

                <th className="px-4 py-3 text-left">
                  Dernière évaluation
                </th>

                <th className="px-4 py-3 text-left">
                  Nouveau niveau
                </th>

                <th className="px-4 py-3 text-left">
                  Notes
                </th>

                <th className="px-4 py-3 text-center">
                  Action
                </th>

              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">

              {filteredRows.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    Aucun élève trouvé.
                  </td>
                </tr>
              ) : (
                filteredRows.map(
                  (student) => {
                    const isExpanded =
                      expandedId ===
                      student.id;

                    return (
                      <Fragment
                        key={
                          student.id
                        }
                      >

                        <tr className="hover:bg-blue-50/40">

                          {/* STUDENT */}
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900">
                              {
                                student.full_name
                              }
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(
                                  isExpanded
                                    ? null
                                    : student.id
                                )
                              }
                              className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                            >
                              {isExpanded
                                ? "Masquer l'historique"
                                : "Voir l'historique"}
                            </button>
                          </td>

                          {/* CURRENT LEVEL */}
                          <td className="px-4 py-3 text-center">
                            {levelBadge(
                              student
                                .latestLevel
                                ?.name
                            )}
                          </td>

                          {/* LATEST */}
                          <td className="px-4 py-3">

                            {student
                              .latestAssignment ? (
                              <>
                                <p className="text-sm text-gray-700">
                                  {formatDateTime(
                                    student
                                      .latestAssignment
                                      .assigned_at
                                  )}
                                </p>

                                <p className="mt-1 text-xs text-gray-400">
                                  Par{" "}
                                  {
                                    student
                                      .latestAssignment
                                      .assigned_by_name
                                  }
                                </p>
                              </>
                            ) : (
                              <span className="text-gray-400">
                                —
                              </span>
                            )}
                          </td>

                          {/* NEW LEVEL */}
                          <td className="px-4 py-3">

                            {canAssign ? (
                              <select
                                value={
                                  selectedLevels[
                                    String(
                                      student.id
                                    )
                                  ] ||
                                  ""
                                }
                                onChange={(
                                  event
                                ) =>
                                  setSelectedLevels(
                                    (
                                      current
                                    ) => ({
                                      ...current,

                                      [String(
                                        student.id
                                      )]:
                                        event
                                          .target
                                          .value,
                                    })
                                  )
                                }
                                className="input min-w-[170px]"
                              >
                                <option value="">
                                  Sélectionner
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
                            ) : (
                              <span className="text-xs text-gray-400">
                                Lecture seule
                              </span>
                            )}
                          </td>

                          {/* NOTES */}
                          <td className="px-4 py-3">

                            {canAssign ? (
                              <input
                                type="text"
                                value={
                                  notes[
                                    String(
                                      student.id
                                    )
                                  ] ||
                                  ""
                                }
                                onChange={(
                                  event
                                ) =>
                                  setNotes(
                                    (
                                      current
                                    ) => ({
                                      ...current,

                                      [String(
                                        student.id
                                      )]:
                                        event
                                          .target
                                          .value,
                                    })
                                  )
                                }
                                placeholder="Facultatif"
                                className="input min-w-[180px]"
                              />
                            ) : (
                              "—"
                            )}
                          </td>

                          {/* ACTION */}
                          <td className="px-4 py-3 text-center">

                            {canAssign && (
                              <button
                                type="button"
                                disabled={
                                  savingId ===
                                    student.id ||
                                  !selectedLevels[
                                    String(
                                      student.id
                                    )
                                  ]
                                }
                                onClick={() =>
                                  assignLevel(
                                    student
                                  )
                                }
                                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                              >
                                {savingId ===
                                student.id
                                  ? "Enregistrement..."
                                  : "Attribuer"}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* HISTORY */}
                        {isExpanded && (
                          <tr>
                            <td
                              colSpan={6}
                              className="bg-gray-50 px-5 py-4"
                            >
                              <h4 className="mb-3 font-bold text-gray-800">
                                Historique des niveaux
                              </h4>

                              {student
                                .history
                                .length ===
                              0 ? (
                                <p className="text-sm text-gray-500">
                                  Aucun niveau attribué pour cette année académique.
                                </p>
                              ) : (
                                <div className="space-y-2">

                                  {student.history.map(
                                    (
                                      assignment,
                                      index
                                    ) => {
                                      const level =
                                        levelMap[
                                          String(
                                            assignment.level_id
                                          )
                                        ];

                                      return (
                                        <div
                                          key={
                                            assignment.id
                                          }
                                          className="flex flex-col gap-2 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                          <div>
                                            <div className="flex items-center gap-2">

                                              <span className="font-semibold text-gray-900">
                                                {level
                                                  ?.name ||
                                                  "Niveau inconnu"}
                                              </span>

                                              {index ===
                                                0 && (
                                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                                                  ACTUEL
                                                </span>
                                              )}
                                            </div>

                                            {assignment.notes && (
                                              <p className="mt-1 text-xs text-gray-500">
                                                {
                                                  assignment.notes
                                                }
                                              </p>
                                            )}
                                          </div>

                                          <div className="text-xs text-gray-500 sm:text-right">
                                            <p>
                                              {formatDateTime(
                                                assignment.assigned_at
                                              )}
                                            </p>

                                            <p>
                                              {
                                                assignment.assigned_by_name
                                              }
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    }
                                  )}

                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  }
                )
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* LEVEL DESCRIPTIONS */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">

        <h3 className="font-bold text-gray-900">
          Description des niveaux
        </h3>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">

          {levels.map(
            (level) => (
              <div
                key={level.id}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4"
              >
                <p className="font-bold text-blue-700">
                  {level.name}
                </p>

                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                  {level.description ||
                    "Aucune description."}
                </p>
              </div>
            )
          )}

        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass =
    "text-gray-900",
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">

      <p className="text-xs text-gray-500">
        {label}
      </p>

      <p
        className={`mt-1 text-2xl font-bold ${valueClass}`}
      >
        {value}
      </p>

    </div>
  );
}