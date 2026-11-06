import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiClient, ApiError } from '../../api/client'
import { exchangeAppleWebLogin } from '../../api/auth'
import { useAuth } from '../../auth/AuthContext'
import { AfterAuthCard } from '../../components/layout/AfterAuthCard'
import { AfterLoading } from '../../components/layout/AfterLoading'
import { sanitizeOAuthErrorMessage } from '../../utils/oauthCallback'

export function AppleWebCallbackPage() {
  const { applyAuthPayload } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const apple = searchParams.get('apple')
    if (apple === 'canceled' || apple === 'error') {
      setError(
        apple === 'canceled'
          ? 'Login com Apple cancelado.'
          : 'Não foi possível concluir o login com Apple.',
      )
      return
    }
    const code = searchParams.get('code')?.trim()
    if (!code) {
      setError('Código Apple ausente.')
      return
    }
    void (async () => {
      try {
        const api = new ApiClient()
        const data = await exchangeAppleWebLogin(api, code)
        const outcome = await applyAuthPayload(data)
        if (outcome === 'onboarding') {
          navigate('/register', { replace: true })
          return
        }
        if (outcome === 'recovery') {
          navigate('/perfil/conta', { replace: true, state: { recovery: true } })
          return
        }
        navigate('/', { replace: true })
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Falha ao trocar código Apple.')
      }
    })()
  }, [applyAuthPayload, navigate, searchParams])

  if (error) {
    return (
      <AfterAuthCard logoHeight={56}>
        <h1 className="after-auth-title">Apple</h1>
        <p className="after-auth-sub">{sanitizeOAuthErrorMessage(error) ?? error}</p>
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
      <AfterLoading label="Finalizando login Apple…" />
    </AfterAuthCard>
  )
}
