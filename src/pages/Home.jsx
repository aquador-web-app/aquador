// src/pages/Home.jsx
import { Link } from "react-router-dom"

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
      {/* Dark overlay for contrast */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Centered logo */}
      <div className="relative z-10 w-full flex justify-center pt-10 md:pt-14">
        <img
          src="/logo/aquador.png"
          alt="A'QUA D'OR Logo"
          className="h-28 w-auto md:h-36 object-contain drop-shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
        />
      </div>

      {/* Two cards */}
      <main className="relative z-10 min-h-[calc(100vh-160px)] flex items-center justify-center px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          {/* École de Natation */}
          <Link
            to="/ecole"
            className="rounded-2xl p-8 bg-white/15 backdrop-blur-md border border-white/25 shadow-xl 
                       flex flex-col items-center justify-center text-center gap-4
                       hover:bg-white/25 hover:scale-105 transform transition"
          >
            <h2 className="text-white text-3xl font-bold">École de Natation</h2>
            <p className="text-white/85 text-lg">
              Programmes, inscriptions et cours
            </p>
          </Link>

          {/* Club A’QUA D’OR */}
          <Link
            to="/club"
            className="rounded-2xl p-8 bg-white/15 backdrop-blur-md border border-white/25 shadow-xl 
                       flex flex-col items-center justify-center text-center gap-4
                       hover:bg-white/25 hover:scale-105 transform transition"
          >
            <h2 className="text-white text-3xl font-bold">Club A’QUA D’OR</h2>
            <p className="text-white/85 text-lg">
              Membership, événements et détente
            </p>
          </Link>
        </div>
      </main>
    </div>
  )
}
