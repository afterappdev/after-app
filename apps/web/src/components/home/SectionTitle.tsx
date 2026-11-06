import { IconFire, IconPin } from '../icons/AfterIcons'

type Props = {
  title: string
  tone: 'promotion' | 'venue'
}

function titleParts(tone: 'promotion' | 'venue', title: string): [string, string] {
  const lead = tone === 'promotion' ? 'Promoções' : 'Locais'
  if (!title.startsWith(lead)) return [title, '']
  let rest = title.slice(lead.length)
  if (tone === 'promotion' && rest.startsWith('/')) {
    rest = ` ${rest}`
  }
  return [lead, rest]
}

export function SectionTitle({ title, tone }: Props) {
  const [lead, rest] = titleParts(tone, title)
  const icon = tone === 'promotion' ? <IconFire size={22} /> : <IconPin size={22} />

  return (
    <div className={`home-section-title home-section-title--${tone}`}>
      <span className={`home-section-icon home-section-icon--${tone}`} aria-hidden>
        {icon}
      </span>
      <h2 className="home-section-heading">
        <span className={`home-section-accent home-section-accent--${tone}`}>{lead}</span>
        {rest}
      </h2>
    </div>
  )
}
