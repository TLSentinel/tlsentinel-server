import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { hasToken } from '@/api/client'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/pages/LoginPage'
import ScannersPage from '@/pages/ScannersPage'
import HostsPage from '@/pages/HostsPage'
import CertificatesPage from '@/pages/CertificatesPage'
import CertificateDetailPage from '@/pages/CertificateDetailPage'
import HostDetailPage from '@/pages/HostDetailPage'
import UsersPage from '@/pages/UsersPage'
import DashboardPage from '@/pages/DashboardPage'
import SettingsPage from '@/pages/SettingsPage'
import MailConfigPage from '@/pages/MailConfigPage'
import AboutPage from '@/pages/AboutPage'
import ActivePage from '@/pages/ActivePage'

// ---------------------------------------------------------------------------
// ProtectedRoute — redirects to /login when no auth token is present.
// In a future iteration this could also validate token expiry.
// ---------------------------------------------------------------------------
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!hasToken()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* All authenticated pages share the AppShell layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="active" element={<ActivePage />} />
          <Route path="hosts" element={<HostsPage />} />
          <Route path="hosts/:id" element={<HostDetailPage />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="certificates/:fingerprint" element={<CertificateDetailPage />} />

          {/* Settings hub + sub-pages */}
          <Route path="settings">
            <Route index element={<SettingsPage />} />
            <Route path="scanners" element={<ScannersPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="mail" element={<MailConfigPage />} />
            <Route path="about" element={<AboutPage />} />
          </Route>

          {/* Backward-compat redirects for old top-level URLs */}
          <Route path="scanners" element={<Navigate to="/settings/scanners" replace />} />
          <Route path="users" element={<Navigate to="/settings/users" replace />} />
        </Route>

        {/* Catch-all — redirect unknown paths to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
