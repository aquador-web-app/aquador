import { useEffect, useState, useRef } from "react";
import Confetti from "react-confetti";
import { motion, AnimatePresence } from "framer-motion";
import ReactCanvasConfetti from "react-canvas-confetti";

export default function BirthdayPopup({ fullName, birthDate, childrenBirthdays = [] }) {
  const [show, setShow] = useState(false);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  function parseHaitiDate(dateStr) {
  if (!dateStr) return null;

  const [y, m, d] = dateStr.split("-");
  // Create date **without** timezone shift
  return new Date(Number(y), Number(m) - 1, Number(d));
}


  const [displayName, setDisplayName] = useState(null);
  const [isPluralBirthday, setIsPluralBirthday] = useState(false);

  const fireworksInstance = useRef(null);
  const intervalRef = useRef(null);

  // =============== FIREWORKS ==================
  const makeShot = (particleRatio, opts = {}) => {
    if (!fireworksInstance.current) return;
    fireworksInstance.current({
      particleCount: Math.floor(300 * particleRatio),
      startVelocity: 60,
      spread: 120,
      ticks: 120,
      origin: { x: Math.random(), y: 0.4 + Math.random() * 0.5 },
      colors: ["#00bfff", "#ffae00", "#ff0000", "#fffb00"],
      ...opts,
    });
  };

  const fire = () => {
    makeShot(0.25, { spread: 26 });
    makeShot(0.2, { spread: 60 });
    makeShot(0.35, { spread: 100 });
    makeShot(0.1, { spread: 120, decay: 0.91 });
  };

  const startFireworks = () => {
    if (!fireworksInstance.current) {
      setTimeout(startFireworks, 300);
      return;
    }
    fire();
    intervalRef.current = setInterval(fire, 1200);
  };

  const stopFireworks = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // =============== BIRTHDAY DETECTION ==================
  useEffect(() => {
    const haitiNow = new Date(
  new Date().toLocaleString("en-US", { timeZone: "America/Port-au-Prince" })
);

// TRUE Haiti month/day (no UTC)
const todayMD = String(haitiNow.getMonth() + 1).padStart(2, "0") +
                "-" +
                String(haitiNow.getDate()).padStart(2, "0");


    // --- ALL BIRTHDAYS ---
let birthdayList = [];

// Children
childrenBirthdays.forEach(child => {
  if (!child.birth_date) return;

  const d = parseHaitiDate(child.birth_date);
  const md =
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");

  if (md === todayMD) birthdayList.push({ full_name: child.full_name });
});

// Parent
if (birthDate) {
  const d = parseHaitiDate(birthDate);
  const md =
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");

  if (md === todayMD) birthdayList.push({ full_name: fullName });
}

    if (birthdayList.length > 0) {
      // format names
      const names = birthdayList.map((p) => p.full_name.split(" ")[0]);

      let formatted;
      if (names.length === 1) formatted = names[0];
      else if (names.length === 2) formatted = names.join(" et ");
      else formatted = names.slice(0, -1).join(", ") + " et " + names[names.length - 1];

      setDisplayName(formatted);
      setIsPluralBirthday(names.length > 1);

      // show popup
      setShow(true);
      setTimeout(() => {
        stopFireworks();
        setShow(false);
      }, 15000);
      setTimeout(() => {
        startFireworks();
      }, 3000);
    }

    // resizing listener
    const resize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      stopFireworks();
    };
  }, [birthDate, childrenBirthdays]);

  // =============== RENDER ==================
  if (!show || !displayName) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/50"
      >
        <Confetti
          width={dimensions.width}
          height={dimensions.height}
          numberOfPieces={400}
          recycle={false}
        />

        <ReactCanvasConfetti
          onInit={({ confetti }) => (fireworksInstance.current = confetti)}
          style={{
            position: "fixed",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            top: 0,
            left: 0,
            zIndex: 100000,
          }}
        />

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-lg"
        >
          <h1 className="text-3xl font-bold text-aquaBlue mb-4">
            🎉 Joyeux anniversaire, {displayName}! 🎂
          </h1>

          <p className="text-gray-600 text-lg mb-4">
            {isPluralBirthday
              ? "Toute l'équipe de A’QUA D’OR vous souhaite un merveilleux anniversaire."
              : "Toute l'équipe de A’QUA D’OR te souhaite un merveilleux anniversaire."}
          </p>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              stopFireworks();
              setShow(false);
            }}
            className="bg-aquaBlue text-white px-6 py-2 rounded-full font-semibold shadow hover:bg-blue-600"
          >
            ❤️❤️‍🔥Thank you ❤️‍🔥❤️
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
