import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { jsPDF } from "jspdf"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export default function Signup() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    birth_date: "",
    sex: "",
    referral_code: "",
    accept_rules: false,
    accept_consent: false,
    accept_optional: false,
  })
  const [loading, setLoading] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [showOptional, setShowOptional] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [docUrls, setDocUrls] = useState(null) // <- new

  // Load PDF URLs from Supabase app_settings (with fallback to /public/docs)
  useEffect(() => {
    const loadDocs = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "doc_urls")
        .single()
      setDocUrls(data?.value || null)
    }
    loadDocs()
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!form.accept_rules || !form.accept_consent) {
      setError("Vous devez accepter les deux documents obligatoires.")
      return
    }

    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      setError("Veuillez remplir tous les champs obligatoires.")
      return
    }

    if (form.password !== form.confirmPassword) {
      setError("Les mots de passe ne correspondent pas.")
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          first_name: form.first_name,
          middle_name: form.middle_name,
          last_name: form.last_name,
          birth_date: form.birth_date || null,
          sex: form.sex || null,
          role: "student",
          referral_code: form.referral_code || null,
          accepted_rules: form.accept_rules,
          accepted_consent: form.accept_consent,
          accepted_optional: form.accept_optional,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Générer une facture automatique
    if (data?.user) {
      await supabase.from("factures").insert([
        {
          student_id: data.user.id,
          montant: 60,
          status: "non payé",
          due_date: new Date(
            new Date().setMonth(new Date().getMonth() + 1)
          )
            .toISOString()
            .split("T")[0],
        },
      ])
    }

    // Générer un PDF récapitulatif
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Formulaire d’inscription - A'QUA D'OR", 20, 20)
    doc.setFontSize(12)
    doc.text(
      `Nom: ${form.first_name} ${form.middle_name || ""} ${form.last_name}`,
      20,
      40
    )
    doc.text(`Email: ${form.email}`, 20, 50)
    doc.text(`Date de naissance: ${form.birth_date || "-"}`, 20, 60)
    doc.text(`Sexe: ${form.sex || "-"}`, 20, 70)
    doc.text(`Code de parrainage: ${form.referral_code || "-"}`, 20, 80)
    doc.text(
      "Merci pour votre inscription à l’école de natation A'QUA D'OR.",
      20,
      100
    )
    doc.save(`inscription_${form.first_name}_${form.last_name}.pdf`)

    setLoading(false)
    setSuccess("Compte créé avec succès. Vérifiez vos emails pour confirmer.")
    setTimeout(() => navigate("/dashboard"), 2500)
  }

  // Helpers: compute final URLs with fallback to /public/docs
  const urlReglements =
    docUrls?.reglements || "/docs/reglements_natation.pdf"
  const urlAccord =
    docUrls?.accord || "/docs/accord_participant.pdf"
  const consentEnabled =
    (docUrls?.consentement_enabled ?? true)
  const urlConsent =
    docUrls?.consentement || "/docs/formulaire_consentement.pdf"

  return (
    <div className="max-w-md mx-auto mt-10 bg-white dark:bg-gray-800 shadow p-6 rounded-xl">
      <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-gray-100 mb-6">
        Créer un compte
      </h2>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {success && <p className="text-green-600 mb-4">{success}</p>}

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <Label>Prénom *</Label>
          <Input
            type="text"
            name="first_name"
            value={form.first_name}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <Label>Deuxième prénom</Label>
          <Input
            type="text"
            name="middle_name"
            value={form.middle_name}
            onChange={handleChange}
          />
        </div>

        <div>
          <Label>Nom *</Label>
          <Input
            type="text"
            name="last_name"
            value={form.last_name}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <Label>Email *</Label>
          <Input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <Label>Mot de passe *</Label>
          <Input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <Label>Confirmer le mot de passe *</Label>
          <Input
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <Label>Date de naissance</Label>
          <Input
            type="date"
            name="birth_date"
            value={form.birth_date}
            onChange={handleChange}
          />
        </div>

        <div>
          <Label>Sexe</Label>
          <select
            name="sex"
            value={form.sex}
            onChange={handleChange}
            className="w-full border rounded-lg p-2 dark:bg-gray-700"
          >
            <option value="">Sélectionnez</option>
            <option value="Féminin">Féminin</option>
            <option value="Masculin">Masculin</option>
            <option value="Autre">Autre</option>
          </select>
        </div>

        <div>
          <Label>Code de parrainage (optionnel)</Label>
          <Input
            type="text"
            name="referral_code"
            value={form.referral_code}
            onChange={handleChange}
          />
        </div>

        {/* Obligatoire : Règlements */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="acceptRules"
            checked={form.accept_rules}
            onCheckedChange={() =>
              setForm((prev) => ({ ...prev, accept_rules: !prev.accept_rules }))
            }
          />
          <Label htmlFor="acceptRules">
            J’ai lu et j’accepte le document « Règlements A'QUA D'OR Cours de natation »
          </Label>
          <Button type="button" variant="link" onClick={() => setShowRules(true)}>
            Voir PDF
          </Button>
        </div>

        {/* Obligatoire : Accord Participant */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="acceptConsent"
            checked={form.accept_consent}
            onCheckedChange={() =>
              setForm((prev) => ({
                ...prev,
                accept_consent: !prev.accept_consent,
              }))
            }
          />
          <Label htmlFor="acceptConsent">
            J’ai lu et j’accepte le document « ACCORD DU PARTICIPANT »
          </Label>
          <Button
            type="button"
            variant="link"
            onClick={() => setShowConsent(true)}
          >
            Voir PDF
          </Button>
        </div>

        {/* Optionnel : Formulaire de consentement */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="acceptOptional"
            checked={form.accept_optional}
            onCheckedChange={() =>
              setForm((prev) => ({
                ...prev,
                accept_optional: !prev.accept_optional,
              }))
            }
          />
          <Label htmlFor="acceptOptional">
            Je signe aussi le « Formulaire de consentement - A'QUA D'OR » (optionnel)
          </Label>
          <Button
            type="button"
            variant="link"
            onClick={() => setShowOptional(true)}
          >
            Voir PDF
          </Button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-aquaYellow text-gray-900 py-2 rounded-lg font-semibold hover:bg-yellow-400 transition"
        >
          {loading ? "Création en cours..." : "S’inscrire"}
        </button>
      </form>

      {/* Modal Règlements */}
      <Dialog open={showRules} onOpenChange={setShowRules}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Règlements A'QUA D'OR Cours de natation</DialogTitle>
          </DialogHeader>
          <iframe src={urlReglements} className="w-full h-[500px]" />
          <DialogFooter>
            <Button onClick={() => setShowRules(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Accord Participant */}
      <Dialog open={showConsent} onOpenChange={setShowConsent}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>ACCORD DU PARTICIPANT</DialogTitle>
          </DialogHeader>
          <iframe src={urlAccord} className="w-full h-[500px]" />
          <DialogFooter>
            <Button onClick={() => setShowConsent(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Formulaire de consentement */}
      <Dialog open={showOptional} onOpenChange={setShowOptional}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Formulaire de consentement - A'QUA D'OR</DialogTitle>
          </DialogHeader>
          {consentEnabled ? (
            <iframe src={urlConsent} className="w-full h-[500px]" />
          ) : (
            <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
              Ce document optionnel est désactivé par l’administrateur.
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowOptional(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
