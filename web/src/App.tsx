import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { hasToken } from '@/api/client'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/pages/LoginPage'
import ScannersPage from '@/pages/settings/ScannersPage'
import HostsPage from '@/pages/hosts/HostsPage'
import CertificatesPage from '@/pages/certificates/CertificatesPage'
import CertificateDetailPage from '@/pages/certificates/CertificateDetailPage'
import HostDetailPage from '@/pages/hosts/HostDetailPage'
import UsersPage from '@/pages/settings/UsersPage'
import DashboardPage from '@/pages/DashboardPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import MailConfigPage from '@/pages/settings/MailConfigPage'
import AboutPage from '@/pages/AboutPage'
import ActivePage from '@/pages/ActivePage'
import GeneralSettingsPage from '@/pages/settings/GeneralSettingsPage'
import AuthCallbackPage from '@/pages/AuthCallbackPage'
import NotFoundPage from '@/pages/NotFoundPage'
import AccountPage from '@/pages/account/AccountPage'
import AccountProfilePage from '@/pages/account/AccountProfilePage'
import AccountPasswordPage from '@/pages/account/AccountPasswordPage'
import AccountCalendarPage from '@/pages/account/AccountCalendarPage'
import GroupsPage from '@/pages/settings/GroupsPage'
import GroupFormPage from '@/pages/settings/GroupFormPage'
import ToolboxPage from '@/pages/toolbox/ToolboxPage'
import CertDecoderPage from '@/pages/toolbox/CertDecoderPage'
import CsrDecoderPage from '@/pages/toolbox/CsrDecoderPage'
import CsrGeneratorPage from '@/pages/toolbox/CsrGeneratorPage'
import CertDiffPage from '@/pages/toolbox/CertDiffPage'
import PemDerPage from '@/pages/toolbox/PemDerPage'
import CertChainPage from '@/pages/toolbox/CertChainPage'

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
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

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
          <Route path="toolbox" element={<ToolboxPage />} />
          <Route path="toolbox/cert-decoder" element={<CertDecoderPage />} />
          <Route path="toolbox/csr-decoder" element={<CsrDecoderPage />} />
          <Route path="toolbox/csr-generator" element={<CsrGeneratorPage />} />
          <Route path="toolbox/cert-diff" element={<CertDiffPage />} />
          <Route path="toolbox/pem-der" element={<PemDerPage />} />
          <Route path="toolbox/cert-chain" element={<CertChainPage />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="certificates/:fingerprint" element={<CertificateDetailPage />} />
          <Route path="account">
            <Route index element={<AccountPage />} />
            <Route path="profile" element={<AccountProfilePage />} />
            <Route path="password" element={<AccountPasswordPage />} />
            <Route path="calendar" element={<AccountCalendarPage />} />
          </Route>

          {/* Settings hub + sub-pages */}
          <Route path="settings">
            <Route index element={<SettingsPage />} />
            <Route path="scanners" element={<ScannersPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="groups/new" element={<GroupFormPage />} />
            <Route path="groups/:id/edit" element={<GroupFormPage />} />
            <Route path="mail" element={<MailConfigPage />} />
            <Route path="general" element={<GeneralSettingsPage />} />
            <Route path="about" element={<AboutPage />} />
          </Route>

          {/* Backward-compat redirects for old top-level URLs */}
          <Route path="scanners" element={<Navigate to="/settings/scanners" replace />} />
          <Route path="users" element={<Navigate to="/settings/users" replace />} />

          {/* 404 — authenticated unknown routes */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Catch-all for unauthenticated unknown paths — send to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
