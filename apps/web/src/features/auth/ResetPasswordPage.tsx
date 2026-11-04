import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiClient, ApiError } from '../../api/client'
import { confirmPasswordReset } from '../../api/auth'
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
      <div className="alert alert-warning">
        Link de redefinição inválido.{' '}
        <Link to="/esqueci-minha-senha">Solicite um novo e-mail</Link>.
      </div>
    )
  }

  if (done) {
    return (
      <div className="alert alert-success">
        Senha atualizada. <Link to="/login">Entrar no After</Link>
      </div>
    )
  }

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-md-8 col-lg-5">
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 vstack gap-3">
            <h1 className="h4 after-brand-text">Redefinir senha</h1>
            {error ? <div className="alert alert-danger py-2 small">{error}</div> : null}
            <form onSubmit={(e) => void onSubmit(e)} className="vstack gap-3">
              <input
                type="password"
                className="form-control"
                minLength={6}
                required
                autoComplete="new-password"
                placeholder="Nova senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                type="password"
                className="form-control"
                minLength={6}
                required
                autoComplete="new-password"
                placeholder="Confirmar senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <button type="submit" className="btn btn-warning w-100" disabled={loading}>
                {loading ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
