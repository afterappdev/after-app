import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiClient, ApiError } from '../../api/client'
import { requestPasswordReset } from '../../api/auth'

const GENERIC_MESSAGE =
  'Se existir uma conta elegível com esse e-mail, enviaremos instruções para redefinir a senha.'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setFeedback(null)
    try {
      const api = new ApiClient()
      await requestPasswordReset(api, email)
      setIsError(false)
      setFeedback(GENERIC_MESSAGE)
    } catch (err) {
      setIsError(true)
      if (err instanceof ApiError && err.statusCode === 400) {
        setFeedback('Informe um e-mail válido.')
      } else {
        setFeedback('Não foi possível enviar as instruções agora. Tente novamente mais tarde.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-md-8 col-lg-5">
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 vstack gap-3">
            <h1 className="h4 after-brand-text">Esqueci minha senha</h1>
            <p className="text-muted small mb-0">
              Informe o e-mail da conta. Abrir o e-mail não altera nada até você usar o link de
              redefinição.
            </p>
            {feedback ? (
              <div className={`alert py-2 small ${isError ? 'alert-danger' : 'alert-success'}`}>
                {feedback}
              </div>
            ) : null}
            <form onSubmit={(e) => void onSubmit(e)} className="vstack gap-3">
              <input
                type="email"
                className="form-control"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
              />
              <button type="submit" className="btn btn-warning w-100" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar instruções'}
              </button>
            </form>
            <Link to="/login" className="small">
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
