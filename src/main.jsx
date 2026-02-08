// ✅ SAFE ROOT REDIRECT (avoid iOS Safari blank/loop)
// Only redirect when user truly opened the bare root,
// NOT when there is a hash route (/#/signup), query params, or deep link intent.
const isBareRoot =
  window.location.pathname === "/" &&
  !window.location.search &&
  (!window.location.hash || window.location.hash === "#/" || window.location.hash === "#");

if (isBareRoot) {
  window.location.replace("/login");
}

// ✅ PREVENT React 18 error #299 (createRoot called twice)
if (window.__AQUADOR_REACT_ROOT_MOUNTED__) {
  console.warn("⚠️ React already mounted — skipping bootstrap");
  // Stop this execution path completely
  throw new Error("React already mounted");
}
window.__AQUADOR_REACT_ROOT_MOUNTED__ = true;

import React from "react";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";
import "react-phone-number-input/style.css";
import { AuthProvider } from "./context/AuthContext";
import { GlobalAlertProvider } from "./components/GlobalAlert";
import ErrorBoundary from "./components/ErrorBoundary";

// ✅ DEBUG: show JS crashes even when React never mounts (iOS blank page helper)
window.addEventListener("error", (e) => {
  const msg = String(e?.error?.stack || e?.message || e);
  document.body.innerHTML =
    "<pre style='white-space:pre-wrap;padding:12px;font:14px/1.4 -apple-system,system-ui;'>" +
    msg.replaceAll("<", "&lt;") +
    "</pre>";
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e?.reason?.stack || e?.reason || e);
  document.body.innerHTML =
    "<pre style='white-space:pre-wrap;padding:12px;font:14px/1.4 -apple-system,system-ui;'>" +
    msg.replaceAll("<", "&lt;") +
    "</pre>";
});



// 🧨 Optional SW reset via ?sw-reset (strong reset + force reload)
if ("serviceWorker" in navigator && window.location.search.includes("sw-reset")) {
  Promise.all([
    navigator.serviceWorker.getRegistrations().then((regs) =>
      Promise.all(regs.map((reg) => reg.unregister()))
    ),
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
  ]).finally(() => {
    // 🔥 hard reload to fetch fresh assets
    window.location.replace(window.location.origin + "/login?v=" + Date.now());
  });
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// 🔄 Reload ONCE when a new Service Worker takes control
const isProd =
  window.location.hostname === "clubaquador.com" ||
  window.location.hostname === "www.clubaquador.com";

if (isProd && "serviceWorker" in navigator && !isIOS) {
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
      const { default: OneSignal } = await import("react-onesignal");

      await OneSignal.init({
        appId: "52872a41-1f62-4ff9-b1e4-cbb660663e7e",
      });

      console.log("✅ OneSignal initialized");
    } catch (err) {
      console.error("❌ OneSignal import/init failed (non-blocking):", err);
    }
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <GlobalAlertProvider>
              <App />
            </GlobalAlertProvider>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
  
  );
}

bootstrap();
