import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiClient, ApiError } from '../../api/client'
import { requestPasswordReset } from '../../api/auth'
import { IconMail } from '../../components/icons/AfterIcons'
import { AfterAuthCard } from '../../components/layout/AfterAuthCard'

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
    <AfterAuthCard>
      <h1 className="after-auth-title">Esqueci minha senha</h1>
      <p className="after-auth-sub">
        Informe o e-mail da conta. Abrir o e-mail não altera nada até você usar o link de
        redefinição.
      </p>
      {feedback ? (
        <div className={`alert py-2 small mt-3 ${isError ? 'alert-danger' : 'alert-success'}`}>
          {feedback}
        </div>
      ) : null}
      <form onSubmit={(e) => void onSubmit(e)} className="text-start mt-3 vstack gap-3">
        <label className="after-field">
          <IconMail />
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Seu e-mail"
          />
        </label>
        <button type="submit" className="after-btn-black" disabled={loading}>
          {loading ? 'Enviando…' : 'Enviar instruções'}
        </button>
      </form>
      <p className="text-center mt-3 mb-0">
        <Link to="/login" className="after-link-orange">
          Voltar ao login
        </Link>
      </p>
    </AfterAuthCard>
  )
}
