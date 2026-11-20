import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/EmptyState';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { AdminDashboard } from '@/pages/dashboards/AdminDashboard';
import {
  AcademicDashboard,
  BursarDashboard,
  OwnerDashboard,
  ParentDashboard,
  StudentDashboard,
  TeacherDashboard,
} from '@/pages/dashboards/RoleDashboards';
import { UsersRolesPage } from '@/pages/UsersRolesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { StudentManagementPage } from '@/pages/StudentManagementPage';
import { GuardianManagementPage } from '@/pages/GuardianManagementPage';
import { StaffManagementPage } from '@/pages/StaffManagementPage';
import { ClassesManagementPage } from '@/pages/ClassesManagementPage';
import { AdmissionsManagementPage } from '@/pages/AdmissionsManagementPage';
import { EnrollmentManagementPage } from '@/pages/EnrollmentManagementPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { AssessmentsPage } from '@/pages/AssessmentsPage';
import { ResultsPage } from '@/pages/ResultsPage';
import { TimetablePage } from '@/pages/TimetablePage';
import { RequireRole } from '@/components/layout/RequireRole';
import { SETTINGS_ROLES, USERS_ROLES } from '@/config/permissions';
import {
  School,
  DollarSign,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-3 text-sm text-slate-500">Loading CampusOS...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function RoleDashboard() {
  const { activeRole } = useAuth();

  switch (activeRole) {
    case 'platform_admin':
    case 'school_owner':
      return <OwnerDashboard />;
    case 'school_admin':
      return <AdminDashboard />;
    case 'academic_admin':
      return <AcademicDashboard />;
    case 'bursar':
      return <BursarDashboard />;
    case 'teacher':
      return <TeacherDashboard />;
    case 'parent':
      return <ParentDashboard />;
    case 'student':
      return <StudentDashboard />;
    default:
      return <AdminDashboard />;
  }
}

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-3 text-sm text-slate-500">Loading CampusOS...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/register" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/dashboard" element={<RoleDashboard />} />
                <Route
                  path="/users"
                  element={
                    <RequireRole roles={USERS_ROLES}>
                      <UsersRolesPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <RequireRole roles={SETTINGS_ROLES}>
                      <SettingsPage />
                    </RequireRole>
                  }
                />
                <Route path="/students" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin']}><StudentManagementPage /></RequireRole>} />
                <Route path="/students/:studentId" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin']}><StudentManagementPage /></RequireRole>} />
                <Route path="/guardians" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin']}><GuardianManagementPage /></RequireRole>} />
                <Route path="/staff" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin']}><StaffManagementPage /></RequireRole>} />
                <Route path="/schools" element={<RequireRole roles={['platform_admin', 'school_owner']}><PlaceholderPage title="Schools & Campuses" description="Manage school profiles and campuses" icon={<School className="h-7 w-7" />} milestone="Milestone 2" /></RequireRole>} />
                <Route path="/admissions" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin']}><AdmissionsManagementPage /></RequireRole>} />
                <Route path="/classes" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin']}><ClassesManagementPage /></RequireRole>} />
                <Route path="/enrollments" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin']}><EnrollmentManagementPage /></RequireRole>} />
                <Route path="/attendance" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student']}><AttendancePage /></RequireRole>} />
                <Route path="/timetable" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student']}><TimetablePage /></RequireRole>} />
                <Route path="/assessments" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher']}><AssessmentsPage /></RequireRole>} />
                <Route path="/results" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student']}><ResultsPage /></RequireRole>} />
                <Route path="/report-cards" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student']}><ResultsPage /></RequireRole>} />
                <Route path="/finance" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'bursar', 'parent']}><PlaceholderPage title="Finance & Fees" description="Invoices, payments, and receipts" icon={<DollarSign className="h-7 w-7" />} milestone="Milestone 5" /></RequireRole>} />
                <Route path="/announcements" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'teacher', 'parent', 'student']}><PlaceholderPage title="Announcements" description="School-wide and class announcements" icon={<MessageSquare className="h-7 w-7" />} milestone="Milestone 4" /></RequireRole>} />
                <Route path="/ai" element={<RequireRole roles={['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher']}><PlaceholderPage title="AI Assistant" description="AI-powered school intelligence" icon={<Sparkles className="h-7 w-7" />} milestone="Milestone 6" /></RequireRole>} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
