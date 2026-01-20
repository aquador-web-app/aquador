// 🛑 CRITICAL: Fix blank page when PWA resumes at "/"
if (
  window.location.pathname === "/" &&
  !window.location.search &&
  !window.location.hash
) {
  window.location.replace("/login");
}

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";
import "react-phone-number-input/style.css";
import { AuthProvider } from "./context/AuthContext";
import { GlobalAlertProvider } from "./components/GlobalAlert";
import OneSignal from "react-onesignal";

// 🧨 Optional SW reset via ?sw-reset
if ("serviceWorker" in navigator && window.location.search.includes("sw-reset")) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });

  caches.keys().then((keys) => {
    keys.forEach((key) => caches.delete(key));
  });
}

// 🔄 Reload ONCE when a new Service Worker takes control
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem("sw-reloaded")) return;
    sessionStorage.setItem("sw-reloaded", "true");
    window.location.reload();
  });
}

async function bootstrap() {
  const allowedHosts = ["clubaquador.com", "www.clubaquador.com"];
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
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <GlobalAlertProvider>
              <App />
            </GlobalAlertProvider>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>
  );
}

bootstrap();
