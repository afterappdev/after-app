import { Outlet } from 'react-router-dom'
import { AfterHeader } from '../components/layout/AfterHeader'

export function AppLayout() {
  return (
    <div className="d-flex flex-column min-vh-100">
      <AfterHeader />
      <main className="flex-grow-1 container-fluid px-3 px-lg-4 py-4">
        <Outlet />
      </main>
      <footer className="border-top py-3 text-center text-muted small">
        After Web · prefixo <code>/app/</code> · sem rewrite global na raiz
      </footer>
    </div>
  )
}
