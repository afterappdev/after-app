import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { getApiBaseUrl } from '../../config/env'

export function LoginPage() {
  const { login, user, bootstrapping } = useAuth()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from?.replace(/^\/+/, '') ??
    ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-md-8 col-lg-5 col-xl-4">
        <div className="card shadow-sm border-0">
          <div className="card-body p-4">
            <h1 className="h4 after-brand-text mb-1">Entrar</h1>
            <p className="text-muted small mb-4">
              API: <code>{getApiBaseUrl()}</code> (somente dev/homologação
              configurada via <code>VITE_API_BASE_URL</code>).
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
                className="btn btn-primary w-100"
                disabled={submitting}
              >
                {submitting ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
            <p className="small text-muted mt-3 mb-0">
              Institucional e páginas legais permanecem na raiz Flutter (
              <Link to="/">voltar ao início do app</Link>).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
