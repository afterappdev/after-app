import type { ReactNode } from 'react'

type Props = {
  loading: boolean
  error: string | null
  empty?: boolean
  emptyMessage?: string
  onRetry?: () => void
  children: ReactNode
}

export function AsyncPanel(props: Props) {
  if (props.loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-warning" role="status">
          <span className="visually-hidden">Carregando…</span>
        </div>
      </div>
    )
  }
  if (props.error) {
    return (
      <div className="alert alert-warning d-flex flex-column align-items-start gap-2">
        <span>{props.error}</span>
        {props.onRetry ? (
          <button type="button" className="btn btn-sm btn-outline-dark" onClick={props.onRetry}>
            Tentar novamente
          </button>
        ) : null}
      </div>
    )
  }
  if (props.empty) {
    return (
      <p className="text-muted text-center py-5 mb-0">
        {props.emptyMessage ?? 'Nada por aqui ainda.'}
      </p>
    )
  }
  return <>{props.children}</>
}
