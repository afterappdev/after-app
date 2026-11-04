import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
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
      <div className="alert alert-warning">
        {error}{' '}
        <a href="#/login" className="alert-link">
          Voltar ao login
        </a>
      </div>
    )
  }

  return (
    <div className="text-center py-5">
      <div className="spinner-border text-warning" role="status">
        <span className="visually-hidden">Conectando…</span>
      </div>
    </div>
  )
}
