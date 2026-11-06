import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmAccountDeletionByToken } from '../../api/users'
import { AfterAuthCard } from '../../components/layout/AfterAuthCard'

export function ConfirmAccountDeletionPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!token || loading || done) return
    setLoading(true)
    setError(null)
    try {
      await confirmAccountDeletionByToken(token)
      setDone(true)
    } catch {
      setError('Este link é inválido ou já expirou.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AfterAuthCard logoHeight={56}>
        <h1 className="after-auth-title">Link incompleto</h1>
        <p className="after-auth-sub">
          Use o link recebido por e-mail ou solicite exclusão novamente na política de privacidade.
        </p>
      </AfterAuthCard>
    )
  }

  if (done) {
    return (
      <AfterAuthCard logoHeight={56}>
        <h1 className="after-auth-title">Exclusão confirmada</h1>
        <p className="after-auth-sub">
          Conforme política da plataforma.{' '}
          <Link to="/login" className="after-link-orange">
            Voltar ao login
          </Link>
        </p>
      </AfterAuthCard>
    )
  }

  return (
    <AfterAuthCard wide>
      <h1 className="after-auth-title">Confirmar exclusão</h1>
      <p className="after-auth-sub">Esta ação agenda a desativação conforme a API.</p>
      {error ? <div className="alert alert-danger py-2 small mt-3">{error}</div> : null}
      <button
        type="button"
        className="btn btn-danger w-100 mt-3"
        disabled={loading}
        onClick={() => void confirm()}
      >
        {loading ? 'Confirmando…' : 'Confirmar exclusão'}
      </button>
      <p className="text-center mt-3 mb-0">
        <Link to="/" className="after-link-orange">
          Cancelar
        </Link>
      </p>
    </AfterAuthCard>
  )
}
