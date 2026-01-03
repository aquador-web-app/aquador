import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import ThemeToggle from "../../components/ThemeToggle";
import CalendarView from "../../components/CalendarView"; // ✅ adjust path if needed
import { formatDateFrSafe, formatCurrencyUSD } from "../../lib/dateUtils";
import { useGlobalAlert } from "../../components/GlobalAlert";

const WEEKDAYS = [
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mer", value: 3 },
  { label: "Jeu", value: 4 },
  { label: "Ven", value: 5 },
  { label: "Sam", value: 6 },
];

export default function AdminCalendarManager() {
  const [loading, setLoading] = useState(false);
  const { showAlert, showConfirm } = useGlobalAlert();
  const [closingTime, setClosingTime] = useState(""); 
  const [settingsId, setSettingsId] = useState(null);
  const [overtimeCutoffTime, setOvertimeCutoffTime] = useState(""); // ✅ max allowed with overtime
  const [extraTimePricePer30, setExtraTimePricePer30] = useState("");
  const [overtimePricePer30, setOvertimePricePer30] = useState("");


useEffect(() => {
  (async () => {
    const { data, error } = await supabase
      .from("calendar_settings")
      .select("id, closing_time, overtime_cutoff_time, extra_time_price_per_30min, overtime_price_per_30min")
      .single();  // ❗ force one row

    if (error) {
      console.error("⚠️ Could not load calendar_settings:", error);
      return;
    }

    if (data) {
      setClosingTime(data.closing_time);
      setOvertimeCutoffTime(
        data.overtime_cutoff_time || data.closing_time
      );
      setExtraTimePricePer30(data.extra_time_price_per_30min);
      setOvertimePricePer30(data.overtime_price_per_30min);
      setSettingsId(data.id);
    }
  })();
}, []);




  // === Forms ===
  const [formSeries, setFormSeries] = useState({
    name: "",
    course_id: null,
    start_date: "",
    end_date: "",
    start_time: "14:00",
    end_time: "15:00",
    weekdays: [],
    venue: "pool",
  });

  const [formBooking, setFormBooking] = useState({
    title: "",
    name: "",
    date: "",
    start_time: "10:00",
    end_time: "12:00",
    booking_type: "daypass",
    venue: "pool",
  });

  // === Series creation ===
  const handleCreateSeries = async (e) => {
    e.preventDefault();
    if (!formSeries.name || !formSeries.start_date || !formSeries.end_date || formSeries.weekdays.length === 0) {
      showAlert("Nom, période et jours requis.");
      return;
    }

    if (formSeries.weekdays.includes(0)) {
      showAlert("Dimanche est fermé. Retirez 0 des jours.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formSeries.name,
        course_id: formSeries.course_id || null,
        start_date: formSeries.start_date,
        end_date: formSeries.end_date,
        start_time: formSeries.start_time,
        end_time: formSeries.end_time,
        weekdays: formSeries.weekdays.sort((a, b) => a - b),
        venue: formSeries.venue,
      };

      const { data, error } = await supabase
        .from("seance_series")
        .insert([payload])
        .select("id")
        .single();
      if (error) throw error;

      await supabase.rpc("generate_seances_for_series", { p_series_id: data.id });

      setFormSeries({
        name: "",
        course_id: null,
        start_date: "",
        end_date: "",
        start_time: "14:00",
        end_time: "15:00",
        weekdays: [],
        venue: "pool",
      });

      showAlert("Série créée et séances générées ✅");
      // TODO: trigger CalendarView refresh later
    } catch (err) {
      console.error(err);
      showAlert("Erreur lors de la création de la série.");
    } finally {
      setLoading(false);
    }
  };

  // === Booking creation ===
  const createBooking = async (e) => {
    e.preventDefault();
    const { title, date, start_time, end_time, booking_type, venue } = formBooking;
    if (!title || !date || !start_time || !end_time) {
      showAlert("Veuillez remplir tous les champs.");
      return;
    }

    const dow = new Date(date).getDay();
    if (dow === 0) {
      showAlert("Dimanche fermé. Choisissez une autre date.");
      return;
    }

    // Optional conflict check logic
    const { data: conflict } = await supabase.rpc("check_booking_conflict", {
  p_date: date,
  p_start: start_time,
  p_end: end_time,
  p_venue: venue,
  p_booking_type: booking_type,
});

if (conflict?.has_conflict) {
  showAlert(conflict.reason || "Ce créneau est déjà occupé.");
  return;
}


    const { error } = await supabase.from("venue_bookings").insert([
      {
        title,
        date,
        start_time,
        end_time,
        booking_type,
        venue,
        status: "confirmed",
      },
    ]);

    if (error) {
      showAlert("Erreur: " + error.message);
    } else {
      setFormBooking({
        title: "",
        date: "",
        start_time: "10:00",
        end_time: "12:00",
        booking_type: "daypass",
        venue: "pool",
      });
      showAlert("Réservation ajoutée ✅");
      // TODO: trigger CalendarView refresh later
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-6 py-3 rounded-lg gap-6 flex-wrap">
  
  <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
    Gestion du calendrier — Admin
  </h1>

  {/* ⏳ Closing Time Selector */}
<div className="flex items-center gap-2">
  <label className="text-gray-700 dark:text-gray-200 font-medium">
    Heure de fermeture:
  </label>

  <select
    className="border rounded-lg px-3 py-1 dark:bg-gray-700"
    value={closingTime}
    onChange={(e) => setClosingTime(e.target.value)}
  >
    {[
      "18:00","18:30","19:00","19:30","20:00","20:30","21:00"
    ].map((t) => (
      <option key={t} value={t}>{t}</option>
    ))}
  </select>
<div className="flex items-center gap-2">
  <label className="text-gray-700 dark:text-gray-200 font-medium">
    Limite avec prolongation payante:
  </label>

  <select
    className="border rounded-lg px-3 py-1 dark:bg-gray-700"
    value={overtimeCutoffTime}
    onChange={(e) => setOvertimeCutoffTime(e.target.value)}
  >
    {[
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
    ].map((t) => (
      <option key={t} value={t}>{t}</option>
    ))}
  </select>
</div>
  <button
    onClick={async () => {
      if (!settingsId) {
        console.error("No settingsId found");
        showAlert("Erreur : Paramètres introuvables.");
        return;
      }
if (
  closingTime &&
  overtimeCutoffTime &&
  closingTime >= overtimeCutoffTime
) {
  showAlert(
    "⚠️ La limite avec prolongation payante doit être après l’heure de fermeture."
  );
  return;
}

      const { error } = await supabase
        .from("calendar_settings")
        .update({
  closing_time: closingTime,
  overtime_cutoff_time: overtimeCutoffTime,
  extra_time_price_per_30min: Number(extraTimePricePer30 || 0),
  overtime_price_per_30min: Number(overtimePricePer30 || 0),
})
        .eq("id", settingsId);

      if (error) {
        console.error(error);
        showAlert("Erreur lors de l’enregistrement.");
      } else {
        showAlert("Paramètres horaires enregistrés ✅");
      }
    }}
    className="px-3 py-1 bg-aquaBlue text-white rounded-lg"
  >
    Sauvegarder
  </button>
</div>

  <ThemeToggle />
</div>


      {/* === Creation Forms Section === */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Create recurring series */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Créer une série récurrente (cours)</h2>
          <form onSubmit={handleCreateSeries} className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Nom de la série *</label>
              <input
                className="w-full border rounded p-2 dark:bg-gray-700"
                value={formSeries.name}
                onChange={(e) => setFormSeries({ ...formSeries, name: e.target.value })}
                placeholder="Cours Débutant"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Du *</label>
                <input
                  type="date"
                  className="w-full border rounded p-2 dark:bg-gray-700"
                  value={formSeries.start_date}
                  onChange={(e) => setFormSeries({ ...formSeries, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Au *</label>
                <input
                  type="date"
                  className="w-full border rounded p-2 dark:bg-gray-700"
                  value={formSeries.end_date}
                  onChange={(e) => setFormSeries({ ...formSeries, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Heure début *</label>
                <input
                  type="time"
                  className="w-full border rounded p-2 dark:bg-gray-700"
                  value={formSeries.start_time}
                  onChange={(e) => setFormSeries({ ...formSeries, start_time: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Heure fin *</label>
                <input
                  type="time"
                  className="w-full border rounded p-2 dark:bg-gray-700"
                  value={formSeries.end_time}
                  onChange={(e) => setFormSeries({ ...formSeries, end_time: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">Jours *</label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map((wd) => (
                  <label key={wd.value} className="inline-flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={formSeries.weekdays.includes(wd.value)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormSeries((prev) => {
                          if (checked)
                            return { ...prev, weekdays: [...prev.weekdays, wd.value] };
                          return {
                            ...prev,
                            weekdays: prev.weekdays.filter((x) => x !== wd.value),
                          };
                        });
                      }}
                    />
                    {wd.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Dimanche fermé automatiquement.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="bg-aquaBlue text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                {loading ? "Création..." : "Créer + Générer"}
              </button>
            </div>
          </form>
        </div>

        {/* Create booking */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
          {/* 💰 Tarifs de temps supplémentaire */}
<div className="mb-6 border-b pb-4">
  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
    Tarifs de temps supplémentaire (par tranche de 30 min)
  </h3>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div>
      <label className="block text-sm mb-1">
        Temps supplémentaire avant fermeture (USD)
      </label>
      <input
        type="number"
        min="0"
        step="0.01"
        className="w-full border rounded p-2 dark:bg-gray-700"
        value={extraTimePricePer30}
        onChange={(e) => setExtraTimePricePer30(e.target.value)}
        placeholder="ex: 25"
      />
    </div>

    <div>
      <label className="block text-sm mb-1">
        Overtime après fermeture (USD)
      </label>
      <input
        type="number"
        min="0"
        step="0.01"
        className="w-full border rounded p-2 dark:bg-gray-700"
        value={overtimePricePer30}
        onChange={(e) => setOvertimePricePer30(e.target.value)}
        placeholder="ex: 40"
      />
    </div>
  </div>

  <p className="text-xs text-gray-500 mt-2">
    Ces montants s’appliquent par tranche de 30 minutes.
    Le tarif overtime s’applique uniquement après l’heure de fermeture.
  </p>
</div>

          <h2 className="text-lg font-semibold mb-3">Ajouter une réservation (Club)</h2>
          <form onSubmit={createBooking} className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Titre *</label>
              <input
                className="w-full border rounded p-2 dark:bg-gray-700"
                value={formBooking.title}
                onChange={(e) => setFormBooking({ ...formBooking, title: e.target.value })}
                placeholder="Anniversaire / Journée Club ..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Date *</label>
                <input
                  type="date"
                  className="w-full border rounded p-2 dark:bg-gray-700"
                  value={formBooking.date}
                  onChange={(e) => setFormBooking({ ...formBooking, date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Type *</label>
                <select
                  className="w-full border rounded p-2 dark:bg-gray-700"
                  value={formBooking.booking_type}
                  onChange={(e) => setFormBooking({ ...formBooking, booking_type: e.target.value })}
                >
                  <option value="daypass">Day pass (coexistence possible)</option>
                  <option value="full">Réservation complète (bloque le créneau)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Début *</label>
                <input
                  type="time"
                  className="w-full border rounded p-2 dark:bg-gray-700"
                  value={formBooking.start_time}
                  onChange={(e) => setFormBooking({ ...formBooking, start_time: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Fin *</label>
                <input
                  type="time"
                  className="w-full border rounded p-2 dark:bg-gray-700"
                  value={formBooking.end_time}
                  onChange={(e) => setFormBooking({ ...formBooking, end_time: e.target.value })}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
            >
              {loading ? "Ajout..." : "Ajouter la réservation"}
            </button>
          </form>
        </div>
      </div>

      {/* ✅ Replaced old static grid with your live FullCalendar */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 mt-8">
        <h2 className="text-lg font-semibold mb-4 text-aquaBlue flex items-center gap-2">
          🗓️ Vue interactive du calendrier
        </h2>
        <CalendarView
  mode="admin"
  closingTime={closingTime}
  overtimeCutoff={overtimeCutoffTime}
  extraTimePricePer30={extraTimePricePer30}
  overtimePricePer30={overtimePricePer30}
  onSlotSelect={({ date, start, end }) => {
    try {
      const start_time = start?.includes("T") ? start.slice(11, 16) : "00:00";
      const end_time = end?.includes("T") ? end.slice(11, 16) : "00:00";

      setFormBooking((prev) => ({
        ...prev,
        date,
        start_time,
        end_time,
      }));

      console.log("✅ Slot selected:", { date, start_time, end_time });
    } catch (err) {
      console.error("❌ Error in onSlotSelect:", err);
    }
  }}
/>


      </div>
    </div>
  );
}
