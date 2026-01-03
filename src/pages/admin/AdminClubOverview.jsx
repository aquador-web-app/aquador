// src/pages/Admin/ClubOverview.jsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";

function getHaitiNow() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Port-au-Prince",
    })
  );
}

function isToday(birthDate) {
  if (!birthDate) return false;

  const [y, m, d] = String(birthDate).split("-");
  const bdMonth = Number(m);
  const bdDay = Number(d);

  const haitiNow = getHaitiNow();

  return (
    bdMonth === haitiNow.getMonth() + 1 &&
    bdDay === haitiNow.getDate()
  );
}




export default function ClubOverview() {
  const [bookingCount, setBookingCount] = useState(0);
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [clubBirthdays, setClubBirthdays] = useState([]);


  const [activeMemberships, setActiveMemberships] = useState(0);
  const [expiringMemberships, setExpiringMemberships] = useState([]);

  const [unpaidClubInvoices, setUnpaidClubInvoices] = useState({
    count: 0,
    total: 0,
  });

  async function fetchClubBirthdays() {
  const now = getHaitiNow();
  const currentMonth = now.getMonth() + 1;

  const { data, error } = await supabase
    .from("club_profiles")
    .select("id, main_full_name, birth_date");

  if (error || !data) return;

  const list = data.filter(
    (p) => p.birth_date && Number(p.birth_date.split("-")[1]) === currentMonth
  );

  setClubBirthdays(list);
}


async function fetchClubFamilyBirthdays() {
  const now = getHaitiNow();
  const currentMonth = now.getMonth() + 1; // 1–12

  const { data, error } = await supabase
    .from("club_profile_families")
    .select("id, full_name, birth_date");

  if (error || !data) return;

  const list = data.filter((f) => {
    if (!f.birth_date) return false;
    const month = Number(String(f.birth_date).split("-")[1]);
    return month === currentMonth;
  });

  // 🔥 Merge into main list, convert full_name → main_full_name
  setClubBirthdays((prev) => [
    ...prev,
    ...list.map((x) => ({ ...x, main_full_name: x.full_name }))
  ]);
}



  // ============================================
  //        FETCH CLUB BOOKING COUNT (7 days)
  // ============================================
  async function fetchClubBookings() {
    const now = getHaitiNow();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const todayStr = now.toISOString().slice(0, 10);
    const nextWeekStr = nextWeek.toISOString().slice(0, 10);

    // Count
    const { data: list } = await supabase
      .from("venue_bookings")
      .select("*")
      .gte("date", todayStr)
      .lte("date", nextWeekStr);

    setBookingCount(list?.length || 0);
    setUpcomingBookings(list || []);
  }

  // ============================================
  //        FETCH ACTIVE MEMBERSHIPS
  // ============================================
  async function fetchMemberships() {
    // Count active memberships
    const { count } = await supabase
      .from("club_profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    setActiveMemberships(count || 0);
    setExpiringMemberships([]);
  }

  // ============================================
  //     FETCH UNPAID CLUB INVOICES
  // ============================================
  async function fetchUnpaidClubInvoices() {
    const { data } = await supabase
      .from("club_invoices")
      .select("final_amount_cents, status");

    const rows = data || [];

    const unpaid = rows.filter(
  (r) => r.status === "unpaid" || r.status === "partial"
);

    const total = unpaid.reduce(
      (s, r) => s + Number(r.final_amount_cents || 0) / 100,
      0
    );

    setUnpaidClubInvoices({ count: unpaid.length, total });
  }

  useEffect(() => {
    fetchClubBookings();
    fetchMemberships();
    fetchUnpaidClubInvoices();
    fetchClubBirthdays();
  fetchClubFamilyBirthdays();
  }, []);

  // ---------------------------------------------
  //              RENDER
  // ---------------------------------------------
  return (
    <div>
      <h2 className="text-2xl font-bold text-aquaBlue mb-6">📊 Club – Overview</h2>

      {/* GRID STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

        {/* BOOKINGS */}
        <motion.div
          whileHover={{ scale: 1.04, y: -3 }}
          className="bg-white rounded-2xl p-6 shadow border border-gray-100 cursor-pointer"
        >
          <p className="text-gray-500">Réservations (7 jours)</p>
          <h3 className="text-4xl font-bold text-blue-600">{bookingCount}</h3>
        </motion.div>

        {/* ACTIVE MEMBERSHIPS */}
        <motion.div
          whileHover={{ scale: 1.04, y: -3 }}
          className="bg-white rounded-2xl p-6 shadow border border-gray-100 cursor-pointer"
        >
          <p className="text-gray-500">Memberships Actifs</p>
          <h3 className="text-4xl font-bold text-green-600">
            {activeMemberships}
          </h3>
        </motion.div>

        {/* UNPAID INVOICES */}
        <motion.div
          whileHover={{ scale: 1.04, y: -3 }}
          onClick={() => setActiveTab("club-membership-invoices")}
          className="bg-white rounded-2xl p-6 shadow border border-gray-100 cursor-pointer"
        >
          <p className="text-gray-500">Factures Club Impayées</p>
          <h3 className="text-4xl font-bold text-red-500">
            {unpaidClubInvoices.count}
          </h3>
          <p className="text-sm text-gray-600">
            Total: {formatCurrencyUSD(unpaidClubInvoices.total)}
          </p>
        </motion.div>
      </div>

      {/* ============================
    🎂 ANNIVERSAIRES DU CLUB (Exact Style École)
   ============================ */}
<div className="bg-white shadow rounded-lg p-6 mb-10">
  <h3 className="font-bold mb-4 text-aquaBlue text-lg flex items-center gap-2">
    🎂 Anniversaires du mois (Club)
  </h3>

  {clubBirthdays.length === 0 ? (
    <p className="text-gray-500 italic">Aucun anniversaire ce mois</p>
  ) : (
    <ul className="space-y-3">
      {clubBirthdays
        .sort((a, b) =>
          new Date(a.birth_date).getDate() -
          new Date(b.birth_date).getDate()
        )
        .map((b) => {
          const isBdayToday = isToday(b.birth_date);
          return (
            <li
              key={b.id}
              className={`flex items-center justify-between border-b pb-2 transition-all ${
                isBdayToday ? "animate-birthdayFlash font-semibold" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {isBdayToday ? "🎉" : "🎈"}
                </span>

                <span>
                  <span className="text-gray-800">
                    {b.main_full_name || b.full_name}
                  </span>

                  <span className="text-gray-500 ml-2 text-sm">
                    — {formatDateFrSafe(b.birth_date)}
                  </span>
                </span>
              </div>

              {isBdayToday && (
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium shadow-sm">
                  🎊 Aujourd’hui !
                </span>
              )}
            </li>
          );
        })}
    </ul>
  )}
</div>



      {/* UPCOMING BOOKINGS */}
      <div className="bg-white shadow rounded-2xl p-6 mb-10">
        <h3 className="font-bold text-aquaBlue text-lg mb-4">
          📅 Prochaines Réservations (7 jours)
        </h3>

        {upcomingBookings.length === 0 ? (
          <p className="text-gray-500 italic">Aucune réservation prévue</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {upcomingBookings.map((b) => (
              <li key={b.id} className="py-3 px-2">
                <p className="font-medium text-gray-800">{b.full_name}</p>
                <p className="text-sm text-gray-600">
                  📅 {formatDateFrSafe(b.date)} — 🕒 {b.start_time}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
