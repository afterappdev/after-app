type Props = {
  isOpen?: boolean | null
  hasOpenInfo?: boolean
  distanceLabel?: string | null
}

export function StatusRow({ isOpen, hasOpenInfo = true, distanceLabel }: Props) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
      {hasOpenInfo && isOpen != null ? (
        <span
          className={`home-open-chip ${isOpen ? 'home-open-chip--open' : 'home-open-chip--closed'}`}
        >
          {isOpen ? 'Aberto' : 'Fechado'}
        </span>
      ) : null}
      {distanceLabel ? (
        <span className="home-distance">
          <span aria-hidden>↗</span>
          {distanceLabel}
        </span>
      ) : null}
    </div>
  )
}
