import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'
import 'react-phone-number-input/style.css'
import { AuthProvider } from "./context/AuthContext"
import { GlobalAlertProvider } from "./components/GlobalAlert";


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

