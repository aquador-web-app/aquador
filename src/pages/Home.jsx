// src/pages/Home.jsx
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{
        backgroundImage: "url('/img/bgd.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Page container */}
      <div className="relative z-10 min-h-screen flex flex-col px-4">
        
        {/* Logo – top centered */}
        <div className="flex justify-center pt-6 md:pt-10">
          <img
            src="/logo/aquador.png"
            alt="A'QUA D'OR Logo"
            className="
              h-14 md:h-36
              w-auto
              object-contain
              drop-shadow-[0_6px_20px_rgba(0,0,0,0.45)]
            "
          />
        </div>

        {/* Cards – centered */}
        <div className="flex flex-1 items-center justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full max-w-4xl">
            
            {/* École de Natation */}
            <Link
              to="/ecole"
              className="
                rounded-2xl
                p-4 md:p-8
                bg-white/15 backdrop-blur-md
                border border-white/25 shadow-xl
                flex flex-col items-center justify-center text-center
                gap-2 md:gap-4
                transition transform
                hover:bg-white/25 hover:scale-105
              "
            >
              <h2 className="text-white text-xl md:text-3xl font-bold">
                École de Natation
              </h2>
              <p className="text-white/85 text-sm md:text-lg">
                Programmes, inscriptions et cours
              </p>
            </Link>

            {/* Club A’QUA D’OR */}
            <Link
              to="/club"
              className="
                rounded-2xl
                p-4 md:p-8
                bg-white/15 backdrop-blur-md
                border border-white/25 shadow-xl
                flex flex-col items-center justify-center text-center
                gap-2 md:gap-4
                transition transform
                hover:bg-white/25 hover:scale-105
              "
            >
              <h2 className="text-white text-xl md:text-3xl font-bold">
                Club A’QUA D’OR
              </h2>
              <p className="text-white/85 text-sm md:text-lg">
                Membership, événements et détente
              </p>
            </Link>

          </div>
        </div>
      </div>
    </div>
  );
}
