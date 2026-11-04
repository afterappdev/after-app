import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { fetchAuthProviders } from '../../api/auth'
import { useAuth } from '../../auth/AuthContext'
import { getApiBaseUrl } from '../../config/env'
import {
  oauthStartUrl,
  sanitizeOAuthErrorMessage,
} from '../../utils/oauthCallback'

export function LoginPage() {
  const { login, user, bootstrapping } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const from =
    (location.state as { from?: string } | null)?.from?.replace(/^\/+/, '') ??
    ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [googleBrowser, setGoogleBrowser] = useState(false)
  const [appleBrowser, setAppleBrowser] = useState(false)

  useEffect(() => {
    const apple = searchParams.get('apple')
    if (apple === 'canceled') {
      setError('Login com Apple cancelado.')
    } else if (apple === 'error') {
      setError('Não foi possível concluir o login com Apple.')
    }
    const oauthErr = sanitizeOAuthErrorMessage(searchParams.get('error'))
    if (oauthErr) setError(oauthErr)
  }, [searchParams])

  useEffect(() => {
    void fetchAuthProviders()
      .then((flags) => {
        setGoogleBrowser(flags.googleBrowser === true)
        setAppleBrowser(flags.appleBrowser === true)
      })
      .catch(() => {
        setGoogleBrowser(false)
        setAppleBrowser(false)
      })
  }, [])

  if (!bootstrapping && user) {
    return <Navigate to={from ? `/${from}` : '/'} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Não foi possível entrar.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function startOAuth(provider: 'google' | 'apple') {
    window.location.assign(oauthStartUrl(provider, getApiBaseUrl()))
  }

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-md-8 col-lg-5 col-xl-4">
        <div className="card shadow-sm border-0">
          <div className="card-body p-4">
            <h1 className="h4 after-brand-text mb-1">Entrar</h1>
            <p className="text-muted small mb-4">
              Institucional e páginas legais ficam na raiz Flutter (fora de <code>/app/</code>).
            </p>
            {error ? (
              <div className="alert alert-danger py-2" role="alert">
                {error}
              </div>
            ) : null}
            <form onSubmit={onSubmit} className="vstack gap-3">
              <div>
                <label htmlFor="email" className="form-label">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  className="form-control"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="form-label">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  className="form-control"
                  autoComplete="current-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn-warning w-100"
                disabled={submitting}
              >
                {submitting ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            {(googleBrowser || appleBrowser) && (
              <div className="vstack gap-2 mt-3">
                <p className="small text-muted mb-0 text-center">ou continue com</p>
                {googleBrowser ? (
                  <button
                    type="button"
                    className="btn btn-outline-dark btn-sm"
                    onClick={() => startOAuth('google')}
                  >
                    Google
                  </button>
                ) : null}
                {appleBrowser ? (
                  <button
                    type="button"
                    className="btn btn-outline-dark btn-sm"
                    onClick={() => startOAuth('apple')}
                  >
                    Apple
                  </button>
                ) : null}
              </div>
            )}

            <div className="vstack gap-1 mt-3 small">
              <Link to="/register">Criar conta</Link>
              <Link to="/esqueci-minha-senha">Esqueci minha senha</Link>
              <Link to="/">Voltar ao início do app</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
