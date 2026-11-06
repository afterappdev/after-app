import type { ReactNode } from 'react'
import { AfterLoading } from '../layout/AfterLoading'

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
    return <AfterLoading />
  }
  if (props.error) {
    return (
      <div className="alert alert-warning d-flex flex-column align-items-start gap-2">
        <span>{props.error}</span>
        {props.onRetry ? (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={props.onRetry}>
            Tentar novamente
          </button>
        ) : null}
      </div>
    )
  }
  if (props.empty) {
    return <p className="after-empty mb-0">{props.emptyMessage ?? 'Nada por aqui ainda.'}</p>
  }
  return <>{props.children}</>
}
