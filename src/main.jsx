import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";
import "react-phone-number-input/style.css";
import { AuthProvider } from "./context/AuthContext";
import { GlobalAlertProvider } from "./components/GlobalAlert";
import ErrorBoundary from "./components/ErrorBoundary";

// ✅ Detect iOS (Safari / WebViews)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// ✅ SAFE ROOT REDIRECT (avoid iOS Safari blank/loop)
// Redirect ONLY when user truly opened the bare root "/" with no query/hash deep link.
const isBareRoot =
  window.location.pathname === "/" &&
  !window.location.search &&
  (!window.location.hash || window.location.hash === "#/" || window.location.hash === "#");

if (isBareRoot) {
  window.location.replace("/login");
}

// ✅ Optional: show crashes on-screen ONLY when you add ?debug=1
const debugOnScreen = window.location.search.includes("debug=1");
if (debugOnScreen) {
  window.addEventListener("error", (e) => {
    const msg = String(e?.error?.stack || e?.message || e);
    document.body.innerHTML =
      "<pre style='white-space:pre-wrap;padding:12px;font:14px/1.4 -apple-system,system-ui;'>" +
      msg.replace(/</g, "&lt;") +
      "</pre>";
  });

  window.addEventListener("unhandledrejection", (e) => {
    const msg = String(e?.reason?.stack || e?.reason || e);
    document.body.innerHTML =
      "<pre style='white-space:pre-wrap;padding:12px;font:14px/1.4 -apple-system,system-ui;'>" +
      msg.replace(/</g, "&lt;") +
      "</pre>";
  });
}

// 🧨 Optional SW reset via ?sw-reset (strong reset + force reload)
if ("serviceWorker" in navigator && window.location.search.includes("sw-reset")) {
  Promise.all([
    navigator.serviceWorker.getRegistrations().then((regs) =>
      Promise.all(regs.map((reg) => reg.unregister()))
    ),
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
  ]).finally(() => {
    window.location.replace(window.location.origin + "/login?v=" + Date.now());
  });
}

// 🔄 Reload ONCE when a new Service Worker takes control (skip iOS)
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
  // ✅ OneSignal: do NOT block the app if it fails (and avoid iOS)
  if (isProd && !isIOS) {
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

  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Missing #root element");

  ReactDOM.createRoot(rootEl).render(
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
