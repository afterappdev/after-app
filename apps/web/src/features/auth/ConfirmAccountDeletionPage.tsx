import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmAccountDeletionByToken } from '../../api/users'

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
      <div className="alert alert-warning">
        Link incompleto. Use o link recebido por e-mail ou solicite exclusão novamente na política
        de privacidade (site institucional).
      </div>
    )
  }

  if (done) {
    return (
      <div className="alert alert-success">
        Exclusão confirmada conforme política da plataforma.{' '}
        <Link to="/login">Voltar ao login</Link>
      </div>
    )
  }

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-md-8 col-lg-6">
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 vstack gap-3">
            <h1 className="h4 after-brand-text">Confirmar exclusão da conta</h1>
            <p className="text-muted small mb-0">
              Esta ação agenda a desativação conforme a API. Não execute em produção sem
              homologação.
            </p>
            {error ? <div className="alert alert-danger py-2 small">{error}</div> : null}
            <button type="button" className="btn btn-danger" disabled={loading} onClick={() => void confirm()}>
              {loading ? 'Confirmando…' : 'Confirmar exclusão'}
            </button>
            <Link to="/" className="small">
              Cancelar
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
