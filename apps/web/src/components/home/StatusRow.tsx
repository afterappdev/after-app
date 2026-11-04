type Props = {
  isOpen?: boolean | null
  distanceLabel?: string | null
  distanceClassName?: string
}

export function StatusRow({
  isOpen,
  distanceLabel,
  distanceClassName = 'text-muted',
}: Props) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 small">
      {isOpen != null ? (
        <span
          className={`badge rounded-pill ${isOpen ? 'text-bg-success' : 'text-bg-secondary'}`}
        >
          {isOpen ? 'Aberto agora' : 'Fechado'}
        </span>
      ) : null}
      {distanceLabel ? (
        <span className={distanceClassName}>{distanceLabel}</span>
      ) : null}
    </div>
  )
}
