import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = {
  title: string
  subtitle?: string
  backTo?: string
  backLabel?: string
  actions?: ReactNode
}

export function AfterPageHeader(props: Props) {
  return (
    <header className="after-page-header">
      <div className="after-page-header-main">
        {props.backTo ? (
          <Link to={props.backTo} className="after-page-back">
            {props.backLabel ?? '← Voltar'}
          </Link>
        ) : null}
        <div>
          <h1 className="after-page-title">{props.title}</h1>
          {props.subtitle ? <p className="after-page-sub">{props.subtitle}</p> : null}
        </div>
      </div>
      {props.actions ? <div className="after-page-actions">{props.actions}</div> : null}
    </header>
  )
}
