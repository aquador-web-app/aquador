// src/pages/EcoleLanding.jsx
import { useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import CalendarView from "../components/CalendarView"
import { supabase } from "../lib/supabaseClient"

export default function EcoleLanding() {
  const [activeTab, setActiveTab] = useState("home")

  // --- Contact form state ---
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactMessage, setContactMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: "success" | "error", message: string }

  const fadeVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
    exit: { opacity: 0, y: -15, transition: { duration: 0.3 } },
  }

  async function handleContactSubmit(e) {
    e.preventDefault()
    setFeedback(null)

    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      setFeedback({
        type: "error",
        message: "Veuillez remplir tous les champs.",
      })
      return
    }

    setIsSending(true)

    try {
      const { data, error } = await supabase.functions.invoke("contact-email", {
        body: {
          name: contactName,
          email: contactEmail,
          message: contactMessage,
        },
      })

      if (error) {
        console.error("contact-email error:", error)
        setFeedback({
          type: "error",
          message: "Une erreur est survenue. Veuillez réessayer plus tard.",
        })
      } else {
        setFeedback({
          type: "success",
          message: "Votre message a été envoyé avec succès. Merci !",
        })
        setContactName("")
        setContactEmail("")
        setContactMessage("")
      }
    } catch (err) {
      console.error("contact-email exception:", err)
      setFeedback({
        type: "error",
        message: "Une erreur est survenue. Veuillez réessayer plus tard.",
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full bg-white/90 backdrop-blur-md shadow z-50">
        <div className="flex flex-col items-center py-3 relative">
          {/* Left button */}
          <Link
            to="/club"
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold shadow hover:bg-orange-600 transition"
          >
            Accéder au portail du Club A’QUA D’OR
          </Link>

          {/* Logo */}
          <img
            src="/logo/aquador.png"
            alt="A'QUA D'OR Logo"
            className="h-16 md:h-20 mb-2 drop-shadow"
          />

          {/* Navigation */}
          <nav className="flex gap-10 text-lg font-semibold">
            {[
              { id: "home", label: "Accueil" },
              { id: "services", label: "Services" },
              { id: "apropos", label: "À Propos" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-150 relative transition ${
                  activeTab === tab.id
                    ? "text-blue-500"
                    : "text-gray-700 hover:text-orange-500"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute left-0 bottom-0 w-full h-0.5 bg-cyan-500 rounded"></span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow pt-36 pb-1 px-20 bg-gray-900">
        <AnimatePresence mode="wait">
          {activeTab === "home" && (
            <motion.section
              key="home"
              variants={fadeVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative flex flex-col items-center justify-center text-center min-h-[70vh] rounded-xl overflow-hidden shadow-lg"
              style={{
                backgroundImage: "url('/img/bgd.jpg')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute inset-0 bg-black/50" />
              <div className="relative z-10 p-10">
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow">
                  Bienvenue à l’École de Natation
                </h1>
                <p className="text-white/90 max-w-2xl mx-auto mb-6 text-lg md:text-xl">
                  Apprenez à nager, améliorez vos compétences et profitez de nos cours adaptés à tous les âges.
                </p>
                <div className="flex gap-4 justify-center">
                  <Link
                    to="/signup"
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg font-semibold shadow hover:bg-orange-600 transition"
                  >
                    S’inscrire
                  </Link>
                  <Link
                    to="/login"
                    className="bg-white/20 text-white border border-white/40 px-6 py-3 rounded-xl text-lg font-semibold hover:bg-white/30 transition"
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
              className="max-w-5xl mx-auto text-center"
            >
              <h2 className="text-3xl font-bold text-yellow-50 mb-10">
                {" "}
                <br />
                Nos Services
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="p-8 rounded-2xl shadow-xl bg-gradient-to-br from-blue-50 to-blue-100">
                  <h3 className="text-2xl font-semibold mb-4 text-blue-500">
                    Cours de Natation
                  </h3>
                  <p className="text-gray-700">
                    Des cours adaptés à tous les niveaux, des débutants aux nageurs confirmés,
                    encadrés par nos instructeurs qualifiés.
                  </p>
                </div>
                <div className="p-8 rounded-2xl shadow-xl bg-gradient-to-br from-teal-50 to-teal-100">
                  <h3 className="text-2xl font-semibold mb-4 text-blue-500">
                    Aquafitness
                  </h3>
                  <p className="text-gray-700">
                    Des séances dynamiques et ludiques pour améliorer votre forme physique
                    tout en profitant des bienfaits de l’eau.
                  </p>
                </div>
                <br />
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
              className="max-w-5xl mx-auto text-center"
            >
              <h2 className="text-3xl font-bold text-yellow-50 mb-10">
                {" "}
                <br />
                À Propos
              </h2>
              <p className="text-yellow-50 mb-6">
                L’École de Natation A’QUA D’OR est née de la passion pour la natation et la volonté
                d’offrir à chacun un environnement sûr et motivant pour apprendre.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                <div className="p-6 rounded-xl shadow bg-white">
                  <h3 className="text-xl font-semibold text-blue-500 mb-2">
                    Mission
                  </h3>
                  <p className="text-gray-700">
                    Former des nageurs compétents et autonomes, en valorisant la discipline et la confiance en soi.
                  </p>
                </div>
                <div className="p-6 rounded-xl shadow bg-white">
                  <h3 className="text-xl font-semibold text-blue-500 mb-2">
                    Vision
                  </h3>
                  <p className="text-gray-700">
                    Devenir un acteur incontournable de l’éducation aquatique et du bien-être en Haïti.
                  </p>
                </div>
                <div className="p-6 rounded-xl shadow bg-white">
                  <h3 className="text-xl font-semibold text-blue-500 mb-2">
                    Valeurs
                  </h3>
                  <p className="text-gray-700">
                    Excellence, Respect, Sécurité et Esprit d’équipe guident chacune de nos actions.
                  </p>
                </div>
                <br />
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* === Calendar Section === */}
      <div className="mt-16 bg-white rounded-2xl shadow-lg p-6">
        <CalendarView mode="ecole" />
      </div>

      {/* Footer */}
      <footer className="bg-white text-gray-800 py-12 px-6 mt-auto">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h4 className="text-xl font-bold mb-4">Contact</h4>
            <p>Email : contact@clubaquador.com</p>
            <p>Téléphone : +509 3891 2429</p>
            <p>Adresse : 8, Imp Hall, Rue Beauvais, Delmas 75</p>
          </div>
          <div>
            <h4 className="text-xl font-bold mb-4">Envoyer un message</h4>
            <form
              className="flex flex-col gap-3 bg-[#0a2540] p-4 rounded-xl"
              onSubmit={handleContactSubmit}
            >
              <input
                type="text"
                placeholder="Votre nom"
                className="px-4 py-2 rounded-lg bg-white/10 text-white placeholder-gray-300"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
              <input
                type="email"
                placeholder="Votre email"
                className="px-4 py-2 rounded-lg bg-white/10 text-white placeholder-gray-300"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
              <textarea
                placeholder="Votre message"
                rows="3"
                className="px-4 py-2 rounded-lg bg-white/10 text-white placeholder-gray-300"
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
              />
              <button
                type="submit"
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition disabled:opacity-60"
                disabled={isSending}
              >
                {isSending ? "Envoi en cours..." : "Envoyer"}
              </button>

              {feedback && (
                <p
                  className={`text-sm mt-1 ${
                    feedback.type === "success"
                      ? "text-green-300"
                      : "text-red-300"
                  }`}
                >
                  {feedback.message}
                </p>
              )}
            </form>
          </div>
        </div>
        <div className="text-center mt-8 text-sm text-gray-500">
          © {new Date().getFullYear()} A’QUA D’OR. Tous droits réservés.
        </div>
      </footer>
    </div>
  )
}
