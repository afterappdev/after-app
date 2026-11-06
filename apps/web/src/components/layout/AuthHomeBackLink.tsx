import { Link } from 'react-router-dom'

/** Equivalente Flutter `PublicHomeLink` — volta para Home do app (`/`). */
export function AuthHomeBackLink() {
  return (
    <Link to="/" className="after-auth-screen-back">
      ← Voltar para o início
    </Link>
  )
}
