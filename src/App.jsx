// src/App.jsx
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ClientGuard from "./components/ClientGuard";

import LoginPage from "./pages/LoginPage";
import CameraAdminDashboard from "./components/CameraAdminDashboard";
import CameraStatus from "./pages/CameraStatus";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import RedirectToReset from "./components/RedirectToReset";
import CapturePage from "./pages/CapturePage";
import SuccessPage from "./pages/SuccessPage";
import QRCodes from "./pages/QRCodes"; // ✅ ADD
import "./i18n";
import ReportPage from "./pages/ReportPage";
import EndPage from "./pages/EndPage";

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          {/* ================= PUBLIC ================= */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/:clientId/login" element={<LoginPage />} />
          <Route path="/__/auth/action" element={<RedirectToReset />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* 🔓 PUBLIC QR CAPTURE */}
          <Route path="/capture" element={<CapturePage />} />

          {/* 💳 STRIPE SUCCESS */}
          <Route path="/success" element={<SuccessPage />} />
          {/* end page*/}
          <Route path="/end" element={<EndPage />} />
          <Route path="/reports" element={<ReportPage />} />


          {/* ================= TENANT PROTECTED ================= */}
          <Route
            path="/:clientId/dashboard"
            element={
              <ClientGuard>
                <CameraAdminDashboard />
              </ClientGuard>
            }
          />

          <Route
            path="/:clientId/camera-status"
            element={
              <ClientGuard>
                <CameraStatus />
              </ClientGuard>
            }
          />

          {/* ✅ QR MANAGEMENT PAGE */}
          <Route
            path="/:clientId/qr"
            element={
              <ClientGuard>
                <QRCodes />
              </ClientGuard>
            }
          />
          {/* ✅  MANAGEMENT PAGE */}
          <Route
            path="/:clientId/report"
            element={
              <ClientGuard>
                <ReportPage />
              </ClientGuard>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
