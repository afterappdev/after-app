import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiClient } from '../api/client'
import * as authApi from '../api/auth'
import type { AuthUser } from '../api/types/auth'
import {
  clearPendingSocialOnboarding,
  pendingSocialFromAuthResponse,
  savePendingSocialOnboarding,
} from '../utils/socialOnboardingStorage'
import {
  clearSession,
  persistSession,
  readStoredToken,
  readStoredUser,
} from './session'

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  bootstrapping: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithAccessToken: (accessToken: string) => Promise<void>
  applyAuthPayload: (data: Record<string, unknown>) => Promise<'session' | 'onboarding' | 'recovery'>
  logout: () => void
  refreshUser: () => Promise<void>
  api: ApiClient
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    setToken(null)
  }, [])

  const api = useMemo(
    () =>
      new ApiClient({
        getToken: () => token,
        onUnauthorized: () => logout(),
      }),
    [token, logout],
  )

  useEffect(() => {
    api.setToken(token)
  }, [api, token])

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const storedToken = readStoredToken()
      const storedUser = readStoredUser()
      if (!storedToken) {
        if (!cancelled) setBootstrapping(false)
        return
      }
      setToken(storedToken)
      setUser(storedUser)
      try {
        const me = await authApi.fetchMe(
          new ApiClient({ getToken: () => storedToken }),
        )
        if (cancelled) return
        setUser(me)
        persistSession(storedToken, me)
      } catch {
        if (!cancelled) logout()
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [logout])

  const refreshUser = useCallback(async () => {
    if (!token) return
    const me = await authApi.fetchMe(api)
    setUser(me)
    persistSession(token, me)
  }, [api, token])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login(api, { email, password })
      setToken(result.accessToken)
      setUser(result.user)
      persistSession(result.accessToken, result.user)
      clearPendingSocialOnboarding()
      try {
        const me = await authApi.fetchMe(
          new ApiClient({ getToken: () => result.accessToken }),
        )
        setUser(me)
        persistSession(result.accessToken, me)
      } catch {
        /* mantém payload do login */
      }
    },
    [api],
  )

  const loginWithAccessToken = useCallback(async (accessToken: string) => {
    const client = new ApiClient({ getToken: () => accessToken })
    const me = await authApi.fetchMe(client)
    setToken(accessToken)
    setUser(me)
    persistSession(accessToken, me)
    clearPendingSocialOnboarding()
  }, [])

  const applyAuthPayload = useCallback(
    async (data: Record<string, unknown>): Promise<'session' | 'onboarding' | 'recovery'> => {
      const pending = pendingSocialFromAuthResponse(data)
      if (pending) {
        savePendingSocialOnboarding(pending)
        return 'onboarding'
      }
      if (data.accountPendingDeletion === true && typeof data.recoveryToken === 'string') {
        setToken(data.recoveryToken)
        return 'recovery'
      }
      const accessToken = String(data.accessToken ?? '')
      if (!accessToken) {
        throw new Error('Resposta de autenticação incompleta.')
      }
      await loginWithAccessToken(accessToken)
      return 'session'
    },
    [loginWithAccessToken],
  )

  const value = useMemo(
    () => ({
      user,
      token,
      bootstrapping,
      login,
      loginWithAccessToken,
      applyAuthPayload,
      logout,
      refreshUser,
      api,
    }),
    [user, token, bootstrapping, login, loginWithAccessToken, applyAuthPayload, logout, refreshUser, api],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
