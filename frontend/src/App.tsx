import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import ParentLayout from './layouts/ParentLayout';
import TeacherLayout from './layouts/TeacherLayout';
import AdminLayout from './layouts/AdminLayout';
import ParentDashboard from './pages/parent/Dashboard';
import ParentChildren from './pages/parent/Children';
import ParentLiveMonitoring from './pages/parent/LiveMonitoring';
import ParentAttendance from './pages/parent/Attendance';
import ParentActivities from './pages/parent/Activities';
import ParentNotifications from './pages/parent/Notifications';
import ParentMessages from './pages/parent/Messages';
import ParentPhotos from './pages/parent/Photos';
import ParentPickup from './pages/parent/Pickup';
import ParentSettings from './pages/parent/Settings';
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherClassrooms from './pages/teacher/Classrooms';
import TeacherChildren from './pages/teacher/Children';
import TeacherAttendance from './pages/teacher/Attendance';
import TeacherActivities from './pages/teacher/Activities';
import TeacherMessages from './pages/teacher/Messages';
import TeacherAnnouncements from './pages/teacher/Announcements';
import TeacherProfile from './pages/teacher/Profile';
import AdminDashboard from './pages/admin/Dashboard';
import AdminParents from './pages/admin/Parents';
import AdminChildren from './pages/admin/Children';
import AdminTeachers from './pages/admin/Teachers';
import AdminClassrooms from './pages/admin/Classrooms';
import AdminCameras from './pages/admin/CameraManagement';
import AdminNvrManagement from './pages/admin/NvrManagement';
import AdminAddNvr from './pages/admin/AddNvr';
import AdminLiveWall from './pages/admin/LiveWall';
import AdminPlayback from './pages/admin/Playback';
import AdminAttendance from './pages/admin/Attendance';
import AdminActivities from './pages/admin/Activities';
import AdminAccessRequests from './pages/admin/AccessRequests';
import AdminNotifications from './pages/admin/Notifications';
import AdminSettings from './pages/admin/Settings';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={`/${user.role}/dashboard`} replace />;
  return <>{children}</>;
}

function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role}/dashboard`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
      <Route path="/dashboard" element={<RoleRedirect />} />

      <Route
        path="/parent/*"
        element={
          <ProtectedRoute roles={['parent']}>
            <ParentLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ParentDashboard />} />
        <Route path="children" element={<ParentChildren />} />
        <Route path="live" element={<ParentLiveMonitoring />} />
        <Route path="attendance" element={<ParentAttendance />} />
        <Route path="activities" element={<ParentActivities />} />
        <Route path="notifications" element={<ParentNotifications />} />
        <Route path="messages" element={<ParentMessages />} />
        <Route path="photos" element={<ParentPhotos />} />
        <Route path="pickup" element={<ParentPickup />} />
        <Route path="settings" element={<ParentSettings />} />
      </Route>

      <Route
        path="/teacher/*"
        element={
          <ProtectedRoute roles={['teacher']}>
            <TeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<TeacherDashboard />} />
        <Route path="classrooms" element={<TeacherClassrooms />} />
        <Route path="children" element={<TeacherChildren />} />
        <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="activities" element={<TeacherActivities />} />
        <Route path="messages" element={<TeacherMessages />} />
        <Route path="announcements" element={<TeacherAnnouncements />} />
        <Route path="profile" element={<TeacherProfile />} />
      </Route>

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute roles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="parents" element={<AdminParents />} />
        <Route path="nvrs" element={<AdminNvrManagement />} />
        <Route path="nvrs/add" element={<AdminAddNvr />} />
        <Route path="nvrs/:id/edit" element={<AdminAddNvr />} />
        <Route path="live-wall" element={<AdminLiveWall />} />
        <Route path="playback" element={<AdminPlayback />} />
        <Route path="children" element={<AdminChildren />} />
        <Route path="teachers" element={<AdminTeachers />} />
        <Route path="classrooms" element={<AdminClassrooms />} />
        <Route path="cameras" element={<AdminCameras />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="activities" element={<AdminActivities />} />
        <Route path="access-requests" element={<AdminAccessRequests />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
