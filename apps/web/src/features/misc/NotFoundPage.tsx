import { Link } from 'react-router-dom'
import { AfterLogo } from '../../components/layout/AfterLogo'

export function NotFoundPage() {
  return (
    <div className="after-canvas text-center py-4">
      <AfterLogo height={56} className="d-inline-block mb-3" />
      <h1 className="after-page-title">Página não encontrada</h1>
      <p className="after-page-sub mb-4">Este endereço não existe no After Web.</p>
      <Link to="/" className="btn btn-warning">
        Ir para Home
      </Link>
    </div>
  )
}
