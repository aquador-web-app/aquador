import { createContext, useContext, useState, useCallback } from "react";

const GlobalAlertContext = createContext();

export function GlobalAlertProvider({ children }) {
  const [alert, setAlert] = useState(null);
  const [resolver, setResolver] = useState(null);

  // ---------------------------------------------------
  //  ALERT (simple OK)
  // ---------------------------------------------------
  const showAlert = useCallback((message) => {
    return new Promise((resolve) => {
      setAlert({ type: "alert", message });
      setResolver(() => resolve);
    });
  }, []);

  // ---------------------------------------------------
  //  CONFIRM (Yes / No)
  // ---------------------------------------------------
  const showConfirm = useCallback((message) => {
    return new Promise((resolve) => {
      setAlert({ type: "confirm", message });
      setResolver(() => resolve);
    });
  }, []);

  // ---------------------------------------------------
  //  INPUT POPUP
  // ---------------------------------------------------
  const showInput = (message) => {
    return new Promise((resolve) => {
      setAlert({
        type: "input",
        message,
        resolve,
      });
    });
  };

  // Actions
  const closeAlert = () => {
    if (resolver) resolver(false);
    setAlert(null);
  };

  const confirmYes = () => {
    if (resolver) resolver(true);
    setAlert(null);
  };

  const confirmNo = () => {
    if (resolver) resolver(false);
    setAlert(null);
  };

  return (
    <GlobalAlertContext.Provider value={{ showAlert, showConfirm, showInput }}>
      {children}

      {/* 🌟 GLOBAL MODAL WRAPPER (FADE-IN) */}
{alert && (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fadeIn">
    
    {/* 🌟 MODAL CARD (SCALE-IN) */}
    <div className="
      bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm 
      animate-scaleIn 
      border border-gray-200
    ">
      <h3 className="text-xl font-semibold text-gray-800 mb-3 text-center">
        {alert.message}
      </h3>

      {/* ----------------------- ALERT ----------------------- */}
      {alert.type === "alert" && (
        <div className="flex justify-center mt-5">
          <button
            onClick={() => {
              resolver?.(true);
              setAlert(null);
            }}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl shadow 
                       hover:bg-blue-700 transition-all"
          >
            OK
          </button>
        </div>
      )}

      {/* ----------------------- CONFIRM ----------------------- */}
      {alert.type === "confirm" && (
        <div className="flex justify-center gap-4 mt-5">
          <button
            onClick={() => {
              resolver?.(false);
              setAlert(null);
            }}
            className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 transition"
          >
            Non
          </button>

          <button
            onClick={() => {
              resolver?.(true);
              setAlert(null);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            Oui
          </button>
        </div>
      )}

      {/* ----------------------- INPUT ----------------------- */}
      {alert.type === "input" && (
        <div className="mt-4">
          <input
            id="global-alert-input"
            autoFocus
            placeholder="Ton code…"
            className="w-full border rounded-xl p-2 mb-4 focus:ring-2 focus:ring-blue-300"
          />

          <div className="flex justify-center gap-4 mt-2">
            <button
              onClick={() => {
                alert.resolve(null);
                setAlert(null);
              }}
              className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 transition"
            >
              Annuler
            </button>

            <button
              onClick={() => {
                const value = document.getElementById("global-alert-input").value;
                alert.resolve(value);
                setAlert(null);
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              Valider
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
)}

    </GlobalAlertContext.Provider>
  );
}

export function useGlobalAlert() {
  return useContext(GlobalAlertContext);
}
