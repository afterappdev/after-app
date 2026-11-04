import { Link, useParams } from 'react-router-dom'

/** Rota preparada — detalhe completo na fase seguinte. */
export function VenueDetailPage() {
  const { venueId } = useParams()
  return (
    <div className="mx-auto" style={{ maxWidth: 640 }}>
      <div className="card border-0 shadow-sm">
        <div className="card-body p-4">
          <h1 className="h4 after-brand-text">Estabelecimento</h1>
          <p className="text-muted">
            Detalhe completo (fotos, cardápio, avaliações) será implementado na
            próxima fase.
          </p>
          {venueId ? (
            <p className="small">
              ID: <code>{venueId}</code>
            </p>
          ) : null}
          <Link to="/" className="btn btn-primary">
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  )
}
