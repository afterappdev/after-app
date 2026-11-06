type Props = {
  height?: number
  className?: string
}

/** Logo oficial (`apps/mobile/assets/images/logo_after.png`). */
export function AfterLogo({ height = 70, className }: Props) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo_after.png`}
      alt="After"
      className={className}
      style={{ height, width: 'auto', maxWidth: 'min(280px, 85vw)' }}
      decoding="async"
    />
  )
}
