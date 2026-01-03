import { useState } from "react";
import { exportAllCardsPDF } from "../components/ExportAllCardsPDF";

export default function CardGenerator({ users }) {
  const [selected, setSelected] = useState("all");

  const handleGenerate = async () => {
    if (selected === "all") {
      await exportAllCardsPDF(users);
    } else {
      const chosen = users.find((u) => u.id === selected);
      if (chosen) await exportAllCardsPDF(chosen);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-white rounded-xl shadow-md">
      <label className="text-sm font-semibold text-gray-700">
        Sélectionner un utilisateur :
      </label>
      <select
        className="border rounded-md px-3 py-2 w-60 text-sm"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="all">Tous les utilisateurs</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </select>

      <button
        onClick={handleGenerate}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-md"
      >
        Générer la/les carte(s)
      </button>
    </div>
  );
}
