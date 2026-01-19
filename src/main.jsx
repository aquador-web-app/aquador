import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'
import 'react-phone-number-input/style.css'
import { AuthProvider } from "./context/AuthContext"
import { GlobalAlertProvider } from "./components/GlobalAlert"
import OneSignal from 'react-onesignal'

// 🛡️ ANDROID PWA RESUME FIX (CRITICAL)
// Force cold reload when Android restores a dead snapshot
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    // This prevents white screen on PWA reopen
    window.location.reload()
  }
})

async function bootstrap() {
  // 🔔 Initialize OneSignal ONCE
  await OneSignal.init({
    appId: "52872a41-1f62-4ff9-b1e4-cbb660663e7e",
    allowLocalhostAsSecureOrigin: true, // dev only
  })

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <GlobalAlertProvider>
            <App />
          </GlobalAlertProvider>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  )
}

bootstrap()
