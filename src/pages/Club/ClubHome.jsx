import ThemeToggle from "../../components/ThemeToggle"

export default function Club() {
  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-6 py-3 mb-8 rounded-lg">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Portail Club — A’QUA D’OR</h1>
        <ThemeToggle />
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow">
        <p className="text-gray-700 dark:text-gray-200">
          Ici vous pourrez bientôt réserver l’espace du club. Les créneaux occupés par l’école apparaîtront comme
          indisponibles. (Module à venir)
        </p>
      </div>
    </div>
  )
}
