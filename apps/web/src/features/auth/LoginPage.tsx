import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { fetchAuthProviders } from '../../api/auth'
import { AfterLogo } from '../../components/layout/AfterLogo'
import { IconEye, IconLock, IconMail } from '../../components/icons/AfterIcons'
import { IconAppleBrand, IconGoogleBrand } from '../../components/icons/SocialBrandIcons'
import { AuthHomeBackLink } from '../../components/layout/AuthHomeBackLink'
import { useAuth } from '../../auth/AuthContext'
import { getApiBaseUrl } from '../../config/env'
import {
  oauthStartUrl,
  sanitizeOAuthErrorMessage,
} from '../../utils/oauthCallback'

export function LoginPage() {
  const { login, user, bootstrapping } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const from =
    (location.state as { from?: string } | null)?.from?.replace(/^\/+/, '') ??
    ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      const outcome = await login(email.trim(), password)
      if (outcome === 'recovery') {
        navigate('/perfil/conta', { replace: true, state: { recovery: true } })
        return
      }
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
    <>
      <AuthHomeBackLink />
      <div className="after-auth-card">
      <div className="text-center">
        <AfterLogo height={72} />
      </div>
      <h1 className="after-auth-title">Bem-vindo(a)!</h1>
      <p className="after-auth-sub">Entre na sua conta para continuar</p>
      {error ? (
        <div className="alert alert-danger py-2 mt-3" role="alert">
          {error}
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="mt-4">
        <label className="after-field">
          <IconMail />
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="after-field mt-3">
          <IconLock />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            minLength={6}
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="Mostrar senha">
            <IconEye size={18} />
          </button>
        </label>
        <div className="text-end mt-2">
          <Link className="after-link-orange" to="/esqueci-minha-senha">
            Esqueci minha senha
          </Link>
        </div>
        <button type="submit" className="after-btn-black mt-3" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="after-auth-or mb-0">ou continue com</p>
      <div className="d-flex gap-3">
        <button
          type="button"
          className="after-social"
          disabled={!googleBrowser || submitting}
          onClick={() => startOAuth('google')}
          aria-label="Continuar com Google"
        >
          <IconGoogleBrand size={20} />
          Google
        </button>
        <button
          type="button"
          className="after-social after-social--apple"
          disabled={!appleBrowser || submitting}
          onClick={() => startOAuth('apple')}
          aria-label="Continuar com Apple"
        >
          <IconAppleBrand size={22} />
          Apple
        </button>
      </div>
      <p className="text-center mt-4 mb-0 after-auth-signup-muted">
        Não tem conta?{' '}
        <Link className="after-link-orange" to="/register">
          Crie aqui.
        </Link>
      </p>
    </div>
    </>
  )
}
