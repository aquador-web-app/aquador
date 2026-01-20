// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom"
import OneSignal from "react-onesignal";
import { useAuth } from "./context/AuthContext"
import { useEffect } from "react";
import AuthGate from "./components/AuthGate";


// Pages (public)
import Home from "./pages/Home"
import EcoleLanding from "./pages/EcoleLanding"
import ClubLanding from "./pages/ClubLanding"
import ClubGuestDashboard from "./pages/Club/ClubGuestDashboard";
import ClubQRScanner from "./pages/Club/ClubQRScanner";
import ClubSignup from "./pages/Club/ClubSignup";
import AdminClubMembership from "./pages/admin/AdminClubMembership";





// Admin pages
import AdminDashboard from "./pages/admin/AdminDashboard"
import AdminDocuments from "./pages/admin/AdminDocuments"
import AdminCalendarManager from "./pages/admin/AdminCalendarManager"
import AdminReports from "./pages/admin/AdminReports"
import AdminReportsBulletinetFiche from "./pages/admin/AdminReportsBulletinetFiche"
import AdminAppearance from "./pages/admin/AdminAppearance"
import "react-datepicker/dist/react-datepicker.css";
import AdminUserProfile from "./pages/admin/AdminUserProfile";
import AdminReferralOverview from "./pages/admin/AdminReferralOverview";
import AdminReferralDetails from "./pages/admin/AdminReferralDetails";
import AdminMembershipApproval from "./pages/admin/AdminMembershipApproval";



// Teacher
import TeacherDashboard from "./pages/teacher/TeacherDashboard"

// User
import UserDashboard from "./pages/user/UserDashboard"
import UserCommissions from "./pages/user/UserCommissions"
import UserClubDashboard from "./pages/Club/UserClubDashboard";
import MemberProfile from "./pages/Club/MemberProfile";




// Auth
import Login from "./pages/Login"
import Signup from "./pages/signup"
import ForgotPassword from "./pages/ForgotPassword"
import ResetPassword from "./pages/ResetPassword"
import ChangePassword from "./pages/ChangePassword"

// Components
import ProtectedRoute from "./components/ProtectedRoute"
import DefaultRedirect from "./components/DefaultRedirect"
import Loader from "./components/Loader"
import WhatsAppButton from "./components/WhatsAppButton";


export default function App() {
  const { loading, user } = useAuth()

  useEffect(() => {
    if (!user?.id) return;

    const linkOneSignal = async () => {
      try {
        const isEnabled = await OneSignal.Notifications.permission;

        if (isEnabled) {
          await OneSignal.login(user.id);

          if (user.role) {
            await OneSignal.sendTag("role", user.role);
          }

          console.log("🔔 OneSignal re-linked after PWA install", user.id);
        } else {
          console.log("🔕 Notifications not permitted yet");
        }
      } catch (err) {
        console.error("❌ OneSignal relink failed", err);
      }
    };

    // slight delay = service worker ready
    setTimeout(linkOneSignal, 1500);
  }, [user?.id]);


  // 👇 Listen for custom "navigateToUserProfile" events from other pages
  useEffect(() => {
  const handler = (e) => {
  const id = e.detail?.id;
  if (id) {
    window.dispatchEvent(
      new CustomEvent("openUserProfileGlobal", { detail: { id } })
    );
  }
};

  window.addEventListener("openUserProfile", handler);

  return () => window.removeEventListener("openUserProfile", handler);
}, []);


  // Show a global loader while we resolve auth session
  if (loading) return <Loader />

  return (
    <>
      <Routes>
      {/* PUBLIC */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/ecole" element={<EcoleLanding />} />
      <Route path="/club/signup" element={<ClubSignup />} />
      <Route path="/club" element={<ClubLanding />} />

      {/* AUTH */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* ADMIN (nested under /admin with AdminDashboard) */}
      <Route
        path="/admin"
        element={
          <AuthGate roles={['admin','assistant']}>
            <AdminDashboard />
          </AuthGate>
        }
      >
        
        <Route index element={<AdminDashboard />} />
        <Route path="documents" element={<AdminDocuments />} />
        <Route path="calendar" element={<AdminCalendarManager />} />
        <Route path="referrals-overview" element={<AdminReferralOverview />} />
        <Route path="referrals-details" element={<AdminReferralDetails />} />
        <Route path="club-membership" element={<AdminClubMembership />}/>
        <Route
  path="membership-approval"
  element={<AdminMembershipApproval />}
/>
        <Route
  path="appearance"
  element={
    <ProtectedRoute roles={['admin']}>
      <AdminAppearance />
    </ProtectedRoute>
  }
/>

      </Route>
      <Route
  path="/admin/user-profile/:id"
  element={
    <ProtectedRoute>
      <AdminUserProfile />
    </ProtectedRoute>
  }
/>




      {/* REPORTS (admin & assistant with permissions) */}
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute roles={['admin']} permissions={['can_view_general_reports']}>
            <AdminReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports-bulletins"
        element={
          <ProtectedRoute roles={['admin','assistant']} permissions={['can_view_bulletins']}>
            <AdminReportsBulletinetFiche />
          </ProtectedRoute>
        }
      />

  
      {/* TEACHER */}
      <Route
        path="/teacher"
        element={
          <AuthGate roles={['teacher']}>
            <TeacherDashboard />
          </AuthGate>
        }
      >
        <Route index element={<TeacherDashboard />} />
      </Route>

      {/* USER */}
      <Route
        path="/user"
        element={
          <AuthGate>
            <UserDashboard />
          </AuthGate>
        }
      >
        <Route index element={<UserDashboard />} />
        <Route path="commissions" element={<UserCommissions />} />
        <Route path="change-password" element={<ChangePassword />} />
      </Route>

        
        
      
      <Route path="/club/guest-dashboard" element={<ClubGuestDashboard />} />
      <Route path="/club/scan" element={<ClubQRScanner />} />
      <Route path="/club/overview" element={<UserClubDashboard />} />
      <Route
  path="/club/profile"
  element={
    <ProtectedRoute>
      <MemberProfile authUserId={user?.id} />
    </ProtectedRoute>
  }
/>

      {/* FALLBACK */}
      <Route
  path="*"
  element={
    user?.role === "admin" || user?.role === "assistant"
      ? <Navigate to="/admin" replace />
      : user?.role === "teacher"
      ? <Navigate to="/teacher" replace />
      : user
      ? <Navigate to="/user" replace />
      : <Navigate to="/login" replace />
  }
/>

    </Routes>
    {/* Floating WhatsApp Button (always visible) */}
    <WhatsAppButton />
  </>
  )
}
