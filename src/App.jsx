// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { useAuth } from "./context/AuthContext"
import { useEffect } from "react";
import { supabase } from "./lib/supabaseClient"
import { useNavigate } from "react-router-dom";


// Pages (public)
import Home from "./pages/Home"
import Club from "./pages/Club/ClubHome"
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


// Assistant
import AssistantDashboard from "./pages/Assistant/AssistantDashboard"

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
  const navigate = useNavigate()


  // 👇 Listen for custom "navigateToUserProfile" events from other pages
  useEffect(() => {
  const handler = (e) => {
    const id = e.detail?.id;
    if (id) {
      window.location.hash = `#/admin/users/${id}`; // optional fallback
      window.dispatchEvent(new CustomEvent("openUserProfileGlobal", { detail: { id } }));
    }
  };
  window.addEventListener("openUserProfile", handler);

  return () => window.removeEventListener("openUserProfile", handler);
}, []);

useEffect(() => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      navigate("/login", { replace: true })
    }
  })

  return () => subscription.unsubscribe()
}, [navigate])



  // Show a global loader while we resolve auth session
  if (loading) return <Loader />

  return (
    <>
    <router>
      <Routes>
      {/* PUBLIC */}
      <Route path="/" element={<Home />} />
      <Route path="/ecole" element={<EcoleLanding />} />
      <Route path="/club/signup" element={<ClubSignup />} />
      <Route path="/club" element={<ClubLanding />} />

      {/* Single entry that routes a logged-in user to the correct dashboard by role */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DefaultRedirect />
          </ProtectedRoute>
        }
      />

      {/* AUTH */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* ADMIN (nested under /admin with AdminDashboard) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['admin','assistant']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="documents" element={<AdminDocuments />} />
        <Route path="calendar" element={<AdminCalendarManager />} />
        <Route path="referrals-overview" element={<AdminReferralOverview />} />
        <Route path="referrals-details" element={<AdminReferralDetails />} />
        <Route path="club-membership" element={<AdminClubMembership />}/>
        <Route
  path="membership  approval"
  element={<AdminMembershipApproval />}
/>
        <Route
          path="/admin/appearance"
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

      {/* ASSISTANT */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['assistant']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
      </Route>

      {/* TEACHER */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute roles={['teacher']}>
            <TeacherDashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboard />} />
      </Route>

      {/* USER */}
      <Route
        path="/user"
        element={
          <ProtectedRoute>
            <UserDashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<UserDashboard />} />
      </Route>

        <Route path="commissions" element={<UserCommissions />} />
        <Route path="change-password" element={<ChangePassword />} />
      
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </router>
    {/* Floating WhatsApp Button (always visible) */}
    <WhatsAppButton />
  </>
  )
}
