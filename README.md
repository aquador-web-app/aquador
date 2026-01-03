# A'QUA D'OR – React + Supabase (No backend)

## ⚙️ Prérequis
- Node 18+
- Un projet Supabase (URL + ANON KEY)

## 🚀 Démarrage
```bash
npm install
cp .env.example .env
# Remplir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```
Ouvre http://localhost:5173

## 🗄️ Base de données
1. Ouvre Supabase > SQL editor
2. Colle `supabase_schema.sql` et exécute.
3. Crée un **bucket Storage** nommé `agreements` (pour signatures).

## 👤 Admin
- Crée un compte via /register puis, dans Supabase (table `profiles`), change la colonne `role` en `admin` pour ton utilisateur.

## 🌟 Inclus
- Auth email/password (Supabase)
- Inscription complète (téléphone, maladie, première leçon, referral prérempli ?ref=)
- Génération code referral (initiales + aa) + unicité (-1, -2…)
- Facture initiale selon type d’inscription
- Dashboard utilisateur (code referral + factures)
- Dashboard admin (compteurs + navigation)

## 📨 Emails / Automations
- Utilise Supabase **Edge Functions** ou Vercel **Cron** pour :
  - Générer factures le 25
  - Rappels le 2 et 7
  - Envoi reçu après paiement

## 🎯 Prochaines étapes (faciles à ajouter)
- Pages CRUD Admin (users/courses/products/plans) branchées sur Supabase
- Commissions (request payout / mark paid)
- QR présence, carte élève, rapports centralisés, PDF reçus 
