import type { ReactNode } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { RequireSession } from '../features/auth/RequireSession'
import { RequireUser } from '../features/auth/RequireUser'
import { AccountSettingsPage } from '../features/auth/AccountSettingsPage'
import { AppleWebCallbackPage } from '../features/auth/AppleWebCallbackPage'
import { ConfirmAccountDeletionPage } from '../features/auth/ConfirmAccountDeletionPage'
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage'
import { LoginPage } from '../features/auth/LoginPage'
import { OAuthCallbackPage } from '../features/auth/OAuthCallbackPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage'
import { HomePage } from '../features/home/HomePage'
import { BlockedVenuesPage } from '../features/profile/BlockedVenuesPage'
import { FavoritesPage } from '../features/profile/FavoritesPage'
import { NotificationsPage } from '../features/profile/NotificationsPage'
import { ProfileEntry } from '../features/profile/ProfileEntry'
import { RequireVenue } from '../features/auth/RequireVenue'
import { VenuePanelPage } from '../features/venue-manage/VenuePanelPage'
import { BuyCreditsPage } from '../features/venue-credits/BuyCreditsPage'
import { CreditsBannersPage } from '../features/venue-credits/CreditsBannersPage'
import { VenueDetailPage } from '../features/venue/VenueDetailPage'
import { NotFoundPage } from '../features/misc/NotFoundPage'

function UserOnly({ children }: { children: ReactNode }) {
  return <RequireUser>{children}</RequireUser>
}

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/oauth" element={<OAuthCallbackPage />} />
          <Route path="/auth/apple/callback" element={<AppleWebCallbackPage />} />
          <Route path="/esqueci-minha-senha" element={<ForgotPasswordPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
          <Route path="/confirmar-exclusao" element={<ConfirmAccountDeletionPage />} />
          <Route path="/venue/:venueId" element={<VenueDetailPage />} />
          <Route
            path="/estabelecimento"
            element={
              <RequireVenue>
                <VenuePanelPage />
              </RequireVenue>
            }
          />
          <Route
            path="/estabelecimento/creditos"
            element={
              <RequireVenue>
                <CreditsBannersPage />
              </RequireVenue>
            }
          />
          <Route
            path="/estabelecimento/creditos/comprar"
            element={
              <RequireVenue>
                <BuyCreditsPage />
              </RequireVenue>
            }
          />
          <Route
            path="/perfil"
            element={
              <RequireSession>
                <ProfileEntry />
              </RequireSession>
            }
          />
          <Route
            path="/perfil/favoritos"
            element={
              <UserOnly>
                <FavoritesPage />
              </UserOnly>
            }
          />
          <Route
            path="/perfil/bloqueados"
            element={
              <UserOnly>
                <BlockedVenuesPage />
              </UserOnly>
            }
          />
          <Route
            path="/perfil/notificacoes"
            element={
              <UserOnly>
                <NotificationsPage />
              </UserOnly>
            }
          />
          <Route
            path="/perfil/conta"
            element={
              <RequireSession>
                <AccountSettingsPage />
              </RequireSession>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
