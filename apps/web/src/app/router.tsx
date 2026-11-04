import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { RequireUser } from '../features/auth/RequireUser'
import { LoginPage } from '../features/auth/LoginPage'
import { HomePage } from '../features/home/HomePage'
import { BlockedVenuesPage } from '../features/profile/BlockedVenuesPage'
import { FavoritesPage } from '../features/profile/FavoritesPage'
import { NotificationsPage } from '../features/profile/NotificationsPage'
import { UserProfilePage } from '../features/profile/UserProfilePage'
import { VenueDetailPage } from '../features/venue/VenueDetailPage'

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
          <Route path="/venue/:venueId" element={<VenueDetailPage />} />
          <Route
            path="/perfil"
            element={
              <UserOnly>
                <UserProfilePage />
              </UserOnly>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
