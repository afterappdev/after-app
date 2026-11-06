import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { AfterAuthCard } from '../../components/layout/AfterAuthCard'
import { AfterLoading } from '../../components/layout/AfterLoading'
import { oauthTokenFromLocation } from '../../utils/oauthCallback'
import { isAccountRecoveryJwt } from '../../utils/jwtPayload'

export function OAuthCallbackPage() {
  const { enterAccountRecovery, loginWithAccessToken, user, bootstrapping } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = oauthTokenFromLocation(searchParams)
    if (!token) {
      setError('Login social incompleto.')
      return
    }
    void (async () => {
      try {
        if (isAccountRecoveryJwt(token)) {
          enterAccountRecovery(token)
          navigate('/perfil/conta', { replace: true, state: { recovery: true } })
          return
        }
        await loginWithAccessToken(token)
        navigate('/', { replace: true })
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Não foi possível concluir o login.')
      }
    })()
  }, [enterAccountRecovery, loginWithAccessToken, navigate, searchParams])

  if (!bootstrapping && user) {
    return <Navigate to="/" replace />
  }

  if (error) {
    return (
      <AfterAuthCard logoHeight={56}>
        <h1 className="after-auth-title">Login social</h1>
        <p className="after-auth-sub">{error}</p>
        <p className="text-center mt-3 mb-0">
          <Link to="/login" className="after-link-orange">
            Voltar ao login
          </Link>
        </p>
      </AfterAuthCard>
    )
  }

  return (
    <AfterAuthCard logoHeight={56}>
      <AfterLoading label="Conectando…" />
    </AfterAuthCard>
  )
}
