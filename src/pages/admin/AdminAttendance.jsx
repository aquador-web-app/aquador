import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Scanner } from "@yudiel/react-qr-scanner";
import { formatDateFrSafe, formatMonth } from "../../lib/dateUtils";
import { FaDollarSign } from "react-icons/fa";

// Haiti = UTC-5
function getHaitiDateISO(dateString) {
  const d = new Date(dateString + "T00:00:00");
  const haiti = new Date(
    d.toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
  );
  // Return YYYY-MM-DD corrected for Haiti timezone
  return haiti.toISOString().split("T")[0];
}



export default function AdminAttendance() {
  const [cours, setCours] = useState([]);
  const [coursSelectionne, setCoursSelectionne] = useState("");
  const [date, setDate] = useState(() => {
  const today = new Date();
  return new Date(
    today.toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
  )
    .toISOString()
    .split("T")[0];
});
  const [sessions, setSessions] = useState([]);
  const [resumeMensuel, setResumeMensuel] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [scanActif, setScanActif] = useState(false);
  const [scanResult, setScanResult] = useState("");
  const [erreur, setErreur] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState(null);
  const [modalEnrollment, setModalEnrollment] = useState(null);
  const [modalSessionStartISO, setModalSessionStartISO] = useState(null);
  const [globalErreur, setGlobalErreur] = useState("");
  const [globalResult, setGlobalResult] = useState("");
  const [modalErreur, setModalErreur] = useState("");
  const [modalResult, setModalResult] = useState("");
  const lastScanTime = useRef(0);

  const globalScannerRef = useRef(null);
  const modalScannerRef = useRef(null);

  const stopCamera = (ref) => {
    try {
      if (ref.current?.stream) {
        ref.current.stream.getTracks().forEach((track) => track.stop());
      }
    } catch (_) {}
  };

  const fmtHeure = (t) =>
    t ? new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";

  const jourSemaine = useMemo(() => {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("fr-FR", { weekday: "long" });
  }, [date]);

  const ajouterHeures = (hhmm, duree) => {
    if (!hhmm || duree == null) return null;
    const [h, m] = hhmm.split(":").map(Number);
    const base = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    base.setHours(base.getHours() + Number(duree || 0));
    return base.toTimeString().slice(0, 5);
  };

  const toSessionStartISO = (start_time_hhmm) => {
    if (!start_time_hhmm) return null;
    const [hh, mm] = start_time_hhmm.split(":").map(Number);
    const d = new Date(date + "T00:00:00");
    d.setHours(hh || 0, mm || 0, 0, 0);
    return d.toISOString();
  };

  // Auto-dismiss global messages after 3s
  useEffect(() => {
    if (globalErreur || globalResult) {
      const timer = setTimeout(() => {
        setGlobalErreur("");
        setGlobalResult("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [globalErreur, globalResult]);

  // Auto-dismiss modal messages after 3s
  useEffect(() => {
    if (modalErreur || modalResult) {
      const timer = setTimeout(() => {
        setModalErreur("");
        setModalResult("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [modalErreur, modalResult]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("courses").select("id, name").order("name");
      setCours(data || []);
    })();
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(
  new Date().getMonth() + 1 // 1–12
);
const [selectedYear, setSelectedYear] = useState(
  new Date().getFullYear()
);


  const fetchSessions = async () => {
    setChargement(true);
    setErreur("");
    try {
      const { data: sessData, error: sessErr } = await supabase
        .from("sessions")
        .select(`
          id,
          course:course_id ( name ),
          start_date,
          start_time,
          duration_hours,
          day_of_week,
          session_group,
          status
        `)
        .eq("start_date", getHaitiDateISO(date))
        .order("start_time", { ascending: true });
      if (sessErr) throw sessErr;
      if (!sessData?.length) return setSessions([]);

      const groupIds = [...new Set(sessData.map((s) => s.session_group).filter(Boolean))];
      if (!groupIds.length) return setSessions([]);

      const { data: enrData } = await supabase
        .from("enrollments")
        .select(`
          id,
          status,
          profile_id,
          session_group,
          course_id,
          plan_id,
          profiles_with_unpaid!inner (
    id,
    full_name,
    has_unpaid
  ),
          courses:course_id ( name ),
          plans:plan_id ( duration_hours )
        `)
        .in("session_group", groupIds)
        .eq("status", "active");

      const { data: presences } = await supabase
        .from("attendance")
        .select("enrollment_id, status, check_in_time, check_out_time, attended_on")
        .eq("attended_on", getHaitiDateISO(date));

      const mapPresences = {};
      (presences || []).forEach((p) => (mapPresences[p.enrollment_id] = p));

      const grouped = (enrData || []).reduce((acc, row) => {
        const gid = row.session_group;
        acc[gid] = acc[gid] || [];
        acc[gid].push({
          enrollment_id: row.id,
          nom: row.profiles_with_unpaid?.full_name || "—",
          has_unpaid: row.profiles_with_unpaid?.has_unpaid || false,
          cours: row.courses?.name,
          duree: row.plans?.duration_hours || 1,
          presence: mapPresences[row.id] || null,
        });
        return acc;
      }, {});

      const merged = sessData.map((s) => ({
        ...s,
        inscriptions: grouped[s.session_group] || [],
      }));

      const filtered =
        coursSelectionne && coursSelectionne.trim()
          ? merged.filter((m) => m.course?.name === coursSelectionne)
          : merged;

      setSessions(filtered);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [date, coursSelectionne]);

  const saveAttendanceWithRules = async (enrollment_id, action, sessionStartISO) => {
    const now = new Date();
    const start = sessionStartISO ? new Date(sessionStartISO) : null;
    const decideStatus = () => {
      if (!start) return "present";
      const diffMin = Math.floor((now - start) / 60000);
      return diffMin <= 15 ? "present" : "late";
    };

    const { data: exist } = await supabase
      .from("attendance")
      .select("id, status, check_in_time, check_out_time")
      .eq("enrollment_id", enrollment_id)
      .eq("attended_on", getHaitiDateISO(date))
      .maybeSingle();

    if (action === "check-in") {
      const newStatus = decideStatus();
      if (!exist) {
        await supabase.from("attendance").insert([
          { enrollment_id, attended_on: date, status: newStatus, check_in_time: now.toISOString() },
        ]);
      } else {
        const patch = {};
        if (!exist.check_in_time) patch.check_in_time = now.toISOString();
        if (exist.status === "absent") patch.status = newStatus;
        await supabase.from("attendance").update(patch).eq("id", exist.id);
      }
    } else if (action === "check-out") {
      if (!exist) {
        const impliedStatus = decideStatus();
        await supabase.from("attendance").insert([
          {
            enrollment_id,
            attended_on: date,
            status: impliedStatus,
            check_in_time: now.toISOString(),
            check_out_time: now.toISOString(),
          },
        ]);
      } else {
        const patch = { check_out_time: now.toISOString() };
        if (exist.status === "absent" && !exist.check_in_time) {
          patch.status = decideStatus();
          patch.check_in_time = now.toISOString();
        }
        await supabase.from("attendance").update(patch).eq("id", exist.id);
      }
          } else if (action === "mark-absent") {
      // Mark student as ABSENT manually
      const { data: existAbsent } = await supabase
        .from("attendance")
        .select("id")
        .eq("enrollment_id", enrollment_id)
        .eq("attended_on", getHaitiDateISO(date))
        .maybeSingle();

      if (!existAbsent) {
        await supabase.from("attendance").insert([
          {
            enrollment_id,
            attended_on: getHaitiDateISO(date),
            status: "absent",
            check_in_time: null,
            check_out_time: null,
          },
        ]);
      } else {
        await supabase
          .from("attendance")
          .update({
            status: "absent",
            check_in_time: null,
            check_out_time: null,
          })
          .eq("id", existAbsent.id);
      }
    } else if (action === "undo-checkin") {
      await supabase
        .from("attendance")
        .delete()
        .eq("enrollment_id", enrollment_id)
        .eq("attended_on", date);
    } else if (action === "undo-checkout") {
      await supabase
        .from("attendance")
        .update({ check_out_time: null })
        .eq("enrollment_id", enrollment_id)
        .eq("attended_on", getHaitiDateISO(date));
    }

    await fetchSessions();
    await fetchResumeMensuel();
  };

  // ✅ lightweight scan handler (no infinite reloads, no double check-in)
const handleScan = async (result) => {
  if (!result) return;

  const nowMs = Date.now();
  if (nowMs - lastScanTime.current < 3000) return; // 🕒 ignore scans within 3s
  lastScanTime.current = nowMs;

  const profile_id = (result.text || "").trim();
  setGlobalErreur("");
  setGlobalResult("");

  try {
    const { data: enr, error: enrErr } = await supabase
      .from("enrollments")
      .select("id, session_group")
      .eq("profile_id", profile_id)
      .eq("status", "active");

    if (enrErr) throw enrErr;
    if (!enr?.length) return setGlobalErreur("⚠️ Aucun élève actif trouvé pour ce QR code.");

    const sessionGroups = enr.map((e) => e.session_group).filter(Boolean);
    if (!sessionGroups.length)
      return setGlobalErreur("⚠️ Cet élève n’a pas de groupe de séance assigné.");

    const { data: todaySessions, error: sessErr } = await supabase
      .from("sessions")
      .select("id, start_time, duration_hours")
      .eq("start_date", getHaitiDateISO(date))
      .in("session_group", sessionGroups)
      .eq("status", "active");

    if (sessErr) throw sessErr;
    if (!todaySessions?.length)
      return setGlobalErreur("⚠️ Cet élève n’a pas de séance aujourd’hui.");

    const enrollment_id = enr[0].id;

    const { data: existing } = await supabase
      .from("attendance")
      .select("id, check_in_time, check_out_time")
      .eq("enrollment_id", enrollment_id)
      .eq("attended_on", getHaitiDateISO(date))
      .maybeSingle();

    const now = new Date().toISOString();

    // ✅ Case 1: First scan of the day → Check-in
    if (!existing) {
      await supabase.from("attendance").insert([
        {
          enrollment_id,
          attended_on: date,
          status: "present",
          check_in_time: now,
        },
      ]);
      setGlobalResult("✅ Check-in enregistré !");
    }
    // ✅ Case 2: Already checked in → auto Check-out
    else if (existing.check_in_time && !existing.check_out_time) {
      await supabase
        .from("attendance")
        .update({ check_out_time: now })
        .eq("id", existing.id);
      setGlobalResult("✅ Départ enregistré !");
    }
    // ✅ Case 3: Both already exist
    else {
      setGlobalErreur("⚠️ Arrivée et départ déjà marqués pour aujourd’hui.");
    }

    await fetchSessions(); // refresh UI immediately
  } catch (err) {
    setGlobalErreur("Erreur lors du scan : " + err.message);
  }
};



  const openModal = (action, enrollment_id, sessionStartHHMM) => {
    setModalAction(action);
    setModalEnrollment(enrollment_id);
    setModalSessionStartISO(toSessionStartISO(sessionStartHHMM));
    setModalOpen(true);
  };

  const closeModal = () => {
    stopCamera(modalScannerRef);
    setModalOpen(false);
    setModalAction(null);
    setModalEnrollment(null);
    setModalSessionStartISO(null);
    setModalErreur("");
    setModalResult("");
  };

  const handleModalScan = async (res) => {
    if (!res) return;
    const scanned_profile_id = (res.text || "").trim();
    setModalErreur("");
    setModalResult("");

    try {
      const { data: enrollmentData, error: enrollmentErr } = await supabase
        .from("enrollments")
        .select("profile_id, status")
        .eq("id", modalEnrollment)
        .maybeSingle();

      if (enrollmentErr) throw enrollmentErr;
      if (!enrollmentData)
        return setModalErreur("⚠️ Enregistrement introuvable pour cet élève.");

      if (enrollmentData.profile_id !== scanned_profile_id)
        return setModalErreur("⚠️ Ce QR code n’appartient pas à cet élève.");

      const { data: sessionCheck, error: sessionErr } = await supabase
        .from("sessions")
        .select("id")
        .eq("start_date", getHaitiDateISO(date))
        .in("session_group", sessions.map((s) => s.session_group));

      if (sessionErr) throw sessionErr;
      if (!sessionCheck?.length)
        return setModalErreur("⚠️ Cet élève n’a pas de séance aujourd’hui.");

      await saveAttendanceWithRules(modalEnrollment, modalAction, modalSessionStartISO);
      stopCamera(modalScannerRef);
      closeModal();
      setModalResult("✅ Présence enregistrée !");
      setTimeout(() => setModalResult(""), 2000);
    } catch (e) {
      setModalErreur("Erreur lors du scan : " + e.message);
    }
  };

  const handleManual = async () => {
    try {
      await saveAttendanceWithRules(modalEnrollment, modalAction, modalSessionStartISO);
      closeModal();
    } catch (e) {
      setErreur(e.message);
    }
  };

  const fetchResumeMensuel = async () => {
  try {
    // build first and next month range
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const nextMonth = new Date(selectedYear, selectedMonth, 1);

    const { data, error } = await supabase
      .from("attendance_monthly_summary")
      .select("*")
      .gte("month", firstDay.toISOString())
      .lt("month", nextMonth.toISOString());

    if (error) {
      console.error("Résumé mensuel error:", error.message);
      setResumeMensuel([]);
      return;
    }

    setResumeMensuel(data || []);
  } catch (err) {
    console.error("Résumé mensuel error:", err.message);
  }
};




  useEffect(() => {
    fetchResumeMensuel();
  }, []);

  useEffect(() => {
  fetchResumeMensuel();
}, [selectedMonth, selectedYear]);


  const StatusBadge = ({ status }) => {
    const map = {
      present: "bg-green-100 text-green-700",
      late: "bg-yellow-100 text-yellow-700",
      absent: "bg-red-100 text-red-700",
    };
    const label =
      status === "present"
        ? "Présent"
        : status === "late"
        ? "En retard"
        : status === "absent"
        ? "Absent"
        : "—";
    return (
      <span
        className={`px-2 py-1 rounded text-xs font-semibold ${
          map[status] || "bg-gray-100 text-gray-600"
        }`}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Gestion des présences</h2>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Jour</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border p-2 rounded-lg" />
          <span className="text-gray-500 text-sm capitalize">({jourSemaine})</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Cours</label>
          <select value={coursSelectionne} onChange={(e) => setCoursSelectionne(e.target.value)} className="border p-2 rounded-lg">
            <option value="">Tous les cours</option>
            {cours.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button onClick={fetchSessions} className="bg-aquaBlue text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Rafraîchir
        </button>
      </div>

      {/* QR Scanner (Global) */}
<div className="flex justify-center">
  <div className="bg-white rounded-2xl shadow-lg p-6 w-[380px] text-center transition-all duration-300 hover:shadow-xl">
    <div className="flex flex-col items-center border-b pb-3 mb-4">
      <div className="bg-blue-300 text-Blue-700 p-2 rounded-xl mb-2">
        <i className="fa-solid fa-qrcode text-2xl"></i>
      </div>
      <h3 className="font-semibold text-lg text-gray-800">Scanner un QR code</h3>
    </div>

    {!scanActif ? (
      <div className="flex flex-col items-center space-y-3">
        <button
          onClick={() => {
            setScanActif(true);
            setErreur("");
            setScanResult("");
          }}
          className="bg-aquaBlue text-white px-6 py-2 rounded-lg font-medium shadow hover:bg-blue-700 transition"
        >
          <i className="fa-solid fa-camera mr-2"></i>Démarrer le scan
        </button>
      </div>
    ) : (
      <div className="flex flex-col items-center space-y-4">
        <div className="w-[320px] h-[320px] rounded-xl overflow-hidden border-2 border-aquaBlue shadow-inner">
          <Scanner
            onDecode={(result) => handleScan({ text: result })}
            onError={(err) => console.error(err)}
            constraints={{ facingMode: "environment" }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>

        <button
          onClick={() => {
            stopCamera(globalScannerRef);
            setScanActif(false);
          }}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
        >
          <i className="fa-solid fa-xmark mr-2"></i>Fermer
        </button>
      </div>
    )}

    {globalErreur && (
      <div className="p-3 bg-red-100 text-red-800 rounded-lg text-center mt-4 font-medium">
        {globalErreur}
      </div>
    )}

    {globalResult && (
      <div className="p-3 bg-green-100 text-green-800 rounded-lg text-center mt-4 font-medium">
        {globalResult}
      </div>
    )}
  </div>
</div>


      {/* Tableau de présences */}
      <div className="bg-white rounded-2xl shadow p-6 overflow-x-auto">
        <h3 className="font-semibold text-lg mb-3">Présences du {formatDateFrSafe(date)}</h3>
        {chargement ? (
          <div className="text-center py-3 text-aquaBlue font-medium">⏳ Chargement des données…</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="p-2 text-left">Élève</th>
                <th className="p-2 text-left">Cours</th>
                <th className="p-2 text-left">Heure</th>
                <th className="p-2 text-center">Actions</th>
                <th className="p-2 text-center">Statut</th>
                <th className="p-2 text-left">Arrivée</th>
                <th className="p-2 text-left">Départ</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length ? (
                sessions.map((s) => (
                  <Fragment key={s.id}>
                    <tr key={`head-${s.id}`} className={s.status === "cancelled" ? "bg-red-50 text-red-700 font-semibold" : "bg-blue-50 text-aquaBlue font-semibold"}>
                      <td colSpan="7" className="p-2">
                        {s.status === "cancelled"
                          ? `🚫 Séance annulée — ${s.course?.name}`
                          : `🏊 ${s.course?.name} — ${s.start_time?.slice(0, 5)} → ${ajouterHeures(s.start_time?.slice(0, 5), s.duration_hours)}`}
                      </td>
                    </tr>
                    {s.status !== "cancelled" &&
                      (s.inscriptions.length ? (
                        s.inscriptions.map((e) => (
                          <tr key={e.enrollment_id} className="border-t hover:bg-gray-50">
                            <td className="p-2 flex items-center gap-1">
                              {e.nom}
                              {e.has_unpaid && (
                                <FaDollarSign className="text-red-500" title="Facture impayée" />
                              )}
                            </td>
                            <td className="p-2">{e.cours}</td>
                            <td className="p-2">
                              {s.start_time?.slice(0, 5)} – {ajouterHeures(s.start_time?.slice(0, 5), s.duration_hours)}
                            </td>
                            <td className="p-2 text-center space-x-1">
                              {!e.presence?.check_in_time ? (
                                <button
                                  className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                                  onClick={() => openModal("check-in", e.enrollment_id, s.start_time)}
                                >
                                  Check-in
                                </button>
                              ) : (
                                <button
                                  className="px-3 py-1 rounded bg-gray-500 text-white hover:bg-gray-600"
                                  onClick={() => saveAttendanceWithRules(e.enrollment_id, "undo-checkin", s.start_time)}
                                >
                                  Undo
                                </button>
                              )}
                              {!e.presence?.check_out_time ? (
                                <button
                                  className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                                  onClick={() => openModal("check-out", e.enrollment_id, s.start_time)}
                                >
                                  Check-out
                                </button>
                              ) : (
                                <button
                                  className="px-3 py-1 rounded bg-gray-500 text-white hover:bg-gray-600"
                                  onClick={() => saveAttendanceWithRules(e.enrollment_id, "undo-checkout", s.start_time)}
                                >
                                  Undo
                                </button>
                              )}
                              {!e.presence?.check_in_time && !e.presence?.check_out_time && (
                                <button
                                  className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                                  onClick={() => saveAttendanceWithRules(e.enrollment_id, "mark-absent", s.start_time)}
                                >
                                  Marquer absent
                                </button>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <StatusBadge status={e.presence?.status} />
                            </td>
                            <td className="p-2 text-gray-600">{fmtHeure(e.presence?.check_in_time)}</td>
                            <td className="p-2 text-gray-600">{fmtHeure(e.presence?.check_out_time)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="text-gray-400 italic text-sm p-2">
                            Aucun participant inscrit
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-gray-500 italic">
                    Aucune session prévue pour ce jour.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
{/* Filtres Résumé mensuel */}
<div className="mt-6 flex flex-wrap gap-3 items-center">
  <div className="flex items-center gap-2">
    <label className="text-sm text-gray-600">Mois</label>
    <select
      value={selectedMonth}
      onChange={(e) => setSelectedMonth(Number(e.target.value))}
      className="border p-2 rounded-lg"
    >
      <option value={1}>Janvier</option>
      <option value={2}>Février</option>
      <option value={3}>Mars</option>
      <option value={4}>Avril</option>
      <option value={5}>Mai</option>
      <option value={6}>Juin</option>
      <option value={7}>Juillet</option>
      <option value={8}>Août</option>
      <option value={9}>Septembre</option>
      <option value={10}>Octobre</option>
      <option value={11}>Novembre</option>
      <option value={12}>Décembre</option>
    </select>
  </div>

  <div className="flex items-center gap-2">
    <label className="text-sm text-gray-600">Année</label>
    <input
      type="number"
      className="border p-2 rounded-lg w-24"
      value={selectedYear}
      onChange={(e) => setSelectedYear(Number(e.target.value))}
      min="2023"
      max="2100"
    />
  </div>

  <button
    onClick={fetchResumeMensuel}
    className="bg-aquaBlue text-white px-4 py-2 rounded-lg hover:bg-blue-700"
  >
    Filtrer
  </button>
</div>

      {/* Résumé mensuel */}
      <div className="bg-white rounded-2xl shadow p-6 mt-8">
  <h3 className="font-semibold text-lg mb-3">
    Résumé mensuel des présences — {formatMonth(`${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`)}
  </h3>

  {resumeMensuel.length ? (
    <table className="w-full text-sm border-collapse">
      <thead className="bg-gray-100 text-gray-600">
        <tr>
          <th className="p-2 text-left">Élève</th>
          <th className="p-2 text-left">Cours</th>
          <th className="p-2 text-center">Présents</th>
          <th className="p-2 text-center">Absents</th>
          <th className="p-2 text-center">Retards</th>
          <th className="p-2 text-center">Taux présence</th>
        </tr>
      </thead>

      <tbody>
        {resumeMensuel.map((r) => (
          <tr
            key={`${r.profile_id}-${r.course_name}`}
            className="border-t hover:bg-gray-50"
          >
            <td className="p-2">{r.full_name}</td>
            <td className="p-2">{r.course_name}</td>
            <td className="p-2 text-center text-green-700 font-medium">{r.presents}</td>
            <td className="p-2 text-center text-red-600 font-medium">{r.absents}</td>
            <td className="p-2 text-center text-yellow-600 font-medium">{r.retards}</td>
            <td className="p-2 text-center font-bold">
              {Number(r.taux_presence).toFixed(0)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <div className="text-center py-4 text-gray-500 italic">
      Aucun enregistrement ce mois-ci.
    </div>
  )}
</div>


      {/* MODAL (QR + manuel) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          style={{ position: "fixed", top: 0, left: 0 }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-5 relative">
            <button
              onClick={closeModal}
              className="absolute top-3 right-4 text-gray-500 hover:text-gray-800 text-2xl font-bold"
            >
              ×
            </button>

            <h4 className="text-xl font-semibold text-gray-800 text-center mb-2">
              {modalAction === "check-in" ? "Check-in" : "Check-out"}
            </h4>

            <div className="flex flex-col items-center space-y-4">
              {modalErreur && (
  <div className="absolute -top-3 left-0 w-full text-center bg-red-100 text-red-800 font-medium py-2 rounded-t-2xl shadow">
    {modalErreur}
  </div>
)}

{modalResult && (
  <div className="absolute -top-3 left-0 w-full text-center bg-green-100 text-green-800 font-medium py-2 rounded-t-2xl shadow">
    {modalResult}
  </div>
)}

              <div className="w-[280px] h-[280px] rounded-lg overflow-hidden border-2 border-aquaBlue shadow-inner">
                <Scanner
                  onDecode={(result) => handleModalScan({ text: result })}
                  onError={(err) => console.error(err)}
                  constraints={{ facingMode: "environment" }}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>

              <button
                onClick={handleManual}
                className="text-aquaBlue hover:text-blue-700 underline font-medium"
              >
                Cliquer ici pour un enregistrement manuel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
