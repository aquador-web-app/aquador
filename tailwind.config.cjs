/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 🎨 Your A'QUA D'OR brand colors
      colors: {
        aquaBlue: "#00bf63",
        aquaYellow: "#fffb00",
        aquaOrange: "#ffae00",
        aquaRed: "#ff0000",
      },

      // 💫 Flash animation for birthdays
      keyframes: {
  birthdayFlash: {
    "0%, 100%": {
      color: "#16a34a", // green
      textShadow: "0 0 10px rgba(34, 197, 94, 0.8)",
      transform: "scale(1)",
    },
    "50%": {
      color: "#22c55e", // brighter green
      textShadow: "0 0 20px rgba(34, 197, 94, 1)",
      transform: "scale(1.05)",
    },
  },
},
animation: {
  birthdayFlash: "birthdayFlash 1.2s ease-in-out infinite",
},


      // 👁 Fix for ring colors
      ringColor: {
        aquaBlue: "#00bf63",
      },
    },
  },
  plugins: [],
};


