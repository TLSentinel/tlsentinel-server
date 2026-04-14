import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { hasToken } from '@/api/client'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/pages/LoginPage'
import ScannersPage from '@/pages/settings/ScannersPage'
import EndpointPage from '@/pages/endpoint/EndpointPage'
import EndpointFormPage from '@/pages/endpoint/EndpointFormPage'
import CertificatesPage from '@/pages/certificates/CertificatesPage'
import CertificateDetailPage from '@/pages/certificates/CertificateDetailPage'
import EndpointDetailPage from '@/pages/endpoint/EndpointDetailPage'
import UsersPage from '@/pages/settings/UsersPage'
import DashboardPage from '@/pages/DashboardPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import MailConfigPage from '@/pages/settings/MailConfigPage'
import AboutPage from '@/pages/AboutPage'
import ActivePage from '@/pages/ActivePage'
import GeneralSettingsPage from '@/pages/settings/GeneralSettingsPage'
import MaintenancePage from '@/pages/settings/MaintenancePage'
import NotificationTemplatesPage from '@/pages/settings/NotificationTemplatesPage'
import AuthCallbackPage from '@/pages/AuthCallbackPage'
import NotFoundPage from '@/pages/NotFoundPage'
import AccountPage from '@/pages/account/AccountPage'
import AccountProfilePage from '@/pages/account/AccountProfilePage'
import AccountPasswordPage from '@/pages/account/AccountPasswordPage'
import AccountNotificationsPage from '@/pages/account/AccountNotificationsPage'
import AccountAPIKeysPage from '@/pages/account/AccountAPIKeysPage'
import GroupsPage from '@/pages/settings/GroupsPage'
import APIKeysPage from '@/pages/settings/APIKeysPage'
import GroupFormPage from '@/pages/settings/GroupFormPage'
import AuditLogPage from '@/pages/settings/AuditLogPage'
import TagsPage from '@/pages/settings/TagsPage'
import CalendarPage from '@/pages/CalendarPage'
import ReportsPage from '@/pages/ReportsPage'
import DiscoveryInboxPage from '@/pages/discovery/DiscoveryInboxPage'
import DiscoveryNetworksPage from '@/pages/discovery/DiscoveryNetworksPage'
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
    <TooltipProvider delayDuration={300}>
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
          <Route path="endpoints" element={<EndpointPage />} />
          <Route path="endpoints/new" element={<EndpointFormPage />} />
          <Route path="endpoints/:id/edit" element={<EndpointFormPage />} />
          <Route path="endpoints/:id" element={<EndpointDetailPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="discovery/inbox" element={<DiscoveryInboxPage />} />
          <Route path="discovery/networks" element={<DiscoveryNetworksPage />} />
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
            <Route path="calendar" element={<Navigate to="/account/notifications" replace />} />
            <Route path="notifications" element={<AccountNotificationsPage />} />
            <Route path="api-keys" element={<AccountAPIKeysPage />} />
          </Route>

          {/* Settings hub + sub-pages */}
          <Route path="logs">
            <Route path="audit" element={<AuditLogPage />} />
          </Route>

          <Route path="settings">
            <Route index element={<SettingsPage />} />
            <Route path="scanners" element={<ScannersPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="groups/new" element={<GroupFormPage />} />
            <Route path="groups/:id/edit" element={<GroupFormPage />} />
            <Route path="mail" element={<MailConfigPage />} />
            <Route path="audit-logs" element={<Navigate to="/logs/audit" replace />} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="general" element={<GeneralSettingsPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="notification-templates" element={<NotificationTemplatesPage />} />
            <Route path="api-keys" element={<APIKeysPage />} />
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
    </TooltipProvider>
  )
}
