import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiClient, ApiError } from '../../api/client'
import { confirmPasswordReset } from '../../api/auth'
import { IconLock } from '../../components/icons/AfterIcons'
import { AfterAuthCard } from '../../components/layout/AfterAuthCard'
import { passwordResetTokenFromSearch } from '../../utils/passwordResetUri'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => passwordResetTokenFromSearch(searchParams), [searchParams])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) {
      setError('Link inválido ou incompleto.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const api = new ApiClient()
      await confirmPasswordReset(api, {
        token,
        password,
        passwordConfirmation: confirm,
      })
      setDone(true)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível redefinir a senha. O link pode ter expirado.',
      )
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AfterAuthCard logoHeight={56}>
        <h1 className="after-auth-title">Link inválido</h1>
        <p className="after-auth-sub">
          <Link to="/esqueci-minha-senha">Solicite um novo e-mail</Link> de redefinição.
        </p>
      </AfterAuthCard>
    )
  }

  if (done) {
    return (
      <AfterAuthCard logoHeight={56}>
        <h1 className="after-auth-title">Senha atualizada</h1>
        <p className="after-auth-sub">
          <Link to="/login" className="after-link-orange">
            Entrar no After
          </Link>
        </p>
      </AfterAuthCard>
    )
  }

  return (
    <AfterAuthCard>
      <h1 className="after-auth-title">Redefinir senha</h1>
      {error ? <div className="alert alert-danger py-2 small mt-3">{error}</div> : null}
      <form onSubmit={(e) => void onSubmit(e)} className="text-start mt-3 vstack gap-3">
        <label className="after-field">
          <IconLock />
          <input
            type="password"
            minLength={6}
            required
            autoComplete="new-password"
            placeholder="Nova senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="after-field">
          <IconLock />
          <input
            type="password"
            minLength={6}
            required
            autoComplete="new-password"
            placeholder="Confirmar senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button type="submit" className="after-btn-black" disabled={loading}>
          {loading ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </AfterAuthCard>
  )
}
