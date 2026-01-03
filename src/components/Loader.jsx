export default function Loader() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center">
        {/* Spinner */}
        <div className="w-16 h-16 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>

        {/* Texte */}
        <p className="mt-4 text-gray-600 dark:text-gray-300 font-semibold text-lg">
          Chargement en cours...
        </p>
      </div>
    </div>
  )
}
