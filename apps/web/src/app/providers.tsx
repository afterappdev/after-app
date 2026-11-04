import type { ReactNode } from 'react'
import { ActiveVenueProvider } from '../auth/ActiveVenueContext'
import { AuthProvider } from '../auth/AuthContext'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ActiveVenueProvider>{children}</ActiveVenueProvider>
    </AuthProvider>
  )
}
