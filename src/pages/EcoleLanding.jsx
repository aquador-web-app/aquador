// src/pages/EcoleLanding.jsx
import { useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import CalendarView from "../components/CalendarView"
import { supabase } from "../lib/supabaseClient"

export default function EcoleLanding() {
  const [activeTab, setActiveTab] = useState("home")

  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactMessage, setContactMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const fadeVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
    exit: { opacity: 0, y: -12, transition: { duration: 0.25 } },
  }

  async function handleContactSubmit(e) {
    e.preventDefault()
    setFeedback(null)

    if (!contactName || !contactEmail || !contactMessage) {
      setFeedback({ type: "error", message: "Veuillez remplir tous les champs." })
      return
    }

    setIsSending(true)
    try {
      const { error } = await supabase.functions.invoke("contact-email", {
        body: { name: contactName, email: contactEmail, message: contactMessage },
      })

      if (error) throw error

      setFeedback({ type: "success", message: "Message envoyé avec succès." })
      setContactName("")
      setContactEmail("")
      setContactMessage("")
    } catch {
      setFeedback({ type: "error", message: "Erreur lors de l’envoi." })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-900">
      {/* ================= HEADER ================= */}
      <header className="fixed top-0 inset-x-0 bg-white/90 backdrop-blur shadow z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            to="/club"
            className="text-sm font-semibold text-white bg-blue-600 px-4 py-2 rounded-lg text-center hover:bg-orange-600 transition"
          >
            Portail Club A’QUA D’OR
          </Link>

          <img
            src="/logo/aquador.png"
            alt="A'QUA D'OR"
            className="h-14 mx-auto md:mx-0"
          />

          <nav className="flex justify-center gap-6 text-sm md:text-base font-semibold">
            {[
              { id: "home", label: "Accueil" },
              { id: "services", label: "Services" },
              { id: "apropos", label: "À Propos" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-1 transition ${
                  activeTab === tab.id
                    ? "text-blue-600 border-b-2 border-cyan-500"
                    : "text-gray-700 hover:text-orange-500"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ================= MAIN ================= */}
      <main className="flex-grow pt-[8.5rem] md:pt-[6.5rem] px-4 sm:px-6 md:px-10">
        <AnimatePresence mode="wait">
          {activeTab === "home" && (
            <motion.section
              key="home"
              variants={fadeVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative rounded-2xl overflow-hidden min-h-[60vh] flex items-center justify-center"
              style={{
                backgroundImage: "url('/img/bgd.jpg')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute inset-0 bg-black/50" />
              <div className="relative z-10 text-center px-6 max-w-2xl">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
                  École de Natation A’QUA D’OR
                </h1>
                <p className="text-white/90 text-base sm:text-lg mb-6">
                  Apprenez à nager et développez votre confiance dans l’eau,
                  quel que soit votre âge.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    to="/signup"
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition"
                  >
                    S’inscrire
                  </Link>
                  <Link
                    to="/login"
                    className="bg-white/20 text-white border border-white/40 px-6 py-3 rounded-xl font-semibold hover:bg-white/30 transition"
                  >
                    Se connecter
                  </Link>
                </div>
              </div>
            </motion.section>
          )}

          {activeTab === "services" && (
            <motion.section
              key="services"
              variants={fadeVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="max-w-6xl mx-auto text-center py-16"
            >
              <h2 className="text-2xl md:text-3xl font-bold text-yellow-50 mb-10">
                Nos Services
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    title: "Cours de Natation",
                    text: "Cours adaptés à tous les niveaux avec des instructeurs qualifiés.",
                  },
                  {
                    title: "Aquafitness",
                    text: "Séances dynamiques pour renforcer le corps tout en douceur.",
                  },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="p-6 rounded-2xl shadow bg-white text-left"
                  >
                    <h3 className="text-xl font-semibold text-blue-600 mb-2">
                      {s.title}
                    </h3>
                    <p className="text-gray-700">{s.text}</p>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {activeTab === "apropos" && (
            <motion.section
              key="apropos"
              variants={fadeVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="max-w-6xl mx-auto text-center py-16"
            >
              <h2 className="text-2xl md:text-3xl font-bold text-yellow-50 mb-8">
                À Propos
              </h2>

              <p className="text-yellow-50 mb-10 max-w-3xl mx-auto">
                A’QUA D’OR œuvre pour une éducation aquatique sûre, moderne
                et accessible à tous.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { title: "Mission", text: "Former des nageurs confiants et autonomes." },
                  { title: "Vision", text: "Être une référence en éducation aquatique en Haïti." },
                  { title: "Valeurs", text: "Sécurité, Respect, Excellence, Discipline." },
                ].map((v, i) => (
                  <div key={i} className="bg-white p-6 rounded-xl shadow text-left">
                    <h3 className="text-lg font-semibold text-blue-600 mb-2">
                      {v.title}
                    </h3>
                    <p className="text-gray-700">{v.text}</p>
                  </div>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ================= CALENDAR ================= */}
        <section className="max-w-6xl mx-auto mt-16 bg-white rounded-2xl shadow p-4 sm:p-6">
          <CalendarView mode="ecole" />
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="bg-white text-gray-800 py-12 px-4 mt-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h4 className="text-lg font-bold mb-4">Contact</h4>
            <p>Email : contact@clubaquador.com</p>
            <p>Téléphone : +509 3891 2429</p>
            <p>Adresse : Delmas 75, Haïti</p>
          </div>

          <form
            onSubmit={handleContactSubmit}
            className="flex flex-col gap-3 bg-[#0a2540] p-4 rounded-xl"
          >
            <input
              placeholder="Votre nom"
              className="px-4 py-2 rounded bg-white/10 text-white"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
            />
            <input
              placeholder="Votre email"
              className="px-4 py-2 rounded bg-white/10 text-white"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
            />
            <textarea
              rows="3"
              placeholder="Votre message"
              className="px-4 py-2 rounded bg-white/10 text-white"
              value={contactMessage}
              onChange={e => setContactMessage(e.target.value)}
            />
            <button
              disabled={isSending}
              className="bg-blue-600 text-white py-2 rounded hover:bg-orange-600 transition"
            >
              {isSending ? "Envoi..." : "Envoyer"}
            </button>

            {feedback && (
              <p className={`text-sm ${
                feedback.type === "success" ? "text-green-300" : "text-red-300"
              }`}>
                {feedback.message}
              </p>
            )}
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          © {new Date().getFullYear()} A’QUA D’OR
        </p>
      </footer>
    </div>
  )
}
