import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'
import 'react-phone-number-input/style.css'
import { AuthProvider } from "./context/AuthContext"
import { GlobalAlertProvider } from "./components/GlobalAlert"
import OneSignal from 'react-onesignal'

async function bootstrap() {
  const allowedHosts = [
    "clubaquador.com",
    "www.clubaquador.com",
  ];

  const isProdDomain = allowedHosts.includes(window.location.hostname);

  if (isProdDomain) {
    try {
      await OneSignal.init({
        appId: "52872a41-1f62-4ff9-b1e4-cbb660663e7e",
      });
      console.log("✅ OneSignal initialized");
    } catch (err) {
      console.error("❌ OneSignal init failed", err);
    }
  } else {
    console.log("ℹ️ OneSignal skipped on", window.location.hostname);
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <HashRouter>
        <AuthProvider>
          <GlobalAlertProvider>
            <App />
          </GlobalAlertProvider>
        </AuthProvider>
      </HashRouter>
    </React.StrictMode>
  );
}

bootstrap();
