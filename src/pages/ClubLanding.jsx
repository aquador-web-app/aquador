// src/pages/ClubLanding.jsx
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import CalendarView from "../components/CalendarView";
import ClubSignupDocsModal from "../components/ClubSignupDocsModal";


export default function ClubLanding() {
  const [closingTime, setClosingTime] = useState("");
const [overtimeCutoff, setOvertimeCutoff] = useState("");
const [extraTimePricePer30, setExtraTimePricePer30] = useState(0);
const [overtimePricePer30, setOvertimePricePer30] = useState(0);


  // Query params
  const [sp] = useSearchParams();
  const invoiceId = sp.get("invoice_id") || null;

  // Booking info (to prefill mini form)
  const [booking, setBooking] = useState(null);

  // Mini-signup form
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestAddress, setGuestAddress] = useState("");

  const [showMiniSignup, setShowMiniSignup] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);

  const navigate = useNavigate();

  // === 1️⃣ Load closing time
  useEffect(() => {
  (async () => {
    const { data, error } = await supabase
      .from("calendar_settings")
      .select(
        "closing_time, overtime_cutoff_time, extra_time_price_per_30min, overtime_price_per_30min"
      )
      .single();

    if (error) {
      console.error("❌ Failed to load calendar settings:", error);
      return;
    }

    setClosingTime(data.closing_time);
    setOvertimeCutoff(
      data.overtime_cutoff_time || data.closing_time
    );
    setExtraTimePricePer30(data.extra_time_price_per_30min || 0);
    setOvertimePricePer30(data.overtime_price_per_30min || 0);
  })();
}, []);


  // === 2️⃣ Listen for admin updates to closing time
  useEffect(() => {
    const channel = supabase
      .channel("calendar_settings_updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calendar_settings",
        },
        (payload) => {
  const updated = payload.new;
  if (!updated) return;

  console.log("⏳ Calendar settings updated:", updated);

  setClosingTime(updated.closing_time);
  setOvertimeCutoff(
    updated.overtime_cutoff_time || updated.closing_time
  );
  setExtraTimePricePer30(updated.extra_time_price_per_30min || 0);
  setOvertimePricePer30(updated.overtime_price_per_30min || 0);
}

      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // === 3️⃣ If invoice_id is present → load booking + show mini signup
  useEffect(() => {
    if (!invoiceId) return;

    (async () => {
      const { data, error } = await supabase
        .from("club_booking_invoices")
        .select("*, venue_bookings(*)")
        .eq("id", invoiceId)
        .single();

      if (!error && data?.venue_bookings) {
        const bk = data.venue_bookings;
        setBooking(bk);

        // Prefill mini signup
        setGuestName(bk.full_name || "");
        setGuestEmail(bk.email || "");
        setGuestPhone(bk.phone || "");
        setGuestAddress("");

        setShowMiniSignup(true);
      }
    })();
  }, [invoiceId]);

  // === 4️⃣ Create guest profile in club_users
  async function handleGuestContinue() {
    if (!guestName.trim() || !guestEmail.trim()) {
      alert("Nom et email sont requis.");
      return;
    }

    const { data, error } = await supabase
      .from("club_users")
      .insert({
        full_name: guestName,
        email: guestEmail,
        phone: guestPhone,
        address: guestAddress,
        signup_type: "guest",
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      alert("Erreur lors de la création du profil.");
      return;
    }

    // Store ID locally for next steps
    localStorage.setItem("club_guest_id", data.id);

    // Next: open the CLUB RULES modal
    setShowMiniSignup(false);
    setShowDocsModal(true);
  }

  // === 5️⃣ When documents signed → send user to guest dashboard
  function handleDocsDone(signedResults) {
    const guestId = localStorage.getItem("club_guest_id");

    navigate(`/club/guest/${guestId}?invoice_id=${invoiceId}`);
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* === MINI SIGN-UP POPUP === */}
      {showMiniSignup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-3">
              Continuer en tant que visiteur
            </h2>

            <p className="text-sm text-gray-600 mb-4">
              Ces informations servent uniquement à générer vos documents de
              sécurité et votre facture.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-sm">Nom complet *</label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm">Email *</label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm">Téléphone</label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm">Adresse</label>
                <input
                  className="w-full border rounded-md px-3 py-2"
                  value={guestAddress}
                  onChange={(e) => setGuestAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end mt-5">
              <button
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                onClick={handleGuestContinue}
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === SIGN DOCUMENTS MODAL === */}
      {showDocsModal && (
        <ClubSignupDocsModal
          fullName={guestName}
          onClose={() => setShowDocsModal(false)}
          onDone={handleDocsDone}
        />
      )}

      {/* === HEADER === */}
<header className="fixed top-0 left-0 w-full bg-white/70 backdrop-blur-md shadow z-50">
  <div className="flex flex-col md:flex-row items-center gap-3 md:gap-0 md:justify-between py-3 px-4 md:px-6">

    {/* École portal */}
    <Link
      to="/ecole"
      className="w-full md:w-auto text-center bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold shadow hover:bg-orange-600 transition"
    >
      Portail École
    </Link>

    {/* Club login */}
    <Link
      to="/login"
      className="w-full md:w-auto text-center bg-white text-blue-600 border border-blue-500 px-4 py-2 rounded-lg font-semibold shadow hover:bg-blue-100 transition"
    >
      Se connecter (Club)
    </Link>

  </div>
</header>


      {/* === PAGE CONTENT === */}
      <div
        className="relative w-full min-h-[80svh] pt-[96px] pb-16 flex items-center justify-center text-center px-4"
        style={{
          backgroundImage:
    "url('https://jrwsxeiueezuiueglfpv.supabase.co/storage/v1/object/public/assets/club%20bgd.jpeg')",
          backgroundSize: "cover",
          backgroundPosition: "center 68%",
        }}
      >
        <div className="absolute inset-0 bg-black/50"></div>

        <div className="relative z-10 max-w-3xl">
          <img
            src="/logo/aquador.png"
            alt="A'QUA D'OR Logo"
            className="h-20 sm:h-24 md:h-32 max-w-[220px] mx-auto mb-6 object-contain drop-shadow-[0_6px_20px_rgba(0,0,0,0.6)]"
          />

          <h1 className="text-white text-3xl sm:text-4xl md:text-5xl font-bold mb-3 leading-tight">
            Bienvenue au Club A’QUA D’OR
          </h1>

          <p className="text-white/90 text-base sm:text-lg md:text-xl mb-6">
            Le lieu idéal pour vos moments de détente, vos événements et vos
            rencontres.
          </p>

          <div className="mt-5 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/club/signup"
              className="bg-aquaBlue text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-orange-600 shadow-lg transition"
            >
              Souscrire à un plan de membership
            </Link>

            <Link
              to="/massage"
              className="bg-white/90 text-aquaBlue border border-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-white shadow-lg transition"
            >
              💆 Prendre un rendez-vous massage
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-16 mb-20 px-4">
        <div className="text-center mb-4 md:mb-6">
  <h2 className="text-lg md:text-2xl font-semibold text-gray-800 dark:text-gray-100">
    📅 Disponibilités & Activités 
  </h2>

  <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1">
    Cliquer sur une date pour effectuer une réservation
  </p>
</div>



        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 border border-gray-200 dark:border-gray-700">
          <CalendarView
  mode="club"
  closingTime={closingTime}
  overtimeCutoff={overtimeCutoff}
  extraTimePricePer30={extraTimePricePer30}
  overtimePricePer30={overtimePricePer30}
/>
        </div>
      </div>
    </div>
  );
}
