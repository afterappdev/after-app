type Props = {
  title: string
  tone: 'promotion' | 'venue'
}

export function SectionTitle({ title, tone }: Props) {
  const accent = tone === 'promotion' ? 'var(--after-brand)' : 'var(--after-purple)'
  return (
    <div className="d-flex align-items-center gap-2">
      <span
        className="rounded-pill"
        style={{ width: 4, height: 22, backgroundColor: accent }}
      />
      <h2 className="h6 fw-bold mb-0">{title}</h2>
    </div>
  )
}
