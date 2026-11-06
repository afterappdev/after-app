type Props = {
  label?: string
}

export function AfterLoading({ label = 'Carregando…' }: Props) {
  return (
    <div className="after-loading" role="status">
      <div className="after-loading-spinner" aria-hidden />
      <span className="visually-hidden">{label}</span>
      {label !== 'Carregando…' ? <p className="after-loading-label">{label}</p> : null}
    </div>
  )
}
