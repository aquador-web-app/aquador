import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { motion } from "framer-motion"
import { formatCurrencyUSD, formatDateFrSafe } from '../../lib/dateUtils'

export default function UserCommissions({ setActiveTab, hideActions = false }) {
  const [commissions, setCommissions] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // get user profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', user.id)
      .single()
    setProfile(prof)

    // get commissions and enrich with referred names
    const { data: comms, error } = await supabase
  .from('commissions')
  .select('id, referrer_user_id, referred_user_id, amount, remaining_amount, status, created_at')
  .eq('referrer_user_id', user.id)
  .order('created_at', { ascending: false })


    if (error) {
      console.error('❌ commissions error:', error)
      setCommissions([])
      setLoading(false)
      return
    }

    // fetch all referred profiles in one query
    const referredIds = [...new Set((comms || []).map(c => c.referred_user_id).filter(Boolean))]
    let nameMap = {}
    if (referredIds.length > 0) {
      const { data: refs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', referredIds)
      nameMap = Object.fromEntries((refs || []).map(r => [r.id, r.full_name]))
    }

    // merge names into commissions list
    const merged = (comms || []).map(c => ({
      ...c,
      referred_name: nameMap[c.referred_user_id] || '—',
    }))

    setCommissions(merged)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="p-6">Chargement...</div>

  const balance = commissions.reduce(
  (acc, c) => acc + Number(c.remaining_amount ?? c.amount ?? 0),
  0
)


  return (
    <div className="bg-white p-6 rounded-2xl shadow space-y-6 text-center">
      <h1 className="text-lg font-bold text-gray-800">Mes Commissions</h1>

      {/* 💳 Balance card */}
      <motion.div
        className="relative p-6 bg-white shadow rounded-2xl border border-gray-100 w-full max-w-md mx-auto"
        whileHover={{ scale: 1.02 }}
      >
        <h3 className="text-sm font-semibold text-gray-500">Balance actuelle</h3>
        <p
          className={`text-3xl font-bold mt-2 ${
            balance === 0 ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatCurrencyUSD(balance)}
        </p>
      </motion.div>

      {/* Buttons */}
      {!hideActions && (
      <div className="flex flex-col md:flex-row justify-center gap-3 mt-4">
        <button
          onClick={() => setActiveTab && setActiveTab("commissions-requests")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-all font-medium"
        >
          Demander un paiement
        </button>
        <button
          onClick={() => setActiveTab && setActiveTab("boutique")}
          className="px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-all font-medium"
        >
          Utiliser en boutique
        </button>
      </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto -mx-4 md:mx-0">
      <table className="min-w-[640px] w-full text-sm border mt-6">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border text-center">Nom complet</th>
            <th className="p-2 border text-center">Date</th>
            <th className="p-2 border text-center">Montant</th>
            <th className="p-2 border text-center">Statut</th>
          </tr>
        </thead>
        <tbody>
          {commissions.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="p-2 border text-center">{c.referred_name}</td>
              <td className="p-2 border text-center">{formatDateFrSafe(c.created_at)}</td>
              <td className="p-2 border text-center">
          {formatCurrencyUSD(c.remaining_amount ?? c.amount)}
        </td>

              <td className="p-2 border text-center">
                {c.status === "paid" ? (
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                    Payé
                  </span>
                ) : c.status === "partially_paid" ? (
                  <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-semibold">
                    Partiellement payé
                  </span>
                ) : (
                  <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-semibold">
                    En attente
                  </span>
                )}
              </td>
            </tr>
          ))}

          {!commissions.length && (
            <tr>
              <td colSpan={4} className="text-center text-gray-500 py-4 italic">
                Aucune commission
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
